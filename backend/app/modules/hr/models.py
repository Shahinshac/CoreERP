import enum
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.core.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class SalaryRecordStatus(str, enum.Enum):
    GENERATED = "generated"
    PAID = "paid"


class SalaryRecord(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    Immutable snapshotted salary run record for a staff member for a specific period (YYYY-MM).
    UniqueConstraint on (staff_id, period) ensures duplicate generation for the same staff in the
    same period is strictly rejected.
    """
    __tablename__ = "salary_records"

    staff_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("staff_users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    period: Mapped[str] = mapped_column(
        String(7),
        nullable=False,
        index=True,
    )  # Format: "YYYY-MM" (e.g., "2026-09")

    base_salary: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        nullable=False,
    )  # Snapshotted base salary (prorated if staff deactivated mid-period)

    deductions: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON,
        nullable=False,
        default=list,
    )  # Itemized snapshotted deductions: [{name, type, value, amount}]

    total_deductions: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        nullable=False,
    )

    net_salary: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        default=SalaryRecordStatus.GENERATED.value,
        nullable=False,
        index=True,
    )

    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    generated_by: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("staff_users.id", ondelete="RESTRICT"),
        nullable=False,
    )

    paid_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    paid_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("staff_users.id", ondelete="RESTRICT"),
        nullable=True,
    )

    payment_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("payments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    expense_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("expenses.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("staff_id", "period", name="uq_salary_records_staff_period"),
    )

    # Relationships
    staff = relationship(
        "app.modules.auth.models.StaffUser",
        foreign_keys=[staff_id],
    )
    generator = relationship(
        "app.modules.auth.models.StaffUser",
        foreign_keys=[generated_by],
    )
    payer = relationship(
        "app.modules.auth.models.StaffUser",
        foreign_keys=[paid_by],
    )
    payment = relationship(
        "app.modules.payments.models.Payment",
        foreign_keys=[payment_id],
    )
    expense = relationship(
        "app.modules.finance.models.Expense",
        foreign_keys=[expense_id],
    )
