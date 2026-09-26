import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class InvoiceItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: Optional[uuid.UUID] = None
    product_name: str
    product_sku: str
    hsn_code: Optional[str] = None
    quantity: Decimal
    unit_price: Decimal
    taxable_value: Decimal
    gst_rate: Decimal
    cgst_rate: Decimal
    cgst_amount: Decimal
    sgst_rate: Decimal
    sgst_amount: Decimal
    igst_rate: Decimal
    igst_amount: Decimal
    total_amount: Decimal


class CreditNoteItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    invoice_item_id: Optional[uuid.UUID] = None
    product_name: str
    quantity: Decimal
    taxable_value: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    total_amount: Decimal


class CreditNoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    credit_note_number: str
    financial_year: str
    credit_note_date: date
    invoice_id: uuid.UUID
    staff_id: uuid.UUID
    reason: str
    subtotal_refunded: Decimal
    cgst_refunded: Decimal
    sgst_refunded: Decimal
    igst_refunded: Decimal
    total_tax_refunded: Decimal
    grand_total_refunded: Decimal
    created_at: datetime
    items: List[CreditNoteItemResponse] = []


class EmiInstallmentBriefResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    installment_number: int
    due_date: date
    amount_due: Decimal
    amount_paid: Decimal
    status: str


class EmiPlanBriefResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    principal: Decimal
    down_payment: Decimal
    number_of_installments: int
    interest_rate: Optional[Decimal] = None
    interest_amount: Decimal
    total_financed: Decimal
    installment_amount: Decimal
    start_date: date
    status: str
    installments: List[EmiInstallmentBriefResponse] = []


class InvoiceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    invoice_number: str
    financial_year: str
    invoice_date: date
    sale_id: Optional[uuid.UUID] = None
    customer_id: Optional[uuid.UUID] = None
    staff_id: uuid.UUID

    seller_name: str
    seller_gstin: str
    seller_state: str
    seller_state_code: Optional[str] = None
    seller_address: Optional[str] = None
    seller_phone: Optional[str] = None

    buyer_name: str
    buyer_gstin: Optional[str] = None
    buyer_state: str
    buyer_state_code: Optional[str] = None
    buyer_address: Optional[str] = None
    buyer_phone: Optional[str] = None

    is_inter_state: bool
    place_of_supply: str

    subtotal: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    total_tax: Decimal
    grand_total: Decimal

    payment_status: str
    payment_method: Optional[str] = None
    is_cancelled: bool
    notes: Optional[str] = None
    created_at: datetime

    items: List[InvoiceItemResponse] = []
    credit_notes: List[CreditNoteResponse] = []
    emi_plan: Optional[EmiPlanBriefResponse] = None


class InvoiceListResponse(BaseModel):
    items: List[InvoiceResponse]
    total: int
    page: int
    limit: int


class CreditNoteItemInput(BaseModel):
    invoice_item_id: uuid.UUID
    quantity: Decimal = Field(..., gt=Decimal("0.000"), description="Quantity to reverse")


class CreditNoteCreateRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)
    items: Optional[List[CreditNoteItemInput]] = Field(
        None,
        description="Specific items to reverse. If omitted, full invoice is reversed.",
    )


class GenerateInvoiceFromSaleRequest(BaseModel):
    buyer_name: Optional[str] = None
    buyer_gstin: Optional[str] = None
    buyer_state: Optional[str] = None
    buyer_address: Optional[str] = None
    notes: Optional[str] = None


class QuotationItemCreate(BaseModel):
    product_id: uuid.UUID
    quantity: Decimal = Field(..., gt=Decimal("0.000"), description="Quantity")
    unit_price: Optional[Decimal] = Field(None, gt=Decimal("0.00"), description="Custom unit price; defaults to product selling price")
    discount_amount: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"), description="Line discount amount")


class QuotationCreateRequest(BaseModel):
    customer_id: Optional[uuid.UUID] = None
    buyer_name: Optional[str] = None
    buyer_gstin: Optional[str] = None
    buyer_state: Optional[str] = None
    buyer_address: Optional[str] = None
    buyer_phone: Optional[str] = None
    valid_until: Optional[date] = None
    notes: Optional[str] = None
    items: List[QuotationItemCreate] = Field(..., min_length=1)


class QuotationItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: Optional[uuid.UUID] = None
    product_name: str
    product_sku: str
    hsn_code: Optional[str] = None
    quantity: Decimal
    unit_price: Decimal
    discount_amount: Decimal
    taxable_value: Decimal
    gst_rate: Decimal
    cgst_rate: Decimal
    cgst_amount: Decimal
    sgst_rate: Decimal
    sgst_amount: Decimal
    igst_rate: Decimal
    igst_amount: Decimal
    total_amount: Decimal


class QuotationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    quotation_number: str
    financial_year: str
    quotation_date: date
    valid_until: Optional[date] = None
    customer_id: Optional[uuid.UUID] = None
    staff_id: uuid.UUID

    seller_name: str
    seller_gstin: str
    seller_state: str
    seller_state_code: Optional[str] = None
    seller_address: Optional[str] = None
    seller_phone: Optional[str] = None

    buyer_name: str
    buyer_gstin: Optional[str] = None
    buyer_state: str
    buyer_state_code: Optional[str] = None
    buyer_address: Optional[str] = None
    buyer_phone: Optional[str] = None

    is_inter_state: bool
    place_of_supply: str

    subtotal: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    total_tax: Decimal
    grand_total: Decimal

    status: str
    converted_invoice_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    items: List[QuotationItemResponse] = []


class QuotationListResponse(BaseModel):
    items: List[QuotationResponse]
    total: int
    page: int
    limit: int


class QuotationStatusUpdateRequest(BaseModel):
    status: str = Field(..., pattern="^(draft|sent|cancelled)$")

