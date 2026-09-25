from datetime import datetime, timezone
from decimal import Decimal
import logging
from typing import Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.modules.auth.dependencies import get_current_staff
from app.modules.auth.models import StaffRole, StaffUser
from app.modules.sales.cash_drawer_schemas import (
    ActiveSessionSummaryResponse,
    CashDrawerSessionResponse,
    CashMovementRequest,
    CashMovementResponse,
    CloseDrawerRequest,
    CurrentDrawerStatusResponse,
    OpenDrawerRequest,
    XReportResponse,
    ZReportResponse,
)
from app.modules.sales.cash_drawer_service import (
    build_z_report_from_session,
    calculate_session_metrics,
    close_cash_drawer,
    generate_x_report,
    get_active_session,
    open_cash_drawer,
    record_cash_movement,
)
from app.modules.sales.models import CashDrawerSession

logger = logging.getLogger("app.sales.cash_drawer")

cash_drawer_router = APIRouter(prefix="/api/pos/cash-drawer", tags=["Cash Drawer Reconciliation"])


@cash_drawer_router.post("/open", response_model=CashDrawerSessionResponse, status_code=status.HTTP_201_CREATED)
def open_drawer(
    payload: OpenDrawerRequest,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Opens a new cash drawer session for the authenticated cashier with an initial float.
    Rejects request if an active open session already exists for this cashier.
    """
    session = open_cash_drawer(db=db, cashier=current_staff, payload=payload)
    return CashDrawerSessionResponse(
        id=session.id,
        cashier_id=session.cashier_id,
        cashier_email=current_staff.email,
        status=session.status,
        opened_at=session.opened_at,
        closed_at=session.closed_at,
        opening_cash=session.opening_cash,
        closing_cash=session.closing_cash,
        expected_cash=session.expected_cash,
        variance=session.variance,
        opening_notes=session.opening_notes,
        closing_notes=session.closing_notes,
        denominations=session.denominations,
        movements_count=0,
    )


@cash_drawer_router.get("/current", response_model=CurrentDrawerStatusResponse)
def get_current_drawer_status(
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Returns the currently active open cash drawer session for the authenticated cashier,
    including live computed expected cash and transactions summary.
    Returns { active: false, session: null } if no drawer is open.
    """
    session = get_active_session(db, current_staff.id)
    if not session:
        return {"active": False, "session": None}

    metrics = calculate_session_metrics(db, session)

    movements_resp = [
        CashMovementResponse(
            id=m.id,
            session_id=m.session_id,
            movement_type=m.movement_type,
            amount=m.amount,
            reason=m.reason,
            performed_by_id=m.performed_by_id,
            performed_by_email=m.performed_by.email if m.performed_by else None,
            created_at=m.created_at,
        )
        for m in metrics["movements"]
    ]

    return {
        "active": True,
        "session": {
            "id": session.id,
            "cashier_id": session.cashier_id,
            "cashier_email": current_staff.email,
            "status": session.status,
            "opened_at": session.opened_at,
            "opening_cash": metrics["opening_cash"],
            "cash_sales_amount": metrics["cash_sales_amount"],
            "cash_sales_count": metrics["cash_sales_count"],
            "cash_refunds_amount": metrics["cash_refunds_amount"],
            "cash_refunds_count": metrics["cash_refunds_count"],
            "cash_in_amount": metrics["cash_in_amount"],
            "cash_out_amount": metrics["cash_out_amount"],
            "expected_cash": metrics["expected_cash"],
            "total_sales_amount": metrics["total_sales_amount"],
            "transaction_count": metrics["transaction_count"],
            "sales_by_payment_method": metrics["sales_by_payment_method"],
            "opening_notes": session.opening_notes,
            "movements": movements_resp,
        },
    }


@cash_drawer_router.post("/movements", response_model=CashMovementResponse, status_code=status.HTTP_201_CREATED)
def add_cash_movement(
    payload: CashMovementRequest,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Records a cash adjustment (Cash In, Cash Out, Cash Drop) into the cashier's active session.
    """
    movement = record_cash_movement(db=db, cashier=current_staff, payload=payload)
    return CashMovementResponse(
        id=movement.id,
        session_id=movement.session_id,
        movement_type=movement.movement_type,
        amount=movement.amount,
        reason=movement.reason,
        performed_by_id=movement.performed_by_id,
        performed_by_email=current_staff.email,
        created_at=movement.created_at,
    )


@cash_drawer_router.get("/x-report", response_model=XReportResponse)
def get_x_report(
    counted_cash: Optional[Decimal] = Query(None, ge=0),
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Generates a live X Report mid-day snapshot for the cashier's active session.
    Calculates expected cash and variance if counted cash is provided.
    Does NOT close or mutate the session.
    """
    session = get_active_session(db, current_staff.id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active cash drawer session found for X Report.",
        )
    return generate_x_report(db=db, session=session, counted_cash=counted_cash)


@cash_drawer_router.post("/close", response_model=ZReportResponse)
def close_drawer(
    payload: CloseDrawerRequest,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Closes the active cash drawer session and generates the final immutable Z Report.
    Audits the closure and records any over/short variance.
    """
    return close_cash_drawer(db=db, cashier=current_staff, payload=payload)


@cash_drawer_router.get("/sessions")
def list_sessions(
    status_filter: Optional[str] = Query(None, alias="status"),
    cashier_id: Optional[uuid.UUID] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Lists past and current cash drawer sessions.
    Cashiers can view their own sessions.
    Admin, Super Admin, and Manager can view all sessions or filter by cashier.
    """
    query = db.query(CashDrawerSession)

    is_privileged = current_staff.role in (
        StaffRole.ADMIN,
        StaffRole.SUPER_ADMIN,
        StaffRole.MANAGER,
    )

    if not is_privileged:
        query = query.filter(CashDrawerSession.cashier_id == current_staff.id)
    elif cashier_id:
        query = query.filter(CashDrawerSession.cashier_id == cashier_id)

    if status_filter:
        query = query.filter(CashDrawerSession.status == status_filter)

    total = query.count()
    sessions = (
        query.order_by(CashDrawerSession.opened_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    return {
        "items": [
            CashDrawerSessionResponse(
                id=s.id,
                cashier_id=s.cashier_id,
                cashier_email=s.cashier.email if s.cashier else None,
                status=s.status,
                opened_at=s.opened_at,
                closed_at=s.closed_at,
                opening_cash=s.opening_cash,
                closing_cash=s.closing_cash,
                expected_cash=s.expected_cash,
                variance=s.variance,
                opening_notes=s.opening_notes,
                closing_notes=s.closing_notes,
                denominations=s.denominations,
                movements_count=len(s.movements) if s.movements else 0,
            )
            for s in sessions
        ],
        "total": total,
        "page": page,
        "limit": limit,
    }


@cash_drawer_router.get("/sessions/{session_id}")
def get_session_detail(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Retrieves full details of a specific cash drawer session.
    """
    session = db.query(CashDrawerSession).filter(CashDrawerSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cash drawer session not found.")

    is_privileged = current_staff.role in (
        StaffRole.ADMIN,
        StaffRole.SUPER_ADMIN,
        StaffRole.MANAGER,
    )
    if not is_privileged and session.cashier_id != current_staff.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to view this cashier's session.",
        )

    if session.status == "closed":
        return build_z_report_from_session(session)
    return generate_x_report(db=db, session=session)


@cash_drawer_router.get("/sessions/{session_id}/z-report", response_model=ZReportResponse)
def get_session_z_report(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Retrieves the immutable Z Report for a closed session.
    """
    session = db.query(CashDrawerSession).filter(CashDrawerSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cash drawer session not found.")

    is_privileged = current_staff.role in (
        StaffRole.ADMIN,
        StaffRole.SUPER_ADMIN,
        StaffRole.MANAGER,
    )
    if not is_privileged and session.cashier_id != current_staff.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to view this cashier's Z Report.",
        )

    return build_z_report_from_session(session)
