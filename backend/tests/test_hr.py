import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.modules.auth.models import StaffRole, StaffUser
from app.modules.finance.models import Expense
from app.modules.hr.models import SalaryRecord, SalaryRecordStatus
from app.modules.payments.models import Payment


@pytest.fixture
def auth_admin(client: TestClient, db_session):
    admin = StaffUser(
        email=f"admin_hr_{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("AdminPass123!"),
        role=StaffRole.ADMIN,
        full_name="HR Admin",
        employee_code=f"EMP-ADM-{uuid.uuid4().hex[:4]}",
        base_salary=Decimal("80000.00"),
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()
    db_session.refresh(admin)

    token = create_access_token(subject=str(admin.id), audience="staff", role=admin.role.value)
    return {"Authorization": f"Bearer {token}"}, admin


@pytest.fixture
def auth_staff(client: TestClient, db_session):
    staff = StaffUser(
        email=f"staff_hr_{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("StaffPass123!"),
        role=StaffRole.STAFF,
        full_name="Regular Staff",
        employee_code=f"EMP-STF-{uuid.uuid4().hex[:4]}",
        base_salary=Decimal("50000.00"),
        is_active=True,
    )
    db_session.add(staff)
    db_session.commit()
    db_session.refresh(staff)

    token = create_access_token(subject=str(staff.id), audience="staff", role=staff.role.value)
    return {"Authorization": f"Bearer {token}"}, staff


def test_staff_crud_and_salary_config_rbac(client: TestClient, auth_admin, auth_staff):
    """
    Test staff creation, editing, and RBAC restrictions on salary configuration fields.
    """
    admin_headers, admin = auth_admin
    staff_headers, regular_staff = auth_staff

    # 1. Admin creates a new staff member with salary and deduction config
    create_payload = {
        "email": f"emp_{uuid.uuid4().hex[:6]}@company.com",
        "password": "Password123!",
        "role": "Staff",
        "full_name": "Alice Green",
        "employee_code": f"EMP-AG-{uuid.uuid4().hex[:4]}",
        "joining_date": "2026-01-15",
        "base_salary": "60000.00",
        "deductions_config": [
            {"name": "Provident Fund", "type": "percentage", "value": "12.00"},
            {"name": "Professional Tax", "type": "fixed", "value": "200.00"},
        ],
    }
    r = client.post("/api/hr/staff", headers=admin_headers, json=create_payload)
    assert r.status_code == 201
    created_staff = r.json()
    staff_id = created_staff["id"]
    assert created_staff["base_salary"] == "60000.00"
    assert len(created_staff["deductions_config"]) == 2

    # 2. Regular staff attempts to create staff -> Forbidden
    r_forbidden = client.post("/api/hr/staff", headers=staff_headers, json=create_payload)
    assert r_forbidden.status_code == 403

    # 3. Regular staff attempts to update salary config of another staff member -> Forbidden
    r_unauth_update = client.put(
        f"/api/hr/staff/{staff_id}",
        headers=staff_headers,
        json={"base_salary": "90000.00"},
    )
    assert r_unauth_update.status_code == 403

    # 4. Admin updates base salary
    r_update = client.put(
        f"/api/hr/staff/{staff_id}",
        headers=admin_headers,
        json={"base_salary": "65000.00"},
    )
    assert r_update.status_code == 200
    assert r_update.json()["base_salary"] == "65000.00"


def test_staff_toggle_active_and_login_blocking(client: TestClient, auth_admin, db_session):
    """
    Test that deactivating staff sets deactivated_at and blocks login, without deleting history.
    """
    admin_headers, admin = auth_admin

    # Create staff to deactivate
    emp = StaffUser(
        email=f"deact_{uuid.uuid4().hex[:6]}@company.com",
        password_hash=hash_password("Pass1234!"),
        role=StaffRole.STAFF,
        full_name="Bob Deact",
        base_salary=Decimal("40000.00"),
        is_active=True,
    )
    db_session.add(emp)
    db_session.commit()
    db_session.refresh(emp)

    # Deactivate staff
    r_deact = client.post(f"/api/hr/staff/{emp.id}/toggle-active", headers=admin_headers)
    assert r_deact.status_code == 200
    assert r_deact.json()["is_active"] is False
    assert r_deact.json()["deactivated_at"] is not None

    # Verify deactivated staff cannot login
    login_res = client.post(
        "/api/staff/auth/login",
        json={"email": emp.email, "password": "Pass1234!"},
    )
    assert login_res.status_code == 403

    # Reactivate staff
    r_react = client.post(f"/api/hr/staff/{emp.id}/toggle-active", headers=admin_headers)
    assert r_react.status_code == 200
    assert r_react.json()["is_active"] is True
    assert r_react.json()["deactivated_at"] is None


def test_salary_generation_and_snapshot_immutability(client: TestClient, auth_admin, db_session):
    """
    Assert that SalaryRecord snapshot is strictly immutable even if staff's salary configuration
    changes afterward (verify by generating, changing config, and re-fetching old record).
    """
    admin_headers, admin = auth_admin

    # Create test staff with 50,000 base salary and 10% deduction = 5,000 deduction, 45,000 net
    emp = StaffUser(
        email=f"immut_{uuid.uuid4().hex[:6]}@company.com",
        password_hash=hash_password("Pass1234!"),
        role=StaffRole.STAFF,
        full_name="Immutability Tester",
        base_salary=Decimal("50000.00"),
        deductions_config=[{"name": "Standard Deduction", "type": "percentage", "value": 10.0}],
        is_active=True,
    )
    db_session.add(emp)
    db_session.commit()
    db_session.refresh(emp)

    period = "2026-05"

    # Preview salary
    prev_res = client.post("/api/hr/salary/preview", headers=admin_headers, json={"period": period})
    assert prev_res.status_code == 200
    preview_items = [i for i in prev_res.json()["items"] if i["staff_id"] == str(emp.id)]
    assert len(preview_items) == 1
    assert preview_items[0]["net_salary"] == "45000.00"

    # Generate salary
    gen_res = client.post("/api/hr/salary/generate", headers=admin_headers, json={"period": period})
    assert gen_res.status_code == 201
    records = gen_res.json()
    emp_record = next(r for r in records if r["staff_id"] == str(emp.id))
    record_id = emp_record["id"]
    assert emp_record["base_salary"] == "50000.00"
    assert emp_record["total_deductions"] == "5000.00"
    assert emp_record["net_salary"] == "45000.00"

    # NOW: Mutate the staff's salary configuration dramatically!
    emp.base_salary = Decimal("100000.00")
    emp.deductions_config = [{"name": "Standard Deduction", "type": "percentage", "value": 20.0}]
    db_session.commit()

    # Re-fetch the generated SalaryRecord by ID
    fetch_res = client.get(f"/api/hr/salary/{record_id}", headers=admin_headers)
    assert fetch_res.status_code == 200
    fetched_data = fetch_res.json()

    # Crucial assertion: Historical record MUST NOT change!
    assert fetched_data["base_salary"] == "50000.00"
    assert fetched_data["total_deductions"] == "5000.00"
    assert fetched_data["net_salary"] == "45000.00"
    assert fetched_data["deductions"][0]["amount"] == "5000.00"


def test_duplicate_salary_generation_rejected(client: TestClient, auth_admin, db_session):
    """
    Assert duplicate salary generation for same staff + period is rejected (409 Conflict),
    not silently overwritten.
    """
    admin_headers, admin = auth_admin

    period = "2026-06"

    # First generation
    r1 = client.post("/api/hr/salary/generate", headers=admin_headers, json={"period": period})
    assert r1.status_code == 201

    # Second generation for identical period must be rejected
    r2 = client.post("/api/hr/salary/generate", headers=admin_headers, json={"period": period})
    assert r2.status_code == 409
    assert "already exist" in r2.json()["error"]["message"]


def test_inactive_staff_exclusion_and_mid_period_deactivation_rule(client: TestClient, auth_admin, db_session):
    """
    Asserts:
    1) Inactive staff for the entire period are completely excluded from salary generation.
    2) Mid-period deactivation is handled per documented calendar proration rule:
       active_days = (deactivated_at.date() - period_start).days + 1
       prorated_base = quantize_money(base_salary * (active_days / days_in_month))
    """
    admin_headers, admin = auth_admin

    period = "2026-04"  # April has 30 days

    # 1. Staff fully inactive before period started (deactivated on 2026-03-15)
    inactive_emp = StaffUser(
        email=f"prior_inactive_{uuid.uuid4().hex[:6]}@company.com",
        password_hash=hash_password("Pass1234!"),
        role=StaffRole.STAFF,
        full_name="Prior Inactive",
        base_salary=Decimal("50000.00"),
        is_active=False,
        deactivated_at=datetime(2026, 3, 15, 12, 0, tzinfo=timezone.utc),
    )
    db_session.add(inactive_emp)

    # 2. Staff deactivated mid-period on April 10, 2026 (active days: 1 to 10 = 10 days out of 30)
    # Base salary: 30,000.00. 10/30 of 30,000 = 10,000.00 prorated base salary.
    mid_deact_emp = StaffUser(
        email=f"mid_deact_{uuid.uuid4().hex[:6]}@company.com",
        password_hash=hash_password("Pass1234!"),
        role=StaffRole.STAFF,
        full_name="Mid Deactivated",
        base_salary=Decimal("30000.00"),
        is_active=False,
        deactivated_at=datetime(2026, 4, 10, 15, 30, tzinfo=timezone.utc),
    )
    db_session.add(mid_deact_emp)
    db_session.commit()

    # Preview calculations for 2026-04
    preview = client.post("/api/hr/salary/preview", headers=admin_headers, json={"period": period})
    assert preview.status_code == 200
    preview_items = {i["staff_id"]: i for i in preview.json()["items"]}

    # Fully inactive staff must be EXCLUDED
    assert str(inactive_emp.id) not in preview_items

    # Mid-deactivated staff must be INCLUDED and PRORATED
    assert str(mid_deact_emp.id) in preview_items
    mid_calc = preview_items[str(mid_deact_emp.id)]
    assert mid_calc["is_prorated"] is True
    assert mid_calc["active_days"] == 10
    assert mid_calc["total_days"] == 30
    assert mid_calc["prorated_base_salary"] == "10000.00"
    assert mid_calc["net_salary"] == "10000.00"

    # Generate salary records
    gen_res = client.post("/api/hr/salary/generate", headers=admin_headers, json={"period": period})
    assert gen_res.status_code == 201
    gen_items = {r["staff_id"]: r for r in gen_res.json()}

    assert str(inactive_emp.id) not in gen_items
    assert str(mid_deact_emp.id) in gen_items
    assert gen_items[str(mid_deact_emp.id)]["base_salary"] == "10000.00"
    assert gen_items[str(mid_deact_emp.id)]["net_salary"] == "10000.00"


def test_mark_salary_as_paid_creates_payment_and_expense_once(client: TestClient, auth_admin, db_session):
    """
    Assert that marking a salary record as paid:
    1) Creates exactly ONE linked Payment ledger record (Phase 8).
    2) Creates exactly ONE linked Finance Expense record (category='Salary').
    3) Rejects duplicate mark-paid attempts on retry.
    """
    admin_headers, admin = auth_admin

    emp = StaffUser(
        email=f"payout_staff_{uuid.uuid4().hex[:6]}@company.com",
        password_hash=hash_password("Pass1234!"),
        role=StaffRole.STAFF,
        full_name="Payout Staff",
        base_salary=Decimal("75000.00"),
        deductions_config=[{"name": "Tax", "type": "fixed", "value": 5000.0}],
        is_active=True,
    )
    db_session.add(emp)
    db_session.commit()
    db_session.refresh(emp)

    period = "2026-07"
    gen_res = client.post("/api/hr/salary/generate", headers=admin_headers, json={"period": period})
    assert gen_res.status_code == 201
    record = next(r for r in gen_res.json() if r["staff_id"] == str(emp.id))
    record_id = record["id"]
    assert record["status"] == "generated"
    assert record["net_salary"] == "70000.00"

    # Mark as paid
    pay_payload = {
        "method": "bank_transfer",
        "reference_id": "UTR-SALARY-987654321",
        "notes": "Monthly payroll transfer",
    }
    pay_res = client.post(f"/api/hr/salary/{record_id}/pay", headers=admin_headers, json=pay_payload)
    assert pay_res.status_code == 200
    paid_record = pay_res.json()
    assert paid_record["status"] == "paid"
    assert paid_record["paid_at"] is not None
    assert paid_record["payment_id"] is not None
    assert paid_record["expense_id"] is not None

    # Verify the Payment ledger row
    payment = db_session.get(Payment, uuid.UUID(paid_record["payment_id"]))
    assert payment is not None
    assert payment.amount == Decimal("70000.00")
    assert payment.method == "bank_transfer"
    assert payment.reference_id == "UTR-SALARY-987654321"
    assert payment.status == "paid"
    assert payment.idempotency_key == f"salary-payout-{record_id}"

    # Verify the Expense row
    expense = db_session.get(Expense, uuid.UUID(paid_record["expense_id"]))
    assert expense is not None
    assert expense.category == "Salary"
    assert expense.amount == Decimal("70000.00")
    assert record_id in expense.description

    # Retry marking paid -> MUST BE REJECTED (400 Bad Request)
    retry_res = client.post(f"/api/hr/salary/{record_id}/pay", headers=admin_headers, json=pay_payload)
    assert retry_res.status_code == 400
    assert "already marked as paid" in retry_res.json()["error"]["message"]
