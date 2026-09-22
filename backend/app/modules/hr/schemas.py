import re
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.money import validate_money_decimal
from app.modules.auth.models import StaffRole
from app.modules.auth.schemas import EmailType


class DeductionConfigItem(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Deduction label (e.g. Provident Fund)")
    type: str = Field(..., description="'fixed' or 'percentage'")
    value: Decimal = Field(..., description="Fixed amount in INR or percentage (0-100)")

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        clean = v.strip().lower()
        if clean not in ("fixed", "percentage"):
            raise ValueError("Deduction type must be either 'fixed' or 'percentage'.")
        return clean

    @field_validator("value", mode="before")
    @classmethod
    def validate_value(cls, v: Any) -> Decimal:
        val = validate_money_decimal(v, allow_negative=False, field_name="Deduction value")
        return val


class StaffCreateRequest(BaseModel):
    email: EmailType
    password: str = Field(..., min_length=8, description="Initial login password")
    role: StaffRole = Field(default=StaffRole.STAFF)
    full_name: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    employee_code: Optional[str] = Field(None, max_length=50)
    joining_date: Optional[date] = None
    base_salary: Decimal = Field(default=Decimal("0.00"), description="Monthly base salary")
    deductions_config: Optional[List[DeductionConfigItem]] = Field(default_factory=list)

    @field_validator("base_salary", mode="before")
    @classmethod
    def validate_base_salary(cls, v: Any) -> Decimal:
        return validate_money_decimal(v, allow_negative=False, field_name="Base salary")


class StaffUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    employee_code: Optional[str] = Field(None, max_length=50)
    joining_date: Optional[date] = None
    role: Optional[StaffRole] = None
    base_salary: Optional[Decimal] = None
    deductions_config: Optional[List[DeductionConfigItem]] = None

    @field_validator("base_salary", mode="before")
    @classmethod
    def validate_base_salary(cls, v: Any) -> Optional[Decimal]:
        if v is None:
            return None
        return validate_money_decimal(v, allow_negative=False, field_name="Base salary")


class StaffResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    role: str
    is_active: bool
    full_name: Optional[str] = None
    phone: Optional[str] = None
    employee_code: Optional[str] = None
    joining_date: Optional[date] = None
    base_salary: Decimal
    deductions_config: Optional[List[dict[str, Any]]] = None
    deactivated_at: Optional[datetime] = None
    created_at: datetime


class StaffListResponse(BaseModel):
    items: List[StaffResponse]
    total: int
    page: int
    limit: int


class SalaryGenerateRequest(BaseModel):
    period: str = Field(..., description="Salary period in YYYY-MM format (e.g., '2026-09')")
    notes: Optional[str] = None

    @field_validator("period")
    @classmethod
    def validate_period(cls, v: str) -> str:
        clean = v.strip()
        if not re.match(r"^\d{4}-(0[1-9]|1[0-2])$", clean):
            raise ValueError("Period must be formatted as YYYY-MM (e.g., '2026-09').")
        return clean


class SalaryCalculationPreview(BaseModel):
    staff_id: uuid.UUID
    staff_name: str
    staff_email: str
    employee_code: Optional[str] = None
    is_active: bool
    is_prorated: bool
    active_days: int
    total_days: int
    original_base_salary: Decimal
    prorated_base_salary: Decimal
    deductions: List[dict[str, Any]]
    total_deductions: Decimal
    net_salary: Decimal
    already_generated: bool
    proration_reason: Optional[str] = None


class SalaryPreviewResponse(BaseModel):
    period: str
    eligible_count: int
    total_net_payout: Decimal
    items: List[SalaryCalculationPreview]


class SalaryRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    staff_id: uuid.UUID
    staff_name: Optional[str] = None
    staff_email: Optional[str] = None
    employee_code: Optional[str] = None
    period: str
    base_salary: Decimal
    deductions: List[dict[str, Any]]
    total_deductions: Decimal
    net_salary: Decimal
    status: str
    generated_at: datetime
    generated_by: uuid.UUID
    paid_at: Optional[datetime] = None
    paid_by: Optional[uuid.UUID] = None
    payment_id: Optional[uuid.UUID] = None
    expense_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None


class SalaryRecordListResponse(BaseModel):
    items: List[SalaryRecordResponse]
    total: int
    page: int
    limit: int


class SalaryPayRequest(BaseModel):
    method: str = Field(default="bank_transfer", description="Payout method: 'bank_transfer', 'cash', or 'upi'")
    reference_id: Optional[str] = Field(None, max_length=255, description="Transaction UTR / payment reference")
    notes: Optional[str] = None

    @field_validator("method")
    @classmethod
    def validate_method(cls, v: str) -> str:
        clean = v.strip().lower()
        if clean not in ("bank_transfer", "cash", "upi"):
            raise ValueError("Payout method must be 'bank_transfer', 'cash', or 'upi'.")
        return clean
