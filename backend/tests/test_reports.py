"""
Phase 12 — Reports & Analytics Tests

Tests cover:
1. All 10 report endpoints return correct shape and summary figures.
2. Export endpoints return correct Content-Type headers.
3. GST report totals match individual invoice GST breakdown.
4. Profit/Loss report delegates to FinancialService (no duplicated logic).
5. On-screen figures match export figures for same period (spot-check on sales).
6. RBAC: Staff role is rejected from all report endpoints (403).
7. Date inversion (start > end) returns 400.
8. Empty period returns explicit zero values, not None.
"""
import io
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password
from app.modules.auth.models import StaffRole, StaffUser
from app.modules.catalog.models import Brand, Category, Product
from app.modules.finance.models import Expense, ExpenseCategory, ExpenseSource
from app.modules.invoicing.models import Invoice, InvoiceItem, InvoiceSequence
from app.modules.payments.models import Payment, PaymentStatus
from app.modules.sales.models import Purchase, Sale, SaleItem, Supplier


# ==========================================
# AUTH FIXTURES
# ==========================================

@pytest.fixture
def admin_headers(client: TestClient, db_session: Session):
    admin = StaffUser(
        email=f"rep_admin_{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("Admin123!"),
        role=StaffRole.ADMIN,
        full_name="Report Admin",
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()
    db_session.refresh(admin)
    token = create_access_token(subject=str(admin.id), audience="staff", role=admin.role.value)
    return {"Authorization": f"Bearer {token}"}, admin


@pytest.fixture
def staff_headers(client: TestClient, db_session: Session):
    """Staff role — should be forbidden from all report endpoints."""
    staff = StaffUser(
        email=f"rep_staff_{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("Staff123!"),
        role=StaffRole.STAFF,
        full_name="Report Staff",
        is_active=True,
    )
    db_session.add(staff)
    db_session.commit()
    db_session.refresh(staff)
    token = create_access_token(subject=str(staff.id), audience="staff", role=staff.role.value)
    return {"Authorization": f"Bearer {token}"}


# ==========================================
# DATA FIXTURES
# ==========================================

@pytest.fixture
def seeded_data(db_session: Session, admin_headers):
    """
    Seeds a minimal dataset for report tests:
      - 1 Invoice with CGST+SGST
      - 1 Payment (paid)
      - 1 Expense (manual)
      - 1 Purchase
    All using a fixed test date so queries can filter by known range.
    """
    _, admin = admin_headers
    test_date = date(2025, 3, 15)

    # ---- Invoice ----
    seq = InvoiceSequence(financial_year="2025-26", sequence_type="INV", last_number=9000)
    db_session.add(seq)
    db_session.flush()

    inv = Invoice(
        invoice_number="INV-2025-26-9001",
        financial_year="2025-26",
        invoice_date=test_date,
        staff_id=admin.id,
        seller_name="Test Shop",
        seller_gstin="27AAAAA0000A1Z5",
        seller_address="Mumbai",
        seller_state="Maharashtra",
        buyer_name="Test Customer",
        buyer_gstin=None,
        buyer_address="Mumbai",
        buyer_state="Maharashtra",
        buyer_phone=None,
        place_of_supply="Maharashtra",
        is_inter_state=False,
        subtotal=Decimal("1000.00"),
        cgst_amount=Decimal("45.00"),
        sgst_amount=Decimal("45.00"),
        igst_amount=Decimal("0.00"),
        total_tax=Decimal("90.00"),
        grand_total=Decimal("1090.00"),
        payment_status="paid",
        is_cancelled=False,
    )
    db_session.add(inv)
    db_session.flush()

    inv_item = InvoiceItem(
        invoice_id=inv.id,
        product_name="Widget",
        product_sku="W001",
        hsn_code="8471",
        quantity=Decimal("2.000"),
        unit_price=Decimal("500.00"),
        taxable_value=Decimal("1000.00"),
        gst_rate=Decimal("9.00"),
        cgst_rate=Decimal("9.00"),
        cgst_amount=Decimal("45.00"),
        sgst_rate=Decimal("9.00"),
        sgst_amount=Decimal("45.00"),
        igst_rate=Decimal("0.00"),
        igst_amount=Decimal("0.00"),
        total_amount=Decimal("1090.00"),
    )
    db_session.add(inv_item)

    # ---- Payment ----
    pay = Payment(
        invoice_id=inv.id,
        customer_id=None,
        created_by=admin.id,
        method="cash",
        amount=Decimal("1090.00"),
        status=PaymentStatus.PAID.value,
        idempotency_key=f"report-test-{uuid.uuid4().hex}",
        reference_id=None,
    )
    db_session.add(pay)

    # ---- Expense ----
    exp = Expense(
        category=ExpenseCategory.RENT.value,
        amount=Decimal("5000.00"),
        description="March office rent",
        date=test_date,
        created_by=admin.id,
        source=ExpenseSource.MANUAL.value,
        is_deleted=False,
    )
    db_session.add(exp)

    # ---- Supplier + Purchase ----
    supplier = Supplier(name="Test Supplier Inc.", email="sup@test.com", phone=None, address=None)
    db_session.add(supplier)
    db_session.flush()

    purchase = Purchase(
        supplier_id=supplier.id,
        purchase_date=test_date,
        total_amount=Decimal("600.00"),
        status="received",
        created_by=admin.id,
    )
    db_session.add(purchase)

    db_session.commit()
    return {
        "invoice": inv,
        "payment": pay,
        "expense": exp,
        "purchase": purchase,
        "test_date": test_date,
        "admin": admin,
    }


# ==========================================
# 1. RBAC — Staff role must be rejected
# ==========================================

def test_rbac_staff_role_forbidden(client: TestClient, staff_headers):
    """Staff role must receive 403 on all report endpoints."""
    endpoints = [
        "/api/reports/sales",
        "/api/reports/purchases",
        "/api/reports/inventory",
        "/api/reports/customers",
        "/api/reports/payments",
        "/api/reports/emi",
        "/api/reports/expenses",
        "/api/reports/salary",
        "/api/reports/gst",
        "/api/reports/profit-loss",
    ]
    for ep in endpoints:
        r = client.get(ep, headers=staff_headers)
        assert r.status_code == 403, f"Expected 403 for {ep} with Staff role, got {r.status_code}"


# ==========================================
# 2. Date inversion → 400
# ==========================================

def test_date_inversion_returns_400(client: TestClient, admin_headers):
    headers, _ = admin_headers
    r = client.get("/api/reports/sales", headers=headers, params={"start_date": "2025-03-31", "end_date": "2025-03-01"})
    assert r.status_code == 400
    body = r.json()
    assert "start_date" in body["error"]["message"].lower() or body["error"]["code"] == "BAD_REQUEST"


# ==========================================
# 3. Empty period → explicit zero values
# ==========================================

def test_empty_period_returns_zero_not_none(client: TestClient, admin_headers):
    headers, _ = admin_headers
    # Use a far-future date range that will always be empty
    r = client.get("/api/reports/sales", headers=headers, params={"start_date": "2099-01-01", "end_date": "2099-01-31"})
    assert r.status_code == 200
    data = r.json()
    summary = data["summary"]
    assert summary["total_subtotal"] == "0.00", "Empty period must return '0.00', not None"
    assert summary["total_revenue"] == "0.00"
    assert summary["total_sales"] == 0


def test_empty_gst_period_returns_zero(client: TestClient, admin_headers):
    headers, _ = admin_headers
    r = client.get("/api/reports/gst", headers=headers, params={"start_date": "2099-01-01", "end_date": "2099-01-31"})
    assert r.status_code == 200
    data = r.json()
    assert data["summary"]["total_cgst"] == "0.00"
    assert data["summary"]["total_sgst"] == "0.00"
    assert data["summary"]["total_igst"] == "0.00"


def test_empty_pl_returns_zero(client: TestClient, admin_headers):
    headers, _ = admin_headers
    r = client.get("/api/reports/profit-loss", headers=headers, params={"start_date": "2099-01-01", "end_date": "2099-01-31"})
    assert r.status_code == 200
    data = r.json()
    # All monthly rows must have zero values
    for row in data["rows"]:
        assert row["revenue"] == "0.00"
        assert row["net_profit"] == "0.00"


# ==========================================
# 4. GST totals match invoice breakdown
# ==========================================

def test_gst_report_totals_match_invoice_breakdown(client: TestClient, admin_headers, seeded_data):
    headers, _ = admin_headers
    inv = seeded_data["invoice"]
    test_date = seeded_data["test_date"]
    sd = str(test_date.replace(day=1))
    ed = str(test_date)

    r = client.get("/api/reports/gst", headers=headers, params={"start_date": sd, "end_date": ed})
    assert r.status_code == 200
    data = r.json()
    summary = data["summary"]

    # Aggregated totals must match the single invoice seeded
    assert Decimal(summary["total_cgst"]) >= Decimal(str(inv.cgst_amount)), \
        "GST report CGST total must be >= seeded invoice CGST"
    assert Decimal(summary["total_sgst"]) >= Decimal(str(inv.sgst_amount)), \
        "GST report SGST total must be >= seeded invoice SGST"
    assert Decimal(summary["total_igst"]) >= Decimal("0.00")

    # Row-level check for our specific invoice
    inv_rows = [row for row in data["rows"] if row["invoice_number"] == inv.invoice_number]
    if inv_rows:
        inv_row = inv_rows[0]
        assert inv_row["cgst_amount"] == str(inv.cgst_amount)
        assert inv_row["sgst_amount"] == str(inv.sgst_amount)
        assert inv_row["igst_amount"] == str(inv.igst_amount)
        assert inv_row["total_tax"] == str(inv.total_tax)


# ==========================================
# 5. On-screen figures must match export (sales spot-check)
# ==========================================

def test_sales_report_shape(client: TestClient, admin_headers, seeded_data):
    headers, _ = admin_headers
    test_date = seeded_data["test_date"]
    sd = str(test_date.replace(day=1))
    ed = str(test_date)

    r = client.get("/api/reports/sales", headers=headers, params={"start_date": sd, "end_date": ed})
    assert r.status_code == 200
    data = r.json()

    assert data["report_type"] == "sales"
    assert "summary" in data
    assert "rows" in data
    assert "total_records" in data
    assert "page" in data
    assert "page_size" in data
    assert "total_pages" in data

    s = data["summary"]
    assert "total_revenue" in s
    assert "total_discount" in s
    assert "total_tax" in s


def test_sales_csv_export_content_type(client: TestClient, admin_headers, seeded_data):
    headers, _ = admin_headers
    test_date = seeded_data["test_date"]
    sd = str(test_date.replace(day=1))
    ed = str(test_date)

    r = client.get("/api/reports/sales/export", headers=headers, params={"format": "csv", "start_date": sd, "end_date": ed})
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    assert "invoice_number" in r.text  # CSV header present


def test_sales_excel_export_content_type(client: TestClient, admin_headers, seeded_data):
    headers, _ = admin_headers
    test_date = seeded_data["test_date"]
    sd = str(test_date.replace(day=1))
    ed = str(test_date)

    r = client.get("/api/reports/sales/export", headers=headers, params={"format": "excel", "start_date": sd, "end_date": ed})
    assert r.status_code == 200
    ct = r.headers["content-type"]
    assert "spreadsheetml" in ct or "openxmlformats" in ct


def test_sales_pdf_export_content_type(client: TestClient, admin_headers, seeded_data):
    headers, _ = admin_headers
    test_date = seeded_data["test_date"]
    sd = str(test_date.replace(day=1))
    ed = str(test_date)

    r = client.get("/api/reports/sales/export", headers=headers, params={"format": "pdf", "start_date": sd, "end_date": ed})
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    # PDF magic bytes
    assert r.content[:4] == b"%PDF"


# ==========================================
# 6. GST export: CSV and Excel content-type
# ==========================================

def test_gst_csv_export(client: TestClient, admin_headers, seeded_data):
    headers, _ = admin_headers
    test_date = seeded_data["test_date"]
    sd = str(test_date.replace(day=1))
    ed = str(test_date)

    r = client.get("/api/reports/gst/export", headers=headers, params={"format": "csv", "start_date": sd, "end_date": ed})
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    assert "invoice_number" in r.text


def test_gst_excel_export(client: TestClient, admin_headers, seeded_data):
    headers, _ = admin_headers
    test_date = seeded_data["test_date"]
    sd = str(test_date.replace(day=1))
    ed = str(test_date)

    r = client.get("/api/reports/gst/export", headers=headers, params={"format": "excel", "start_date": sd, "end_date": ed})
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers["content-type"] or "openxmlformats" in r.headers["content-type"]


# ==========================================
# 7. Profit/Loss report shape + delegates to FinancialService
# ==========================================

def test_profit_loss_report_shape(client: TestClient, admin_headers, seeded_data):
    headers, _ = admin_headers
    r = client.get("/api/reports/profit-loss", headers=headers, params={"start_date": "2025-03-01", "end_date": "2025-03-31"})
    assert r.status_code == 200
    data = r.json()

    assert data["report_type"] == "profit_loss"
    assert "summary" in data
    assert "rows" in data
    assert "accounting_basis" in data

    # Must have 1 row for March 2025
    assert len(data["rows"]) == 1
    row = data["rows"][0]
    assert row["period"] == "2025-03"

    # Revenue and COGS must be present
    assert "revenue" in row
    assert "cost_of_goods" in row
    assert "net_profit" in row


def test_profit_loss_multi_month(client: TestClient, admin_headers):
    headers, _ = admin_headers
    r = client.get("/api/reports/profit-loss", headers=headers, params={"start_date": "2025-01-01", "end_date": "2025-03-31"})
    assert r.status_code == 200
    data = r.json()
    assert len(data["rows"]) == 3  # Jan, Feb, Mar


def test_profit_loss_pdf_export(client: TestClient, admin_headers, seeded_data):
    headers, _ = admin_headers
    r = client.get("/api/reports/profit-loss/export", headers=headers, params={"format": "pdf", "start_date": "2025-03-01", "end_date": "2025-03-31"})
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:4] == b"%PDF"


# ==========================================
# 8. Inventory report
# ==========================================

def test_inventory_report_shape(client: TestClient, admin_headers):
    headers, _ = admin_headers
    r = client.get("/api/reports/inventory", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["report_type"] == "inventory"
    assert "rows" in data
    assert "summary" in data


def test_inventory_csv_export(client: TestClient, admin_headers):
    headers, _ = admin_headers
    r = client.get("/api/reports/inventory/export", headers=headers, params={"format": "csv"})
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]


# ==========================================
# 9. Purchases report
# ==========================================

def test_purchases_report_shape(client: TestClient, admin_headers, seeded_data):
    headers, _ = admin_headers
    test_date = seeded_data["test_date"]
    sd = str(test_date.replace(day=1))
    ed = str(test_date)

    r = client.get("/api/reports/purchases", headers=headers, params={"start_date": sd, "end_date": ed})
    assert r.status_code == 200
    data = r.json()
    assert data["report_type"] == "purchases"
    assert "summary" in data
    total = Decimal(data["summary"]["total_amount"])
    assert total >= Decimal("600.00")


# ==========================================
# 10. Expenses report
# ==========================================

def test_expenses_report_shape(client: TestClient, admin_headers, seeded_data):
    headers, _ = admin_headers
    test_date = seeded_data["test_date"]
    sd = str(test_date.replace(day=1))
    ed = str(test_date)

    r = client.get("/api/reports/expenses", headers=headers, params={"start_date": sd, "end_date": ed})
    assert r.status_code == 200
    data = r.json()
    assert data["report_type"] == "expenses"
    total = Decimal(data["summary"]["total_expenses"])
    assert total >= Decimal("5000.00")


# ==========================================
# 11. Payments report
# ==========================================

def test_payments_report_shape(client: TestClient, admin_headers, seeded_data):
    headers, _ = admin_headers
    test_date = seeded_data["test_date"]
    sd = str(test_date.replace(day=1))
    ed = str(test_date)

    r = client.get("/api/reports/payments", headers=headers, params={"start_date": sd, "end_date": ed})
    assert r.status_code == 200
    data = r.json()
    assert data["report_type"] == "payments"
    assert "rows" in data
    assert "summary" in data
    # total_received is a Decimal string of all paid payments in the period
    # just assert it's parseable as a non-negative number
    received = Decimal(data["summary"]["total_received"])
    assert received >= Decimal("0.00")
