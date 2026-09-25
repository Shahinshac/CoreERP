from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.money import quantize_money


class OpenDrawerRequest(BaseModel):
    opening_cash: Decimal = Field(default=Decimal("0.00"), ge=0)
    opening_notes: Optional[str] = None

    @field_validator("opening_cash", mode="before")
    @classmethod
    def validate_opening_cash(cls, v):
        return quantize_money(v, field_name="Opening cash")


class CashMovementRequest(BaseModel):
    movement_type: Literal["cash_in", "cash_out", "cash_drop"]
    amount: Decimal = Field(gt=0)
    reason: str = Field(min_length=3, max_length=255)

    @field_validator("amount", mode="before")
    @classmethod
    def validate_amount(cls, v):
        amt = quantize_money(v, field_name="Movement amount")
        if amt <= Decimal("0.00"):
            raise ValueError("Movement amount must be greater than 0.00.")
        return amt


class CloseDrawerRequest(BaseModel):
    closing_cash: Decimal = Field(ge=0)
    denominations: Optional[dict[str, int]] = None
    closing_notes: Optional[str] = None

    @field_validator("closing_cash", mode="before")
    @classmethod
    def validate_closing_cash(cls, v):
        return quantize_money(v, field_name="Closing cash")


class CashMovementResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    movement_type: str
    amount: Decimal
    reason: str
    performed_by_id: uuid.UUID
    performed_by_email: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CashDrawerSessionResponse(BaseModel):
    id: uuid.UUID
    cashier_id: uuid.UUID
    cashier_email: Optional[str] = None
    status: str
    opened_at: datetime
    closed_at: Optional[datetime] = None
    opening_cash: Decimal
    closing_cash: Optional[Decimal] = None
    expected_cash: Optional[Decimal] = None
    variance: Optional[Decimal] = None
    opening_notes: Optional[str] = None
    closing_notes: Optional[str] = None
    denominations: Optional[dict[str, int]] = None
    movements_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class ActiveSessionSummaryResponse(BaseModel):
    id: uuid.UUID
    cashier_id: uuid.UUID
    cashier_email: str
    status: str
    opened_at: datetime
    opening_cash: Decimal
    cash_sales_amount: Decimal
    cash_sales_count: int
    cash_refunds_amount: Decimal
    cash_refunds_count: int
    cash_in_amount: Decimal
    cash_out_amount: Decimal
    expected_cash: Decimal
    total_sales_amount: Decimal
    transaction_count: int
    sales_by_payment_method: dict[str, Decimal] = Field(default_factory=dict)
    opening_notes: Optional[str] = None
    movements: list[CashMovementResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class CurrentDrawerStatusResponse(BaseModel):
    active: bool
    session: Optional[ActiveSessionSummaryResponse] = None


class XReportResponse(BaseModel):
    session_id: uuid.UUID
    cashier_id: uuid.UUID
    cashier_email: str
    status: str
    opened_at: datetime
    report_time: datetime
    opening_cash: Decimal
    cash_sales_amount: Decimal
    cash_sales_count: int
    cash_refunds_amount: Decimal
    cash_refunds_count: int
    cash_in_amount: Decimal
    cash_out_amount: Decimal
    expected_cash: Decimal
    counted_cash: Optional[Decimal] = None
    variance: Optional[Decimal] = None
    transaction_count: int
    movements: list[CashMovementResponse] = Field(default_factory=list)


class ZReportResponse(BaseModel):
    session_id: uuid.UUID
    cashier_id: uuid.UUID
    cashier_email: str
    status: str
    opened_at: datetime
    closed_at: datetime
    opening_cash: Decimal
    cash_sales_amount: Decimal
    cash_sales_count: int
    cash_refunds_amount: Decimal
    cash_refunds_count: int
    cash_in_amount: Decimal
    cash_out_amount: Decimal
    expected_cash: Decimal
    actual_cash: Decimal
    variance: Decimal
    sales_by_payment_method: dict[str, Decimal] = Field(default_factory=dict)
    total_sales_amount: Decimal
    transaction_count: int
    denominations: Optional[dict[str, int]] = None
    opening_notes: Optional[str] = None
    closing_notes: Optional[str] = None
    movements: list[CashMovementResponse] = Field(default_factory=list)
