from datetime import date, datetime
import enum
import uuid
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    String,
    Text,
    Uuid,
    event,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.core.mixins import CreatedAtMixin, TimestampMixin, UUIDPrimaryKeyMixin


class Warranty(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    Product warranty registration and coverage record.
    Status is dynamically computed based on validity dates, except when claimed.
    """
    __tablename__ = "warranties"

    product_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("products.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("customers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    sale_item_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sale_items.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    serial_number: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        index=True,
    )
    purchase_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)

    is_claimed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    claim_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    product = relationship("app.modules.catalog.models.Product")
    customer = relationship("app.modules.auth.models.Customer")
    sale_item = relationship("app.modules.sales.models.SaleItem")

    @property
    def status(self) -> str:
        """
        Dynamically computed status:
        - If claimed, returns 'claimed'.
        - If end_date < date.today(), returns 'expired'.
        - Otherwise returns 'active'.
        """
        if self.is_claimed:
            return "claimed"
        today = date.today()
        if self.end_date < today:
            return "expired"
        return "active"


class TicketStatus(str, enum.Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    CLOSED = "closed"


class TicketPriority(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class SupportTicket(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    Customer service and technical support ticket.
    """
    __tablename__ = "support_tickets"

    ticket_number: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
        index=True,
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("customers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    attachment_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    attachment_public_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    status: Mapped[str] = mapped_column(
        String(50),
        default=TicketStatus.OPEN.value,
        nullable=False,
        index=True,
    )
    priority: Mapped[str] = mapped_column(
        String(50),
        default=TicketPriority.MEDIUM.value,
        nullable=False,
    )

    assigned_staff_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("staff_users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    customer = relationship("app.modules.auth.models.Customer")
    assigned_staff = relationship("app.modules.auth.models.StaffUser")
    comments: Mapped[list["TicketComment"]] = relationship(
        "TicketComment",
        back_populates="ticket",
        cascade="all, delete-orphan",
        order_by="TicketComment.created_at.asc()",
    )


class TicketComment(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    """
    Append-only communication thread for support tickets.
    Updates and deletes are prohibited to preserve audit trail integrity.
    """
    __tablename__ = "ticket_comments"

    ticket_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("support_tickets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
        index=True,
    )
    author_type: Mapped[str] = mapped_column(
        String(20),  # 'staff' | 'customer'
        nullable=False,
    )
    author_name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)

    ticket: Mapped["SupportTicket"] = relationship("SupportTicket", back_populates="comments")


@event.listens_for(TicketComment, "before_update")
def prevent_ticket_comment_update(mapper, connection, target):
    raise ValueError("TicketComment records are append-only and cannot be updated.")
