import hashlib
import uuid
from fastapi.testclient import TestClient
import pyotp
import pytest

from app.core.security import create_access_token, hash_password
from app.modules.auth.models import StaffRole, StaffSession, StaffUser


@pytest.fixture
def test_admin_user(db_session):
    staff = StaffUser(
        email=f"admin_{uuid.uuid4().hex[:6]}@example.com",
        password_hash=hash_password("AdminPass123!"),
        role=StaffRole.ADMIN,
        is_active=True,
    )
    db_session.add(staff)
    db_session.commit()
    db_session.refresh(staff)
    return staff


@pytest.fixture
def admin_auth_headers(test_admin_user):
    token = create_access_token(
        subject=str(test_admin_user.id),
        audience="staff",
        role=test_admin_user.role.value,
    )
    return {"Authorization": f"Bearer {token}"}


def test_2fa_setup_and_verify(client: TestClient, db_session, test_admin_user, admin_auth_headers):
    """Test full 2FA setup and verification cycle."""
    # 1. Setup 2FA
    resp = client.post("/api/staff/auth/2fa/setup", headers=admin_auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "secret" in data
    assert "otpauth_url" in data
    assert "backup_codes" in data
    assert len(data["backup_codes"]) == 8

    secret = data["secret"]

    # Before verification, is_totp_enabled must still be False
    db_session.refresh(test_admin_user)
    assert test_admin_user.is_totp_enabled is False

    # 2. Verify with valid TOTP code
    code = pyotp.TOTP(secret).now()
    v_resp = client.post(
        "/api/staff/auth/2fa/verify",
        headers=admin_auth_headers,
        json={"code": code},
    )
    assert v_resp.status_code == 200
    assert "successfully enabled" in v_resp.json()["message"]

    # After verification, is_totp_enabled must be True
    db_session.refresh(test_admin_user)
    assert test_admin_user.is_totp_enabled is True


def test_2fa_login_flow(client: TestClient, db_session, test_admin_user):
    """Test login enforcement when 2FA is enabled."""
    secret = pyotp.random_base32()
    test_admin_user.totp_secret = secret
    test_admin_user.is_totp_enabled = True
    test_admin_user.totp_backup_codes = []
    db_session.commit()

    # Step 1: Initial login attempt with email and password
    resp = client.post(
        "/api/staff/auth/login",
        json={"email": test_admin_user.email, "password": "AdminPass123!"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["requires_2fa"] is True
    assert "temp_token" in data
    assert data["access_token"] is None
    temp_token = data["temp_token"]

    # Step 2: Failed 2FA verification attempt with wrong code
    fail_resp = client.post(
        "/api/staff/auth/2fa/login",
        json={"temp_token": temp_token, "code": "000000"},
    )
    assert fail_resp.status_code == 400

    # Step 3: Successful 2FA verification with valid code
    valid_code = pyotp.TOTP(secret).now()
    success_resp = client.post(
        "/api/staff/auth/2fa/login",
        json={"temp_token": temp_token, "code": valid_code},
    )
    assert success_resp.status_code == 200
    token_data = success_resp.json()
    assert token_data["requires_2fa"] is False
    assert token_data["access_token"] is not None
    assert token_data["user"]["email"] == test_admin_user.email


def test_2fa_login_with_backup_code(client: TestClient, db_session, test_admin_user):
    """Test logging in using a single-use backup code and ensuring it is consumed."""
    secret = pyotp.random_base32()
    backup_code = "BACKUP1234"
    code_hash = hashlib.sha256(backup_code.encode("utf-8")).hexdigest()

    test_admin_user.totp_secret = secret
    test_admin_user.is_totp_enabled = True
    test_admin_user.totp_backup_codes = [code_hash]
    db_session.commit()

    # Step 1: Initial password login
    resp = client.post(
        "/api/staff/auth/login",
        json={"email": test_admin_user.email, "password": "AdminPass123!"},
    )
    assert resp.status_code == 200
    temp_token = resp.json()["temp_token"]

    # Step 2: Login using backup code
    success_resp = client.post(
        "/api/staff/auth/2fa/login",
        json={"temp_token": temp_token, "code": backup_code},
    )
    assert success_resp.status_code == 200
    assert success_resp.json()["access_token"] is not None

    # Step 3: Verify the backup code was consumed
    db_session.refresh(test_admin_user)
    assert code_hash not in (test_admin_user.totp_backup_codes or [])

    # Step 4: Trying to use the same backup code again should fail
    resp2 = client.post(
        "/api/staff/auth/login",
        json={"email": test_admin_user.email, "password": "AdminPass123!"},
    )
    temp_token2 = resp2.json()["temp_token"]
    fail_resp = client.post(
        "/api/staff/auth/2fa/login",
        json={"temp_token": temp_token2, "code": backup_code},
    )
    assert fail_resp.status_code == 400


def test_2fa_disable(client: TestClient, db_session, test_admin_user, admin_auth_headers):
    """Test disabling 2FA using account password."""
    test_admin_user.is_totp_enabled = True
    test_admin_user.totp_secret = pyotp.random_base32()
    db_session.commit()

    # Disable with wrong password
    resp_fail = client.post(
        "/api/staff/auth/2fa/disable",
        headers=admin_auth_headers,
        json={"password": "WrongPassword!"},
    )
    assert resp_fail.status_code == 400

    # Disable with correct password
    resp = client.post(
        "/api/staff/auth/2fa/disable",
        headers=admin_auth_headers,
        json={"password": "AdminPass123!"},
    )
    assert resp.status_code == 200
    db_session.refresh(test_admin_user)
    assert test_admin_user.is_totp_enabled is False
    assert test_admin_user.totp_secret is None


def test_active_sessions_tracking_and_revocation(client: TestClient, db_session, test_admin_user):
    """Test session listing and revocation endpoints."""
    # Log in to create a session
    login_resp = client.post(
        "/api/staff/auth/login",
        json={"email": test_admin_user.email, "password": "AdminPass123!"},
    )
    assert login_resp.status_code == 200
    access_token = login_resp.json()["access_token"]
    auth_header = {"Authorization": f"Bearer {access_token}"}

    # Fetch sessions
    sess_resp = client.get("/api/staff/sessions", headers=auth_header)
    assert sess_resp.status_code == 200
    sessions = sess_resp.json()["sessions"]
    assert len(sessions) >= 1
    session_id = sessions[0]["id"]

    # Revoke session
    del_resp = client.delete(f"/api/staff/sessions/{session_id}", headers=auth_header)
    assert del_resp.status_code == 200
    assert "revoked" in del_resp.json()["message"]

    # Verify session is revoked
    sess_after = client.get("/api/staff/sessions", headers=auth_header).json()["sessions"]
    active_ids = [s["id"] for s in sess_after]
    assert session_id not in active_ids
