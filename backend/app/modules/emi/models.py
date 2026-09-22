import enum
import uuid
from datetime import date
from decimal import Decimal
from sqlalchemy import Date, ForeignKey, Integer, Numeric, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.core.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class EmiPlanStatus(str, enum.Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    DEFAULTED = "defaulted"
    CANCELLED = "cancelled"


class EmiInstallmentStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    PARTIAL = "partial"
    OVERDUE = "overdue"
    DEFAULTED = "defaulted"


class EmiPlan(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    EMI financing plan for retail sales or customer accounts.
    Generates a fixed installment schedule with exact fractional remainder accounting.
    """
    __tablename__ = "emi_plans"

    customer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("customers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("invoices.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("staff_users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    principal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    down_payment: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    number_of_installments: Mapped[int] = mapped_column(Integer, nullable=False)
    interest_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    interest_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    total_financed: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    installment_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default=EmiPlanStatus.ACTIVE.value, nullable=False, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    customer = relationship("app.modules.auth.models.Customer")
    invoice = relationship("app.modules.invoicing.models.Invoice")
    staff = relationship("app.modules.auth.models.StaffUser")
    installments: Mapped[list["EmiInstallment"]] = relationship(
        "EmiInstallment",
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="EmiInstallment.installment_number",
    )
    payments = relationship("app.modules.payments.models.Payment", back_populates="emi_plan")


class EmiInstallment(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    Individual installment in an EMI plan.
    Installment amounts sum exactly to EmiPlan.total_financed.
    """
    __tablename__ = "emi_installments"

    emi_plan_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("emi_plans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    installment_number: Mapped[int] = mapped_column(Integer, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    amount_due: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50),
        default=EmiInstallmentStatus.PENDING.value,
        nullable=False,
        index=True,
    )

    # Relationships
    plan: Mapped["EmiPlan"] = relationship("EmiPlan", back_populates="installments")
    payments = relationship("app.modules.payments.models.Payment", back_populates="emi_installment")
