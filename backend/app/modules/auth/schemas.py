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
    is_totp_enabled: bool = False
    created_at: datetime


class CustomerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    name: str
    phone: str | None = None
    is_active: bool
    is_portal_activated: bool = False
    created_at: datetime


class StaffTokenResponse(BaseModel):
    access_token: str | None = None
    token_type: str = "bearer"
    user: StaffUserResponse | None = None
    requires_2fa: bool = False
    temp_token: str | None = None


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


class TwoFactorSetupResponse(BaseModel):
    secret: str
    otpauth_url: str
    backup_codes: list[str]


class TwoFactorVerifyRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=16)


class TwoFactorDisableRequest(BaseModel):
    password: str = Field(..., min_length=6)


class TwoFactorLoginRequest(BaseModel):
    temp_token: str
    code: str = Field(..., min_length=6, max_length=16)


class StaffSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_agent: str | None = None
    ip_address: str | None = None
    created_at: datetime
    last_active_at: datetime
    expires_at: datetime
    is_current: bool = False


class StaffSessionListResponse(BaseModel):
    sessions: list[StaffSessionResponse]

