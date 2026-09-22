import calendar
from datetime import date
from decimal import Decimal
from typing import Any

from app.core.money import quantize_money
from app.modules.emi.models import EmiInstallmentStatus, EmiPlanStatus


def add_months(orig_date: date, months: int) -> date:
    """
    Safely advances a date by N months, capping to the last day of target month if necessary.
    E.g. Jan 31 + 1 month -> Feb 28 (or Feb 29 in leap years).
    """
    new_year = orig_date.year + (orig_date.month + months - 1) // 12
    new_month = (orig_date.month + months - 1) % 12 + 1
    max_day = calendar.monthrange(new_year, new_month)[1]
    new_day = min(orig_date.day, max_day)
    return date(new_year, new_month, new_day)


def compute_emi_schedule(
    principal: Decimal,
    down_payment: Decimal = Decimal("0.00"),
    number_of_installments: int = 3,
    start_date: date | None = None,
    interest_rate: Decimal | None = None,
) -> dict[str, Any]:
    """
    Computes an exact installment schedule with zero paise lost/gained.
    Rounding remainder is allocated to the final installment.

    Total Financed = (Principal - Down Payment) + Flat Simple Interest
    Base Installment = Total Financed / N (quantized to 2 decimal places)
    Installments 1..(N-1) = Base Installment
    Installment N = Total Financed - Sum(Installments 1..(N-1))
    """
    if start_date is None:
        start_date = date.today()

    principal = quantize_money(principal)
    down_payment = quantize_money(down_payment)

    if down_payment < 0:
        raise ValueError("Down payment cannot be negative")
    if down_payment >= principal:
        raise ValueError("Down payment must be less than principal amount")
    if number_of_installments <= 0:
        raise ValueError("Number of installments must be greater than 0")

    financed_principal = quantize_money(principal - down_payment)

    # Flat Simple Interest calculation if interest_rate provided
    if interest_rate and interest_rate > Decimal("0.00"):
        # Rate is per annum; tenure is number_of_installments months
        annual_rate = interest_rate / Decimal("100")
        tenure_fraction = Decimal(number_of_installments) / Decimal("12")
        interest_amount = quantize_money(financed_principal * annual_rate * tenure_fraction)
    else:
        interest_rate = None
        interest_amount = Decimal("0.00")

    total_financed = quantize_money(financed_principal + interest_amount)
    base_installment = quantize_money(total_financed / Decimal(number_of_installments))

    installments_data = []
    accumulated_due = Decimal("0.00")

    for i in range(1, number_of_installments + 1):
        due_date = add_months(start_date, i)
        if i == number_of_installments:
            # Final installment receives exact remainder
            amount_due = quantize_money(total_financed - accumulated_due)
        else:
            amount_due = base_installment
            accumulated_due += amount_due

        installments_data.append({
            "installment_number": i,
            "due_date": due_date,
            "amount_due": amount_due,
            "amount_paid": Decimal("0.00"),
            "status": EmiInstallmentStatus.PENDING.value,
        })

    # Sanity assertion: installments must sum EXACTLY to total_financed
    total_sum = sum(inst["amount_due"] for inst in installments_data)
    assert total_sum == total_financed, f"EMI schedule discrepancy: {total_sum} != {total_financed}"

    return {
        "principal": principal,
        "down_payment": down_payment,
        "financed_principal": financed_principal,
        "interest_rate": interest_rate,
        "interest_amount": interest_amount,
        "total_financed": total_financed,
        "installment_amount": base_installment,
        "number_of_installments": number_of_installments,
        "start_date": start_date,
        "installments": installments_data,
    }


def evaluate_installment_status(
    due_date: date,
    amount_due: Decimal,
    amount_paid: Decimal,
    as_of_date: date | None = None,
) -> str:
    """
    Computes current status for an installment:
    - paid: amount_paid >= amount_due
    - partial: 0 < amount_paid < amount_due and not overdue
    - overdue: as_of_date > due_date and amount_paid < amount_due (<= 90 days)
    - defaulted: as_of_date > due_date + 90 days and amount_paid < amount_due
    - pending: as_of_date <= due_date and amount_paid == 0
    """
    if amount_paid >= amount_due:
        return EmiInstallmentStatus.PAID.value

    if as_of_date is None:
        as_of_date = date.today()

    if as_of_date > due_date:
        days_overdue = (as_of_date - due_date).days
        if days_overdue > 90:
            return EmiInstallmentStatus.DEFAULTED.value
        return EmiInstallmentStatus.OVERDUE.value

    if amount_paid > Decimal("0.00"):
        return EmiInstallmentStatus.PARTIAL.value

    return EmiInstallmentStatus.PENDING.value


def evaluate_plan_status(
    installments: list[Any],
    current_status: str,
    as_of_date: date | None = None,
) -> str:
    """
    Computes plan lifecycle status:
    - completed: all installments are fully paid
    - defaulted: 3 or more overdue installments, OR any installment > 90 days overdue
    - cancelled: preserved if previously cancelled
    - active: normal in-progress plan
    """
    if current_status == EmiPlanStatus.CANCELLED.value:
        return EmiPlanStatus.CANCELLED.value

    if as_of_date is None:
        as_of_date = date.today()

    all_paid = True
    overdue_count = 0
    has_90_day_default = False

    for inst in installments:
        st = evaluate_installment_status(inst.due_date, inst.amount_due, inst.amount_paid, as_of_date)
        if st != EmiInstallmentStatus.PAID.value:
            all_paid = False

        if st in (EmiInstallmentStatus.OVERDUE.value, EmiInstallmentStatus.DEFAULTED.value):
            overdue_count += 1
            if (as_of_date - inst.due_date).days > 90:
                has_90_day_default = True

    if all_paid and len(installments) > 0:
        return EmiPlanStatus.COMPLETED.value

    if has_90_day_default or overdue_count >= 3:
        return EmiPlanStatus.DEFAULTED.value

    return EmiPlanStatus.ACTIVE.value
