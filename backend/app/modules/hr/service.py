import calendar
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.money import quantize_money
from app.modules.auth.models import StaffRole, StaffUser
from app.modules.finance.models import Expense
from app.modules.hr.models import SalaryRecord, SalaryRecordStatus
from app.modules.payments.models import Payment, PaymentStatus


def parse_period(period_str: str) -> tuple[int, int, date, date, int]:
    """
    Parses 'YYYY-MM' period string into:
    (year, month, period_start_date, period_end_date, total_days_in_month)
    """
    parts = period_str.strip().split("-")
    year = int(parts[0])
    month = int(parts[1])
    days_in_month = calendar.monthrange(year, month)[1]
    period_start = date(year, month, 1)
    period_end = date(year, month, days_in_month)
    return year, month, period_start, period_end, days_in_month


def calculate_staff_salary(
    staff: StaffUser,
    period_str: str,
) -> Optional[Dict[str, Any]]:
    """
    Computes salary configuration snapshot for a staff member for a specific period.
    Returns None if the staff member is excluded (e.g. inactive for the entire period,
    or joined after the period ended).

    Mid-Period Deactivation Rule:
    - If staff was active throughout the period: full base salary.
    - If staff was deactivated prior to period start: completely excluded (returns None).
    - If staff was deactivated after period end: was active during entire period -> full base salary.
    - If staff was deactivated mid-period (period_start <= deactivated_at.date() <= period_end):
        active_days = (deactivated_at.date() - period_start).days + 1
        prorated_base = quantize_money(base_salary * (active_days / days_in_month))
        Itemized deductions are evaluated based on this prorated base salary.

    Joining Date Proration:
    - If staff joined after period_end: excluded (returns None).
    - If staff joined mid-period (period_start < joining_date <= period_end):
        active_days = (period_end - joining_date).days + 1
        prorated_base = quantize_money(base_salary * (active_days / days_in_month))
    """
    year, month, period_start, period_end, days_in_month = parse_period(period_str)
    base_salary = staff.base_salary or Decimal("0.00")

    # 1. Evaluate joining date
    if staff.joining_date and staff.joining_date > period_end:
        return None  # Has not joined yet for this period

    is_prorated = False
    proration_reason = None
    active_days = days_in_month

    # 2. Evaluate deactivation status
    if not staff.is_active:
        if not staff.deactivated_at:
            # Deactivated with no timestamp -> treated as inactive prior to period
            return None

        deact_date = staff.deactivated_at.date()
        if deact_date < period_start:
            # Fully inactive before period started -> excluded
            return None

        if deact_date <= period_end:
            # Deactivated mid-period!
            # Active from period_start (or joining_date) up to deact_date
            effective_start = staff.joining_date if (staff.joining_date and staff.joining_date > period_start) else period_start
            active_days = (deact_date - effective_start).days + 1
            if active_days <= 0:
                return None
            is_prorated = True
            proration_reason = f"Deactivated mid-period on {deact_date.isoformat()} ({active_days}/{days_in_month} active days)"
    else:
        # Currently active, check if joined mid-period
        if staff.joining_date and staff.joining_date > period_start:
            active_days = (period_end - staff.joining_date).days + 1
            is_prorated = True
            proration_reason = f"Joined mid-period on {staff.joining_date.isoformat()} ({active_days}/{days_in_month} active days)"

    # Cap active days
    active_days = min(active_days, days_in_month)

    # 3. Calculate prorated base salary
    if is_prorated:
        prorated_base = quantize_money((base_salary * Decimal(active_days)) / Decimal(days_in_month))
    else:
        prorated_base = quantize_money(base_salary)

    # 4. Calculate itemized deductions on the prorated base salary
    deductions_list: List[Dict[str, Any]] = []
    total_deductions = Decimal("0.00")

    raw_config = staff.deductions_config or []
    for item in raw_config:
        name = item.get("name", "Deduction")
        dtype = item.get("type", "fixed")
        val = Decimal(str(item.get("value", "0.00")))

        if dtype == "percentage":
            deduction_amount = quantize_money((prorated_base * val) / Decimal("100.00"))
        else:
            deduction_amount = quantize_money(val)

        # Cap deduction at current prorated base
        if deduction_amount > prorated_base:
            deduction_amount = prorated_base

        deductions_list.append({
            "name": name,
            "type": dtype,
            "value": str(val),
            "amount": str(deduction_amount),
        })
        total_deductions = quantize_money(total_deductions + deduction_amount)

    # Total deductions cannot exceed base salary
    if total_deductions > prorated_base:
        total_deductions = prorated_base

    net_salary = quantize_money(prorated_base - total_deductions)

    return {
        "staff_id": staff.id,
        "staff_name": staff.full_name or staff.email.split("@")[0],
        "staff_email": staff.email,
        "employee_code": staff.employee_code,
        "is_active": staff.is_active,
        "is_prorated": is_prorated,
        "proration_reason": proration_reason,
        "active_days": active_days,
        "total_days": days_in_month,
        "original_base_salary": base_salary,
        "prorated_base_salary": prorated_base,
        "deductions": deductions_list,
        "total_deductions": total_deductions,
        "net_salary": net_salary,
    }


def preview_salary_generation(db: Session, period_str: str) -> Dict[str, Any]:
    """
    Generates preview of eligible staff salaries for a period.
    """
    # Fetch all staff members (both active and inactive, to check deactivation dates)
    staff_members = db.execute(select(StaffUser).order_by(StaffUser.email.asc())).scalars().all()

    # Fetch existing salary records for period to flag duplicates
    existing_records = db.execute(
        select(SalaryRecord.staff_id).where(SalaryRecord.period == period_str)
    ).scalars().all()
    already_generated_ids = set(existing_records)

    preview_items = []
    total_net = Decimal("0.00")

    for staff in staff_members:
        calc = calculate_staff_salary(staff, period_str)
        if calc is None:
            continue  # Excluded per rule

        is_already_gen = staff.id in already_generated_ids
        calc["already_generated"] = is_already_gen

        if not is_already_gen:
            total_net = quantize_money(total_net + calc["net_salary"])

        preview_items.append(calc)

    return {
        "period": period_str,
        "eligible_count": len(preview_items),
        "total_net_payout": total_net,
        "items": preview_items,
    }


def generate_salary_records(
    db: Session,
    generator: StaffUser,
    period_str: str,
    notes: Optional[str] = None,
) -> List[SalaryRecord]:
    """
    Generates one SalaryRecord per eligible staff member for the specified period.
    Strictly enforces unique constraint (staff_id, period) by rejecting duplicate generation.
    """
    # 1. Fetch existing records for this period
    existing_records = db.execute(
        select(SalaryRecord.staff_id).where(SalaryRecord.period == period_str)
    ).scalars().all()
    existing_set = set(existing_records)

    staff_members = db.execute(select(StaffUser).order_by(StaffUser.email.asc())).scalars().all()

    eligible_calcs = []
    conflict_names = []

    for staff in staff_members:
        calc = calculate_staff_salary(staff, period_str)
        if calc is None:
            continue

        if staff.id in existing_set:
            conflict_names.append(staff.full_name or staff.email)
        else:
            eligible_calcs.append((staff, calc))

    # If any eligible staff already has a generated record for this period, reject duplicate run
    if conflict_names:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Salary records for period {period_str} already exist for: {', '.join(conflict_names[:5])}. "
                "Regenerating an existing period for staff members is rejected to preserve snapshot immutability."
            ),
        )

    if not eligible_calcs:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No eligible staff members found for salary generation in period {period_str}.",
        )

    created_records: List[SalaryRecord] = []
    now = datetime.now(timezone.utc)

    for staff, calc in eligible_calcs:
        record = SalaryRecord(
            staff_id=staff.id,
            period=period_str,
            base_salary=calc["prorated_base_salary"],
            deductions=calc["deductions"],
            total_deductions=calc["total_deductions"],
            net_salary=calc["net_salary"],
            status=SalaryRecordStatus.GENERATED.value,
            generated_at=now,
            generated_by=generator.id,
            notes=notes or calc.get("proration_reason"),
        )
        db.add(record)
        created_records.append(record)

    db.commit()

    for r in created_records:
        db.refresh(r)

    return created_records


def mark_salary_as_paid(
    db: Session,
    payer: StaffUser,
    salary_record_id: uuid.UUID,
    method: str = "bank_transfer",
    reference_id: Optional[str] = None,
    notes: Optional[str] = None,
) -> SalaryRecord:
    """
    Marks a SalaryRecord as 'paid'.
    Atomically creates:
    1) One Payment ledger record (reusing Phase 8 append-only ledger).
    2) One Finance Expense record (category="Salary", referencing SalaryRecord).
    Rejects duplicate mark-paid attempts.
    """
    stmt = (
        select(SalaryRecord)
        .options(
            selectinload(SalaryRecord.staff),
            selectinload(SalaryRecord.payment),
            selectinload(SalaryRecord.expense),
        )
        .where(SalaryRecord.id == salary_record_id)
        .with_for_update()
    )
    res = db.execute(stmt)
    record = res.scalar_one_or_none()

    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Salary record {salary_record_id} not found.",
        )

    if record.status == SalaryRecordStatus.PAID.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Salary record for {record.staff.email} ({record.period}) is already marked as paid.",
        )

    now = datetime.now(timezone.utc)
    idemp_key = f"salary-payout-{record.id}"

    # 1. Create Payment ledger entry
    payment = Payment(
        invoice_id=None,
        customer_id=None,
        created_by=payer.id,
        method=method,
        amount=record.net_salary,
        status=PaymentStatus.PAID.value,
        idempotency_key=idemp_key,
        reference_id=reference_id,
        notes=notes or f"Salary payout for {record.staff.email} ({record.period})",
    )
    db.add(payment)
    db.flush()

    # 2. Create Finance Expense entry
    staff_display = record.staff.full_name or record.staff.email
    expense = Expense(
        category="Salary",
        amount=record.net_salary,
        description=f"Salary payout for {staff_display} - Period: {record.period} (Record: {record.id})",
        date=date.today(),
        created_by=payer.id,
    )
    db.add(expense)
    db.flush()

    # 3. Update SalaryRecord
    record.status = SalaryRecordStatus.PAID.value
    record.paid_at = now
    record.paid_by = payer.id
    record.payment_id = payment.id
    record.expense_id = expense.id

    db.commit()
    db.refresh(record)

    return record
