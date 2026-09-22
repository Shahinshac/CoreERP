from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import create_password_reset_token, hash_password
from app.modules.auth.dependencies import get_current_staff, require_roles
from app.modules.auth.models import Customer, StaffRole, StaffUser


def test_staff_login_success_and_failure(client: TestClient, db_session: Session):
    """
    Test staff login success and failure, verifying tokens and response shape.
    """
    raw_password = "supersecretpassword123"
    staff = StaffUser(
        email="manager@erp.local",
        password_hash=hash_password(raw_password),
        role=StaffRole.MANAGER,
        is_active=True,
    )
    db_session.add(staff)
    db_session.commit()

    # Success case
    resp = client.post(
        "/api/staff/auth/login",
        json={"email": "manager@erp.local", "password": raw_password},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["user"]["email"] == "manager@erp.local"
    assert data["user"]["role"] == "Manager"
    # Ensure password and hash are NOT returned
    assert "password" not in data["user"]
    assert "password_hash" not in data["user"]
    assert raw_password not in resp.text

    # Failure case: bad password
    bad_resp = client.post(
        "/api/staff/auth/login",
        json={"email": "manager@erp.local", "password": "wrongpassword"},
    )
    assert bad_resp.status_code == 401

    # Failure case: unknown email
    bad_email = client.post(
        "/api/staff/auth/login",
        json={"email": "nobody@erp.local", "password": raw_password},
    )
    assert bad_email.status_code == 401


def test_customer_register_and_login(client: TestClient, db_session: Session):
    """
    Test customer registration, duplicate email handling, and login.
    """
    reg_payload = {
        "email": "customer1@client.local",
        "password": "customerpass123",
        "name": "Jane Doe",
        "phone": "+1234567890",
    }
    resp = client.post("/api/customers/auth/register", json=reg_payload)
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert data["user"]["name"] == "Jane Doe"
    assert "password" not in data["user"]
    assert "password_hash" not in data["user"]

    # Duplicate registration should conflict (409)
    dup_resp = client.post("/api/customers/auth/register", json=reg_payload)
    assert dup_resp.status_code == 409

    # Login
    login_resp = client.post(
        "/api/customers/auth/login",
        json={"email": reg_payload["email"], "password": reg_payload["password"]},
    )
    assert login_resp.status_code == 200
    assert "access_token" in login_resp.json()


def test_wrong_audience_token_rejected_on_wrong_dependency(client: TestClient, db_session: Session):
    """
    Verifies that a staff token cannot access customer endpoints and vice-versa.
    """
    # Create staff
    staff = StaffUser(
        email="staff.aud@erp.local",
        password_hash=hash_password("password123"),
        role=StaffRole.STAFF,
        is_active=True,
    )
    # Create customer
    cust = Customer(
        email="cust.aud@client.local",
        password_hash=hash_password("password123"),
        name="Cust Aud",
        is_active=True,
    )
    db_session.add_all([staff, cust])
    db_session.commit()

    # Login both
    staff_tok = client.post(
        "/api/staff/auth/login",
        json={"email": "staff.aud@erp.local", "password": "password123"},
    ).json()["access_token"]

    cust_tok = client.post(
        "/api/customers/auth/login",
        json={"email": "cust.aud@client.local", "password": "password123"},
    ).json()["access_token"]

    # Staff token to Staff endpoint -> OK
    staff_ok = client.get("/api/staff/auth/me", headers={"Authorization": f"Bearer {staff_tok}"})
    assert staff_ok.status_code == 200

    # Staff token to Customer endpoint -> 403 Forbidden (Audience mismatch)
    staff_on_cust = client.get("/api/customers/auth/me", headers={"Authorization": f"Bearer {staff_tok}"})
    assert staff_on_cust.status_code == 403
    assert "audience" in staff_on_cust.json()["error"]["message"].lower()

    # Customer token to Staff endpoint -> 403 Forbidden (Audience mismatch)
    cust_on_staff = client.get("/api/staff/auth/me", headers={"Authorization": f"Bearer {cust_tok}"})
    assert cust_on_staff.status_code == 403
    assert "audience" in cust_on_staff.json()["error"]["message"].lower()


def test_inactive_user_blocked(client: TestClient, db_session: Session):
    """
    Verifies that deactivated accounts cannot log in or use their tokens.
    """
    staff = StaffUser(
        email="inactive@erp.local",
        password_hash=hash_password("password123"),
        role=StaffRole.STAFF,
        is_active=False,
    )
    db_session.add(staff)
    db_session.commit()

    # Login attempt should fail with 403
    resp = client.post(
        "/api/staff/auth/login",
        json={"email": "inactive@erp.local", "password": "password123"},
    )
    assert resp.status_code == 403
    assert "deactivated" in resp.json()["error"]["message"].lower()


def test_rbac_dependency_blocks_insufficient_role(client: TestClient, db_session: Session):
    """
    Verifies that require_roles properly enforces RBAC permissions per route.
    """
    staff_user = StaffUser(
        email="clerk@erp.local",
        password_hash=hash_password("password123"),
        role=StaffRole.STAFF,
        is_active=True,
    )
    admin_user = StaffUser(
        email="admin@erp.local",
        password_hash=hash_password("password123"),
        role=StaffRole.ADMIN,
        is_active=True,
    )
    super_admin = StaffUser(
        email="super@erp.local",
        password_hash=hash_password("password123"),
        role=StaffRole.SUPER_ADMIN,
        is_active=True,
    )
    db_session.add_all([staff_user, admin_user, super_admin])
    db_session.commit()

    # Add temporary test route to app for RBAC verification
    app = client.app  # type: ignore

    @app.get("/api/test-admin-only")
    def admin_only_route(user: StaffUser = Depends(require_roles(StaffRole.ADMIN))):
        return {"authorized": True, "role": user.role.value}

    # Log in all users
    staff_tok = client.post(
        "/api/staff/auth/login",
        json={"email": "clerk@erp.local", "password": "password123"},
    ).json()["access_token"]

    admin_tok = client.post(
        "/api/staff/auth/login",
        json={"email": "admin@erp.local", "password": "password123"},
    ).json()["access_token"]

    super_tok = client.post(
        "/api/staff/auth/login",
        json={"email": "super@erp.local", "password": "password123"},
    ).json()["access_token"]

    # Regular Staff -> 403 Forbidden
    resp_staff = client.get("/api/test-admin-only", headers={"Authorization": f"Bearer {staff_tok}"})
    assert resp_staff.status_code == 403

    # Admin -> 200 OK
    resp_admin = client.get("/api/test-admin-only", headers={"Authorization": f"Bearer {admin_tok}"})
    assert resp_admin.status_code == 200
    assert resp_admin.json()["role"] == "Admin"

    # Super Admin -> 200 OK
    resp_super = client.get("/api/test-admin-only", headers={"Authorization": f"Bearer {super_tok}"})
    assert resp_super.status_code == 200


def test_refresh_token_flow(client: TestClient, db_session: Session):
    """
    Test exchange of refresh token for a new access token.
    """
    staff = StaffUser(
        email="refresh.test@erp.local",
        password_hash=hash_password("password123"),
        role=StaffRole.ACCOUNTANT,
        is_active=True,
    )
    db_session.add(staff)
    db_session.commit()

    login_resp = client.post(
        "/api/staff/auth/login",
        json={"email": "refresh.test@erp.local", "password": "password123"},
    )
    refresh_token = login_resp.cookies.get("staff_refresh_token")
    assert refresh_token is not None

    # Refresh using body token
    refresh_resp = client.post("/api/staff/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_resp.status_code == 200
    data = refresh_resp.json()
    assert "access_token" in data
    assert data["user"]["email"] == "refresh.test@erp.local"
    assert "password" not in data["user"]
    assert "password_hash" not in data["user"]


def test_staff_password_reset_flow(client: TestClient, db_session: Session):
    """
    Test the complete staff password reset flow.
    """
    staff = StaffUser(
        email="reset.user@erp.local",
        password_hash=hash_password("oldpassword123"),
        role=StaffRole.STAFF,
        is_active=True,
    )
    db_session.add(staff)
    db_session.commit()

    # Step 1: Request reset
    forgot_resp = client.post(
        "/api/staff/auth/forgot-password",
        json={"email": "reset.user@erp.local"},
    )
    assert forgot_resp.status_code == 200

    # Step 2: Use reset token
    token = create_password_reset_token("reset.user@erp.local")
    reset_resp = client.post(
        "/api/staff/auth/reset-password",
        json={"token": token, "new_password": "brandnewpassword456"},
    )
    assert reset_resp.status_code == 200

    # Step 3: Old password fails, new password succeeds
    fail_login = client.post(
        "/api/staff/auth/login",
        json={"email": "reset.user@erp.local", "password": "oldpassword123"},
    )
    assert fail_login.status_code == 401

    ok_login = client.post(
        "/api/staff/auth/login",
        json={"email": "reset.user@erp.local", "password": "brandnewpassword456"},
    )
    assert ok_login.status_code == 200
