"""
Initial Super Admin Bootstrap Script
------------------------------------
Secure, one-time operator CLI tool to create the initial Super Admin account for production.

Features:
- Never exposes a public HTTP endpoint or allows self-promotion.
- Checks if a Super Admin account already exists; immediately aborts to prevent duplicate creation.
- Hashes password using existing production Argon2 security mechanism.
- Credentials can be passed via environment variables (SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, SUPER_ADMIN_FULL_NAME),
  via CLI arguments (--email, --password, --name), or entered interactively via secure masked prompt (getpass).
- Logs the bootstrap event into the append-only AuditLog table.
- Never prints passwords or tokens in stdout or logs.

Usage:
  # Via environment variables:
  SUPER_ADMIN_EMAIL="admin@domain.com" SUPER_ADMIN_PASSWORD="SecurePassword123!" python scripts/bootstrap_super_admin.py

  # Via CLI flags:
  python scripts/bootstrap_super_admin.py --email admin@domain.com --password "SecurePassword123!"

  # Interactive prompt:
  python scripts/bootstrap_super_admin.py
"""

import argparse
import getpass
import logging
import os
import re
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy.orm import Session
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.modules.audit.service import log_audit_event
from app.modules.auth.models import StaffRole, StaffUser

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("bootstrap")

EMAIL_REGEX = re.compile(r"^[^@]+@[^@]+\.[^@]+$")


def validate_email(email: str) -> bool:
    return bool(email and EMAIL_REGEX.match(email.strip()))


def bootstrap_super_admin(
    email: str | None = None,
    password: str | None = None,
    full_name: str | None = None,
    db: Session | None = None,
) -> int:
    """
    Core bootstrap routine. Returns 0 on success, 1 on error or duplicate prevention.
    """
    own_db = False
    if db is None:
        db = SessionLocal()
        own_db = True

    try:
        # 1. Prevent duplicate Super Admin creation
        existing_super_admin = db.query(StaffUser).filter(
            StaffUser.role == StaffRole.SUPER_ADMIN
        ).first()

        if existing_super_admin:
            logger.warning(
                f"A Super Admin account already exists (email: {existing_super_admin.email}). "
                f"Duplicate Super Admin bootstrap is prohibited."
            )
            return 1

        # 2. Resolve credentials from parameters or environment
        email = email or os.getenv("SUPER_ADMIN_EMAIL")
        password = password or os.getenv("SUPER_ADMIN_PASSWORD")
        full_name = full_name or os.getenv("SUPER_ADMIN_FULL_NAME") or "Super Admin"

        # Interactive prompts if running in interactive terminal and values not provided
        if not email and sys.stdin.isatty():
            try:
                email = input("Enter Super Admin Email: ").strip()
            except (KeyboardInterrupt, EOFError):
                logger.error("Bootstrap aborted by user.")
                return 1

        if not password and sys.stdin.isatty():
            try:
                password = getpass.getpass("Enter Super Admin Password (min 8 characters): ")
            except (KeyboardInterrupt, EOFError):
                logger.error("Bootstrap aborted by user.")
                return 1

        # 3. Validate inputs
        if not email or not validate_email(email):
            logger.error("A valid email address is required for Super Admin bootstrap.")
            return 1

        if not password or len(password) < 8:
            logger.error("Super Admin password must be at least 8 characters long.")
            return 1

        # Check if email is already taken by any staff user
        existing_email_user = db.query(StaffUser).filter(
            StaffUser.email == email.strip().lower()
        ).first()
        if existing_email_user:
            logger.error(
                f"A staff user with email '{email}' already exists with role '{existing_email_user.role}'."
            )
            return 1

        # 4. Hash password securely using Argon2
        hashed = hash_password(password)

        # 5. Create Super Admin user
        admin = StaffUser(
            email=email.strip().lower(),
            password_hash=hashed,
            role=StaffRole.SUPER_ADMIN,
            full_name=full_name.strip(),
            is_active=True,
        )
        db.add(admin)

        # 6. Record audit event
        log_audit_event(
            db=db,
            event_type="admin.bootstrap",
            description=f"Initial Super Admin account '{admin.email}' bootstrapped successfully.",
            actor_type="system",
            actor_email=admin.email,
            resource_type="staff_user",
            resource_id=str(admin.id),
            details={"email": admin.email, "role": "Super Admin"},
        )

        db.commit()
        db.refresh(admin)

        logger.info(
            f"Super Admin '{admin.email}' successfully created (User ID: {admin.id}). "
            f"RBAC initialized."
        )
        return 0

    except Exception as exc:
        db.rollback()
        logger.error(f"Unexpected error during Super Admin bootstrap: {exc}")
        return 1
    finally:
        if own_db:
            db.close()


def main():
    parser = argparse.ArgumentParser(description="Bootstrap the initial Super Admin account for production.")
    parser.add_argument("--email", help="Super Admin email address", default=None)
    parser.add_argument("--password", help="Super Admin password (min 8 chars)", default=None)
    parser.add_argument("--name", help="Super Admin full name", default=None)

    args = parser.parse_args()
    sys.exit(bootstrap_super_admin(email=args.email, password=args.password, full_name=args.name))


if __name__ == "__main__":
    main()
