from decimal import Decimal
import uuid
from datetime import date
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.modules.audit.models import AuditLog
from app.modules.auth.models import Customer, StaffRole, StaffUser
from app.modules.catalog.models import Brand, Category, Product
from app.modules.inventory.models import MovementType, StockMovement
from app.modules.invoicing.models import Invoice, Quotation


@pytest.fixture
def auth_staff(db_session):
    staff = StaffUser(
        email=f"staff_{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("Password123!"),
        role=StaffRole.ADMIN,
        is_active=True,
    )
    db_session.add(staff)
    db_session.commit()
    db_session.refresh(staff)
    token = create_access_token(subject=str(staff.id), audience="staff", role=staff.role.value)
    return {"Authorization": f"Bearer {token}"}, staff


@pytest.fixture
def sample_data(db_session):
    cat = Category(name=f"Cat {uuid.uuid4().hex[:6]}")
    brand = Brand(name=f"Brand {uuid.uuid4().hex[:6]}")
    db_session.add_all([cat, brand])
    db_session.commit()

    prod1 = Product(
        name="Laptop Pro 14",
        sku=f"SKU-LP-{uuid.uuid4().hex[:4]}",
        barcode=f"BC-{uuid.uuid4().hex[:6]}",
        category_id=cat.id,
        brand_id=brand.id,
        selling_price=Decimal("50000.00"),
        purchase_price=Decimal("40000.00"),
        gst_rate=Decimal("18.00"),
        current_stock=Decimal("10.000"),
        unit="pcs",
        is_active=True,
    )
    prod2 = Product(
        name="Wireless Mouse",
        sku=f"SKU-MS-{uuid.uuid4().hex[:4]}",
        barcode=f"BC-{uuid.uuid4().hex[:6]}",
        category_id=cat.id,
        brand_id=brand.id,
        selling_price=Decimal("1000.00"),
        purchase_price=Decimal("600.00"),
        gst_rate=Decimal("18.00"),
        current_stock=Decimal("50.000"),
        unit="pcs",
        is_active=True,
    )
    customer = Customer(
        name="Acme Corp",
        email=f"contact_{uuid.uuid4().hex[:6]}@acme.com",
        password_hash=hash_password("CustomerPass123!"),
        phone="9876543210",
        state="Maharashtra",
        gstin="27AABCU9603R1ZM",
        address="123 Tech Park, Mumbai",
    )
    db_session.add_all([prod1, prod2, customer])
    db_session.commit()
    db_session.refresh(prod1)
    db_session.refresh(prod2)
    db_session.refresh(customer)
    return {"prod1": prod1, "prod2": prod2, "customer": customer}


def test_create_quotation_no_stock_deduction(client: TestClient, db_session, auth_staff, sample_data):
    """
    Creating a quotation must calculate GST correctly and MUST NOT deduct stock or create invoices.
    """
    headers, staff = auth_staff
    prod1 = sample_data["prod1"]
    prod2 = sample_data["prod2"]
    customer = sample_data["customer"]

    initial_stock1 = prod1.current_stock
    initial_stock2 = prod2.current_stock

    payload = {
        "customer_id": str(customer.id),
        "notes": "Valid for 15 days",
        "items": [
            {
                "product_id": str(prod1.id),
                "quantity": 2,
                "unit_price": "50000.00",
                "discount_amount": "2000.00",
            },
            {
                "product_id": str(prod2.id),
                "quantity": 5,
                "unit_price": "1000.00",
                "discount_amount": "0.00",
            },
        ],
    }

    res = client.post("/api/invoicing/quotations", json=payload, headers=headers)
    assert res.status_code == 201, res.text
    data = res.json()

    assert data["quotation_number"].startswith("QTN/")
    assert data["status"] == "draft"
    assert data["converted_invoice_id"] is None
    assert len(data["items"]) == 2

    # Line 1: (2 * 50000) - 2000 = 98,000 taxable. 18% GST = 17,640 (8,820 CGST + 8,820 SGST)
    # Line 2: (5 * 1000) - 0 = 5,000 taxable. 18% GST = 900 (450 CGST + 450 SGST)
    # Subtotal = 103,000.00. Tax = 18,540.00. Grand total = 121,540.00
    assert Decimal(str(data["subtotal"])) == Decimal("103000.00")
    assert Decimal(str(data["total_tax"])) == Decimal("18540.00")
    assert Decimal(str(data["grand_total"])) == Decimal("121540.00")

    # CRITICAL: Verify stock was NOT deducted
    db_session.refresh(prod1)
    db_session.refresh(prod2)
    assert prod1.current_stock == initial_stock1
    assert prod2.current_stock == initial_stock2

    # Verify no stock movement rows exist for this quotation
    movements = db_session.query(StockMovement).filter(StockMovement.reference_id == uuid.UUID(data["id"])).all()
    assert len(movements) == 0


def test_quotation_lifecycle_and_conversion(client: TestClient, db_session, auth_staff, sample_data):
    """
    Tests:
    1. Create quotation (status: draft)
    2. Update status -> sent
    3. Convert to invoice (status: converted, stock deducted, invoice created)
    4. Attempting to convert again fails
    """
    headers, staff = auth_staff
    prod1 = sample_data["prod1"]
    customer = sample_data["customer"]
    initial_stock = prod1.current_stock

    # 1. Create
    payload = {
        "customer_id": str(customer.id),
        "items": [
            {
                "product_id": str(prod1.id),
                "quantity": 3,
                "unit_price": "50000.00",
                "discount_amount": "0.00",
            }
        ],
    }
    create_res = client.post("/api/invoicing/quotations", json=payload, headers=headers)
    assert create_res.status_code == 201
    q_data = create_res.json()
    q_id = q_data["id"]

    # 2. Update status -> sent
    status_res = client.patch(
        f"/api/invoicing/quotations/{q_id}/status",
        json={"status": "sent"},
        headers=headers,
    )
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "sent"

    # 3. Convert quotation to invoice
    conv_res = client.post(f"/api/invoicing/quotations/{q_id}/convert-to-invoice", headers=headers)
    assert conv_res.status_code == 201, conv_res.text
    inv_data = conv_res.json()

    assert inv_data["invoice_number"].startswith("INV/")
    assert Decimal(str(inv_data["grand_total"])) == Decimal(str(q_data["grand_total"]))
    assert inv_data["payment_status"] == "unpaid"
    assert len(inv_data["items"]) == 1

    # Verify quotation state is now converted and linked to invoice
    get_q = client.get(f"/api/invoicing/quotations/{q_id}", headers=headers).json()
    assert get_q["status"] == "converted"
    assert get_q["converted_invoice_id"] == inv_data["id"]

    # Verify stock was deducted exactly once
    db_session.refresh(prod1)
    assert prod1.current_stock == initial_stock - Decimal("3.000")

    # Verify StockMovement record
    movement = (
        db_session.query(StockMovement)
        .filter(StockMovement.reference_id == uuid.UUID(inv_data["id"]))
        .first()
    )
    assert movement is not None
    assert movement.movement_type == MovementType.OUT
    assert movement.quantity == Decimal("-3.000")

    # 4. Attempting to convert again must fail
    second_conv = client.post(f"/api/invoicing/quotations/{q_id}/convert-to-invoice", headers=headers)
    assert second_conv.status_code == 400
    err_msg = second_conv.json().get("error", {}).get("message") or second_conv.json().get("detail", "")
    assert "already been converted" in err_msg


def test_convert_quotation_insufficient_stock_fails(client: TestClient, db_session, auth_staff, sample_data):
    """
    Attempting to convert quotation with insufficient stock fails and deducts nothing.
    """
    headers, staff = auth_staff
    prod1 = sample_data["prod1"]
    customer = sample_data["customer"]

    # Available stock is 10.000, ask for 15
    payload = {
        "customer_id": str(customer.id),
        "items": [
            {
                "product_id": str(prod1.id),
                "quantity": 15,
                "unit_price": "50000.00",
                "discount_amount": "0.00",
            }
        ],
    }
    create_res = client.post("/api/invoicing/quotations", json=payload, headers=headers)
    assert create_res.status_code == 201
    q_id = create_res.json()["id"]

    # Convert must fail due to stock
    conv_res = client.post(f"/api/invoicing/quotations/{q_id}/convert-to-invoice", headers=headers)
    assert conv_res.status_code == 400
    err_msg = conv_res.json().get("error", {}).get("message") or conv_res.json().get("detail", "")
    assert "Insufficient stock" in err_msg

    # Quotation should still be draft
    get_q = client.get(f"/api/invoicing/quotations/{q_id}", headers=headers).json()
    assert get_q["status"] == "draft"
    assert get_q["converted_invoice_id"] is None

    # Stock should remain untouched
    db_session.refresh(prod1)
    assert prod1.current_stock == Decimal("10.000")


def test_cancelled_quotation_cannot_be_converted(client: TestClient, db_session, auth_staff, sample_data):
    """
    Cancelled quotation cannot be converted.
    """
    headers, staff = auth_staff
    prod2 = sample_data["prod2"]
    customer = sample_data["customer"]

    payload = {
        "customer_id": str(customer.id),
        "items": [{"product_id": str(prod2.id), "quantity": 1}],
    }
    create_res = client.post("/api/invoicing/quotations", json=payload, headers=headers)
    q_id = create_res.json()["id"]

    # Cancel quotation
    client.patch(f"/api/invoicing/quotations/{q_id}/status", json={"status": "cancelled"}, headers=headers)

    # Convert should fail
    conv_res = client.post(f"/api/invoicing/quotations/{q_id}/convert-to-invoice", headers=headers)
    assert conv_res.status_code == 400
    err_msg = conv_res.json().get("error", {}).get("message") or conv_res.json().get("detail", "")
    assert "Cannot convert cancelled quotation" in err_msg

