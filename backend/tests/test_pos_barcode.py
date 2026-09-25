from decimal import Decimal
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password
from app.modules.auth.models import Customer, StaffRole, StaffUser
from app.modules.catalog.models import Brand, Category, Product


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


def create_test_customer(db_session: Session):
    cust = Customer(
        email=f"cust_{uuid.uuid4().hex[:6]}@client.local",
        password_hash=hash_password("password123"),
        name="Retail Customer",
        phone="9876543210",
        is_active=True,
    )
    db_session.add(cust)
    db_session.commit()
    token = create_access_token(subject=str(cust.id), audience="customer")
    return cust, {"Authorization": f"Bearer {token}"}


def create_barcode_product(
    db_session: Session,
    name: str = "Logitech Wireless Mouse",
    sku: str | None = None,
    barcode: str | None = None,
    price: str = "499.00",
    stock: str = "25.000",
    is_active: bool = True,
):
    cat = Category(name=f"Cat_{uuid.uuid4().hex[:6]}")
    brand = Brand(name=f"Brand_{uuid.uuid4().hex[:6]}")
    db_session.add_all([cat, brand])
    db_session.commit()

    prod = Product(
        name=name,
        sku=sku or f"SKU-{uuid.uuid4().hex[:6].upper()}",
        barcode=barcode or f"890{uuid.uuid4().hex[:9]}",
        category_id=cat.id,
        brand_id=brand.id,
        unit="pcs",
        purchase_price=Decimal("300.00"),
        selling_price=Decimal(price),
        gst_rate=Decimal("18.00"),
        current_stock=Decimal(stock),
        min_stock=Decimal("5.000"),
        is_active=is_active,
    )
    db_session.add(prod)
    db_session.commit()
    return prod


def test_exact_barcode_product_lookup(client: TestClient, db_session: Session):
    _, headers = create_test_staff(db_session)
    barcode = "8901030999999"
    prod = create_barcode_product(db_session, name="Barcode Test Product", barcode=barcode)

    resp = client.get(f"/api/pos/products/barcode?barcode={barcode}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == str(prod.id)
    assert data["name"] == "Barcode Test Product"
    assert data["barcode"] == barcode
    assert data["sku"] == prod.sku
    assert data["selling_price"] == "499.00"
    assert data["current_stock"] == "25.000"


def test_sku_fallback_barcode_lookup(client: TestClient, db_session: Session):
    _, headers = create_test_staff(db_session)
    sku = "SCAN-KB-9900"
    prod = create_barcode_product(db_session, name="SKU Only Product", sku=sku, barcode=None)

    # Scanners or users scanning internal SKU barcode
    resp = client.get(f"/api/pos/products/barcode?barcode={sku}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == str(prod.id)
    assert data["sku"] == sku


def test_unknown_barcode_returns_404(client: TestClient, db_session: Session):
    _, headers = create_test_staff(db_session)
    unknown_code = "UNKNOWN999999"

    resp = client.get(f"/api/pos/products/barcode?barcode={unknown_code}", headers=headers)
    assert resp.status_code == 404
    err_msg = resp.json().get("error", {}).get("message") or resp.json().get("detail", "")
    assert f"Product not found for barcode: {unknown_code}" in err_msg


def test_inactive_product_excluded_from_barcode_lookup(client: TestClient, db_session: Session):
    _, headers = create_test_staff(db_session)
    barcode = "8908888888888"
    create_barcode_product(db_session, name="Deactivated Product", barcode=barcode, is_active=False)

    resp = client.get(f"/api/pos/products/barcode?barcode={barcode}", headers=headers)
    assert resp.status_code == 404


def test_unauthorized_access_barcode_lookup(client: TestClient, db_session: Session):
    # 1. No token -> 401
    resp = client.get("/api/pos/products/barcode?barcode=8901234567890")
    assert resp.status_code == 401

    # 2. Customer token -> 403 (POS is restricted to staff)
    _, cust_headers = create_test_customer(db_session)
    resp = client.get("/api/pos/products/barcode?barcode=8901234567890", headers=cust_headers)
    assert resp.status_code == 403


def test_pos_checkout_flow_with_scanned_barcode_product(client: TestClient, db_session: Session):
    _, staff_headers = create_test_staff(db_session)
    barcode = "8907777777777"
    prod = create_barcode_product(db_session, name="Scanned Item", barcode=barcode, price="200.00", stock="10.000")

    # 1. Scanner scans barcode -> finds product
    scan_resp = client.get(f"/api/pos/products/barcode?barcode={barcode}", headers=staff_headers)
    assert scan_resp.status_code == 200
    scanned_prod = scan_resp.json()

    # 2. Cart adds item and cashier completes checkout
    checkout_resp = client.post(
        "/api/pos/checkout",
        json={
            "items": [
                {
                    "product_id": scanned_prod["id"],
                    "quantity": "2.000",
                    "discount_amount": "0.00",
                }
            ],
            "discount_amount": "0.00",
            "payment_method": "cash",
        },
        headers=staff_headers,
    )
    assert checkout_resp.status_code == 201
    sale_data = checkout_resp.json()
    assert sale_data["status"] == "completed"
    assert sale_data["total_amount"] == "400.00"

    # Verify inventory was decremented
    db_session.refresh(prod)
    assert prod.current_stock == Decimal("8.000")
