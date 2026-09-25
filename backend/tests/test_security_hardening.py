import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.core.rate_limit import InMemoryRateLimiter, auth_rate_limiter
from app.modules.automation.security import verify_automation_secret


def test_security_headers_present_on_responses(client: TestClient):
    """
    Verify standard security headers are injected by SecurityHeadersMiddleware:
    - X-Content-Type-Options: nosniff
    - X-Frame-Options: DENY
    - Referrer-Policy: strict-origin-when-cross-origin
    - Permissions-Policy
    """
    resp = client.get("/api/ping")
    assert resp.status_code == 200
    assert resp.headers.get("x-content-type-options") == "nosniff"
    assert resp.headers.get("x-frame-options") == "DENY"
    assert resp.headers.get("referrer-policy") == "strict-origin-when-cross-origin"
    assert "geolocation=()" in resp.headers.get("permissions-policy", "")


def test_automation_secret_timing_safe_verification():
    """
    Verify constant-time automation secret check accepts valid secrets and rejects invalid ones.
    """
    from app.core.config import settings
    # Valid key
    assert verify_automation_secret(x_automation_key=settings.AUTOMATION_KEY) is True
    assert verify_automation_secret(authorization=f"Bearer {settings.AUTOMATION_KEY}") is True

    # Invalid key
    with pytest.raises(Exception) as exc:
        verify_automation_secret(x_automation_key="invalid-secret-key")
    assert "401" in str(exc.value)


def test_auth_rate_limiter_throttles_excessive_attempts(client: TestClient):
    """
    Verify in-memory rate limiter raises 429 Too Many Requests when threshold is reached.
    """
    test_limiter = InMemoryRateLimiter(requests_limit=3, window_seconds=60)

    # Fake request class to test limiter directly
    class DummyRequest:
        headers = {}
        client = type("Client", (), {"host": "192.168.1.100"})()

    req = DummyRequest()

    # Attempts 1, 2, 3 succeed
    test_limiter.check(req)
    test_limiter.check(req)
    test_limiter.check(req)

    # Attempt 4 must raise 429
    with pytest.raises(Exception) as exc_info:
        test_limiter.check(req)
    assert exc_info.value.status_code == 429
    assert "Too many requests" in exc_info.value.detail


def test_production_environment_rejects_insecure_secrets():
    """
    Verify that initializing settings with ENVIRONMENT='production' and default insecure
    secrets raises a validation error.
    """
    with pytest.raises(ValidationError):
        Settings(
            ENVIRONMENT="production",
            JWT_SECRET="insecure-dev-secret-change-in-production",
            AUTOMATION_KEY="insecure-automation-secret-change-in-production",
        )
