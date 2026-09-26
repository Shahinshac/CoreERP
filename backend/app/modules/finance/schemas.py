import uuid
import datetime as dt
from decimal import Decimal
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.money import validate_money_decimal
from app.modules.finance.models import ExpenseCategory, ExpenseSource


class ExpenseCreateRequest(BaseModel):
    category: ExpenseCategory = Field(..., description="Expense category")
    amount: Decimal = Field(..., description="Expense amount in INR (> 0)")
    description: Optional[str] = Field(None, max_length=1000)
    date: dt.date = Field(..., description="Date on which expense occurred")

    @field_validator("amount", mode="before")
    @classmethod
    def validate_amount(cls, v: Any) -> Decimal:
        val = validate_money_decimal(v, allow_negative=False, field_name="Expense amount")
        if val <= Decimal("0.00"):
            raise ValueError("Expense amount must be strictly greater than 0.00.")
        return val


class ExpenseUpdateRequest(BaseModel):
    category: Optional[ExpenseCategory] = None
    amount: Optional[Decimal] = None
    description: Optional[str] = None
    date: Optional[dt.date] = None

    @field_validator("amount", mode="before")
    @classmethod
    def validate_amount(cls, v: Any) -> Optional[Decimal]:
        if v is None:
            return None
        val = validate_money_decimal(v, allow_negative=False, field_name="Expense amount")
        if val <= Decimal("0.00"):
            raise ValueError("Expense amount must be strictly greater than 0.00.")
        return val


class ExpenseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category: str
    amount: Decimal
    description: Optional[str] = None
    date: dt.date
    created_by: uuid.UUID
    creator_name: Optional[str] = None
    source: str
    reference_id: Optional[str] = None
    is_deleted: bool
    deleted_at: Optional[dt.datetime] = None
    created_at: dt.datetime
    updated_at: dt.datetime


class ExpenseListResponse(BaseModel):
    items: List[ExpenseResponse]
    total: int
    page: int
    limit: int


class FinancialSummaryResponse(BaseModel):
    period: str
    revenue: Decimal = Field(..., description="Primary Cash Revenue (paid payments in period)")
    returns_refunded: Decimal = Field(default=Decimal("0.00"), description="Total product returns and refunds in period")
    net_revenue: Decimal = Field(default=Decimal("0.00"), description="Net Revenue after returns (revenue - returns_refunded)")
    invoiced_revenue: Decimal = Field(..., description="Accrual Revenue (invoices issued in period)")
    credit_notes_refunded: Decimal = Field(default=Decimal("0.00"), description="Total credit notes issued against invoices in period")
    cost_of_goods: Decimal = Field(..., description="Inventory purchase cost / stock intake in period")
    expenses: Decimal = Field(..., description="Total operating expenses (manual + system salary) in period")
    expenses_breakdown: Dict[str, Decimal] = Field(default_factory=dict, description="Category-wise expense breakdown")
    gross_profit: Decimal = Field(..., description="Gross Profit (net_revenue - cost_of_goods)")
    net_profit: Decimal = Field(..., description="Net Profit (gross_profit - expenses)")
    outstanding_receivables: Decimal = Field(..., description="Unpaid / partial invoice balances")
    emi_receivables: Decimal = Field(..., description="Unpaid EMI installment balances")
    total_receivables: Decimal = Field(..., description="Total receivables (invoice + EMI)")
    accounting_basis: str = Field(
        default="Cash basis primary (with accrual invoice metrics)",
        description="Accounting recognition methodology",
    )
