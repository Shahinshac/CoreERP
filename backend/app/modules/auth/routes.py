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
from app.modules.auth.dependencies import get_current_customer, get_current_staff, require_roles
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
        must_change_password=bool(getattr(staff, 'must_change_password', False)),
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

def _normalize_phone_digits(phone: str | None) -> str:
    if not phone:
        return ""
    digits = "".join(filter(str.isdigit, phone))
    return digits[-10:] if len(digits) >= 10 else digits


@customer_auth_router.post("/register", response_model=CustomerTokenResponse, status_code=status.HTTP_201_CREATED)
def customer_register(
    payload: CustomerRegisterRequest,
    response: Response,
    request: Request = None,
    db: Session = Depends(get_db),
):
    ip, ua = get_request_metadata(request)
    existing = db.query(Customer).filter(Customer.email == payload.email).first()

    if existing:
        # If the portal account was already activated with a customer password
        if getattr(existing, "is_portal_activated", False):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email is already registered and active. Please log in or use 'Forgot Password'.",
            )

        # Account was created in-store during a sale or by staff, and is now claiming/activating portal access!
        if existing.phone and payload.phone:
            norm_existing = _normalize_phone_digits(existing.phone)
            norm_payload = _normalize_phone_digits(payload.phone)
            if norm_existing and norm_payload and norm_existing != norm_payload:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The phone number does not match the customer record on file. Please enter the phone number provided during your in-store purchase.",
                )

        # Activate portal account with chosen password
        existing.password_hash = hash_password(payload.password)
        if payload.name:
            existing.name = payload.name
        if payload.phone:
            existing.phone = payload.phone
        existing.is_portal_activated = True
        existing.is_active = True

        db.commit()
        db.refresh(existing)
        customer = existing

        log_audit_event(
            db=db,
            event_type="auth.customer_activated",
            description=f"In-store customer '{customer.email}' successfully activated self-service portal account.",
            actor_id=customer.id,
            actor_type="customer",
            actor_email=customer.email,
            ip_address=ip,
            user_agent=ua,
            resource_type="customer",
            resource_id=str(customer.id),
            commit=True,
        )
    else:
        # Brand new customer self-registering
        customer = Customer(
            email=payload.email,
            password_hash=hash_password(payload.password),
            name=payload.name,
            phone=payload.phone,
            is_portal_activated=True,
            is_active=True,
        )
        db.add(customer)
        db.commit()
        db.refresh(customer)

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
        if customer and not getattr(customer, "is_portal_activated", False):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Your account was registered in-store during a purchase, but portal access has not been activated yet. Please click 'Register' to set your password and activate your account.",
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
    customer.is_portal_activated = True

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


# ==========================================
# ADMIN: STAFF ACCOUNT CREATION & ONBOARDING
# ==========================================

from app.modules.auth.schemas import (
    StaffAdminDetailResponse,
    StaffChangePasswordRequest,
    StaffCreateRequest,
    StaffOnboardingResult,
)


@staff_auth_router.post(
    "/create",
    response_model=StaffOnboardingResult,
    status_code=status.HTTP_201_CREATED,
)
def admin_create_staff(
    payload: StaffCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_roles(StaffRole.SUPER_ADMIN, StaffRole.ADMIN)),
):
    """
    Admin-only: Create a new staff account.
    - Generates a secure temporary password if not provided.
    - Hashes credential before storage (never stored in plaintext).
    - Sets must_change_password=True so staff is forced to change on first login.
    - Sends a welcome email with login credentials.
    - Returns whether email was sent; admin can resend if email failed.
    """
    from app.modules.auth.dependencies import require_roles
    ip, ua = get_request_metadata(request)

    # Duplicate email check
    existing = db.query(StaffUser).filter(StaffUser.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A staff account with email '{payload.email}' already exists.",
        )

    # Generate or use provided temporary password
    temp_password = payload.temporary_password or secrets.token_urlsafe(12)

    # Hash before storing — NEVER store plaintext
    password_hash = hash_password(temp_password)

    new_staff = StaffUser(
        email=payload.email,
        full_name=payload.full_name,
        role=payload.role,
        phone=payload.phone,
        password_hash=password_hash,
        must_change_password=True,
        welcome_email_sent=False,
    )
    db.add(new_staff)
    db.flush()

    # Determine login URL from settings
    try:
        from app.core.config import settings as _s
        base_url = getattr(_s, "FRONTEND_URL", None) or getattr(_s, "APP_URL", None) or "https://yourdomain.com"
    except Exception:
        base_url = "https://yourdomain.com"

    login_url = f"{base_url.rstrip('/')}/staff"
    role_label = payload.role.value if hasattr(payload.role, "value") else str(payload.role)

    subject = "Your Staff Account Has Been Created"
    body_text = f"""Hello {payload.full_name},

Your staff account has been created for {base_url}.

Login Email: {payload.email}
Temporary Password: {temp_password}

Please use these credentials to sign in for the first time:
{login_url}

After your first login, you MUST create a new personal password before you can access the system.

IMPORTANT SECURITY INSTRUCTIONS:
- Do not share this password with anyone.
- Do not reuse this temporary password elsewhere.
- Change the temporary password immediately after your first login.
- Keep your new password private.
- Never send your password to another person.
- If you did not request this account, contact your administrator immediately.

Your Role: {role_label}

—
This is an automated message. Please do not reply.
"""
    body_html = f"""
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#0f0f0f;color:#e1e1e1;border-radius:8px;">
  <h2 style="color:#a78bfa;margin-top:0;">Your Staff Account Has Been Created</h2>
  <p>Hello <strong>{payload.full_name}</strong>,</p>
  <p>Your staff account has been created for <a href="{base_url}" style="color:#a78bfa;">{base_url}</a>.</p>
  <table style="background:#1a1a2e;border-radius:6px;padding:16px 20px;width:100%;margin:16px 0;border-collapse:collapse;">
    <tr><td style="padding:4px 0;color:#9ca3af;">Login Email</td><td style="padding:4px 0;font-weight:600;">{payload.email}</td></tr>
    <tr><td style="padding:4px 0;color:#9ca3af;">Temporary Password</td><td style="padding:4px 0;font-weight:600;font-family:monospace;color:#f59e0b;">{temp_password}</td></tr>
    <tr><td style="padding:4px 0;color:#9ca3af;">Your Role</td><td style="padding:4px 0;">{role_label}</td></tr>
  </table>
  <a href="{login_url}" style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Sign In Now</a>
  <p style="margin-top:24px;padding:16px;background:#1e1b2e;border-left:3px solid #ef4444;border-radius:4px;">
    <strong>⚠ Security Notice:</strong> You will be required to change this password on your first login.
    Do not share this password with anyone. Never send your password to another person.
  </p>
  <p style="color:#6b7280;font-size:12px;">This is an automated message. Please do not reply.</p>
</div>
"""

    email_sent = email_service.send_email(
        to_email=payload.email,
        subject=subject,
        body_text=body_text,
        body_html=body_html,
    )
    new_staff.welcome_email_sent = email_sent

    log_audit_event(
        db=db,
        event_type="auth.staff_created",
        description=f"Staff account created for '{payload.email}' ({role_label}) by admin '{current_staff.email}'.",
        actor_id=current_staff.id,
        actor_type="staff",
        actor_email=current_staff.email,
        ip_address=ip,
        user_agent=ua,
        resource_type="staff_user",
        resource_id=str(new_staff.id),
        details={"role": role_label, "email_sent": email_sent},
    )
    if email_sent:
        log_audit_event(
            db=db,
            event_type="auth.welcome_email_sent",
            description=f"Welcome email sent to '{payload.email}'.",
            actor_id=current_staff.id,
            actor_type="staff",
            actor_email=current_staff.email,
            resource_type="staff_user",
            resource_id=str(new_staff.id),
        )
    else:
        log_audit_event(
            db=db,
            event_type="auth.welcome_email_failed",
            description=f"Welcome email FAILED for '{payload.email}'. Admin should resend.",
            actor_id=current_staff.id,
            actor_type="staff",
            actor_email=current_staff.email,
            resource_type="staff_user",
            resource_id=str(new_staff.id),
        )

    db.commit()

    return StaffOnboardingResult(
        staff_id=new_staff.id,
        email=new_staff.email,
        full_name=new_staff.full_name,
        role=role_label,
        account_created=True,
        email_sent=email_sent,
        message=(
            "Staff account created and welcome email sent."
            if email_sent
            else "Staff account created. Welcome email could NOT be sent — please use Resend Welcome Email."
        ),
    )


@staff_auth_router.post("/change-password", response_model=MessageResponse)
def staff_change_password(
    payload: StaffChangePasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Staff changes their own password.
    Required when must_change_password=True (first login with temporary credential).
    After successful change:
    - must_change_password is set to False.
    - Temporary credential is no longer valid (new hash replaces it).
    """
    ip, ua = get_request_metadata(request)

    if not verify_password(payload.current_password, current_staff.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect.",
        )

    if payload.new_password == payload.current_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from the current password.",
        )

    current_staff.password_hash = hash_password(payload.new_password)
    current_staff.must_change_password = False

    log_audit_event(
        db=db,
        event_type="auth.password_changed",
        description=f"Staff '{current_staff.email}' changed their password.",
        actor_id=current_staff.id,
        actor_type="staff",
        actor_email=current_staff.email,
        ip_address=ip,
        user_agent=ua,
        resource_type="staff_user",
        resource_id=str(current_staff.id),
        commit=True,
    )
    db.commit()

    return MessageResponse(message="Password changed successfully. You can now access the system.")


@staff_auth_router.post("/resend-welcome-email", response_model=StaffOnboardingResult)
def resend_welcome_email(
    target_staff_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_roles(StaffRole.SUPER_ADMIN, StaffRole.ADMIN)),
):
    """
    Admin-only: Resend the onboarding email to a staff member.
    Generates a fresh temporary password and invalidates the old one.
    Only valid for active staff accounts.
    """
    from app.modules.auth.dependencies import require_roles
    ip, ua = get_request_metadata(request)

    target = db.query(StaffUser).filter(StaffUser.id == target_staff_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff account not found.")
    if not target.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot resend welcome email to a deactivated account.",
        )

    # Generate a fresh temporary password
    new_temp_password = secrets.token_urlsafe(12)
    target.password_hash = hash_password(new_temp_password)
    target.must_change_password = True
    target.welcome_email_sent = False

    try:
        from app.core.config import settings as _s
        base_url = getattr(_s, "FRONTEND_URL", None) or getattr(_s, "APP_URL", None) or "https://yourdomain.com"
    except Exception:
        base_url = "https://yourdomain.com"

    login_url = f"{base_url.rstrip('/')}/staff"
    role_label = target.role.value if hasattr(target.role, "value") else str(target.role)
    name_label = target.full_name or target.email

    subject = "Your Staff Account Credentials (Resent)"
    body_text = f"""Hello {name_label},

A new temporary password has been generated for your staff account.

Login Email: {target.email}
New Temporary Password: {new_temp_password}

Please sign in at: {login_url}

You will be required to change this password immediately after login.

Do NOT share this password with anyone.
"""
    body_html = f"""
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#0f0f0f;color:#e1e1e1;border-radius:8px;">
  <h2 style="color:#a78bfa;">Staff Account Credentials (Resent)</h2>
  <p>Hello <strong>{name_label}</strong>,</p>
  <p>A new temporary password has been generated for your account.</p>
  <table style="background:#1a1a2e;border-radius:6px;padding:16px 20px;width:100%;margin:16px 0;border-collapse:collapse;">
    <tr><td style="padding:4px 0;color:#9ca3af;">Login Email</td><td style="padding:4px 0;font-weight:600;">{target.email}</td></tr>
    <tr><td style="padding:4px 0;color:#9ca3af;">New Temporary Password</td><td style="padding:4px 0;font-weight:600;font-family:monospace;color:#f59e0b;">{new_temp_password}</td></tr>
  </table>
  <a href="{login_url}" style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Sign In</a>
  <p style="margin-top:24px;padding:16px;background:#1e1b2e;border-left:3px solid #ef4444;border-radius:4px;">
    <strong>⚠ Security Notice:</strong> Do not share this password. Change it immediately on first login.
  </p>
</div>
"""

    email_sent = email_service.send_email(
        to_email=target.email,
        subject=subject,
        body_text=body_text,
        body_html=body_html,
    )
    target.welcome_email_sent = email_sent

    log_audit_event(
        db=db,
        event_type="auth.welcome_email_resent" if email_sent else "auth.welcome_email_failed",
        description=f"Welcome email {'resent' if email_sent else 'resend FAILED'} for '{target.email}' by '{current_staff.email}'.",
        actor_id=current_staff.id,
        actor_type="staff",
        actor_email=current_staff.email,
        ip_address=ip,
        user_agent=ua,
        resource_type="staff_user",
        resource_id=str(target.id),
        details={"email_sent": email_sent},
        commit=True,
    )
    db.commit()

    return StaffOnboardingResult(
        staff_id=target.id,
        email=target.email,
        full_name=target.full_name,
        role=role_label,
        account_created=True,
        email_sent=email_sent,
        message=(
            "New temporary password generated and welcome email sent."
            if email_sent
            else "New temporary password generated but welcome email FAILED to send. Check SMTP/Brevo configuration."
        ),
    )


@staff_auth_router.get("/staff-list", response_model=list[StaffAdminDetailResponse])
def admin_list_staff(
    db: Session = Depends(get_db),
    _: StaffUser = Depends(require_roles(StaffRole.SUPER_ADMIN, StaffRole.ADMIN, StaffRole.MANAGER)),
):
    """Admin: list all staff accounts with onboarding status."""
    return db.query(StaffUser).order_by(StaffUser.created_at.desc()).all()
