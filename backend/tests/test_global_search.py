import uuid
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password
from app.modules.auth.models import Customer, StaffRole, StaffUser
from app.modules.catalog.models import Brand, Category, Product
from app.modules.invoicing.models import Invoice
from datetime import date


def create_test_staff(db_session: Session):
    user = StaffUser(
        email=f"search_staff_{uuid.uuid4().hex[:6]}@erp.local",
        password_hash=hash_password("password123"),
        role=StaffRole.STAFF,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    token = create_access_token(subject=str(user.id), audience="staff", role=user.role.value)
    return user, {"Authorization": f"Bearer {token}"}


def test_global_search_returns_products_customers_invoices(client: TestClient, db_session: Session):
    staff, headers = create_test_staff(db_session)

    # 1. Create unique product
    cat = Category(name=f"Cat_{uuid.uuid4().hex[:6]}")
    brand = Brand(name=f"Brand_{uuid.uuid4().hex[:6]}")
    db_session.add_all([cat, brand])
    db_session.commit()

    unique_code = uuid.uuid4().hex[:6].upper()
    prod = Product(
        name=f"Wireless Mouse {unique_code}",
        sku=f"WM-{unique_code}",
        barcode=f"BAR-{unique_code}",
        category_id=cat.id,
        brand_id=brand.id,
        unit="pcs",
        purchase_price=Decimal("100.00"),
        selling_price=Decimal("299.00"),
        gst_rate=Decimal("18.00"),
        current_stock=Decimal("20.000"),
        min_stock=Decimal("2.000"),
        is_active=True,
    )
    db_session.add(prod)

    # 2. Create customer
    cust = Customer(
        name=f"Alice Searcher {unique_code}",
        email=f"alice_{unique_code.lower()}@test.local",
        phone=f"+9198{unique_code.lower()[:8]}",
        password_hash=hash_password("pw123"),
        is_active=True,
    )
    db_session.add(cust)
    db_session.commit()

    # 3. Create invoice
    inv = Invoice(
        invoice_number=f"INV-{unique_code}-99",
        financial_year="2026-2027",
        invoice_date=date.today(),
        staff_id=staff.id,
        customer_id=cust.id,
        seller_name="Retail Store",
        seller_gstin="27ABCDE1234F1Z5",
        seller_state="Maharashtra",
        buyer_name=cust.name,
        buyer_state="Maharashtra",
        place_of_supply="Maharashtra",
        subtotal=Decimal("253.39"),
        total_tax=Decimal("45.61"),
        grand_total=Decimal("299.00"),
        cgst_amount=Decimal("22.81"),
        sgst_amount=Decimal("22.81"),
        igst_amount=Decimal("0.00"),
    )
    db_session.add(inv)
    db_session.commit()

    # Query for unique_code
    res = client.get(f"/api/search?q={unique_code}", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert "products" in data
    assert "customers" in data
    assert "invoices" in data

    assert any(p["sku"] == f"WM-{unique_code}" for p in data["products"])
    assert any(c["name"] == cust.name for c in data["customers"])
    assert any(i["invoice_number"] == f"INV-{unique_code}-99" for i in data["invoices"])


def test_global_search_requires_staff_auth(client: TestClient):
    res = client.get("/api/search?q=test")
    assert res.status_code in (401, 403)
