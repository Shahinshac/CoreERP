import uuid
from datetime import date
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient

from app.modules.auth.models import StaffRole, StaffUser
from app.modules.emi.schedule import compute_emi_schedule, evaluate_installment_status, evaluate_plan_status


@pytest.fixture
def auth_staff_admin(client: TestClient, db_session):
    from app.core.security import create_access_token, hash_password

    staff = StaffUser(
        email=f"admin_emi_{uuid.uuid4().hex[:6]}@test.com",
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
        email=f"cashier_emi_{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("CashierPass123!"),
        role=StaffRole.STAFF,
        is_active=True,
    )
    db_session.add(staff)
    db_session.commit()
    db_session.refresh(staff)

    token = create_access_token(subject=str(staff.id), audience="staff", role=staff.role.value)
    return {"Authorization": f"Bearer {token}"}, staff


def test_exact_rounding_remainder_allocation():
    """
    Test that installment amounts sum EXACTLY to financed principal (principal - down_payment),
    properly adjusting the final installment with zero paise lost/gained.
    """
    # Case 1: 10,000 / 3 = 3333.33 + 3333.33 + 3333.34 = 10,000.00
    schedule1 = compute_emi_schedule(
        principal=Decimal("10000.00"),
        down_payment=Decimal("0.00"),
        number_of_installments=3,
    )
    assert len(schedule1["installments"]) == 3
    assert schedule1["installments"][0]["amount_due"] == Decimal("3333.33")
    assert schedule1["installments"][1]["amount_due"] == Decimal("3333.33")
    assert schedule1["installments"][2]["amount_due"] == Decimal("3333.34")
    assert sum(i["amount_due"] for i in schedule1["installments"]) == Decimal("10000.00")

    # Case 2: 1,000 with 100 down payment = 900 financed across 7 installments
    # 900 / 7 = 128.57 base; 128.57 * 6 = 771.42; final = 900 - 771.42 = 128.58
    schedule2 = compute_emi_schedule(
        principal=Decimal("1000.00"),
        down_payment=Decimal("100.00"),
        number_of_installments=7,
    )
    assert len(schedule2["installments"]) == 7
    for i in range(6):
        assert schedule2["installments"][i]["amount_due"] == Decimal("128.57")
    assert schedule2["installments"][6]["amount_due"] == Decimal("128.58")
    assert sum(i["amount_due"] for i in schedule2["installments"]) == Decimal("900.00")

    # Case 3: Flat simple interest support (12% per annum on 10,000 over 12 months = 1,200 interest -> 11,200 total)
    schedule3 = compute_emi_schedule(
        principal=Decimal("10000.00"),
        down_payment=Decimal("0.00"),
        number_of_installments=12,
        interest_rate=Decimal("12.00"),
    )
    assert schedule3["interest_amount"] == Decimal("1200.00")
    assert schedule3["total_financed"] == Decimal("11200.00")
    assert sum(i["amount_due"] for i in schedule3["installments"]) == Decimal("11200.00")


def make_customer(db_session, name="EMI Customer"):
    from app.core.security import hash_password
    from app.modules.auth.models import Customer
    cust = Customer(
        name=name,
        email=f"cust_{uuid.uuid4().hex[:6]}@example.com",
        password_hash=hash_password("CustomerPass123!"),
        phone="9876500111",
        is_active=True,
    )
    db_session.add(cust)
    db_session.commit()
    db_session.refresh(cust)
    return cust


def test_emi_plan_creation_and_preview(client: TestClient, db_session, auth_staff_admin):
    """
    Test preview endpoint and persistent creation of an EMI plan with schedule generation.
    """
    headers, _ = auth_staff_admin

    # 1. Preview
    preview_res = client.post(
        "/api/emi/plans/preview",
        headers=headers,
        json={
            "principal": "15000.00",
            "down_payment": "3000.00",
            "number_of_installments": 6,
        },
    )
    assert preview_res.status_code == 200
    pdata = preview_res.json()
    assert pdata["financed_principal"] == "12000.00"
    assert pdata["total_financed"] == "12000.00"
    assert len(pdata["installments"]) == 6
    assert pdata["installment_amount"] == "2000.00"

    # 2. Create customer for plan
    cust = make_customer(db_session, "EMI Customer One")
    customer_id = str(cust.id)

    # 3. Create plan
    plan_res = client.post(
        "/api/emi/plans",
        headers=headers,
        json={
            "customer_id": customer_id,
            "principal": "15000.00",
            "down_payment": "3000.00",
            "number_of_installments": 6,
            "notes": "Purchased smartphone with 6-month No-Cost EMI",
        },
    )
    assert plan_res.status_code == 201
    plan = plan_res.json()
    assert plan["total_financed"] == "12000.00"
    assert plan["remaining_balance"] == "12000.00"
    assert plan["status"] == "active"
    assert len(plan["installments"]) == 6
    assert plan["installments"][0]["amount_due"] == "2000.00"
    assert plan["installments"][0]["status"] == "pending"


def test_waterfall_cascading_overpayment_and_plan_completion(client: TestClient, db_session, auth_staff_admin):
    """
    Test that paying more than an installment's due amount automatically cascades to subsequent installments,
    and fully paying all installments automatically transitions plan to 'completed'.
    """
    headers, _ = auth_staff_admin

    # 1. Create customer & 3-month plan (3,000 total -> 1,000 / month)
    cust = make_customer(db_session, "Waterfall Customer")
    customer_id = str(cust.id)

    plan_res = client.post(
        "/api/emi/plans",
        headers=headers,
        json={
            "customer_id": customer_id,
            "principal": "3000.00",
            "down_payment": "0.00",
            "number_of_installments": 3,
        },
    )
    assert plan_res.status_code == 201
    plan_id = plan_res.json()["id"]

    # 2. Pay ₹1,500 targeting installment 1
    # Should pay installment 1 completely (1,000) and cascade 500 to installment 2 (partial)
    pay1_res = client.post(
        f"/api/emi/plans/{plan_id}/installments/1/pay",
        headers=headers,
        json={
            "amount": "1500.00",
            "method": "emi",
            "idempotency_key": f"pay1_{uuid.uuid4().hex}",
            "reference_id": "UPI-CASCADE-1",
        },
    )
    assert pay1_res.status_code == 200
    plan_after_pay1 = pay1_res.json()
    assert plan_after_pay1["total_paid"] == "1500.00"
    assert plan_after_pay1["remaining_balance"] == "1500.00"
    assert plan_after_pay1["status"] == "active"

    insts = plan_after_pay1["installments"]
    assert insts[0]["status"] == "paid"
    assert insts[0]["amount_paid"] == "1000.00"
    assert insts[1]["status"] == "partial"
    assert insts[1]["amount_paid"] == "500.00"
    assert insts[2]["status"] == "pending"
    assert insts[2]["amount_paid"] == "0.00"

    # 3. Pay remaining ₹1,500 without targeting (auto waterfall)
    # Should fill installment 2 (500 needed) and fill installment 3 (1,000 needed), completing the plan!
    pay2_res = client.post(
        f"/api/emi/plans/{plan_id}/pay",
        headers=headers,
        json={
            "amount": "1500.00",
            "method": "emi",
            "idempotency_key": f"pay2_{uuid.uuid4().hex}",
            "reference_id": "UPI-CASCADE-2",
        },
    )
    assert pay2_res.status_code == 200
    plan_after_pay2 = pay2_res.json()
    assert plan_after_pay2["total_paid"] == "3000.00"
    assert plan_after_pay2["remaining_balance"] == "0.00"
    assert plan_after_pay2["status"] == "completed"

    for inst in plan_after_pay2["installments"]:
        assert inst["status"] == "paid"

    # Verify payments ledger contains both payment entries
    assert len(plan_after_pay2["payments"]) == 2


def test_overpayment_beyond_plan_balance_rejected(client: TestClient, db_session, auth_staff_admin, auth_staff_cashier):
    """
    Test that paying more than the remaining balance of the whole plan is blocked (400),
    allow_overpayment is rejected for non-admin (403), and permitted for Admin.
    """
    admin_headers, _ = auth_staff_admin
    cashier_headers, _ = auth_staff_cashier

    # 1. Create customer & plan of 2,000
    cust = make_customer(db_session, "Overpay Customer")
    customer_id = str(cust.id)

    plan_res = client.post(
        "/api/emi/plans",
        headers=admin_headers,
        json={
            "customer_id": customer_id,
            "principal": "2000.00",
            "down_payment": "0.00",
            "number_of_installments": 2,
        },
    )
    assert plan_res.status_code == 201
    plan_id = plan_res.json()["id"]

    # 2. Non-admin tries to pay 2,500 without allow_overpayment -> 400 Bad Request
    res1 = client.post(
        f"/api/emi/plans/{plan_id}/pay",
        headers=cashier_headers,
        json={
            "amount": "2500.00",
            "method": "emi",
            "idempotency_key": f"ovp1_{uuid.uuid4().hex}",
            "allow_overpayment": False,
        },
    )
    assert res1.status_code == 400

    # 3. Non-admin tries with allow_overpayment=True -> 403 Forbidden
    res2 = client.post(
        f"/api/emi/plans/{plan_id}/pay",
        headers=cashier_headers,
        json={
            "amount": "2500.00",
            "method": "emi",
            "idempotency_key": f"ovp2_{uuid.uuid4().hex}",
            "allow_overpayment": True,
        },
    )
    assert res2.status_code == 403

    # 4. Admin tries with allow_overpayment=True -> 200 OK
    res3 = client.post(
        f"/api/emi/plans/{plan_id}/pay",
        headers=admin_headers,
        json={
            "amount": "2500.00",
            "method": "emi",
            "idempotency_key": f"ovp3_{uuid.uuid4().hex}",
            "allow_overpayment": True,
        },
    )
    assert res3.status_code == 200
    assert res3.json()["status"] == "completed"


def test_overdue_and_default_status_evaluation():
    """
    Test business rule:
    - overdue if as_of_date > due_date and unpaid (<= 90 days)
    - defaulted installment if as_of_date > due_date + 90 days
    - defaulted plan if >= 3 overdue installments or any installment > 90 days overdue
    """
    today = date(2026, 9, 22)
    due_15_days_ago = date(2026, 9, 7)
    due_100_days_ago = date(2026, 6, 14)
    due_future = date(2026, 10, 22)

    # 1. Installment status evaluation
    st_paid = evaluate_installment_status(due_15_days_ago, Decimal("1000.00"), Decimal("1000.00"), today)
    assert st_paid == "paid"

    st_overdue = evaluate_installment_status(due_15_days_ago, Decimal("1000.00"), Decimal("0.00"), today)
    assert st_overdue == "overdue"

    st_defaulted = evaluate_installment_status(due_100_days_ago, Decimal("1000.00"), Decimal("0.00"), today)
    assert st_defaulted == "defaulted"

    st_pending = evaluate_installment_status(due_future, Decimal("1000.00"), Decimal("0.00"), today)
    assert st_pending == "pending"

    # 2. Plan default rule evaluation
    class MockInst:
        def __init__(self, due, due_amt, paid_amt):
            self.due_date = due
            self.amount_due = due_amt
            self.amount_paid = paid_amt

    # Normal plan with 1 overdue (< 90 days): active
    p1 = [MockInst(due_15_days_ago, Decimal("1000"), Decimal("0")), MockInst(due_future, Decimal("1000"), Decimal("0"))]
    assert evaluate_plan_status(p1, "active", today) == "active"

    # Plan with 1 installment > 90 days: defaulted
    p2 = [MockInst(due_100_days_ago, Decimal("1000"), Decimal("0")), MockInst(due_future, Decimal("1000"), Decimal("0"))]
    assert evaluate_plan_status(p2, "active", today) == "defaulted"

    # Plan with 3 overdue installments (< 90 days): defaulted
    p3 = [
        MockInst(date(2026, 9, 1), Decimal("1000"), Decimal("0")),
        MockInst(date(2026, 9, 5), Decimal("1000"), Decimal("0")),
        MockInst(date(2026, 9, 10), Decimal("1000"), Decimal("0")),
    ]
    assert evaluate_plan_status(p3, "active", today) == "defaulted"


def test_idempotent_duplicate_payment_returns_original_state(client: TestClient, db_session, auth_staff_admin):
    """
    Test that submitting the same idempotency_key returns original state without creating duplicate payments.
    """
    headers, _ = auth_staff_admin

    cust = make_customer(db_session, "Idemp EMI Customer")
    customer_id = str(cust.id)

    plan_res = client.post(
        "/api/emi/plans",
        headers=headers,
        json={
            "customer_id": customer_id,
            "principal": "2000.00",
            "down_payment": "0.00",
            "number_of_installments": 2,
        },
    )
    assert plan_res.status_code == 201
    plan_id = plan_res.json()["id"]

    idemp_key = f"idemp_emi_{uuid.uuid4().hex}"

    # First call
    r1 = client.post(
        f"/api/emi/plans/{plan_id}/pay",
        headers=headers,
        json={
            "amount": "1000.00",
            "method": "emi",
            "idempotency_key": idemp_key,
        },
    )
    assert r1.status_code == 200
    assert r1.json()["total_paid"] == "1000.00"

    # Duplicate call with identical key
    r2 = client.post(
        f"/api/emi/plans/{plan_id}/pay",
        headers=headers,
        json={
            "amount": "1000.00",
            "method": "emi",
            "idempotency_key": idemp_key,
        },
    )
    assert r2.status_code == 200
    # Crucially, total_paid must NOT have incremented to 2,000!
    assert r2.json()["total_paid"] == "1000.00"
    assert len(r2.json()["payments"]) == 1


def test_emi_payment_via_general_payments_endpoint(client: TestClient, auth_staff_admin, db_session):
    """
    Assert that the third EMI payment entry point (POST /api/payments with emi_plan_id)
    shares the exact same internal write path and properly triggers waterfall cascading allocation.
    """
    headers, staff = auth_staff_admin
    customer = make_customer(db_session, "Payments Endpoint EMI Cust")

    plan_res = client.post(
        "/api/emi/plans",
        headers=headers,
        json={
            "customer_id": str(customer.id),
            "principal": "6000.00",
            "down_payment": "0.00",
            "number_of_installments": 3,
        },
    )
    assert plan_res.status_code == 201
    plan_id = plan_res.json()["id"]

    # Record 2000 payment via POST /api/payments with emi_plan_id
    idemp_key = f"idemp_pay_emi_{uuid.uuid4().hex}"
    pay_res = client.post(
        "/api/payments",
        headers=headers,
        json={
            "emi_plan_id": plan_id,
            "method": "emi",
            "amount": "2000.00",
            "idempotency_key": idemp_key,
            "notes": "Payment through central payments endpoint",
        },
    )
    assert pay_res.status_code == 201
    pay_data = pay_res.json()
    assert pay_data["emi_plan_id"] == plan_id
    assert pay_data["amount"] == "2000.00"

    # Verify plan state reflects the payment on installment 1
    fetch_plan = client.get(f"/api/emi/plans/{plan_id}", headers=headers)
    assert fetch_plan.status_code == 200
    plan_data = fetch_plan.json()
    assert plan_data["total_paid"] == "2000.00"
    assert plan_data["remaining_balance"] == "4000.00"
    assert plan_data["installments"][0]["status"] == "paid"
    assert plan_data["installments"][1]["status"] == "pending"

