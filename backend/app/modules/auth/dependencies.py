import uuid
from typing import Callable, Sequence
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decode_token
from app.modules.auth.models import Customer, StaffRole, StaffUser

# Bearer security schemes for swagger / header extraction
security = HTTPBearer(auto_error=False)


def get_token_from_header(credentials: HTTPAuthorizationCredentials | None = Depends(security)) -> str:
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials


def get_current_staff(
    token: str = Depends(get_token_from_header),
    db: Session = Depends(get_db),
) -> StaffUser:
    """
    Dependency ensuring the caller is an active staff user with valid aud='staff'.
    Strictly rejects customer tokens and inactive accounts.
    """
    try:
        payload = decode_token(token, expected_audience="staff")
    except jwt.InvalidAudienceError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token audience mismatch. Staff credentials required.",
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate staff credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload.",
        )

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID in token.",
        )

    staff_user = db.query(StaffUser).filter(StaffUser.id == user_id).first()
    if not staff_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Staff user not found.",
        )

    if not staff_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive staff account.",
        )

    return staff_user


def get_current_customer(
    token: str = Depends(get_token_from_header),
    db: Session = Depends(get_db),
) -> Customer:
    """
    Dependency ensuring the caller is an active customer with valid aud='customer'.
    Strictly rejects staff tokens and inactive accounts.
    """
    try:
        payload = decode_token(token, expected_audience="customer")
    except jwt.InvalidAudienceError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token audience mismatch. Customer credentials required.",
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate customer credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    customer_id_str = payload.get("sub")
    if not customer_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload.",
        )

    try:
        customer_id = uuid.UUID(customer_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid customer ID in token.",
        )

    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found.",
        )

    if not customer.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive customer account.",
        )

    return customer


def require_roles(*allowed_roles: StaffRole | str) -> Callable[[StaffUser], StaffUser]:
    """
    RBAC dependency factory. Ensures the current staff user possesses one of the allowed roles.
    Super Admin always has permission.
    """
    role_strings = [r.value if isinstance(r, StaffRole) else str(r) for r in allowed_roles]

    def role_checker(current_staff: StaffUser = Depends(get_current_staff)) -> StaffUser:
        current_role_str = (
            current_staff.role.value
            if isinstance(current_staff.role, StaffRole)
            else str(current_staff.role)
        )
        # Super Admin has superuser privileges
        if current_role_str == StaffRole.SUPER_ADMIN.value:
            return current_staff

        if current_role_str not in role_strings:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: requires one of roles {role_strings}. Current role: '{current_role_str}'.",
            )
        return current_staff

    return role_checker


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> tuple[StaffUser | None, Customer | None]:
    """
    Optional user dependency returning (staff_user, customer_user).
    Supports either staff or customer tokens.
    """
    if not credentials or not credentials.credentials:
        return None, None

    token = credentials.credentials
    # Try decoding as staff
    try:
        payload = decode_token(token, expected_audience="staff")
        user_id = uuid.UUID(payload.get("sub"))
        staff = db.query(StaffUser).filter(StaffUser.id == user_id, StaffUser.is_active.is_(True)).first()
        if staff:
            return staff, None
    except Exception:
        pass

    # Try decoding as customer
    try:
        payload = decode_token(token, expected_audience="customer")
        user_id = uuid.UUID(payload.get("sub"))
        customer = db.query(Customer).filter(Customer.id == user_id, Customer.is_active.is_(True)).first()
        if customer:
            return None, customer
    except Exception:
        pass

    return None, None
