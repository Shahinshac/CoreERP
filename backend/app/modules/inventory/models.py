import enum
import uuid
from decimal import Decimal
from sqlalchemy import Enum, ForeignKey, Numeric, String, Uuid, event
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.core.mixins import CreatedAtMixin, UUIDPrimaryKeyMixin


class MovementType(str, enum.Enum):
    IN = "in"
    OUT = "out"
    ADJUSTMENT = "adjustment"
    TRANSFER = "transfer"


class StockMovement(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    """
    Append-only inventory movement ledger.
    Updates and deletes are strictly prohibited to maintain audit trail integrity.
    """
    __tablename__ = "stock_movements"

    product_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("products.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    movement_type: Mapped[MovementType] = mapped_column(
        Enum(MovementType, name="movement_type_enum", native_enum=False),
        nullable=False,
        index=True,
    )
    quantity: Mapped[Decimal] = mapped_column(
        Numeric(14, 3),
        nullable=False,
    )
    reference_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )
    reference_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
        index=True,
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("staff_users.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    product = relationship("app.modules.catalog.models.Product")
    author = relationship("app.modules.auth.models.StaffUser")


@event.listens_for(StockMovement, "before_update")
def prevent_stock_movement_update(mapper, connection, target):
    raise ValueError("StockMovement records are append-only and cannot be updated.")
