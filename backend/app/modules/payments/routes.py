import urllib.parse
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.db import get_db
from app.core.money import quantize_money
from app.modules.auth.dependencies import get_current_staff
from app.modules.auth.models import Customer, StaffRole, StaffUser
from app.modules.invoicing.models import Invoice
from app.modules.payments.models import Payment, PaymentMethod, PaymentStatus
from app.modules.payments.schemas import (
    PaymentCreateRequest,
    PaymentListResponse,
    PaymentResponse,
    UPIIntentResponse,
)

router = APIRouter(prefix="/api/payments", tags=["Payments"])


def build_payment_response(db: Session, payment: Payment) -> PaymentResponse:
    """Helper to attach contextual invoice and customer metadata to response."""
    invoice_number = None
    invoice_payment_status = None
    invoice_remaining_balance = None
    customer_name = None

    if payment.invoice_id:
        inv = db.execute(
            select(Invoice)
            .options(selectinload(Invoice.payments))
            .filter(Invoice.id == payment.invoice_id)
        ).scalar_one_or_none()

        if inv:
            invoice_number = inv.invoice_number
            invoice_payment_status = inv.payment_status

            total_paid = sum(
                (p.amount for p in inv.payments if p.status == PaymentStatus.PAID.value),
                Decimal("0.00"),
            )
            remaining = inv.grand_total - total_paid
            invoice_remaining_balance = remaining if remaining > Decimal("0.00") else Decimal("0.00")

    if payment.customer_id:
        cust = db.execute(
            select(Customer).filter(Customer.id == payment.customer_id)
        ).scalar_one_or_none()
        if cust:
            customer_name = cust.name

    return PaymentResponse(
        id=payment.id,
        invoice_id=payment.invoice_id,
        customer_id=payment.customer_id,
        created_by=payment.created_by,
        method=payment.method,
        amount=payment.amount,
        status=payment.status,
        idempotency_key=payment.idempotency_key,
        reference_id=payment.reference_id,
        notes=payment.notes,
        created_at=payment.created_at,
        invoice_number=invoice_number,
        customer_name=customer_name,
        invoice_payment_status=invoice_payment_status,
        invoice_remaining_balance=invoice_remaining_balance,
    )


@router.post(
    "",
    response_model=PaymentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record an append-only payment transaction",
)
def record_payment(
    payload: PaymentCreateRequest,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Records an immutable payment in the ledger.
    - Idempotency: If idempotency_key already exists, returns the original payment record without creating a duplicate.
    - Invoice reconciliation: Updates the associated invoice payment_status atomically (unpaid -> partial -> paid).
    - Overpayment protection: Blocks payments exceeding the remaining invoice balance unless allow_overpayment=True (Admin only).
    """
    # 1. Idempotency Check: return original result if key already processed
    existing_payment = db.execute(
        select(Payment).filter(Payment.idempotency_key == payload.idempotency_key)
    ).scalar_one_or_none()

    if existing_payment:
        return build_payment_response(db, existing_payment)

    customer_id = payload.customer_id
    invoice = None

    # 2. Invoice validation & lock
    if payload.invoice_id:
        invoice = db.execute(
            select(Invoice)
            .options(selectinload(Invoice.payments))
            .filter(Invoice.id == payload.invoice_id)
            .with_for_update()
        ).scalar_one_or_none()

        if not invoice:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Invoice {payload.invoice_id} not found.",
            )

        if invoice.is_cancelled:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot record payment for cancelled/reversed invoice {invoice.invoice_number}.",
            )

        # Inherit customer_id from invoice if not explicitly provided
        if not customer_id and invoice.customer_id:
            customer_id = invoice.customer_id

        # Calculate existing paid payments
        existing_paid = sum(
            (p.amount for p in invoice.payments if p.status == PaymentStatus.PAID.value),
            Decimal("0.00"),
        )
        remaining_balance = quantize_money(invoice.grand_total - existing_paid, allow_negative=True)

        # Overpayment validation
        if payload.amount > remaining_balance:
            if not payload.allow_overpayment:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Payment amount ₹{payload.amount:.2f} exceeds remaining invoice balance "
                        f"₹{max(Decimal('0.00'), remaining_balance):.2f}. Set allow_overpayment=true to override."
                    ),
                )

            # Overpayment allowance is strictly Admin/Super Admin only
            admin_roles = [StaffRole.ADMIN.value, StaffRole.SUPER_ADMIN.value]
            caller_role = current_staff.role.value if isinstance(current_staff.role, StaffRole) else str(current_staff.role)
            if caller_role not in admin_roles:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Overpayment allowance requires Admin privileges.",
                )

    # 3. Create Append-Only Payment Record
    payment = Payment(
        invoice_id=payload.invoice_id,
        customer_id=customer_id,
        created_by=current_staff.id,
        method=payload.method.value,
        amount=payload.amount,
        status=PaymentStatus.PAID.value,
        idempotency_key=payload.idempotency_key,
        reference_id=payload.reference_id,
        notes=payload.notes,
    )
    db.add(payment)
    db.flush()

    # 4. Atomic update of Invoice payment_status
    if invoice:
        # Re-compute cumulative payments including the newly added payment
        total_paid_after = sum(
            (p.amount for p in invoice.payments if p.status == PaymentStatus.PAID.value),
            payment.amount,
        )

        if total_paid_after >= invoice.grand_total:
            invoice.payment_status = "paid"
        elif total_paid_after > Decimal("0.00"):
            invoice.payment_status = "partially_paid"
        else:
            invoice.payment_status = "unpaid"

    db.commit()
    db.refresh(payment)

    return build_payment_response(db, payment)


@router.get(
    "",
    response_model=PaymentListResponse,
    summary="List and filter payments ledger",
)
def list_payments(
    invoice_id: Optional[uuid.UUID] = None,
    customer_id: Optional[uuid.UUID] = None,
    status: Optional[str] = None,
    method: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Queries the append-only payments ledger with multi-column filtering.
    """
    stmt = select(Payment).order_by(Payment.created_at.desc())

    if invoice_id:
        stmt = stmt.filter(Payment.invoice_id == invoice_id)
    if customer_id:
        stmt = stmt.filter(Payment.customer_id == customer_id)
    if status:
        stmt = stmt.filter(Payment.status == status)
    if method:
        stmt = stmt.filter(Payment.method == method)
    if start_date:
        stmt = stmt.filter(func.date(Payment.created_at) >= start_date)
    if end_date:
        stmt = stmt.filter(func.date(Payment.created_at) <= end_date)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.execute(count_stmt).scalar() or 0

    stmt = stmt.offset((page - 1) * limit).limit(limit)
    payments = db.execute(stmt).scalars().all()

    items = [build_payment_response(db, p) for p in payments]

    return PaymentListResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
    )


@router.get(
    "/upi-intent/{invoice_id}",
    response_model=UPIIntentResponse,
    summary="Generate static UPI QR / intent parameters for free-tier zero-cost payments",
)
def get_upi_intent(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Generates a static Indian UPI intent URI for instant QR presentation.
    Zero-cost free-tier approach avoiding third-party gateway transaction commissions.
    Staff verifies bank SMS / credit notification and records confirmation.
    """
    invoice = db.execute(
        select(Invoice)
        .options(selectinload(Invoice.payments))
        .filter(Invoice.id == invoice_id)
    ).scalar_one_or_none()

    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Invoice {invoice_id} not found.",
        )

    # Compute remaining balance
    paid = sum(
        (p.amount for p in invoice.payments if p.status == PaymentStatus.PAID.value),
        Decimal("0.00"),
    )
    remaining = max(Decimal("0.00"), invoice.grand_total - paid)

    # Format authoritative UPI intent URI (NPCI UPI standard specifications)
    seller_name_enc = urllib.parse.quote(settings.SELLER_UPI_NAME or settings.SELLER_NAME)
    note_enc = urllib.parse.quote(f"Invoice {invoice.invoice_number}")
    upi_uri = (
        f"upi://pay?pa={settings.SELLER_UPI_ID}&pn={seller_name_enc}"
        f"&am={remaining:.2f}&cu=INR&tn={note_enc}"
    )

    return UPIIntentResponse(
        upi_uri=upi_uri,
        seller_upi_id=settings.SELLER_UPI_ID,
        seller_name=settings.SELLER_UPI_NAME or settings.SELLER_NAME,
        amount=remaining,
        invoice_number=invoice.invoice_number,
        notes=f"Payment for {invoice.invoice_number} ({invoice.buyer_name})",
    )


@router.get(
    "/{id}",
    response_model=PaymentResponse,
    summary="Get single payment transaction details",
)
def get_payment(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    payment = db.execute(
        select(Payment).filter(Payment.id == id)
    ).scalar_one_or_none()

    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Payment {id} not found.",
        )

    return build_payment_response(db, payment)
