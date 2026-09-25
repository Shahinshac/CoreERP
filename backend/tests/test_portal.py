import io
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password
from app.modules.auth.models import Customer, StaffRole, StaffUser
from app.modules.catalog.models import Brand, Category, Product
from app.modules.emi.models import EmiInstallment, EmiInstallmentStatus, EmiPlan, EmiPlanStatus
from app.modules.invoicing.models import Invoice, InvoiceItem, InvoiceSequence
from app.modules.payments.models import Payment
from app.modules.sales.models import Sale, SaleItem


@pytest.fixture
def portal_setup(db_session: Session):
    # 1. Staff Admin
    admin = StaffUser(
        email="admin_portal@erp.local",
        password_hash=hash_password("adminpass123"),
        role=StaffRole.ADMIN,
        is_active=True,
    )
    db_session.add(admin)
    db_session.flush()

    # 2. Two distinct customers
    customer_a = Customer(
        email="customer_a@example.com",
        password_hash=hash_password("custpass123"),
        name="Customer Alpha",
        phone="9876543210",
        address="123 Alpha St, Mumbai",
        gstin="27ABCDE1234F1Z5",
        state="Maharashtra",
        is_active=True,
    )
    customer_b = Customer(
        email="customer_b@example.com",
        password_hash=hash_password("custpass123"),
        name="Customer Beta",
        phone="9876543211",
        address="456 Beta St, Pune",
        gstin=None,
        state="Maharashtra",
        is_active=True,
    )
    db_session.add_all([customer_a, customer_b])
    db_session.flush()

    # 3. Product
    cat = Category(name="Electronics", description="Electronics category")
    brand = Brand(name="AcmeBrand")
    db_session.add_all([cat, brand])
    db_session.flush()

    prod = Product(
        name="Smart Tablet",
        sku="TAB-001",
        category_id=cat.id,
        brand_id=brand.id,
        selling_price=Decimal("15000.00"),
        purchase_price=Decimal("10000.00"),
        hsn_code="8471",
        current_stock=Decimal("50.000"),
        is_active=True,
    )
    db_session.add(prod)
    db_session.flush()

    # 4. Purchases / Sales
    sale_a = Sale(
        invoice_number="POS-2026-0001",
        customer_id=customer_a.id,
        staff_id=admin.id,
        subtotal=Decimal("15000.00"),
        discount_amount=Decimal("0.00"),
        tax_amount=Decimal("2700.00"),
        total_amount=Decimal("17700.00"),
        status="completed",
        payment_method="cash",
    )
    sale_b = Sale(
        invoice_number="POS-2026-0002",
        customer_id=customer_b.id,
        staff_id=admin.id,
        subtotal=Decimal("15000.00"),
        discount_amount=Decimal("0.00"),
        tax_amount=Decimal("2700.00"),
        total_amount=Decimal("17700.00"),
        status="completed",
        payment_method="card",
    )
    db_session.add_all([sale_a, sale_b])
    db_session.flush()

    item_a = SaleItem(
        sale_id=sale_a.id,
        product_id=prod.id,
        quantity=Decimal("1.000"),
        unit_price=Decimal("15000.00"),
        total_price=Decimal("15000.00"),
    )
    item_b = SaleItem(
        sale_id=sale_b.id,
        product_id=prod.id,
        quantity=Decimal("1.000"),
        unit_price=Decimal("15000.00"),
        total_price=Decimal("15000.00"),
    )
    db_session.add_all([item_a, item_b])

    # 5. Invoices
    inv_seq = InvoiceSequence(financial_year="2026-27", sequence_type="INV", last_number=100)
    db_session.add(inv_seq)

    inv_a = Invoice(
        invoice_number="INV-2026-27-0101",
        financial_year="2026-27",
        invoice_date=date.today(),
        customer_id=customer_a.id,
        staff_id=admin.id,
        seller_name="Test Shop",
        seller_gstin="27AAAAA0000A1Z5",
        seller_state="Maharashtra",
        buyer_name="Customer Alpha",
        buyer_state="Maharashtra",
        place_of_supply="Maharashtra",
        is_inter_state=False,
        subtotal=Decimal("15000.00"),
        cgst_amount=Decimal("1350.00"),
        sgst_amount=Decimal("1350.00"),
        igst_amount=Decimal("0.00"),
        total_tax=Decimal("2700.00"),
        grand_total=Decimal("17700.00"),
        payment_status="partial",
        is_cancelled=False,
    )
    inv_b = Invoice(
        invoice_number="INV-2026-27-0102",
        financial_year="2026-27",
        invoice_date=date.today(),
        customer_id=customer_b.id,
        staff_id=admin.id,
        seller_name="Test Shop",
        seller_gstin="27AAAAA0000A1Z5",
        seller_state="Maharashtra",
        buyer_name="Customer Beta",
        buyer_state="Maharashtra",
        place_of_supply="Maharashtra",
        is_inter_state=False,
        subtotal=Decimal("15000.00"),
        cgst_amount=Decimal("1350.00"),
        sgst_amount=Decimal("1350.00"),
        igst_amount=Decimal("0.00"),
        total_tax=Decimal("2700.00"),
        grand_total=Decimal("17700.00"),
        payment_status="paid",
        is_cancelled=False,
    )
    db_session.add_all([inv_a, inv_b])
    db_session.flush()

    inv_item_a = InvoiceItem(
        invoice_id=inv_a.id,
        product_id=prod.id,
        product_name="Smart Tablet",
        product_sku="TAB-001",
        hsn_code="8471",
        quantity=Decimal("1.000"),
        unit_price=Decimal("15000.00"),
        taxable_value=Decimal("15000.00"),
        gst_rate=Decimal("18.00"),
        cgst_rate=Decimal("9.00"),
        cgst_amount=Decimal("1350.00"),
        sgst_rate=Decimal("9.00"),
        sgst_amount=Decimal("1350.00"),
        igst_rate=Decimal("0.00"),
        igst_amount=Decimal("0.00"),
        total_amount=Decimal("17700.00"),
    )
    db_session.add(inv_item_a)

    # 6. Payments
    pay_a = Payment(
        invoice_id=inv_a.id,
        customer_id=customer_a.id,
        created_by=admin.id,
        method="upi",
        amount=Decimal("7700.00"),
        status="paid",
        idempotency_key="pay_portal_a_1",
        reference_id="UPI-TXN-12345",
    )
    pay_b = Payment(
        invoice_id=inv_b.id,
        customer_id=customer_b.id,
        created_by=admin.id,
        method="card",
        amount=Decimal("17700.00"),
        status="paid",
        idempotency_key="pay_portal_b_1",
        reference_id="CARD-TXN-99999",
    )
    db_session.add_all([pay_a, pay_b])

    # 7. EMI plan for Customer A
    emi_a = EmiPlan(
        customer_id=customer_a.id,
        invoice_id=inv_a.id,
        created_by=admin.id,
        principal=Decimal("10000.00"),
        down_payment=Decimal("0.00"),
        number_of_installments=2,
        interest_rate=Decimal("0.00"),
        interest_amount=Decimal("0.00"),
        total_financed=Decimal("10000.00"),
        installment_amount=Decimal("5000.00"),
        start_date=date.today(),
        status=EmiPlanStatus.ACTIVE,
    )
    db_session.add(emi_a)
    db_session.flush()

    inst1 = EmiInstallment(
        emi_plan_id=emi_a.id,
        installment_number=1,
        due_date=date.today() + timedelta(days=30),
        amount_due=Decimal("5000.00"),
        amount_paid=Decimal("0.00"),
        status=EmiInstallmentStatus.PENDING,
    )
    inst2 = EmiInstallment(
        emi_plan_id=emi_a.id,
        installment_number=2,
        due_date=date.today() + timedelta(days=60),
        amount_due=Decimal("5000.00"),
        amount_paid=Decimal("0.00"),
        status=EmiInstallmentStatus.PENDING,
    )
    db_session.add_all([inst1, inst2])

    db_session.commit()

    # Generate JWT tokens
    token_a = create_access_token(subject=str(customer_a.id), audience="customer")
    token_b = create_access_token(subject=str(customer_b.id), audience="customer")
    token_staff = create_access_token(subject=str(admin.id), audience="staff", role=StaffRole.ADMIN.value)

    return {
        "admin": admin,
        "customer_a": customer_a,
        "customer_b": customer_b,
        "token_a": token_a,
        "token_b": token_b,
        "token_staff": token_staff,
        "sale_a": sale_a,
        "sale_b": sale_b,
        "inv_a": inv_a,
        "inv_b": inv_b,
        "pay_a": pay_a,
        "pay_b": pay_b,
        "emi_a": emi_a,
    }


# ==========================================
# 1. CUSTOMER DATA ISOLATION TESTS
# ==========================================

def test_portal_purchases_isolation(client: TestClient, portal_setup):
    """Customer A only sees their own purchases, never Customer B's."""
    headers_a = {"Authorization": f"Bearer {portal_setup['token_a']}"}
    headers_b = {"Authorization": f"Bearer {portal_setup['token_b']}"}

    res_a = client.get("/api/portal/purchases", headers=headers_a)
    assert res_a.status_code == 200
    sales_a = res_a.json()
    assert len(sales_a) == 1
    assert sales_a[0]["invoice_number"] == "POS-2026-0001"
    assert len(sales_a[0]["items"]) == 1

    res_b = client.get("/api/portal/purchases", headers=headers_b)
    assert res_b.status_code == 200
    sales_b = res_b.json()
    assert len(sales_b) == 1
    assert sales_b[0]["invoice_number"] == "POS-2026-0002"


def test_portal_invoices_isolation(client: TestClient, portal_setup):
    """Customer A invoice list contains only Customer A invoices."""
    headers_a = {"Authorization": f"Bearer {portal_setup['token_a']}"}
    res_a = client.get("/api/portal/invoices", headers=headers_a)
    assert res_a.status_code == 200
    invoices = res_a.json()
    assert len(invoices) == 1
    assert invoices[0]["invoice_number"] == "INV-2026-27-0101"


def test_portal_invoice_ownership_check_403_and_404(client: TestClient, portal_setup):
    """
    Invoice detail ownership verification:
    - 403 Forbidden when Customer A attempts to view Customer B's invoice.
    - 404 Not Found when requesting non-existent invoice.
    - 200 OK for own invoice.
    """
    headers_a = {"Authorization": f"Bearer {portal_setup['token_a']}"}
    inv_a_id = portal_setup["inv_a"].id
    inv_b_id = portal_setup["inv_b"].id
    non_existent_id = uuid.uuid4()

    # 1. Own invoice -> 200 OK
    res_own = client.get(f"/api/portal/invoices/{inv_a_id}", headers=headers_a)
    assert res_own.status_code == 200
    assert res_own.json()["invoice_number"] == "INV-2026-27-0101"

    # 2. Other customer's invoice -> 403 Forbidden (documented ownership decision)
    res_other = client.get(f"/api/portal/invoices/{inv_b_id}", headers=headers_a)
    assert res_other.status_code == 403
    assert "access forbidden" in (res_other.json().get("detail") or res_other.json().get("error", {}).get("message", "")).lower()

    # 3. Non-existent invoice -> 404 Not Found
    res_not_found = client.get(f"/api/portal/invoices/{non_existent_id}", headers=headers_a)
    assert res_not_found.status_code == 404


def test_portal_invoice_pdf_ownership_and_stream(client: TestClient, portal_setup):
    """
    Invoice PDF streaming:
    - 200 OK with application/pdf for own invoice.
    - 403 Forbidden for another customer's invoice.
    - 404 Not Found for non-existent invoice.
    """
    headers_a = {"Authorization": f"Bearer {portal_setup['token_a']}"}
    inv_a_id = portal_setup["inv_a"].id
    inv_b_id = portal_setup["inv_b"].id
    non_existent_id = uuid.uuid4()

    # 1. Own invoice PDF -> 200 OK
    res_pdf = client.get(f"/api/portal/invoices/{inv_a_id}/pdf", headers=headers_a)
    assert res_pdf.status_code == 200
    assert res_pdf.headers["content-type"] == "application/pdf"
    assert "attachment" in res_pdf.headers["content-disposition"]
    assert len(res_pdf.content) > 100

    # 2. Other's invoice PDF -> 403 Forbidden
    res_other_pdf = client.get(f"/api/portal/invoices/{inv_b_id}/pdf", headers=headers_a)
    assert res_other_pdf.status_code == 403

    # 3. Non-existent PDF -> 404 Not Found
    res_none_pdf = client.get(f"/api/portal/invoices/{non_existent_id}/pdf", headers=headers_a)
    assert res_none_pdf.status_code == 404


def test_portal_payments_isolation(client: TestClient, portal_setup):
    """Customer A only sees payments they made."""
    headers_a = {"Authorization": f"Bearer {portal_setup['token_a']}"}
    res = client.get("/api/portal/payments", headers=headers_a)
    assert res.status_code == 200
    payments = res.json()
    assert len(payments) == 1
    assert payments[0]["method"] == "upi"
    assert Decimal(str(payments[0]["amount"])) == Decimal("7700.00")
    assert payments[0]["reference_id"] == "UPI-TXN-12345"


def test_portal_emi_isolation(client: TestClient, portal_setup):
    """Customer A sees their EMI plan and installment schedule; Customer B has none."""
    headers_a = {"Authorization": f"Bearer {portal_setup['token_a']}"}
    headers_b = {"Authorization": f"Bearer {portal_setup['token_b']}"}

    res_a = client.get("/api/portal/emi", headers=headers_a)
    assert res_a.status_code == 200
    plans_a = res_a.json()
    assert len(plans_a) == 1
    assert Decimal(str(plans_a[0]["total_financed"])) == Decimal("10000.00")
    assert len(plans_a[0]["installments"]) == 2
    assert plans_a[0]["installments"][0]["installment_number"] == 1

    res_b = client.get("/api/portal/emi", headers=headers_b)
    assert res_b.status_code == 200
    assert len(res_b.json()) == 0


def test_portal_dashboard_metrics(client: TestClient, portal_setup):
    """
    Customer dashboard summary aggregates:
    - total purchases count = 1
    - total spent = 17700.00
    - outstanding balance: unpaid invoice balance (17700 - 7700 = 10000) + unpaid EMI (10000) = 20000.00
    - active_emi_plans_count = 1
    - open_tickets_count = 0 (Phase 14 stub)
    - recent_purchases = 1 item
    """
    headers_a = {"Authorization": f"Bearer {portal_setup['token_a']}"}
    res = client.get("/api/portal/dashboard", headers=headers_a)
    assert res.status_code == 200
    dash = res.json()

    assert dash["total_purchases_count"] == 1
    assert Decimal(str(dash["total_spent"])) == Decimal("17700.00")
    assert Decimal(str(dash["outstanding_balance"])) == Decimal("20000.00")
    assert dash["active_emi_plans_count"] == 1
    assert dash["open_tickets_count"] == 0
    assert len(dash["recent_purchases"]) == 1


# ==========================================
# 2. PROFILE EDIT CONSTRAINTS
# ==========================================

def test_portal_profile_view_and_update(client: TestClient, portal_setup, db_session: Session):
    """
    Customer can view and edit name, phone, address, gstin, state.
    Restricted fields (email, id, is_active, password) cannot be altered.
    """
    headers_a = {"Authorization": f"Bearer {portal_setup['token_a']}"}
    cust_a = portal_setup["customer_a"]

    # View
    res_view = client.get("/api/portal/profile", headers=headers_a)
    assert res_view.status_code == 200
    prof = res_view.json()
    assert prof["email"] == "customer_a@example.com"
    assert prof["name"] == "Customer Alpha"

    # Update valid contact fields
    update_payload = {
        "name": "Alpha Corporate Ltd",
        "phone": "9998887776",
        "address": "789 New Industrial Zone",
        "gstin": "27XYZAB5678C1Z9",
        "state": "Maharashtra",
        # Attempt to alter restricted fields
        "email": "hacked@example.com",
        "id": str(uuid.uuid4()),
        "is_active": False,
        "password": "newpassword123",
    }
    res_up = client.put("/api/portal/profile", headers=headers_a, json=update_payload)
    assert res_up.status_code == 200
    updated = res_up.json()

    assert updated["name"] == "Alpha Corporate Ltd"
    assert updated["phone"] == "9998887776"
    assert updated["address"] == "789 New Industrial Zone"
    assert updated["gstin"] == "27XYZAB5678C1Z9"

    # Verify restricted fields were NOT changed
    assert updated["email"] == "customer_a@example.com"
    assert updated["id"] == str(cust_a.id)

    db_session.refresh(cust_a)
    assert cust_a.email == "customer_a@example.com"
    assert cust_a.is_active is True


# ==========================================
# 3. AUDIENCE SEPARATION REGRESSION MATRIX
# ==========================================

PORTAL_ROUTES = [
    ("GET", "/api/portal/dashboard"),
    ("GET", "/api/portal/purchases"),
    ("GET", "/api/portal/invoices"),
    ("GET", "/api/portal/payments"),
    ("GET", "/api/portal/emi"),
    ("GET", "/api/portal/profile"),
    ("PUT", "/api/portal/profile", {"name": "Test"}),
    ("GET", "/api/portal/warranties"),
    ("GET", "/api/portal/tickets"),
    ("GET", "/api/portal/notifications"),
]

STAFF_ROUTES = [
    ("GET", "/api/pos/products/search?q=tab"),
    ("GET", "/api/inventory/movements"),
    ("GET", "/api/hr/staff"),
    ("GET", "/api/finance/summary"),
    ("GET", "/api/reports/sales"),
    ("GET", "/api/support/warranties"),
    ("GET", "/api/support/tickets"),
    ("GET", "/api/notifications"),
]


@pytest.mark.parametrize("method,path,payload", [
    (m, p, data[0] if data else None)
    for m, p, *data in PORTAL_ROUTES
])
def test_portal_routes_reject_staff_jwt_with_403(client: TestClient, portal_setup, method, path, payload):
    """
    Every single portal route MUST reject a Staff JWT token with 403 Forbidden
    ('Token audience mismatch. Customer credentials required.').
    """
    headers = {"Authorization": f"Bearer {portal_setup['token_staff']}"}
    if method == "GET":
        resp = client.get(path, headers=headers)
    else:
        resp = client.put(path, headers=headers, json=payload or {})

    assert resp.status_code == 403, f"Staff token should be rejected with 403 on {method} {path}"
    err_msg = (resp.json().get("detail") or resp.json().get("error", {}).get("message", "")).lower()
    assert "audience mismatch" in err_msg or "customer credentials required" in err_msg


@pytest.mark.parametrize("method,path,payload", [
    (m, p, data[0] if data else None)
    for m, p, *data in PORTAL_ROUTES
])
def test_portal_routes_reject_unauthenticated_with_401(client: TestClient, method, path, payload):
    """Portal routes require authentication (401)."""
    if method == "GET":
        resp = client.get(path)
    else:
        resp = client.put(path, json=payload or {})
    assert resp.status_code == 401


@pytest.mark.parametrize("method,path", STAFF_ROUTES)
def test_staff_routes_reject_customer_jwt_with_403(client: TestClient, portal_setup, method, path):
    """
    Staff routes MUST reject a Customer JWT token with 403 Forbidden
    ('Token audience mismatch. Staff credentials required.').
    """
    headers = {"Authorization": f"Bearer {portal_setup['token_a']}"}
    if method == "GET":
        resp = client.get(path, headers=headers)
    else:
        resp = client.post(path, headers=headers, json={})

    assert resp.status_code == 403, f"Customer token should be rejected with 403 on {method} {path}"
    err_msg = (resp.json().get("detail") or resp.json().get("error", {}).get("message", "")).lower()
    assert "audience mismatch" in err_msg or "staff credentials required" in err_msg
