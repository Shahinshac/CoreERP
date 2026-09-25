import uuid
from datetime import datetime
from typing import Any, Dict, Optional
from sqlalchemy import DateTime, JSON, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.mixins import CreatedAtMixin, UUIDPrimaryKeyMixin


class AuditLog(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    """
    Append-only audit trail logging security, business, and data-modifying events.
    Guaranteed immutable: no update or delete routes are exposed.
    """
    __tablename__ = "audit_logs"

    # Actor information (who performed the event)
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid(as_uuid=True), index=True, nullable=True)
    actor_type: Mapped[str] = mapped_column(String(32), default="system", index=True, nullable=False)  # 'staff', 'customer', 'system', 'anonymous'
    actor_email: Mapped[Optional[str]] = mapped_column(String(255), index=True, nullable=True)
    
    # Request network context
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Event classification
    event_type: Mapped[str] = mapped_column(String(64), index=True, nullable=False)  # e.g. 'auth.login', 'product.created', etc.
    resource_type: Mapped[Optional[str]] = mapped_column(String(64), index=True, nullable=True)  # e.g. 'product', 'invoice', etc.
    resource_id: Mapped[Optional[str]] = mapped_column(String(255), index=True, nullable=True)

    # Human-readable summary
    description: Mapped[str] = mapped_column(String(500), nullable=False)

    # Contextual metadata (passwords, tokens, and payment secrets are strictly excluded/redacted)
    details: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
