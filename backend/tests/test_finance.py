import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password
from app.modules.auth.models import Customer, StaffRole, StaffUser
from app.modules.emi.models import EmiInstallment, EmiInstallmentStatus, EmiPlan, EmiPlanStatus
from app.modules.finance.models import Expense, ExpenseCategory, ExpenseSource
from app.modules.invoicing.models import Invoice
from app.modules.payments.models import Payment, PaymentMethod, PaymentStatus
from app.modules.sales.models import Purchase, Supplier


@pytest.fixture
def auth_finance_admin(client: TestClient, db_session: Session):
    admin = StaffUser(
        email=f"fin_admin_{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("AdminPass123!"),
        role=StaffRole.ADMIN,
        full_name="Finance Admin",
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()
    db_session.refresh(admin)

    token = create_access_token(subject=str(admin.id), audience="staff", role=admin.role.value)
    return {"Authorization": f"Bearer {token}"}, admin


def test_system_salary_expense_immutable_and_cannot_be_deleted(client: TestClient, auth_finance_admin, db_session: Session):
    """
    Assert that system-generated salary expenses (from Phase 10) are strictly immutable:
    - Cannot be edited manually (PUT rejects with 400 Bad Request)
    - Cannot be deleted manually (DELETE rejects with 400 Bad Request)
    """
    headers, admin = auth_finance_admin

    salary_exp = Expense(
        category="Salary",
        amount=Decimal("45000.00"),
        description="Salary payout for Alice - Period: 2026-08 (Record: dummy-id)",
        date=date(2026, 8, 31),
        created_by=admin.id,
        source=ExpenseSource.SYSTEM_SALARY.value,
        reference_id="salary-rec-123",
        is_deleted=False,
    )
    db_session.add(salary_exp)
    db_session.commit()
    db_session.refresh(salary_exp)

    # 1. Attempt manual edit -> 400 Bad Request
    r_edit = client.put(
        f"/api/finance/expenses/{salary_exp.id}",
        headers=headers,
        json={"amount": "50000.00"},
    )
    assert r_edit.status_code == 400
    assert "immutable" in r_edit.json()["error"]["message"]

    # 2. Attempt manual delete -> 400 Bad Request
    r_del = client.delete(
        f"/api/finance/expenses/{salary_exp.id}",
        headers=headers,
    )
    assert r_del.status_code == 400
    assert "immutable" in r_del.json()["error"]["message"]


def test_manual_expense_crud_and_soft_delete_audit(client: TestClient, auth_finance_admin, db_session: Session):
    """
    Assert manual expenses can be created, updated, and soft-deleted with full audit trail preserved.
    """
    headers, admin = auth_finance_admin

    # 1. Create manual expense
    create_payload = {
        "category": "Rent",
        "amount": "25000.00",
        "description": "Warehouse monthly lease",
        "date": "2026-08-05",
    }
    r_create = client.post("/api/finance/expenses", headers=headers, json=create_payload)
    assert r_create.status_code == 201
    created_exp = r_create.json()
    exp_id = created_exp["id"]
    assert created_exp["source"] == "manual"
    assert created_exp["amount"] == "25000.00"

    # 2. Edit manual expense
    r_update = client.put(
        f"/api/finance/expenses/{exp_id}",
        headers=headers,
        json={"amount": "27000.00", "description": "Warehouse lease + maintenance"},
    )
    assert r_update.status_code == 200
    assert r_update.json()["amount"] == "27000.00"

    # 3. Soft-delete manual expense
    r_del = client.delete(f"/api/finance/expenses/{exp_id}", headers=headers)
    assert r_del.status_code == 200
    assert r_del.json()["is_deleted"] is True

    # Verify soft-deleted record does NOT appear in standard list
    r_list = client.get("/api/finance/expenses", headers=headers)
    assert r_list.status_code == 200
    active_ids = [e["id"] for e in r_list.json()["items"]]
    assert exp_id not in active_ids

    # Verify soft-deleted record is preserved in DB with audit timestamps
    db_exp = db_session.get(Expense, uuid.UUID(exp_id))
    assert db_exp.is_deleted is True
    assert db_exp.deleted_at is not None
    assert db_exp.deleted_by == admin.id


def test_empty_period_returns_explicit_zeros(client: TestClient, auth_finance_admin):
    """
    Assert that querying an empty period with no transactions returns explicit zeros,
    never null or fabricated figures.
    """
    headers, _ = auth_finance_admin

    # Query distant period with 0 data
    r = client.get("/api/finance/summary?period=2024-01", headers=headers)
    assert r.status_code == 200
    summary = r.json()

    assert summary["period"] == "2024-01"
    assert summary["revenue"] == "0.00"
    assert summary["invoiced_revenue"] == "0.00"
    assert summary["cost_of_goods"] == "0.00"
    assert summary["expenses"] == "0.00"
    assert summary["gross_profit"] == "0.00"
    assert summary["net_profit"] == "0.00"
    assert summary["expenses_breakdown"]["Rent"] == "0.00"
    assert summary["expenses_breakdown"]["Salary"] == "0.00"


def test_financial_summary_matches_hand_calculated_scenario(client: TestClient, auth_finance_admin, db_session: Session):
    """
    Construct a complete scenario for period 2026-08 and assert that summary figures
    match hand-calculated expected values exactly to the paisa:

    - Invoice 1: grand_total = 10,000.00 (invoice_date: 2026-08-10)
    - Payment 1 (cash received): 6,000.00 (created_at: 2026-08-10) -> Invoice remaining = 4,000.00
    - EMI Plan 1: total_financed = 12,000.00 across 4 installments of 3,000.00
      Installment 1 paid (3,000.00). Unpaid installments = 9,000.00.
    - Supplier Purchase: 5,000.00 (purchase_date: 2026-08-12)
    - Manual Expense (Utilities): 2,000.00 (date: 2026-08-15)
    - System Salary Expense: 3,000.00 (date: 2026-08-28)

    Hand-verified expectations:
    - Primary Revenue (Cash): 6,000.00
    - Invoiced Revenue (Accrual): 10,000.00
    - Cost of Goods: 5,000.00
    - Total Expenses: 5,000.00 (2,000 Utilities + 3,000 Salary)
    - Gross Profit: 6,000.00 - 5,000.00 = 1,000.00
    - Net Profit: 1,000.00 - 5,000.00 = -4,000.00
    - Outstanding Invoice Receivables: 4,000.00
    - EMI Receivables: 9,000.00
    - Total Receivables: 13,000.00
    """
    headers, admin = auth_finance_admin
    target_period = "2026-08"

    # 1. Customer
    cust = Customer(
        name="Fin Customer",
        email=f"cust_fin_{uuid.uuid4().hex[:6]}@example.com",
        password_hash=hash_password("Pass123!"),
        is_active=True,
    )
    db_session.add(cust)
    db_session.flush()

    # 2. Invoice (10,000.00 on 2026-08-10)
    inv = Invoice(
        invoice_number=f"INV/2026-27/{uuid.uuid4().hex[:6].upper()}",
        financial_year="2026-27",
        customer_id=cust.id,
        staff_id=admin.id,
        invoice_date=date(2026, 8, 10),
        seller_name="Test Store",
        seller_gstin="27ABCDE1234F1Z5",
        seller_state="Maharashtra",
        place_of_supply="Maharashtra",
        buyer_name=cust.name,
        buyer_state="Maharashtra",
        subtotal=Decimal("8474.58"),
        cgst_amount=Decimal("762.71"),
        sgst_amount=Decimal("762.71"),
        igst_amount=Decimal("0.00"),
        total_tax=Decimal("1525.42"),
        grand_total=Decimal("10000.00"),
        payment_status="partially_paid",
        is_cancelled=False,
    )
    db_session.add(inv)
    db_session.flush()

    # 3. Payment (6,000.00 on 2026-08-10 in UTC)
    pay = Payment(
        invoice_id=inv.id,
        customer_id=cust.id,
        created_by=admin.id,
        method=PaymentMethod.UPI.value,
        amount=Decimal("6000.00"),
        status=PaymentStatus.PAID.value,
        idempotency_key=f"pay-fin-{uuid.uuid4().hex}",
        created_at=datetime(2026, 8, 10, 14, 0, tzinfo=timezone.utc),
    )
    db_session.add(pay)

    # 4. Supplier & Purchase (5,000.00 on 2026-08-12)
    supplier = Supplier(name=f"Supplier {uuid.uuid4().hex[:4]}")
    db_session.add(supplier)
    db_session.flush()

    purchase = Purchase(
        supplier_id=supplier.id,
        purchase_date=date(2026, 8, 12),
        total_amount=Decimal("5000.00"),
        status="completed",
        created_by=admin.id,
    )
    db_session.add(purchase)

    # 5. Expenses: Manual Utilities (2,000.00) & System Salary (3,000.00)
    manual_exp = Expense(
        category=ExpenseCategory.UTILITIES.value,
        amount=Decimal("2000.00"),
        description="Electricity bill",
        date=date(2026, 8, 15),
        created_by=admin.id,
        source=ExpenseSource.MANUAL.value,
        is_deleted=False,
    )
    salary_exp = Expense(
        category=ExpenseCategory.SALARY.value,
        amount=Decimal("3000.00"),
        description="Salary payout for employee",
        date=date(2026, 8, 28),
        created_by=admin.id,
        source=ExpenseSource.SYSTEM_SALARY.value,
        reference_id=f"sal-{uuid.uuid4().hex}",
        is_deleted=False,
    )
    db_session.add_all([manual_exp, salary_exp])

    # 6. EMI Plan with 9,000.00 unpaid receivables
    emi_plan = EmiPlan(
        customer_id=cust.id,
        created_by=admin.id,
        principal=Decimal("12000.00"),
        down_payment=Decimal("0.00"),
        number_of_installments=4,
        total_financed=Decimal("12000.00"),
        installment_amount=Decimal("3000.00"),
        start_date=date(2026, 8, 1),
        status=EmiPlanStatus.ACTIVE.value,
    )
    db_session.add(emi_plan)
    db_session.flush()

    # Installment 1: Paid (3,000.00)
    inst1 = EmiInstallment(
        emi_plan_id=emi_plan.id,
        installment_number=1,
        due_date=date(2026, 8, 1),
        amount_due=Decimal("3000.00"),
        amount_paid=Decimal("3000.00"),
        status=EmiInstallmentStatus.PAID.value,
    )
    # Installments 2, 3, 4: Unpaid (3,000 each = 9,000 unpaid)
    inst2 = EmiInstallment(
        emi_plan_id=emi_plan.id,
        installment_number=2,
        due_date=date(2026, 9, 1),
        amount_due=Decimal("3000.00"),
        amount_paid=Decimal("0.00"),
        status=EmiInstallmentStatus.PENDING.value,
    )
    inst3 = EmiInstallment(
        emi_plan_id=emi_plan.id,
        installment_number=3,
        due_date=date(2026, 10, 1),
        amount_due=Decimal("3000.00"),
        amount_paid=Decimal("0.00"),
        status=EmiInstallmentStatus.PENDING.value,
    )
    inst4 = EmiInstallment(
        emi_plan_id=emi_plan.id,
        installment_number=4,
        due_date=date(2026, 11, 1),
        amount_due=Decimal("3000.00"),
        amount_paid=Decimal("0.00"),
        status=EmiInstallmentStatus.PENDING.value,
    )
    db_session.add_all([inst1, inst2, inst3, inst4])
    db_session.commit()

    # Query summary for 2026-08
    res = client.get(f"/api/finance/summary?period={target_period}", headers=headers)
    assert res.status_code == 200
    data = res.json()

    # Assert all hand-verified figures
    assert data["period"] == "2026-08"
    assert data["revenue"] == "6000.00"
    assert data["invoiced_revenue"] == "10000.00"
    assert data["cost_of_goods"] == "5000.00"
    assert data["expenses"] == "5000.00"
    assert data["expenses_breakdown"]["Utilities"] == "2000.00"
    assert data["expenses_breakdown"]["Salary"] == "3000.00"
    assert data["gross_profit"] == "1000.00"
    assert data["net_profit"] == "-4000.00"
    assert data["outstanding_receivables"] == "4000.00"
    assert data["emi_receivables"] == "9000.00"
    assert data["total_receivables"] == "13000.00"
