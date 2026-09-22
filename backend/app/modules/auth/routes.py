import logging
import uuid
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
import jwt
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import (
    create_access_token,
    create_password_reset_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
    verify_password_reset_token,
)
from app.modules.auth.dependencies import get_current_customer, get_current_staff
from app.modules.auth.models import Customer, StaffRole, StaffUser
from app.modules.auth.schemas import (
    CustomerLoginRequest,
    CustomerRegisterRequest,
    CustomerResponse,
    CustomerTokenResponse,
    ForgotPasswordRequest,
    MessageResponse,
    RefreshTokenRequest,
    ResetPasswordRequest,
    StaffLoginRequest,
    StaffTokenResponse,
    StaffUserResponse,
)

logger = logging.getLogger("app.auth")

staff_auth_router = APIRouter(prefix="/api/staff/auth", tags=["Staff Auth"])
customer_auth_router = APIRouter(prefix="/api/customers/auth", tags=["Customer Auth"])


REFRESH_COOKIE_NAME_STAFF = "staff_refresh_token"
REFRESH_COOKIE_NAME_CUSTOMER = "customer_refresh_token"
COOKIE_PATH = "/api"
COOKIE_MAX_AGE = 7 * 24 * 3600
COOKIE_SECURE = True
COOKIE_SAMESITE = "none"


def set_refresh_cookie(response: Response, key: str, token: str) -> None:
    response.set_cookie(
        key=key,
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path=COOKIE_PATH,
        max_age=COOKIE_MAX_AGE,
    )


def clear_refresh_cookie(response: Response, key: str) -> None:
    response.delete_cookie(
        key=key,
        path=COOKIE_PATH,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
    )


# ==========================================
# STAFF AUTHENTICATION ROUTES
# ==========================================

@staff_auth_router.post("/login", response_model=StaffTokenResponse)
def staff_login(
    payload: StaffLoginRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    staff = db.query(StaffUser).filter(StaffUser.email == payload.email).first()
    if not staff or not verify_password(payload.password, staff.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    if not staff.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff account is deactivated.",
        )

    role_val = staff.role.value if isinstance(staff.role, StaffRole) else str(staff.role)
    access_token = create_access_token(subject=str(staff.id), audience="staff", role=role_val)
    refresh_token = create_refresh_token(subject=str(staff.id), audience="staff")

    set_refresh_cookie(response, REFRESH_COOKIE_NAME_STAFF, refresh_token)

    return StaffTokenResponse(
        access_token=access_token,
        user=StaffUserResponse.model_validate(staff),
    )


@staff_auth_router.post("/refresh", response_model=StaffTokenResponse)
def staff_refresh(
    response: Response,
    body: RefreshTokenRequest | None = None,
    staff_refresh_token: str | None = Cookie(None),
    db: Session = Depends(get_db),
):
    token_to_verify = (body and body.refresh_token) or staff_refresh_token
    if not token_to_verify:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is missing.",
        )

    try:
        payload = decode_token(token_to_verify, expected_audience="staff")
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type.")
        user_id_str = payload.get("sub")
        user_id = uuid.UUID(user_id_str)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        )

    staff = db.query(StaffUser).filter(StaffUser.id == user_id).first()
    if not staff or not staff.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive.")

    role_val = staff.role.value if isinstance(staff.role, StaffRole) else str(staff.role)
    new_access_token = create_access_token(subject=str(staff.id), audience="staff", role=role_val)
    new_refresh_token = create_refresh_token(subject=str(staff.id), audience="staff")

    set_refresh_cookie(response, REFRESH_COOKIE_NAME_STAFF, new_refresh_token)

    return StaffTokenResponse(
        access_token=new_access_token,
        user=StaffUserResponse.model_validate(staff),
    )


@staff_auth_router.post("/logout", response_model=MessageResponse)
def staff_logout(response: Response):
    clear_refresh_cookie(response, REFRESH_COOKIE_NAME_STAFF)
    return MessageResponse(message="Staff logged out successfully.")


@staff_auth_router.get("/me", response_model=StaffUserResponse)
def staff_me(current_staff: StaffUser = Depends(get_current_staff)):
    return StaffUserResponse.model_validate(current_staff)


@staff_auth_router.post("/forgot-password", response_model=MessageResponse)
def staff_forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    staff = db.query(StaffUser).filter(StaffUser.email == payload.email).first()
    if staff and staff.is_active:
        # Generate token
        token = create_password_reset_token(staff.email)
        # Stubbed notification delivery (never log the actual token directly in cleartext in production)
        logger.info(f"Password reset token issued for staff email: {staff.email}")
        # In development/test, we return generic success
    return MessageResponse(message="If the email exists, password reset instructions have been sent.")


@staff_auth_router.post("/reset-password", response_model=MessageResponse)
def staff_reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    email = verify_password_reset_token(payload.token)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token.",
        )

    staff = db.query(StaffUser).filter(StaffUser.email == email).first()
    if not staff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff user not found.")

    staff.password_hash = hash_password(payload.new_password)
    db.commit()

    return MessageResponse(message="Password reset successfully. You may now log in.")


# ==========================================
# CUSTOMER AUTHENTICATION ROUTES
# ==========================================

@customer_auth_router.post("/register", response_model=CustomerTokenResponse, status_code=status.HTTP_201_CREATED)
def customer_register(
    payload: CustomerRegisterRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    existing = db.query(Customer).filter(Customer.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    customer = Customer(
        email=payload.email,
        password_hash=hash_password(payload.password),
        name=payload.name,
        phone=payload.phone,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)

    access_token = create_access_token(subject=str(customer.id), audience="customer")
    refresh_token = create_refresh_token(subject=str(customer.id), audience="customer")

    set_refresh_cookie(response, REFRESH_COOKIE_NAME_CUSTOMER, refresh_token)

    return CustomerTokenResponse(
        access_token=access_token,
        user=CustomerResponse.model_validate(customer),
    )


@customer_auth_router.post("/login", response_model=CustomerTokenResponse)
def customer_login(
    payload: CustomerLoginRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    customer = db.query(Customer).filter(Customer.email == payload.email).first()
    if not customer or not verify_password(payload.password, customer.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    if not customer.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Customer account is deactivated.",
        )

    access_token = create_access_token(subject=str(customer.id), audience="customer")
    refresh_token = create_refresh_token(subject=str(customer.id), audience="customer")

    set_refresh_cookie(response, REFRESH_COOKIE_NAME_CUSTOMER, refresh_token)

    return CustomerTokenResponse(
        access_token=access_token,
        user=CustomerResponse.model_validate(customer),
    )


@customer_auth_router.post("/refresh", response_model=CustomerTokenResponse)
def customer_refresh(
    response: Response,
    body: RefreshTokenRequest | None = None,
    customer_refresh_token: str | None = Cookie(None),
    db: Session = Depends(get_db),
):
    token_to_verify = (body and body.refresh_token) or customer_refresh_token
    if not token_to_verify:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is missing.",
        )

    try:
        payload = decode_token(token_to_verify, expected_audience="customer")
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type.")
        user_id_str = payload.get("sub")
        user_id = uuid.UUID(user_id_str)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        )

    customer = db.query(Customer).filter(Customer.id == user_id).first()
    if not customer or not customer.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Customer not found or inactive.")

    new_access_token = create_access_token(subject=str(customer.id), audience="customer")
    new_refresh_token = create_refresh_token(subject=str(customer.id), audience="customer")

    set_refresh_cookie(response, REFRESH_COOKIE_NAME_CUSTOMER, new_refresh_token)

    return CustomerTokenResponse(
        access_token=new_access_token,
        user=CustomerResponse.model_validate(customer),
    )


@customer_auth_router.post("/logout", response_model=MessageResponse)
def customer_logout(response: Response):
    clear_refresh_cookie(response, REFRESH_COOKIE_NAME_CUSTOMER)
    return MessageResponse(message="Customer logged out successfully.")


@customer_auth_router.get("/me", response_model=CustomerResponse)
def customer_me(current_customer: Customer = Depends(get_current_customer)):
    return CustomerResponse.model_validate(current_customer)
