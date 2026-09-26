"""
Phase 12 — Reports & Analytics

Report query services, one pure function per report type.
All aggregation/calculation reuses existing service functions where possible (FinancialService, etc.).
No business logic is re-implemented here — this layer is a thin query/aggregation wrapper.

Row-limiting approach:
  - On-screen: paginated query (page / page_size) with max page_size capped at 500 rows.
  - Exports: streaming via yield_per(1000) batches; no unbounded load into memory.

Export format decision (documented here for reference):
  - Sales report:       CSV + Excel + PDF
  - Profit/Loss report: CSV + Excel + PDF
  - Inventory report:   CSV + Excel     (large catalogs impractical as PDF)
  - GST report:         CSV + Excel     (filing-reference structured data, not formatted document)
  - Payments report:    CSV only        (ledger data consumed programmatically)
  - Customers report:   CSV only        (CRM export)
  - EMI report:         CSV only        (structured installment data)
  - Salary report:      CSV only        (payroll structured data)
  - Expenses report:    CSV only        (operating expense ledger)
  - Purchases report:   CSV only        (procurement ledger)
"""
from __future__ import annotations

import calendar
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, Iterator, List, Optional, Tuple

import uuid
from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import Session, selectinload

from app.core.money import quantize_money
from app.modules.auth.models import Customer, StaffUser
from app.modules.catalog.models import Category, Product
from app.modules.emi.models import EmiInstallment, EmiInstallmentStatus, EmiPlan, EmiPlanStatus
from app.modules.finance.models import Expense, ExpenseCategory, ExpenseSource
from app.modules.finance.service import compute_financial_summary
from app.modules.hr.models import SalaryRecord, SalaryRecordStatus
from app.modules.inventory.models import MovementType, StockMovement
from app.modules.invoicing.models import CreditNote, Invoice, InvoiceItem
from app.modules.payments.models import Payment, PaymentMethod, PaymentStatus
from app.modules.sales.models import Purchase, PurchaseItem, Sale, SaleItem, SaleReturn

PAGE_SIZE_MAX = 500
EXPORT_CHUNK = 1000


def _date_range(start_date: date, end_date: date) -> Tuple[datetime, datetime]:
    """Convert date bounds to UTC datetime bounds for timestamp columns."""
    start_dt = datetime(start_date.year, start_date.month, start_date.day, 0, 0, 0, tzinfo=timezone.utc)
    end_dt = datetime(end_date.year, end_date.month, end_date.day, 23, 59, 59, 999999, tzinfo=timezone.utc)
    return start_dt, end_dt


# ==========================================
# 1. SALES REPORT
# ==========================================

def get_sales_report(
    db: Session,
    start_date: date,
    end_date: date,
    page: int = 1,
    page_size: int = 50,
) -> Dict[str, Any]:
    """
    Returns paginated daily sale records with totals, tax, and discount aggregates.
    On-screen view only — uses page / page_size with cap at PAGE_SIZE_MAX.
    """
    page_size = min(page_size, PAGE_SIZE_MAX)
    start_dt, end_dt = _date_range(start_date, end_date)

    base_q = (
        db.query(Sale)
        .options(selectinload(Sale.returns), selectinload(Sale.customer))
        .filter(Sale.created_at >= start_dt, Sale.created_at <= end_dt)
    )
    total = base_q.count()
    rows = (
        base_q
        .order_by(Sale.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # Aggregates over full range
    agg = db.execute(
        select(
            func.coalesce(func.sum(Sale.subtotal), Decimal("0.00")).label("total_subtotal"),
            func.coalesce(func.sum(Sale.discount_amount), Decimal("0.00")).label("total_discount"),
            func.coalesce(func.sum(Sale.tax_amount), Decimal("0.00")).label("total_tax"),
            func.coalesce(func.sum(Sale.total_amount), Decimal("0.00")).label("total_revenue"),
            func.count(Sale.id).label("count"),
        ).where(Sale.created_at >= start_dt, Sale.created_at <= end_dt)
    ).one()

    # Returns & refunds aggregates over full range
    returns_agg = db.execute(
        select(
            func.coalesce(func.sum(SaleReturn.total_refund_amount), Decimal("0.00")).label("total_refunds"),
            func.count(SaleReturn.id).label("returns_count"),
        ).where(SaleReturn.created_at >= start_dt, SaleReturn.created_at <= end_dt)
    ).one()

    total_refunds = quantize_money(returns_agg.total_refunds)
    gross_revenue = quantize_money(agg.total_revenue)
    net_revenue = quantize_money(gross_revenue - total_refunds, allow_negative=True)

    return {
        "report_type": "sales",
        "start_date": str(start_date),
        "end_date": str(end_date),
        "total_records": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "summary": {
            "total_sales": int(agg.count),
            "total_subtotal": str(quantize_money(agg.total_subtotal)),
            "total_discount": str(quantize_money(agg.total_discount)),
            "total_tax": str(quantize_money(agg.total_tax)),
            "total_revenue": str(gross_revenue),
            "total_refunds": str(total_refunds),
            "total_returns_count": int(returns_agg.returns_count),
            "net_revenue": str(net_revenue),
        },
        "rows": [_sale_row(s) for s in rows],
    }


def _sale_row(s: Sale) -> Dict[str, Any]:
    returned_amount = sum((r.total_refund_amount for r in (s.returns or [])), Decimal("0.00"))
    net_amount = quantize_money(s.total_amount - returned_amount, allow_negative=True)
    return {
        "id": str(s.id),
        "invoice_number": s.invoice_number,
        "sale_date": s.created_at.strftime("%Y-%m-%d"),
        "customer_id": str(s.customer_id) if s.customer_id else None,
        "customer_name": s.customer.name if s.customer else "Walk-in Customer",
        "subtotal": str(quantize_money(s.subtotal)),
        "discount_amount": str(quantize_money(s.discount_amount)),
        "tax_amount": str(quantize_money(s.tax_amount)),
        "total_amount": str(quantize_money(s.total_amount)),
        "returned_amount": str(quantize_money(returned_amount)),
        "net_amount": str(net_amount),
        "status": s.status,
        "payment_method": s.payment_method,
    }


def iter_sales_rows(db: Session, start_date: date, end_date: date) -> Iterator[Dict[str, Any]]:
    """Streaming iterator for export — yields rows in EXPORT_CHUNK batches."""
    start_dt, end_dt = _date_range(start_date, end_date)
    offset = 0
    while True:
        chunk = (
            db.query(Sale)
            .options(selectinload(Sale.returns), selectinload(Sale.customer))
            .filter(Sale.created_at >= start_dt, Sale.created_at <= end_dt)
            .order_by(Sale.created_at.asc())
            .offset(offset)
            .limit(EXPORT_CHUNK)
            .all()
        )
        if not chunk:
            break
        for s in chunk:
            yield _sale_row(s)
        offset += EXPORT_CHUNK


# ==========================================
# 2. PURCHASES REPORT
# ==========================================

def get_purchases_report(
    db: Session,
    start_date: date,
    end_date: date,
    page: int = 1,
    page_size: int = 50,
) -> Dict[str, Any]:
    page_size = min(page_size, PAGE_SIZE_MAX)

    base_q = db.query(Purchase).filter(
        Purchase.purchase_date >= start_date,
        Purchase.purchase_date <= end_date,
    )
    total = base_q.count()
    rows = base_q.order_by(Purchase.purchase_date.desc()).offset((page - 1) * page_size).limit(page_size).all()

    agg = db.execute(
        select(
            func.coalesce(func.sum(Purchase.total_amount), Decimal("0.00")).label("total"),
            func.count(Purchase.id).label("count"),
        ).where(Purchase.purchase_date >= start_date, Purchase.purchase_date <= end_date)
    ).one()

    return {
        "report_type": "purchases",
        "start_date": str(start_date),
        "end_date": str(end_date),
        "total_records": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "summary": {
            "total_purchases": int(agg.count),
            "total_amount": str(quantize_money(agg.total)),
        },
        "rows": [_purchase_row(p, db) for p in rows],
    }


def _purchase_row(p: Purchase, db: Session) -> Dict[str, Any]:
    supplier_name = p.supplier.name if p.supplier else "Unknown"
    return {
        "id": str(p.id),
        "purchase_date": str(p.purchase_date),
        "supplier_name": supplier_name,
        "total_amount": str(quantize_money(p.total_amount)),
        "status": p.status,
    }


def iter_purchase_rows(db: Session, start_date: date, end_date: date) -> Iterator[Dict[str, Any]]:
    offset = 0
    while True:
        chunk = (
            db.query(Purchase)
            .filter(Purchase.purchase_date >= start_date, Purchase.purchase_date <= end_date)
            .order_by(Purchase.purchase_date.asc())
            .offset(offset).limit(EXPORT_CHUNK).all()
        )
        if not chunk:
            break
        for p in chunk:
            yield _purchase_row(p, db)
        offset += EXPORT_CHUNK


# ==========================================
# 3. INVENTORY REPORT
# ==========================================

def get_inventory_report(
    db: Session,
    page: int = 1,
    page_size: int = 50,
    low_stock_only: bool = False,
) -> Dict[str, Any]:
    page_size = min(page_size, PAGE_SIZE_MAX)

    base_q = db.query(Product, Category.name.label("category_name")).join(
        Category, Product.category_id == Category.id, isouter=True
    ).filter(Product.is_active == True)

    if low_stock_only:
        base_q = base_q.filter(Product.current_stock <= Product.min_stock)

    total = base_q.count()
    rows = base_q.order_by(Product.name.asc()).offset((page - 1) * page_size).limit(page_size).all()

    # Aggregate valuation
    total_val = sum(
        (quantize_money(p.current_stock * p.purchase_price, allow_negative=True) for p, _ in rows),
        Decimal("0.00"),
    )

    return {
        "report_type": "inventory",
        "total_records": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "low_stock_only": low_stock_only,
        "summary": {
            "total_products": total,
            "page_valuation": str(quantize_money(total_val, allow_negative=True)),
        },
        "rows": [_inventory_row(p, cat_name) for p, cat_name in rows],
    }


def _inventory_row(p: Product, cat_name: Optional[str]) -> Dict[str, Any]:
    valuation = quantize_money(p.current_stock * p.purchase_price, allow_negative=True)
    return {
        "id": str(p.id),
        "name": p.name,
        "sku": p.sku,
        "hsn_code": p.hsn_code or "—",
        "category": cat_name or "—",
        "current_stock": str(p.current_stock),
        "min_stock": str(p.min_stock),
        "purchase_price": str(p.purchase_price),
        "selling_price": str(p.selling_price),
        "valuation": str(valuation),
        "is_low_stock": p.current_stock <= p.min_stock,
    }


def iter_inventory_rows(db: Session, low_stock_only: bool = False) -> Iterator[Dict[str, Any]]:
    offset = 0
    while True:
        q = (
            db.query(Product, Category.name.label("cat_name"))
            .join(Category, Product.category_id == Category.id, isouter=True)
            .filter(Product.is_active == True)
        )
        if low_stock_only:
            q = q.filter(Product.current_stock <= Product.min_stock)
        chunk = q.order_by(Product.name.asc()).offset(offset).limit(EXPORT_CHUNK).all()
        if not chunk:
            break
        for p, cat_name in chunk:
            yield _inventory_row(p, cat_name)
        offset += EXPORT_CHUNK


# ==========================================
# 3B. INVENTORY AGING / DEAD STOCK REPORT
# ==========================================

def get_inventory_aging_report(
    db: Session,
    page: int = 1,
    page_size: int = 50,
    bucket: Optional[str] = None,
    category_id: Optional[uuid.UUID] = None,
    search: Optional[str] = None,
) -> Dict[str, Any]:
    page_size = min(page_size, PAGE_SIZE_MAX)
    today = date.today()

    query = (
        db.query(Product, Category.name.label("category_name"))
        .join(Category, Product.category_id == Category.id, isouter=True)
        .filter(Product.is_active == True)
    )

    if category_id:
        query = query.filter(Product.category_id == category_id)
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(or_(Product.name.ilike(term), Product.sku.ilike(term)))

    # Fetch last outbound movement for all products
    last_movements = (
        db.query(
            StockMovement.product_id,
            func.max(StockMovement.created_at).label("last_out"),
        )
        .filter(StockMovement.movement_type == MovementType.OUT)
        .group_by(StockMovement.product_id)
        .all()
    )
    last_out_map = {p_id: last_out for p_id, last_out in last_movements}

    all_products = query.order_by(Product.name.asc()).all()

    bucket_counts = {"0-30": 0, "31-60": 0, "61-90": 0, "90+": 0}
    bucket_valuations = {
        "0-30": Decimal("0.00"),
        "31-60": Decimal("0.00"),
        "61-90": Decimal("0.00"),
        "90+": Decimal("0.00"),
    }

    all_rows = []
    total_inventory_val = Decimal("0.00")

    for p, cat_name in all_products:
        val = quantize_money(p.current_stock * p.purchase_price, allow_negative=True)
        total_inventory_val += max(Decimal("0.00"), val)

        last_dt = last_out_map.get(p.id)
        if last_dt:
            last_date = last_dt.date() if isinstance(last_dt, datetime) else last_dt
            days_inactive = max(0, (today - last_date).days)
            last_sale_str = str(last_date)
        else:
            created_d = p.created_at.date() if p.created_at else today
            days_inactive = max(0, (today - created_d).days)
            last_sale_str = "Never"

        if days_inactive <= 30:
            b = "0-30"
        elif days_inactive <= 60:
            b = "31-60"
        elif days_inactive <= 90:
            b = "61-90"
        else:
            b = "90+"

        bucket_counts[b] += 1
        bucket_valuations[b] += max(Decimal("0.00"), val)

        row_item = {
            "id": str(p.id),
            "name": p.name,
            "sku": p.sku,
            "hsn_code": p.hsn_code or "—",
            "category": cat_name or "—",
            "current_stock": str(p.current_stock),
            "purchase_price": str(p.purchase_price),
            "selling_price": str(p.selling_price),
            "valuation": str(val),
            "last_sale_date": last_sale_str,
            "days_inactive": days_inactive,
            "bucket": b,
        }
        all_rows.append(row_item)

    if bucket and bucket in bucket_counts:
        filtered_rows = [r for r in all_rows if r["bucket"] == bucket]
    else:
        filtered_rows = all_rows

    filtered_rows.sort(key=lambda x: x["days_inactive"], reverse=True)

    total_records = len(filtered_rows)
    start_idx = (page - 1) * page_size
    paged_rows = filtered_rows[start_idx : start_idx + page_size]

    return {
        "report_type": "inventory-aging",
        "total_records": total_records,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total_records + page_size - 1) // page_size),
        "summary": {
            "total_products": len(all_products),
            "total_valuation": str(quantize_money(total_inventory_val)),
            "dead_stock_count": bucket_counts["90+"],
            "dead_stock_valuation": str(quantize_money(bucket_valuations["90+"])),
            "buckets": {
                k: {
                    "count": bucket_counts[k],
                    "valuation": str(quantize_money(bucket_valuations[k])),
                }
                for k in bucket_counts
            },
        },
        "rows": paged_rows,
    }


def iter_inventory_aging_rows(
    db: Session,
    bucket: Optional[str] = None,
    category_id: Optional[uuid.UUID] = None,
) -> Iterator[Dict[str, Any]]:
    report = get_inventory_aging_report(
        db, page=1, page_size=10000, bucket=bucket, category_id=category_id
    )
    for r in report["rows"]:
        yield r



# ==========================================
# 4. CUSTOMERS REPORT
# ==========================================

def get_customers_report(
    db: Session,
    start_date: date,
    end_date: date,
    page: int = 1,
    page_size: int = 50,
) -> Dict[str, Any]:
    page_size = min(page_size, PAGE_SIZE_MAX)
    start_dt, end_dt = _date_range(start_date, end_date)

    base_q = db.query(Customer).filter(
        Customer.created_at >= start_dt, Customer.created_at <= end_dt
    )
    total = base_q.count()
    rows = base_q.order_by(Customer.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    return {
        "report_type": "customers",
        "start_date": str(start_date),
        "end_date": str(end_date),
        "total_records": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "summary": {"new_customers": total},
        "rows": [_customer_row(c) for c in rows],
    }


def _customer_row(c: Customer) -> Dict[str, Any]:
    return {
        "id": str(c.id),
        "name": c.name or "—",
        "email": c.email,
        "phone": c.phone or "—",
        "is_active": c.is_active,
        "joined_date": c.created_at.strftime("%Y-%m-%d"),
    }


def iter_customer_rows(db: Session, start_date: date, end_date: date) -> Iterator[Dict[str, Any]]:
    start_dt, end_dt = _date_range(start_date, end_date)
    offset = 0
    while True:
        chunk = (
            db.query(Customer)
            .filter(Customer.created_at >= start_dt, Customer.created_at <= end_dt)
            .order_by(Customer.created_at.asc())
            .offset(offset).limit(EXPORT_CHUNK).all()
        )
        if not chunk:
            break
        for c in chunk:
            yield _customer_row(c)
        offset += EXPORT_CHUNK


# ==========================================
# 5. PAYMENTS REPORT
# ==========================================

def get_payments_report(
    db: Session,
    start_date: date,
    end_date: date,
    page: int = 1,
    page_size: int = 50,
) -> Dict[str, Any]:
    page_size = min(page_size, PAGE_SIZE_MAX)
    start_dt, end_dt = _date_range(start_date, end_date)

    base_q = db.query(Payment).filter(
        Payment.created_at >= start_dt, Payment.created_at <= end_dt
    )
    total = base_q.count()
    rows = base_q.order_by(Payment.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    agg = db.execute(
        select(
            func.coalesce(func.sum(Payment.amount), Decimal("0.00")).label("total"),
            func.count(Payment.id).label("count"),
        ).where(
            Payment.status == PaymentStatus.PAID.value,
            Payment.created_at >= start_dt,
            Payment.created_at <= end_dt,
        )
    ).one()

    return {
        "report_type": "payments",
        "start_date": str(start_date),
        "end_date": str(end_date),
        "total_records": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "summary": {
            "paid_count": int(agg.count),
            "total_received": str(quantize_money(agg.total)),
        },
        "rows": [_payment_row(p) for p in rows],
    }


def _payment_row(p: Payment) -> Dict[str, Any]:
    return {
        "id": str(p.id),
        "date": p.created_at.strftime("%Y-%m-%d"),
        "invoice_id": str(p.invoice_id) if p.invoice_id else None,
        "customer_id": str(p.customer_id) if p.customer_id else None,
        "method": p.method,
        "amount": str(quantize_money(p.amount)),
        "status": p.status,
        "reference_id": p.reference_id or "—",
    }


def iter_payment_rows(db: Session, start_date: date, end_date: date) -> Iterator[Dict[str, Any]]:
    start_dt, end_dt = _date_range(start_date, end_date)
    offset = 0
    while True:
        chunk = (
            db.query(Payment)
            .filter(Payment.created_at >= start_dt, Payment.created_at <= end_dt)
            .order_by(Payment.created_at.asc())
            .offset(offset).limit(EXPORT_CHUNK).all()
        )
        if not chunk:
            break
        for p in chunk:
            yield _payment_row(p)
        offset += EXPORT_CHUNK


# ==========================================
# 6. EMI REPORT
# ==========================================

def get_emi_report(
    db: Session,
    start_date: date,
    end_date: date,
    page: int = 1,
    page_size: int = 50,
) -> Dict[str, Any]:
    page_size = min(page_size, PAGE_SIZE_MAX)

    base_q = db.query(EmiPlan).filter(
        EmiPlan.start_date >= start_date,
        EmiPlan.start_date <= end_date,
    )
    total = base_q.count()
    rows = base_q.order_by(EmiPlan.start_date.desc()).offset((page - 1) * page_size).limit(page_size).all()

    agg = db.execute(
        select(
            func.coalesce(func.sum(EmiPlan.principal), Decimal("0.00")).label("total_principal"),
            func.count(EmiPlan.id).label("count"),
        ).where(EmiPlan.start_date >= start_date, EmiPlan.start_date <= end_date)
    ).one()

    return {
        "report_type": "emi",
        "start_date": str(start_date),
        "end_date": str(end_date),
        "total_records": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "summary": {
            "total_plans": int(agg.count),
            "total_principal": str(quantize_money(agg.total_principal)),
        },
        "rows": [_emi_plan_row(p) for p in rows],
    }


def _emi_plan_row(p: EmiPlan) -> Dict[str, Any]:
    return {
        "id": str(p.id),
        "customer_id": str(p.customer_id),
        "start_date": str(p.start_date),
        "principal": str(quantize_money(p.principal)),
        "down_payment": str(quantize_money(p.down_payment)),
        "installments": p.number_of_installments,
        "installment_amount": str(quantize_money(p.installment_amount)),
        "status": p.status,
    }


def iter_emi_rows(db: Session, start_date: date, end_date: date) -> Iterator[Dict[str, Any]]:
    offset = 0
    while True:
        chunk = (
            db.query(EmiPlan)
            .filter(EmiPlan.start_date >= start_date, EmiPlan.start_date <= end_date)
            .order_by(EmiPlan.start_date.asc())
            .offset(offset).limit(EXPORT_CHUNK).all()
        )
        if not chunk:
            break
        for p in chunk:
            yield _emi_plan_row(p)
        offset += EXPORT_CHUNK


# ==========================================
# 7. EXPENSES REPORT
# ==========================================

def get_expenses_report(
    db: Session,
    start_date: date,
    end_date: date,
    page: int = 1,
    page_size: int = 50,
) -> Dict[str, Any]:
    page_size = min(page_size, PAGE_SIZE_MAX)

    base_q = db.query(Expense).filter(
        Expense.is_deleted == False,
        Expense.date >= start_date,
        Expense.date <= end_date,
    )
    total = base_q.count()
    rows = base_q.order_by(Expense.date.desc()).offset((page - 1) * page_size).limit(page_size).all()

    agg = db.execute(
        select(func.coalesce(func.sum(Expense.amount), Decimal("0.00")).label("total"))
        .where(Expense.is_deleted == False, Expense.date >= start_date, Expense.date <= end_date)
    ).one()

    return {
        "report_type": "expenses",
        "start_date": str(start_date),
        "end_date": str(end_date),
        "total_records": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "summary": {"total_expenses": str(quantize_money(agg.total))},
        "rows": [_expense_row(e) for e in rows],
    }


def _expense_row(e: Expense) -> Dict[str, Any]:
    return {
        "id": str(e.id),
        "date": str(e.date),
        "category": e.category,
        "description": e.description or "—",
        "amount": str(quantize_money(e.amount)),
        "source": e.source,
        "reference_id": e.reference_id or "—",
    }


def iter_expense_rows(db: Session, start_date: date, end_date: date) -> Iterator[Dict[str, Any]]:
    offset = 0
    while True:
        chunk = (
            db.query(Expense)
            .filter(Expense.is_deleted == False, Expense.date >= start_date, Expense.date <= end_date)
            .order_by(Expense.date.asc())
            .offset(offset).limit(EXPORT_CHUNK).all()
        )
        if not chunk:
            break
        for e in chunk:
            yield _expense_row(e)
        offset += EXPORT_CHUNK


# ==========================================
# 8. SALARY REPORT
# ==========================================

def get_salary_report(
    db: Session,
    start_date: date,
    end_date: date,
    page: int = 1,
    page_size: int = 50,
) -> Dict[str, Any]:
    page_size = min(page_size, PAGE_SIZE_MAX)
    # Filter salary records whose period falls within the date range
    # Period format: "YYYY-MM" — find periods overlapping [start_date, end_date]
    start_period = f"{start_date.year}-{start_date.month:02d}"
    end_period = f"{end_date.year}-{end_date.month:02d}"

    base_q = db.query(SalaryRecord).filter(
        SalaryRecord.period >= start_period,
        SalaryRecord.period <= end_period,
    )
    total = base_q.count()
    rows = base_q.order_by(SalaryRecord.period.desc(), SalaryRecord.generated_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    agg = db.execute(
        select(
            func.coalesce(func.sum(SalaryRecord.net_salary), Decimal("0.00")).label("total_net"),
            func.coalesce(func.sum(SalaryRecord.total_deductions), Decimal("0.00")).label("total_deductions"),
            func.count(SalaryRecord.id).label("count"),
        ).where(SalaryRecord.period >= start_period, SalaryRecord.period <= end_period)
    ).one()

    return {
        "report_type": "salary",
        "start_date": str(start_date),
        "end_date": str(end_date),
        "total_records": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "summary": {
            "total_records": int(agg.count),
            "total_net_salary_paid": str(quantize_money(agg.total_net)),
            "total_deductions": str(quantize_money(agg.total_deductions)),
        },
        "rows": [_salary_row(r, db) for r in rows],
    }


def _salary_row(r: SalaryRecord, db: Session) -> Dict[str, Any]:
    staff = db.get(StaffUser, r.staff_id)
    return {
        "id": str(r.id),
        "period": r.period,
        "staff_id": str(r.staff_id),
        "staff_name": (staff.full_name or staff.email) if staff else "—",
        "base_salary": str(quantize_money(r.base_salary)),
        "total_deductions": str(quantize_money(r.total_deductions)),
        "net_salary": str(quantize_money(r.net_salary)),
        "status": r.status,
        "generated_at": r.generated_at.strftime("%Y-%m-%d") if r.generated_at else "—",
    }


def iter_salary_rows(db: Session, start_date: date, end_date: date) -> Iterator[Dict[str, Any]]:
    start_period = f"{start_date.year}-{start_date.month:02d}"
    end_period = f"{end_date.year}-{end_date.month:02d}"
    offset = 0
    while True:
        chunk = (
            db.query(SalaryRecord)
            .filter(SalaryRecord.period >= start_period, SalaryRecord.period <= end_period)
            .order_by(SalaryRecord.period.asc())
            .offset(offset).limit(EXPORT_CHUNK).all()
        )
        if not chunk:
            break
        for r in chunk:
            yield _salary_row(r, db)
        offset += EXPORT_CHUNK


# ==========================================
# 9. GST REPORT
# ==========================================

def get_gst_report(
    db: Session,
    start_date: date,
    end_date: date,
    page: int = 1,
    page_size: int = 50,
) -> Dict[str, Any]:
    """
    Period-wise CGST/SGST/IGST collected for GST filing reference.
    Pulled from invoicing module. Non-cancelled invoices only.
    NOTE: This is a data reference report, not a filing submission.
    """
    page_size = min(page_size, PAGE_SIZE_MAX)

    base_q = db.query(Invoice).filter(
        Invoice.is_cancelled == False,
        Invoice.invoice_date >= start_date,
        Invoice.invoice_date <= end_date,
    )
    total = base_q.count()
    rows = base_q.order_by(Invoice.invoice_date.desc()).offset((page - 1) * page_size).limit(page_size).all()

    agg = db.execute(
        select(
            func.coalesce(func.sum(Invoice.subtotal), Decimal("0.00")).label("taxable_value"),
            func.coalesce(func.sum(Invoice.cgst_amount), Decimal("0.00")).label("cgst"),
            func.coalesce(func.sum(Invoice.sgst_amount), Decimal("0.00")).label("sgst"),
            func.coalesce(func.sum(Invoice.igst_amount), Decimal("0.00")).label("igst"),
            func.coalesce(func.sum(Invoice.total_tax), Decimal("0.00")).label("total_tax"),
            func.coalesce(func.sum(Invoice.grand_total), Decimal("0.00")).label("grand_total"),
            func.count(Invoice.id).label("count"),
        ).where(
            Invoice.is_cancelled == False,
            Invoice.invoice_date >= start_date,
            Invoice.invoice_date <= end_date,
        )
    ).one()

    # Credit notes issued in period
    cn_agg = db.execute(
        select(
            func.coalesce(func.sum(CreditNote.subtotal_refunded), Decimal("0.00")).label("taxable_refunded"),
            func.coalesce(func.sum(CreditNote.cgst_refunded), Decimal("0.00")).label("cgst_refunded"),
            func.coalesce(func.sum(CreditNote.sgst_refunded), Decimal("0.00")).label("sgst_refunded"),
            func.coalesce(func.sum(CreditNote.igst_refunded), Decimal("0.00")).label("igst_refunded"),
            func.coalesce(func.sum(CreditNote.total_tax_refunded), Decimal("0.00")).label("tax_refunded"),
            func.coalesce(func.sum(CreditNote.grand_total_refunded), Decimal("0.00")).label("grand_refunded"),
            func.count(CreditNote.id).label("count"),
        ).where(
            CreditNote.credit_note_date >= start_date,
            CreditNote.credit_note_date <= end_date,
        )
    ).one()

    gross_taxable = quantize_money(agg.taxable_value)
    cn_taxable = quantize_money(cn_agg.taxable_refunded)
    net_taxable = quantize_money(gross_taxable - cn_taxable, allow_negative=True)

    gross_cgst = quantize_money(agg.cgst)
    cn_cgst = quantize_money(cn_agg.cgst_refunded)
    net_cgst = quantize_money(gross_cgst - cn_cgst, allow_negative=True)

    gross_sgst = quantize_money(agg.sgst)
    cn_sgst = quantize_money(cn_agg.sgst_refunded)
    net_sgst = quantize_money(gross_sgst - cn_sgst, allow_negative=True)

    gross_igst = quantize_money(agg.igst)
    cn_igst = quantize_money(cn_agg.igst_refunded)
    net_igst = quantize_money(gross_igst - cn_igst, allow_negative=True)

    gross_tax = quantize_money(agg.total_tax)
    cn_tax = quantize_money(cn_agg.tax_refunded)
    net_tax = quantize_money(gross_tax - cn_tax, allow_negative=True)

    gross_grand = quantize_money(agg.grand_total)
    cn_grand = quantize_money(cn_agg.grand_refunded)
    net_grand = quantize_money(gross_grand - cn_grand, allow_negative=True)

    return {
        "report_type": "gst",
        "start_date": str(start_date),
        "end_date": str(end_date),
        "total_records": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "summary": {
            "total_invoices": int(agg.count),
            "total_taxable_value": str(gross_taxable),
            "total_cgst": str(gross_cgst),
            "total_sgst": str(gross_sgst),
            "total_igst": str(gross_igst),
            "total_tax": str(gross_tax),
            "total_grand_total": str(gross_grand),
            "credit_notes_count": int(cn_agg.count),
            "credit_notes_taxable_value": str(cn_taxable),
            "credit_notes_cgst": str(cn_cgst),
            "credit_notes_sgst": str(cn_sgst),
            "credit_notes_igst": str(cn_igst),
            "credit_notes_tax_refunded": str(cn_tax),
            "credit_notes_grand_total": str(cn_grand),
            "net_taxable_value": str(net_taxable),
            "net_cgst": str(net_cgst),
            "net_sgst": str(net_sgst),
            "net_igst": str(net_igst),
            "net_tax_liability": str(net_tax),
            "net_grand_total": str(net_grand),
        },
        "rows": [_gst_row(inv) for inv in rows],
    }


def _gst_row(inv: Invoice) -> Dict[str, Any]:
    return {
        "invoice_number": inv.invoice_number,
        "invoice_date": str(inv.invoice_date),
        "financial_year": inv.financial_year,
        "buyer_name": inv.buyer_name,
        "buyer_gstin": inv.buyer_gstin or "—",
        "buyer_state": inv.buyer_state,
        "place_of_supply": inv.place_of_supply,
        "is_inter_state": inv.is_inter_state,
        "taxable_value": str(quantize_money(inv.subtotal)),
        "cgst_amount": str(quantize_money(inv.cgst_amount)),
        "sgst_amount": str(quantize_money(inv.sgst_amount)),
        "igst_amount": str(quantize_money(inv.igst_amount)),
        "total_tax": str(quantize_money(inv.total_tax)),
        "grand_total": str(quantize_money(inv.grand_total)),
        "payment_status": inv.payment_status,
    }


def iter_gst_rows(db: Session, start_date: date, end_date: date) -> Iterator[Dict[str, Any]]:
    offset = 0
    while True:
        chunk = (
            db.query(Invoice)
            .filter(Invoice.is_cancelled == False, Invoice.invoice_date >= start_date, Invoice.invoice_date <= end_date)
            .order_by(Invoice.invoice_date.asc())
            .offset(offset).limit(EXPORT_CHUNK).all()
        )
        if not chunk:
            break
        for inv in chunk:
            yield _gst_row(inv)
        offset += EXPORT_CHUNK


# ==========================================
# 10. PROFIT & LOSS REPORT (date-range, multi-period)
# ==========================================

def get_profit_loss_report(
    db: Session,
    start_date: date,
    end_date: date,
) -> Dict[str, Any]:
    """
    Generates monthly-bucketed P&L using Phase 11's FinancialService as the sole computation engine.
    Each month-bucket calls compute_financial_summary — no reimplementation of revenue/COGS/profit logic.
    """
    # Generate all YYYY-MM periods in the range
    periods = []
    cur_year, cur_month = start_date.year, start_date.month
    end_year, end_month = end_date.year, end_date.month

    while (cur_year, cur_month) <= (end_year, end_month):
        periods.append(f"{cur_year}-{cur_month:02d}")
        cur_month += 1
        if cur_month > 12:
            cur_month = 1
            cur_year += 1

    monthly_rows = []
    totals = {
        "revenue": Decimal("0.00"),
        "returns_refunded": Decimal("0.00"),
        "net_revenue": Decimal("0.00"),
        "invoiced_revenue": Decimal("0.00"),
        "credit_notes_refunded": Decimal("0.00"),
        "cost_of_goods": Decimal("0.00"),
        "expenses": Decimal("0.00"),
        "gross_profit": Decimal("0.00"),
        "net_profit": Decimal("0.00"),
    }

    for period_str in periods:
        summary = compute_financial_summary(db, period_str)
        row = {
            "period": period_str,
            "revenue": str(summary.revenue),
            "returns_refunded": str(summary.returns_refunded),
            "net_revenue": str(summary.net_revenue),
            "invoiced_revenue": str(summary.invoiced_revenue),
            "credit_notes_refunded": str(summary.credit_notes_refunded),
            "cost_of_goods": str(summary.cost_of_goods),
            "expenses": str(summary.expenses),
            "gross_profit": str(summary.gross_profit),
            "net_profit": str(summary.net_profit),
        }
        monthly_rows.append(row)
        totals["revenue"] = quantize_money(totals["revenue"] + summary.revenue, allow_negative=True)
        totals["returns_refunded"] = quantize_money(totals["returns_refunded"] + summary.returns_refunded, allow_negative=True)
        totals["net_revenue"] = quantize_money(totals["net_revenue"] + summary.net_revenue, allow_negative=True)
        totals["invoiced_revenue"] = quantize_money(totals["invoiced_revenue"] + summary.invoiced_revenue, allow_negative=True)
        totals["credit_notes_refunded"] = quantize_money(totals["credit_notes_refunded"] + summary.credit_notes_refunded, allow_negative=True)
        totals["cost_of_goods"] = quantize_money(totals["cost_of_goods"] + summary.cost_of_goods, allow_negative=True)
        totals["expenses"] = quantize_money(totals["expenses"] + summary.expenses, allow_negative=True)
        totals["gross_profit"] = quantize_money(totals["gross_profit"] + summary.gross_profit, allow_negative=True)
        totals["net_profit"] = quantize_money(totals["net_profit"] + summary.net_profit, allow_negative=True)

    return {
        "report_type": "profit_loss",
        "start_date": str(start_date),
        "end_date": str(end_date),
        "accounting_basis": "Cash basis primary (with accrual invoice metrics)",
        "summary": {k: str(v) for k, v in totals.items()},
        "rows": monthly_rows,
    }
