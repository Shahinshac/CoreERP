import time
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.money import quantize_money
from app.modules.auth.dependencies import get_current_staff
from app.modules.auth.models import StaffUser
from app.modules.catalog.models import Product
from app.modules.payments.models import Payment, PaymentStatus
from app.modules.sales.models import Sale
from app.modules.support.models import SupportTicket

dashboard_router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

_CACHE: dict[str, Any] = {"expires_at": 0.0, "data": None}


class TodaySummaryResponse(BaseModel):
    date: str
    total_sales: Decimal
    sales_count: int
    cash_collected: Decimal
    payment_method_totals: dict[str, Decimal]
    customers_served: int
    low_stock_count: int
    open_tickets_count: int


@dashboard_router.get("/today", response_model=TodaySummaryResponse)
def get_today_summary(
    db: Session = Depends(get_db),
    _: StaffUser = Depends(get_current_staff),
):
    now_ts = time.time()
    if _CACHE["data"] is not None and now_ts < _CACHE["expires_at"]:
        return _CACHE["data"]

    # Date bounds for today (spanning local and UTC current date)
    today = date.today()
    now_utc = datetime.utcnow()
    min_date = min(today, now_utc.date())
    max_date = max(today, now_utc.date())
    start_dt = datetime(min_date.year, min_date.month, min_date.day, 0, 0, 0)
    end_dt = datetime(max_date.year, max_date.month, max_date.day, 23, 59, 59, 999999)

    # 1. Total Sales & Customers Served
    sales = (
        db.query(Sale)
        .filter(
            Sale.status.in_(["completed", "partially_returned"]),
            Sale.created_at >= start_dt,
            Sale.created_at <= end_dt,
        )
        .all()
    )
    total_sales = sum((s.total_amount for s in sales), Decimal("0.00"))
    sales_count = len(sales)

    # Unique customers served today (count distinct known customers + walk-ins)
    known_customers = set(s.customer_id for s in sales if s.customer_id is not None)
    walk_ins = sum(1 for s in sales if s.customer_id is None)
    customers_served = len(known_customers) + walk_ins

    # 2. Payments & Cash Collected
    payments = (
        db.query(Payment)
        .filter(
            Payment.status == PaymentStatus.PAID.value,
            Payment.created_at >= start_dt,
            Payment.created_at <= end_dt,
        )
        .all()
    )
    payment_totals: dict[str, Decimal] = {"cash": Decimal("0.00"), "card": Decimal("0.00"), "upi": Decimal("0.00")}
    for p in payments:
        method = (p.method or "cash").lower()
        payment_totals[method] = payment_totals.get(method, Decimal("0.00")) + quantize_money(p.amount)

    cash_collected = quantize_money(payment_totals.get("cash", Decimal("0.00")))

    # 3. Low stock count
    low_stock_count = (
        db.query(Product)
        .filter(Product.is_active == True, Product.current_stock <= Product.min_stock)
        .count()
    )

    # 4. Open support tickets count
    open_tickets_count = (
        db.query(SupportTicket)
        .filter(SupportTicket.status.in_(["open", "in_progress"]))
        .count()
    )

    res = TodaySummaryResponse(
        date=str(today),
        total_sales=quantize_money(total_sales),
        sales_count=sales_count,
        cash_collected=cash_collected,
        payment_method_totals={k: quantize_money(v) for k, v in payment_totals.items()},
        customers_served=customers_served,
        low_stock_count=low_stock_count,
        open_tickets_count=open_tickets_count,
    )

    _CACHE["data"] = res
    _CACHE["expires_at"] = now_ts + 60.0
    return res
