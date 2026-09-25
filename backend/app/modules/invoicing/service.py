from datetime import datetime
from decimal import Decimal
import logging
from typing import Optional
import uuid
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.money import quantize_money
from app.modules.audit.service import log_audit_event
from app.modules.auth.models import Customer
from app.modules.catalog.models import Product
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
)
from app.modules.invoicing.schemas import GenerateInvoiceFromSaleRequest
from app.modules.notifications.service import email_service
from app.modules.sales.models import Sale

logger = logging.getLogger("app.invoicing.service")


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


def generate_invoice_for_sale(
    db: Session,
    sale_id: uuid.UUID,
    staff_id: uuid.UUID,
    staff_email: Optional[str] = None,
    payload: Optional[GenerateInvoiceFromSaleRequest] = None,
    auto_commit: bool = True,
) -> Invoice:
    """
    Finalizes a POS sale into an authoritative, immutable GST Tax Invoice record.
    Generates a sequential gapless number, computes line-item GST, links payment, and logs audit trail.
    """
    # 1. Fetch sale with line items & customer
    sale = db.execute(
        select(Sale)
        .options(selectinload(Sale.items), selectinload(Sale.customer))
        .filter(Sale.id == sale_id)
    ).scalar_one_or_none()

    if not sale:
        raise ValueError(f"Sale {sale_id} not found.")

    # 2. Check if invoice already exists for this sale
    existing_inv = db.execute(
        select(Invoice)
        .options(
            selectinload(Invoice.items),
            selectinload(Invoice.credit_notes).selectinload(CreditNote.items),
        )
        .filter(Invoice.sale_id == sale_id)
    ).scalar_one_or_none()

    if existing_inv:
        return existing_inv

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
    is_inter_state = bool(norm_buyer and norm_buyer != normalize_state(settings.SELLER_STATE))
    place_of_supply = f"{buyer_state} ({buyer_state_code})" if buyer_state_code else buyer_state

    # 6. Create Invoice record
    invoice = Invoice(
        invoice_number=invoice_number,
        financial_year=fy,
        invoice_date=sale_dt.date() if isinstance(sale_dt, datetime) else sale_dt,
        sale_id=sale.id,
        customer_id=sale.customer_id,
        staff_id=staff_id,
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
        payment_status="unpaid",
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

    log_audit_event(
        db=db,
        event_type="invoice.created",
        description=f"GST Tax Invoice generated: {invoice.invoice_number}, Grand Total: ₹{invoice.grand_total}.",
        actor_id=staff_id,
        actor_type="staff",
        actor_email=staff_email,
        resource_type="invoice",
        resource_id=str(invoice.id),
        details={
            "invoice_number": invoice.invoice_number,
            "grand_total": str(invoice.grand_total),
            "sale_id": str(sale.id),
        },
    )

    if auto_commit:
        db.commit()
        db.refresh(invoice)

    return invoice


def send_invoice_email(db: Session, invoice: Invoice, customer_email: Optional[str] = None) -> bool:
    """
    Sends an authoritative, beautiful HTML GST Tax Invoice email to the customer.
    Safely catches exceptions so email failures never disrupt checkout flow.
    """
    to_email = customer_email
    if not to_email and invoice.customer_id:
        cust = db.query(Customer).filter(Customer.id == invoice.customer_id).first()
        if cust and cust.email:
            to_email = cust.email.strip()

    if not to_email or "@" not in to_email:
        logger.info(f"No valid customer email found for invoice {invoice.invoice_number}. Skipping email dispatch.")
        return False

    buyer_name = invoice.buyer_name or "Valued Customer"
    subject = f"Tax Invoice #{invoice.invoice_number} from {settings.SELLER_NAME}"

    # Build line items HTML table
    items_rows_html = ""
    plain_items = []
    for idx, item in enumerate(invoice.items, 1):
        items_rows_html += f"""
        <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px 8px; font-size: 13px; color: #475569;">{idx}</td>
            <td style="padding: 10px 8px; font-size: 13px; color: #0f172a; font-weight: 600;">
                {item.product_name}
                <div style="font-size: 11px; color: #64748b; font-weight: 400;">SKU: {item.product_sku}</div>
            </td>
            <td style="padding: 10px 8px; font-size: 13px; color: #475569; text-align: center;">{item.hsn_code or '-'}</td>
            <td style="padding: 10px 8px; font-size: 13px; color: #0f172a; text-align: center;">{item.quantity:.3f}</td>
            <td style="padding: 10px 8px; font-size: 13px; color: #0f172a; text-align: right;">₹{item.unit_price:.2f}</td>
            <td style="padding: 10px 8px; font-size: 13px; color: #0f172a; text-align: right;">₹{item.taxable_value:.2f}</td>
            <td style="padding: 10px 8px; font-size: 13px; color: #0f172a; text-align: right; font-weight: 600;">₹{item.total_amount:.2f}</td>
        </tr>
        """
        plain_items.append(f"{idx}. {item.product_name} x {item.quantity} = ₹{item.total_amount:.2f}")

    tax_breakdown_html = ""
    if invoice.is_inter_state:
        tax_breakdown_html = f"""
        <tr>
            <td style="padding: 6px 0; font-size: 13px; color: #64748b;">Integrated GST (IGST):</td>
            <td style="padding: 6px 0; font-size: 13px; color: #0f172a; text-align: right; font-weight: 600;">₹{invoice.igst_amount:.2f}</td>
        </tr>
        """
    else:
        tax_breakdown_html = f"""
        <tr>
            <td style="padding: 6px 0; font-size: 13px; color: #64748b;">Central GST (CGST):</td>
            <td style="padding: 6px 0; font-size: 13px; color: #0f172a; text-align: right; font-weight: 600;">₹{invoice.cgst_amount:.2f}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; font-size: 13px; color: #64748b;">State GST (SGST):</td>
            <td style="padding: 6px 0; font-size: 13px; color: #0f172a; text-align: right; font-weight: 600;">₹{invoice.sgst_amount:.2f}</td>
        </tr>
        """

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Tax Invoice {invoice.invoice_number}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a;">
        <div style="max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
            <!-- Header Banner -->
            <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; padding: 28px 32px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #38bdf8; font-weight: bold; margin-bottom: 4px;">OFFICIAL TAX INVOICE</div>
                        <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">{settings.SELLER_NAME}</h1>
                        <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8; line-height: 1.4;">
                            {settings.SELLER_ADDRESS or 'Malappuram DT, Kerala 679321'}<br/>
                            Phone: {settings.SELLER_PHONE} • Email: {settings.SELLER_EMAIL}
                        </p>
                    </div>
                </div>
            </div>

            <!-- Invoice Status & Meta Ribbon -->
            <div style="background: #f1f5f9; padding: 14px 32px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <span style="font-size: 12px; color: #64748b;">Invoice Number:</span>
                    <strong style="font-size: 14px; color: #0f172a; margin-left: 6px; font-family: monospace;">{invoice.invoice_number}</strong>
                </div>
                <div>
                    <span style="font-size: 12px; color: #64748b;">Date:</span>
                    <strong style="font-size: 13px; color: #0f172a; margin-left: 6px;">{invoice.invoice_date.strftime('%d-%b-%Y') if hasattr(invoice.invoice_date, 'strftime') else str(invoice.invoice_date)}</strong>
                    <span style="display: inline-block; margin-left: 12px; padding: 2px 8px; border-radius: 9999px; background: #dcfce7; color: #15803d; font-size: 11px; font-weight: bold; text-transform: uppercase;">PAID</span>
                </div>
            </div>

            <!-- Billed To Details -->
            <div style="padding: 24px 32px 16px 32px;">
                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; font-weight: bold; margin-bottom: 8px;">Billed To Customer:</div>
                <div style="font-size: 16px; font-weight: bold; color: #0f172a;">{buyer_name}</div>
                {f'<div style="font-size: 13px; color: #475569; margin-top: 2px;">Phone: {invoice.buyer_phone}</div>' if invoice.buyer_phone else ''}
                {f'<div style="font-size: 13px; color: #475569;">Email: {to_email}</div>' if to_email else ''}
                {f'<div style="font-size: 13px; color: #475569;">Address: {invoice.buyer_address}</div>' if invoice.buyer_address else ''}
                <div style="font-size: 12px; color: #64748b; margin-top: 4px;">State: {invoice.buyer_state} (Code: {invoice.buyer_state_code or '32'}) • Place of Supply: {invoice.place_of_supply}</div>
            </div>

            <!-- Items Table -->
            <div style="padding: 0 32px;">
                <table style="width: 100%; border-collapse: collapse; text-align: left; margin-top: 8px;">
                    <thead>
                        <tr style="background: #f8fafc; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #cbd5e1;">
                            <th style="padding: 10px 8px; font-size: 11px; font-weight: bold; text-transform: uppercase; color: #475569;">#</th>
                            <th style="padding: 10px 8px; font-size: 11px; font-weight: bold; text-transform: uppercase; color: #475569;">Item Description</th>
                            <th style="padding: 10px 8px; font-size: 11px; font-weight: bold; text-transform: uppercase; color: #475569; text-align: center;">HSN</th>
                            <th style="padding: 10px 8px; font-size: 11px; font-weight: bold; text-transform: uppercase; color: #475569; text-align: center;">Qty</th>
                            <th style="padding: 10px 8px; font-size: 11px; font-weight: bold; text-transform: uppercase; color: #475569; text-align: right;">Rate</th>
                            <th style="padding: 10px 8px; font-size: 11px; font-weight: bold; text-transform: uppercase; color: #475569; text-align: right;">Taxable</th>
                            <th style="padding: 10px 8px; font-size: 11px; font-weight: bold; text-transform: uppercase; color: #475569; text-align: right;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items_rows_html}
                    </tbody>
                </table>
            </div>

            <!-- Totals & Payment Breakdown -->
            <div style="padding: 20px 32px; display: flex; justify-content: flex-end;">
                <div style="width: 280px; margin-left: auto;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 6px 0; font-size: 13px; color: #64748b;">Subtotal (Taxable):</td>
                            <td style="padding: 6px 0; font-size: 13px; color: #0f172a; text-align: right; font-weight: 600;">₹{invoice.subtotal:.2f}</td>
                        </tr>
                        {tax_breakdown_html}
                        <tr>
                            <td style="padding: 6px 0; font-size: 13px; color: #64748b;">Total GST:</td>
                            <td style="padding: 6px 0; font-size: 13px; color: #0f172a; text-align: right; font-weight: 600;">₹{invoice.total_tax:.2f}</td>
                        </tr>
                        <tr style="border-top: 2px solid #0f172a;">
                            <td style="padding: 10px 0 6px 0; font-size: 15px; font-weight: 800; color: #0f172a;">Grand Total:</td>
                            <td style="padding: 10px 0 6px 0; font-size: 18px; font-weight: 800; color: #0f172a; text-align: right; font-family: monospace;">₹{invoice.grand_total:.2f}</td>
                        </tr>
                    </table>
                </div>
            </div>

            <!-- UPI Payment info & Statutory Footer -->
            <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 32px;">
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #64748b;">
                    <div>
                        <div style="font-weight: bold; color: #0f172a; margin-bottom: 2px;">Statutory Details:</div>
                        <div>GSTIN: {settings.SELLER_GSTIN or 'Unregistered'} • State Code: {settings.SELLER_STATE_CODE or '32'}</div>
                        <div>UPI ID for payments: <strong>{settings.SELLER_UPI_ID or '7594012761@superyes'}</strong></div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: bold; color: #0f172a;">Authorized Signatory</div>
                        <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">For {settings.SELLER_NAME}</div>
                    </div>
                </div>
                <div style="margin-top: 16px; padding-top: 12px; border-top: 1px dashed #cbd5e1; font-size: 11px; color: #94a3b8; text-align: center;">
                    This is a digitally generated Tax Invoice pursuant to Section 31 of the Central Goods and Services Tax Act, 2017.
                    Thank you for your business!
                </div>
            </div>
        </div>
    </body>
    </html>
    """

    plain_text = f"""
    OFFICIAL TAX INVOICE
    -------------------
    Invoice Number: {invoice.invoice_number}
    Date: {invoice.invoice_date}
    Seller: {settings.SELLER_NAME} ({settings.SELLER_PHONE})
    Customer: {buyer_name} ({to_email})

    Items:
    {chr(10).join(plain_items)}

    Subtotal: ₹{invoice.subtotal:.2f}
    Total Tax: ₹{invoice.total_tax:.2f}
    Grand Total: ₹{invoice.grand_total:.2f} (PAID)

    UPI ID: {settings.SELLER_UPI_ID or '7594012761@superyes'}
    Thank you for shopping with us!
    """

    try:
        sent = email_service.send_email(
            to_email=to_email,
            subject=subject,
            body_text=plain_text,
            body_html=html_content,
        )
        if sent:
            log_audit_event(
                db=db,
                event_type="notification.invoice_email_sent",
                description=f"Tax Invoice #{invoice.invoice_number} sent to {to_email}.",
                actor_type="system",
                resource_type="invoice",
                resource_id=str(invoice.id),
                details={"to_email": to_email, "invoice_number": invoice.invoice_number},
            )
            logger.info(f"[INVOICE EMAIL] Sent invoice #{invoice.invoice_number} to {to_email}")
            return True
        else:
            logger.warning(f"[INVOICE EMAIL] Failed to send email to {to_email}")
            return False
    except Exception as e:
        logger.error(f"[INVOICE EMAIL EXCEPTION] Failed to dispatch invoice email: {e}")
        return False
