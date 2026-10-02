"""
SystemConfig Model — Dynamic key-value configuration store.

Stores business, GST, invoice, inventory, payment, and system settings
as typed key-value pairs in the database, replacing the need to edit
environment variables for runtime configuration.

CRITICAL: Historical transactions are NEVER recalculated when settings change.
All invoices, sales, and payments retain the values they were computed with.
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class SystemConfig(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    Dynamic system configuration key-value store.
    Each row is a single configuration setting identified by a unique `key`.
    The `category` groups settings for UI display (e.g., 'business', 'gst', 'invoice').
    """
    __tablename__ = "system_configs"

    key: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        index=True,
        nullable=False,
    )
    value: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="",
    )
    category: Mapped[str] = mapped_column(
        String(50),
        index=True,
        nullable=False,
        default="general",
    )
    description: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    value_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="string",
        # Supported types: string, number, boolean, json
    )
    is_sensitive: Mapped[bool] = mapped_column(
        default=False,
        nullable=False,
    )
