from decimal import Decimal
from unittest.mock import MagicMock, patch
import uuid
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.modules.auth.models import Customer, StaffRole, StaffUser
from app.modules.notifications.service import BrevoEmailService, email_service
from app.modules.payments.models import PaymentStatus


@pytest.fixture
def auth_staff_admin(client: TestClient, db_session):
    from app.core.security import create_access_token, hash_password

    staff = StaffUser(
        email=f"admin_{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("AdminPass123!"),
        role=StaffRole.ADMIN,
        is_active=True,
    )
    db_session.add(staff)
    db_session.commit()
    db_session.refresh(staff)

    token = create_access_token(subject=str(staff.id), audience="staff", role=staff.role.value)
    return {"Authorization": f"Bearer {token}"}, staff


def test_brevo_email_service_sends_http_request():
    """Verify BrevoEmailService dispatches correct HTTP POST payload to Brevo API."""
    service = BrevoEmailService(
        api_key="xkeysib-test-fake-key",
        from_email="billing@testcorp.com",
        from_name="Test Store",
    )

    with patch("httpx.Client") as mock_client_cls:
        mock_instance = MagicMock()
        mock_client_cls.return_value.__enter__.return_value = mock_instance
        mock_resp = MagicMock()
        mock_resp.status_code = 201
        mock_instance.post.return_value = mock_resp

        success = service.send_email(
            to_email="buyer@example.com",
            subject="Receipt #1234",
            body_text="Your payment of ₹500.00 was received.",
            body_html="<p>Your payment of ₹500.00 was received.</p>",
        )

        assert success is True
        mock_instance.post.assert_called_once()
        args, kwargs = mock_instance.post.call_args
        assert args[0] == "https://api.brevo.com/v3/smtp/email"
        assert kwargs["headers"]["api-key"] == "xkeysib-test-fake-key"
        assert kwargs["headers"]["Content-Type"] == "application/json"
        assert kwargs["json"]["to"] == [{"email": "buyer@example.com"}]
        assert kwargs["json"]["sender"]["name"] == "Test Store"
        assert kwargs["json"]["sender"]["email"] == "billing@testcorp.com"
        assert kwargs["json"]["subject"] == "Receipt #1234"


def test_brevo_email_service_empty_key_fallback():
    """Verify empty API key falls back to log-only dispatch without HTTP calls."""
    service = BrevoEmailService(
        api_key="",
        from_email="billing@testcorp.com",
        from_name="Test Store",
    )
    with patch("httpx.Client") as mock_client_cls:
        success = service.send_email(
            to_email="buyer@example.com",
            subject="Receipt",
            body_text="Payment received",
        )
        assert success is True
        mock_client_cls.assert_not_called()


def test_brevo_email_service_handles_http_errors():
    """Verify BrevoEmailService returns False gracefully on HTTP errors without crashing."""
    service = BrevoEmailService(
        api_key="xkeysib-test-fake-key",
        from_email="billing@testcorp.com",
        from_name="Test Store",
    )
    with patch("httpx.Client") as mock_client_cls:
        mock_instance = MagicMock()
        mock_client_cls.return_value.__enter__.return_value = mock_instance
        mock_resp = MagicMock()
        mock_resp.status_code = 400
        mock_resp.text = "Invalid recipient email"
        mock_instance.post.return_value = mock_resp

        success = service.send_email(
            to_email="invalid@",
            subject="Receipt",
            body_text="Payment received",
        )
        assert success is False


def test_payment_creation_triggers_email(client: TestClient, db_session, auth_staff_admin):
    """Verify recording a payment dispatches payment confirmation email to customer."""
    headers, staff = auth_staff_admin

    from app.core.security import hash_password

    customer = Customer(
        name="Ananya Sharma",
        phone=f"+9198{uuid.uuid4().hex[:8]}",
        email=f"ananya_{uuid.uuid4().hex[:6]}@example.com",
        password_hash=hash_password("CustSecret123!"),
    )
    db_session.add(customer)
    db_session.commit()
    db_session.refresh(customer)

    with patch.object(email_service, "send_email", wraps=email_service.send_email) as mock_send:
        resp = client.post(
            "/api/payments",
            headers=headers,
            json={
                "customer_id": str(customer.id),
                "amount": "1500.00",
                "method": "upi",
                "idempotency_key": f"pay-test-{uuid.uuid4().hex}",
                "reference_id": "UPI-REF-9988",
            },
        )

        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "paid"
        assert Decimal(str(data["amount"])) == Decimal("1500.00")

        # Verify email dispatch was triggered with the customer email
        mock_send.assert_called_once()
        _, kwargs = mock_send.call_args
        assert kwargs["to_email"] == customer.email
        assert "Payment Received: ₹1500.00" in kwargs["subject"]
        assert "Ananya Sharma" in kwargs["body_text"]
        assert "₹1500.00" in kwargs["body_text"]


def test_payment_succeeds_even_if_email_fails(client: TestClient, db_session, auth_staff_admin):
    """Verify that email service failures NEVER roll back or abort payment processing."""
    headers, staff = auth_staff_admin
    from app.core.security import hash_password

    customer = Customer(
        name="Rahul Verma",
        phone=f"+9199{uuid.uuid4().hex[:8]}",
        email=f"rahul_{uuid.uuid4().hex[:6]}@example.com",
        password_hash=hash_password("CustSecret123!"),
    )
    db_session.add(customer)
    db_session.commit()
    db_session.refresh(customer)

    with patch.object(email_service, "send_email", side_effect=Exception("Simulated connection timeout")):
        resp = client.post(
            "/api/payments",
            headers=headers,
            json={
                "customer_id": str(customer.id),
                "amount": "750.00",
                "method": "cash",
                "idempotency_key": f"pay-failover-{uuid.uuid4().hex}",
            },
        )

        # Payment MUST still be 201 Created and persisted
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "paid"
        assert Decimal(str(data["amount"])) == Decimal("750.00")
