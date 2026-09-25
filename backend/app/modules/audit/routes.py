from datetime import datetime
from typing import Optional
import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.modules.auth.dependencies import require_roles
from app.modules.auth.models import StaffRole, StaffUser
from app.modules.audit.models import AuditLog
from app.modules.audit.schemas import AuditLogListResponse, AuditLogResponse

audit_router = APIRouter(prefix="/api/audit-logs", tags=["Audit Logs"])


@audit_router.get(
    "",
    response_model=AuditLogListResponse,
    summary="Retrieve audit logs (Admins & Super Admins only)",
)
def list_audit_logs(
    event_type: Optional[str] = Query(None, description="Filter by event type prefix or exact match"),
    resource_type: Optional[str] = Query(None, description="Filter by resource type"),
    actor_id: Optional[uuid.UUID] = Query(None, description="Filter by actor user ID"),
    actor_type: Optional[str] = Query(None, description="Filter by actor type (staff, customer, system)"),
    search: Optional[str] = Query(None, description="Search description, actor email, or resource ID"),
    date_from: Optional[datetime] = Query(None, description="Filter events after this UTC timestamp"),
    date_to: Optional[datetime] = Query(None, description="Filter events before this UTC timestamp"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: StaffUser = Depends(require_roles(StaffRole.SUPER_ADMIN, StaffRole.ADMIN)),
):
    """
    Returns an append-only audit trail filtered by actor, event, resource, and time range.
    Accessible only to Super Admins and Admins. Ordinary staff and customers are forbidden.
    """
    stmt = select(AuditLog)

    if event_type:
        stmt = stmt.where(AuditLog.event_type.ilike(f"%{event_type.strip()}%"))
    if resource_type:
        stmt = stmt.where(AuditLog.resource_type == resource_type.strip())
    if actor_id:
        stmt = stmt.where(AuditLog.actor_id == actor_id)
    if actor_type:
        stmt = stmt.where(AuditLog.actor_type == actor_type.strip())
    if date_from:
        stmt = stmt.where(AuditLog.created_at >= date_from)
    if date_to:
        stmt = stmt.where(AuditLog.created_at <= date_to)
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                AuditLog.description.ilike(term),
                AuditLog.actor_email.ilike(term),
                AuditLog.resource_id.ilike(term),
            )
        )

    # Count total matching
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.scalar(count_stmt) or 0

    # Paginate and order by newest first
    stmt = stmt.order_by(AuditLog.created_at.desc()).offset((page - 1) * limit).limit(limit)
    logs = db.execute(stmt).scalars().all()

    return AuditLogListResponse(
        items=[AuditLogResponse.model_validate(log) for log in logs],
        total=total,
        page=page,
        limit=limit,
    )
