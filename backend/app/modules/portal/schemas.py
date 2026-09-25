import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class PortalPurchaseItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_name: str
    product_sku: str
    quantity: Decimal
    unit_price: Decimal
    total_amount: Decimal


class PortalPurchaseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    invoice_number: str
    created_at: datetime
    subtotal: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    status: str
    payment_method: str
    items: List[PortalPurchaseItem] = []


class PortalPaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    invoice_id: Optional[uuid.UUID] = None
    invoice_number: Optional[str] = None
    amount: Decimal
    method: str
    status: str
    reference_id: Optional[str] = None
    emi_plan_id: Optional[uuid.UUID] = None
    created_at: datetime


class PortalEmiInstallmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    installment_number: int
    due_date: date
    amount_due: Decimal
    amount_paid: Decimal
    status: str


class PortalEmiPlanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    invoice_id: Optional[uuid.UUID] = None
    invoice_number: Optional[str] = None
    principal: Decimal
    down_payment: Decimal
    number_of_installments: int
    interest_rate: Optional[Decimal] = None
    interest_amount: Decimal
    total_financed: Decimal
    installment_amount: Decimal
    start_date: date
    total_paid: Decimal
    remaining_balance: Decimal
    status: str
    installments: List[PortalEmiInstallmentResponse] = []


class PortalDashboardSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    outstanding_balance: Decimal
    active_emi_plans_count: int
    total_purchases_count: int
    total_spent: Decimal
    open_tickets_count: int = Field(
        default=0,
        description="Open customer support tickets count. Stubbed as 0 until Phase 14 support tickets module.",
    )
    recent_purchases: List[PortalPurchaseResponse] = []


class PortalProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: str
    phone: Optional[str] = None
    address: Optional[str] = None
    gstin: Optional[str] = None
    state: Optional[str] = None
    created_at: datetime


class PortalProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    gstin: Optional[str] = None
    state: Optional[str] = None
