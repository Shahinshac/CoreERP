import uuid
from decimal import Decimal
from datetime import datetime, timezone
import pytest
from app.core.security import create_access_token, hash_password
from app.modules.auth.models import Customer, StaffRole, StaffUser
from app.modules.catalog.models import Brand, Category, Product
from app.modules.payments.models import Payment, PaymentStatus
from app.modules.sales.models import Sale
from app.modules.support.models import SupportTicket


def create_test_staff(db_session):
    user = StaffUser(
        email=f"dash_staff_{uuid.uuid4().hex[:6]}@erp.local",
        password_hash=hash_password("password123"),
        role=StaffRole.STAFF,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    token = create_access_token(subject=str(user.id), audience="staff", role=user.role.value)
    return user, {"Authorization": f"Bearer {token}"}


def test_get_dashboard_today_summary(client, db_session):
    staff, headers = create_test_staff(db_session)

    # Create a customer
    cust = Customer(
        name="Daily Shopper",
        email=f"shopper_{uuid.uuid4().hex[:6]}@example.com",
        password_hash=hash_password("pass"),
        is_active=True,
    )
    # Create category, brand, product with low stock
    cat = Category(name=f"Cat_{uuid.uuid4().hex[:6]}")
    br = Brand(name=f"Brand_{uuid.uuid4().hex[:6]}")
    db_session.add_all([cust, cat, br])
    db_session.commit()

    prod = Product(
        name=f"Item {uuid.uuid4().hex[:4]}",
        sku=f"SKU-{uuid.uuid4().hex[:6]}",
        category_id=cat.id,
        brand_id=br.id,
        unit="pcs",
        purchase_price=Decimal("50.00"),
        selling_price=Decimal("120.00"),
        min_stock=Decimal("10.000"),
        current_stock=Decimal("2.000"), # Low stock!
        is_active=True,
    )
    # Create open ticket
    ticket = SupportTicket(
        ticket_number=f"TCK-{uuid.uuid4().hex[:6].upper()}",
        customer_id=cust.id,
        subject="Issue with delivery",
        description="Delivery delay",
        status="open",
    )
    # Create sale
    sale = Sale(
        invoice_number=f"POS-TDY-{uuid.uuid4().hex[:6].upper()}",
        customer_id=cust.id,
        staff_id=staff.id,
        subtotal=Decimal("240.00"),
        discount_amount=Decimal("0.00"),
        tax_amount=Decimal("0.00"),
        total_amount=Decimal("240.00"),
        status="completed",
        payment_method="cash",
    )
    # Create payment
    payment = Payment(
        customer_id=cust.id,
        created_by=staff.id,
        method="cash",
        amount=Decimal("240.00"),
        status=PaymentStatus.PAID.value,
        idempotency_key=f"pay-{uuid.uuid4().hex}",
        reference_id=sale.invoice_number,
    )
    db_session.add_all([prod, ticket, sale, payment])
    db_session.commit()

    # Clear cache before testing
    from app.modules.reports.dashboard_routes import _CACHE
    _CACHE["data"] = None
    _CACHE["expires_at"] = 0.0

    res = client.get("/api/dashboard/today", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert "total_sales" in data
    assert Decimal(data["total_sales"]) >= Decimal("240.00")
    assert data["sales_count"] >= 1
    assert "cash_collected" in data
    assert Decimal(data["cash_collected"]) >= Decimal("240.00")
    assert "payment_method_totals" in data
    assert data["customers_served"] >= 1
    assert data["low_stock_count"] >= 1
    assert data["open_tickets_count"] >= 1

    # Verify cached response on immediate subsequent call
    res_cached = client.get("/api/dashboard/today", headers=headers)
    assert res_cached.status_code == 200
    assert res_cached.json() == data
