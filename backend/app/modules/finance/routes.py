import re
import uuid
from datetime import date, datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.db import get_db
from app.modules.auth.dependencies import get_current_staff, require_roles
from app.modules.auth.models import StaffRole, StaffUser
from app.modules.finance.models import Expense, ExpenseCategory, ExpenseSource
from app.modules.finance.schemas import (
    ExpenseCreateRequest,
    ExpenseListResponse,
    ExpenseResponse,
    ExpenseUpdateRequest,
    FinancialSummaryResponse,
)
from app.modules.finance.service import compute_financial_summary

finance_router = APIRouter(tags=["Finance & Expenses"])

FINANCE_MANAGEMENT_ROLES = [
    StaffRole.SUPER_ADMIN,
    StaffRole.ADMIN,
    StaffRole.MANAGER,
    StaffRole.ACCOUNTANT,
]


def _build_expense_response(exp: Expense) -> ExpenseResponse:
    creator_name = None
    if exp.author:
        creator_name = exp.author.full_name or exp.author.email.split("@")[0]

    return ExpenseResponse(
        id=exp.id,
        category=exp.category,
        amount=exp.amount,
        description=exp.description,
        date=exp.date,
        created_by=exp.created_by,
        creator_name=creator_name,
        source=exp.source,
        reference_id=exp.reference_id,
        is_deleted=exp.is_deleted,
        deleted_at=exp.deleted_at,
        created_at=exp.created_at,
        updated_at=exp.updated_at,
    )


@finance_router.get(
    "/summary",
    response_model=FinancialSummaryResponse,
    summary="Get comprehensive P&L financial summary and receivables for a period",
)
def get_financial_summary(
    period: Optional[str] = Query(None, description="Payroll / accounting period in YYYY-MM format"),
    db: Session = Depends(get_db),
    caller: StaffUser = Depends(require_roles(*FINANCE_MANAGEMENT_ROLES)),
):
    """
    Computes financial metrics for a period:
    - Primary Revenue (Cash-basis collected payments)
    - Invoiced Revenue (Accrual-basis invoices issued)
    - Cost of Goods / Inventory replenishment cost
    - Operating Expenses (all sources, non-deleted) with category breakdown
    - Gross Profit & Net Profit
    - Outstanding Receivables (unpaid invoice balances + unpaid EMI installments)
    """
    if period:
        clean_period = period.strip()
        if not re.match(r"^\d{4}-(0[1-9]|1[0-2])$", clean_period):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Period must be in YYYY-MM format (e.g., '2026-09').",
            )
    else:
        today = date.today()
        clean_period = f"{today.year}-{str(today.month).padStart(2, '0') if hasattr(str(today.month), 'padStart') else f'{today.month:02d}'}"

    return compute_financial_summary(db=db, period_str=clean_period)


@finance_router.get(
    "/expenses",
    response_model=ExpenseListResponse,
    summary="List and filter business expenses",
)
def list_expenses(
    category: Optional[str] = Query(None, description="Filter by category"),
    source: Optional[str] = Query(None, description="Filter by source: 'system_salary' or 'manual'"),
    start_date: Optional[date] = Query(None, description="Filter expenses from this date"),
    end_date: Optional[date] = Query(None, description="Filter expenses up to this date"),
    include_deleted: bool = Query(False, description="Include soft-deleted records"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    caller: StaffUser = Depends(get_current_staff),
):
    stmt = select(Expense).options(selectinload(Expense.author))

    if not include_deleted:
        stmt = stmt.where(Expense.is_deleted == False)
    if category:
        stmt = stmt.where(Expense.category == category.strip())
    if source:
        stmt = stmt.where(Expense.source == source.strip().lower())
    if start_date:
        stmt = stmt.where(Expense.date >= start_date)
    if end_date:
        stmt = stmt.where(Expense.date <= end_date)

    total_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.scalar(total_stmt) or 0

    stmt = stmt.order_by(Expense.date.desc(), Expense.created_at.desc()).offset((page - 1) * limit).limit(limit)
    rows = db.execute(stmt).scalars().all()

    return ExpenseListResponse(
        items=[_build_expense_response(e) for e in rows],
        total=total,
        page=page,
        limit=limit,
    )


@finance_router.post(
    "/expenses",
    response_model=ExpenseResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record a manual operating expense",
)
def create_expense(
    payload: ExpenseCreateRequest,
    db: Session = Depends(get_db),
    caller: StaffUser = Depends(require_roles(*FINANCE_MANAGEMENT_ROLES)),
):
    new_expense = Expense(
        category=payload.category.value,
        amount=payload.amount,
        description=payload.description.strip() if payload.description else None,
        date=payload.date,
        created_by=caller.id,
        source=ExpenseSource.MANUAL.value,
        reference_id=None,
        is_deleted=False,
    )
    db.add(new_expense)
    db.commit()
    db.refresh(new_expense)

    return _build_expense_response(new_expense)


@finance_router.get(
    "/expenses/{id}",
    response_model=ExpenseResponse,
    summary="Get single expense record details",
)
def get_expense(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    caller: StaffUser = Depends(get_current_staff),
):
    stmt = select(Expense).options(selectinload(Expense.author)).where(Expense.id == id)
    expense = db.execute(stmt).scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense record not found.")
    return _build_expense_response(expense)


@finance_router.put(
    "/expenses/{id}",
    response_model=ExpenseResponse,
    summary="Update a manual expense record",
)
def update_expense(
    id: uuid.UUID,
    payload: ExpenseUpdateRequest,
    db: Session = Depends(get_db),
    caller: StaffUser = Depends(require_roles(*FINANCE_MANAGEMENT_ROLES)),
):
    stmt = select(Expense).where(Expense.id == id)
    expense = db.execute(stmt).scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense record not found.")

    if expense.source == ExpenseSource.SYSTEM_SALARY.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="System-generated salary expenses are immutable and cannot be edited manually.",
        )

    if expense.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot update a deleted expense record.",
        )

    if payload.category is not None:
        expense.category = payload.category.value
    if payload.amount is not None:
        expense.amount = payload.amount
    if payload.description is not None:
        expense.description = payload.description.strip() if payload.description else None
    if payload.date is not None:
        expense.date = payload.date

    db.commit()
    db.refresh(expense)
    return _build_expense_response(expense)


@finance_router.delete(
    "/expenses/{id}",
    response_model=ExpenseResponse,
    summary="Soft-delete a manual expense record with audit preservation",
)
def delete_expense(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    caller: StaffUser = Depends(require_roles(*FINANCE_MANAGEMENT_ROLES)),
):
    stmt = select(Expense).where(Expense.id == id)
    expense = db.execute(stmt).scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense record not found.")

    if expense.source == ExpenseSource.SYSTEM_SALARY.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="System-generated salary expenses are immutable and cannot be deleted manually.",
        )

    if expense.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Expense record is already deleted.",
        )

    expense.is_deleted = True
    expense.deleted_at = datetime.now(timezone.utc)
    expense.deleted_by = caller.id

    db.commit()
    db.refresh(expense)
    return _build_expense_response(expense)
