import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.db import get_db
from app.core.money import parse_decimal, quantize_money
from app.modules.auth.dependencies import get_current_staff, get_current_user_optional
from app.modules.auth.models import Customer, StaffRole, StaffUser
from app.modules.catalog.models import Product
from app.modules.invoicing.gst import (
    INDIAN_STATES_BY_CODE,
    CODE_BY_STATE_NAME,
    compute_gst,
    get_financial_year,
    normalize_state,
)
from app.modules.invoicing.models import (
    CreditNote,
    CreditNoteItem,
    Invoice,
    InvoiceItem,
    InvoiceSequence,
)
from app.modules.invoicing.pdf import generate_invoice_pdf
from app.modules.invoicing.schemas import (
    CreditNoteCreateRequest,
    CreditNoteResponse,
    GenerateInvoiceFromSaleRequest,
    InvoiceListResponse,
    InvoiceResponse,
)
from app.modules.sales.models import Sale, SaleItem

router = APIRouter(prefix="/api/invoicing", tags=["Invoicing"])


def get_next_sequence_number(db: Session, fy: str, seq_type: str = "INV") -> int:
    """
    Atomically generates the next gapless sequence number for a financial year.
    Uses with_for_update() row-locking on the invoice_sequences table.
    """
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


@router.post(
    "/from-sale/{sale_id}",
    response_model=InvoiceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate formal GST Tax Invoice from POS Sale",
)
def create_invoice_from_sale(
    sale_id: uuid.UUID,
    payload: Optional[GenerateInvoiceFromSaleRequest] = None,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Finalizes a POS sale into a formal, immutable GST Tax Invoice.
    Generates a sequential, gapless invoice number per financial year inside the same transaction.
    """
    # 1. Fetch sale with line items
    sale = db.execute(
        select(Sale)
        .options(selectinload(Sale.items), selectinload(Sale.customer))
        .filter(Sale.id == sale_id)
    ).scalar_one_or_none()

    if not sale:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sale {sale_id} not found",
        )

    # 2. Check if invoice already exists for this sale
    existing_inv = db.execute(
        select(Invoice).filter(Invoice.sale_id == sale_id)
    ).scalar_one_or_none()
    if existing_inv:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"An invoice has already been generated for this sale ({existing_inv.invoice_number})",
        )

    req_data = payload or GenerateInvoiceFromSaleRequest()

    # 3. Determine Financial Year & Generate Gapless Sequential Number
    sale_dt = sale.created_at if sale.created_at else datetime.utcnow()
    fy = get_financial_year(sale_dt)
    next_num = get_next_sequence_number(db, fy, "INV")
    invoice_number = f"INV/{fy}/{next_num:05d}"

    # 4. Resolve Buyer Details Snapshot
    customer = sale.customer
    buyer_name = req_data.buyer_name or (customer.name if customer else "Walk-in Customer")
    buyer_gstin = req_data.buyer_gstin or (customer.gstin if customer and customer.gstin else None)
    buyer_state = req_data.buyer_state or (customer.state if customer and customer.state else settings.SELLER_STATE)
    buyer_address = req_data.buyer_address or (customer.address if customer and customer.address else None)
    buyer_phone = customer.phone if customer else None

    # Resolve State codes
    norm_buyer = normalize_state(buyer_state)
    buyer_state_code = CODE_BY_STATE_NAME.get(norm_buyer)

    # 5. Place of supply logic
    # Under Section 10(1)(c) of IGST Act 2017, place of supply for walk-in / counter sales is seller state
    is_inter_state = bool(norm_buyer and norm_buyer != normalize_state(settings.SELLER_STATE))
    place_of_supply = f"{buyer_state} ({buyer_state_code})" if buyer_state_code else buyer_state

    # 6. Create Invoice record
    invoice = Invoice(
        invoice_number=invoice_number,
        financial_year=fy,
        invoice_date=sale_dt.date() if isinstance(sale_dt, datetime) else sale_dt,
        sale_id=sale.id,
        customer_id=sale.customer_id,
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
        payment_status="unpaid",  # Phase 8 wires real payment collection
        is_cancelled=False,
        notes=req_data.notes or sale.notes,
    )
    db.add(invoice)
    db.flush()

    # 7. Generate Line Items with authoritative GST breakdown
    total_subtotal = Decimal("0.00")
    total_cgst = Decimal("0.00")
    total_sgst = Decimal("0.00")
    total_igst = Decimal("0.00")

    for s_item in sale.items:
        # Fetch product to get accurate product name, SKU, HSN, and GST rate
        product = db.execute(
            select(Product).filter(Product.id == s_item.product_id)
        ).scalar_one_or_none()

        product_name = product.name if product else "Product Item"
        product_sku = product.sku if product else "SKU-N/A"
        hsn_code = getattr(product, "hsn_code", None)
        gst_rate = product.gst_rate if product else Decimal("0.00")

        # Taxable value = quantity * unit_price - discount
        item_taxable = quantize_money((s_item.quantity * s_item.unit_price) - s_item.discount_amount)
        if item_taxable < Decimal("0.00"):
            item_taxable = Decimal("0.00")

        gst_calc = compute_gst(settings.SELLER_STATE, buyer_state, item_taxable, gst_rate)

        item_total = quantize_money(item_taxable + gst_calc["total_tax"])

        inv_item = InvoiceItem(
            invoice_id=invoice.id,
            product_id=s_item.product_id,
            product_name=product_name,
            product_sku=product_sku,
            hsn_code=hsn_code,
            quantity=s_item.quantity,
            unit_price=s_item.unit_price,
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
        db.add(inv_item)

        total_subtotal += item_taxable
        total_cgst += gst_calc["cgst_amount"]
        total_sgst += gst_calc["sgst_amount"]
        total_igst += gst_calc["igst_amount"]

    invoice.subtotal = quantize_money(total_subtotal)
    invoice.cgst_amount = quantize_money(total_cgst)
    invoice.sgst_amount = quantize_money(total_sgst)
    invoice.igst_amount = quantize_money(total_igst)
    invoice.total_tax = quantize_money(total_cgst + total_sgst + total_igst)
    invoice.grand_total = quantize_money(invoice.subtotal + invoice.total_tax)

    db.commit()
    db.refresh(invoice)

    # Return with loaded items and credit notes
    stmt = (
        select(Invoice)
        .options(
            selectinload(Invoice.items),
            selectinload(Invoice.credit_notes).selectinload(CreditNote.items),
        )
        .filter(Invoice.id == invoice.id)
    )
    result = db.execute(stmt).scalar_one()
    return result


@router.get(
    "",
    response_model=InvoiceListResponse,
    summary="List and filter Invoices",
)
def list_invoices(
    customer_id: Optional[uuid.UUID] = None,
    payment_status: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    List invoices with multi-faceted filtering.
    """
    stmt = (
        select(Invoice)
        .options(
            selectinload(Invoice.items),
            selectinload(Invoice.credit_notes).selectinload(CreditNote.items),
        )
        .order_by(Invoice.created_at.desc())
    )

    if customer_id:
        stmt = stmt.filter(Invoice.customer_id == customer_id)
    if payment_status:
        stmt = stmt.filter(Invoice.payment_status == payment_status)
    if start_date:
        stmt = stmt.filter(Invoice.invoice_date >= start_date)
    if end_date:
        stmt = stmt.filter(Invoice.invoice_date <= end_date)
    if search:
        term = f"%{search}%"
        stmt = stmt.filter(
            or_(
                Invoice.invoice_number.ilike(term),
                Invoice.buyer_name.ilike(term),
                Invoice.buyer_gstin.ilike(term),
            )
        )

    # Count total
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.execute(count_stmt).scalar() or 0

    # Paginate
    stmt = stmt.offset((page - 1) * limit).limit(limit)
    invoices = db.execute(stmt).scalars().all()

    return InvoiceListResponse(
        items=invoices,
        total=total,
        page=page,
        limit=limit,
    )


@router.get(
    "/{id}",
    response_model=InvoiceResponse,
    summary="Get single Invoice by ID",
)
def get_invoice(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    user_context: tuple[Optional[StaffUser], Optional[Customer]] = Depends(get_current_user_optional),
):
    """
    Retrieve single invoice details.
    Enforces customer data isolation: a customer can only view their own invoices.
    """
    staff_user, customer_user = user_context
    if not staff_user and not customer_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    stmt = (
        select(Invoice)
        .options(
            selectinload(Invoice.items),
            selectinload(Invoice.credit_notes).selectinload(CreditNote.items),
        )
        .filter(Invoice.id == id)
    )
    invoice = db.execute(stmt).scalar_one_or_none()

    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Invoice {id} not found",
        )

    # Customer data isolation
    if customer_user and not staff_user:
        if invoice.customer_id != customer_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: you can only access your own invoices",
            )

    return invoice


@router.get(
    "/{id}/pdf",
    summary="Download or stream in-memory GST Tax Invoice PDF",
)
def get_invoice_pdf(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    user_context: tuple[Optional[StaffUser], Optional[Customer]] = Depends(get_current_user_optional),
):
    """
    Generates and streams an official Indian GST Tax Invoice PDF in-memory.
    Zero disk footprint (100% ephemeral memory buffer).
    """
    staff_user, customer_user = user_context
    if not staff_user and not customer_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    stmt = (
        select(Invoice)
        .options(selectinload(Invoice.items))
        .filter(Invoice.id == id)
    )
    invoice = db.execute(stmt).scalar_one_or_none()

    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Invoice {id} not found",
        )

    if customer_user and not staff_user:
        if invoice.customer_id != customer_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: you can only access your own invoices",
            )

    pdf_buffer = generate_invoice_pdf(invoice)
    clean_filename = invoice.invoice_number.replace("/", "-")

    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="Tax-Invoice-{clean_filename}.pdf"',
            "Content-Type": "application/pdf",
        },
    )


@router.post(
    "/{id}/credit-note",
    response_model=CreditNoteResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Credit Note to reverse an Invoice",
)
def create_credit_note(
    id: uuid.UUID,
    payload: CreditNoteCreateRequest,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Issues an immutable Credit Note against an existing invoice.
    Invoices are immutable; corrections/reversals happen exclusively via Credit Notes.
    Reverses the exact GST breakdown in reverse.
    """
    # Fetch invoice
    stmt = (
        select(Invoice)
        .options(selectinload(Invoice.items), selectinload(Invoice.credit_notes))
        .filter(Invoice.id == id)
    )
    invoice = db.execute(stmt).scalar_one_or_none()

    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Invoice {id} not found",
        )

    if invoice.is_cancelled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invoice is already cancelled / fully reversed",
        )

    # Determine financial year and next credit note number
    fy = get_financial_year(date.today())
    cn_num = get_next_sequence_number(db, fy, "CN")
    credit_note_number = f"CN/{fy}/{cn_num:05d}"

    credit_note = CreditNote(
        credit_note_number=credit_note_number,
        financial_year=fy,
        credit_note_date=date.today(),
        invoice_id=invoice.id,
        staff_id=current_staff.id,
        reason=payload.reason,
        subtotal_refunded=Decimal("0.00"),
        cgst_refunded=Decimal("0.00"),
        sgst_refunded=Decimal("0.00"),
        igst_refunded=Decimal("0.00"),
        total_tax_refunded=Decimal("0.00"),
        grand_total_refunded=Decimal("0.00"),
    )
    db.add(credit_note)
    db.flush()

    # Calculate reversal items
    inv_items_by_id = {item.id: item for item in invoice.items}

    total_subtotal_ref = Decimal("0.00")
    total_cgst_ref = Decimal("0.00")
    total_sgst_ref = Decimal("0.00")
    total_igst_ref = Decimal("0.00")

    if payload.items:
        # Partial reversal
        for item_req in payload.items:
            inv_item = inv_items_by_id.get(item_req.invoice_item_id)
            if not inv_item:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invoice item {item_req.invoice_item_id} not found on this invoice",
                )
            if item_req.quantity > inv_item.quantity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot reverse quantity {item_req.quantity} exceeding original quantity {inv_item.quantity}",
                )

            ratio = item_req.quantity / inv_item.quantity
            taxable_ref = quantize_money(inv_item.taxable_value * ratio)
            cgst_ref = quantize_money(inv_item.cgst_amount * ratio)
            sgst_ref = quantize_money(inv_item.sgst_amount * ratio)
            igst_ref = quantize_money(inv_item.igst_amount * ratio)
            item_tot_ref = quantize_money(taxable_ref + cgst_ref + sgst_ref + igst_ref)

            cn_item = CreditNoteItem(
                credit_note_id=credit_note.id,
                invoice_item_id=inv_item.id,
                product_name=inv_item.product_name,
                quantity=item_req.quantity,
                taxable_value=taxable_ref,
                cgst_amount=cgst_ref,
                sgst_amount=sgst_ref,
                igst_amount=igst_ref,
                total_amount=item_tot_ref,
            )
            db.add(cn_item)

            total_subtotal_ref += taxable_ref
            total_cgst_ref += cgst_ref
            total_sgst_ref += sgst_ref
            total_igst_ref += igst_ref
    else:
        # Full reversal of invoice
        for inv_item in invoice.items:
            cn_item = CreditNoteItem(
                credit_note_id=credit_note.id,
                invoice_item_id=inv_item.id,
                product_name=inv_item.product_name,
                quantity=inv_item.quantity,
                taxable_value=inv_item.taxable_value,
                cgst_amount=inv_item.cgst_amount,
                sgst_amount=inv_item.sgst_amount,
                igst_amount=inv_item.igst_amount,
                total_amount=inv_item.total_amount,
            )
            db.add(cn_item)

            total_subtotal_ref += inv_item.taxable_value
            total_cgst_ref += inv_item.cgst_amount
            total_sgst_ref += inv_item.sgst_amount
            total_igst_ref += inv_item.igst_amount

        # Mark invoice as cancelled upon full reversal
        invoice.is_cancelled = True
        invoice.payment_status = "cancelled"

    credit_note.subtotal_refunded = quantize_money(total_subtotal_ref)
    credit_note.cgst_refunded = quantize_money(total_cgst_ref)
    credit_note.sgst_refunded = quantize_money(total_sgst_ref)
    credit_note.igst_refunded = quantize_money(total_igst_ref)
    credit_note.total_tax_refunded = quantize_money(total_cgst_ref + total_sgst_ref + total_igst_ref)
    credit_note.grand_total_refunded = quantize_money(credit_note.subtotal_refunded + credit_note.total_tax_refunded)

    db.commit()
    db.refresh(credit_note)

    stmt = (
        select(CreditNote)
        .options(selectinload(CreditNote.items))
        .filter(CreditNote.id == credit_note.id)
    )
    return db.execute(stmt).scalar_one()
