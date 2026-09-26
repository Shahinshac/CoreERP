from decimal import Decimal
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password
from app.modules.auth.models import Customer, StaffRole, StaffUser
from app.modules.catalog.models import Brand, Category, Product
from app.modules.emi.models import EmiPlan, EmiInstallment, EmiPlanStatus, EmiInstallmentStatus
from app.modules.invoicing.models import Invoice
from app.modules.payments.models import Payment
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


def create_test_customer(db_session: Session):
    cust = Customer(
        name="Mohammed Rafi",
        email=f"rafi_{uuid.uuid4().hex[:6]}@example.com",
        phone="9876543210",
        address="Calicut, Kerala",
        state="Kerala",
        password_hash=hash_password("password123"),
        is_active=True,
    )
    db_session.add(cust)
    db_session.commit()
    return cust


def create_test_product(db_session: Session, price="30000.00", stock="10.000"):
    cat = Category(name=f"Cat_{uuid.uuid4().hex[:6]}")
    brand = Brand(name=f"Brand_{uuid.uuid4().hex[:6]}")
    db_session.add_all([cat, brand])
    db_session.commit()

    prod = Product(
        name="iPhone 15 Pro",
        sku=f"IP15-{uuid.uuid4().hex[:6].upper()}",
        category_id=cat.id,
        brand_id=brand.id,
        unit="pcs",
        purchase_price=Decimal("20000.00"),
        selling_price=Decimal(price),
        gst_rate=Decimal("18.00"),
        current_stock=Decimal(stock),
        min_stock=Decimal("2.000"),
        is_active=True,
    )
    db_session.add(prod)
    db_session.commit()
    return prod


def test_emi_checkout_rejects_walkin_customer(client: TestClient, db_session: Session):
    cashier, headers = create_test_staff(db_session)
    prod = create_test_product(db_session, price="12000.00")

    # Attempt EMI without customer_id
    resp = client.post(
        "/api/pos/checkout",
        json={
            "customer_id": None,
            "items": [{"product_id": str(prod.id), "quantity": "1.000", "discount_amount": "0.00"}],
            "discount_amount": "0.00",
            "payment_method": "emi",
            "emi_installments": 6,
            "emi_down_payment": "0.00",
        },
        headers=headers,
    )
    assert resp.status_code == 400
    err_msg = resp.json().get("error", {}).get("message") or resp.json().get("detail", "")
    assert "Customer account selection is required for EMI" in err_msg


def test_emi_checkout_rejects_excessive_down_payment(client: TestClient, db_session: Session):
    cashier, headers = create_test_staff(db_session)
    cust = create_test_customer(db_session)
    prod = create_test_product(db_session, price="10000.00")

    # Down payment equal to or greater than total
    resp = client.post(
        "/api/pos/checkout",
        json={
            "customer_id": str(cust.id),
            "items": [{"product_id": str(prod.id), "quantity": "1.000", "discount_amount": "0.00"}],
            "discount_amount": "0.00",
            "payment_method": "emi",
            "emi_installments": 3,
            "emi_down_payment": "10000.00",
        },
        headers=headers,
    )
    assert resp.status_code == 400
    err_msg = resp.json().get("error", {}).get("message") or resp.json().get("detail", "")
    assert "Down payment must be less than the total bill amount" in err_msg


def test_emi_checkout_success_no_cost_emi(client: TestClient, db_session: Session):
    cashier, headers = create_test_staff(db_session)
    cust = create_test_customer(db_session)
    prod = create_test_product(db_session, price="30000.00", stock="5.000")

    # No-cost EMI: ₹30,000 across 6 months, down payment ₹0.00
    resp = client.post(
        "/api/pos/checkout",
        json={
            "customer_id": str(cust.id),
            "items": [{"product_id": str(prod.id), "quantity": "1.000", "discount_amount": "0.00"}],
            "discount_amount": "0.00",
            "payment_method": "emi",
            "emi_installments": 6,
            "emi_down_payment": "0.00",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()

    assert data["payment_method"] == "emi"
    assert data["total_amount"] == "30000.00"
    assert data["emi_plan_id"] is not None

    # Generate Invoice from Sale (as POS frontend does upon checkout)
    inv_res = client.post(f"/api/invoicing/from-sale/{data['id']}", headers=headers)
    assert inv_res.status_code == 201
    inv_data = inv_res.json()
    assert inv_data["payment_status"] == "unpaid"

    # Verify EmiPlan in DB
    plan = db_session.query(EmiPlan).filter(EmiPlan.id == uuid.UUID(data["emi_plan_id"])).first()
    assert plan is not None
    assert plan.customer_id == cust.id
    assert plan.number_of_installments == 6
    assert plan.principal == Decimal("30000.00")
    assert plan.down_payment == Decimal("0.00")
    assert plan.total_financed == Decimal("30000.00")
    assert plan.installment_amount == Decimal("5000.00")
    assert plan.status == EmiPlanStatus.ACTIVE.value
    assert plan.invoice_id == uuid.UUID(inv_data["id"])

    # Verify installments
    installments = (
        db_session.query(EmiInstallment)
        .filter(EmiInstallment.emi_plan_id == plan.id)
        .order_by(EmiInstallment.installment_number.asc())
        .all()
    )
    assert len(installments) == 6
    for inst in installments:
        assert inst.amount_due == Decimal("5000.00")
        assert inst.amount_paid == Decimal("0.00")
        assert inst.status == EmiInstallmentStatus.PENDING.value

    # Verify linked invoice
    invoice = db_session.query(Invoice).filter(Invoice.id == plan.invoice_id).first()
    assert invoice is not None
    assert invoice.payment_status == "unpaid"
    assert invoice.customer_id == cust.id

    # Verify Invoice GET API returns emi_plan and payment_method
    detail_res = client.get(f"/api/invoicing/{invoice.id}", headers=headers)
    assert detail_res.status_code == 200
    detail_data = detail_res.json()
    assert detail_data["payment_method"] == "emi"
    assert detail_data["emi_plan"] is not None
    assert detail_data["emi_plan"]["number_of_installments"] == 6
    assert len(detail_data["emi_plan"]["installments"]) == 6

    # Verify Invoice PDF generation with EMI details
    pdf_res = client.get(f"/api/invoicing/{invoice.id}/pdf", headers=headers)
    assert pdf_res.status_code == 200
    assert pdf_res.headers["content-type"] == "application/pdf"
    assert len(pdf_res.content) > 1000


def test_emi_checkout_with_down_payment(client: TestClient, db_session: Session):
    cashier, headers = create_test_staff(db_session)
    cust = create_test_customer(db_session)
    prod = create_test_product(db_session, price="20000.00", stock="5.000")

    # Down payment ₹5,000, 3 installments -> remaining ₹15,000 / 3 = ₹5,000 / mo
    resp = client.post(
        "/api/pos/checkout",
        json={
            "customer_id": str(cust.id),
            "items": [{"product_id": str(prod.id), "quantity": "1.000", "discount_amount": "0.00"}],
            "discount_amount": "0.00",
            "payment_method": "emi",
            "emi_installments": 3,
            "emi_down_payment": "5000.00",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()

    # Generate Invoice from Sale
    inv_res = client.post(f"/api/invoicing/from-sale/{data['id']}", headers=headers)
    assert inv_res.status_code == 201
    inv_data = inv_res.json()
    assert inv_data["payment_status"] == "partial"

    # Check down payment recorded in Payment ledger
    sale_id = uuid.UUID(data["id"])
    pmts = db_session.query(Payment).filter(Payment.reference_id == data["invoice_number"]).all()
    assert len(pmts) == 1
    assert pmts[0].amount == Decimal("5000.00")

    # Check Plan
    plan = db_session.query(EmiPlan).filter(EmiPlan.id == uuid.UUID(data["emi_plan_id"])).first()
    assert plan.down_payment == Decimal("5000.00")
    assert plan.total_financed == Decimal("15000.00")
    assert plan.installment_amount == Decimal("5000.00")
    assert plan.invoice_id == uuid.UUID(inv_data["id"])

    # Check Invoice status
    invoice = db_session.query(Invoice).filter(Invoice.id == plan.invoice_id).first()
    assert invoice.payment_status == "partial"
