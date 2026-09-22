from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
import jwt

from app.core.config import settings

# Initialize Argon2 password hasher
ph = PasswordHasher()

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7
RESET_TOKEN_EXPIRE_MINUTES = 15


def hash_password(password: str) -> str:
    """Hash password using Argon2id."""
    return ph.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    """Verify password against Argon2 hash without leaking timing."""
    try:
        return ph.verify(hashed_password, password)
    except (VerifyMismatchError, Exception):
        return False


def create_jwt_token(
    payload: Dict[str, Any],
    expires_delta: timedelta,
) -> str:
    """Internal helper to sign JWT with expiration."""
    to_encode = payload.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=ALGORITHM)


def create_access_token(
    subject: str,
    audience: str,
    role: Optional[str] = None,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    Creates a short-lived access token with audience claim ('staff' vs 'customer').
    """
    delta = expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": subject,
        "aud": audience,
        "type": "access",
    }
    if role:
        payload["role"] = role
    return create_jwt_token(payload, delta)


def create_refresh_token(
    subject: str,
    audience: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    Creates a long-lived refresh token strictly bounded to an audience.
    """
    delta = expires_delta or timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": subject,
        "aud": audience,
        "type": "refresh",
    }
    return create_jwt_token(payload, delta)


def decode_token(token: str, expected_audience: str) -> Dict[str, Any]:
    """
    Decodes and strictly validates token signature, expiration, and audience.
    Raises jwt.PyJWTError on failure.
    """
    return jwt.decode(
        token,
        settings.JWT_SECRET,
        algorithms=[ALGORITHM],
        audience=expected_audience,
    )


def create_password_reset_token(email: str) -> str:
    """Creates a short-lived signed token for staff password resets."""
    delta = timedelta(minutes=RESET_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": email,
        "aud": "staff_reset",
        "type": "reset",
    }
    return create_jwt_token(payload, delta)


def verify_password_reset_token(token: str) -> Optional[str]:
    """Decodes password reset token and returns email if valid."""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[ALGORITHM],
            audience="staff_reset",
        )
        if payload.get("type") != "reset":
            return None
        return payload.get("sub")
    except Exception:
        return None
