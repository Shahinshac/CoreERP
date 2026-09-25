from datetime import datetime, timedelta
import hashlib
import logging
import secrets
import uuid
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
import jwt
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.rate_limit import auth_rate_limiter
from app.core.security import (
    create_access_token,
    create_password_reset_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
    verify_password_reset_token,
)
import pyotp
from app.modules.audit.service import get_request_metadata, log_audit_event
from app.modules.auth.dependencies import get_current_customer, get_current_staff
from app.modules.auth.models import Customer, CustomerPasswordReset, StaffRole, StaffSession, StaffUser
from app.modules.notifications.service import email_service

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
    StaffSessionListResponse,
    StaffSessionResponse,
    StaffTokenResponse,
    StaffUserResponse,
    TwoFactorDisableRequest,
    TwoFactorLoginRequest,
    TwoFactorSetupResponse,
    TwoFactorVerifyRequest,
)

logger = logging.getLogger("app.auth")

staff_auth_router = APIRouter(prefix="/api/staff/auth", tags=["Staff Auth"])
staff_sessions_router = APIRouter(prefix="/api/staff/sessions", tags=["Staff Sessions"])
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


def record_staff_session(
    db: Session,
    staff_id: uuid.UUID,
    refresh_token: str,
    ip: str | None = None,
    ua: str | None = None,
) -> StaffSession:
    token_hash = hashlib.sha256(refresh_token.encode("utf-8")).hexdigest()
    session = StaffSession(
        staff_id=staff_id,
        refresh_token_hash=token_hash,
        user_agent=ua[:255] if ua else None,
        ip_address=ip[:50] if ip else None,
        expires_at=datetime.utcnow() + timedelta(days=7),
        last_active_at=datetime.utcnow(),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


# ==========================================
# STAFF AUTHENTICATION ROUTES
# ==========================================

@staff_auth_router.post("/login", response_model=StaffTokenResponse)
def staff_login(
    payload: StaffLoginRequest,
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
):
    auth_rate_limiter.check(request)
    ip, ua = get_request_metadata(request)
    staff = db.query(StaffUser).filter(StaffUser.email == payload.email).first()
    if not staff or not verify_password(payload.password, staff.password_hash):
        log_audit_event(
            db=db,
            event_type="auth.staff_login_failed",
            description=f"Failed staff login attempt for email '{payload.email}'.",
            actor_type="anonymous",
            actor_email=payload.email,
            ip_address=ip,
            user_agent=ua,
            resource_type="staff_user",
            commit=True,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    if not staff.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff account is deactivated.",
        )

    # 2FA Enforcement Check
    if staff.is_totp_enabled:
        temp_token = create_access_token(
            subject=str(staff.id),
            audience="staff",
            role="2fa_pending",
            expires_delta=timedelta(minutes=5),
        )
        return StaffTokenResponse(
            requires_2fa=True,
            temp_token=temp_token,
        )

    role_val = staff.role.value if isinstance(staff.role, StaffRole) else str(staff.role)
    access_token = create_access_token(subject=str(staff.id), audience="staff", role=role_val)
    refresh_token = create_refresh_token(subject=str(staff.id), audience="staff")

    record_staff_session(db, staff.id, refresh_token, ip=ip, ua=ua)
    set_refresh_cookie(response, REFRESH_COOKIE_NAME_STAFF, refresh_token)

    log_audit_event(
        db=db,
        event_type="auth.staff_login",
        description=f"Staff user '{staff.email}' ({role_val}) logged in successfully.",
        actor_id=staff.id,
        actor_type="staff",
        actor_email=staff.email,
        ip_address=ip,
        user_agent=ua,
        resource_type="staff_user",
        resource_id=str(staff.id),
        details={"role": role_val},
        commit=True,
    )

    return StaffTokenResponse(
        access_token=access_token,
        user=StaffUserResponse.model_validate(staff),
    )


@staff_auth_router.post("/2fa/login", response_model=StaffTokenResponse)
def staff_2fa_login(
    payload: TwoFactorLoginRequest,
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
):
    auth_rate_limiter.check(request)
    ip, ua = get_request_metadata(request)

    try:
        token_data = decode_token(payload.temp_token, expected_audience="staff")
        if token_data.get("role") != "2fa_pending":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid 2FA challenge token.")
        user_id = uuid.UUID(token_data.get("sub"))
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired 2FA challenge token.")

    staff = db.query(StaffUser).filter(StaffUser.id == user_id).first()
    if not staff or not staff.is_active or not staff.is_totp_enabled or not staff.totp_secret:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Staff user invalid or 2FA not enabled.")

    code = payload.code.strip()
    totp = pyotp.TOTP(staff.totp_secret)
    is_valid = totp.verify(code, valid_window=1)

    if not is_valid and staff.totp_backup_codes:
        code_hash = hashlib.sha256(code.encode("utf-8")).hexdigest()
        if code_hash in staff.totp_backup_codes:
            is_valid = True
            # Consume single-use backup code
            codes = list(staff.totp_backup_codes)
            codes.remove(code_hash)
            staff.totp_backup_codes = codes
            db.commit()

    if not is_valid:
        log_audit_event(
            db=db,
            event_type="auth.staff_2fa_failed",
            description=f"Failed 2FA verification attempt for staff '{staff.email}'.",
            actor_type="staff",
            actor_email=staff.email,
            ip_address=ip,
            user_agent=ua,
            resource_type="staff_user",
            resource_id=str(staff.id),
            commit=True,
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid 2FA code or backup code.")

    role_val = staff.role.value if isinstance(staff.role, StaffRole) else str(staff.role)
    access_token = create_access_token(subject=str(staff.id), audience="staff", role=role_val)
    refresh_token = create_refresh_token(subject=str(staff.id), audience="staff")

    record_staff_session(db, staff.id, refresh_token, ip=ip, ua=ua)
    set_refresh_cookie(response, REFRESH_COOKIE_NAME_STAFF, refresh_token)

    log_audit_event(
        db=db,
        event_type="auth.staff_login_2fa",
        description=f"Staff user '{staff.email}' completed 2FA login successfully.",
        actor_id=staff.id,
        actor_type="staff",
        actor_email=staff.email,
        ip_address=ip,
        user_agent=ua,
        resource_type="staff_user",
        resource_id=str(staff.id),
        details={"role": role_val},
        commit=True,
    )

    return StaffTokenResponse(
        access_token=access_token,
        user=StaffUserResponse.model_validate(staff),
    )


@staff_auth_router.post("/2fa/setup", response_model=TwoFactorSetupResponse)
def staff_2fa_setup(
    current_staff: StaffUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
):
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    otpauth_url = totp.provisioning_uri(name=current_staff.email, issuer_name="My Retail Store")

    backup_codes = [secrets.token_hex(4).upper() for _ in range(8)]
    hashed_codes = [hashlib.sha256(c.encode("utf-8")).hexdigest() for c in backup_codes]

    current_staff.totp_secret = secret
    current_staff.totp_backup_codes = hashed_codes
    db.commit()

    return TwoFactorSetupResponse(
        secret=secret,
        otpauth_url=otpauth_url,
        backup_codes=backup_codes,
    )


@staff_auth_router.post("/2fa/verify", response_model=MessageResponse)
def staff_2fa_verify(
    payload: TwoFactorVerifyRequest,
    current_staff: StaffUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
):
    if not current_staff.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA setup has not been initiated. Please run setup first.",
        )

    totp = pyotp.TOTP(current_staff.totp_secret)
    if not totp.verify(payload.code.strip(), valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code. Please check your authenticator app and try again.",
        )

    current_staff.is_totp_enabled = True
    db.commit()

    log_audit_event(
        db=db,
        event_type="auth.staff_2fa_enabled",
        description=f"Staff user '{current_staff.email}' enabled 2FA.",
        actor_id=current_staff.id,
        actor_type="staff",
        actor_email=current_staff.email,
        resource_type="staff_user",
        resource_id=str(current_staff.id),
        commit=True,
    )

    return MessageResponse(message="Two-factor authentication has been successfully enabled.")


@staff_auth_router.post("/2fa/disable", response_model=MessageResponse)
def staff_2fa_disable(
    payload: TwoFactorDisableRequest,
    current_staff: StaffUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.password, current_staff.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid account password.",
        )

    current_staff.is_totp_enabled = False
    current_staff.totp_secret = None
    current_staff.totp_backup_codes = None
    db.commit()

    log_audit_event(
        db=db,
        event_type="auth.staff_2fa_disabled",
        description=f"Staff user '{current_staff.email}' disabled 2FA.",
        actor_id=current_staff.id,
        actor_type="staff",
        actor_email=current_staff.email,
        resource_type="staff_user",
        resource_id=str(current_staff.id),
        commit=True,
    )

    return MessageResponse(message="Two-factor authentication has been disabled.")


@staff_auth_router.post("/refresh", response_model=StaffTokenResponse)
def staff_refresh(
    response: Response,
    request: Request,
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

    token_hash = hashlib.sha256(token_to_verify.encode("utf-8")).hexdigest()
    session = (
        db.query(StaffSession)
        .filter(StaffSession.refresh_token_hash == token_hash)
        .first()
    )
    if session and session.is_revoked:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has been revoked. Please log in again.",
        )

    staff = db.query(StaffUser).filter(StaffUser.id == user_id).first()
    if not staff or not staff.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive.")

    role_val = staff.role.value if isinstance(staff.role, StaffRole) else str(staff.role)
    new_access_token = create_access_token(subject=str(staff.id), audience="staff", role=role_val)
    new_refresh_token = create_refresh_token(subject=str(staff.id), audience="staff")

    ip, ua = get_request_metadata(request)
    if session:
        session.is_revoked = True
        session.last_active_at = datetime.utcnow()
        db.flush()

    record_staff_session(db, staff.id, new_refresh_token, ip=ip, ua=ua)
    set_refresh_cookie(response, REFRESH_COOKIE_NAME_STAFF, new_refresh_token)

    return StaffTokenResponse(
        access_token=new_access_token,
        user=StaffUserResponse.model_validate(staff),
    )


# Active Sessions Endpoints
@staff_auth_router.get("/sessions", response_model=StaffSessionListResponse)
@staff_sessions_router.get("", response_model=StaffSessionListResponse)
def list_staff_sessions(
    current_staff: StaffUser = Depends(get_current_staff),
    staff_refresh_token: str | None = Cookie(None),
    db: Session = Depends(get_db),
):
    current_hash = hashlib.sha256(staff_refresh_token.encode("utf-8")).hexdigest() if staff_refresh_token else None
    sessions = (
        db.query(StaffSession)
        .filter(StaffSession.staff_id == current_staff.id, StaffSession.is_revoked == False)
        .order_by(StaffSession.last_active_at.desc())
        .all()
    )
    result = []
    for s in sessions:
        result.append(
            StaffSessionResponse(
                id=s.id,
                user_agent=s.user_agent,
                ip_address=s.ip_address,
                created_at=s.created_at,
                last_active_at=s.last_active_at,
                expires_at=s.expires_at,
                is_current=(s.refresh_token_hash == current_hash),
            )
        )
    return StaffSessionListResponse(sessions=result)


@staff_auth_router.delete("/sessions/{session_id}", response_model=MessageResponse)
@staff_sessions_router.delete("/{session_id}", response_model=MessageResponse)
def revoke_staff_session(
    session_id: uuid.UUID,
    current_staff: StaffUser = Depends(get_current_staff),
    db: Session = Depends(get_db),
):
    session = (
        db.query(StaffSession)
        .filter(StaffSession.id == session_id, StaffSession.staff_id == current_staff.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
    session.is_revoked = True
    db.commit()
    return MessageResponse(message="Session revoked successfully.")


@staff_auth_router.post("/sessions/revoke-others", response_model=MessageResponse)
@staff_sessions_router.post("/revoke-others", response_model=MessageResponse)
def revoke_other_staff_sessions(
    current_staff: StaffUser = Depends(get_current_staff),
    staff_refresh_token: str | None = Cookie(None),
    db: Session = Depends(get_db),
):
    current_hash = hashlib.sha256(staff_refresh_token.encode("utf-8")).hexdigest() if staff_refresh_token else None
    q = db.query(StaffSession).filter(
        StaffSession.staff_id == current_staff.id,
        StaffSession.is_revoked == False,
    )
    if current_hash:
        q = q.filter(StaffSession.refresh_token_hash != current_hash)
    count = q.update({"is_revoked": True}, synchronize_session=False)
    db.commit()
    return MessageResponse(message=f"Revoked {count} other active session(s).")



@staff_auth_router.post("/logout", response_model=MessageResponse)
def staff_logout(response: Response):
    clear_refresh_cookie(response, REFRESH_COOKIE_NAME_STAFF)
    return MessageResponse(message="Staff logged out successfully.")


@staff_auth_router.get("/me", response_model=StaffUserResponse)
def staff_me(current_staff: StaffUser = Depends(get_current_staff)):
    return StaffUserResponse.model_validate(current_staff)


@staff_auth_router.post("/forgot-password", response_model=MessageResponse)
def staff_forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    auth_rate_limiter.check(request)
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
    request: Request = None,
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

    ip, ua = get_request_metadata(request)
    log_audit_event(
        db=db,
        event_type="auth.customer_register",
        description=f"New customer registered: '{customer.email}'.",
        actor_id=customer.id,
        actor_type="customer",
        actor_email=customer.email,
        ip_address=ip,
        user_agent=ua,
        resource_type="customer",
        resource_id=str(customer.id),
        commit=True,
    )

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
    request: Request,
    db: Session = Depends(get_db),
):
    auth_rate_limiter.check(request)
    ip, ua = get_request_metadata(request)
    customer = db.query(Customer).filter(Customer.email == payload.email).first()
    if not customer or not verify_password(payload.password, customer.password_hash):
        log_audit_event(
            db=db,
            event_type="auth.customer_login_failed",
            description=f"Failed customer login attempt for email '{payload.email}'.",
            actor_type="anonymous",
            actor_email=payload.email,
            ip_address=ip,
            user_agent=ua,
            resource_type="customer",
            commit=True,
        )
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

    log_audit_event(
        db=db,
        event_type="auth.customer_login",
        description=f"Customer '{customer.email}' logged in successfully.",
        actor_id=customer.id,
        actor_type="customer",
        actor_email=customer.email,
        ip_address=ip,
        user_agent=ua,
        resource_type="customer",
        resource_id=str(customer.id),
        commit=True,
    )

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


@customer_auth_router.post("/forgot-password", response_model=MessageResponse)
def customer_forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Initiates customer password reset flow.
    - Timing-safe / privacy-preserving: returns the exact same message whether the email exists or not.
    - Generates a cryptographically secure random single-use token.
    - Stores only the SHA-256 hash in the database with a 15-minute expiration.
    - Invalidates any previous unused reset tokens for the customer.
    - Dispatches email via EmailProvider.
    - Never logs token or password.
    """
    auth_rate_limiter.check(request)
    ip, ua = get_request_metadata(request)

    customer = db.query(Customer).filter(
        Customer.email == payload.email,
        Customer.is_active == True,
    ).first()

    if customer:
        now = datetime.utcnow()
        db.query(CustomerPasswordReset).filter(
            CustomerPasswordReset.customer_id == customer.id,
            CustomerPasswordReset.used_at == None,
        ).update({"used_at": now})

        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        expires_at = now + timedelta(minutes=15)

        reset_record = CustomerPasswordReset(
            customer_id=customer.id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        db.add(reset_record)
        db.commit()

        email_service.send_email(
            to_email=customer.email,
            subject="Customer Portal Password Reset",
            body_text=(
                f"Hello {customer.name},\n\n"
                f"A password reset request was received for your customer account.\n"
                f"Your single-use password reset token is: {raw_token}\n\n"
                f"This token will expire in 15 minutes.\n"
                f"If you did not request a password reset, you can safely ignore this message."
            ),
        )

        log_audit_event(
            db=db,
            event_type="auth.customer_password_reset_requested",
            description=f"Password reset token issued for customer '{customer.email}'.",
            actor_id=customer.id,
            actor_type="customer",
            actor_email=customer.email,
            ip_address=ip,
            user_agent=ua,
            resource_type="customer",
            resource_id=str(customer.id),
            commit=True,
        )

    return MessageResponse(
        message="If an account with this email exists, a password reset link has been sent."
    )


@customer_auth_router.post("/reset-password", response_model=MessageResponse)
def customer_reset_password(
    payload: ResetPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Completes password reset using single-use token.
    - Validates token hash and expiration.
    - Rejects already used tokens.
    - Hashes new password using application password hashing.
    - Invalidates the token upon use.
    - Never logs token or password.
    """
    auth_rate_limiter.check(request)
    ip, ua = get_request_metadata(request)

    token_str = payload.token.strip()
    if not token_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token.",
        )

    token_hash = hashlib.sha256(token_str.encode("utf-8")).hexdigest()
    now = datetime.utcnow()

    reset_record = db.query(CustomerPasswordReset).filter(
        CustomerPasswordReset.token_hash == token_hash,
        CustomerPasswordReset.used_at == None,
    ).first()

    if not reset_record or reset_record.expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token.",
        )

    customer = db.query(Customer).filter(
        Customer.id == reset_record.customer_id,
        Customer.is_active == True,
    ).first()

    if not customer:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token.",
        )

    # Invalidate token
    reset_record.used_at = now

    # Update customer password
    customer.password_hash = hash_password(payload.new_password)

    log_audit_event(
        db=db,
        event_type="auth.customer_password_reset_success",
        description=f"Password successfully reset for customer '{customer.email}'.",
        actor_id=customer.id,
        actor_type="customer",
        actor_email=customer.email,
        ip_address=ip,
        user_agent=ua,
        resource_type="customer",
        resource_id=str(customer.id),
        commit=True,
    )

    db.commit()

    return MessageResponse(
        message="Password has been successfully reset. You may now log in with your new password."
    )

