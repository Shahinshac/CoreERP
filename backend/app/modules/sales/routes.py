from datetime import datetime
from decimal import Decimal
import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.money import quantize_money, quantize_quantity
from app.modules.audit.service import log_audit_event
from app.modules.auth.dependencies import get_current_staff
from app.modules.auth.models import Customer, StaffUser
from app.modules.catalog.models import Product
from app.modules.inventory.models import MovementType, StockMovement
from app.modules.payments.models import Payment, PaymentStatus
from app.modules.sales.models import ReturnItem, Sale, SaleItem, SaleReturn
from app.modules.sales.schemas import (
    CartItemInput,
    POSCheckoutRequest,
    POSProductResponse,
    POSReturnRequest,
    ReturnItemResponse,
    SaleItemResponse,
    SaleResponse,
    SaleReturnResponse,
    SplitPaymentDetail,
)

logger = logging.getLogger("app.sales")

pos_router = APIRouter(prefix="/api/pos", tags=["Point of Sale"])


# ==========================================
# 0. STORE INFORMATION FOR POS RECEIPT
# ==========================================

@pos_router.get("/store-info")
def get_pos_store_info(
    _: StaffUser = Depends(get_current_staff),
):
    """
    Returns store branding and statutory contact details for thermal receipt printing.
    """
    return {
        "store_name": settings.SELLER_NAME,
        "gstin": settings.SELLER_GSTIN,
        "state": settings.SELLER_STATE,
        "state_code": settings.SELLER_STATE_CODE,
        "address": settings.SELLER_ADDRESS,
        "phone": settings.SELLER_PHONE,
        "email": settings.SELLER_EMAIL,
        "upi_id": settings.SELLER_UPI_ID,
    }


# ==========================================
# 1. PRODUCT SEARCH FOR POS
# ==========================================

@pos_router.get("/products/search")
def search_pos_products(
    q: str = Query("", min_length=1),
    db: Session = Depends(get_db),
    _: StaffUser = Depends(get_current_staff),
):
    """
    Search active catalog products by name, SKU, or barcode for cart entry.
    """
    pattern = f"%{q.strip()}%"
    products = (
        db.query(Product)
        .filter(
            Product.is_active == True,
            (Product.name.ilike(pattern))
            | (Product.sku.ilike(pattern))
            | (Product.barcode.ilike(pattern)),
        )
        .limit(20)
        .all()
    )

    return [
        {
            "id": p.id,
            "name": p.name,
            "sku": p.sku,
            "barcode": p.barcode,
            "unit": p.unit,
            "selling_price": p.selling_price,
            "gst_rate": p.gst_rate,
            "current_stock": p.current_stock,
            "min_stock": p.min_stock,
            "image_path": p.image_path,
        }
        for p in products
    ]


@pos_router.get("/products/barcode", response_model=POSProductResponse)
def lookup_pos_product_by_barcode(
    barcode: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    _: StaffUser = Depends(get_current_staff),
):
    """
    Lookup an active product by exact barcode or SKU for POS barcode scanner.
    First matches exact barcode, then exact SKU.
    Returns 404 if not found.
    """
    code = barcode.strip()
    product = (
        db.query(Product)
        .filter(
            Product.is_active == True,
            Product.barcode == code,
        )
        .first()
    )
    if not product:
        product = (
            db.query(Product)
            .filter(
                Product.is_active == True,
                Product.sku.ilike(code),
            )
            .first()
        )

    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product not found for barcode: {code}",
        )

    return {
        "id": product.id,
        "name": product.name,
        "sku": product.sku,
        "barcode": product.barcode,
        "unit": product.unit,
        "selling_price": product.selling_price,
        "gst_rate": product.gst_rate,
        "current_stock": product.current_stock,
        "min_stock": product.min_stock,
        "image_path": product.image_path,
    }


# ==========================================
# 2. POS CHECKOUT (ATOMIC TRANSACTION)
# ==========================================

@pos_router.post("/checkout", response_model=SaleResponse, status_code=status.HTTP_201_CREATED)
def pos_checkout(
    payload: POSCheckoutRequest,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Executes a single atomic transaction that:
    1. Locks product records.
    2. Validates stock availability (rejects overselling).
    3. Calculates line and order totals server-side (discards any client-sent totals).
    4. Creates Sale and SaleItem records.
    5. Decrements Product.current_stock.
    6. Writes StockMovement rows (type='out').
    """
    now = datetime.now()
    invoice_num = f"POS-{now.strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

    # Verify customer if provided
    customer = None
    if payload.customer_id:
        customer = db.query(Customer).filter(Customer.id == payload.customer_id).first()
        if not customer:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found.")

    with db.begin_nested():
        product_ids = [item.product_id for item in payload.items]
        products_db = (
            db.query(Product)
            .filter(Product.id.in_(product_ids))
            .with_for_update()
            .all()
        )
        prod_map = {p.id: p for p in products_db}

        # Validate existence and active status
        for item in payload.items:
            prod = prod_map.get(item.product_id)
            if not prod or not prod.is_active:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Active product with ID '{item.product_id}' not found.",
                )

            # Reject overselling (quantity > current_stock)
            if item.quantity > prod.current_stock:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Insufficient stock for '{prod.name}' ({prod.sku}). "
                        f"Available: {prod.current_stock} {prod.unit}, Requested: {item.quantity} {prod.unit}."
                    ),
                )

        # Compute monetary totals server-side
        subtotal = Decimal("0.00")
        line_items_data = []

        for item in payload.items:
            prod = prod_map[item.product_id]
            unit_price = quantize_money(prod.selling_price)
            line_subtotal = quantize_money(item.quantity * unit_price)

            # Validate line discount
            line_discount = quantize_money(item.discount_amount)
            if line_discount < Decimal("0.00"):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Discount cannot be negative.")
            if line_discount > line_subtotal:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Item discount ({line_discount}) exceeds item total ({line_subtotal}) for '{prod.name}'.",
                )

            line_total = line_subtotal - line_discount
            subtotal += line_total

            line_items_data.append(
                {
                    "product": prod,
                    "quantity": item.quantity,
                    "unit_price": unit_price,
                    "discount_amount": line_discount,
                    "total_price": line_total,
                }
            )

        # Validate order-level discount
        order_discount = quantize_money(payload.discount_amount)
        if order_discount < Decimal("0.00"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Order discount cannot be negative.")
        if order_discount > subtotal:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Order discount ({order_discount}) exceeds subtotal ({subtotal}).",
            )

        tax_amount = Decimal("0.00")  # Phase 6 placeholder pre-GST subtotal only
        grand_total = quantize_money(subtotal - order_discount + tax_amount)

        # Validate payment method and split payment portions
        payment_details_data = None
        if payload.payment_method == "split" or payload.split_payments:
            if not payload.split_payments:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Split payment requires at least one payment portion.",
                )

            methods_seen = set()
            for p in payload.split_payments:
                m = p.method.strip().lower()
                if m in methods_seen:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Duplicate payment method '{m}' in split payment.",
                    )
                methods_seen.add(m)
                if p.amount <= Decimal("0.00"):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Split payment portion for '{m}' must be strictly greater than 0.00.",
                    )

            total_split = sum((quantize_money(p.amount) for p in payload.split_payments), Decimal("0.00"))
            total_split = quantize_money(total_split)

            if total_split < grand_total:
                remaining = quantize_money(grand_total - total_split)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Split payment underpaid: Total entered (₹{total_split}) is less than payable amount (₹{grand_total}). Remaining: ₹{remaining}.",
                )
            elif total_split > grand_total:
                excess = quantize_money(total_split - grand_total)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Split payment overpaid: Total entered (₹{total_split}) exceeds payable amount (₹{grand_total}). Discrepancy: ₹{excess}.",
                )

            final_payment_method = "split"
            payment_details_data = [
                {"method": p.method.strip().lower(), "amount": str(quantize_money(p.amount))}
                for p in payload.split_payments
            ]
        else:
            final_payment_method = payload.payment_method.strip().lower()
            payment_details_data = [
                {"method": final_payment_method, "amount": str(grand_total)}
            ]

        # Create Sale
        sale = Sale(
            invoice_number=invoice_num,
            customer_id=customer.id if customer else None,
            staff_id=current_staff.id,
            subtotal=subtotal,
            discount_amount=order_discount,
            tax_amount=tax_amount,
            total_amount=grand_total,
            status="completed",
            payment_method=final_payment_method,
            payment_details=payment_details_data,
            notes=payload.notes,
        )
        db.add(sale)
        db.flush()

        # Record payment ledger entries
        for p in payment_details_data:
            payment_record = Payment(
                customer_id=customer.id if customer else None,
                created_by=current_staff.id,
                method=p["method"],
                amount=Decimal(p["amount"]),
                status=PaymentStatus.PAID.value,
                idempotency_key=f"pos-{sale.id}-{p['method']}",
                reference_id=sale.invoice_number,
                notes=f"POS Sale {sale.invoice_number} ({p['method'].upper()})",
            )
            db.add(payment_record)

        sale_items_created = []
        for line in line_items_data:
            prod = line["product"]
            sale_item = SaleItem(
                sale_id=sale.id,
                product_id=prod.id,
                quantity=line["quantity"],
                unit_price=line["unit_price"],
                discount_amount=line["discount_amount"],
                total_price=line["total_price"],
                returned_quantity=Decimal("0.000"),
            )
            db.add(sale_item)
            sale_items_created.append((sale_item, prod))

            # Decrement stock
            prod.current_stock = prod.current_stock - line["quantity"]

            # Write stock movement 'out' row
            movement = StockMovement(
                product_id=prod.id,
                movement_type=MovementType.OUT,
                quantity=-line["quantity"],
                reference_type="POS_SALE",
                reference_id=sale.id,
                notes=f"POS Checkout {invoice_num}",
                created_by=current_staff.id,
            )
            db.add(movement)

        log_audit_event(
            db=db,
            event_type="pos.sale_completed",
            description=f"POS Sale completed: Invoice #{sale.invoice_number}, Total: ₹{sale.total_amount}.",
            actor_id=current_staff.id,
            actor_type="staff",
            actor_email=current_staff.email,
            resource_type="sale",
            resource_id=str(sale.id),
            details={
                "invoice_number": sale.invoice_number,
                "total_amount": str(sale.total_amount),
                "payment_method": sale.payment_method,
                "payment_details": sale.payment_details,
            },
        )

    db.commit()
    db.refresh(sale)

    return SaleResponse(
        id=sale.id,
        invoice_number=sale.invoice_number,
        customer_id=sale.customer_id,
        customer_name=customer.name if customer else "Walk-in Customer",
        staff_id=sale.staff_id,
        staff_email=current_staff.email,
        sale_date=sale.created_at,
        subtotal=sale.subtotal,
        discount_amount=sale.discount_amount,
        tax_amount=sale.tax_amount,
        total_amount=sale.total_amount,
        status=sale.status,
        payment_method=sale.payment_method,
        payment_details=[
            SplitPaymentDetail(method=p["method"], amount=Decimal(p["amount"]))
            for p in (sale.payment_details or [])
        ]
        if sale.payment_details
        else None,
        notes=sale.notes,
        items=[
            SaleItemResponse(
                id=item.id,
                product_id=item.product_id,
                product_name=prod.name,
                product_sku=prod.sku,
                quantity=item.quantity,
                unit_price=item.unit_price,
                discount_amount=item.discount_amount,
                total_price=item.total_price,
                returned_quantity=item.returned_quantity,
            )
            for item, prod in sale_items_created
        ],
    )


# ==========================================
# 3. POS RETURNS (ATOMIC REVERSAL)
# ==========================================

@pos_router.post("/returns", response_model=SaleReturnResponse, status_code=status.HTTP_201_CREATED)
def pos_return(
    payload: POSReturnRequest,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Executes a single atomic return transaction:
    1. Validates return quantity <= sold quantity - already returned (blocks double-returns).
    2. Reverses stock movements (writes StockMovement 'in' rows).
    3. Increments product current_stock.
    4. Records SaleReturn and ReturnItem entries.
    5. Updates sale status.
    """
    now = datetime.now()
    return_num = f"RET-{now.strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

    with db.begin_nested():
        sale = (
            db.query(Sale)
            .filter(Sale.id == payload.sale_id)
            .with_for_update()
            .first()
        )
        if not sale:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sale record not found.")

        sale_item_ids = [item.sale_item_id for item in payload.items]
        sale_items = (
            db.query(SaleItem)
            .filter(SaleItem.id.in_(sale_item_ids), SaleItem.sale_id == sale.id)
            .with_for_update()
            .all()
        )
        sale_items_map = {item.id: item for item in sale_items}

        total_refund = Decimal("0.00")
        return_items_data = []

        for ret_input in payload.items:
            sale_item = sale_items_map.get(ret_input.sale_item_id)
            if not sale_item:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Sale item '{ret_input.sale_item_id}' not found on this invoice.",
                )

            # Check available returnable quantity
            available_to_return = sale_item.quantity - sale_item.returned_quantity
            if ret_input.quantity > available_to_return:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Return quantity ({ret_input.quantity}) exceeds returnable balance "
                        f"({available_to_return}) for item {sale_item.product.name}."
                    ),
                )

            # Compute line refund proportionally
            effective_rate = sale_item.total_price / sale_item.quantity
            line_refund = quantize_money(ret_input.quantity * effective_rate)
            total_refund += line_refund

            # Update returned quantity on sale item
            sale_item.returned_quantity = sale_item.returned_quantity + ret_input.quantity

            # Fetch product to restore stock
            product = (
                db.query(Product)
                .filter(Product.id == sale_item.product_id)
                .with_for_update()
                .first()
            )
            product.current_stock = product.current_stock + ret_input.quantity

            return_items_data.append(
                {
                    "sale_item": sale_item,
                    "product": product,
                    "quantity": ret_input.quantity,
                    "refund_amount": line_refund,
                }
            )

        # Create SaleReturn record
        sale_return = SaleReturn(
            return_number=return_num,
            sale_id=sale.id,
            staff_id=current_staff.id,
            total_refund_amount=total_refund,
            reason=payload.reason,
        )
        db.add(sale_return)
        db.flush()

        return_items_created = []
        for line in return_items_data:
            s_item = line["sale_item"]
            prod = line["product"]
            ret_item = ReturnItem(
                return_id=sale_return.id,
                sale_item_id=s_item.id,
                product_id=prod.id,
                quantity=line["quantity"],
                refund_amount=line["refund_amount"],
            )
            db.add(ret_item)
            return_items_created.append((ret_item, prod))

            # Stock movement reversal (type='in')
            movement = StockMovement(
                product_id=prod.id,
                movement_type=MovementType.IN,
                quantity=line["quantity"],
                reference_type="SALE_RETURN",
                reference_id=sale_return.id,
                notes=f"Return {return_num} for Invoice {sale.invoice_number}",
                created_by=current_staff.id,
            )
            db.add(movement)

        # Update sale status
        all_sale_items = db.query(SaleItem).filter(SaleItem.sale_id == sale.id).all()
        all_returned = all(item.returned_quantity >= item.quantity for item in all_sale_items)
        sale.status = "returned" if all_returned else "partially_returned"

    db.commit()
    db.refresh(sale_return)

    return SaleReturnResponse(
        id=sale_return.id,
        return_number=sale_return.return_number,
        sale_id=sale.id,
        invoice_number=sale.invoice_number,
        staff_id=sale_return.staff_id,
        staff_email=current_staff.email,
        return_date=sale_return.created_at,
        total_refund_amount=sale_return.total_refund_amount,
        reason=sale_return.reason,
        items=[
            ReturnItemResponse(
                id=ri.id,
                sale_item_id=ri.sale_item_id,
                product_id=ri.product_id,
                product_name=prod.name,
                quantity=ri.quantity,
                refund_amount=ri.refund_amount,
            )
            for ri, prod in return_items_created
        ],
    )


# ==========================================
# 4. SALES LIST & LOOKUP
# ==========================================

@pos_router.get("/sales", response_model=list[SaleResponse])
def list_sales(
    search: str | None = Query(None),
    status: str | None = Query(None),
    db: Session = Depends(get_db),
    _: StaffUser = Depends(get_current_staff),
):
    query = db.query(Sale)
    if status:
        query = query.filter(Sale.status == status)
    if search:
        pat = f"%{search.strip()}%"
        query = query.filter(Sale.invoice_number.ilike(pat))

    sales = query.order_by(Sale.created_at.desc()).limit(50).all()

    return [
        SaleResponse(
            id=s.id,
            invoice_number=s.invoice_number,
            customer_id=s.customer_id,
            customer_name=s.customer.name if s.customer else "Walk-in Customer",
            staff_id=s.staff_id,
            staff_email=s.staff.email if s.staff else "Unknown",
            sale_date=s.created_at,
            subtotal=s.subtotal,
            discount_amount=s.discount_amount,
            tax_amount=s.tax_amount,
            total_amount=s.total_amount,
            status=s.status,
            payment_method=s.payment_method,
            payment_details=[
                SplitPaymentDetail(method=p["method"], amount=Decimal(p["amount"]))
                for p in (s.payment_details or [])
            ]
            if s.payment_details
            else None,
            notes=s.notes,
            items=[
                SaleItemResponse(
                    id=item.id,
                    product_id=item.product_id,
                    product_name=item.product.name if item.product else "Unknown",
                    product_sku=item.product.sku if item.product else "—",
                    quantity=item.quantity,
                    unit_price=item.unit_price,
                    discount_amount=item.discount_amount,
                    total_price=item.total_price,
                    returned_quantity=item.returned_quantity,
                )
                for item in s.items
            ],
        )
        for s in sales
    ]


@pos_router.get("/sales/{id_or_number}", response_model=SaleResponse)
def get_sale(
    id_or_number: str,
    db: Session = Depends(get_db),
    _: StaffUser = Depends(get_current_staff),
):
    query = db.query(Sale)
    try:
        sale_uuid = uuid.UUID(id_or_number)
        query = query.filter((Sale.id == sale_uuid) | (Sale.invoice_number == id_or_number))
    except ValueError:
        query = query.filter(Sale.invoice_number == id_or_number)

    sale = query.first()
    if not sale:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sale not found.")

    return SaleResponse(
        id=sale.id,
        invoice_number=sale.invoice_number,
        customer_id=sale.customer_id,
        customer_name=sale.customer.name if sale.customer else "Walk-in Customer",
        staff_id=sale.staff_id,
        staff_email=sale.staff.email if sale.staff else "Unknown",
        sale_date=sale.created_at,
        subtotal=sale.subtotal,
        discount_amount=sale.discount_amount,
        tax_amount=sale.tax_amount,
        total_amount=sale.total_amount,
        status=sale.status,
        payment_method=sale.payment_method,
        payment_details=[
            SplitPaymentDetail(method=p["method"], amount=Decimal(p["amount"]))
            for p in (sale.payment_details or [])
        ]
        if sale.payment_details
        else None,
        notes=sale.notes,
        items=[
            SaleItemResponse(
                id=item.id,
                product_id=item.product_id,
                product_name=item.product.name if item.product else "Unknown",
                product_sku=item.product.sku if item.product else "—",
                quantity=item.quantity,
                unit_price=item.unit_price,
                discount_amount=item.discount_amount,
                total_price=item.total_price,
                returned_quantity=item.returned_quantity,
            )
            for item in sale.items
        ],
    )
