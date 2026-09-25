"""
Phase 12 — Reports API Routes.

All report endpoints:
  - GET /api/reports/{report_type}          → on-screen paginated data
  - GET /api/reports/{report_type}/export   → file download (CSV/Excel/PDF)

Row-limit approach documented in service.py.
Export format subset documented in exports.py.
"""
import uuid
from datetime import date
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.modules.auth.dependencies import get_current_staff
from app.modules.auth.models import StaffRole, StaffUser
from app.modules.reports.service import (
    get_sales_report,
    get_purchases_report,
    get_inventory_report,
    get_inventory_aging_report,
    get_customers_report,
    get_payments_report,
    get_emi_report,
    get_expenses_report,
    get_salary_report,
    get_gst_report,
    get_profit_loss_report,
    iter_sales_rows,
    iter_purchase_rows,
    iter_inventory_rows,
    iter_inventory_aging_rows,
    iter_customer_rows,
    iter_payment_rows,
    iter_emi_rows,
    iter_expense_rows,
    iter_salary_rows,
    iter_gst_rows,
)
from app.modules.reports.exports import (
    export_csv,
    export_excel,
    export_sales_csv,
    export_sales_excel,
    export_sales_pdf,
    export_inventory_csv,
    export_inventory_excel,
    export_inventory_aging_csv,
    export_inventory_aging_excel,
    export_gst_csv,
    export_gst_excel,
    export_pl_csv,
    export_pl_excel,
    export_pl_pdf,
    SALES_HEADERS,
    INVENTORY_HEADERS,
    AGING_HEADERS,
    GST_HEADERS,
    PL_HEADERS,
)

reports_router = APIRouter(tags=["Reports"])

# Roles that can access reports
REPORT_ROLES = [StaffRole.SUPER_ADMIN, StaffRole.ADMIN, StaffRole.MANAGER, StaffRole.ACCOUNTANT]


def _check_report_access(staff: StaffUser):
    role = staff.role if isinstance(staff.role, StaffRole) else StaffRole(staff.role)
    if role not in REPORT_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Reports access requires Admin/Manager/Accountant role.")


def _parse_dates(start_date: Optional[date], end_date: Optional[date]) -> tuple[date, date]:
    """Default: current calendar month if no dates provided."""
    today = date.today()
    if start_date is None:
        start_date = date(today.year, today.month, 1)
    if end_date is None:
        end_date = today
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date must be <= end_date.")
    return start_date, end_date


# ==========================================
# SALES
# ==========================================

@reports_router.get("/api/reports/sales", response_model=Dict[str, Any])
def sales_report(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    staff: StaffUser = Depends(get_current_staff),
):
    _check_report_access(staff)
    sd, ed = _parse_dates(start_date, end_date)
    return get_sales_report(db, sd, ed, page, page_size)


@reports_router.get("/api/reports/sales/export")
def export_sales(
    format: str = Query("csv", pattern="^(csv|excel|pdf)$"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    staff: StaffUser = Depends(get_current_staff),
):
    _check_report_access(staff)
    sd, ed = _parse_dates(start_date, end_date)
    if format == "csv":
        buf = export_sales_csv(db, sd, ed)
        return StreamingResponse(buf, media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=sales_{sd}_{ed}.csv"})
    elif format == "excel":
        buf = export_sales_excel(db, sd, ed)
        return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename=sales_{sd}_{ed}.xlsx"})
    elif format == "pdf":
        buf = export_sales_pdf(db, sd, ed)
        return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=sales_{sd}_{ed}.pdf"})


# ==========================================
# PURCHASES
# ==========================================

@reports_router.get("/api/reports/purchases", response_model=Dict[str, Any])
def purchases_report(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    staff: StaffUser = Depends(get_current_staff),
):
    _check_report_access(staff)
    sd, ed = _parse_dates(start_date, end_date)
    return get_purchases_report(db, sd, ed, page, page_size)


@reports_router.get("/api/reports/purchases/export")
def export_purchases(
    format: str = Query("csv", pattern="^(csv)$"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    staff: StaffUser = Depends(get_current_staff),
):
    _check_report_access(staff)
    sd, ed = _parse_dates(start_date, end_date)
    headers = ["id", "purchase_date", "supplier_name", "total_amount", "status"]
    buf = export_csv(headers, iter_purchase_rows(db, sd, ed))
    return StreamingResponse(buf, media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=purchases_{sd}_{ed}.csv"})


# ==========================================
# INVENTORY
# ==========================================

@reports_router.get("/api/reports/inventory", response_model=Dict[str, Any])
def inventory_report(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    low_stock_only: bool = Query(False),
    db: Session = Depends(get_db),
    staff: StaffUser = Depends(get_current_staff),
):
    _check_report_access(staff)
    return get_inventory_report(db, page, page_size, low_stock_only)


@reports_router.get("/api/reports/inventory/export")
def export_inventory(
    format: str = Query("csv", pattern="^(csv|excel)$"),
    low_stock_only: bool = Query(False),
    db: Session = Depends(get_db),
    staff: StaffUser = Depends(get_current_staff),
):
    _check_report_access(staff)
    if format == "csv":
        buf = export_inventory_csv(db, low_stock_only)
        return StreamingResponse(buf, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=inventory.csv"})
    elif format == "excel":
        buf = export_inventory_excel(db, low_stock_only)
        return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=inventory.xlsx"})


# ==========================================
# INVENTORY AGING / DEAD STOCK
# ==========================================

def _normalize_bucket(b: Optional[str]) -> Optional[str]:
    if not b:
        return None
    cleaned = b.replace(" ", "+").strip()
    if cleaned in {"90", "90+"}:
        cleaned = "90+"
    if cleaned in {"0-30", "31-60", "61-90", "90+"}:
        return cleaned
    raise HTTPException(status_code=400, detail=f"Invalid aging bucket: {b}. Allowed: 0-30, 31-60, 61-90, 90+")


@reports_router.get("/api/reports/inventory-aging", response_model=Dict[str, Any])
def inventory_aging_report(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    bucket: Optional[str] = Query(None),
    category_id: Optional[uuid.UUID] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    staff: StaffUser = Depends(get_current_staff),
):
    _check_report_access(staff)
    normalized_bucket = _normalize_bucket(bucket)
    return get_inventory_aging_report(
        db=db,
        page=page,
        page_size=page_size,
        bucket=normalized_bucket,
        category_id=category_id,
        search=search,
    )


@reports_router.get("/api/reports/inventory-aging/export")
def export_inventory_aging(
    format: str = Query("csv", pattern="^(csv|excel)$"),
    bucket: Optional[str] = Query(None),
    category_id: Optional[uuid.UUID] = Query(None),
    db: Session = Depends(get_db),
    staff: StaffUser = Depends(get_current_staff),
):
    _check_report_access(staff)
    normalized_bucket = _normalize_bucket(bucket)
    if format == "csv":
        buf = export_inventory_aging_csv(db, bucket=normalized_bucket, category_id=category_id)
        return StreamingResponse(
            buf,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=inventory_aging.csv"},
        )
    elif format == "excel":
        buf = export_inventory_aging_excel(db, bucket=normalized_bucket, category_id=category_id)
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=inventory_aging.xlsx"},
        )


# ==========================================
# CUSTOMERS
# ==========================================

@reports_router.get("/api/reports/customers", response_model=Dict[str, Any])
def customers_report(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    staff: StaffUser = Depends(get_current_staff),
):
    _check_report_access(staff)
    sd, ed = _parse_dates(start_date, end_date)
    return get_customers_report(db, sd, ed, page, page_size)


@reports_router.get("/api/reports/customers/export")
def export_customers(
    format: str = Query("csv", pattern="^(csv)$"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    staff: StaffUser = Depends(get_current_staff),
):
    _check_report_access(staff)
    sd, ed = _parse_dates(start_date, end_date)
    headers = ["id", "name", "email", "phone", "is_active", "joined_date"]
    buf = export_csv(headers, iter_customer_rows(db, sd, ed))
    return StreamingResponse(buf, media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=customers_{sd}_{ed}.csv"})


# ==========================================
# PAYMENTS
# ==========================================

@reports_router.get("/api/reports/payments", response_model=Dict[str, Any])
def payments_report(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    staff: StaffUser = Depends(get_current_staff),
):
    _check_report_access(staff)
    sd, ed = _parse_dates(start_date, end_date)
    return get_payments_report(db, sd, ed, page, page_size)


@reports_router.get("/api/reports/payments/export")
def export_payments(
    format: str = Query("csv", pattern="^(csv)$"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    staff: StaffUser = Depends(get_current_staff),
):
    _check_report_access(staff)
    sd, ed = _parse_dates(start_date, end_date)
    headers = ["id", "date", "invoice_id", "customer_id", "method", "amount", "status", "reference_id"]
    buf = export_csv(headers, iter_payment_rows(db, sd, ed))
    return StreamingResponse(buf, media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=payments_{sd}_{ed}.csv"})


# ==========================================
# EMI
# ==========================================

@reports_router.get("/api/reports/emi", response_model=Dict[str, Any])
def emi_report(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    staff: StaffUser = Depends(get_current_staff),
):
    _check_report_access(staff)
    sd, ed = _parse_dates(start_date, end_date)
    return get_emi_report(db, sd, ed, page, page_size)


@reports_router.get("/api/reports/emi/export")
def export_emi(
    format: str = Query("csv", pattern="^(csv)$"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    staff: StaffUser = Depends(get_current_staff),
):
    _check_report_access(staff)
    sd, ed = _parse_dates(start_date, end_date)
    headers = ["id", "customer_id", "start_date", "principal", "down_payment", "installments", "installment_amount", "status"]
    buf = export_csv(headers, iter_emi_rows(db, sd, ed))
    return StreamingResponse(buf, media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=emi_{sd}_{ed}.csv"})


# ==========================================
# EXPENSES
# ==========================================

@reports_router.get("/api/reports/expenses", response_model=Dict[str, Any])
def expenses_report(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    staff: StaffUser = Depends(get_current_staff),
):
    _check_report_access(staff)
    sd, ed = _parse_dates(start_date, end_date)
    return get_expenses_report(db, sd, ed, page, page_size)


@reports_router.get("/api/reports/expenses/export")
def export_expenses(
    format: str = Query("csv", pattern="^(csv)$"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    staff: StaffUser = Depends(get_current_staff),
):
    _check_report_access(staff)
    sd, ed = _parse_dates(start_date, end_date)
    headers = ["id", "date", "category", "description", "amount", "source", "reference_id"]
    buf = export_csv(headers, iter_expense_rows(db, sd, ed))
    return StreamingResponse(buf, media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=expenses_{sd}_{ed}.csv"})


# ==========================================
# SALARY
# ==========================================

@reports_router.get("/api/reports/salary", response_model=Dict[str, Any])
def salary_report(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    staff: StaffUser = Depends(get_current_staff),
):
    _check_report_access(staff)
    sd, ed = _parse_dates(start_date, end_date)
    return get_salary_report(db, sd, ed, page, page_size)


@reports_router.get("/api/reports/salary/export")
def export_salary(
    format: str = Query("csv", pattern="^(csv)$"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    staff: StaffUser = Depends(get_current_staff),
):
    _check_report_access(staff)
    sd, ed = _parse_dates(start_date, end_date)
    headers = ["id", "period", "staff_name", "base_salary", "total_deductions", "net_salary", "status", "generated_at"]
    buf = export_csv(headers, iter_salary_rows(db, sd, ed))
    return StreamingResponse(buf, media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=salary_{sd}_{ed}.csv"})


# ==========================================
# GST
# ==========================================

@reports_router.get("/api/reports/gst", response_model=Dict[str, Any])
def gst_report(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    staff: StaffUser = Depends(get_current_staff),
):
    _check_report_access(staff)
    sd, ed = _parse_dates(start_date, end_date)
    return get_gst_report(db, sd, ed, page, page_size)


@reports_router.get("/api/reports/gst/export")
def export_gst(
    format: str = Query("csv", pattern="^(csv|excel)$"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    staff: StaffUser = Depends(get_current_staff),
):
    _check_report_access(staff)
    sd, ed = _parse_dates(start_date, end_date)
    if format == "csv":
        buf = export_gst_csv(db, sd, ed)
        return StreamingResponse(buf, media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=gst_{sd}_{ed}.csv"})
    elif format == "excel":
        buf = export_gst_excel(db, sd, ed)
        return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename=gst_{sd}_{ed}.xlsx"})


# ==========================================
# PROFIT & LOSS
# ==========================================

@reports_router.get("/api/reports/profit-loss", response_model=Dict[str, Any])
def profit_loss_report(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    staff: StaffUser = Depends(get_current_staff),
):
    _check_report_access(staff)
    sd, ed = _parse_dates(start_date, end_date)
    return get_profit_loss_report(db, sd, ed)


@reports_router.get("/api/reports/profit-loss/export")
def export_profit_loss(
    format: str = Query("csv", pattern="^(csv|excel|pdf)$"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    staff: StaffUser = Depends(get_current_staff),
):
    _check_report_access(staff)
    sd, ed = _parse_dates(start_date, end_date)
    if format == "csv":
        buf = export_pl_csv(db, sd, ed)
        return StreamingResponse(buf, media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=pl_{sd}_{ed}.csv"})
    elif format == "excel":
        buf = export_pl_excel(db, sd, ed)
        return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename=pl_{sd}_{ed}.xlsx"})
    elif format == "pdf":
        buf = export_pl_pdf(db, sd, ed)
        return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=pl_{sd}_{ed}.pdf"})

