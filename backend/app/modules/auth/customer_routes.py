from datetime import datetime
from decimal import Decimal
import secrets
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import hash_password
from app.modules.auth.dependencies import get_current_staff, require_roles
from app.modules.auth.models import Customer, StaffRole, StaffUser
from app.modules.auth.schemas import EmailType
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
    password: str | None = None


class CustomerUpdateRequest(BaseModel):
    name: str | None = None
    phone: str | None = None
    address: str | None = None
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
    _: StaffUser = Depends(require_roles(StaffRole.ADMIN, StaffRole.MANAGER, StaffRole.STAFF)),
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
        password_hash=hash_password(raw_password),
        is_active=True,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)

    return CustomerDetailResponse(
        id=customer.id,
        name=customer.name,
        email=customer.email,
        phone=customer.phone,
        address=customer.address,
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
    _: StaffUser = Depends(require_roles(StaffRole.ADMIN, StaffRole.MANAGER, StaffRole.STAFF)),
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
    if payload.is_active is not None:
        customer.is_active = payload.is_active

    db.commit()
    db.refresh(customer)

    return get_customer(customer_id, db, _)
