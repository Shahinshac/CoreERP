import uuid
from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.money import validate_money_decimal
from app.modules.payments.models import PaymentMethod, PaymentStatus


class PaymentCreateRequest(BaseModel):
    invoice_id: Optional[uuid.UUID] = None
    customer_id: Optional[uuid.UUID] = None
    emi_plan_id: Optional[uuid.UUID] = Field(None, description="Optional EMI Plan ID to record installment payment against")
    emi_installment_number: Optional[int] = Field(None, description="Optional target installment number for waterfall allocation")
    method: PaymentMethod = Field(..., description="Payment method")
    amount: Decimal = Field(..., description="Payment amount (must be > 0)")
    idempotency_key: str = Field(..., min_length=1, max_length=100, description="Unique client-generated idempotency key")
    reference_id: Optional[str] = Field(None, max_length=255, description="External reference / UTR / card authorization code")
    notes: Optional[str] = None
    allow_overpayment: bool = Field(False, description="Admin-only flag to permit overpayment beyond invoice grand total")

    @field_validator("amount", mode="before")
    @classmethod
    def validate_payment_amount(cls, v):
        try:
            amt = validate_money_decimal(v, allow_negative=False, field_name="Payment amount")
        except (TypeError, ValueError) as exc:
            raise ValueError(str(exc)) from exc
        if amt <= Decimal("0.00"):
            raise ValueError("Payment amount must be strictly greater than 0.00.")
        return amt


class PaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    invoice_id: Optional[uuid.UUID] = None
    customer_id: Optional[uuid.UUID] = None
    emi_plan_id: Optional[uuid.UUID] = None
    created_by: uuid.UUID
    method: str
    amount: Decimal
    status: str
    idempotency_key: str
    reference_id: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    # Augmented contextual fields
    invoice_number: Optional[str] = None
    customer_name: Optional[str] = None
    invoice_payment_status: Optional[str] = None
    invoice_remaining_balance: Optional[Decimal] = None


class PaymentListResponse(BaseModel):
    items: List[PaymentResponse]
    total: int
    page: int
    limit: int


class UPIIntentResponse(BaseModel):
    upi_uri: str
    seller_upi_id: str
    seller_name: str
    amount: Decimal
    invoice_number: str
    notes: Optional[str] = None
