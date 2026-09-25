import logging
from typing import Any, Dict, Optional, Tuple
import uuid
from fastapi import Request
from sqlalchemy.orm import Session

from app.modules.audit.models import AuditLog

logger = logging.getLogger("app.audit")

# Sensitive keys that must NEVER be persisted in audit logs
SENSITIVE_KEYS = {
    "password",
    "password_hash",
    "token",
    "access_token",
    "refresh_token",
    "secret",
    "api_key",
    "api_secret",
    "authorization",
    "cookie",
    "credit_card",
    "card_number",
    "cvv",
}


def sanitize_details(data: Any) -> Any:
    """
    Recursively scrubs known sensitive keys from audit log metadata dictionaries/lists.
    """
    if isinstance(data, dict):
        sanitized = {}
        for k, v in data.items():
            if any(s in str(k).lower() for s in SENSITIVE_KEYS):
                sanitized[k] = "[REDACTED]"
            elif isinstance(v, (dict, list)):
                sanitized[k] = sanitize_details(v)
            else:
                sanitized[k] = v
        return sanitized
    elif isinstance(data, list):
        return [sanitize_details(item) for item in data]
    return data


def get_request_metadata(request: Optional[Request]) -> Tuple[Optional[str], Optional[str]]:
    """
    Extracts client IP address and user-agent string safely from FastAPI Request.
    """
    if not request:
        return None, None

    client_ip = None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    elif request.client:
        client_ip = request.client.host

    user_agent = request.headers.get("user-agent")
    if user_agent:
        user_agent = user_agent[:500]

    return client_ip, user_agent


def log_audit_event(
    db: Session,
    event_type: str,
    description: str,
    actor_id: Optional[uuid.UUID] = None,
    actor_type: str = "system",
    actor_email: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    commit: bool = False,
) -> Optional[AuditLog]:
    """
    Writes an append-only audit record to the database.
    - If called within an existing transaction, does not force commit (flushed along with caller's db.commit()).
    - If commit=True, commits immediately (useful for standalone events like auth attempts).
    - Silently catches errors to ensure business logic is never interrupted by logging failures.
    """
    try:
        sanitized = sanitize_details(details) if details else None

        audit = AuditLog(
            actor_id=actor_id,
            actor_type=actor_type,
            actor_email=actor_email,
            ip_address=ip_address,
            user_agent=user_agent,
            event_type=event_type,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else None,
            description=description[:500],
            details=sanitized,
        )
        db.add(audit)
        if commit:
            db.commit()
            db.refresh(audit)
        return audit
    except Exception as exc:
        logger.error(f"Failed to record audit log: {exc}")
        return None
