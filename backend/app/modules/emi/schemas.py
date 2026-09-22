import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.money import parse_decimal, quantize_money


def validate_money_amount(v: Any) -> Decimal:
    try:
        val = parse_decimal(v)
        return quantize_money(val)
    except (TypeError, ValueError) as e:
        raise ValueError(f"Invalid monetary decimal amount: {e}") from e


class EmiPlanPreviewRequest(BaseModel):
    principal: Decimal = Field(..., description="Total purchase/financing principal")
    down_payment: Decimal = Field(default=Decimal("0.00"), description="Initial upfront payment")
    number_of_installments: int = Field(default=3, ge=1, le=60, description="Tenure in months")
    interest_rate: Decimal | None = Field(default=None, ge=0, le=100, description="Annual simple interest %")
    start_date: date | None = Field(default=None, description="Start date of financing")

    @field_validator("principal", "down_payment", mode="before")
    @classmethod
    def validate_amounts(cls, v: Any) -> Decimal:
        return validate_money_amount(v)


class EmiInstallmentPreview(BaseModel):
    installment_number: int
    due_date: date
    amount_due: Decimal
    amount_paid: Decimal
    status: str


class EmiPlanPreviewResponse(BaseModel):
    principal: Decimal
    down_payment: Decimal
    financed_principal: Decimal
    interest_rate: Decimal | None
    interest_amount: Decimal
    total_financed: Decimal
    installment_amount: Decimal
    number_of_installments: int
    start_date: date
    installments: list[EmiInstallmentPreview]


class EmiPlanCreateRequest(BaseModel):
    customer_id: uuid.UUID
    invoice_id: uuid.UUID | None = None
    principal: Decimal = Field(..., gt=0)
    down_payment: Decimal = Field(default=Decimal("0.00"), ge=0)
    number_of_installments: int = Field(default=3, ge=1, le=60)
    interest_rate: Decimal | None = Field(default=None, ge=0, le=100)
    start_date: date | None = None
    notes: str | None = None

    @field_validator("principal", "down_payment", mode="before")
    @classmethod
    def validate_amounts(cls, v: Any) -> Decimal:
        return validate_money_amount(v)


class EmiInstallmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    emi_plan_id: uuid.UUID
    installment_number: int
    due_date: date
    amount_due: Decimal
    amount_paid: Decimal
    remaining_amount: Decimal
    status: str
    days_overdue: int = 0


class EmiPaymentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    amount: Decimal
    method: str
    status: str
    idempotency_key: str
    reference_id: str | None
    created_at: datetime


class EmiPlanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    customer_id: uuid.UUID
    customer_name: str | None = None
    invoice_id: uuid.UUID | None = None
    principal: Decimal
    down_payment: Decimal
    number_of_installments: int
    interest_rate: Decimal | None
    interest_amount: Decimal
    total_financed: Decimal
    installment_amount: Decimal
    start_date: date
    status: str
    notes: str | None = None
    total_paid: Decimal = Decimal("0.00")
    remaining_balance: Decimal = Decimal("0.00")
    created_at: datetime


class EmiPlanDetailResponse(EmiPlanResponse):
    installments: list[EmiInstallmentResponse]
    payments: list[EmiPaymentSummary] = []


class EmiPlanListResponse(BaseModel):
    items: list[EmiPlanResponse]
    total: int
    page: int
    limit: int


class EmiPaymentRequest(BaseModel):
    amount: Decimal = Field(..., gt=0)
    method: str = Field(default="emi")
    idempotency_key: str = Field(..., min_length=1, max_length=100)
    reference_id: str | None = None
    notes: str | None = None
    allow_overpayment: bool = False

    @field_validator("amount", mode="before")
    @classmethod
    def validate_amount(cls, v: Any) -> Decimal:
        return validate_money_amount(v)


class OverdueInstallmentResponse(BaseModel):
    plan_id: uuid.UUID
    customer_id: uuid.UUID
    customer_name: str
    customer_phone: str | None
    customer_email: str | None
    installment_id: uuid.UUID
    installment_number: int
    due_date: date
    amount_due: Decimal
    amount_paid: Decimal
    amount_overdue: Decimal
    days_overdue: int
