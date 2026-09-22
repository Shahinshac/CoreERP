import enum
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import JSON, Date, DateTime, Enum, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.mixins import SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin


class StaffRole(str, enum.Enum):
    SUPER_ADMIN = "Super Admin"
    ADMIN = "Admin"
    MANAGER = "Manager"
    STAFF = "Staff"
    ACCOUNTANT = "Accountant"


class StaffUser(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "staff_users"

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False,
    )
    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    role: Mapped[StaffRole] = mapped_column(
        Enum(StaffRole, name="staff_role_enum", native_enum=False),
        default=StaffRole.STAFF,
        nullable=False,
        index=True,
    )
    full_name: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    phone: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )
    employee_code: Mapped[str | None] = mapped_column(
        String(50),
        unique=True,
        index=True,
        nullable=True,
    )
    joining_date: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )
    base_salary: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    deductions_config: Mapped[list | dict | None] = mapped_column(
        JSON,
        nullable=True,
    )
    deactivated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


class Customer(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "customers"

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False,
    )
    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    phone: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )
    address: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    gstin: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )
    state: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )
