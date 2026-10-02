"""
System Administration API Routes — Server-side protected admin endpoints.

SECURITY:
- Every endpoint requires Super Admin or Admin role via `require_roles`.
- Backend authorization is the actual security boundary; frontend visibility is UX only.
- Sensitive credentials (DB passwords, JWT secrets, API keys) are NEVER exposed.
- All configuration changes generate immutable audit log entries.
- Historical invoices/transactions are NEVER retroactively modified.
"""
import logging
import platform
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.security import hash_password
from app.modules.admin.models import SystemConfig
from app.modules.admin.schemas import (
    StaffAdminListResponse,
    StaffAdminResponse,
    StaffCreateAdminRequest,
    StaffPasswordResetRequest,
    StaffRoleUpdateRequest,
    StaffToggleRequest,
    SystemConfigBulkUpdateRequest,
    SystemConfigListResponse,
    SystemConfigResponse,
    SystemConfigUpdateRequest,
    SystemOverviewResponse,
)
from app.modules.admin.service import (
    bulk_update_configs,
    get_all_configs,
    get_config_value,
    seed_default_configs,
    update_config,
)
from app.modules.audit.service import get_request_metadata, log_audit_event
from app.modules.auth.dependencies import require_roles
from app.modules.auth.models import Customer, StaffRole, StaffUser
from app.modules.catalog.models import Product
from app.modules.invoicing.models import Invoice
from app.modules.sales.models import Sale

logger = logging.getLogger("app.admin.routes")

admin_router = APIRouter(prefix="/api/admin", tags=["System Administration"])

# Guard: Only Super Admin and Admin
ADMIN_GUARD = require_roles(StaffRole.SUPER_ADMIN, StaffRole.ADMIN)


# =========================================================================
# 1. SYSTEM OVERVIEW
# =========================================================================

@admin_router.get(
    "/overview",
    response_model=SystemOverviewResponse,
    summary="System status overview",
)
def get_system_overview(
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(ADMIN_GUARD),
):
    """
    Returns system health metrics and counts.
    Does not expose secrets or credentials.
    """
    # Database connectivity check
    db_status = "connected"
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_status = "unreachable"

    total_products = db.scalar(select(func.count()).select_from(Product)) or 0
    total_customers = db.scalar(select(func.count()).select_from(Customer)) or 0
    total_invoices = db.scalar(select(func.count()).select_from(Invoice)) or 0
    total_staff = db.scalar(select(func.count()).select_from(StaffUser)) or 0
    total_sales = db.scalar(select(func.count()).select_from(Sale)) or 0

    return SystemOverviewResponse(
        app_version=get_config_value(db, "app_version", "1.0.0"),
        environment=settings.ENVIRONMENT,
        api_status="operational",
        database_status=db_status,
        total_products=total_products,
        total_customers=total_customers,
        total_invoices=total_invoices,
        total_staff=total_staff,
        total_sales=total_sales,
        uptime_info=f"Python {platform.python_version()} / {platform.system()} {platform.release()}",
    )


# =========================================================================
# 2. SYSTEM CONFIGURATION
# =========================================================================

@admin_router.get(
    "/configs",
    response_model=SystemConfigListResponse,
    summary="List all system configurations",
)
def list_configs(
    category: Optional[str] = Query(None, description="Filter by category"),
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(ADMIN_GUARD),
):
    """Returns all system configuration entries, optionally filtered by category."""
    # Ensure defaults are seeded
    seed_default_configs(db)

    configs = get_all_configs(db, category=category)

    # Mask sensitive config values for display
    response_configs = []
    for c in configs:
        resp = SystemConfigResponse.model_validate(c)
        if c.is_sensitive:
            resp.value = "••••••••"
        response_configs.append(resp)

    return SystemConfigListResponse(configs=response_configs)


@admin_router.put(
    "/configs/{key}",
    response_model=SystemConfigResponse,
    summary="Update a single system configuration",
)
def update_single_config(
    key: str,
    payload: SystemConfigUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(ADMIN_GUARD),
):
    """
    Update a single configuration value by key.
    Creates an immutable audit log entry.
    """
    ip, ua = get_request_metadata(request)

    try:
        config = update_config(
            db, key, payload.value,
            actor_id=current_staff.id,
            actor_email=current_staff.email,
            ip_address=ip,
            user_agent=ua,
            reason=payload.reason,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Configuration key '{key}' not found.",
        )

    return SystemConfigResponse.model_validate(config)


@admin_router.put(
    "/configs",
    response_model=SystemConfigListResponse,
    summary="Bulk update system configurations",
)
def bulk_update_system_configs(
    payload: SystemConfigBulkUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(ADMIN_GUARD),
):
    """
    Bulk update multiple configuration values.
    Each change is individually audit-logged.
    """
    ip, ua = get_request_metadata(request)

    try:
        updated = bulk_update_configs(
            db, payload.configs,
            actor_id=current_staff.id,
            actor_email=current_staff.email,
            ip_address=ip,
            user_agent=ua,
            reason=payload.reason,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    return SystemConfigListResponse(
        configs=[SystemConfigResponse.model_validate(c) for c in updated]
    )


@admin_router.post(
    "/configs/seed",
    summary="Re-seed default configurations (does not overwrite existing)",
)
def reseed_configs(
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(ADMIN_GUARD),
):
    """Re-run default config seeding. Only inserts keys that don't exist yet."""
    count = seed_default_configs(db)
    return {"message": f"Seeded {count} new configuration entries.", "created": count}


# =========================================================================
# 3. STAFF MANAGEMENT (Admin Panel)
# =========================================================================

@admin_router.get(
    "/staff",
    response_model=StaffAdminListResponse,
    summary="List all staff accounts (admin view)",
)
def admin_list_staff(
    search: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(ADMIN_GUARD),
):
    """Admin view of all staff accounts."""
    from sqlalchemy import or_

    stmt = select(StaffUser)

    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                StaffUser.email.ilike(term),
                StaffUser.full_name.ilike(term),
                StaffUser.employee_code.ilike(term),
            )
        )
    if role:
        stmt = stmt.where(StaffUser.role == role)
    if is_active is not None:
        stmt = stmt.where(StaffUser.is_active == is_active)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = stmt.order_by(StaffUser.created_at.desc())
    users = db.execute(stmt).scalars().all()

    items = []
    for u in users:
        items.append(StaffAdminResponse(
            id=u.id,
            email=u.email,
            role=u.role.value if isinstance(u.role, StaffRole) else str(u.role),
            full_name=u.full_name,
            phone=u.phone,
            employee_code=u.employee_code,
            is_active=u.is_active,
            created_at=u.created_at,
            deactivated_at=u.deactivated_at,
            is_totp_enabled=u.is_totp_enabled,
        ))

    return StaffAdminListResponse(items=items, total=total)


@admin_router.post(
    "/staff",
    response_model=StaffAdminResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new staff account",
)
def admin_create_staff(
    payload: StaffCreateAdminRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(ADMIN_GUARD),
):
    """Create a new staff user from admin panel."""
    # Prevent non-Super Admin from creating Super Admin accounts
    current_role = current_staff.role.value if isinstance(current_staff.role, StaffRole) else str(current_staff.role)
    if payload.role == "Super Admin" and current_role != "Super Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a Super Admin can create another Super Admin account.",
        )

    existing = db.execute(
        select(StaffUser).where(StaffUser.email == payload.email)
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Staff user with email '{payload.email}' already exists.",
        )

    if payload.employee_code:
        existing_code = db.execute(
            select(StaffUser).where(StaffUser.employee_code == payload.employee_code)
        ).scalar_one_or_none()
        if existing_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Employee code '{payload.employee_code}' is already in use.",
            )

    new_staff = StaffUser(
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        full_name=payload.full_name,
        phone=payload.phone,
        employee_code=payload.employee_code,
        is_active=True,
    )
    db.add(new_staff)

    ip, ua = get_request_metadata(request)
    log_audit_event(
        db=db,
        event_type="admin.staff_created",
        description=f"Staff '{new_staff.email}' created with role '{payload.role}' via admin panel.",
        actor_id=current_staff.id,
        actor_type="staff",
        actor_email=current_staff.email,
        ip_address=ip,
        user_agent=ua,
        resource_type="staff_user",
        resource_id=str(new_staff.id),
        details={"role": payload.role, "full_name": payload.full_name},
    )

    db.commit()
    db.refresh(new_staff)

    return StaffAdminResponse(
        id=new_staff.id,
        email=new_staff.email,
        role=new_staff.role.value if isinstance(new_staff.role, StaffRole) else str(new_staff.role),
        full_name=new_staff.full_name,
        phone=new_staff.phone,
        employee_code=new_staff.employee_code,
        is_active=new_staff.is_active,
        created_at=new_staff.created_at,
        deactivated_at=new_staff.deactivated_at,
        is_totp_enabled=new_staff.is_totp_enabled,
    )


@admin_router.patch(
    "/staff/{staff_id}/toggle",
    response_model=StaffAdminResponse,
    summary="Enable/disable a staff account",
)
def admin_toggle_staff(
    staff_id: uuid.UUID,
    payload: StaffToggleRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(ADMIN_GUARD),
):
    """Enable or disable a staff account."""
    staff = db.execute(
        select(StaffUser).where(StaffUser.id == staff_id)
    ).scalar_one_or_none()

    if not staff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff user not found.")

    if staff.id == current_staff.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account.",
        )

    old_status = staff.is_active
    staff.is_active = payload.is_active
    staff.deactivated_at = None if payload.is_active else datetime.now(timezone.utc)

    ip, ua = get_request_metadata(request)
    action = "activated" if payload.is_active else "deactivated"
    log_audit_event(
        db=db,
        event_type=f"admin.staff_{action}",
        description=f"Staff '{staff.email}' {action} via admin panel.",
        actor_id=current_staff.id,
        actor_type="staff",
        actor_email=current_staff.email,
        ip_address=ip,
        user_agent=ua,
        resource_type="staff_user",
        resource_id=str(staff.id),
        details={"old_status": old_status, "new_status": payload.is_active},
    )
    db.commit()
    db.refresh(staff)

    return StaffAdminResponse(
        id=staff.id,
        email=staff.email,
        role=staff.role.value if isinstance(staff.role, StaffRole) else str(staff.role),
        full_name=staff.full_name,
        phone=staff.phone,
        employee_code=staff.employee_code,
        is_active=staff.is_active,
        created_at=staff.created_at,
        deactivated_at=staff.deactivated_at,
        is_totp_enabled=staff.is_totp_enabled,
    )


@admin_router.patch(
    "/staff/{staff_id}/role",
    response_model=StaffAdminResponse,
    summary="Change a staff user's role",
)
def admin_update_staff_role(
    staff_id: uuid.UUID,
    payload: StaffRoleUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(ADMIN_GUARD),
):
    """Change the role of a staff user (audit-logged)."""
    current_role = current_staff.role.value if isinstance(current_staff.role, StaffRole) else str(current_staff.role)

    # Only Super Admin can assign/change Super Admin role
    if payload.role == "Super Admin" and current_role != "Super Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a Super Admin can assign the Super Admin role.",
        )

    staff = db.execute(
        select(StaffUser).where(StaffUser.id == staff_id)
    ).scalar_one_or_none()

    if not staff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff user not found.")

    old_role = staff.role.value if isinstance(staff.role, StaffRole) else str(staff.role)

    if old_role == "Super Admin" and current_role != "Super Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a Super Admin can change another Super Admin's role.",
        )

    staff.role = payload.role

    ip, ua = get_request_metadata(request)
    log_audit_event(
        db=db,
        event_type="admin.staff_role_changed",
        description=f"Staff '{staff.email}' role changed from '{old_role}' to '{payload.role}'.",
        actor_id=current_staff.id,
        actor_type="staff",
        actor_email=current_staff.email,
        ip_address=ip,
        user_agent=ua,
        resource_type="staff_user",
        resource_id=str(staff.id),
        details={"old_role": old_role, "new_role": payload.role, "reason": payload.reason},
    )
    db.commit()
    db.refresh(staff)

    return StaffAdminResponse(
        id=staff.id,
        email=staff.email,
        role=staff.role.value if isinstance(staff.role, StaffRole) else str(staff.role),
        full_name=staff.full_name,
        phone=staff.phone,
        employee_code=staff.employee_code,
        is_active=staff.is_active,
        created_at=staff.created_at,
        deactivated_at=staff.deactivated_at,
        is_totp_enabled=staff.is_totp_enabled,
    )


@admin_router.post(
    "/staff/{staff_id}/reset-password",
    summary="Reset a staff user's password",
)
def admin_reset_staff_password(
    staff_id: uuid.UUID,
    payload: StaffPasswordResetRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(ADMIN_GUARD),
):
    """Reset a staff user's password via admin panel (audit-logged)."""
    staff = db.execute(
        select(StaffUser).where(StaffUser.id == staff_id)
    ).scalar_one_or_none()

    if not staff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff user not found.")

    staff.password_hash = hash_password(payload.new_password)

    ip, ua = get_request_metadata(request)
    log_audit_event(
        db=db,
        event_type="admin.staff_password_reset",
        description=f"Password reset for staff '{staff.email}' via admin panel.",
        actor_id=current_staff.id,
        actor_type="staff",
        actor_email=current_staff.email,
        ip_address=ip,
        user_agent=ua,
        resource_type="staff_user",
        resource_id=str(staff.id),
        details={"reason": payload.reason},
    )
    db.commit()

    return {"message": f"Password for '{staff.email}' has been reset successfully."}
