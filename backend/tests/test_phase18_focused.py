import datetime as dt
from decimal import Decimal
import io
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.money import quantize_money
from app.core.security import create_access_token, hash_password
from app.modules.auth.models import Customer, StaffRole, StaffUser
from app.modules.catalog.models import Brand, Category, Product
from app.modules.emi.models import EmiInstallment, EmiPlan, EmiPlanStatus
from app.modules.finance.models import Expense, ExpenseCategory, ExpenseSource
from app.modules.inventory.models import MovementType, StockMovement
from app.modules.invoicing.models import Invoice, InvoiceItem
from app.modules.invoicing.pdf import generate_invoice_pdf
from app.modules.notifications.models import Notification
from app.modules.sales.models import Sale, SaleItem
from app.modules.support.models import SupportTicket, TicketPriority, TicketStatus, Warranty


@pytest.fixture
def test_setup(db_session: Session):
    """Sets up two customers, two staff members, a category, brand, and product."""
    cust_a = Customer(
        name="Customer Alpha",
        email="cust.alpha@example.com",
        phone="+919876543210",
        password_hash=hash_password("PassAlpha123!"),
        is_active=True,
    )
    cust_b = Customer(
        name="Customer Beta",
        email="cust.beta@example.com",
        phone="+919876543211",
        password_hash=hash_password("PassBeta123!"),
        is_active=True,
    )
    staff_manager = StaffUser(
        full_name="Manager Mary",
        email="manager.mary@store.local",
        role=StaffRole.MANAGER,
        password_hash=hash_password("ManagerPass123!"),
        is_active=True,
    )
    staff_clerk = StaffUser(
        full_name="Clerk Carl",
        email="clerk.carl@store.local",
        role=StaffRole.STAFF,
        password_hash=hash_password("ClerkPass123!"),
        is_active=True,
    )
    cat = Category(name="Electronics")
    brand = Brand(name="Acme")
    db_session.add_all([cust_a, cust_b, staff_manager, staff_clerk, cat, brand])
    db_session.flush()

    prod = Product(
        name="Smartphone X",
        sku="PH-SMP-001",
        category_id=cat.id,
        brand_id=brand.id,
        selling_price=Decimal("15000.00"),
        purchase_price=Decimal("12000.00"),
        current_stock=Decimal("10.000"),
        min_stock=Decimal("2.000"),
    )
    db_session.add(prod)
    db_session.commit()

    tok_a = create_access_token(str(cust_a.id), audience="customer")
    tok_b = create_access_token(str(cust_b.id), audience="customer")
    tok_mgr = create_access_token(str(staff_manager.id), audience="staff", role="Manager")
    tok_clerk = create_access_token(str(staff_clerk.id), audience="staff", role="Staff")

    return {
        "cust_a": cust_a,
        "cust_b": cust_b,
        "staff_manager": staff_manager,
        "staff_clerk": staff_clerk,
        "cat": cat,
        "brand": brand,
        "prod": prod,
        "headers_a": {"Authorization": f"Bearer {tok_a}"},
        "headers_b": {"Authorization": f"Bearer {tok_b}"},
        "headers_mgr": {"Authorization": f"Bearer {tok_mgr}"},
        "headers_clerk": {"Authorization": f"Bearer {tok_clerk}"},
    }


# ==========================================
# 1. CROSS-CUSTOMER ISOLATION & BOLA PREVENTION
# ==========================================

def test_customer_isolation_support_ticket(client: TestClient, db_session: Session, test_setup: dict):
    """Verifies customer B cannot view or comment on customer A's ticket (403 Forbidden)."""
    ticket_a = SupportTicket(
        ticket_number="TKT-ISO-001",
        customer_id=test_setup["cust_a"].id,
        subject="Alpha Ticket",
        description="Private problem",
        status=TicketStatus.OPEN,
        priority=TicketPriority.MEDIUM,
    )
    db_session.add(ticket_a)
    db_session.commit()

    # Customer A can view
    res_a = client.get(f"/api/portal/tickets/{ticket_a.id}", headers=test_setup["headers_a"])
    assert res_a.status_code == 200
    assert res_a.json()["subject"] == "Alpha Ticket"

    # Customer B must receive 403 Forbidden
    res_b = client.get(f"/api/portal/tickets/{ticket_a.id}", headers=test_setup["headers_b"])
    assert res_b.status_code == 403

    # Customer B cannot add a comment to Customer A's ticket
    comment_payload = {"body": "Malicious intrusive comment"}
    res_comment_b = client.post(
        f"/api/portal/tickets/{ticket_a.id}/comments",
        json=comment_payload,
        headers=test_setup["headers_b"],
    )
    assert res_comment_b.status_code == 403


def test_customer_isolation_warranties(client: TestClient, db_session: Session, test_setup: dict):
    """Verifies customer B cannot access customer A's warranty (403 Forbidden)."""
    warranty_a = Warranty(
        product_id=test_setup["prod"].id,
        customer_id=test_setup["cust_a"].id,
        serial_number="SN-ALPHA-99",
        purchase_date=dt.date(2026, 1, 1),
        start_date=dt.date(2026, 1, 1),
        end_date=dt.date(2027, 1, 1),
    )
    db_session.add(warranty_a)
    db_session.commit()

    # Customer A can view
    res_a = client.get(f"/api/portal/warranties/{warranty_a.id}", headers=test_setup["headers_a"])
    assert res_a.status_code == 200

    # Customer B receives 403 Forbidden
    res_b = client.get(f"/api/portal/warranties/{warranty_a.id}", headers=test_setup["headers_b"])
    assert res_b.status_code == 403


def test_customer_isolation_invoices_and_pdf(client: TestClient, db_session: Session, test_setup: dict):
    """Verifies customer B cannot view or download customer A's invoice PDF."""
    invoice_a = Invoice(
        invoice_number="INV-2026-27-8888",
        financial_year="2026-27",
        invoice_date=dt.date(2026, 9, 1),
        staff_id=test_setup["staff_manager"].id,
        customer_id=test_setup["cust_a"].id,
        seller_name="Test Shop",
        seller_gstin="27AAAAA0000A1Z5",
        seller_state="Maharashtra",
        buyer_name=test_setup["cust_a"].name,
        buyer_state="Maharashtra",
        place_of_supply="Maharashtra",
        is_inter_state=False,
        subtotal=Decimal("15000.00"),
        cgst_amount=Decimal("1350.00"),
        sgst_amount=Decimal("1350.00"),
        igst_amount=Decimal("0.00"),
        total_tax=Decimal("2700.00"),
        grand_total=Decimal("17700.00"),
        payment_status="unpaid",
        is_cancelled=False,
    )
    db_session.add(invoice_a)
    db_session.commit()

    # Customer A can view details and download PDF
    res_a = client.get(f"/api/portal/invoices/{invoice_a.id}", headers=test_setup["headers_a"])
    assert res_a.status_code == 200
    res_pdf_a = client.get(f"/api/portal/invoices/{invoice_a.id}/pdf", headers=test_setup["headers_a"])
    assert res_pdf_a.status_code == 200
    assert res_pdf_a.headers["content-type"] == "application/pdf"
    assert res_pdf_a.content.startswith(b"%PDF")

    # Customer B receives 403 Forbidden on both
    res_b = client.get(f"/api/portal/invoices/{invoice_a.id}", headers=test_setup["headers_b"])
    assert res_b.status_code == 403
    res_pdf_b = client.get(f"/api/portal/invoices/{invoice_a.id}/pdf", headers=test_setup["headers_b"])
    assert res_pdf_b.status_code == 403


# ==========================================
# 2. INVENTORY & NUMERIC BOUNDARIES
# ==========================================

def test_inventory_numeric_validation(client: TestClient, test_setup: dict):
    """Verifies rejection of negative stock inputs and invalid operations."""
    prod = test_setup["prod"]

    # Reject non-numeric / negative quantity stock-in
    res_neg = client.post(
        "/api/inventory/stock-in",
        json={"product_id": str(prod.id), "quantity": "-5.000", "notes": "negative"},
        headers=test_setup["headers_mgr"],
    )
    assert res_neg.status_code in (400, 422)

    # Reject stock-out exceeding current balance
    res_over = client.post(
        "/api/inventory/stock-out",
        json={"product_id": str(prod.id), "quantity": "50.000", "notes": "excessive out"},
        headers=test_setup["headers_mgr"],
    )
    assert res_over.status_code == 400


# ==========================================
# 3. FINANCE & DECIMAL INTEGRITY
# ==========================================

def test_finance_negative_expense_rejection(client: TestClient, test_setup: dict):
    """Verifies that negative expense amounts are strictly rejected."""
    payload = {
        "category": "utilities",
        "amount": "-500.00",
        "description": "Negative refund hack",
        "date": "2026-09-23",
    }
    res = client.post("/api/finance/expenses", json=payload, headers=test_setup["headers_mgr"])
    assert res.status_code in (400, 422)


def test_finance_zero_expense_rejection(client: TestClient, test_setup: dict):
    """Verifies that 0.00 expense amount is rejected (expenses must be > 0.00)."""
    payload = {
        "category": "rent",
        "amount": "0.00",
        "description": "Zero expense",
        "date": "2026-09-23",
    }
    res = client.post("/api/finance/expenses", json=payload, headers=test_setup["headers_mgr"])
    assert res.status_code in (400, 422)


# ==========================================
# 4. EMI CUSTOMER ISOLATION
# ==========================================

def test_customer_isolation_emi_plans(client: TestClient, db_session: Session, test_setup: dict):
    """Verifies customer B cannot see customer A's EMI plan in portal emi query."""
    plan = EmiPlan(
        customer_id=test_setup["cust_a"].id,
        created_by=test_setup["staff_manager"].id,
        principal=Decimal("10000.00"),
        down_payment=Decimal("1000.00"),
        number_of_installments=2,
        total_financed=Decimal("10000.00"),
        installment_amount=Decimal("5000.00"),
        start_date=dt.date(2026, 9, 1),
        status=EmiPlanStatus.ACTIVE.value,
    )
    db_session.add(plan)
    db_session.commit()

    # Customer A can view own plan
    res_a = client.get("/api/portal/emi", headers=test_setup["headers_a"])
    assert res_a.status_code == 200
    plan_ids_a = [p["id"] for p in res_a.json()]
    assert str(plan.id) in plan_ids_a

    # Customer B cannot see Customer A's plan
    res_b = client.get("/api/portal/emi", headers=test_setup["headers_b"])
    assert res_b.status_code == 200
    plan_ids_b = [p["id"] for p in res_b.json()]
    assert str(plan.id) not in plan_ids_b


# ==========================================
# 5. NOTIFICATION PERMISSIONS & BEHAVIOR
# ==========================================

def test_notifications_isolation_and_read(client: TestClient, db_session: Session, test_setup: dict):
    """Verifies user can only mark their own notifications as read."""
    notif_a = Notification(
        recipient_id=test_setup["cust_a"].id,
        recipient_type="customer",
        title="Welcome Alpha",
        message="Welcome to the portal",
        type="system",
    )
    db_session.add(notif_a)
    db_session.commit()

    # Customer B cannot mark Customer A's notification as read (404/403)
    res_b = client.post(
        f"/api/portal/notifications/{notif_a.id}/read",
        headers=test_setup["headers_b"],
    )
    assert res_b.status_code in (403, 404)

    # Customer A can mark it read
    res_a = client.post(
        f"/api/portal/notifications/{notif_a.id}/read",
        headers=test_setup["headers_a"],
    )
    assert res_a.status_code == 200
    assert res_a.json()["read_at"] is not None


# ==========================================
# 6. AUTOMATION HEADERS & IDEMPOTENCY
# ==========================================

def test_automation_missing_secret_rejected(client: TestClient):
    """Verifies anonymous access to automation jobs is strictly 401 Unauthorized."""
    res = client.post("/api/automation/jobs/low-stock")
    assert res.status_code == 401

    # Malformed secret rejected
    res_bad = client.post("/api/automation/jobs/low-stock", headers={"X-Automation-Key": "wrong-key"})
    assert res_bad.status_code == 401


# ==========================================
# 7. STAFF RBAC ROLE BOUNDARY ENFORCEMENT
# ==========================================

def test_rbac_boundary_clerk_vs_manager(client: TestClient, test_setup: dict):
    """Verifies regular staff cannot create brands (requires ADMIN or MANAGER)."""
    payload = {"name": f"Brand_{uuid.uuid4().hex[:6]}"}

    # Regular staff/clerk -> 403 Forbidden
    res_clerk = client.post("/api/catalog/brands", json=payload, headers=test_setup["headers_clerk"])
    assert res_clerk.status_code == 403

    # Manager -> 201 Created
    res_mgr = client.post("/api/catalog/brands", json=payload, headers=test_setup["headers_mgr"])
    assert res_mgr.status_code == 201


# ==========================================
# 8. POS / SALES EMPTY CART & ZERO ITEM REJECTION
# ==========================================

def test_pos_empty_cart_rejection(client: TestClient, test_setup: dict):
    """Verifies that submitting a POS sale with zero items is rejected."""
    payload = {
        "customer_id": str(test_setup["cust_a"].id),
        "items": [],
        "payment_method": "cash",
    }
    res = client.post("/api/pos/checkout", json=payload, headers=test_setup["headers_mgr"])
    assert res.status_code in (400, 422)

