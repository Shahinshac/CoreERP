from decimal import Decimal
import uuid
from datetime import date
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.modules.auth.models import Customer, StaffRole, StaffUser
from app.modules.catalog.models import Brand, Category, Product
from app.modules.invoicing.gst import compute_gst, get_financial_year
from app.modules.invoicing.models import Invoice, InvoiceSequence
from app.modules.sales.models import Sale, SaleItem


def test_compute_gst_intra_state_walkin():
    """Intra-state / Walk-in GST calculation: 50% CGST + 50% SGST, 0 IGST."""
    seller_state = "Maharashtra"
    buyer_state = None  # Walk-in customer (counter delivery)
    taxable_value = Decimal("1000.00")
    gst_rate = Decimal("18.00")

    result = compute_gst(seller_state, buyer_state, taxable_value, gst_rate)

    assert result["is_inter_state"] is False
    assert result["cgst_rate"] == Decimal("9.00")
    assert result["cgst"] == Decimal("90.00")
    assert result["sgst_rate"] == Decimal("9.00")
    assert result["sgst"] == Decimal("90.00")
    assert result["igst_rate"] == Decimal("0.00")
    assert result["igst"] == Decimal("0.00")
    assert result["total_tax"] == Decimal("180.00")


def test_compute_gst_intra_state_same_state():
    """Intra-state calculation with matching state strings."""
    seller_state = "Maharashtra"
    buyer_state = "maharashtra"  # case-insensitive match
    taxable_value = Decimal("250.00")
    gst_rate = Decimal("12.00")

    result = compute_gst(seller_state, buyer_state, taxable_value, gst_rate)

    assert result["is_inter_state"] is False
    assert result["cgst_rate"] == Decimal("6.00")
    assert result["cgst"] == Decimal("15.00")
    assert result["sgst_rate"] == Decimal("6.00")
    assert result["sgst"] == Decimal("15.00")
    assert result["igst_rate"] == Decimal("0.00")
    assert result["total_tax"] == Decimal("30.00")


def test_compute_gst_inter_state():
    """Inter-state GST calculation: 100% IGST, 0 CGST, 0 SGST."""
    seller_state = "Maharashtra"
    buyer_state = "Karnataka"
    taxable_value = Decimal("1000.00")
    gst_rate = Decimal("18.00")

    result = compute_gst(seller_state, buyer_state, taxable_value, gst_rate)

    assert result["is_inter_state"] is True
    assert result["cgst_rate"] == Decimal("0.00")
    assert result["cgst"] == Decimal("0.00")
    assert result["sgst_rate"] == Decimal("0.00")
    assert result["sgst"] == Decimal("0.00")
    assert result["igst_rate"] == Decimal("18.00")
    assert result["igst"] == Decimal("180.00")
    assert result["total_tax"] == Decimal("180.00")


def test_compute_gst_rounding_half_up():
    """Verifies round half-up behavior on odd fractional taxes."""
    seller_state = "Maharashtra"
    buyer_state = "Maharashtra"
    taxable_value = Decimal("333.33")
    gst_rate = Decimal("5.00")

    result = compute_gst(seller_state, buyer_state, taxable_value, gst_rate)

    # 333.33 * 0.025 = 8.33325 -> 8.33 each
    assert result["cgst"] == Decimal("8.33")
    assert result["sgst"] == Decimal("8.33")
    assert result["total_tax"] == Decimal("16.66")


def test_financial_year_helper():
    """Test Indian Financial Year helper (April 1 - March 31)."""
    assert get_financial_year(date(2026, 9, 22)) == "2026-27"
    assert get_financial_year(date(2026, 4, 1)) == "2026-27"
    assert get_financial_year(date(2027, 3, 31)) == "2026-27"
    assert get_financial_year(date(2027, 1, 15)) == "2026-27"
    assert get_financial_year(date(2026, 3, 31)) == "2025-26"


@pytest.fixture
def auth_staff_headers(client: TestClient, db_session):
    """Create staff user and get auth headers."""
    from app.core.security import create_access_token, hash_password

    staff = StaffUser(
        email=f"billing_{uuid.uuid4().hex[:6]}@test.com",
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
def sample_products(db_session):
    """Creates sample category, brand, and products."""
    cat = Category(name=f"Electronics {uuid.uuid4().hex[:6]}")
    brand = Brand(name=f"Sony {uuid.uuid4().hex[:6]}")
    db_session.add_all([cat, brand])
    db_session.commit()

    p1 = Product(
        name="Wireless Headphones",
        sku=f"SKU-WH-{uuid.uuid4().hex[:6]}",
        barcode=f"BAR-WH-{uuid.uuid4().hex[:6]}",
        hsn_code="8518",
        category_id=cat.id,
        brand_id=brand.id,
        purchase_price=Decimal("1500.00"),
        selling_price=Decimal("2000.00"),
        gst_rate=Decimal("18.00"),
        current_stock=Decimal("50.000"),
        min_stock=Decimal("5.000"),
    )
    p2 = Product(
        name="USB Cable",
        sku=f"SKU-USB-{uuid.uuid4().hex[:6]}",
        barcode=f"BAR-USB-{uuid.uuid4().hex[:6]}",
        hsn_code="8544",
        category_id=cat.id,
        brand_id=brand.id,
        purchase_price=Decimal("100.00"),
        selling_price=Decimal("200.00"),
        gst_rate=Decimal("18.00"),
        current_stock=Decimal("100.000"),
        min_stock=Decimal("10.000"),
    )
    db_session.add_all([p1, p2])
    db_session.commit()
    return p1, p2


def test_invoice_creation_intra_state_from_sale(client: TestClient, db_session, auth_staff_headers, sample_products):
    """Test generating a formal tax invoice from a POS sale (intra-state)."""
    headers, staff = auth_staff_headers
    p1, p2 = sample_products

    # 1. POS Checkout
    checkout_res = client.post(
        "/api/pos/checkout",
        headers=headers,
        json={
            "items": [
                {"product_id": str(p1.id), "quantity": "1.000", "unit_price": "2000.00", "discount_amount": "0.00"},
                {"product_id": str(p2.id), "quantity": "2.000", "unit_price": "200.00", "discount_amount": "0.00"},
            ],
            "discount_amount": "0.00",
            "payment_method": "cash",
        },
    )
    assert checkout_res.status_code == 201, checkout_res.text
    sale_data = checkout_res.json()
    sale_id = sale_data["id"]

    # 2. Generate Invoice from Sale
    inv_res = client.post(
        f"/api/invoicing/from-sale/{sale_id}",
        headers=headers,
        json={
            "buyer_name": "Ramesh Sharma",
            "buyer_state": "Maharashtra",
            "notes": "Retail walk-in sale",
        },
    )
    assert inv_res.status_code == 201, inv_res.text
    invoice = inv_res.json()

    # Verify sequential numbering format
    fy = get_financial_year()
    assert invoice["invoice_number"].startswith(f"INV/{fy}/")
    assert invoice["is_inter_state"] is False
    assert invoice["buyer_name"] == "Ramesh Sharma"
    assert invoice["buyer_state"] == "Maharashtra"

    # Subtotal = 2000*1 + 200*2 = 2400.00
    assert Decimal(str(invoice["subtotal"])) == Decimal("2400.00")
    # CGST (9%) = 216.00, SGST (9%) = 216.00, IGST = 0.00
    assert Decimal(str(invoice["cgst_amount"])) == Decimal("216.00")
    assert Decimal(str(invoice["sgst_amount"])) == Decimal("216.00")
    assert Decimal(str(invoice["igst_amount"])) == Decimal("0.00")
    assert Decimal(str(invoice["total_tax"])) == Decimal("432.00")
    assert Decimal(str(invoice["grand_total"])) == Decimal("2832.00")
    assert invoice["payment_status"] == "unpaid"

    # Check line items
    assert len(invoice["items"]) == 2
    item1 = invoice["items"][0]
    assert item1["hsn_code"] in ["8518", "8544"]
    assert Decimal(str(item1["cgst_rate"])) == Decimal("9.00")
    assert Decimal(str(item1["sgst_rate"])) == Decimal("9.00")


def test_invoice_creation_inter_state(client: TestClient, db_session, auth_staff_headers, sample_products):
    """Test generating an inter-state invoice (e.g. Maharashtra seller to Delhi buyer -> 100% IGST)."""
    headers, staff = auth_staff_headers
    p1, _ = sample_products

    checkout_res = client.post(
        "/api/pos/checkout",
        headers=headers,
        json={
            "items": [
                {"product_id": str(p1.id), "quantity": "2.000", "unit_price": "2000.00", "discount_amount": "0.00"},
            ],
            "discount_amount": "0.00",
            "payment_method": "card",
        },
    )
    sale_id = checkout_res.json()["id"]

    inv_res = client.post(
        f"/api/invoicing/from-sale/{sale_id}",
        headers=headers,
        json={
            "buyer_name": "Apex Corp Delhi",
            "buyer_gstin": "07AAACA1234A1Z5",
            "buyer_state": "Delhi",
            "buyer_address": "Connaught Place, New Delhi",
        },
    )
    assert inv_res.status_code == 201
    invoice = inv_res.json()

    assert invoice["is_inter_state"] is True
    assert invoice["buyer_gstin"] == "07AAACA1234A1Z5"
    assert invoice["buyer_state"] == "Delhi"

    # Subtotal = 4000.00, IGST (18%) = 720.00, CGST = 0, SGST = 0
    assert Decimal(str(invoice["subtotal"])) == Decimal("4000.00")
    assert Decimal(str(invoice["cgst_amount"])) == Decimal("0.00")
    assert Decimal(str(invoice["sgst_amount"])) == Decimal("0.00")
    assert Decimal(str(invoice["igst_amount"])) == Decimal("720.00")
    assert Decimal(str(invoice["total_tax"])) == Decimal("720.00")
    assert Decimal(str(invoice["grand_total"])) == Decimal("4720.00")


def test_invoice_sequential_gapless_numbering(client: TestClient, db_session, auth_staff_headers, sample_products):
    """Verify invoice numbers are strictly sequential (e.g. 00001, 00002, 00003)."""
    headers, staff = auth_staff_headers
    p1, _ = sample_products

    inv_numbers = []
    for _ in range(3):
        res = client.post(
            "/api/pos/checkout",
            headers=headers,
            json={
                "items": [{"product_id": str(p1.id), "quantity": "1.000", "unit_price": "2000.00", "discount_amount": "0.00"}],
                "discount_amount": "0.00",
                "payment_method": "cash",
            },
        )
        sale_id = res.json()["id"]

        inv_res = client.post(f"/api/invoicing/from-sale/{sale_id}", headers=headers)
        assert inv_res.status_code == 201
        inv_numbers.append(inv_res.json()["invoice_number"])

    fy = get_financial_year()
    # Extract numerical endings
    endings = [int(num.split("/")[-1]) for num in inv_numbers]
    assert endings[1] == endings[0] + 1
    assert endings[2] == endings[1] + 1


def test_invoice_cannot_duplicate_for_same_sale(client: TestClient, db_session, auth_staff_headers, sample_products):
    """An invoice cannot be generated twice for the same sale."""
    headers, staff = auth_staff_headers
    p1, _ = sample_products

    res = client.post(
        "/api/pos/checkout",
        headers=headers,
        json={
            "items": [{"product_id": str(p1.id), "quantity": "1.000", "unit_price": "2000.00", "discount_amount": "0.00"}],
            "discount_amount": "0.00",
            "payment_method": "cash",
        },
    )
    sale_id = res.json()["id"]

    inv_res1 = client.post(f"/api/invoicing/from-sale/{sale_id}", headers=headers)
    assert inv_res1.status_code == 201

    # Second call should fail with 400
    inv_res2 = client.post(f"/api/invoicing/from-sale/{sale_id}", headers=headers)
    assert inv_res2.status_code == 400
    assert "already been generated" in inv_res2.json()["error"]["message"]


def test_invoice_immutability(client: TestClient, db_session, auth_staff_headers, sample_products):
    """Invoices are immutable: no PUT or PATCH endpoints exist."""
    headers, staff = auth_staff_headers
    p1, _ = sample_products

    res = client.post(
        "/api/pos/checkout",
        headers=headers,
        json={
            "items": [{"product_id": str(p1.id), "quantity": "1.000", "unit_price": "2000.00", "discount_amount": "0.00"}],
            "discount_amount": "0.00",
            "payment_method": "cash",
        },
    )
    sale_id = res.json()["id"]
    inv_res = client.post(f"/api/invoicing/from-sale/{sale_id}", headers=headers)
    inv_id = inv_res.json()["id"]

    # PUT must fail with 405 Method Not Allowed
    put_res = client.put(f"/api/invoicing/{inv_id}", headers=headers, json={"grand_total": "0.00"})
    assert put_res.status_code == 405

    # PATCH must fail with 405 Method Not Allowed
    patch_res = client.patch(f"/api/invoicing/{inv_id}", headers=headers, json={"grand_total": "0.00"})
    assert patch_res.status_code == 405


def test_invoice_pdf_streaming(client: TestClient, db_session, auth_staff_headers, sample_products):
    """Test in-memory PDF generation and streaming (zero disk footprint)."""
    headers, staff = auth_staff_headers
    p1, _ = sample_products

    res = client.post(
        "/api/pos/checkout",
        headers=headers,
        json={
            "items": [{"product_id": str(p1.id), "quantity": "1.000", "unit_price": "2000.00", "discount_amount": "0.00"}],
            "discount_amount": "0.00",
            "payment_method": "cash",
        },
    )
    sale_id = res.json()["id"]
    inv_res = client.post(f"/api/invoicing/from-sale/{sale_id}", headers=headers)
    inv_id = inv_res.json()["id"]

    pdf_res = client.get(f"/api/invoicing/{inv_id}/pdf", headers=headers)
    assert pdf_res.status_code == 200
    assert "application/pdf" in pdf_res.headers["content-type"]
    assert "Content-Disposition" in pdf_res.headers
    # Valid PDF signature
    assert pdf_res.content.startswith(b"%PDF-")


def test_credit_note_reversal_workflow(client: TestClient, db_session, auth_staff_headers, sample_products):
    """Test full reversal of an invoice via Credit Note."""
    headers, staff = auth_staff_headers
    p1, _ = sample_products

    res = client.post(
        "/api/pos/checkout",
        headers=headers,
        json={
            "items": [{"product_id": str(p1.id), "quantity": "1.000", "unit_price": "2000.00", "discount_amount": "0.00"}],
            "discount_amount": "0.00",
            "payment_method": "cash",
        },
    )
    sale_id = res.json()["id"]
    inv_res = client.post(f"/api/invoicing/from-sale/{sale_id}", headers=headers)
    inv_id = inv_res.json()["id"]

    # Issue Credit Note
    cn_res = client.post(
        f"/api/invoicing/{inv_id}/credit-note",
        headers=headers,
        json={"reason": "Customer cancelled order before dispatch"},
    )
    assert cn_res.status_code == 201, cn_res.text
    cn = cn_res.json()

    fy = get_financial_year()
    assert cn["credit_note_number"].startswith(f"CN/{fy}/")
    assert Decimal(str(cn["subtotal_refunded"])) == Decimal("2000.00")
    assert Decimal(str(cn["total_tax_refunded"])) == Decimal("360.00")
    assert Decimal(str(cn["grand_total_refunded"])) == Decimal("2360.00")

    # Verify original invoice is now marked cancelled
    fetch_inv = client.get(f"/api/invoicing/{inv_id}", headers=headers).json()
    assert fetch_inv["is_cancelled"] is True
    assert fetch_inv["payment_status"] == "cancelled"
    assert len(fetch_inv["credit_notes"]) == 1

    # Attempting second credit note on already cancelled invoice should fail
    cn_res2 = client.post(
        f"/api/invoicing/{inv_id}/credit-note",
        headers=headers,
        json={"reason": "Second reversal attempt"},
    )
    assert cn_res2.status_code == 400


def test_customer_invoice_isolation(client: TestClient, db_session, auth_staff_headers, sample_products):
    """A customer can only view their own invoices, not other customers'."""
    from app.core.security import create_access_token, hash_password

    headers, staff = auth_staff_headers
    p1, _ = sample_products

    # Create Customer 1 and Customer 2
    c1 = Customer(
        name="Customer 1",
        email=f"cust1_{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("Pass123!"),
        state="Maharashtra",
        is_active=True,
    )
    c2 = Customer(
        name="Customer 2",
        email=f"cust2_{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("Pass123!"),
        state="Gujarat",
        is_active=True,
    )
    db_session.add_all([c1, c2])
    db_session.commit()
    db_session.refresh(c1)
    db_session.refresh(c2)

    # Checkout for Customer 1
    chk_res = client.post(
        "/api/pos/checkout",
        headers=headers,
        json={
            "customer_id": str(c1.id),
            "items": [{"product_id": str(p1.id), "quantity": "1.000", "unit_price": "2000.00", "discount_amount": "0.00"}],
            "discount_amount": "0.00",
            "payment_method": "cash",
        },
    )
    sale_id = chk_res.json()["id"]

    inv_res = client.post(f"/api/invoicing/from-sale/{sale_id}", headers=headers)
    inv_id = inv_res.json()["id"]

    # Customer 1 token
    t1 = create_access_token(subject=str(c1.id), audience="customer")
    # Customer 2 token
    t2 = create_access_token(subject=str(c2.id), audience="customer")

    # Customer 1 viewing their own invoice -> 200 OK
    res_c1 = client.get(f"/api/invoicing/{inv_id}", headers={"Authorization": f"Bearer {t1}"})
    assert res_c1.status_code == 200
    assert res_c1.json()["id"] == inv_id

    # Customer 2 viewing Customer 1's invoice -> 403 Forbidden
    res_c2 = client.get(f"/api/invoicing/{inv_id}", headers={"Authorization": f"Bearer {t2}"})
    assert res_c2.status_code == 403
