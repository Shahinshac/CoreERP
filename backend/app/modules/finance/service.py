import calendar
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.money import quantize_money
from app.modules.catalog.models import Product
from app.modules.emi.models import EmiInstallment, EmiInstallmentStatus, EmiPlan, EmiPlanStatus
from app.modules.finance.models import Expense, ExpenseCategory
from app.modules.finance.schemas import FinancialSummaryResponse
from app.modules.inventory.models import MovementType, StockMovement
from app.modules.invoicing.models import CreditNote, Invoice
from app.modules.payments.models import Payment, PaymentStatus
from app.modules.sales.models import Purchase, SaleReturn


def parse_period_range(period_str: str) -> tuple[int, int, date, date, datetime, datetime]:
    """
    Parses 'YYYY-MM' period string into:
    (year, month, start_date, end_date, start_datetime_utc, end_datetime_utc)
    """
    parts = period_str.strip().split("-")
    year = int(parts[0])
    month = int(parts[1])
    days_in_month = calendar.monthrange(year, month)[1]
    start_date = date(year, month, 1)
    end_date = date(year, month, days_in_month)

    start_dt = datetime(year, month, 1, 0, 0, 0, tzinfo=timezone.utc)
    end_dt = datetime(year, month, days_in_month, 23, 59, 59, 999999, tzinfo=timezone.utc)

    return year, month, start_date, end_date, start_dt, end_dt


def compute_financial_summary(db: Session, period_str: str) -> FinancialSummaryResponse:
    """
    Single source of truth for financial metrics calculation.
    Uses strict Decimal arithmetic via quantize_money. Never fabricates figures (returns explicit 0.00 if empty).

    Methodology:
    1. Primary Revenue: Cash Accounting basis.
       Sum of all paid payments received in the period (Payment.status == 'paid', Payment.created_at in range).
    2. Returns & Refunds: Contra-revenue.
       Sum of all product return refunds issued in period (SaleReturn.total_refund_amount in range).
       Net Revenue = Primary Revenue - Returns & Refunds.
    3. Invoiced Revenue: Accrual Accounting metric.
       Sum of grand_total of all non-cancelled invoices issued in the period (Invoice.invoice_date in range).
    4. Cost of Goods / Purchase Cost:
       Sum of supplier purchases (Purchase.total_amount) plus direct stock-in movements valued at product purchase_price
       (explicitly excluding sale returns and purchase references to avoid double-counting / distortion).
    5. Expenses:
       Sum of all non-deleted operating expenses (manual + system_salary).
    6. Gross Profit:
       Net Revenue - Cost of Goods.
    7. Net Profit:
       Gross Profit - Expenses.
    8. Outstanding Receivables:
       Sum of remaining unpaid balances across all active non-cancelled invoices.
    9. EMI Receivables:
       Sum of remaining unpaid installment balances across active and defaulted EMI plans.
    """
    _, _, start_date, end_date, start_dt, end_dt = parse_period_range(period_str)

    # 1. Primary Revenue: Cash-basis (paid payments received in period)
    cash_rev_stmt = select(func.coalesce(func.sum(Payment.amount), Decimal("0.00"))).where(
        Payment.status == PaymentStatus.PAID.value,
        Payment.created_at >= start_dt,
        Payment.created_at <= end_dt,
    )
    cash_revenue = quantize_money(db.execute(cash_rev_stmt).scalar() or Decimal("0.00"))

    # Sales Returns / Refunds in period
    returns_stmt = select(func.coalesce(func.sum(SaleReturn.total_refund_amount), Decimal("0.00"))).where(
        SaleReturn.created_at >= start_dt,
        SaleReturn.created_at <= end_dt,
    )
    returns_refunded = quantize_money(db.execute(returns_stmt).scalar() or Decimal("0.00"))
    net_revenue = quantize_money(cash_revenue - returns_refunded, allow_negative=True)

    # Invoiced Revenue: Accrual basis (active invoices issued in period)
    invoiced_rev_stmt = select(func.coalesce(func.sum(Invoice.grand_total), Decimal("0.00"))).where(
        Invoice.is_cancelled == False,
        Invoice.invoice_date >= start_date,
        Invoice.invoice_date <= end_date,
    )
    invoiced_revenue = quantize_money(db.execute(invoiced_rev_stmt).scalar() or Decimal("0.00"))

    # Credit notes issued against invoices in period
    cn_stmt = select(func.coalesce(func.sum(CreditNote.grand_total_refunded), Decimal("0.00"))).where(
        CreditNote.credit_note_date >= start_date,
        CreditNote.credit_note_date <= end_date,
    )
    credit_notes_refunded = quantize_money(db.execute(cn_stmt).scalar() or Decimal("0.00"))

    # 2. Cost of Goods / Purchase Cost
    # A. Supplier Purchases in period
    purchases_stmt = select(func.coalesce(func.sum(Purchase.total_amount), Decimal("0.00"))).where(
        Purchase.status != "cancelled",
        Purchase.purchase_date >= start_date,
        Purchase.purchase_date <= end_date,
    )
    purchases_cost = quantize_money(db.execute(purchases_stmt).scalar() or Decimal("0.00"))

    # B. Direct Stock In movements in period (excluding supplier purchases and customer sale returns to prevent double-counting)
    stock_in_stmt = (
        select(func.coalesce(func.sum(StockMovement.quantity * Product.purchase_price), Decimal("0.00")))
        .join(Product, StockMovement.product_id == Product.id)
        .where(
            StockMovement.movement_type == MovementType.IN,
            func.lower(StockMovement.reference_type) != "purchase",
            func.lower(StockMovement.reference_type) != "sale_return",
            StockMovement.created_at >= start_dt,
            StockMovement.created_at <= end_dt,
        )
    )
    stock_in_cost = quantize_money(db.execute(stock_in_stmt).scalar() or Decimal("0.00"))
    total_cost_of_goods = quantize_money(purchases_cost + stock_in_cost)

    # 3. Operating Expenses (all sources, non-deleted)
    expenses_stmt = select(func.coalesce(func.sum(Expense.amount), Decimal("0.00"))).where(
        Expense.is_deleted == False,
        Expense.date >= start_date,
        Expense.date <= end_date,
    )
    total_expenses = quantize_money(db.execute(expenses_stmt).scalar() or Decimal("0.00"))

    # Category breakdown
    breakdown_stmt = (
        select(Expense.category, func.coalesce(func.sum(Expense.amount), Decimal("0.00")))
        .where(
            Expense.is_deleted == False,
            Expense.date >= start_date,
            Expense.date <= end_date,
        )
        .group_by(Expense.category)
    )
    breakdown_rows = db.execute(breakdown_stmt).all()
    expenses_breakdown: Dict[str, Decimal] = {
        cat.value: Decimal("0.00") for cat in ExpenseCategory
    }
    for cat_name, cat_amt in breakdown_rows:
        expenses_breakdown[cat_name] = quantize_money(cat_amt)

    # 4. Gross Profit & Net Profit
    gross_profit = quantize_money(net_revenue - total_cost_of_goods, allow_negative=True)
    net_profit = quantize_money(gross_profit - total_expenses, allow_negative=True)

    # 5. Outstanding Receivables (Invoices)
    # Sum remaining unpaid balances across all active non-cancelled invoices
    active_invoices_stmt = (
        select(Invoice)
        .options(selectinload(Invoice.payments))
        .where(
            Invoice.is_cancelled == False,
            Invoice.payment_status != "paid",
        )
    )
    active_invoices = db.execute(active_invoices_stmt).scalars().all()
    total_invoice_receivables = Decimal("0.00")

    for inv in active_invoices:
        paid_sum = sum(
            (p.amount for p in inv.payments if p.status == PaymentStatus.PAID.value),
            Decimal("0.00"),
        )
        remaining = quantize_money(inv.grand_total - paid_sum, allow_negative=True)
        if remaining > Decimal("0.00"):
            total_invoice_receivables = quantize_money(total_invoice_receivables + remaining)

    # 6. EMI Receivables
    # Sum unpaid installment balances across active and defaulted EMI plans
    emi_inst_stmt = (
        select(func.coalesce(func.sum(EmiInstallment.amount_due - EmiInstallment.amount_paid), Decimal("0.00")))
        .join(EmiPlan, EmiInstallment.emi_plan_id == EmiPlan.id)
        .where(
            EmiPlan.status.in_([EmiPlanStatus.ACTIVE.value, EmiPlanStatus.DEFAULTED.value]),
            EmiInstallment.status != EmiInstallmentStatus.PAID.value,
        )
    )
    emi_receivables = quantize_money(db.execute(emi_inst_stmt).scalar() or Decimal("0.00"))

    total_receivables = quantize_money(total_invoice_receivables + emi_receivables)

    return FinancialSummaryResponse(
        period=period_str,
        revenue=cash_revenue,
        returns_refunded=returns_refunded,
        net_revenue=net_revenue,
        invoiced_revenue=invoiced_revenue,
        credit_notes_refunded=credit_notes_refunded,
        cost_of_goods=total_cost_of_goods,
        expenses=total_expenses,
        expenses_breakdown=expenses_breakdown,
        gross_profit=gross_profit,
        net_profit=net_profit,
        outstanding_receivables=total_invoice_receivables,
        emi_receivables=emi_receivables,
        total_receivables=total_receivables,
        accounting_basis="Cash basis primary (with accrual invoice metrics)",
    )
