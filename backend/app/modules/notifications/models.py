from datetime import datetime
import uuid
from sqlalchemy import DateTime, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.mixins import CreatedAtMixin, UUIDPrimaryKeyMixin


class Notification(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    """
    In-app notification ledger for staff members and portal customers.
    """
    __tablename__ = "notifications"

    recipient_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
        index=True,
    )
    recipient_type: Mapped[str] = mapped_column(
        String(20),  # 'staff' | 'customer'
        nullable=False,
        index=True,
    )
    type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )
    message: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    link: Mapped[str | None] = mapped_column(
        String(300),
        nullable=True,
    )
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
        index=True,
    )
