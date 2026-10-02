"""
System Administration Schemas — Pydantic models for admin API requests/responses.
"""
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ----- System Config -----

class SystemConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    key: str
    value: str
    category: str
    description: Optional[str] = None
    value_type: str = "string"
    is_sensitive: bool = False
    updated_at: datetime


class SystemConfigUpdateRequest(BaseModel):
    value: str
    reason: Optional[str] = Field(None, max_length=500, description="Reason for the change (required for sensitive settings)")

    @field_validator("value")
    @classmethod
    def value_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Configuration value must not be empty.")
        return v.strip()


class SystemConfigBulkUpdateRequest(BaseModel):
    configs: Dict[str, str] = Field(..., description="Map of config key -> new value")
    reason: Optional[str] = Field(None, max_length=500)


class SystemConfigListResponse(BaseModel):
    configs: List[SystemConfigResponse]


# ----- System Overview -----

class SystemOverviewResponse(BaseModel):
    app_version: str = "1.0.0"
    environment: str
    api_status: str = "operational"
    database_status: str = "connected"
    total_products: int = 0
    total_customers: int = 0
    total_invoices: int = 0
    total_staff: int = 0
    total_sales: int = 0
    uptime_info: Optional[str] = None


# ----- Staff Management (admin view) -----

class StaffAdminResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    role: str
    full_name: Optional[str] = None
    phone: Optional[str] = None
    employee_code: Optional[str] = None
    is_active: bool
    created_at: datetime
    deactivated_at: Optional[datetime] = None
    is_totp_enabled: bool = False


class StaffAdminListResponse(BaseModel):
    items: List[StaffAdminResponse]
    total: int


class StaffCreateAdminRequest(BaseModel):
    email: str
    password: str = Field(..., min_length=8)
    role: str = "Staff"
    full_name: Optional[str] = None
    phone: Optional[str] = None
    employee_code: Optional[str] = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email address.")
        return v


class StaffToggleRequest(BaseModel):
    is_active: bool


class StaffRoleUpdateRequest(BaseModel):
    role: str
    reason: Optional[str] = Field(None, max_length=500)

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        allowed = {"Super Admin", "Admin", "Manager", "Staff", "Accountant"}
        if v not in allowed:
            raise ValueError(f"Role must be one of: {', '.join(sorted(allowed))}")
        return v


class StaffPasswordResetRequest(BaseModel):
    new_password: str = Field(..., min_length=8)
    reason: Optional[str] = Field(None, max_length=500)
