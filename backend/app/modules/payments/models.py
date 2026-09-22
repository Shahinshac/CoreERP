import enum
import uuid
from decimal import Decimal
from sqlalchemy import ForeignKey, Numeric, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.core.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class PaymentMethod(str, enum.Enum):
    CASH = "cash"
    UPI = "upi"
    CARD = "card"
    PAYMENT_LINK = "payment_link"
    EMI = "emi"  # Reserved for Phase 9


class PaymentStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    FAILED = "failed"
    EXPIRED = "expired"


class Payment(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    Append-only payment ledger.
    No update or delete operations are permitted. Corrections are made via new offsetting records.
    """
    __tablename__ = "payments"

    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("invoices.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("customers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("staff_users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    method: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="paid", nullable=False, index=True)
    idempotency_key: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)

    reference_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    emi_plan_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("emi_plans.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    emi_installment_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("emi_installments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Relationships
    invoice = relationship("app.modules.invoicing.models.Invoice", back_populates="payments")
    customer = relationship("app.modules.auth.models.Customer")
    staff = relationship("app.modules.auth.models.StaffUser")
    emi_plan = relationship("app.modules.emi.models.EmiPlan", back_populates="payments")
    emi_installment = relationship("app.modules.emi.models.EmiInstallment", back_populates="payments")
