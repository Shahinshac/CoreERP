from datetime import datetime
from decimal import Decimal
import uuid
from pydantic import BaseModel, ConfigDict, field_validator

from app.core.money import validate_quantity_decimal


# ==========================================
# STOCK OPERATION SCHEMAS
# ==========================================

class StockInRequest(BaseModel):
    product_id: uuid.UUID
    quantity: Decimal
    reference: str | None = None
    reason: str | None = None

    @field_validator("quantity", mode="before")
    @classmethod
    def validate_qty(cls, v):
        qty = validate_quantity_decimal(v, allow_negative=False, field_name="Stock In quantity")
        if qty <= Decimal("0"):
            raise ValueError("Stock In quantity must be strictly greater than 0.")
        return qty


class StockOutRequest(BaseModel):
    product_id: uuid.UUID
    quantity: Decimal
    reference: str | None = None
    reason: str | None = None

    @field_validator("quantity", mode="before")
    @classmethod
    def validate_qty(cls, v):
        qty = validate_quantity_decimal(v, allow_negative=False, field_name="Stock Out quantity")
        if qty <= Decimal("0"):
            raise ValueError("Stock Out quantity must be strictly greater than 0.")
        return qty


class StockAdjustmentRequest(BaseModel):
    product_id: uuid.UUID
    quantity: Decimal  # delta adjustment (can be positive or negative)
    is_override: bool = False
    reference: str | None = None
    reason: str | None = None

    @field_validator("quantity", mode="before")
    @classmethod
    def validate_qty(cls, v):
        qty = validate_quantity_decimal(v, allow_negative=True, field_name="Adjustment quantity")
        if qty == Decimal("0"):
            raise ValueError("Adjustment quantity cannot be zero.")
        return qty


# ==========================================
# MOVEMENT HISTORY SCHEMAS
# ==========================================

class StockMovementResponse(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    movement_type: str
    quantity: Decimal
    reference_type: str
    reference_id: uuid.UUID | None = None
    notes: str | None = None
    created_by: uuid.UUID | None = None
    created_at: datetime

    product_name: str | None = None
    product_sku: str | None = None
    author_email: str | None = None

    model_config = ConfigDict(from_attributes=True)


class PaginatedMovementsResponse(BaseModel):
    items: list[StockMovementResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# ==========================================
# VALUATION SCHEMAS
# ==========================================

class CategoryValuation(BaseModel):
    category_id: uuid.UUID
    category_name: str
    total_quantity: Decimal
    total_valuation: Decimal


class ProductValuation(BaseModel):
    product_id: uuid.UUID
    product_name: str
    sku: str
    current_stock: Decimal
    purchase_price: Decimal
    valuation: Decimal


class InventoryValuationResponse(BaseModel):
    total_valuation: Decimal
    total_items_count: int
    by_category: list[CategoryValuation]
    by_product: list[ProductValuation]
