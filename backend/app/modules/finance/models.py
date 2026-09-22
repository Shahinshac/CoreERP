import enum
import uuid
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.core.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ExpenseCategory(str, enum.Enum):
    SALARY = "Salary"
    RENT = "Rent"
    UTILITIES = "Utilities"
    TRANSPORT = "Transport"
    MARKETING = "Marketing"
    MAINTENANCE = "Maintenance"
    OTHER = "Other"


class ExpenseSource(str, enum.Enum):
    SYSTEM_SALARY = "system_salary"
    MANUAL = "manual"


class Expense(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    Expenses table for tracking operating costs and business expenditures.
    - system_salary: Generated automatically when Phase 10 salary payouts occur (read-only, cannot be edited/deleted).
    - manual: Created manually by staff (editable, soft-deletable for audit trail).
    """
    __tablename__ = "expenses"

    category: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    created_by: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("staff_users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    source: Mapped[str] = mapped_column(
        String(50),
        default=ExpenseSource.MANUAL.value,
        nullable=False,
        index=True,
    )
    reference_id: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        index=True,
    )

    # Soft delete audit trail for manual expenses
    is_deleted: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        index=True,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("staff_users.id", ondelete="SET NULL"),
        nullable=True,
    )

    author = relationship("app.modules.auth.models.StaffUser", foreign_keys=[created_by])
    deleter = relationship("app.modules.auth.models.StaffUser", foreign_keys=[deleted_by])
