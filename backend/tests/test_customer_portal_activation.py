import secrets
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.modules.auth.models import Customer, StaffRole, StaffUser


def test_customer_portal_activation_after_in_store_sale(client: TestClient, db_session: Session):
    """
    Verifies that a customer created during an in-store sale / POS
    can seamlessly claim and activate their customer portal account
    using the email and details provided during checkout.
    """
    # 1. Staff creates customer in-store without explicit portal password (is_portal_activated = False)
    in_store_customer = Customer(
        email="sale_shopper@example.com",
        name="Arun Kumar",
        phone="+91 9876543210",
        address="123 Retail Lane, Calicut",
        password_hash=hash_password(secrets.token_urlsafe(12)),
        is_portal_activated=False,
        is_active=True,
    )
    db_session.add(in_store_customer)
    db_session.commit()
    db_session.refresh(in_store_customer)

    # 2. If customer tries to log in before registering/activating
    login_attempt = client.post(
        "/api/customers/auth/login",
        json={"email": "sale_shopper@example.com", "password": "anypassword123"},
    )
    assert login_attempt.status_code == 401
    assert "registered in-store" in login_attempt.json()["error"]["message"].lower()
    assert "register" in login_attempt.json()["error"]["message"].lower()

    # 3. Customer tries to register with mismatched phone -> rejected
    mismatch_reg = client.post(
        "/api/customers/auth/register",
        json={
            "email": "sale_shopper@example.com",
            "name": "Arun Kumar",
            "phone": "9999999999",
            "password": "MyChosenPassword123",
        },
    )
    assert mismatch_reg.status_code == 400
    assert "phone number does not match" in mismatch_reg.json()["error"]["message"].lower()

    # 4. Customer registers with matching phone (normalized) and chooses their password -> SUCCESS!
    activate_reg = client.post(
        "/api/customers/auth/register",
        json={
            "email": "sale_shopper@example.com",
            "name": "Arun Kumar",
            "phone": "9876543210",  # Matches the last 10 digits of +91 9876543210
            "password": "MyChosenPassword123",
        },
    )
    assert activate_reg.status_code == 201
    reg_data = activate_reg.json()
    assert "access_token" in reg_data
    assert reg_data["user"]["email"] == "sale_shopper@example.com"
    assert reg_data["user"]["is_portal_activated"] is True

    # 5. Customer can now log in normally using their chosen password
    login_success = client.post(
        "/api/customers/auth/login",
        json={"email": "sale_shopper@example.com", "password": "MyChosenPassword123"},
    )
    assert login_success.status_code == 200
    assert "access_token" in login_success.json()

    # 6. Trying to register again once activated returns 409 Conflict
    dup_reg = client.post(
        "/api/customers/auth/register",
        json={
            "email": "sale_shopper@example.com",
            "name": "Arun Kumar",
            "password": "AnotherPassword456",
        },
    )
    assert dup_reg.status_code == 409
    assert "already registered and active" in dup_reg.json()["error"]["message"].lower()
