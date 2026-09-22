import uuid
from decimal import Decimal
from typing import Tuple
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.money import quantize_money
from app.modules.auth.models import StaffRole, StaffUser
from app.modules.invoicing.models import Invoice
from app.modules.payments.models import Payment, PaymentMethod, PaymentStatus
from app.modules.emi.models import EmiInstallment, EmiInstallmentStatus, EmiPlan, EmiPlanStatus
from app.modules.emi.schedule import evaluate_plan_status


def record_emi_payment_internal(
    db: Session,
    staff: StaffUser,
    plan_id: uuid.UUID,
    amount: Decimal,
    idempotency_key: str,
    method: str = PaymentMethod.EMI.value,
    reference_id: str | None = None,
    notes: str | None = None,
    target_installment_number: int | None = None,
    allow_overpayment: bool = False,
) -> Tuple[Payment, EmiPlan]:
    """
    Consolidated single write path for recording an EMI payment.
    Used by:
    1) Normal installment payment: POST /api/emi/plans/{id}/installments/{n}/pay
    2) Bulk/ad-hoc plan payment: POST /api/emi/plans/{id}/pay
    3) General payments ledger: POST /api/payments (with emi_plan_id or method="emi")

    Performs:
    - Idempotency verification
    - Plan & installment lock/load
    - Overpayment protection & validation
    - Waterfall cascading overpayment allocation across installments
    - Plan status re-evaluation
    - Append-only Payment ledger recording
    - Atomic invoice reconciliation if linked
    """
    # 1. Check idempotency: if duplicate key exists, return existing payment and plan
    idemp_stmt = select(Payment).where(Payment.idempotency_key == idempotency_key)
    idemp_res = db.execute(idemp_stmt)
    existing_payment = idemp_res.scalar_one_or_none()

    plan_stmt = (
        select(EmiPlan)
        .options(
            selectinload(EmiPlan.customer),
            selectinload(EmiPlan.installments),
            selectinload(EmiPlan.payments),
        )
        .where(EmiPlan.id == plan_id)
    )
    plan_res = db.execute(plan_stmt)
    plan = plan_res.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="EMI plan not found")

    if existing_payment:
        return existing_payment, plan

    if plan.status == EmiPlanStatus.COMPLETED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This EMI plan has already been completed in full",
        )

    # 2. Calculate remaining balance of the entire plan
    current_paid = sum((inst.amount_paid for inst in plan.installments), Decimal("0.00"))
    remaining_plan_balance = quantize_money(plan.total_financed - current_paid)

    # Overpayment protection
    if amount > remaining_plan_balance and not allow_overpayment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Payment of ₹{amount} exceeds remaining plan balance of ₹{remaining_plan_balance}. "
                "Provide allow_overpayment=true with Admin privileges to proceed."
            ),
        )

    if allow_overpayment:
        role_val = staff.role.value if isinstance(staff.role, StaffRole) else str(staff.role)
        if role_val not in (StaffRole.SUPER_ADMIN.value, StaffRole.ADMIN.value):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only administrators can authorize payments exceeding remaining balance.",
            )

    # 3. Waterfall Cascading Allocation across installments
    sorted_installments = sorted(plan.installments, key=lambda x: x.installment_number)

    # Determine starting index
    start_idx = 0
    if target_installment_number:
        for idx, inst in enumerate(sorted_installments):
            if inst.installment_number == target_installment_number:
                start_idx = idx
                break

    # Waterfall allocation
    unallocated_payment = amount
    primary_installment_id = None

    for inst in sorted_installments[start_idx:]:
        if unallocated_payment <= Decimal("0.00"):
            break

        needed = quantize_money(inst.amount_due - inst.amount_paid)
        if needed <= Decimal("0.00"):
            continue

        if primary_installment_id is None:
            primary_installment_id = inst.id

        if unallocated_payment >= needed:
            inst.amount_paid = quantize_money(inst.amount_paid + needed)
            inst.status = EmiInstallmentStatus.PAID.value
            unallocated_payment = quantize_money(unallocated_payment - needed)
        else:
            inst.amount_paid = quantize_money(inst.amount_paid + unallocated_payment)
            inst.status = EmiInstallmentStatus.PARTIAL.value
            unallocated_payment = Decimal("0.00")

    # If surplus remains and start_idx > 0, wrap around to earlier unpaid installments
    if unallocated_payment > Decimal("0.00") and start_idx > 0:
        for inst in sorted_installments[:start_idx]:
            if unallocated_payment <= Decimal("0.00"):
                break
            needed = quantize_money(inst.amount_due - inst.amount_paid)
            if needed <= Decimal("0.00"):
                continue

            if unallocated_payment >= needed:
                inst.amount_paid = quantize_money(inst.amount_paid + needed)
                inst.status = EmiInstallmentStatus.PAID.value
                unallocated_payment = quantize_money(unallocated_payment - needed)
            else:
                inst.amount_paid = quantize_money(inst.amount_paid + unallocated_payment)
                inst.status = EmiInstallmentStatus.PARTIAL.value
                unallocated_payment = Decimal("0.00")

    # 4. Check if all installments are fully paid -> mark plan completed
    all_paid = all(inst.status == EmiInstallmentStatus.PAID.value for inst in sorted_installments)
    if all_paid:
        plan.status = EmiPlanStatus.COMPLETED.value
    else:
        # Re-evaluate overdue / defaulted
        plan.status = evaluate_plan_status(sorted_installments, plan.status)

    # 5. Create append-only Payment ledger record
    payment_record = Payment(
        customer_id=plan.customer_id,
        invoice_id=plan.invoice_id,
        created_by=staff.id,
        method=method,
        amount=amount,
        status=PaymentStatus.PAID.value,
        idempotency_key=idempotency_key,
        reference_id=reference_id,
        notes=notes,
        emi_plan_id=plan.id,
        emi_installment_id=primary_installment_id,
    )
    db.add(payment_record)

    # 6. If linked to an invoice, synchronize invoice payment_status in same transaction
    if plan.invoice_id:
        inv_query = db.execute(
            select(Invoice)
            .options(selectinload(Invoice.payments))
            .where(Invoice.id == plan.invoice_id)
        )
        invoice = inv_query.scalar_one_or_none()
        if invoice:
            existing_invoice_paid = sum(
                (p.amount for p in invoice.payments if p.status == PaymentStatus.PAID.value),
                Decimal("0.00"),
            )
            new_invoice_paid = existing_invoice_paid + amount
            if new_invoice_paid >= invoice.grand_total:
                invoice.payment_status = "paid"
            elif new_invoice_paid > Decimal("0.00"):
                invoice.payment_status = "partially_paid"
            else:
                invoice.payment_status = "unpaid"

    db.commit()
    return payment_record, plan
