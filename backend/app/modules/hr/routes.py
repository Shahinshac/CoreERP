import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.db import get_db
from app.core.security import hash_password
from app.modules.auth.dependencies import get_current_staff, require_roles
from app.modules.auth.models import StaffRole, StaffUser
from app.modules.hr.models import SalaryRecord, SalaryRecordStatus
from app.modules.hr.schemas import (
    SalaryGenerateRequest,
    SalaryPayRequest,
    SalaryPreviewResponse,
    SalaryRecordListResponse,
    SalaryRecordResponse,
    StaffCreateRequest,
    StaffListResponse,
    StaffResponse,
    StaffUpdateRequest,
)
from app.modules.hr.service import (
    generate_salary_records,
    mark_salary_as_paid,
    preview_salary_generation,
)

hr_router = APIRouter(tags=["HR & Salary"])

ADMIN_ROLES = [StaffRole.ADMIN.value, StaffRole.SUPER_ADMIN.value]
FINANCE_ROLES = [StaffRole.ADMIN.value, StaffRole.SUPER_ADMIN.value, StaffRole.ACCOUNTANT.value]


def _build_staff_response(staff: StaffUser, caller: StaffUser) -> StaffResponse:
    caller_role = caller.role.value if isinstance(caller.role, StaffRole) else str(caller.role)
    is_admin = caller_role in ADMIN_ROLES
    is_self = caller.id == staff.id

    # Mask salary details for non-admin viewers who are not the user themselves
    base_sal = staff.base_salary if (is_admin or is_self) else Decimal("0.00")
    deductions = staff.deductions_config if (is_admin or is_self) else None

    return StaffResponse(
        id=staff.id,
        email=staff.email,
        role=staff.role.value if isinstance(staff.role, StaffRole) else str(staff.role),
        is_active=staff.is_active,
        full_name=staff.full_name,
        phone=staff.phone,
        employee_code=staff.employee_code,
        joining_date=staff.joining_date,
        base_salary=base_sal,
        deductions_config=deductions,
        deactivated_at=staff.deactivated_at,
        created_at=staff.created_at,
    )


def _build_salary_response(record: SalaryRecord) -> SalaryRecordResponse:
    staff_name = None
    staff_email = None
    employee_code = None
    if record.staff:
        staff_name = record.staff.full_name or record.staff.email.split("@")[0]
        staff_email = record.staff.email
        employee_code = record.staff.employee_code

    return SalaryRecordResponse(
        id=record.id,
        staff_id=record.staff_id,
        staff_name=staff_name,
        staff_email=staff_email,
        employee_code=employee_code,
        period=record.period,
        base_salary=record.base_salary,
        deductions=record.deductions or [],
        total_deductions=record.total_deductions,
        net_salary=record.net_salary,
        status=record.status,
        generated_at=record.generated_at,
        generated_by=record.generated_by,
        paid_at=record.paid_at,
        paid_by=record.paid_by,
        payment_id=record.payment_id,
        expense_id=record.expense_id,
        notes=record.notes,
    )


# -------------------------------------------------------------------------
# STAFF MANAGEMENT ENDPOINTS
# -------------------------------------------------------------------------

@hr_router.get(
    "/staff",
    response_model=StaffListResponse,
    summary="List and filter staff users",
)
def list_staff(
    search: Optional[str] = Query(None, description="Search by name, email, or employee code"),
    role: Optional[str] = Query(None, description="Filter by staff role"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    caller: StaffUser = Depends(get_current_staff),
):
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

    total_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.scalar(total_stmt) or 0

    stmt = stmt.order_by(StaffUser.created_at.desc()).offset((page - 1) * limit).limit(limit)
    users = db.execute(stmt).scalars().all()

    return StaffListResponse(
        items=[_build_staff_response(u, caller) for u in users],
        total=total,
        page=page,
        limit=limit,
    )


@hr_router.post(
    "/staff",
    response_model=StaffResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new staff member with salary configuration",
)
def create_staff(
    payload: StaffCreateRequest,
    db: Session = Depends(get_db),
    caller: StaffUser = Depends(require_roles(StaffRole.ADMIN, StaffRole.SUPER_ADMIN)),
):
    # Check duplicate email
    existing_email = db.execute(
        select(StaffUser).where(StaffUser.email == payload.email)
    ).scalar_one_or_none()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Staff user with email '{payload.email}' already exists.",
        )

    # Check duplicate employee code if provided
    if payload.employee_code:
        existing_code = db.execute(
            select(StaffUser).where(StaffUser.employee_code == payload.employee_code)
        ).scalar_one_or_none()
        if existing_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Employee code '{payload.employee_code}' is already assigned to another staff member.",
            )

    deductions_json = [d.model_dump(mode="json") for d in payload.deductions_config] if payload.deductions_config else []

    new_staff = StaffUser(
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        full_name=payload.full_name,
        phone=payload.phone,
        employee_code=payload.employee_code,
        joining_date=payload.joining_date,
        base_salary=payload.base_salary,
        deductions_config=deductions_json,
        is_active=True,
    )
    db.add(new_staff)
    db.commit()
    db.refresh(new_staff)

    return _build_staff_response(new_staff, caller)


@hr_router.get(
    "/staff/{id}",
    response_model=StaffResponse,
    summary="Get staff profile details",
)
def get_staff_detail(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    caller: StaffUser = Depends(get_current_staff),
):
    staff = db.execute(select(StaffUser).where(StaffUser.id == id)).scalar_one_or_none()
    if not staff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff user not found.")
    return _build_staff_response(staff, caller)


@hr_router.put(
    "/staff/{id}",
    response_model=StaffResponse,
    summary="Update staff profile and salary configuration",
)
def update_staff(
    id: uuid.UUID,
    payload: StaffUpdateRequest,
    db: Session = Depends(get_db),
    caller: StaffUser = Depends(get_current_staff),
):
    caller_role = caller.role.value if isinstance(caller.role, StaffRole) else str(caller.role)
    is_admin = caller_role in ADMIN_ROLES

    staff = db.execute(select(StaffUser).where(StaffUser.id == id)).scalar_one_or_none()
    if not staff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff user not found.")

    if not is_admin and caller.id != staff.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this staff profile.",
        )

    # General profile fields
    if payload.full_name is not None:
        staff.full_name = payload.full_name
    if payload.phone is not None:
        staff.phone = payload.phone
    if payload.joining_date is not None:
        staff.joining_date = payload.joining_date

    # Restricted fields: Admin/Super Admin only
    if payload.employee_code is not None:
        if not is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only administrators can modify employee codes.",
            )
        # Check uniqueness if changed
        if payload.employee_code != staff.employee_code:
            existing_code = db.execute(
                select(StaffUser).where(
                    StaffUser.employee_code == payload.employee_code,
                    StaffUser.id != id,
                )
            ).scalar_one_or_none()
            if existing_code:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Employee code '{payload.employee_code}' is already assigned to another staff member.",
                )
        staff.employee_code = payload.employee_code

    if payload.role is not None:
        if not is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only administrators can change staff roles.",
            )
        staff.role = payload.role

    if payload.base_salary is not None:
        if not is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only administrators can configure base salary.",
            )
        staff.base_salary = payload.base_salary

    if payload.deductions_config is not None:
        if not is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only administrators can configure deductions.",
            )
        staff.deductions_config = [d.model_dump(mode="json") for d in payload.deductions_config]

    db.commit()
    db.refresh(staff)
    return _build_staff_response(staff, caller)


@hr_router.post(
    "/staff/{id}/toggle-active",
    response_model=StaffResponse,
    summary="Activate or deactivate a staff member",
)
def toggle_staff_active(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    caller: StaffUser = Depends(require_roles(StaffRole.ADMIN, StaffRole.SUPER_ADMIN)),
):
    """
    Activates or deactivates a staff member without deleting historical records.
    Deactivating sets deactivated_at timestamp to ensure precise calendar proration or exclusion.
    """
    if id == caller.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own administrative account.",
        )

    staff = db.execute(select(StaffUser).where(StaffUser.id == id)).scalar_one_or_none()
    if not staff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff user not found.")

    if staff.is_active:
        staff.is_active = False
        staff.deactivated_at = datetime.now(timezone.utc)
    else:
        staff.is_active = True
        staff.deactivated_at = None

    db.commit()
    db.refresh(staff)
    return _build_staff_response(staff, caller)


# -------------------------------------------------------------------------
# SALARY GENERATION & RECORDS ENDPOINTS
# -------------------------------------------------------------------------

@hr_router.post(
    "/salary/preview",
    response_model=SalaryPreviewResponse,
    summary="Preview salary generation calculations for a period",
)
def preview_salary(
    payload: SalaryGenerateRequest,
    db: Session = Depends(get_db),
    caller: StaffUser = Depends(require_roles(StaffRole.ADMIN, StaffRole.SUPER_ADMIN)),
):
    preview_data = preview_salary_generation(db, payload.period)
    return SalaryPreviewResponse(**preview_data)


@hr_router.post(
    "/salary/generate",
    response_model=list[SalaryRecordResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Generate immutable salary run records for a period",
)
def generate_salary(
    payload: SalaryGenerateRequest,
    db: Session = Depends(get_db),
    caller: StaffUser = Depends(require_roles(StaffRole.ADMIN, StaffRole.SUPER_ADMIN)),
):
    records = generate_salary_records(
        db=db,
        generator=caller,
        period_str=payload.period,
        notes=payload.notes,
    )
    return [_build_salary_response(r) for r in records]


@hr_router.get(
    "/salary",
    response_model=SalaryRecordListResponse,
    summary="List and filter salary records",
)
def list_salary_records(
    period: Optional[str] = Query(None, description="Filter by YYYY-MM period"),
    staff_id: Optional[uuid.UUID] = Query(None, description="Filter by staff ID"),
    status: Optional[str] = Query(None, description="Filter by status ('generated' or 'paid')"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    caller: StaffUser = Depends(get_current_staff),
):
    caller_role = caller.role.value if isinstance(caller.role, StaffRole) else str(caller.role)
    is_finance_or_admin = caller_role in FINANCE_ROLES

    stmt = select(SalaryRecord).options(selectinload(SalaryRecord.staff))

    # Non-finance staff can only view their own salary records
    if not is_finance_or_admin:
        stmt = stmt.where(SalaryRecord.staff_id == caller.id)
    elif staff_id:
        stmt = stmt.where(SalaryRecord.staff_id == staff_id)

    if period:
        stmt = stmt.where(SalaryRecord.period == period.strip())
    if status:
        stmt = stmt.where(SalaryRecord.status == status.strip().lower())

    total_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.scalar(total_stmt) or 0

    stmt = (
        stmt.order_by(SalaryRecord.period.desc(), SalaryRecord.generated_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    records = db.execute(stmt).scalars().all()

    return SalaryRecordListResponse(
        items=[_build_salary_response(r) for r in records],
        total=total,
        page=page,
        limit=limit,
    )


@hr_router.get(
    "/salary/{id}",
    response_model=SalaryRecordResponse,
    summary="Get salary record detail with itemized deductions breakdown",
)
def get_salary_record(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    caller: StaffUser = Depends(get_current_staff),
):
    caller_role = caller.role.value if isinstance(caller.role, StaffRole) else str(caller.role)
    is_finance_or_admin = caller_role in FINANCE_ROLES

    stmt = (
        select(SalaryRecord)
        .options(selectinload(SalaryRecord.staff))
        .where(SalaryRecord.id == id)
    )
    record = db.execute(stmt).scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Salary record not found.")

    if not is_finance_or_admin and caller.id != record.staff_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view this salary record.",
        )

    return _build_salary_response(record)


@hr_router.post(
    "/salary/{id}/pay",
    response_model=SalaryRecordResponse,
    summary="Mark salary record as paid and create linked Payment and Expense records",
)
def pay_salary_record(
    id: uuid.UUID,
    payload: SalaryPayRequest,
    db: Session = Depends(get_db),
    caller: StaffUser = Depends(require_roles(StaffRole.ADMIN, StaffRole.SUPER_ADMIN, StaffRole.ACCOUNTANT)),
):
    updated_record = mark_salary_as_paid(
        db=db,
        payer=caller,
        salary_record_id=id,
        method=payload.method,
        reference_id=payload.reference_id,
        notes=payload.notes,
    )
    return _build_salary_response(updated_record)
