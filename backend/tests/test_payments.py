from decimal import Decimal
import uuid
import pytest
from fastapi.testclient import TestClient

from app.modules.auth.models import Customer, StaffRole, StaffUser
from app.modules.catalog.models import Brand, Category, Product
from app.modules.invoicing.models import Invoice
from app.modules.payments.models import Payment


@pytest.fixture
def auth_staff_admin(client: TestClient, db_session):
    from app.core.security import create_access_token, hash_password

    staff = StaffUser(
        email=f"admin_{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("AdminPass123!"),
        role=StaffRole.ADMIN,
        is_active=True,
    )
    db_session.add(staff)
    db_session.commit()
    db_session.refresh(staff)

    token = create_access_token(subject=str(staff.id), audience="staff", role=staff.role.value)
    return {"Authorization": f"Bearer {token}"}, staff


@pytest.fixture
def auth_staff_cashier(client: TestClient, db_session):
    from app.core.security import create_access_token, hash_password

    staff = StaffUser(
        email=f"cashier_{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("CashierPass123!"),
        role=StaffRole.STAFF,
        is_active=True,
    )
    db_session.add(staff)
    db_session.commit()
    db_session.refresh(staff)

    token = create_access_token(subject=str(staff.id), audience="staff", role=staff.role.value)
    return {"Authorization": f"Bearer {token}"}, staff


@pytest.fixture
def test_invoice(client: TestClient, db_session, auth_staff_admin):
    headers, staff = auth_staff_admin

    cat = Category(name=f"Electronics {uuid.uuid4().hex[:6]}")
    brand = Brand(name=f"Sony {uuid.uuid4().hex[:6]}")
    db_session.add_all([cat, brand])
    db_session.commit()

    product = Product(
        name="Bluetooth Speaker",
        sku=f"SKU-SPK-{uuid.uuid4().hex[:6]}",
        barcode=f"BAR-SPK-{uuid.uuid4().hex[:6]}",
        hsn_code="8518",
        category_id=cat.id,
        brand_id=brand.id,
        purchase_price=Decimal("500.00"),
        selling_price=Decimal("1000.00"),
        gst_rate=Decimal("18.00"),
        current_stock=Decimal("20.000"),
        min_stock=Decimal("2.000"),
    )
    db_session.add(product)
    db_session.commit()
    db_session.refresh(product)

    # POS checkout: 1 item @ 1000.00, GST 18% -> Subtotal 1000.00, Tax 180.00, Grand Total 1180.00
    chk_res = client.post(
        "/api/pos/checkout",
        headers=headers,
        json={
            "items": [{"product_id": str(product.id), "quantity": "1.000", "unit_price": "1000.00", "discount_amount": "0.00"}],
            "discount_amount": "0.00",
            "payment_method": "cash",
        },
    )
    sale_id = chk_res.json()["id"]

    inv_res = client.post(f"/api/invoicing/from-sale/{sale_id}", headers=headers)
    assert inv_res.status_code == 201
    return inv_res.json()


def test_idempotent_duplicate_key_returns_original_result(client: TestClient, auth_staff_admin, test_invoice):
    """Sending duplicate idempotency_key returns original payment record, not an error or duplicate."""
    headers, _ = auth_staff_admin
    inv_id = test_invoice["id"]
    idempotency_key = f"key-{uuid.uuid4().hex}"

    # 1. First payment attempt
    res1 = client.post(
        "/api/payments",
        headers=headers,
        json={
            "invoice_id": inv_id,
            "method": "cash",
            "amount": "500.00",
            "idempotency_key": idempotency_key,
            "reference_id": "CASH-REC-001",
        },
    )
    assert res1.status_code == 201
    data1 = res1.json()
    assert data1["idempotency_key"] == idempotency_key
    assert Decimal(str(data1["amount"])) == Decimal("500.00")

    # 2. Second payment attempt with identical idempotency_key
    res2 = client.post(
        "/api/payments",
        headers=headers,
        json={
            "invoice_id": inv_id,
            "method": "cash",
            "amount": "500.00",
            "idempotency_key": idempotency_key,
            "reference_id": "CASH-REC-001",
        },
    )
    # Must succeed and return the exact same payment record
    assert res2.status_code in [200, 201]
    data2 = res2.json()
    assert data2["id"] == data1["id"]
    assert data2["created_at"] == data1["created_at"]

    # 3. Assert only ONE payment record exists in the ledger
    list_res = client.get(f"/api/payments?invoice_id={inv_id}", headers=headers)
    assert list_res.status_code == 200
    assert list_res.json()["total"] == 1


def test_invoice_payment_status_reconciliation(client: TestClient, auth_staff_admin, test_invoice):
    """Cumulative payments correctly update invoice payment_status: unpaid -> partial -> paid."""
    headers, _ = auth_staff_admin
    inv_id = test_invoice["id"]

    # Initially unpaid
    inv_before = client.get(f"/api/invoicing/{inv_id}", headers=headers).json()
    assert inv_before["payment_status"] == "unpaid"
    assert Decimal(str(inv_before["grand_total"])) == Decimal("1180.00")

    # 1. Partial Payment of ₹600.00
    pay1 = client.post(
        "/api/payments",
        headers=headers,
        json={
            "invoice_id": inv_id,
            "method": "card",
            "amount": "600.00",
            "idempotency_key": f"key-{uuid.uuid4().hex}",
            "reference_id": "TXN-CARD-101",
        },
    )
    assert pay1.status_code == 201
    assert pay1.json()["invoice_payment_status"] == "partially_paid"
    assert Decimal(str(pay1.json()["invoice_remaining_balance"])) == Decimal("580.00")

    # Verify on invoice resource directly
    inv_mid = client.get(f"/api/invoicing/{inv_id}", headers=headers).json()
    assert inv_mid["payment_status"] == "partially_paid"

    # 2. Final Payment of remaining ₹580.00
    pay2 = client.post(
        "/api/payments",
        headers=headers,
        json={
            "invoice_id": inv_id,
            "method": "upi",
            "amount": "580.00",
            "idempotency_key": f"key-{uuid.uuid4().hex}",
            "reference_id": "UPI-REF-999",
        },
    )
    assert pay2.status_code == 201
    assert pay2.json()["invoice_payment_status"] == "paid"
    assert Decimal(str(pay2.json()["invoice_remaining_balance"])) == Decimal("0.00")

    # Verify on invoice resource directly
    inv_after = client.get(f"/api/invoicing/{inv_id}", headers=headers).json()
    assert inv_after["payment_status"] == "paid"


def test_overpayment_protection_and_admin_allowance(
    client: TestClient, auth_staff_admin, auth_staff_cashier, test_invoice
):
    """Overpayment beyond grand total is blocked for cashier; allowed for Admin with explicit flag."""
    admin_headers, _ = auth_staff_admin
    cashier_headers, _ = auth_staff_cashier
    inv_id = test_invoice["id"]
    # Total invoice is 1180.00

    # 1. Cashier attempts overpayment of 1500.00 without flag -> 400 Bad Request
    res1 = client.post(
        "/api/payments",
        headers=cashier_headers,
        json={
            "invoice_id": inv_id,
            "method": "cash",
            "amount": "1500.00",
            "idempotency_key": f"key-{uuid.uuid4().hex}",
            "allow_overpayment": False,
        },
    )
    assert res1.status_code == 400
    assert "exceeds remaining invoice balance" in res1.json()["error"]["message"]

    # 2. Cashier attempts overpayment with allow_overpayment=True -> 403 Forbidden (Admin only)
    res2 = client.post(
        "/api/payments",
        headers=cashier_headers,
        json={
            "invoice_id": inv_id,
            "method": "cash",
            "amount": "1500.00",
            "idempotency_key": f"key-{uuid.uuid4().hex}",
            "allow_overpayment": True,
        },
    )
    assert res2.status_code == 403
    assert "Overpayment allowance requires Admin privileges" in res2.json()["error"]["message"]

    # 3. Admin attempts overpayment with allow_overpayment=True -> 201 Created
    res3 = client.post(
        "/api/payments",
        headers=admin_headers,
        json={
            "invoice_id": inv_id,
            "method": "cash",
            "amount": "1500.00",
            "idempotency_key": f"key-{uuid.uuid4().hex}",
            "allow_overpayment": True,
        },
    )
    assert res3.status_code == 201
    assert res3.json()["invoice_payment_status"] == "paid"


def test_payments_ledger_append_only_immutability(client: TestClient, auth_staff_admin, test_invoice):
    """Payments ledger has no update or delete routes (PUT, PATCH, DELETE are rejected with 405)."""
    headers, _ = auth_staff_admin
    inv_id = test_invoice["id"]

    pay_res = client.post(
        "/api/payments",
        headers=headers,
        json={
            "invoice_id": inv_id,
            "method": "cash",
            "amount": "100.00",
            "idempotency_key": f"key-{uuid.uuid4().hex}",
        },
    )
    assert pay_res.status_code == 201
    pay_id = pay_res.json()["id"]

    # PUT must fail with 405
    put_res = client.put(f"/api/payments/{pay_id}", headers=headers, json={"amount": "200.00"})
    assert put_res.status_code == 405

    # PATCH must fail with 405
    patch_res = client.patch(f"/api/payments/{pay_id}", headers=headers, json={"amount": "200.00"})
    assert patch_res.status_code == 405

    # DELETE must fail with 405
    del_res = client.delete(f"/api/payments/{pay_id}", headers=headers)
    assert del_res.status_code == 405


def test_invalid_and_negative_amounts_rejected(client: TestClient, auth_staff_admin, test_invoice):
    """Amounts <= 0, floats, or invalid decimals are rejected."""
    headers, _ = auth_staff_admin
    inv_id = test_invoice["id"]

    # Negative amount
    res_neg = client.post(
        "/api/payments",
        headers=headers,
        json={
            "invoice_id": inv_id,
            "method": "cash",
            "amount": "-50.00",
            "idempotency_key": f"key-{uuid.uuid4().hex}",
        },
    )
    assert res_neg.status_code in [400, 422]

    # Zero amount
    res_zero = client.post(
        "/api/payments",
        headers=headers,
        json={
            "invoice_id": inv_id,
            "method": "cash",
            "amount": "0.00",
            "idempotency_key": f"key-{uuid.uuid4().hex}",
        },
    )
    assert res_zero.status_code in [400, 422]

    # Float amount (must reject float per money.py strictness)
    res_float = client.post(
        "/api/payments",
        headers=headers,
        json={
            "invoice_id": inv_id,
            "method": "cash",
            "amount": 50.5,
            "idempotency_key": f"key-{uuid.uuid4().hex}",
        },
    )
    assert res_float.status_code in [400, 422]


def test_upi_intent_generation(client: TestClient, auth_staff_admin, test_invoice):
    """Free-tier UPI intent URI generation generates correct payload."""
    headers, _ = auth_staff_admin
    inv_id = test_invoice["id"]

    res = client.get(f"/api/payments/upi-intent/{inv_id}", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["seller_upi_id"] == "retailstore@upi"
    assert "upi://pay?" in data["upi_uri"]
    assert "retailstore%40upi" in data["upi_uri"] or "retailstore@upi" in data["upi_uri"]
    assert f"am={Decimal(str(test_invoice['grand_total'])):.2f}" in data["upi_uri"]
