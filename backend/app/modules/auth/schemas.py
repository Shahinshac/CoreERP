import uuid
from datetime import datetime
from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.modules.auth.models import StaffRole

EmailType = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        to_lower=True,
        pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
        max_length=255,
    ),
]


class StaffLoginRequest(BaseModel):
    email: EmailType
    password: str = Field(..., min_length=6)


class CustomerRegisterRequest(BaseModel):
    email: EmailType
    password: str = Field(..., min_length=6)
    name: str = Field(..., min_length=2, max_length=255)
    phone: str | None = Field(None, max_length=50)


class CustomerLoginRequest(BaseModel):
    email: EmailType
    password: str = Field(..., min_length=6)


class RefreshTokenRequest(BaseModel):
    refresh_token: str | None = None


class StaffUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    role: StaffRole
    is_active: bool
    created_at: datetime


class CustomerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    name: str
    phone: str | None = None
    is_active: bool
    created_at: datetime


class StaffTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: StaffUserResponse


class CustomerTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: CustomerResponse


class ForgotPasswordRequest(BaseModel):
    email: EmailType


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=6)


class MessageResponse(BaseModel):
    message: str
