from datetime import datetime
from decimal import Decimal
import uuid
from pydantic import BaseModel, ConfigDict, field_validator

from app.core.money import validate_money_decimal, validate_quantity_decimal


# ==========================================
# POS CHECKOUT SCHEMAS
# ==========================================

class CartItemInput(BaseModel):
    product_id: uuid.UUID
    quantity: Decimal
    discount_amount: Decimal = Decimal("0.00")

    @field_validator("quantity", mode="before")
    @classmethod
    def validate_qty(cls, v):
        qty = validate_quantity_decimal(v, allow_negative=False, field_name="Item quantity")
        if qty <= Decimal("0"):
            raise ValueError("Item quantity must be strictly greater than 0.")
        return qty

    @field_validator("discount_amount", mode="before")
    @classmethod
    def validate_item_discount(cls, v):
        if v is None:
            return Decimal("0.00")
        return validate_money_decimal(v, allow_negative=False, field_name="Item discount")


class SplitPaymentPortion(BaseModel):
    method: str
    amount: Decimal

    @field_validator("amount", mode="before")
    @classmethod
    def validate_portion_amount(cls, v):
        amt = validate_money_decimal(v, allow_negative=False, field_name="Payment portion amount")
        if amt <= Decimal("0.00"):
            raise ValueError("Payment portion amount must be strictly greater than 0.00.")
        return amt

    @field_validator("method")
    @classmethod
    def validate_method(cls, v: str):
        allowed = {"cash", "upi", "card"}
        m = v.strip().lower()
        if m not in allowed:
            raise ValueError(f"Invalid payment method '{v}'. Supported methods: cash, upi, card.")
        return m


class SplitPaymentDetail(BaseModel):
    method: str
    amount: Decimal

    model_config = ConfigDict(from_attributes=True)


class POSCheckoutRequest(BaseModel):
    customer_id: uuid.UUID | None = None
    items: list[CartItemInput]
    discount_amount: Decimal = Decimal("0.00")
    payment_method: str = "cash"
    split_payments: list[SplitPaymentPortion] | None = None
    notes: str | None = None
    client_total: Decimal | None = None  # Ignored by server; server always recalculates

    @field_validator("discount_amount", mode="before")
    @classmethod
    def validate_order_discount(cls, v):
        if v is None:
            return Decimal("0.00")
        return validate_money_decimal(v, allow_negative=False, field_name="Order discount")

    @field_validator("items")
    @classmethod
    def validate_items_non_empty(cls, v):
        if not v:
            raise ValueError("Cart cannot be empty for checkout.")
        return v


class SaleItemResponse(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    product_sku: str
    quantity: Decimal
    unit_price: Decimal
    discount_amount: Decimal
    total_price: Decimal
    returned_quantity: Decimal

    model_config = ConfigDict(from_attributes=True)


class SaleResponse(BaseModel):
    id: uuid.UUID
    invoice_number: str
    customer_id: uuid.UUID | None
    customer_name: str | None = None
    staff_id: uuid.UUID
    staff_email: str
    sale_date: datetime
    subtotal: Decimal
    discount_amount: Decimal
    tax_amount: Decimal  # Placeholder pre-GST
    total_amount: Decimal
    status: str
    payment_method: str
    payment_details: list[SplitPaymentDetail] | None = None
    notes: str | None
    items: list[SaleItemResponse]
    gst_invoice_id: uuid.UUID | None = None
    gst_invoice_number: str | None = None

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# RETURNS SCHEMAS
# ==========================================

class ReturnItemInput(BaseModel):
    sale_item_id: uuid.UUID
    quantity: Decimal

    @field_validator("quantity", mode="before")
    @classmethod
    def validate_qty(cls, v):
        qty = validate_quantity_decimal(v, allow_negative=False, field_name="Return quantity")
        if qty <= Decimal("0"):
            raise ValueError("Return quantity must be strictly greater than 0.")
        return qty


class POSReturnRequest(BaseModel):
    sale_id: uuid.UUID
    reason: str | None = None
    items: list[ReturnItemInput]

    @field_validator("items")
    @classmethod
    def validate_items_non_empty(cls, v):
        if not v:
            raise ValueError("Must select at least one item to return.")
        return v


class ReturnItemResponse(BaseModel):
    id: uuid.UUID
    sale_item_id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    quantity: Decimal
    refund_amount: Decimal

    model_config = ConfigDict(from_attributes=True)


class SaleReturnResponse(BaseModel):
    id: uuid.UUID
    return_number: str
    sale_id: uuid.UUID
    invoice_number: str
    staff_id: uuid.UUID
    staff_email: str
    return_date: datetime
    total_refund_amount: Decimal
    reason: str | None
    items: list[ReturnItemResponse]

    model_config = ConfigDict(from_attributes=True)


class POSProductResponse(BaseModel):
    id: uuid.UUID
    name: str
    sku: str
    barcode: str | None = None
    unit: str = "pcs"
    selling_price: Decimal
    gst_rate: Decimal
    current_stock: Decimal
    min_stock: Decimal
    image_path: str | None = None

    model_config = ConfigDict(from_attributes=True)
