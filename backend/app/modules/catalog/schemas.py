from datetime import datetime
from decimal import Decimal
import uuid
from pydantic import BaseModel, ConfigDict, field_validator

from app.core.money import validate_money_decimal, validate_quantity_decimal


# ==========================================
# CATEGORY SCHEMAS
# ==========================================

class CategoryBase(BaseModel):
    name: str
    description: str | None = None


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class CategoryResponse(CategoryBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# BRAND SCHEMAS
# ==========================================

class BrandBase(BaseModel):
    name: str


class BrandCreate(BrandBase):
    pass


class BrandUpdate(BaseModel):
    name: str | None = None


class BrandResponse(BrandBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# PRODUCT SCHEMAS
# ==========================================

class ProductBase(BaseModel):
    name: str
    sku: str
    barcode: str | None = None
    category_id: uuid.UUID
    brand_id: uuid.UUID
    unit: str = "pcs"
    purchase_price: Decimal
    selling_price: Decimal
    gst_rate: Decimal = Decimal("0.00")
    min_stock: Decimal = Decimal("0.000")

    @field_validator("purchase_price", mode="before")
    @classmethod
    def validate_purchase_price(cls, v):
        return validate_money_decimal(v, allow_negative=False, field_name="Purchase price")

    @field_validator("selling_price", mode="before")
    @classmethod
    def validate_selling_price(cls, v):
        return validate_money_decimal(v, allow_negative=False, field_name="Selling price")

    @field_validator("gst_rate", mode="before")
    @classmethod
    def validate_gst_rate(cls, v):
        return validate_money_decimal(v, allow_negative=False, field_name="GST rate")

    @field_validator("min_stock", mode="before")
    @classmethod
    def validate_min_stock(cls, v):
        return validate_quantity_decimal(v, allow_negative=False, field_name="Minimum stock")


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: str | None = None
    sku: str | None = None
    barcode: str | None = None
    category_id: uuid.UUID | None = None
    brand_id: uuid.UUID | None = None
    unit: str | None = None
    purchase_price: Decimal | None = None
    selling_price: Decimal | None = None
    gst_rate: Decimal | None = None
    min_stock: Decimal | None = None
    is_active: bool | None = None

    @field_validator("purchase_price", mode="before")
    @classmethod
    def validate_purchase_price(cls, v):
        if v is None:
            return v
        return validate_money_decimal(v, allow_negative=False, field_name="Purchase price")

    @field_validator("selling_price", mode="before")
    @classmethod
    def validate_selling_price(cls, v):
        if v is None:
            return v
        return validate_money_decimal(v, allow_negative=False, field_name="Selling price")

    @field_validator("gst_rate", mode="before")
    @classmethod
    def validate_gst_rate(cls, v):
        if v is None:
            return v
        return validate_money_decimal(v, allow_negative=False, field_name="GST rate")

    @field_validator("min_stock", mode="before")
    @classmethod
    def validate_min_stock(cls, v):
        if v is None:
            return v
        return validate_quantity_decimal(v, allow_negative=False, field_name="Minimum stock")


class ProductResponse(BaseModel):
    id: uuid.UUID
    name: str
    sku: str
    barcode: str | None
    category_id: uuid.UUID
    brand_id: uuid.UUID
    unit: str
    purchase_price: Decimal
    selling_price: Decimal
    gst_rate: Decimal
    current_stock: Decimal
    min_stock: Decimal
    image_path: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    category: CategoryResponse | None = None
    brand: BrandResponse | None = None

    model_config = ConfigDict(from_attributes=True)
