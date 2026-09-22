import uuid
from datetime import date
from decimal import Decimal
from sqlalchemy import (
    Boolean,
    Date,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.core.mixins import CreatedAtMixin, TimestampMixin, UUIDPrimaryKeyMixin


class InvoiceSequence(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "invoice_sequences"
    __table_args__ = (
        UniqueConstraint("financial_year", "sequence_type", name="uq_invoice_seq_fy_type"),
    )

    financial_year: Mapped[str] = mapped_column(String(10), index=True, nullable=False)
    sequence_type: Mapped[str] = mapped_column(String(20), default="INV", nullable=False)
    last_number: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Invoice(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "invoices"

    invoice_number: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    financial_year: Mapped[str] = mapped_column(String(10), index=True, nullable=False)
    invoice_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    sale_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sales.id", ondelete="SET NULL"),
        unique=True,
        nullable=True,
        index=True,
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("customers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    staff_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("staff_users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # Seller GST Snapshot
    seller_name: Mapped[str] = mapped_column(String(255), nullable=False)
    seller_gstin: Mapped[str] = mapped_column(String(20), nullable=False)
    seller_state: Mapped[str] = mapped_column(String(100), nullable=False)
    seller_state_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    seller_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    seller_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Buyer Details Snapshot
    buyer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    buyer_gstin: Mapped[str | None] = mapped_column(String(20), nullable=True)
    buyer_state: Mapped[str] = mapped_column(String(100), nullable=False)
    buyer_state_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    buyer_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    buyer_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # GST Rules & Place of Supply
    is_inter_state: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    place_of_supply: Mapped[str] = mapped_column(String(100), nullable=False)

    # Financial Breakdowns
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    cgst_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    sgst_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    igst_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    total_tax: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    grand_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    # Status & Audit
    payment_status: Mapped[str] = mapped_column(String(50), default="unpaid", index=True, nullable=False)
    is_cancelled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    items: Mapped[list["InvoiceItem"]] = relationship(
        "InvoiceItem",
        back_populates="invoice",
        cascade="all, delete-orphan",
    )
    credit_notes: Mapped[list["CreditNote"]] = relationship(
        "CreditNote",
        back_populates="invoice",
    )
    sale = relationship("app.modules.sales.models.Sale")
    customer = relationship("app.modules.auth.models.Customer")
    staff = relationship("app.modules.auth.models.StaffUser")


class InvoiceItem(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    __tablename__ = "invoice_items"

    invoice_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("invoices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("products.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    product_sku: Mapped[str] = mapped_column(String(100), nullable=False)
    hsn_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    taxable_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    gst_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    cgst_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0.00"), nullable=False)
    cgst_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    sgst_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0.00"), nullable=False)
    sgst_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    igst_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0.00"), nullable=False)
    igst_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    invoice: Mapped["Invoice"] = relationship("Invoice", back_populates="items")
    product = relationship("app.modules.catalog.models.Product")


class CreditNote(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "credit_notes"

    credit_note_number: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    financial_year: Mapped[str] = mapped_column(String(10), index=True, nullable=False)
    credit_note_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    invoice_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("invoices.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    staff_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("staff_users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    reason: Mapped[str] = mapped_column(String(500), nullable=False)

    subtotal_refunded: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    cgst_refunded: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    sgst_refunded: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    igst_refunded: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    total_tax_refunded: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    grand_total_refunded: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    invoice: Mapped["Invoice"] = relationship("Invoice", back_populates="credit_notes")
    staff = relationship("app.modules.auth.models.StaffUser")
    items: Mapped[list["CreditNoteItem"]] = relationship(
        "CreditNoteItem",
        back_populates="credit_note",
        cascade="all, delete-orphan",
    )


class CreditNoteItem(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    __tablename__ = "credit_note_items"

    credit_note_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("credit_notes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    invoice_item_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("invoice_items.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    taxable_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    cgst_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    sgst_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    igst_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    credit_note: Mapped["CreditNote"] = relationship("CreditNote", back_populates="items")
    invoice_item = relationship("InvoiceItem")
