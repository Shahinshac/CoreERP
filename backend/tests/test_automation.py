import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.modules.auth.models import Customer, StaffRole, StaffUser
from app.modules.catalog.models import Brand, Category, Product
from app.modules.emi.models import EmiInstallment, EmiInstallmentStatus, EmiPlan, EmiPlanStatus
from app.modules.hr.models import SalaryRecord
from app.modules.notifications.models import Notification
from app.modules.sales.models import Sale
from app.modules.support.models import Warranty


@pytest.fixture
def automation_setup(db_session: Session):
    admin = StaffUser(
        email=f"admin_{uuid.uuid4().hex[:6]}@erp.local",
        password_hash=hash_password("adminpass123"),
        role=StaffRole.ADMIN,
        is_active=True,
    )
    db_session.add(admin)

    customer = Customer(
        email=f"customer_{uuid.uuid4().hex[:6]}@example.com",
        password_hash=hash_password("custpass123"),
        name="Auto Test Customer",
        phone="9876543210",
        state="Maharashtra",
        is_active=True,
    )
    db_session.add(customer)

    cat = Category(name=f"Auto Cat {uuid.uuid4().hex[:6]}")
    brand = Brand(name=f"Auto Brand {uuid.uuid4().hex[:6]}")
    db_session.add_all([cat, brand])
    db_session.flush()

    product = Product(
        name="Auto Test Widget",
        sku=f"WIDGET-{uuid.uuid4().hex[:6]}",
        category_id=cat.id,
        brand_id=brand.id,
        purchase_price=Decimal("100.00"),
        selling_price=Decimal("150.00"),
        current_stock=Decimal("2.000"),
        min_stock=Decimal("5.000"),
        is_active=True,
    )
    db_session.add(product)
    db_session.commit()

    return {
        "admin": admin,
        "customer": customer,
        "product": product,
        "auth_headers": {"X-Automation-Key": settings.AUTOMATION_KEY},
    }


# ==========================================
# 1. SHARED SECRET AUTHENTICATION
# ==========================================

def test_automation_auth_rejection_and_acceptance(client: TestClient, automation_setup):
    # 1. Missing header -> 401
    resp = client.post("/api/automation/jobs/low-stock")
    assert resp.status_code == 401

    # 2. Invalid header -> 401
    resp_bad = client.post(
        "/api/automation/jobs/low-stock",
        headers={"X-Automation-Key": "wrong-secret-key"},
    )
    assert resp_bad.status_code == 401

    # 3. Valid X-Automation-Key -> 200
    resp_ok = client.post(
        "/api/automation/jobs/low-stock",
        headers={"X-Automation-Key": settings.AUTOMATION_KEY},
    )
    assert resp_ok.status_code == 200
    assert resp_ok.json()["status"] == "success"

    # 4. Valid Authorization: Bearer <KEY> -> 200
    resp_bearer = client.post(
        "/api/automation/jobs/low-stock",
        headers={"Authorization": f"Bearer {settings.AUTOMATION_KEY}"},
    )
    assert resp_bearer.status_code == 200


# ==========================================
# 2. LOW STOCK CHECK IDEMPOTENCY
# ==========================================

def test_low_stock_job_idempotency(client: TestClient, automation_setup, db_session: Session):
    headers = automation_setup["auth_headers"]

    # Initial count of low_stock notifications
    initial_count = (
        db_session.query(Notification)
        .filter(Notification.type == "low_stock")
        .count()
    )

    # First execution -> creates alert
    resp1 = client.post("/api/automation/jobs/low-stock", headers=headers)
    assert resp1.status_code == 200
    data1 = resp1.json()["details"]
    assert data1["notifications_created"] >= 1
    assert data1["skipped_deduplicated"] == 0

    count_after_run1 = (
        db_session.query(Notification)
        .filter(Notification.type == "low_stock")
        .count()
    )
    assert count_after_run1 > initial_count

    # Second execution in same 24h window -> skips creation (idempotent)
    resp2 = client.post("/api/automation/jobs/low-stock", headers=headers)
    assert resp2.status_code == 200
    data2 = resp2.json()["details"]
    assert data2["notifications_created"] == 0
    assert data2["skipped_deduplicated"] >= 1

    count_after_run2 = (
        db_session.query(Notification)
        .filter(Notification.type == "low_stock")
        .count()
    )
    assert count_after_run2 == count_after_run1


# ==========================================
# 3. EMI DUE & OVERDUE IDEMPOTENCY
# ==========================================

def test_emi_due_and_overdue_check_idempotency(client: TestClient, automation_setup, db_session: Session):
    customer = automation_setup["customer"]
    admin = automation_setup["admin"]

    # Create dummy sale and active EMI plan
    sale = Sale(
        invoice_number=f"INV-AUTO-{uuid.uuid4().hex[:6]}",
        customer_id=customer.id,
        staff_id=admin.id,
        subtotal=Decimal("1000.00"),
        tax_amount=Decimal("180.00"),
        discount_amount=Decimal("0.00"),
        total_amount=Decimal("1180.00"),
        status="completed",
        payment_method="cash",
    )
    db_session.add(sale)
    db_session.flush()

    plan = EmiPlan(
        customer_id=customer.id,
        created_by=admin.id,
        principal=Decimal("1000.00"),
        down_payment=Decimal("180.00"),
        number_of_installments=2,
        interest_rate=Decimal("0.00"),
        interest_amount=Decimal("0.00"),
        total_financed=Decimal("1000.00"),
        installment_amount=Decimal("500.00"),
        status=EmiPlanStatus.ACTIVE.value,
        start_date=date.today() - timedelta(days=40),
    )
    db_session.add(plan)
    db_session.flush()

    today = date.today()
    # Installment 1: Due in 2 days (upcoming due)
    inst_due = EmiInstallment(
        emi_plan_id=plan.id,
        installment_number=1,
        due_date=today + timedelta(days=2),
        amount_due=Decimal("500.00"),
        amount_paid=Decimal("0.00"),
        status=EmiInstallmentStatus.PENDING.value,
    )
    # Installment 2: Due 10 days ago (past due, should transition to overdue)
    inst_overdue = EmiInstallment(
        emi_plan_id=plan.id,
        installment_number=2,
        due_date=today - timedelta(days=10),
        amount_due=Decimal("500.00"),
        amount_paid=Decimal("0.00"),
        status=EmiInstallmentStatus.PENDING.value,
    )
    db_session.add_all([inst_due, inst_overdue])
    db_session.commit()

    headers = automation_setup["auth_headers"]

    # Run 1: transitions overdue and dispatches alerts
    resp1 = client.post("/api/automation/jobs/emi-due-overdue", headers=headers)
    assert resp1.status_code == 200
    d1 = resp1.json()["details"]
    assert d1["due_notifications_sent"] >= 1
    assert d1["overdue_installments_transitioned"] >= 1
    assert d1["overdue_notifications_sent"] >= 1

    db_session.refresh(inst_overdue)
    assert inst_overdue.status == EmiInstallmentStatus.OVERDUE.value

    # Run 2: immediately rerun -> 0 new notifications, 0 re-transitions (idempotent)
    resp2 = client.post("/api/automation/jobs/emi-due-overdue", headers=headers)
    assert resp2.status_code == 200
    d2 = resp2.json()["details"]
    assert d2["due_notifications_sent"] == 0
    assert d2["overdue_installments_transitioned"] == 0
    assert d2["overdue_notifications_sent"] == 0
    assert d2["skipped_deduplicated"] >= 1


# ==========================================
# 4. EMI DEFAULT TRANSITION (PHASE 9 RULE)
# ==========================================

def test_emi_default_transition_exact_rule(client: TestClient, automation_setup, db_session: Session):
    customer = automation_setup["customer"]
    admin = automation_setup["admin"]
    today = date.today()

    sale = Sale(
        invoice_number=f"INV-DEF-{uuid.uuid4().hex[:6]}",
        customer_id=customer.id,
        staff_id=admin.id,
        subtotal=Decimal("3000.00"),
        tax_amount=Decimal("0.00"),
        discount_amount=Decimal("0.00"),
        total_amount=Decimal("3000.00"),
        status="completed",
        payment_method="cash",
    )
    db_session.add(sale)
    db_session.flush()

    # Plan A: Has 3 overdue installments (<90 days overdue) -> MUST DEFAULT
    plan_a = EmiPlan(
        customer_id=customer.id,
        created_by=admin.id,
        principal=Decimal("1500.00"),
        down_payment=Decimal("0.00"),
        interest_rate=Decimal("0.00"),
        number_of_installments=3,
        installment_amount=Decimal("500.00"),
        total_financed=Decimal("1500.00"),
        status=EmiPlanStatus.ACTIVE.value,
        start_date=today - timedelta(days=100),
    )
    db_session.add(plan_a)
    db_session.flush()

    for i in range(1, 4):
        db_session.add(
            EmiInstallment(
                emi_plan_id=plan_a.id,
                installment_number=i,
                due_date=today - timedelta(days=20 * i),  # 20, 40, 60 days overdue (<90)
                amount_due=Decimal("500.00"),
                amount_paid=Decimal("0.00"),
                status=EmiInstallmentStatus.OVERDUE.value,
            )
        )

    # Plan B: Has 1 installment overdue by 95 days (>90 days) -> MUST DEFAULT
    plan_b = EmiPlan(
        customer_id=customer.id,
        created_by=admin.id,
        principal=Decimal("1000.00"),
        down_payment=Decimal("0.00"),
        interest_rate=Decimal("0.00"),
        number_of_installments=2,
        installment_amount=Decimal("500.00"),
        total_financed=Decimal("1000.00"),
        status=EmiPlanStatus.ACTIVE.value,
        start_date=today - timedelta(days=120),
    )
    db_session.add(plan_b)
    db_session.flush()

    db_session.add(
        EmiInstallment(
            emi_plan_id=plan_b.id,
            installment_number=1,
            due_date=today - timedelta(days=95),  # > 90 days overdue
            amount_due=Decimal("500.00"),
            amount_paid=Decimal("0.00"),
            status=EmiInstallmentStatus.DEFAULTED.value,
        )
    )

    # Plan C: Has only 2 overdue installments (<90 days each) -> MUST STAY ACTIVE
    plan_c = EmiPlan(
        customer_id=customer.id,
        created_by=admin.id,
        principal=Decimal("1000.00"),
        down_payment=Decimal("0.00"),
        interest_rate=Decimal("0.00"),
        number_of_installments=2,
        installment_amount=Decimal("500.00"),
        total_financed=Decimal("1000.00"),
        status=EmiPlanStatus.ACTIVE.value,
        start_date=today - timedelta(days=40),
    )
    db_session.add(plan_c)
    db_session.flush()

    for i in range(1, 3):
        db_session.add(
            EmiInstallment(
                emi_plan_id=plan_c.id,
                installment_number=i,
                due_date=today - timedelta(days=15 * i),  # 15, 30 days overdue (<90, count=2)
                amount_due=Decimal("500.00"),
                amount_paid=Decimal("0.00"),
                status=EmiInstallmentStatus.OVERDUE.value,
            )
        )

    db_session.commit()

    headers = automation_setup["auth_headers"]

    # Trigger default transition job
    resp = client.post("/api/automation/jobs/emi-default", headers=headers)
    assert resp.status_code == 200
    details = resp.json()["details"]
    assert details["plans_defaulted"] >= 2

    # Verify transitions in database
    db_session.refresh(plan_a)
    db_session.refresh(plan_b)
    db_session.refresh(plan_c)

    assert plan_a.status == EmiPlanStatus.DEFAULTED.value
    assert plan_b.status == EmiPlanStatus.DEFAULTED.value
    assert plan_c.status == EmiPlanStatus.ACTIVE.value

    # Run again -> asserts idempotency (no double defaulting)
    resp2 = client.post("/api/automation/jobs/emi-default", headers=headers)
    assert resp2.status_code == 200
    assert resp2.json()["details"]["plans_defaulted"] == 0


# ==========================================
# 5. WARRANTY EXPIRING NOTIFICATIONS
# ==========================================

def test_warranty_expiring_check_idempotency(client: TestClient, automation_setup, db_session: Session):
    customer = automation_setup["customer"]
    product = automation_setup["product"]
    today = date.today()

    # 1. Warranty expiring in 5 days (7-day urgent window)
    w_urgent = Warranty(
        product_id=product.id,
        customer_id=customer.id,
        serial_number=f"SN-{uuid.uuid4().hex[:6]}",
        purchase_date=today - timedelta(days=360),
        start_date=today - timedelta(days=360),
        end_date=today + timedelta(days=5),
        is_claimed=False,
    )
    # 2. Warranty expiring in 25 days (30-day window)
    w_30d = Warranty(
        product_id=product.id,
        customer_id=customer.id,
        serial_number=f"SN-{uuid.uuid4().hex[:6]}",
        purchase_date=today - timedelta(days=340),
        start_date=today - timedelta(days=340),
        end_date=today + timedelta(days=25),
        is_claimed=False,
    )
    # 3. Warranty expiring in 90 days (not expiring soon)
    w_far = Warranty(
        product_id=product.id,
        customer_id=customer.id,
        serial_number=f"SN-{uuid.uuid4().hex[:6]}",
        purchase_date=today,
        start_date=today,
        end_date=today + timedelta(days=90),
        is_claimed=False,
    )
    db_session.add_all([w_urgent, w_30d, w_far])
    db_session.commit()

    headers = automation_setup["auth_headers"]

    # Run 1: alerts created for urgent and 30d warranties
    resp1 = client.post("/api/automation/jobs/warranty-expiring", headers=headers)
    assert resp1.status_code == 200
    d1 = resp1.json()["details"]
    assert d1["notifications_created"] >= 2

    # Run 2: immediately rerun -> 0 notifications created (idempotent)
    resp2 = client.post("/api/automation/jobs/warranty-expiring", headers=headers)
    assert resp2.status_code == 200
    d2 = resp2.json()["details"]
    assert d2["notifications_created"] == 0
    assert d2["skipped_deduplicated"] >= 2


# ==========================================
# 6. ORPHANED STORAGE ASSET CLEANUP DRY-RUN & EXECUTION
# ==========================================

def test_orphaned_storage_cleanup_dry_run_and_execution(client: TestClient, automation_setup, db_session: Session):
    product = automation_setup["product"]
    active_path = f"products/{product.id}/active_image.webp"
    product.image_path = active_path
    db_session.commit()

    headers = automation_setup["auth_headers"]

    # Simulated bucket listing containing active asset + 2 orphaned assets
    simulated_keys = [
        active_path,
        "products/old_prod/orphaned_1.webp",
        "tickets/orphan_attachment_2.pdf",
    ]

    # 1. Dry Run -> Identifies orphans, DOES NOT delete
    resp_dry = client.post(
        "/api/automation/jobs/orphaned-storage-cleanup",
        headers=headers,
        json={"dry_run": True, "scanned_storage_keys": simulated_keys},
    )
    assert resp_dry.status_code == 200
    d_dry = resp_dry.json()["details"]
    assert d_dry["dry_run"] is True
    assert d_dry["orphaned_count"] == 2
    assert active_path not in d_dry["orphaned_keys"]
    assert "products/old_prod/orphaned_1.webp" in d_dry["orphaned_keys"]
    assert "tickets/orphan_attachment_2.pdf" in d_dry["orphaned_keys"]
    assert d_dry["deleted_count"] == 0

    # 2. Live Run (dry_run = False) -> Deletes identified orphans
    resp_live = client.post(
        "/api/automation/jobs/orphaned-storage-cleanup",
        headers=headers,
        json={"dry_run": False, "scanned_storage_keys": simulated_keys},
    )
    assert resp_live.status_code == 200
    d_live = resp_live.json()["details"]
    assert d_live["dry_run"] is False
    assert d_live["orphaned_count"] == 2
    assert d_live["deleted_count"] == 2
    assert "products/old_prod/orphaned_1.webp" in d_live["deleted_keys"]


# ==========================================
# 7. OBSERVABILITY AND STATUS ENDPOINT
# ==========================================

def test_jobs_status_observability(client: TestClient, automation_setup):
    headers = automation_setup["auth_headers"]

    # Trigger run-all
    resp_all = client.post("/api/automation/jobs/run-all", headers=headers)
    assert resp_all.status_code == 200
    all_data = resp_all.json()
    assert all_data["status"] in ("success", "partial")
    assert all_data["total_jobs"] == 5

    # Check status endpoint
    resp_status = client.get("/api/automation/jobs/status", headers=headers)
    assert resp_status.status_code == 200
    status_data = resp_status.json()

    assert "server_time" in status_data
    assert status_data["total_runs_recorded"] >= 5
    job_map = {j["job_name"]: j for j in status_data["jobs"]}

    assert "low_stock" in job_map
    assert job_map["low_stock"]["last_status"] == "success"
    assert job_map["low_stock"]["last_run_at"] is not None

    assert "emi_due_overdue" in job_map
    assert job_map["emi_due_overdue"]["last_status"] == "success"

    assert "emi_default" in job_map
    assert job_map["emi_default"]["last_status"] == "success"
