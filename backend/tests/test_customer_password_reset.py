from datetime import datetime, timedelta
import hashlib
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.modules.audit.models import AuditLog
from app.modules.auth.models import Customer, CustomerPasswordReset


@pytest.fixture
def test_customer(db_session: Session):
    cust = Customer(
        name="Reset Test User",
        email=f"reset_{uuid.uuid4().hex[:6]}@example.com",
        password_hash=hash_password("OriginalPassword123!"),
        phone="9876543210",
        is_active=True,
    )
    db_session.add(cust)
    db_session.commit()
    db_session.refresh(cust)
    return cust


def test_forgot_password_timing_safe_response(client: TestClient, db_session: Session, test_customer: Customer):
    """
    Both existing and non-existing email addresses must receive the exact same response.
    """
    # 1. Existing email
    res1 = client.post("/api/customers/auth/forgot-password", json={"email": test_customer.email})
    assert res1.status_code == 200
    msg1 = res1.json()["message"]

    # 2. Non-existent email
    res2 = client.post("/api/customers/auth/forgot-password", json={"email": "nonexistent_9999@example.com"})
    assert res2.status_code == 200
    msg2 = res2.json()["message"]

    # Response must be identical
    assert msg1 == msg2
    assert "If an account with this email exists" in msg1

    # Verify reset record was generated ONLY for the existing customer
    reset_record = db_session.query(CustomerPasswordReset).filter(
        CustomerPasswordReset.customer_id == test_customer.id
    ).first()
    assert reset_record is not None
    assert reset_record.used_at is None
    assert len(reset_record.token_hash) == 64  # SHA-256


def test_customer_password_reset_flow(client: TestClient, db_session: Session, test_customer: Customer):
    """
    Full reset flow:
    1. Request reset token
    2. Reset password using token
    3. Login with new password
    4. Verify old password fails
    5. Verify token cannot be reused (single-use)
    """
    # 1. Request reset
    req_res = client.post("/api/customers/auth/forgot-password", json={"email": test_customer.email})
    assert req_res.status_code == 200

    # For testing, directly create a known raw token and hash it into the DB
    raw_token = "test-secret-token-12345678901234567890"
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    # Invalidate existing and insert our known token
    db_session.query(CustomerPasswordReset).filter(
        CustomerPasswordReset.customer_id == test_customer.id
    ).delete()

    reset_row = CustomerPasswordReset(
        customer_id=test_customer.id,
        token_hash=token_hash,
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db_session.add(reset_row)
    db_session.commit()

    # 2. Reset password
    new_password = "BrandNewSecurePassword123!"
    reset_res = client.post(
        "/api/customers/auth/reset-password",
        json={"token": raw_token, "new_password": new_password},
    )
    assert reset_res.status_code == 200
    assert "successfully reset" in reset_res.json()["message"]

    # 3. Old password must fail
    login_old = client.post(
        "/api/customers/auth/login",
        json={"email": test_customer.email, "password": "OriginalPassword123!"},
    )
    assert login_old.status_code == 401

    # 4. New password must succeed
    login_new = client.post(
        "/api/customers/auth/login",
        json={"email": test_customer.email, "password": new_password},
    )
    assert login_new.status_code == 200
    assert "access_token" in login_new.json()

    # 5. Token cannot be reused (single-use)
    reuse_res = client.post(
        "/api/customers/auth/reset-password",
        json={"token": raw_token, "new_password": "YetAnotherPassword123!"},
    )
    assert reuse_res.status_code == 400


def test_customer_password_reset_expired_token(client: TestClient, db_session: Session, test_customer: Customer):
    """
    Expired tokens must be rejected.
    """
    raw_token = "expired-token-12345"
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    reset_row = CustomerPasswordReset(
        customer_id=test_customer.id,
        token_hash=token_hash,
        expires_at=datetime.utcnow() - timedelta(minutes=5),  # expired 5 min ago
    )
    db_session.add(reset_row)
    db_session.commit()

    res = client.post(
        "/api/customers/auth/reset-password",
        json={"token": raw_token, "new_password": "NewPassword123!"},
    )
    assert res.status_code == 400


def test_customer_password_reset_audit_logs_contain_no_secrets(
    client: TestClient, db_session: Session, test_customer: Customer
):
    """
    Audit logs must not contain raw tokens or passwords.
    """
    raw_token = "audit-check-token-99999"
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    new_secret_pass = "SecretP@ssword999!"

    reset_row = CustomerPasswordReset(
        customer_id=test_customer.id,
        token_hash=token_hash,
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db_session.add(reset_row)
    db_session.commit()

    client.post(
        "/api/customers/auth/reset-password",
        json={"token": raw_token, "new_password": new_secret_pass},
    )

    logs = (
        db_session.query(AuditLog)
        .filter(AuditLog.event_type.like("auth.customer_password_reset%"))
        .all()
    )
    for log in logs:
        assert raw_token not in log.description
        assert new_secret_pass not in log.description
        if log.details:
            details_str = str(log.details)
            assert raw_token not in details_str
            assert new_secret_pass not in details_str
