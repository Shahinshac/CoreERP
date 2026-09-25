import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.db import get_db
from app.core.money import quantize_money
from app.modules.audit.service import log_audit_event
from app.modules.auth.dependencies import get_current_staff, get_current_user_optional
from app.modules.auth.models import Customer, StaffUser
from app.modules.catalog.models import Product
from app.modules.inventory.models import MovementType, StockMovement
from app.modules.invoicing.gst import (
    CODE_BY_STATE_NAME,
    compute_gst,
    get_financial_year,
    normalize_state,
)
from app.modules.invoicing.models import (
    CreditNote,
    Invoice,
    InvoiceItem,
    InvoiceSequence,
    Quotation,
    QuotationItem,
)
from app.modules.invoicing.schemas import (
    InvoiceResponse,
    QuotationCreateRequest,
    QuotationListResponse,
    QuotationResponse,
    QuotationStatusUpdateRequest,
)

quotation_router = APIRouter(prefix="/quotations", tags=["Quotations"])


def _get_next_sequence_number(db: Session, fy: str, seq_type: str) -> int:
    seq = db.execute(
        select(InvoiceSequence)
        .filter_by(financial_year=fy, sequence_type=seq_type)
        .with_for_update()
    ).scalar_one_or_none()

    if not seq:
        seq = InvoiceSequence(
            financial_year=fy,
            sequence_type=seq_type,
            last_number=0,
        )
        db.add(seq)
        db.flush()

    seq.last_number += 1
    return seq.last_number


@quotation_router.post(
    "",
    response_model=QuotationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new Quotation",
)
def create_quotation(
    payload: QuotationCreateRequest,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Creates a new Quotation without deducting stock or creating financial ledger entries.
    Computes GST according to seller and buyer place of supply.
    """
    if not payload.items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quotation must contain at least one line item.",
        )

    # 1. Resolve Customer if provided
    customer = None
    if payload.customer_id:
        customer = db.execute(
            select(Customer).filter(Customer.id == payload.customer_id)
        ).scalar_one_or_none()
        if not customer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Customer with ID {payload.customer_id} not found",
            )

    # 2. Buyer Details Snapshot
    buyer_name = payload.buyer_name or (customer.name if customer else "Walk-in Customer")
    buyer_gstin = payload.buyer_gstin or (customer.gstin if customer and customer.gstin else None)
    buyer_state = payload.buyer_state or (customer.state if customer and customer.state else settings.SELLER_STATE)
    buyer_address = payload.buyer_address or (customer.address if customer and customer.address else None)
    buyer_phone = payload.buyer_phone or (customer.phone if customer else None)

    norm_buyer = normalize_state(buyer_state)
    buyer_state_code = CODE_BY_STATE_NAME.get(norm_buyer)
    is_inter_state = bool(norm_buyer and norm_buyer != normalize_state(settings.SELLER_STATE))
    place_of_supply = f"{buyer_state} ({buyer_state_code})" if buyer_state_code else buyer_state

    # 3. Generate sequential Quotation Number
    q_date = date.today()
    fy = get_financial_year(q_date)
    next_num = _get_next_sequence_number(db, fy, "QTN")
    quotation_number = f"QTN/{fy}/{next_num:05d}"

    quotation = Quotation(
        quotation_number=quotation_number,
        financial_year=fy,
        quotation_date=q_date,
        valid_until=payload.valid_until,
        customer_id=customer.id if customer else None,
        staff_id=current_staff.id,
        seller_name=settings.SELLER_NAME,
        seller_gstin=settings.SELLER_GSTIN,
        seller_state=settings.SELLER_STATE,
        seller_state_code=settings.SELLER_STATE_CODE,
        seller_address=settings.SELLER_ADDRESS,
        seller_phone=settings.SELLER_PHONE,
        buyer_name=buyer_name,
        buyer_gstin=buyer_gstin,
        buyer_state=buyer_state,
        buyer_state_code=buyer_state_code,
        buyer_address=buyer_address,
        buyer_phone=buyer_phone,
        is_inter_state=is_inter_state,
        place_of_supply=place_of_supply,
        subtotal=Decimal("0.00"),
        cgst_amount=Decimal("0.00"),
        sgst_amount=Decimal("0.00"),
        igst_amount=Decimal("0.00"),
        total_tax=Decimal("0.00"),
        grand_total=Decimal("0.00"),
        status="draft",
        converted_invoice_id=None,
        notes=payload.notes,
    )
    db.add(quotation)
    db.flush()

    # 4. Fetch Products and compute lines
    product_ids = [item.product_id for item in payload.items]
    products = db.execute(
        select(Product).filter(Product.id.in_(product_ids))
    ).scalars().all()
    prod_map = {p.id: p for p in products}

    total_subtotal = Decimal("0.00")
    total_cgst = Decimal("0.00")
    total_sgst = Decimal("0.00")
    total_igst = Decimal("0.00")

    for req_item in payload.items:
        prod = prod_map.get(req_item.product_id)
        if not prod or not prod.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Active product {req_item.product_id} not found",
            )

        unit_price = quantize_money(req_item.unit_price if req_item.unit_price is not None else prod.selling_price)
        line_discount = quantize_money(req_item.discount_amount)
        gross = quantize_money(req_item.quantity * unit_price)

        if line_discount > gross:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Discount {line_discount} exceeds line total {gross} for product {prod.name}",
            )

        item_taxable = quantize_money(gross - line_discount)
        gst_rate = prod.gst_rate or Decimal("0.00")
        gst_calc = compute_gst(settings.SELLER_STATE, buyer_state, item_taxable, gst_rate)
        item_total = quantize_money(item_taxable + gst_calc["total_tax"])

        q_item = QuotationItem(
            quotation_id=quotation.id,
            product_id=prod.id,
            product_name=prod.name,
            product_sku=prod.sku,
            hsn_code=getattr(prod, "hsn_code", None),
            quantity=req_item.quantity,
            unit_price=unit_price,
            discount_amount=line_discount,
            taxable_value=item_taxable,
            gst_rate=gst_rate,
            cgst_rate=gst_calc["cgst_rate"],
            cgst_amount=gst_calc["cgst_amount"],
            sgst_rate=gst_calc["sgst_rate"],
            sgst_amount=gst_calc["sgst_amount"],
            igst_rate=gst_calc["igst_rate"],
            igst_amount=gst_calc["igst_amount"],
            total_amount=item_total,
        )
        db.add(q_item)

        total_subtotal += item_taxable
        total_cgst += gst_calc["cgst_amount"]
        total_sgst += gst_calc["sgst_amount"]
        total_igst += gst_calc["igst_amount"]

    quotation.subtotal = quantize_money(total_subtotal)
    quotation.cgst_amount = quantize_money(total_cgst)
    quotation.sgst_amount = quantize_money(total_sgst)
    quotation.igst_amount = quantize_money(total_igst)
    quotation.total_tax = quantize_money(total_cgst + total_sgst + total_igst)
    quotation.grand_total = quantize_money(quotation.subtotal + quotation.total_tax)

    log_audit_event(
        db=db,
        event_type="quotation.created",
        description=f"Quotation generated: {quotation.quotation_number}, Grand Total: ₹{quotation.grand_total}.",
        actor_id=current_staff.id,
        actor_type="staff",
        actor_email=current_staff.email,
        resource_type="quotation",
        resource_id=str(quotation.id),
        details={"quotation_number": quotation.quotation_number, "grand_total": str(quotation.grand_total)},
    )

    db.commit()
    db.refresh(quotation)

    stmt = (
        select(Quotation)
        .options(selectinload(Quotation.items))
        .filter(Quotation.id == quotation.id)
    )
    return db.execute(stmt).scalar_one()


@quotation_router.get(
    "",
    response_model=QuotationListResponse,
    summary="List Quotations",
)
def list_quotations(
    customer_id: Optional[uuid.UUID] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user_context: tuple[Optional[StaffUser], Optional[Customer]] = Depends(get_current_user_optional),
):
    """
    List quotations with filters and pagination.
    Supports staff and customer users (customers only see their own quotations).
    """
    staff_user, customer_user = user_context
    if not staff_user and not customer_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    stmt = (
        select(Quotation)
        .options(selectinload(Quotation.items))
        .order_by(Quotation.created_at.desc())
    )

    if customer_user and not staff_user:
        stmt = stmt.filter(Quotation.customer_id == customer_user.id)
    elif customer_id:
        stmt = stmt.filter(Quotation.customer_id == customer_id)

    if status_filter:
        stmt = stmt.filter(Quotation.status == status_filter)

    if search:
        term = f"%{search}%"
        stmt = stmt.filter(
            or_(
                Quotation.quotation_number.ilike(term),
                Quotation.buyer_name.ilike(term),
                Quotation.buyer_gstin.ilike(term),
            )
        )

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.execute(count_stmt).scalar() or 0

    stmt = stmt.offset((page - 1) * limit).limit(limit)
    quotations = db.execute(stmt).scalars().all()

    return QuotationListResponse(
        items=quotations,
        total=total,
        page=page,
        limit=limit,
    )


@quotation_router.get(
    "/{id}",
    response_model=QuotationResponse,
    summary="Get single Quotation by ID",
)
def get_quotation(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    user_context: tuple[Optional[StaffUser], Optional[Customer]] = Depends(get_current_user_optional),
):
    """
    Retrieves quotation details with line items.
    """
    staff_user, customer_user = user_context
    if not staff_user and not customer_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    stmt = (
        select(Quotation)
        .options(selectinload(Quotation.items))
        .filter(Quotation.id == id)
    )
    quotation = db.execute(stmt).scalar_one_or_none()

    if not quotation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Quotation {id} not found",
        )

    if customer_user and not staff_user:
        if quotation.customer_id != customer_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: you can only access your own quotations",
            )

    return quotation


@quotation_router.patch(
    "/{id}/status",
    response_model=QuotationResponse,
    summary="Update Quotation status",
)
def update_quotation_status(
    id: uuid.UUID,
    payload: QuotationStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Updates quotation status (e.g. draft -> sent, or cancelled).
    Cannot modify status once converted.
    """
    stmt = (
        select(Quotation)
        .options(selectinload(Quotation.items))
        .filter(Quotation.id == id)
    )
    quotation = db.execute(stmt).scalar_one_or_none()

    if not quotation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Quotation {id} not found",
        )

    if quotation.status == "converted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot update status of an already converted quotation",
        )

    old_status = quotation.status
    quotation.status = payload.status

    log_audit_event(
        db=db,
        event_type="quotation.status_updated",
        description=f"Quotation {quotation.quotation_number} status changed from {old_status} to {payload.status}.",
        actor_id=current_staff.id,
        actor_type="staff",
        actor_email=current_staff.email,
        resource_type="quotation",
        resource_id=str(quotation.id),
        details={"quotation_number": quotation.quotation_number, "old_status": old_status, "new_status": payload.status},
    )

    db.commit()
    db.refresh(quotation)
    return quotation


@quotation_router.post(
    "/{id}/convert-to-invoice",
    response_model=InvoiceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Convert Quotation to Invoice",
)
def convert_quotation_to_invoice(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Converts a Quotation to a formal GST Tax Invoice in a single atomic transaction.
    - Validates quotation state (rejects if already converted or cancelled).
    - Checks stock availability and deducts stock (writes StockMovement rows).
    - Generates sequential gapless Invoice number.
    - Marks quotation as 'converted' with link to converted_invoice_id.
    - Emits audit log events.
    """
    stmt = (
        select(Quotation)
        .options(selectinload(Quotation.items))
        .filter(Quotation.id == id)
        .with_for_update()
    )
    quotation = db.execute(stmt).scalar_one_or_none()

    if not quotation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Quotation {id} not found",
        )

    if quotation.status == "converted" or quotation.converted_invoice_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Quotation {quotation.quotation_number} has already been converted to an invoice",
        )

    if quotation.status == "cancelled":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot convert cancelled quotation {quotation.quotation_number}",
        )

    # 1. Lock and validate stock for products
    product_ids = [item.product_id for item in quotation.items if item.product_id]
    products = db.execute(
        select(Product).filter(Product.id.in_(product_ids)).with_for_update()
    ).scalars().all()
    prod_map = {p.id: p for p in products}

    for item in quotation.items:
        if not item.product_id or item.product_id not in prod_map:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Product '{item.product_name}' ({item.product_sku}) is no longer available in catalog.",
            )
        prod = prod_map[item.product_id]
        if not prod.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Product '{prod.name}' is inactive and cannot be invoiced.",
            )
        if prod.current_stock < item.quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Insufficient stock for '{prod.name}' ({prod.sku}). "
                    f"Available: {prod.current_stock} {prod.unit}, Required: {item.quantity} {prod.unit}."
                ),
            )

    # 2. Generate Gapless Sequential Invoice Number
    inv_date = date.today()
    fy = get_financial_year(inv_date)
    next_inv_num = _get_next_sequence_number(db, fy, "INV")
    invoice_number = f"INV/{fy}/{next_inv_num:05d}"

    # 3. Create Invoice
    invoice = Invoice(
        invoice_number=invoice_number,
        financial_year=fy,
        invoice_date=inv_date,
        sale_id=None,
        customer_id=quotation.customer_id,
        staff_id=current_staff.id,
        seller_name=quotation.seller_name,
        seller_gstin=quotation.seller_gstin,
        seller_state=quotation.seller_state,
        seller_state_code=quotation.seller_state_code,
        seller_address=quotation.seller_address,
        seller_phone=quotation.seller_phone,
        buyer_name=quotation.buyer_name,
        buyer_gstin=quotation.buyer_gstin,
        buyer_state=quotation.buyer_state,
        buyer_state_code=quotation.buyer_state_code,
        buyer_address=quotation.buyer_address,
        buyer_phone=quotation.buyer_phone,
        is_inter_state=quotation.is_inter_state,
        place_of_supply=quotation.place_of_supply,
        subtotal=quotation.subtotal,
        cgst_amount=quotation.cgst_amount,
        sgst_amount=quotation.sgst_amount,
        igst_amount=quotation.igst_amount,
        total_tax=quotation.total_tax,
        grand_total=quotation.grand_total,
        payment_status="unpaid",
        is_cancelled=False,
        notes=f"Converted from Quotation {quotation.quotation_number}. {quotation.notes or ''}".strip(),
    )
    db.add(invoice)
    db.flush()

    # 4. Create InvoiceItems & deduct stock atomically
    for q_item in quotation.items:
        inv_item = InvoiceItem(
            invoice_id=invoice.id,
            product_id=q_item.product_id,
            product_name=q_item.product_name,
            product_sku=q_item.product_sku,
            hsn_code=q_item.hsn_code,
            quantity=q_item.quantity,
            unit_price=q_item.unit_price,
            taxable_value=q_item.taxable_value,
            gst_rate=q_item.gst_rate,
            cgst_rate=q_item.cgst_rate,
            cgst_amount=q_item.cgst_amount,
            sgst_rate=q_item.sgst_rate,
            sgst_amount=q_item.sgst_amount,
            igst_rate=q_item.igst_rate,
            igst_amount=q_item.igst_amount,
            total_amount=q_item.total_amount,
        )
        db.add(inv_item)

        # Atomic stock deduction
        prod = prod_map[q_item.product_id]
        prod.current_stock = prod.current_stock - q_item.quantity

        movement = StockMovement(
            product_id=prod.id,
            movement_type=MovementType.OUT,
            quantity=-q_item.quantity,
            reference_type="INVOICE",
            reference_id=invoice.id,
            notes=f"Converted from Quotation {quotation.quotation_number}",
            created_by=current_staff.id,
        )
        db.add(movement)

    # 5. Update quotation status
    quotation.status = "converted"
    quotation.converted_invoice_id = invoice.id

    # 6. Audit Logging
    log_audit_event(
        db=db,
        event_type="quotation.converted_to_invoice",
        description=f"Quotation {quotation.quotation_number} converted to Invoice {invoice.invoice_number}.",
        actor_id=current_staff.id,
        actor_type="staff",
        actor_email=current_staff.email,
        resource_type="quotation",
        resource_id=str(quotation.id),
        details={
            "quotation_number": quotation.quotation_number,
            "invoice_id": str(invoice.id),
            "invoice_number": invoice.invoice_number,
            "grand_total": str(invoice.grand_total),
        },
    )

    log_audit_event(
        db=db,
        event_type="invoice.created",
        description=f"GST Tax Invoice generated: {invoice.invoice_number} from Quotation {quotation.quotation_number}, Grand Total: ₹{invoice.grand_total}.",
        actor_id=current_staff.id,
        actor_type="staff",
        actor_email=current_staff.email,
        resource_type="invoice",
        resource_id=str(invoice.id),
        details={
            "invoice_number": invoice.invoice_number,
            "grand_total": str(invoice.grand_total),
            "quotation_id": str(quotation.id),
        },
    )

    db.commit()
    db.refresh(invoice)

    stmt_inv = (
        select(Invoice)
        .options(
            selectinload(Invoice.items),
            selectinload(Invoice.credit_notes).selectinload(CreditNote.items),
        )
        .filter(Invoice.id == invoice.id)
    )
    return db.execute(stmt_inv).scalar_one()
