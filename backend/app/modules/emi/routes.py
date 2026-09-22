import uuid
from datetime import date
from decimal import Decimal
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.db import get_db
from app.core.money import quantize_money
from app.modules.auth.dependencies import get_current_staff
from app.modules.auth.models import Customer, StaffRole, StaffUser
from app.modules.invoicing.models import Invoice
from app.modules.payments.models import Payment, PaymentMethod, PaymentStatus
from app.modules.emi.models import EmiInstallment, EmiInstallmentStatus, EmiPlan, EmiPlanStatus
from app.modules.emi.schedule import (
    compute_emi_schedule,
    evaluate_installment_status,
    evaluate_plan_status,
)
from app.modules.emi.schemas import (
    EmiInstallmentPreview,
    EmiInstallmentResponse,
    EmiPaymentRequest,
    EmiPaymentSummary,
    EmiPlanCreateRequest,
    EmiPlanDetailResponse,
    EmiPlanListResponse,
    EmiPlanPreviewRequest,
    EmiPlanPreviewResponse,
    EmiPlanResponse,
    OverdueInstallmentResponse,
)

emi_router = APIRouter(tags=["EMI Financing"])


def _calculate_plan_metrics(plan: EmiPlan, as_of: date | None = None) -> tuple[Decimal, Decimal, str]:
    if as_of is None:
        as_of = date.today()

    total_paid = sum((inst.amount_paid for inst in plan.installments), Decimal("0.00"))
    remaining_balance = max(Decimal("0.00"), plan.total_financed - total_paid)
    computed_status = evaluate_plan_status(plan.installments, plan.status, as_of)
    return total_paid, remaining_balance, computed_status


def _build_installment_response(inst: EmiInstallment, as_of: date | None = None) -> EmiInstallmentResponse:
    if as_of is None:
        as_of = date.today()

    remaining_amount = max(Decimal("0.00"), inst.amount_due - inst.amount_paid)
    computed_status = evaluate_installment_status(inst.due_date, inst.amount_due, inst.amount_paid, as_of)
    days_overdue = max(0, (as_of - inst.due_date).days) if as_of > inst.due_date and inst.amount_paid < inst.amount_due else 0

    return EmiInstallmentResponse(
        id=inst.id,
        emi_plan_id=inst.emi_plan_id,
        installment_number=inst.installment_number,
        due_date=inst.due_date,
        amount_due=inst.amount_due,
        amount_paid=inst.amount_paid,
        remaining_amount=remaining_amount,
        status=computed_status,
        days_overdue=days_overdue,
    )


@emi_router.post(
    "/plans/preview",
    response_model=EmiPlanPreviewResponse,
    summary="Preview EMI installment schedule without persisting",
)
def preview_emi_plan(
    payload: EmiPlanPreviewRequest,
    staff: StaffUser = Depends(get_current_staff),
):
    try:
        schedule = compute_emi_schedule(
            principal=payload.principal,
            down_payment=payload.down_payment,
            number_of_installments=payload.number_of_installments,
            start_date=payload.start_date or date.today(),
            interest_rate=payload.interest_rate,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return EmiPlanPreviewResponse(
        principal=schedule["principal"],
        down_payment=schedule["down_payment"],
        financed_principal=schedule["financed_principal"],
        interest_rate=schedule["interest_rate"],
        interest_amount=schedule["interest_amount"],
        total_financed=schedule["total_financed"],
        installment_amount=schedule["installment_amount"],
        number_of_installments=schedule["number_of_installments"],
        start_date=schedule["start_date"],
        installments=[
            EmiInstallmentPreview(
                installment_number=inst["installment_number"],
                due_date=inst["due_date"],
                amount_due=inst["amount_due"],
                amount_paid=inst["amount_paid"],
                status=inst["status"],
            )
            for inst in schedule["installments"]
        ],
    )


@emi_router.post(
    "/plans",
    response_model=EmiPlanDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new EMI financing plan with generated schedule",
)
def create_emi_plan(
    payload: EmiPlanCreateRequest,
    db: Session = Depends(get_db),
    staff: StaffUser = Depends(get_current_staff),
):
    # 1. Verify customer exists
    cust_query = db.execute(select(Customer).where(Customer.id == payload.customer_id))
    customer = cust_query.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")

    # 2. Verify invoice exists if linked
    invoice = None
    if payload.invoice_id:
        inv_query = db.execute(select(Invoice).where(Invoice.id == payload.invoice_id))
        invoice = inv_query.scalar_one_or_none()
        if not invoice:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Linked invoice not found")

    # 3. Compute schedule
    try:
        schedule = compute_emi_schedule(
            principal=payload.principal,
            down_payment=payload.down_payment,
            number_of_installments=payload.number_of_installments,
            start_date=payload.start_date or date.today(),
            interest_rate=payload.interest_rate,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # 4. Create EmiPlan and EmiInstallments
    plan = EmiPlan(
        customer_id=customer.id,
        invoice_id=payload.invoice_id,
        created_by=staff.id,
        principal=schedule["principal"],
        down_payment=schedule["down_payment"],
        number_of_installments=schedule["number_of_installments"],
        interest_rate=schedule["interest_rate"],
        interest_amount=schedule["interest_amount"],
        total_financed=schedule["total_financed"],
        installment_amount=schedule["installment_amount"],
        start_date=schedule["start_date"],
        status=EmiPlanStatus.ACTIVE.value,
        notes=payload.notes,
    )
    db.add(plan)
    db.flush()

    for inst_data in schedule["installments"]:
        inst = EmiInstallment(
            emi_plan_id=plan.id,
            installment_number=inst_data["installment_number"],
            due_date=inst_data["due_date"],
            amount_due=inst_data["amount_due"],
            amount_paid=inst_data["amount_paid"],
            status=inst_data["status"],
        )
        db.add(inst)

    db.commit()

    # Re-fetch with relationships
    stmt = (
        select(EmiPlan)
        .options(
            selectinload(EmiPlan.customer),
            selectinload(EmiPlan.installments),
            selectinload(EmiPlan.payments),
        )
        .where(EmiPlan.id == plan.id)
    )
    res = db.execute(stmt)
    saved_plan = res.scalar_one()

    total_paid, remaining_balance, computed_status = _calculate_plan_metrics(saved_plan)

    return EmiPlanDetailResponse(
        id=saved_plan.id,
        customer_id=saved_plan.customer_id,
        customer_name=saved_plan.customer.name if saved_plan.customer else None,
        invoice_id=saved_plan.invoice_id,
        principal=saved_plan.principal,
        down_payment=saved_plan.down_payment,
        number_of_installments=saved_plan.number_of_installments,
        interest_rate=saved_plan.interest_rate,
        interest_amount=saved_plan.interest_amount,
        total_financed=saved_plan.total_financed,
        installment_amount=saved_plan.installment_amount,
        start_date=saved_plan.start_date,
        status=computed_status,
        notes=saved_plan.notes,
        total_paid=total_paid,
        remaining_balance=remaining_balance,
        created_at=saved_plan.created_at,
        installments=[_build_installment_response(i) for i in saved_plan.installments],
        payments=[],
    )


@emi_router.get(
    "/plans",
    response_model=EmiPlanListResponse,
    summary="List and filter EMI plans",
)
def list_emi_plans(
    customer_id: uuid.UUID | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    staff: StaffUser = Depends(get_current_staff),
):
    stmt = select(EmiPlan).options(
        selectinload(EmiPlan.customer),
        selectinload(EmiPlan.installments),
    )

    if customer_id:
        stmt = stmt.where(EmiPlan.customer_id == customer_id)
    if status_filter:
        stmt = stmt.where(EmiPlan.status == status_filter)

    count_stmt = select(func.count(EmiPlan.id))
    if customer_id:
        count_stmt = count_stmt.where(EmiPlan.customer_id == customer_id)
    if status_filter:
        count_stmt = count_stmt.where(EmiPlan.status == status_filter)

    total_res = db.execute(count_stmt)
    total = total_res.scalar() or 0

    stmt = stmt.order_by(EmiPlan.created_at.desc()).offset((page - 1) * limit).limit(limit)
    res = db.execute(stmt)
    plans = res.scalars().all()

    items = []
    for p in plans:
        total_paid, remaining_balance, computed_status = _calculate_plan_metrics(p)
        items.append(
            EmiPlanResponse(
                id=p.id,
                customer_id=p.customer_id,
                customer_name=p.customer.name if p.customer else None,
                invoice_id=p.invoice_id,
                principal=p.principal,
                down_payment=p.down_payment,
                number_of_installments=p.number_of_installments,
                interest_rate=p.interest_rate,
                interest_amount=p.interest_amount,
                total_financed=p.total_financed,
                installment_amount=p.installment_amount,
                start_date=p.start_date,
                status=computed_status,
                notes=p.notes,
                total_paid=total_paid,
                remaining_balance=remaining_balance,
                created_at=p.created_at,
            )
        )

    return EmiPlanListResponse(items=items, total=total, page=page, limit=limit)


@emi_router.get(
    "/overdue",
    response_model=list[OverdueInstallmentResponse],
    summary="List all overdue installments across plans",
)
def list_overdue_installments(
    db: Session = Depends(get_db),
    staff: StaffUser = Depends(get_current_staff),
):
    today = date.today()
    stmt = (
        select(EmiInstallment, EmiPlan, Customer)
        .join(EmiPlan, EmiInstallment.emi_plan_id == EmiPlan.id)
        .join(Customer, EmiPlan.customer_id == Customer.id)
        .where(
            EmiInstallment.due_date < today,
            EmiInstallment.amount_paid < EmiInstallment.amount_due,
            EmiPlan.status != EmiPlanStatus.CANCELLED.value,
        )
        .order_by(EmiInstallment.due_date.asc())
    )
    res = db.execute(stmt)
    rows = res.all()

    results = []
    for inst, plan, customer in rows:
        amount_overdue = inst.amount_due - inst.amount_paid
        days_overdue = (today - inst.due_date).days
        results.append(
            OverdueInstallmentResponse(
                plan_id=plan.id,
                customer_id=customer.id,
                customer_name=customer.name,
                customer_phone=customer.phone,
                customer_email=customer.email,
                installment_id=inst.id,
                installment_number=inst.installment_number,
                due_date=inst.due_date,
                amount_due=inst.amount_due,
                amount_paid=inst.amount_paid,
                amount_overdue=amount_overdue,
                days_overdue=days_overdue,
            )
        )

    return results


@emi_router.get(
    "/plans/{id}",
    response_model=EmiPlanDetailResponse,
    summary="Get EMI plan details with full schedule and payment history",
)
def get_emi_plan(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    staff: StaffUser = Depends(get_current_staff),
):
    stmt = (
        select(EmiPlan)
        .options(
            selectinload(EmiPlan.customer),
            selectinload(EmiPlan.installments),
            selectinload(EmiPlan.payments),
        )
        .where(EmiPlan.id == id)
    )
    res = db.execute(stmt)
    plan = res.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="EMI plan not found")

    total_paid, remaining_balance, computed_status = _calculate_plan_metrics(plan)

    return EmiPlanDetailResponse(
        id=plan.id,
        customer_id=plan.customer_id,
        customer_name=plan.customer.name if plan.customer else None,
        invoice_id=plan.invoice_id,
        principal=plan.principal,
        down_payment=plan.down_payment,
        number_of_installments=plan.number_of_installments,
        interest_rate=plan.interest_rate,
        interest_amount=plan.interest_amount,
        total_financed=plan.total_financed,
        installment_amount=plan.installment_amount,
        start_date=plan.start_date,
        status=computed_status,
        notes=plan.notes,
        total_paid=total_paid,
        remaining_balance=remaining_balance,
        created_at=plan.created_at,
        installments=[_build_installment_response(i) for i in plan.installments],
        payments=[
            EmiPaymentSummary(
                id=p.id,
                amount=p.amount,
                method=p.method,
                status=p.status,
                idempotency_key=p.idempotency_key,
                reference_id=p.reference_id,
                created_at=p.created_at,
            )
            for p in plan.payments
        ],
    )


@emi_router.post(
    "/plans/{id}/pay",
    response_model=EmiPlanDetailResponse,
    summary="Record an EMI payment with waterfall cascading overpayment allocation",
)
def pay_emi_plan(
    id: uuid.UUID,
    payload: EmiPaymentRequest,
    target_installment_number: int | None = None,
    db: Session = Depends(get_db),
    staff: StaffUser = Depends(get_current_staff),
):
    # 1. Check idempotency: if duplicate key exists, return current state idempotently
    idemp_stmt = select(Payment).where(Payment.idempotency_key == payload.idempotency_key)
    idemp_res = db.execute(idemp_stmt)
    existing_payment = idemp_res.scalar_one_or_none()
    if existing_payment:
        # Return existing plan state without duplicating payment
        return get_emi_plan(id=id, db=db, staff=staff)

    # 2. Fetch plan with installments and invoice
    stmt = (
        select(EmiPlan)
        .options(
            selectinload(EmiPlan.customer),
            selectinload(EmiPlan.installments),
            selectinload(EmiPlan.payments),
        )
        .where(EmiPlan.id == id)
    )
    res = db.execute(stmt)
    plan = res.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="EMI plan not found")

    if plan.status == EmiPlanStatus.COMPLETED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This EMI plan has already been completed in full",
        )

    # 3. Calculate remaining balance of the entire plan
    current_paid = sum((inst.amount_paid for inst in plan.installments), Decimal("0.00"))
    remaining_plan_balance = quantize_money(plan.total_financed - current_paid)

    # Overpayment protection
    if payload.amount > remaining_plan_balance and not payload.allow_overpayment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Payment of ₹{payload.amount} exceeds remaining plan balance of ₹{remaining_plan_balance}. "
                   "Provide allow_overpayment=true with Admin privileges to proceed.",
        )

    if payload.allow_overpayment and staff.role not in (StaffRole.SUPER_ADMIN.value, StaffRole.ADMIN.value):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can authorize payments exceeding remaining balance.",
        )

    # 4. Waterfall Cascading Allocation across installments
    sorted_installments = sorted(plan.installments, key=lambda x: x.installment_number)

    # Determine starting index
    start_idx = 0
    if target_installment_number:
        for idx, inst in enumerate(sorted_installments):
            if inst.installment_number == target_installment_number:
                start_idx = idx
                break

    # Waterfall allocation
    unallocated_payment = payload.amount
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

    # 5. Check if all installments are fully paid -> mark plan completed
    all_paid = all(inst.status == EmiInstallmentStatus.PAID.value for inst in sorted_installments)
    if all_paid:
        plan.status = EmiPlanStatus.COMPLETED.value
    else:
        # Re-evaluate overdue / defaulted
        plan.status = evaluate_plan_status(sorted_installments, plan.status)

    # 6. Create append-only Payment ledger record
    payment_record = Payment(
        customer_id=plan.customer_id,
        invoice_id=plan.invoice_id,
        created_by=staff.id,
        method=PaymentMethod.EMI.value,
        amount=payload.amount,
        status=PaymentStatus.PAID.value,
        idempotency_key=payload.idempotency_key,
        reference_id=payload.reference_id,
        notes=payload.notes,
        emi_plan_id=plan.id,
        emi_installment_id=primary_installment_id,
    )
    db.add(payment_record)

    # 7. If linked to an invoice, synchronize invoice payment_status in same transaction
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
            new_invoice_paid = existing_invoice_paid + payload.amount
            if new_invoice_paid >= invoice.grand_total:
                invoice.payment_status = "paid"
            elif new_invoice_paid > Decimal("0.00"):
                invoice.payment_status = "partially_paid"
            else:
                invoice.payment_status = "unpaid"

    db.commit()

    # Re-fetch and return updated plan details
    return get_emi_plan(id=id, db=db, staff=staff)


@emi_router.post(
    "/plans/{id}/installments/{n}/pay",
    response_model=EmiPlanDetailResponse,
    summary="Record an EMI payment targeting installment N with cascading surplus",
)
def pay_emi_installment(
    id: uuid.UUID,
    n: int,
    payload: EmiPaymentRequest,
    db: Session = Depends(get_db),
    staff: StaffUser = Depends(get_current_staff),
):
    return pay_emi_plan(
        id=id,
        payload=payload,
        target_installment_number=n,
        db=db,
        staff=staff,
    )
