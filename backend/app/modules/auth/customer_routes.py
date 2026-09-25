import csv
from datetime import datetime
from decimal import Decimal
from io import StringIO
import secrets
import uuid
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import hash_password
from app.modules.audit.service import log_audit_event
from app.modules.auth.dependencies import get_current_staff, require_roles
from app.modules.auth.models import Customer, StaffRole, StaffUser
from app.modules.auth.schemas import EmailType
from app.modules.catalog.schemas import (
    ImportConfirmResponse,
    ImportPreviewResponse,
    RowImportResult,
)
from app.modules.sales.models import Sale

staff_customer_router = APIRouter(prefix="/api/staff/customers", tags=["Staff Customers"])


# ==========================================
# SCHEMAS
# ==========================================

class CustomerCreateRequest(BaseModel):
    name: str
    email: EmailType
    phone: str | None = None
    address: str | None = None
    gstin: str | None = None
    state: str | None = None
    password: str | None = None


class CustomerUpdateRequest(BaseModel):
    name: str | None = None
    phone: str | None = None
    address: str | None = None
    gstin: str | None = None
    state: str | None = None
    is_active: bool | None = None


class CustomerPurchaseSummary(BaseModel):
    sale_id: uuid.UUID
    invoice_number: str
    sale_date: datetime
    total_amount: Decimal
    status: str
    payment_method: str

    model_config = ConfigDict(from_attributes=True)


class CustomerDetailResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    phone: str | None
    address: str | None
    gstin: str | None = None
    state: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    purchases: list[CustomerPurchaseSummary] = []

    model_config = ConfigDict(from_attributes=True)


class CustomerListItem(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    phone: str | None
    address: str | None
    gstin: str | None = None
    state: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# ROUTES
# ==========================================

@staff_customer_router.get("", response_model=list[CustomerListItem])
def list_customers(
    search: str | None = Query(None),
    is_active: bool | None = Query(None),
    db: Session = Depends(get_db),
    _: StaffUser = Depends(get_current_staff),
):
    query = db.query(Customer)
    if is_active is not None:
        query = query.filter(Customer.is_active == is_active)
    if search:
        pat = f"%{search}%"
        query = query.filter(
            (Customer.name.ilike(pat)) | (Customer.email.ilike(pat)) | (Customer.phone.ilike(pat))
        )

    return query.order_by(Customer.name.asc()).all()


@staff_customer_router.get("/{customer_id}", response_model=CustomerDetailResponse)
def get_customer(
    customer_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: StaffUser = Depends(get_current_staff),
):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found.")

    sales = (
        db.query(Sale)
        .filter(Sale.customer_id == customer_id)
        .order_by(Sale.created_at.desc())
        .all()
    )

    purchase_history = [
        CustomerPurchaseSummary(
            sale_id=s.id,
            invoice_number=s.invoice_number,
            sale_date=s.created_at,
            total_amount=s.total_amount,
            status=s.status,
            payment_method=s.payment_method,
        )
        for s in sales
    ]

    return CustomerDetailResponse(
        id=customer.id,
        name=customer.name,
        email=customer.email,
        phone=customer.phone,
        address=customer.address,
        is_active=customer.is_active,
        created_at=customer.created_at,
        updated_at=customer.updated_at,
        purchases=purchase_history,
    )


@staff_customer_router.post("", response_model=CustomerDetailResponse, status_code=status.HTTP_201_CREATED)
def create_customer(
    payload: CustomerCreateRequest,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_roles(StaffRole.ADMIN, StaffRole.MANAGER, StaffRole.STAFF)),
):
    existing = db.query(Customer).filter(Customer.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Customer with email '{payload.email}' already exists.",
        )

    raw_password = payload.password or secrets.token_urlsafe(12)
    customer = Customer(
        email=payload.email,
        name=payload.name,
        phone=payload.phone,
        address=payload.address,
        gstin=payload.gstin,
        state=payload.state,
        password_hash=hash_password(raw_password),
        is_active=True,
    )
    db.add(customer)
    log_audit_event(
        db=db,
        event_type="customer.created",
        description=f"Customer '{customer.name}' ({customer.email}) created by staff {current_staff.email}.",
        actor_id=current_staff.id,
        actor_type="staff",
        actor_email=current_staff.email,
        resource_type="customer",
        resource_id=str(customer.id),
        details={"name": customer.name, "email": customer.email, "phone": customer.phone},
    )
    db.commit()
    db.refresh(customer)

    return CustomerDetailResponse(
        id=customer.id,
        name=customer.name,
        email=customer.email,
        phone=customer.phone,
        address=customer.address,
        gstin=customer.gstin,
        state=customer.state,
        is_active=customer.is_active,
        created_at=customer.created_at,
        updated_at=customer.updated_at,
        purchases=[],
    )


@staff_customer_router.put("/{customer_id}", response_model=CustomerDetailResponse)
def update_customer(
    customer_id: uuid.UUID,
    payload: CustomerUpdateRequest,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_roles(StaffRole.ADMIN, StaffRole.MANAGER, StaffRole.STAFF)),
):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found.")

    if payload.name is not None:
        customer.name = payload.name
    if payload.phone is not None:
        customer.phone = payload.phone
    if payload.address is not None:
        customer.address = payload.address
    if payload.gstin is not None:
        customer.gstin = payload.gstin
    if payload.state is not None:
        customer.state = payload.state
    if payload.is_active is not None:
        customer.is_active = payload.is_active

    log_audit_event(
        db=db,
        event_type="customer.updated",
        description=f"Customer '{customer.name}' ({customer.email}) updated by staff {current_staff.email}.",
        actor_id=current_staff.id,
        actor_type="staff",
        actor_email=current_staff.email,
        resource_type="customer",
        resource_id=str(customer.id),
        details={"is_active": customer.is_active},
    )

    db.commit()
    db.refresh(customer)

    return get_customer(customer_id, db, current_staff)


# ==========================================
# BULK CSV IMPORT FOR CUSTOMERS
# ==========================================

def _parse_and_validate_customer_rows(db: Session, reader: csv.DictReader) -> list[RowImportResult]:
    seen_emails = set()
    results: list[RowImportResult] = []

    for idx, raw_row in enumerate(reader, start=2):
        norm_row = {k.strip().lower(): (v.strip() if v else "") for k, v in raw_row.items() if k}
        errors: list[str] = []

        name = norm_row.get("name") or norm_row.get("customer_name") or ""
        email = norm_row.get("email") or norm_row.get("customer_email") or ""
        phone = norm_row.get("phone") or norm_row.get("mobile") or None
        address = norm_row.get("address") or None
        gstin = norm_row.get("gstin") or norm_row.get("gst") or None
        state = norm_row.get("state") or None
        password = norm_row.get("password") or None

        if not name:
            errors.append("Customer name is required.")

        if not email:
            errors.append("Customer email is required.")
        else:
            email_lower = email.lower()
            if "@" not in email_lower or "." not in email_lower.split("@")[-1]:
                errors.append(f"Invalid email address '{email}'.")
            elif email_lower in seen_emails:
                errors.append(f"Duplicate email '{email}' in import batch.")
            else:
                seen_emails.add(email_lower)
                existing = db.query(Customer).filter(Customer.email.ilike(email)).first()
                if existing:
                    errors.append(f"Customer with email '{email}' already exists.")

        parsed_data = {
            "name": name,
            "email": email,
            "phone": phone,
            "address": address,
            "gstin": gstin,
            "state": state,
            "has_custom_password": bool(password),
            "password": password,
        }

        results.append(
            RowImportResult(
                row_number=idx,
                data=parsed_data,
                is_valid=(len(errors) == 0),
                errors=errors,
            )
        )
    return results


@staff_customer_router.post("/import/preview", response_model=ImportPreviewResponse)
async def preview_customer_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: StaffUser = Depends(require_roles(StaffRole.ADMIN, StaffRole.MANAGER)),
):
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CSV file is empty or missing headers.")

    results = _parse_and_validate_customer_rows(db, reader)
    valid_count = sum(1 for r in results if r.is_valid)

    return ImportPreviewResponse(
        total_rows=len(results),
        valid_count=valid_count,
        invalid_count=len(results) - valid_count,
        rows=results,
    )


@staff_customer_router.post("/import/confirm", response_model=ImportConfirmResponse)
async def confirm_customer_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_roles(StaffRole.ADMIN, StaffRole.MANAGER)),
):
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CSV file is empty or missing headers.")

    results = _parse_and_validate_customer_rows(db, reader)
    imported_count = 0
    skipped_count = 0

    for res in results:
        if res.is_valid:
            d = res.data
            pwd = d.get("password") or secrets.token_urlsafe(12)
            customer = Customer(
                name=d["name"],
                email=d["email"],
                phone=d["phone"],
                address=d["address"],
                gstin=d["gstin"],
                state=d["state"],
                password_hash=hash_password(pwd),
                is_active=True,
            )
            db.add(customer)
            imported_count += 1
        else:
            skipped_count += 1

    if imported_count > 0:
        db.commit()
        log_audit_event(
            db=db,
            event_type="customers.bulk_imported",
            description=f"Bulk imported {imported_count} customers ({skipped_count} invalid skipped).",
            actor_id=current_staff.id if current_staff else None,
            actor_type="staff",
            actor_email=current_staff.email if current_staff else None,
            resource_type="customer",
            details={"imported_count": imported_count, "skipped_count": skipped_count},
        )

    return ImportConfirmResponse(
        total_processed=len(results),
        imported_count=imported_count,
        skipped_count=skipped_count,
        results=results,
    )
