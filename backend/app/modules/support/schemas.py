from datetime import date, datetime
from typing import List, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field


# ==========================================
# WARRANTY SCHEMAS
# ==========================================

class WarrantyCreateRequest(BaseModel):
    product_id: uuid.UUID
    customer_id: uuid.UUID
    sale_item_id: Optional[uuid.UUID] = None
    serial_number: Optional[str] = None
    purchase_date: date
    start_date: date
    end_date: date


class WarrantyClaimRequest(BaseModel):
    claim_notes: Optional[str] = None


class WarrantyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID
    product_name: Optional[str] = None
    customer_id: uuid.UUID
    customer_name: Optional[str] = None
    sale_item_id: Optional[uuid.UUID] = None
    serial_number: Optional[str] = None
    purchase_date: date
    start_date: date
    end_date: date
    is_claimed: bool
    claimed_at: Optional[datetime] = None
    claim_notes: Optional[str] = None
    status: str
    created_at: datetime


# ==========================================
# SUPPORT TICKET SCHEMAS
# ==========================================

class TicketCommentCreateRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=5000)


class TicketCommentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    ticket_id: uuid.UUID
    author_id: uuid.UUID
    author_type: str
    author_name: str
    body: str
    created_at: datetime


class TicketCreateRequest(BaseModel):
    subject: str = Field(..., min_length=3, max_length=255)
    description: str = Field(..., min_length=5, max_length=10000)
    priority: Optional[str] = Field(default="medium")


class TicketStatusUpdateRequest(BaseModel):
    status: str = Field(..., pattern="^(open|in_progress|resolved|closed)$")


class TicketAssignRequest(BaseModel):
    staff_id: uuid.UUID


class TicketResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    ticket_number: str
    customer_id: uuid.UUID
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    subject: str
    description: str
    attachment_path: Optional[str] = None
    attachment_public_id: Optional[str] = None
    status: str
    priority: str
    assigned_staff_id: Optional[uuid.UUID] = None
    assigned_staff_name: Optional[str] = None
    resolved_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    comments: List[TicketCommentResponse] = []
