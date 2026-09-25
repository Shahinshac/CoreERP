from datetime import date, datetime, time
from decimal import Decimal
import logging
import math
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.money import quantize_money
from app.modules.audit.service import log_audit_event
from app.modules.auth.dependencies import get_current_staff
from app.modules.auth.models import StaffRole, StaffUser
from app.modules.catalog.models import Category, Product
from app.modules.catalog.schemas import ProductResponse
from app.modules.inventory.models import MovementType, StockMovement
from app.modules.inventory.schemas import (
    CategoryValuation,
    InventoryValuationResponse,
    PaginatedMovementsResponse,
    ProductValuation,
    StockAdjustmentRequest,
    StockInRequest,
    StockMovementResponse,
    StockOutRequest,
)

logger = logging.getLogger("app.inventory")

inventory_router = APIRouter(prefix="/api/inventory", tags=["Inventory"])


# ==========================================
# STOCK OPERATIONS (ATOMIC TRANSACTIONS)
# ==========================================

@inventory_router.post("/stock-in", response_model=StockMovementResponse, status_code=status.HTTP_201_CREATED)
def stock_in(
    payload: StockInRequest,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Atomically increments product.current_stock and writes a single StockMovement record.
    """
    with db.begin_nested():
        product = (
            db.query(Product)
            .filter(Product.id == payload.product_id)
            .with_for_update()
            .first()
        )
        if not product or not product.is_active:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active product not found.")

        product.current_stock = product.current_stock + payload.quantity

        movement = StockMovement(
            product_id=product.id,
            movement_type=MovementType.IN,
            quantity=payload.quantity,
            reference_type=payload.reference or "MANUAL_STOCK_IN",
            notes=payload.reason,
            created_by=current_staff.id,
        )
        db.add(movement)
        log_audit_event(
            db=db,
            event_type="inventory.stock_in",
            description=f"Stock IN: {payload.quantity} units for product '{product.name}' (SKU: {product.sku}).",
            actor_id=current_staff.id,
            actor_type="staff",
            actor_email=current_staff.email,
            resource_type="product",
            resource_id=str(product.id),
            details={"quantity": str(payload.quantity), "reason": payload.reason},
        )

    db.commit()
    db.refresh(movement)

    return StockMovementResponse(
        id=movement.id,
        product_id=movement.product_id,
        movement_type=movement.movement_type.value if hasattr(movement.movement_type, "value") else str(movement.movement_type),
        quantity=movement.quantity,
        reference_type=movement.reference_type,
        reference_id=movement.reference_id,
        notes=movement.notes,
        created_by=movement.created_by,
        created_at=movement.created_at,
        product_name=product.name,
        product_sku=product.sku,
        author_email=current_staff.email,
    )


@inventory_router.post("/purchases/{purchase_id}/receive", status_code=status.HTTP_200_OK)
def receive_purchase(
    purchase_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Receives an existing Purchase order:
    1. Verifies purchase exists and is not already received.
    2. Atomically increments product.current_stock for each item.
    3. Creates a StockMovement with movement_type=MovementType.IN, reference_type='purchase', reference_id=purchase.id.
    4. Sets purchase.status = 'received'.
    """
    from app.modules.sales.models import Purchase

    purchase = db.query(Purchase).filter(Purchase.id == purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order not found.")
    if purchase.status.lower() == "received":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Purchase order has already been received.")

    with db.begin_nested():
        for item in purchase.items:
            product = db.query(Product).filter(Product.id == item.product_id).with_for_update().first()
            if product:
                product.current_stock = product.current_stock + item.quantity
                movement = StockMovement(
                    product_id=product.id,
                    movement_type=MovementType.IN,
                    quantity=item.quantity,
                    reference_type="purchase",
                    reference_id=purchase.id,
                    notes=f"Stock received for purchase order {purchase.id}",
                    created_by=current_staff.id,
                )
                db.add(movement)
        purchase.status = "received"

    db.commit()
    db.refresh(purchase)
    return {
        "message": "Purchase received successfully",
        "purchase_id": str(purchase.id),
        "status": purchase.status,
    }


@inventory_router.post("/stock-out", response_model=StockMovementResponse, status_code=status.HTTP_201_CREATED)
def stock_out(
    payload: StockOutRequest,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Atomically decrements product.current_stock and writes a single StockMovement record.
    Rejects if resulting stock would go negative.
    """
    with db.begin_nested():
        product = (
            db.query(Product)
            .filter(Product.id == payload.product_id)
            .with_for_update()
            .first()
        )
        if not product or not product.is_active:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active product not found.")

        new_stock = product.current_stock - payload.quantity
        if new_stock < Decimal("0"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Insufficient stock. Current stock is {product.current_stock}, attempted deduction of {payload.quantity}.",
            )

        product.current_stock = new_stock

        movement = StockMovement(
            product_id=product.id,
            movement_type=MovementType.OUT,
            quantity=-payload.quantity,
            reference_type=payload.reference or "MANUAL_STOCK_OUT",
            notes=payload.reason,
            created_by=current_staff.id,
        )
        db.add(movement)
        log_audit_event(
            db=db,
            event_type="inventory.stock_out",
            description=f"Stock OUT: {payload.quantity} units for product '{product.name}' (SKU: {product.sku}).",
            actor_id=current_staff.id,
            actor_type="staff",
            actor_email=current_staff.email,
            resource_type="product",
            resource_id=str(product.id),
            details={"quantity": str(-payload.quantity), "reason": payload.reason},
        )

    db.commit()
    db.refresh(movement)

    return StockMovementResponse(
        id=movement.id,
        product_id=movement.product_id,
        movement_type=movement.movement_type.value if hasattr(movement.movement_type, "value") else str(movement.movement_type),
        quantity=movement.quantity,
        reference_type=movement.reference_type,
        reference_id=movement.reference_id,
        notes=movement.notes,
        created_by=movement.created_by,
        created_at=movement.created_at,
        product_name=product.name,
        product_sku=product.sku,
        author_email=current_staff.email,
    )


@inventory_router.post("/stock-adjustment", response_model=StockMovementResponse, status_code=status.HTTP_201_CREATED)
def stock_adjustment(
    payload: StockAdjustmentRequest,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Atomically adjusts product.current_stock by a delta and writes a single StockMovement record.
    Rejects if resulting stock goes negative UNLESS is_override=True, which strictly requires Admin role.
    """
    # Verify RBAC for override path
    staff_role = (
        current_staff.role.value
        if isinstance(current_staff.role, StaffRole)
        else str(current_staff.role)
    )
    is_admin = staff_role in (StaffRole.ADMIN.value, StaffRole.SUPER_ADMIN.value)

    if payload.is_override and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Adjustment override permission denied. Only Admin or Super Admin can override negative stock.",
        )

    with db.begin_nested():
        product = (
            db.query(Product)
            .filter(Product.id == payload.product_id)
            .with_for_update()
            .first()
        )
        if not product or not product.is_active:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active product not found.")

        new_stock = product.current_stock + payload.quantity
        if new_stock < Decimal("0") and not payload.is_override:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Adjustment would result in negative stock ({new_stock}). Requires Admin-flagged adjustment override.",
            )

        product.current_stock = new_stock

        ref_type = payload.reference or ("ADJUSTMENT_OVERRIDE" if payload.is_override else "MANUAL_ADJUSTMENT")
        movement = StockMovement(
            product_id=product.id,
            movement_type=MovementType.ADJUSTMENT,
            quantity=payload.quantity,
            reference_type=ref_type,
            notes=payload.reason,
            created_by=current_staff.id,
        )
        db.add(movement)
        log_audit_event(
            db=db,
            event_type="inventory.stock_adjustment",
            description=f"Stock adjustment: {payload.quantity} units for product '{product.name}' (SKU: {product.sku}, override: {payload.is_override}).",
            actor_id=current_staff.id,
            actor_type="staff",
            actor_email=current_staff.email,
            resource_type="product",
            resource_id=str(product.id),
            details={"quantity": str(payload.quantity), "is_override": payload.is_override, "reason": payload.reason},
        )

    db.commit()
    db.refresh(movement)

    return StockMovementResponse(
        id=movement.id,
        product_id=movement.product_id,
        movement_type=movement.movement_type.value if hasattr(movement.movement_type, "value") else str(movement.movement_type),
        quantity=movement.quantity,
        reference_type=movement.reference_type,
        reference_id=movement.reference_id,
        notes=movement.notes,
        created_by=movement.created_by,
        created_at=movement.created_at,
        product_name=product.name,
        product_sku=product.sku,
        author_email=current_staff.email,
    )


# ==========================================
# MOVEMENT HISTORY (PAGINATED & FILTERABLE)
# ==========================================

@inventory_router.get("/movements", response_model=PaginatedMovementsResponse)
def list_stock_movements(
    product_id: uuid.UUID | None = Query(None),
    movement_type: MovementType | None = Query(None),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: StaffUser = Depends(get_current_staff),
):
    query = (
        db.query(
            StockMovement,
            Product.name.label("product_name"),
            Product.sku.label("product_sku"),
            StaffUser.email.label("author_email"),
        )
        .join(Product, StockMovement.product_id == Product.id)
        .outerjoin(StaffUser, StockMovement.created_by == StaffUser.id)
    )

    if product_id:
        query = query.filter(StockMovement.product_id == product_id)
    if movement_type:
        query = query.filter(StockMovement.movement_type == movement_type)
    if start_date:
        query = query.filter(StockMovement.created_at >= datetime.combine(start_date, time.min))
    if end_date:
        query = query.filter(StockMovement.created_at <= datetime.combine(end_date, time.max))

    total = query.count()
    total_pages = math.ceil(total / page_size) if total > 0 else 1

    results = (
        query.order_by(StockMovement.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    items = [
        StockMovementResponse(
            id=row[0].id,
            product_id=row[0].product_id,
            movement_type=row[0].movement_type.value if hasattr(row[0].movement_type, "value") else str(row[0].movement_type),
            quantity=row[0].quantity,
            reference_type=row[0].reference_type,
            reference_id=row[0].reference_id,
            notes=row[0].notes,
            created_by=row[0].created_by,
            created_at=row[0].created_at,
            product_name=row[1],
            product_sku=row[2],
            author_email=row[3],
        )
        for row in results
    ]

    return PaginatedMovementsResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


# ==========================================
# LOW STOCK ENDPOINT
# ==========================================

@inventory_router.get("/low-stock", response_model=list[ProductResponse])
def get_low_stock_products(
    db: Session = Depends(get_db),
    _: StaffUser = Depends(get_current_staff),
):
    """
    Returns all active products where current_stock <= min_stock.
    """
    products = (
        db.query(Product)
        .filter(Product.is_active == True, Product.current_stock <= Product.min_stock)
        .order_by(Product.current_stock.asc())
        .all()
    )
    return products


# ==========================================
# INVENTORY VALUATION ENDPOINT
# ==========================================

@inventory_router.get("/valuation", response_model=InventoryValuationResponse)
def get_inventory_valuation(
    db: Session = Depends(get_db),
    _: StaffUser = Depends(get_current_staff),
):
    """
    Calculates inventory valuation: sum(current_stock * purchase_price) per product and per category.
    """
    products = (
        db.query(Product)
        .filter(Product.is_active == True)
        .order_by(Product.name.asc())
        .all()
    )

    categories = {c.id: c.name for c in db.query(Category).all()}

    category_aggregates: dict[uuid.UUID, dict] = {}
    product_valuations: list[ProductValuation] = []
    grand_total_valuation = Decimal("0.00")

    for p in products:
        item_val = quantize_money(p.current_stock * p.purchase_price, allow_negative=True)
        grand_total_valuation += item_val

        product_valuations.append(
            ProductValuation(
                product_id=p.id,
                product_name=p.name,
                sku=p.sku,
                current_stock=p.current_stock,
                purchase_price=p.purchase_price,
                valuation=item_val,
            )
        )

        cat_id = p.category_id
        if cat_id not in category_aggregates:
            category_aggregates[cat_id] = {
                "category_id": cat_id,
                "category_name": categories.get(cat_id, "Unknown Category"),
                "total_quantity": Decimal("0.000"),
                "total_valuation": Decimal("0.00"),
            }

        category_aggregates[cat_id]["total_quantity"] += p.current_stock
        category_aggregates[cat_id]["total_valuation"] += item_val

    by_category = [
        CategoryValuation(
            category_id=data["category_id"],
            category_name=data["category_name"],
            total_quantity=data["total_quantity"],
            total_valuation=quantize_money(data["total_valuation"], allow_negative=True),
        )
        for data in category_aggregates.values()
    ]

    return InventoryValuationResponse(
        total_valuation=quantize_money(grand_total_valuation, allow_negative=True),
        total_items_count=len(products),
        by_category=by_category,
        by_product=product_valuations,
    )
