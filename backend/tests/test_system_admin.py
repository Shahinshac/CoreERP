import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password
from app.modules.admin.models import SystemConfig
from app.modules.admin.service import get_config_value, seed_default_configs
from app.modules.audit.models import AuditLog
from app.modules.auth.models import StaffRole, StaffUser


@pytest.fixture
def super_admin_user(db_session: Session) -> StaffUser:
    user = StaffUser(
        email="superadmin@coreerp.local",
        password_hash=hash_password("SuperAdmin123!"),
        role=StaffRole.SUPER_ADMIN,
        full_name="Chief Administrator",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def super_admin_token(super_admin_user: StaffUser) -> str:
    return create_access_token(subject=str(super_admin_user.id), audience="staff", role=super_admin_user.role.value)


@pytest.fixture
def regular_staff_user(db_session: Session) -> StaffUser:
    user = StaffUser(
        email="cashier@coreerp.local",
        password_hash=hash_password("StaffPass123!"),
        role=StaffRole.STAFF,
        full_name="Cashier Joe",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def regular_staff_token(regular_staff_user: StaffUser) -> str:
    return create_access_token(subject=str(regular_staff_user.id), audience="staff", role=regular_staff_user.role.value)


def test_admin_endpoints_require_admin_role(client: TestClient, regular_staff_token: str):
    # Unauthenticated
    res = client.get("/api/admin/overview")
    assert res.status_code == 401

    # Forbidden for regular staff
    res = client.get(
        "/api/admin/overview",
        headers={"Authorization": f"Bearer {regular_staff_token}"},
    )
    assert res.status_code == 403


def test_admin_overview(client: TestClient, super_admin_token: str):
    res = client.get(
        "/api/admin/overview",
        headers={"Authorization": f"Bearer {super_admin_token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert "app_version" in data
    assert "environment" in data
    assert "database_status" in data
    assert data["database_status"] == "connected"
    assert "total_products" in data
    assert "total_customers" in data
    assert "total_invoices" in data
    assert "total_staff" in data


def test_admin_configs_seed_and_list(client: TestClient, super_admin_token: str, db_session: Session):
    # Seed configs
    seed_res = client.post(
        "/api/admin/configs/seed",
        headers={"Authorization": f"Bearer {super_admin_token}"},
    )
    assert seed_res.status_code == 200
    assert "created" in seed_res.json()

    # List configs
    res = client.get(
        "/api/admin/configs",
        headers={"Authorization": f"Bearer {super_admin_token}"},
    )
    assert res.status_code == 200
    configs_data = res.json()
    assert "configs" in configs_data
    configs = configs_data["configs"]
    assert isinstance(configs, list)
    assert len(configs) > 0

    keys = [c["key"] for c in configs]
    assert "business_name" in keys
    assert "default_gst_rate" in keys


def test_admin_update_single_config(client: TestClient, super_admin_token: str, db_session: Session):
    seed_default_configs(db_session)

    res = client.put(
        "/api/admin/configs/business_name",
        headers={"Authorization": f"Bearer {super_admin_token}"},
        json={"value": "Apex Retail Systems Ltd", "reason": "Legal corporate rebranding"},
    )
    assert res.status_code == 200
    updated = res.json()
    assert updated["key"] == "business_name"
    assert updated["value"] == "Apex Retail Systems Ltd"

    # Verify audit log was produced
    audit = db_session.query(AuditLog).filter(AuditLog.event_type == "admin.config_changed").first()
    assert audit is not None
    assert audit.details["key"] == "business_name"
    assert audit.details["new_value"] == "Apex Retail Systems Ltd"
    assert audit.details["reason"] == "Legal corporate rebranding"


def test_admin_staff_management_flow(
    client: TestClient, super_admin_token: str, super_admin_user: StaffUser, regular_staff_user: StaffUser, db_session: Session
):
    headers = {"Authorization": f"Bearer {super_admin_token}"}

    # 1. List staff
    list_res = client.get("/api/admin/staff", headers=headers)
    assert list_res.status_code == 200
    staff_data = list_res.json()
    assert "items" in staff_data
    staff_list = staff_data["items"]
    assert len(staff_list) >= 2

    # 2. Toggle active status
    toggle_res = client.patch(
        f"/api/admin/staff/{regular_staff_user.id}/toggle",
        headers=headers,
        json={"is_active": False, "reason": "Extended leave of absence"},
    )
    assert toggle_res.status_code == 200
    assert toggle_res.json()["is_active"] is False

    # Prevent deactivating own account
    self_toggle = client.patch(
        f"/api/admin/staff/{super_admin_user.id}/toggle",
        headers=headers,
        json={"is_active": False},
    )
    assert self_toggle.status_code == 400

    # 3. Change role
    role_res = client.patch(
        f"/api/admin/staff/{regular_staff_user.id}/role",
        headers=headers,
        json={"role": "Manager", "reason": "Promoted to store manager"},
    )
    assert role_res.status_code == 200
    assert role_res.json()["role"] == "Manager"

    # 4. Reset password
    pw_res = client.post(
        f"/api/admin/staff/{regular_staff_user.id}/reset-password",
        headers=headers,
        json={"new_password": "NewStrongPass999!", "reason": "Forgotten credentials request"},
    )
    assert pw_res.status_code == 200
    assert "message" in pw_res.json()
