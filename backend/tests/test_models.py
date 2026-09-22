from decimal import Decimal
import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.catalog.models import Brand, Category, Product
from app.modules.inventory.models import MovementType, StockMovement


def test_product_current_stock_check_constraint_rejects_negative(db_session: Session):
    """
    Verifies that the CHECK constraint (current_stock >= 0) rejects negative stock values.
    """
    category = Category(name="Electronics")
    brand = Brand(name="Acme")
    db_session.add_all([category, brand])
    db_session.flush()

    cat_id = category.id
    b_id = brand.id

    # Product with negative stock should violate check constraint
    invalid_product = Product(
        name="Laptop Invalid",
        sku="SKU-LAPTOP-01",
        category_id=cat_id,
        brand_id=b_id,
        unit="pcs",
        purchase_price=Decimal("500.00"),
        selling_price=Decimal("750.00"),
        gst_rate=Decimal("18.00"),
        current_stock=Decimal("-1.000"),  # Negative stock
        min_stock=Decimal("5.000"),
    )
    db_session.add(invalid_product)

    with pytest.raises(IntegrityError):
        db_session.flush()

    db_session.rollback()

    # Re-add category & brand after rollback to test positive stock
    category2 = Category(name="Electronics Valid")
    brand2 = Brand(name="Acme Valid")
    db_session.add_all([category2, brand2])
    db_session.flush()

    valid_product = Product(
        name="Laptop Valid",
        sku="SKU-LAPTOP-02",
        category_id=category2.id,
        brand_id=brand2.id,
        unit="pcs",
        purchase_price=Decimal("500.00"),
        selling_price=Decimal("750.00"),
        gst_rate=Decimal("18.00"),
        current_stock=Decimal("0.000"),
        min_stock=Decimal("5.000"),
    )
    db_session.add(valid_product)
    db_session.flush()

    assert valid_product.id is not None
    assert valid_product.current_stock == Decimal("0.000")


def test_stock_movement_is_append_only(db_session: Session):
    """
    Verifies that StockMovement records cannot be updated at the model layer.
    """
    category = Category(name="Hardware")
    brand = Brand(name="BoltCo")
    db_session.add_all([category, brand])
    db_session.flush()

    product = Product(
        name="Steel Bolt",
        sku="SKU-BOLT-01",
        category_id=category.id,
        brand_id=brand.id,
        unit="pcs",
        purchase_price=Decimal("1.00"),
        selling_price=Decimal("2.00"),
        gst_rate=Decimal("5.00"),
        current_stock=Decimal("100.000"),
        min_stock=Decimal("10.000"),
    )
    db_session.add(product)
    db_session.flush()

    movement = StockMovement(
        product_id=product.id,
        movement_type=MovementType.IN,
        quantity=Decimal("100.000"),
        reference_type="purchase_order",
    )
    db_session.add(movement)
    db_session.flush()

    # Attempt to update quantity or reference on movement
    movement.quantity = Decimal("150.000")
    with pytest.raises(ValueError, match="StockMovement records are append-only and cannot be updated"):
        db_session.flush()

    db_session.rollback()
