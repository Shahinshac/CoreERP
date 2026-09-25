from decimal import Decimal
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password, verify_password
from app.modules.audit.models import AuditLog
from app.modules.audit.service import log_audit_event, sanitize_details
from app.modules.auth.models import Customer, StaffRole, StaffUser
from app.modules.catalog.models import Brand, Category, Product
from scripts.bootstrap_super_admin import bootstrap_super_admin


def test_sanitize_details_excludes_sensitive_information():
    raw_payload = {
        "user_email": "operator@test.com",
        "password": "SuperSecretPassword123!",
        "access_token": "eyJhbGciOi...",
        "refresh_token": "eyJhbGciOi...",
        "api_key": "cloudinary_secret_key",
        "nested": {
            "credit_card": "4111111111111111",
            "cvv": "123",
            "safe_field": "safe_value",
        },
        "safe_number": 42,
    }

    sanitized = sanitize_details(raw_payload)

    assert sanitized["user_email"] == "operator@test.com"
    assert sanitized["password"] == "[REDACTED]"
    assert sanitized["access_token"] == "[REDACTED]"
    assert sanitized["refresh_token"] == "[REDACTED]"
    assert sanitized["api_key"] == "[REDACTED]"
    assert sanitized["nested"]["credit_card"] == "[REDACTED]"
    assert sanitized["nested"]["cvv"] == "[REDACTED]"
    assert sanitized["nested"]["safe_field"] == "safe_value"
    assert sanitized["safe_number"] == 42


def test_audit_log_creation_and_database_persistence(db_session: Session):
    audit = log_audit_event(
        db=db_session,
        event_type="test.event",
        description="Test audit log entry.",
        actor_type="staff",
        actor_email="staff@test.com",
        resource_type="test_resource",
        resource_id="12345",
        details={"foo": "bar", "secret": "leaked_secret"},
        commit=True,
    )

    assert audit is not None
    assert audit.id is not None
    assert audit.event_type == "test.event"
    assert audit.details["foo"] == "bar"
    assert audit.details["secret"] == "[REDACTED]"

    # Verify queryable from DB
    persisted = db_session.query(AuditLog).filter(AuditLog.id == audit.id).first()
    assert persisted is not None
    assert persisted.actor_email == "staff@test.com"
    assert persisted.description == "Test audit log entry."


def test_audit_log_access_control(client: TestClient, db_session: Session):
    # Create test staff with different roles
    admin = StaffUser(
        email=f"admin-{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("admin_pass"),
        role=StaffRole.ADMIN,
        full_name="Admin User",
        is_active=True,
    )
    clerk = StaffUser(
        email=f"clerk-{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("clerk_pass"),
        role=StaffRole.STAFF,
        full_name="Clerk User",
        is_active=True,
    )
    cust = Customer(
        email=f"cust-{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("cust_pass"),
        name="Customer User",
        is_active=True,
    )
    db_session.add_all([admin, clerk, cust])
    db_session.commit()

    admin_token = create_access_token(subject=str(admin.id), audience="staff", role=StaffRole.ADMIN.value)
    clerk_token = create_access_token(subject=str(clerk.id), audience="staff", role=StaffRole.STAFF.value)
    cust_token = create_access_token(subject=str(cust.id), audience="customer")

    # 1. Anonymous request is rejected
    resp_anon = client.get("/api/audit-logs")
    assert resp_anon.status_code == 401

    # 2. Customer is rejected with 403
    resp_cust = client.get("/api/audit-logs", headers={"Authorization": f"Bearer {cust_token}"})
    assert resp_cust.status_code == 403

    # 3. Regular Staff is rejected with 403
    resp_clerk = client.get("/api/audit-logs", headers={"Authorization": f"Bearer {clerk_token}"})
    assert resp_clerk.status_code == 403

    # 4. Admin is permitted with 200
    resp_admin = client.get("/api/audit-logs", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp_admin.status_code == 200
    data = resp_admin.json()
    assert "items" in data
    assert "total" in data


def test_audit_log_filtering_and_search(client: TestClient, db_session: Session):
    admin = StaffUser(
        email=f"admin-{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("admin_pass"),
        role=StaffRole.SUPER_ADMIN,
        full_name="Super Admin",
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()

    admin_token = create_access_token(subject=str(admin.id), audience="staff", role=StaffRole.SUPER_ADMIN.value)
    headers = {"Authorization": f"Bearer {admin_token}"}

    unique_key = uuid.uuid4().hex[:8]
    log_audit_event(
        db=db_session,
        event_type="catalog.product_created",
        description=f"Created product with code {unique_key}",
        actor_type="staff",
        resource_type="product",
        resource_id=f"prod-{unique_key}",
        commit=True,
    )
    log_audit_event(
        db=db_session,
        event_type="pos.sale_completed",
        description=f"Completed checkout order {unique_key}",
        actor_type="staff",
        resource_type="sale",
        resource_id=f"sale-{unique_key}",
        commit=True,
    )

    # Filter by event_type
    resp_filter = client.get("/api/audit-logs?event_type=catalog.product_created", headers=headers)
    assert resp_filter.status_code == 200
    items = resp_filter.json()["items"]
    assert all("catalog.product_created" in it["event_type"] for it in items)

    # Search by unique keyword
    resp_search = client.get(f"/api/audit-logs?search={unique_key}", headers=headers)
    assert resp_search.status_code == 200
    search_items = resp_search.json()["items"]
    assert len(search_items) == 2


def test_auth_and_product_events_generate_audit_logs(client: TestClient, db_session: Session):
    admin = StaffUser(
        email=f"audit-admin-{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("admin_pass"),
        role=StaffRole.ADMIN,
        full_name="Audit Admin",
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()

    admin_token = create_access_token(subject=str(admin.id), audience="staff", role=StaffRole.ADMIN.value)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Staff login success logs audit event
    login_resp = client.post(
        "/api/staff/auth/login",
        json={"email": admin.email, "password": "admin_pass"},
    )
    assert login_resp.status_code == 200

    login_audit = (
        db_session.query(AuditLog)
        .filter(AuditLog.event_type == "auth.staff_login", AuditLog.actor_email == admin.email)
        .first()
    )
    assert login_audit is not None
    assert login_audit.resource_id == str(admin.id)

    # 2. Staff login failure logs audit event
    fail_resp = client.post(
        "/api/staff/auth/login",
        json={"email": admin.email, "password": "WRONG_PASSWORD!"},
    )
    assert fail_resp.status_code == 401

    fail_audit = (
        db_session.query(AuditLog)
        .filter(AuditLog.event_type == "auth.staff_login_failed", AuditLog.actor_email == admin.email)
        .first()
    )
    assert fail_audit is not None

    # 3. Product create logs audit event
    cat = Category(name=f"Cat-{uuid.uuid4().hex[:6]}")
    brand = Brand(name=f"Brand-{uuid.uuid4().hex[:6]}")
    db_session.add_all([cat, brand])
    db_session.commit()

    sku = f"AUDIT-PROD-{uuid.uuid4().hex[:6]}"
    prod_resp = client.post(
        "/api/catalog/products",
        json={
            "name": "Audit Tracked Laptop",
            "sku": sku,
            "category_id": str(cat.id),
            "brand_id": str(brand.id),
            "purchase_price": "500.00",
            "selling_price": "750.00",
            "min_stock": "5.000",
        },
        headers=admin_headers,
    )
    assert prod_resp.status_code == 201
    prod_id = prod_resp.json()["id"]

    prod_audit = (
        db_session.query(AuditLog)
        .filter(AuditLog.event_type == "catalog.product_created", AuditLog.resource_id == str(prod_id))
        .first()
    )
    assert prod_audit is not None
    assert sku in prod_audit.description


def test_first_super_admin_bootstrap_and_duplicate_prevention(db_session: Session):
    # Ensure no existing Super Admin in this test session
    db_session.query(StaffUser).filter(StaffUser.role == StaffRole.SUPER_ADMIN).delete()
    db_session.commit()

    test_email = f"first-sa-{uuid.uuid4().hex[:6]}@company.com"
    test_password = "StrongBootstrapPassword!99"

    # 1. Invalid input: password too short (< 8 chars)
    rc_short = bootstrap_super_admin(
        email=test_email,
        password="short",
        full_name="Initial Admin",
        db=db_session,
    )
    assert rc_short == 1

    # 2. Invalid input: invalid email format
    rc_bad_email = bootstrap_super_admin(
        email="invalid-email-string",
        password=test_password,
        full_name="Initial Admin",
        db=db_session,
    )
    assert rc_bad_email == 1

    # 3. Successful bootstrap
    rc_success = bootstrap_super_admin(
        email=test_email,
        password=test_password,
        full_name="Initial Super Admin",
        db=db_session,
    )
    assert rc_success == 0

    # Verify created Super Admin
    created = db_session.query(StaffUser).filter(StaffUser.email == test_email).first()
    assert created is not None
    assert created.role == StaffRole.SUPER_ADMIN
    assert created.is_active is True
    assert verify_password(test_password, created.password_hash)

    # Verify audit log was recorded
    bootstrap_audit = (
        db_session.query(AuditLog)
        .filter(AuditLog.event_type == "admin.bootstrap", AuditLog.actor_email == test_email)
        .first()
    )
    assert bootstrap_audit is not None
    assert "bootstrapped successfully" in bootstrap_audit.description

    # 4. Duplicate bootstrap prevention: attempting to bootstrap again fails
    rc_duplicate = bootstrap_super_admin(
        email=f"second-sa-{uuid.uuid4().hex[:6]}@company.com",
        password="AnotherPassword123!",
        full_name="Duplicate Admin",
        db=db_session,
    )
    assert rc_duplicate == 1
