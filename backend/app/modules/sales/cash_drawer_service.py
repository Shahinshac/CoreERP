from datetime import datetime, timedelta, timezone
from decimal import Decimal
import logging
from typing import Optional
import uuid
from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.money import quantize_money
from app.modules.audit.service import log_audit_event
from app.modules.auth.models import StaffUser
from app.modules.sales.cash_drawer_schemas import (
    CashMovementRequest,
    CashMovementResponse,
    CloseDrawerRequest,
    OpenDrawerRequest,
    XReportResponse,
    ZReportResponse,
)
from app.modules.sales.models import (
    CashDrawerSession,
    CashMovement,
    Sale,
    SaleReturn,
)

logger = logging.getLogger("app.sales.cash_drawer")


def calculate_session_metrics(db: Session, session: CashDrawerSession) -> dict:
    """
    Computes financial metrics for a cash drawer session based on existing recorded transactions:
    Expected Cash = Opening Cash + Cash Sales + Cash In - Cash Refunds - Cash Out
    """
    start_time = session.opened_at
    if hasattr(start_time, "tzinfo") and start_time.tzinfo:
        start_time = start_time.astimezone(timezone.utc).replace(tzinfo=None)
    start_time = (start_time - timedelta(seconds=5)).replace(microsecond=0)

    end_time = session.closed_at or datetime.now(timezone.utc)
    if hasattr(end_time, "tzinfo") and end_time.tzinfo:
        end_time = end_time.astimezone(timezone.utc).replace(tzinfo=None)
    end_time = (end_time + timedelta(seconds=5)).replace(microsecond=0)

    # 1. Query Sales completed or returned during the session window
    sales = (
        db.query(Sale)
        .filter(
            Sale.staff_id == session.cashier_id,
            Sale.status.in_(["completed", "partially_returned", "returned"]),
            Sale.created_at >= start_time,
            Sale.created_at <= end_time,
        )
        .all()
    )

    cash_sales_amount = Decimal("0.00")
    cash_sales_count = 0
    total_sales_amount = Decimal("0.00")
    sales_by_payment_method: dict[str, Decimal] = {}

    for s in sales:
        total_sales_amount += s.total_amount
        if s.payment_method == "split" and s.payment_details:
            has_cash = False
            for p in s.payment_details:
                m = (p.get("method") or "other").lower()
                amt = Decimal(str(p.get("amount", "0.00")))
                sales_by_payment_method[m] = sales_by_payment_method.get(m, Decimal("0.00")) + amt
                if m == "cash":
                    cash_sales_amount += amt
                    has_cash = True
            if has_cash:
                cash_sales_count += 1
        else:
            method = (s.payment_method or "other").lower()
            sales_by_payment_method[method] = sales_by_payment_method.get(method, Decimal("0.00")) + s.total_amount
            if method == "cash":
                cash_sales_amount += s.total_amount
                cash_sales_count += 1

    # 2. Query Sale Returns processed by this cashier during session window
    returns = (
        db.query(SaleReturn)
        .join(Sale, SaleReturn.sale_id == Sale.id)
        .filter(
            SaleReturn.staff_id == session.cashier_id,
            SaleReturn.created_at >= start_time,
            SaleReturn.created_at <= end_time,
        )
        .all()
    )

    cash_refunds_amount = Decimal("0.00")
    cash_refunds_count = 0
    for r in returns:
        # Check if original sale was cash or split containing cash
        if r.sale:
            if r.sale.payment_method == "cash":
                cash_refunds_amount += r.total_refund_amount
                cash_refunds_count += 1
            elif r.sale.payment_method == "split" and r.sale.payment_details:
                cash_portion = sum(
                    Decimal(str(p.get("amount", "0.00")))
                    for p in r.sale.payment_details
                    if p.get("method") == "cash"
                )
                if cash_portion > Decimal("0.00"):
                    cash_refunds_amount += min(r.total_refund_amount, cash_portion)
                    cash_refunds_count += 1

    # 3. Query Cash Movements (Cash In vs Cash Out / Drops)
    movements = (
        db.query(CashMovement)
        .filter(CashMovement.session_id == session.id)
        .order_by(CashMovement.created_at.asc())
        .all()
    )

    cash_in_amount = Decimal("0.00")
    cash_out_amount = Decimal("0.00")
    for m in movements:
        if m.movement_type == "cash_in":
            cash_in_amount += m.amount
        elif m.movement_type in ("cash_out", "cash_drop"):
            cash_out_amount += m.amount

    # Quantize all components
    opening_cash = quantize_money(session.opening_cash)
    cash_sales_amount = quantize_money(cash_sales_amount)
    cash_in_amount = quantize_money(cash_in_amount)
    cash_refunds_amount = quantize_money(cash_refunds_amount)
    cash_out_amount = quantize_money(cash_out_amount)
    total_sales_amount = quantize_money(total_sales_amount)

    for k in sales_by_payment_method:
        sales_by_payment_method[k] = quantize_money(sales_by_payment_method[k])

    # EXPECTED CASH FORMULA
    expected_cash = quantize_money(
        opening_cash + cash_sales_amount + cash_in_amount - cash_refunds_amount - cash_out_amount
    )

    return {
        "opening_cash": opening_cash,
        "cash_sales_amount": cash_sales_amount,
        "cash_sales_count": cash_sales_count,
        "cash_refunds_amount": cash_refunds_amount,
        "cash_refunds_count": cash_refunds_count,
        "cash_in_amount": cash_in_amount,
        "cash_out_amount": cash_out_amount,
        "expected_cash": expected_cash,
        "total_sales_amount": total_sales_amount,
        "transaction_count": len(sales),
        "sales_by_payment_method": sales_by_payment_method,
        "movements": movements,
    }


def open_cash_drawer(db: Session, cashier: StaffUser, payload: OpenDrawerRequest) -> CashDrawerSession:
    """
    Opens a cash drawer session for the cashier.
    Enforces that the cashier does not already have an open session.
    """
    # Prevent duplicate active session
    existing = (
        db.query(CashDrawerSession)
        .filter(
            CashDrawerSession.cashier_id == cashier.id,
            CashDrawerSession.status == "open",
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"An active cash drawer session is already open for {cashier.email} (Opened at {existing.opened_at.strftime('%Y-%m-%d %H:%M:%S')}). Please close it before opening a new one.",
        )

    now = datetime.now(timezone.utc)
    session = CashDrawerSession(
        cashier_id=cashier.id,
        status="open",
        opened_at=now,
        opening_cash=payload.opening_cash,
        expected_cash=payload.opening_cash,
        opening_notes=payload.opening_notes,
    )
    db.add(session)
    db.flush()

    log_audit_event(
        db=db,
        event_type="cash_drawer.session_opened",
        description=f"Cash drawer session opened by {cashier.email} with float ₹{session.opening_cash:.2f}.",
        actor_id=cashier.id,
        actor_type="staff",
        actor_email=cashier.email,
        resource_type="cash_drawer_session",
        resource_id=str(session.id),
        details={"opening_cash": str(session.opening_cash), "opening_notes": session.opening_notes},
    )

    db.commit()
    db.refresh(session)
    return session


def get_active_session(db: Session, cashier_id: uuid.UUID) -> Optional[CashDrawerSession]:
    """Retrieves the active open session for a cashier, if any."""
    return (
        db.query(CashDrawerSession)
        .filter(
            CashDrawerSession.cashier_id == cashier_id,
            CashDrawerSession.status == "open",
        )
        .first()
    )


def record_cash_movement(
    db: Session,
    cashier: StaffUser,
    payload: CashMovementRequest,
) -> CashMovement:
    """
    Records a manual cash adjustment (Cash In, Cash Out, Cash Drop) in the cashier's active session.
    """
    session = get_active_session(db, cashier.id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active cash drawer session found. Please open a cash drawer session first.",
        )

    movement = CashMovement(
        session_id=session.id,
        movement_type=payload.movement_type,
        amount=payload.amount,
        reason=payload.reason.strip(),
        performed_by_id=cashier.id,
    )
    db.add(movement)
    db.flush()

    log_audit_event(
        db=db,
        event_type=f"cash_drawer.{payload.movement_type}",
        description=f"Cash movement ({payload.movement_type}) of ₹{movement.amount:.2f} recorded: {movement.reason}",
        actor_id=cashier.id,
        actor_type="staff",
        actor_email=cashier.email,
        resource_type="cash_movement",
        resource_id=str(movement.id),
        details={
            "session_id": str(session.id),
            "movement_type": movement.movement_type,
            "amount": str(movement.amount),
            "reason": movement.reason,
        },
    )

    db.commit()
    db.refresh(movement)
    return movement


def generate_x_report(
    db: Session,
    session: CashDrawerSession,
    counted_cash: Optional[Decimal] = None,
) -> XReportResponse:
    """
    Generates a mid-day X Report snapshot of the active drawer session.
    Crucially, does NOT close or alter the session.
    """
    metrics = calculate_session_metrics(db, session)
    report_time = datetime.now(timezone.utc)

    counted_quantized = quantize_money(counted_cash) if counted_cash is not None else None
    variance = (
        quantize_money(counted_quantized - metrics["expected_cash"], allow_negative=True)
        if counted_quantized is not None
        else None
    )

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

    return XReportResponse(
        session_id=session.id,
        cashier_id=session.cashier_id,
        cashier_email=session.cashier.email if session.cashier else "",
        status=session.status,
        opened_at=session.opened_at,
        report_time=report_time,
        opening_cash=metrics["opening_cash"],
        cash_sales_amount=metrics["cash_sales_amount"],
        cash_sales_count=metrics["cash_sales_count"],
        cash_refunds_amount=metrics["cash_refunds_amount"],
        cash_refunds_count=metrics["cash_refunds_count"],
        cash_in_amount=metrics["cash_in_amount"],
        cash_out_amount=metrics["cash_out_amount"],
        expected_cash=metrics["expected_cash"],
        counted_cash=counted_quantized,
        variance=variance,
        transaction_count=metrics["transaction_count"],
        movements=movements_resp,
    )


def close_cash_drawer(
    db: Session,
    cashier: StaffUser,
    payload: CloseDrawerRequest,
) -> ZReportResponse:
    """
    Closes the active cash drawer session and generates the final immutable Z Report.
    Calculates Expected Cash, Actual Cash, Variance (Over/Short), and seals the summary.
    """
    session = get_active_session(db, cashier.id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active cash drawer session found to close.",
        )

    closed_at = datetime.now(timezone.utc)
    session.closed_at = closed_at

    # Calculate final metrics
    metrics = calculate_session_metrics(db, session)
    closing_cash = payload.closing_cash
    expected_cash = metrics["expected_cash"]
    variance = quantize_money(closing_cash - expected_cash, allow_negative=True)

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

    # Build immutable summary data dictionary for permanent storage
    summary_data = {
        "opening_cash": str(metrics["opening_cash"]),
        "cash_sales_amount": str(metrics["cash_sales_amount"]),
        "cash_sales_count": metrics["cash_sales_count"],
        "cash_refunds_amount": str(metrics["cash_refunds_amount"]),
        "cash_refunds_count": metrics["cash_refunds_count"],
        "cash_in_amount": str(metrics["cash_in_amount"]),
        "cash_out_amount": str(metrics["cash_out_amount"]),
        "expected_cash": str(expected_cash),
        "actual_cash": str(closing_cash),
        "variance": str(variance),
        "sales_by_payment_method": {k: str(v) for k, v in metrics["sales_by_payment_method"].items()},
        "total_sales_amount": str(metrics["total_sales_amount"]),
        "transaction_count": metrics["transaction_count"],
        "denominations": payload.denominations,
        "closing_notes": payload.closing_notes,
    }

    # Update session model fields
    session.status = "closed"
    session.closing_cash = closing_cash
    session.expected_cash = expected_cash
    session.variance = variance
    session.denominations = payload.denominations
    session.closing_notes = payload.closing_notes
    session.summary_data = summary_data

    # Log audit event for closure
    log_audit_event(
        db=db,
        event_type="cash_drawer.session_closed",
        description=(
            f"Cash drawer session closed by {cashier.email}. "
            f"Expected: ₹{expected_cash:.2f}, Counted: ₹{closing_cash:.2f}, Variance: ₹{variance:.2f}."
        ),
        actor_id=cashier.id,
        actor_type="staff",
        actor_email=cashier.email,
        resource_type="cash_drawer_session",
        resource_id=str(session.id),
        details={
            "expected_cash": str(expected_cash),
            "actual_cash": str(closing_cash),
            "variance": str(variance),
            "transaction_count": metrics["transaction_count"],
            "closing_notes": payload.closing_notes,
        },
    )

    # If non-zero variance, log focused variance audit event
    if variance != Decimal("0.00"):
        var_desc = (
            f"Drawer cash OVER by ₹{variance:.2f}."
            if variance > Decimal("0.00")
            else f"Drawer cash SHORT by ₹{abs(variance):.2f}."
        )
        log_audit_event(
            db=db,
            event_type="cash_drawer.variance_recorded",
            description=f"Reconciliation variance for session {session.id}: {var_desc}",
            actor_id=cashier.id,
            actor_type="staff",
            actor_email=cashier.email,
            resource_type="cash_drawer_session",
            resource_id=str(session.id),
            details={"variance": str(variance), "is_short": variance < Decimal("0.00")},
        )

    db.commit()
    db.refresh(session)

    return ZReportResponse(
        session_id=session.id,
        cashier_id=session.cashier_id,
        cashier_email=cashier.email,
        status="closed",
        opened_at=session.opened_at,
        closed_at=closed_at,
        opening_cash=metrics["opening_cash"],
        cash_sales_amount=metrics["cash_sales_amount"],
        cash_sales_count=metrics["cash_sales_count"],
        cash_refunds_amount=metrics["cash_refunds_amount"],
        cash_refunds_count=metrics["cash_refunds_count"],
        cash_in_amount=metrics["cash_in_amount"],
        cash_out_amount=metrics["cash_out_amount"],
        expected_cash=expected_cash,
        actual_cash=closing_cash,
        variance=variance,
        sales_by_payment_method=metrics["sales_by_payment_method"],
        total_sales_amount=metrics["total_sales_amount"],
        transaction_count=metrics["transaction_count"],
        denominations=payload.denominations,
        opening_notes=session.opening_notes,
        closing_notes=session.closing_notes,
        movements=movements_resp,
    )


def build_z_report_from_session(session: CashDrawerSession) -> ZReportResponse:
    """Reconstructs the immutable Z Report for an already closed session."""
    if session.status != "closed" or not session.closed_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot generate Z Report for an unclosed session.",
        )

    summary = session.summary_data or {}
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
        for m in (session.movements or [])
    ]

    sales_by_method = {
        k: quantize_money(Decimal(v))
        for k, v in summary.get("sales_by_payment_method", {}).items()
    }

    return ZReportResponse(
        session_id=session.id,
        cashier_id=session.cashier_id,
        cashier_email=session.cashier.email if session.cashier else "",
        status="closed",
        opened_at=session.opened_at,
        closed_at=session.closed_at,
        opening_cash=quantize_money(Decimal(summary.get("opening_cash", session.opening_cash))),
        cash_sales_amount=quantize_money(Decimal(summary.get("cash_sales_amount", "0.00"))),
        cash_sales_count=int(summary.get("cash_sales_count", 0)),
        cash_refunds_amount=quantize_money(Decimal(summary.get("cash_refunds_amount", "0.00"))),
        cash_refunds_count=int(summary.get("cash_refunds_count", 0)),
        cash_in_amount=quantize_money(Decimal(summary.get("cash_in_amount", "0.00"))),
        cash_out_amount=quantize_money(Decimal(summary.get("cash_out_amount", "0.00"))),
        expected_cash=quantize_money(Decimal(summary.get("expected_cash", session.expected_cash or "0.00"))),
        actual_cash=quantize_money(Decimal(summary.get("actual_cash", session.closing_cash or "0.00"))),
        variance=quantize_money(Decimal(summary.get("variance", session.variance or "0.00")), allow_negative=True),
        sales_by_payment_method=sales_by_method,
        total_sales_amount=quantize_money(Decimal(summary.get("total_sales_amount", "0.00"))),
        transaction_count=int(summary.get("transaction_count", 0)),
        denominations=summary.get("denominations", session.denominations),
        opening_notes=session.opening_notes,
        closing_notes=summary.get("closing_notes", session.closing_notes),
        movements=movements_resp,
    )
