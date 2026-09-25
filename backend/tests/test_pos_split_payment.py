from decimal import Decimal
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password
from app.modules.auth.models import StaffRole, StaffUser
from app.modules.catalog.models import Brand, Category, Product
from app.modules.payments.models import Payment, PaymentStatus
from app.modules.sales.models import Sale


def create_test_staff(db_session: Session, role: StaffRole = StaffRole.STAFF):
    email = f"staff_{uuid.uuid4().hex[:6]}@erp.local"
    user = StaffUser(
        email=email,
        password_hash=hash_password("password123"),
        role=role,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    token = create_access_token(subject=str(user.id), audience="staff", role=role.value)
    return user, {"Authorization": f"Bearer {token}"}


def create_test_product(db_session: Session, price="500.00", stock="50.000"):
    cat = Category(name=f"Cat_{uuid.uuid4().hex[:6]}")
    brand = Brand(name=f"Brand_{uuid.uuid4().hex[:6]}")
    db_session.add_all([cat, brand])
    db_session.commit()

    prod = Product(
        name="Mechanical Keyboard",
        sku=f"KB-{uuid.uuid4().hex[:6].upper()}",
        category_id=cat.id,
        brand_id=brand.id,
        unit="pcs",
        purchase_price=Decimal("250.00"),
        selling_price=Decimal(price),
        gst_rate=Decimal("18.00"),
        current_stock=Decimal(stock),
        min_stock=Decimal("5.000"),
        is_active=True,
    )
    db_session.add(prod)
    db_session.commit()
    return prod


def test_valid_cash_and_upi_split_payment(client: TestClient, db_session: Session):
    cashier, headers = create_test_staff(db_session)
    prod = create_test_product(db_session, price="500.00", stock="10.000")

    # Buy 2 x 500 = ₹1,000.00
    # Split: Cash ₹400.00 + UPI ₹600.00
    resp = client.post(
        "/api/pos/checkout",
        json={
            "items": [{"product_id": str(prod.id), "quantity": "2.000", "discount_amount": "0.00"}],
            "discount_amount": "0.00",
            "payment_method": "split",
            "split_payments": [
                {"method": "cash", "amount": "400.00"},
                {"method": "upi", "amount": "600.00"},
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "completed"
    assert data["total_amount"] == "1000.00"
    assert data["payment_method"] == "split"
    assert len(data["payment_details"]) == 2
    assert data["payment_details"][0] == {"method": "cash", "amount": "400.00"}
    assert data["payment_details"][1] == {"method": "upi", "amount": "600.00"}

    # Verify payment records in database
    payments = db_session.query(Payment).filter(Payment.reference_id == data["invoice_number"]).all()
    assert len(payments) == 2
    methods = {p.method: p.amount for p in payments}
    assert methods["cash"] == Decimal("400.00")
    assert methods["upi"] == Decimal("600.00")


def test_valid_cash_and_card_split_payment(client: TestClient, db_session: Session):
    cashier, headers = create_test_staff(db_session)
    prod = create_test_product(db_session, price="250.00", stock="10.000")

    # Buy 2 x 250 = ₹500.00
    # Split: Cash ₹200.00 + Card ₹300.00
    resp = client.post(
        "/api/pos/checkout",
        json={
            "items": [{"product_id": str(prod.id), "quantity": "2.000", "discount_amount": "0.00"}],
            "payment_method": "split",
            "split_payments": [
                {"method": "cash", "amount": "200.00"},
                {"method": "card", "amount": "300.00"},
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["payment_method"] == "split"
    assert len(data["payment_details"]) == 2


def test_underpayment_rejected(client: TestClient, db_session: Session):
    cashier, headers = create_test_staff(db_session)
    prod = create_test_product(db_session, price="1000.00", stock="5.000")

    # Total 1000.00, but entered 400 + 500 = 900.00 (underpaid)
    resp = client.post(
        "/api/pos/checkout",
        json={
            "items": [{"product_id": str(prod.id), "quantity": "1.000"}],
            "payment_method": "split",
            "split_payments": [
                {"method": "cash", "amount": "400.00"},
                {"method": "upi", "amount": "500.00"},
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 400
    err_msg = resp.json().get("error", {}).get("message") or resp.json().get("detail", "")
    assert "underpaid" in err_msg.lower() or "remaining" in err_msg.lower()


def test_overpayment_rejected(client: TestClient, db_session: Session):
    cashier, headers = create_test_staff(db_session)
    prod = create_test_product(db_session, price="1000.00", stock="5.000")

    # Total 1000.00, but entered 600 + 500 = 1100.00 (overpaid)
    resp = client.post(
        "/api/pos/checkout",
        json={
            "items": [{"product_id": str(prod.id), "quantity": "1.000"}],
            "payment_method": "split",
            "split_payments": [
                {"method": "cash", "amount": "600.00"},
                {"method": "upi", "amount": "500.00"},
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 400
    err_msg = resp.json().get("error", {}).get("message") or resp.json().get("detail", "")
    assert "overpaid" in err_msg.lower() or "exceeds" in err_msg.lower()


def test_zero_or_negative_portion_rejected(client: TestClient, db_session: Session):
    cashier, headers = create_test_staff(db_session)
    prod = create_test_product(db_session, price="500.00", stock="5.000")

    # Zero portion
    resp_zero = client.post(
        "/api/pos/checkout",
        json={
            "items": [{"product_id": str(prod.id), "quantity": "1.000"}],
            "payment_method": "split",
            "split_payments": [
                {"method": "cash", "amount": "0.00"},
                {"method": "upi", "amount": "500.00"},
            ],
        },
        headers=headers,
    )
    assert resp_zero.status_code in (400, 422)

    # Negative portion
    resp_neg = client.post(
        "/api/pos/checkout",
        json={
            "items": [{"product_id": str(prod.id), "quantity": "1.000"}],
            "payment_method": "split",
            "split_payments": [
                {"method": "cash", "amount": "-50.00"},
                {"method": "upi", "amount": "550.00"},
            ],
        },
        headers=headers,
    )
    assert resp_neg.status_code in (400, 422)


def test_duplicate_payment_method_rejected(client: TestClient, db_session: Session):
    cashier, headers = create_test_staff(db_session)
    prod = create_test_product(db_session, price="1000.00", stock="5.000")

    resp = client.post(
        "/api/pos/checkout",
        json={
            "items": [{"product_id": str(prod.id), "quantity": "1.000"}],
            "payment_method": "split",
            "split_payments": [
                {"method": "cash", "amount": "400.00"},
                {"method": "cash", "amount": "600.00"},
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 400
    err_msg = resp.json().get("error", {}).get("message") or resp.json().get("detail", "")
    assert "duplicate" in err_msg.lower()


def test_cash_drawer_receives_only_cash_portion(client: TestClient, db_session: Session):
    cashier, headers = create_test_staff(db_session)
    prod = create_test_product(db_session, price="1000.00", stock="10.000")

    # 1. Open drawer with float ₹1,000.00
    open_res = client.post(
        "/api/pos/cash-drawer/open",
        json={"opening_cash": "1000.00"},
        headers=headers,
    )
    assert open_res.status_code == 201

    # 2. Checkout with split: ₹300.00 Cash + ₹700.00 UPI
    checkout_res = client.post(
        "/api/pos/checkout",
        json={
            "items": [{"product_id": str(prod.id), "quantity": "1.000"}],
            "payment_method": "split",
            "split_payments": [
                {"method": "cash", "amount": "300.00"},
                {"method": "upi", "amount": "700.00"},
            ],
        },
        headers=headers,
    )
    assert checkout_res.status_code == 201

    # 3. Check drawer status
    # Expected cash MUST be 1000 + 300 = 1300.00, NOT 2000!
    status_res = client.get("/api/pos/cash-drawer/current", headers=headers)
    assert status_res.status_code == 200
    session_data = status_res.json()["session"]
    assert session_data["opening_cash"] == "1000.00"
    assert session_data["cash_sales_amount"] == "300.00"
    assert session_data["expected_cash"] == "1300.00"
    assert session_data["total_sales_amount"] == "1000.00"
    assert session_data["sales_by_payment_method"]["cash"] == "300.00"
    assert session_data["sales_by_payment_method"]["upi"] == "700.00"


def test_existing_single_payment_checkout_preserved(client: TestClient, db_session: Session):
    cashier, headers = create_test_staff(db_session)
    prod = create_test_product(db_session, price="200.00", stock="5.000")

    resp = client.post(
        "/api/pos/checkout",
        json={
            "items": [{"product_id": str(prod.id), "quantity": "1.000"}],
            "payment_method": "cash",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["payment_method"] == "cash"
    assert data["total_amount"] == "200.00"
    assert len(data["payment_details"]) == 1
    assert data["payment_details"][0] == {"method": "cash", "amount": "200.00"}
