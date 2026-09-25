import hmac
from fastapi import Header, HTTPException, Security, status
from fastapi.security import APIKeyHeader
from app.core.config import settings

api_key_header = APIKeyHeader(name="X-Automation-Key", auto_error=False)


def verify_automation_secret(
    x_automation_key: str | None = Security(api_key_header),
    authorization: str | None = Header(None),
) -> bool:
    """
    Verifies that incoming machine-to-machine cron calls provide the configured
    AUTOMATION_KEY via 'X-Automation-Key' or 'Authorization: Bearer <KEY>'.
    Rejects unauthorized requests with 401 Unauthorized.
    Uses constant-time comparison to prevent timing side-channel attacks.
    """
    expected = settings.AUTOMATION_KEY
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Automation key is not configured on the server",
        )

    # Check X-Automation-Key header (constant-time comparison)
    if isinstance(x_automation_key, str) and hmac.compare_digest(x_automation_key, expected):
        return True

    # Fallback: check Authorization: Bearer <KEY> (constant-time comparison)
    if isinstance(authorization, str):
        parts = authorization.split(" ")
        if len(parts) == 2 and parts[0].lower() == "bearer" and hmac.compare_digest(parts[1], expected):
            return True

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing automation key",
        headers={"WWW-Authenticate": "ApiKey"},
    )
