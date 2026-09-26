import logging
import os
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List
import uuid
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.cloudinary import is_cloudinary_configured, upload_file
from app.core.db import get_db
from app.core.isolation import filter_customer_scope
from app.core.money import quantize_money
from app.modules.auth.dependencies import get_current_customer
from app.modules.auth.models import Customer
from app.modules.emi.models import EmiInstallment, EmiPlan, EmiPlanStatus
from app.modules.invoicing.models import CreditNote, Invoice
from app.modules.invoicing.pdf import generate_invoice_pdf
from app.modules.invoicing.schemas import InvoiceResponse
from app.modules.notifications.models import Notification
from app.modules.notifications.schemas import NotificationListResponse, NotificationResponse
from app.modules.notifications.service import create_notification
from app.modules.payments.models import Payment
from app.modules.portal.schemas import (
    PortalDashboardSummary,
    PortalEmiInstallmentResponse,
    PortalEmiPlanResponse,
    PortalPaymentResponse,
    PortalProfileResponse,
    PortalProfileUpdateRequest,
    PortalPurchaseItem,
    PortalPurchaseResponse,
)
from app.modules.sales.models import Sale, SaleItem
from app.modules.support.models import (
    SupportTicket,
    TicketComment,
    TicketPriority,
    TicketStatus,
    Warranty,
)
from app.modules.support.schemas import (
    TicketCommentCreateRequest,
    TicketCommentResponse,
    TicketResponse,
    WarrantyResponse,
)

portal_router = APIRouter(prefix="/api/portal", tags=["Customer Portal"])
logger = logging.getLogger(__name__)


# ==========================================
# 1. CUSTOMER DASHBOARD SUMMARY
# ==========================================

@portal_router.get("/dashboard", response_model=PortalDashboardSummary)
def get_customer_dashboard(
    db: Session = Depends(get_db),
    customer: Customer = Depends(get_current_customer),
):
    """
    Customer portal dashboard KPI summary:
    - Recent purchases (top 5 non-cancelled)
    - Outstanding balance (unpaid invoice balances + unpaid active EMI balances)
    - Active EMI plans count
    - Open support tickets count (stubbed as 0, TODO Phase 14)
    - Total purchases count & total spend
    """
    # 1. Total purchases and spend
    sales_query = filter_customer_scope(db.query(Sale), Sale, customer).filter(Sale.status != "cancelled")
    total_purchases_count = sales_query.count()

    total_spent_val = (
        db.query(func.coalesce(func.sum(Sale.total_amount), Decimal("0.00")))
        .filter(Sale.customer_id == customer.id, Sale.status != "cancelled")
        .scalar()
        or Decimal("0.00")
    )
    total_spent = quantize_money(total_spent_val)

    # 2. Recent purchases
    recent_sales = (
        sales_query.options(selectinload(Sale.items))
        .order_by(Sale.created_at.desc())
        .limit(5)
        .all()
    )
    recent_purchases: List[PortalPurchaseResponse] = []
    for s in recent_sales:
        items = [
            PortalPurchaseItem(
                id=item.id,
                product_name=item.product.name if hasattr(item, "product") and item.product else "Item",
                product_sku=item.product.sku if hasattr(item, "product") and item.product else "",
                quantity=item.quantity,
                unit_price=item.unit_price,
                total_amount=getattr(item, "total_price", getattr(item, "total_amount", Decimal("0.00"))),
            )
            for item in s.items
        ]
        recent_purchases.append(
            PortalPurchaseResponse(
                id=s.id,
                invoice_number=s.invoice_number,
                created_at=s.created_at,
                subtotal=s.subtotal,
                discount_amount=s.discount_amount,
                tax_amount=s.tax_amount,
                total_amount=s.total_amount,
                status=s.status,
                payment_method=s.payment_method,
                items=items,
            )
        )

    # 3. Outstanding invoice balances
    invoices = (
        filter_customer_scope(db.query(Invoice), Invoice, customer)
        .filter(Invoice.is_cancelled == False)
        .all()
    )
    unpaid_invoice_total = Decimal("0.00")
    for inv in invoices:
        paid_for_inv = (
            db.query(func.coalesce(func.sum(Payment.amount), Decimal("0.00")))
            .filter(Payment.invoice_id == inv.id, Payment.status == "paid")
            .scalar()
            or Decimal("0.00")
        )
        inv_rem = inv.grand_total - paid_for_inv
        if inv_rem > Decimal("0.00"):
            unpaid_invoice_total += inv_rem

    # 4. Outstanding EMI balances & active plan count
    active_emi_plans = (
        filter_customer_scope(db.query(EmiPlan), EmiPlan, customer)
        .filter(EmiPlan.status.in_([EmiPlanStatus.ACTIVE, EmiPlanStatus.DEFAULTED]))
        .all()
    )
    active_emi_count = len(active_emi_plans)
    unpaid_emi_total = Decimal("0.00")
    for plan in active_emi_plans:
        paid_for_plan = (
            db.query(func.coalesce(func.sum(Payment.amount), Decimal("0.00")))
            .filter(Payment.emi_plan_id == plan.id, Payment.status == "paid")
            .scalar()
            or Decimal("0.00")
        )
        plan_rem = plan.total_financed - paid_for_plan
        if plan_rem > Decimal("0.00"):
            unpaid_emi_total += plan_rem

    outstanding_balance = quantize_money(unpaid_invoice_total + unpaid_emi_total)

    # 5. Open tickets real count
    open_tickets_count = (
        db.query(func.count(SupportTicket.id))
        .filter(
            SupportTicket.customer_id == customer.id,
            SupportTicket.status.in_([TicketStatus.OPEN.value, TicketStatus.IN_PROGRESS.value]),
        )
        .scalar()
        or 0
    )

    return PortalDashboardSummary(
        outstanding_balance=outstanding_balance,
        active_emi_plans_count=active_emi_count,
        total_purchases_count=total_purchases_count,
        total_spent=total_spent,
        open_tickets_count=open_tickets_count,
        recent_purchases=recent_purchases,
    )


# ==========================================
# 2. PURCHASES / SALES LIST
# ==========================================

@portal_router.get("/purchases", response_model=List[PortalPurchaseResponse])
def get_customer_purchases(
    db: Session = Depends(get_db),
    customer: Customer = Depends(get_current_customer),
):
    """
    Retrieve customer's own purchase history strictly isolated via filter_customer_scope.
    """
    sales = (
        filter_customer_scope(db.query(Sale), Sale, customer)
        .options(selectinload(Sale.items).selectinload(SaleItem.product))
        .order_by(Sale.created_at.desc())
        .all()
    )

    results: List[PortalPurchaseResponse] = []
    for s in sales:
        items = [
            PortalPurchaseItem(
                id=item.id,
                product_name=item.product.name if item.product else "Item",
                product_sku=item.product.sku if item.product else "",
                quantity=item.quantity,
                unit_price=item.unit_price,
                total_amount=getattr(item, "total_price", getattr(item, "total_amount", Decimal("0.00"))),
            )
            for item in s.items
        ]
        results.append(
            PortalPurchaseResponse(
                id=s.id,
                invoice_number=s.invoice_number,
                created_at=s.created_at,
                subtotal=s.subtotal,
                discount_amount=s.discount_amount,
                tax_amount=s.tax_amount,
                total_amount=s.total_amount,
                status=s.status,
                payment_method=s.payment_method,
                items=items,
            )
        )
    return results


# ==========================================
# 3. INVOICES (LIST, SINGLE, PDF)
# ==========================================

@portal_router.get("/invoices", response_model=List[InvoiceResponse])
def get_customer_invoices(
    db: Session = Depends(get_db),
    customer: Customer = Depends(get_current_customer),
):
    """
    List all GST tax invoices belonging to the authenticated customer.
    """
    invoices = (
        filter_customer_scope(db.query(Invoice), Invoice, customer)
        .options(
            selectinload(Invoice.items),
            selectinload(Invoice.credit_notes).selectinload(CreditNote.items),
            selectinload(Invoice.emi_plan).selectinload(EmiPlan.installments),
            selectinload(Invoice.sale),
        )
        .order_by(Invoice.invoice_date.desc(), Invoice.created_at.desc())
        .all()
    )
    return invoices


@portal_router.get("/invoices/{id}", response_model=InvoiceResponse)
def get_customer_invoice_detail(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    customer: Customer = Depends(get_current_customer),
):
    """
    Retrieve single invoice detail with strict ownership verification:
    - 404 Not Found if invoice ID does not exist in system.
    - 403 Forbidden if invoice exists but belongs to another customer (prevents cross-tenant viewing).
    """
    invoice = (
        db.query(Invoice)
        .options(
            selectinload(Invoice.items),
            selectinload(Invoice.credit_notes).selectinload(CreditNote.items),
            selectinload(Invoice.emi_plan).selectinload(EmiPlan.installments),
            selectinload(Invoice.sale),
        )
        .filter(Invoice.id == id)
        .first()
    )
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Invoice {id} not found.",
        )

    if invoice.customer_id != customer.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: You can only access your own invoices.",
        )

    return invoice


@portal_router.get("/invoices/{id}/pdf")
def get_customer_invoice_pdf(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    customer: Customer = Depends(get_current_customer),
):
    """
    Streams official GST Tax Invoice PDF generated in-memory with ownership verification:
    - 404 Not Found if invoice ID does not exist.
    - 403 Forbidden if invoice belongs to another customer.
    """
    invoice = (
        db.query(Invoice)
        .options(
            selectinload(Invoice.items),
            selectinload(Invoice.credit_notes).selectinload(CreditNote.items),
            selectinload(Invoice.emi_plan).selectinload(EmiPlan.installments),
            selectinload(Invoice.sale),
        )
        .filter(Invoice.id == id)
        .first()
    )
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Invoice {id} not found.",
        )

    if invoice.customer_id != customer.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: You can only access your own invoices.",
        )

    pdf_buffer = generate_invoice_pdf(invoice)
    clean_num = invoice.invoice_number.replace("/", "-")
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=invoice_{clean_num}.pdf"},
    )


# ==========================================
# 4. PAYMENTS LEDGER
# ==========================================

@portal_router.get("/payments", response_model=List[PortalPaymentResponse])
def get_customer_payments(
    db: Session = Depends(get_db),
    customer: Customer = Depends(get_current_customer),
):
    """
    Retrieve customer's own payment transaction history strictly isolated via filter_customer_scope.
    """
    payments = (
        filter_customer_scope(db.query(Payment), Payment, customer)
        .order_by(Payment.created_at.desc())
        .all()
    )

    results: List[PortalPaymentResponse] = []
    for p in payments:
        inv_num = None
        if p.invoice_id:
            inv = db.get(Invoice, p.invoice_id)
            if inv:
                inv_num = inv.invoice_number

        results.append(
            PortalPaymentResponse(
                id=p.id,
                invoice_id=p.invoice_id,
                invoice_number=inv_num,
                amount=p.amount,
                method=p.method,
                status=p.status,
                reference_id=p.reference_id,
                emi_plan_id=p.emi_plan_id,
                created_at=p.created_at,
            )
        )
    return results


# ==========================================
# 5. EMI FINANCING PLANS & SCHEDULES
# ==========================================

@portal_router.get("/emi", response_model=List[PortalEmiPlanResponse])
def get_customer_emi_plans(
    db: Session = Depends(get_db),
    customer: Customer = Depends(get_current_customer),
):
    """
    Retrieve customer's own EMI plans with full installment schedules (read-only).
    """
    plans = (
        filter_customer_scope(db.query(EmiPlan), EmiPlan, customer)
        .options(selectinload(EmiPlan.installments))
        .order_by(EmiPlan.created_at.desc())
        .all()
    )

    results: List[PortalEmiPlanResponse] = []
    for plan in plans:
        # Calculate plan metrics
        total_paid_val = (
            db.query(func.coalesce(func.sum(Payment.amount), Decimal("0.00")))
            .filter(Payment.emi_plan_id == plan.id, Payment.status == "paid")
            .scalar()
            or Decimal("0.00")
        )
        total_paid = quantize_money(total_paid_val)
        remaining = quantize_money(max(Decimal("0.00"), plan.total_financed - total_paid))

        inv_num = None
        if plan.invoice_id:
            inv = db.get(Invoice, plan.invoice_id)
            if inv:
                inv_num = inv.invoice_number

        installments_sorted = sorted(plan.installments, key=lambda inst: inst.installment_number)
        inst_responses = [
            PortalEmiInstallmentResponse(
                id=inst.id,
                installment_number=inst.installment_number,
                due_date=inst.due_date,
                amount_due=inst.amount_due,
                amount_paid=inst.amount_paid,
                status=inst.status.value if hasattr(inst.status, "value") else str(inst.status),
            )
            for inst in installments_sorted
        ]

        status_val = plan.status.value if hasattr(plan.status, "value") else str(plan.status)

        results.append(
            PortalEmiPlanResponse(
                id=plan.id,
                invoice_id=plan.invoice_id,
                invoice_number=inv_num,
                principal=plan.principal,
                down_payment=plan.down_payment,
                number_of_installments=plan.number_of_installments,
                interest_rate=plan.interest_rate,
                interest_amount=plan.interest_amount,
                total_financed=plan.total_financed,
                installment_amount=plan.installment_amount,
                start_date=plan.start_date,
                total_paid=total_paid,
                remaining_balance=remaining,
                status=status_val,
                installments=inst_responses,
            )
        )
    return results


# ==========================================
# 6. PROFILE VIEW & EDIT
# ==========================================

@portal_router.get("/profile", response_model=PortalProfileResponse)
def get_customer_profile(
    customer: Customer = Depends(get_current_customer),
):
    """
    Retrieve currently authenticated customer profile.
    """
    return PortalProfileResponse.model_validate(customer)


@portal_router.put("/profile", response_model=PortalProfileResponse)
def update_customer_profile(
    payload: PortalProfileUpdateRequest,
    db: Session = Depends(get_db),
    customer: Customer = Depends(get_current_customer),
):
    """
    Update customer's own contact details (name, phone, address, gstin, state).
    Email, password, active status, and primary key cannot be altered here.
    """
    if payload.name is not None and payload.name.strip():
        customer.name = payload.name.strip()
    if payload.phone is not None:
        customer.phone = payload.phone.strip() if payload.phone.strip() else None
    if payload.address is not None:
        customer.address = payload.address.strip() if payload.address.strip() else None
    if payload.gstin is not None:
        customer.gstin = payload.gstin.strip().upper() if payload.gstin.strip() else None
    if payload.state is not None:
        customer.state = payload.state.strip() if payload.state.strip() else None

    db.add(customer)
    db.commit()
    db.refresh(customer)

    return PortalProfileResponse.model_validate(customer)


# ==========================================
# 7. CUSTOMER WARRANTIES
# ==========================================

@portal_router.get("/warranties", response_model=List[WarrantyResponse])
def get_customer_warranties(
    db: Session = Depends(get_db),
    customer: Customer = Depends(get_current_customer),
):
    """
    Retrieve current customer's warranties strictly isolated via filter_customer_scope.
    """
    warranties = (
        filter_customer_scope(db.query(Warranty), Warranty, customer)
        .order_by(Warranty.created_at.desc())
        .all()
    )

    return [
        WarrantyResponse(
            id=w.id,
            product_id=w.product_id,
            product_name=w.product.name if w.product else None,
            customer_id=w.customer_id,
            customer_name=customer.name,
            sale_item_id=w.sale_item_id,
            serial_number=w.serial_number,
            purchase_date=w.purchase_date,
            start_date=w.start_date,
            end_date=w.end_date,
            is_claimed=w.is_claimed,
            claimed_at=w.claimed_at,
            claim_notes=w.claim_notes,
            status=w.status,
            created_at=w.created_at,
        )
        for w in warranties
    ]


@portal_router.get("/warranties/{warranty_id}", response_model=WarrantyResponse)
def get_single_customer_warranty(
    warranty_id: uuid.UUID,
    db: Session = Depends(get_db),
    customer: Customer = Depends(get_current_customer),
):
    """
    Retrieve single warranty record.
    Returns 404 if record does not exist.
    Returns 403 Forbidden if record exists but belongs to a different customer.
    """
    warranty = db.query(Warranty).filter(Warranty.id == warranty_id).first()
    if not warranty:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Warranty record not found.",
        )
    if warranty.customer_id != customer.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access to this warranty record is forbidden.",
        )

    return WarrantyResponse(
        id=warranty.id,
        product_id=warranty.product_id,
        product_name=warranty.product.name if warranty.product else None,
        customer_id=warranty.customer_id,
        customer_name=customer.name,
        sale_item_id=warranty.sale_item_id,
        serial_number=warranty.serial_number,
        purchase_date=warranty.purchase_date,
        start_date=warranty.start_date,
        end_date=warranty.end_date,
        is_claimed=warranty.is_claimed,
        claimed_at=warranty.claimed_at,
        claim_notes=warranty.claim_notes,
        status=warranty.status,
        created_at=warranty.created_at,
    )


# ==========================================
# 8. CUSTOMER SUPPORT TICKETS
# ==========================================

ALLOWED_ATTACHMENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "application/pdf",
}
MAX_ATTACHMENT_SIZE_BYTES = 2 * 1024 * 1024  # 2MB


def _format_portal_ticket(ticket: SupportTicket, customer_name: str) -> TicketResponse:
    comments = [
        TicketCommentResponse(
            id=c.id,
            ticket_id=c.ticket_id,
            author_id=c.author_id,
            author_type=c.author_type,
            author_name=c.author_name,
            body=c.body,
            created_at=c.created_at,
        )
        for c in ticket.comments
    ]
    return TicketResponse(
        id=ticket.id,
        ticket_number=ticket.ticket_number,
        customer_id=ticket.customer_id,
        customer_name=customer_name,
        customer_email=ticket.customer.email if ticket.customer else None,
        subject=ticket.subject,
        description=ticket.description,
        attachment_path=ticket.attachment_path,
        attachment_public_id=ticket.attachment_public_id,
        status=ticket.status,
        priority=ticket.priority,
        assigned_staff_id=ticket.assigned_staff_id,
        assigned_staff_name=ticket.assigned_staff.full_name or ticket.assigned_staff.email if ticket.assigned_staff else None,
        resolved_at=ticket.resolved_at,
        closed_at=ticket.closed_at,
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
        comments=comments,
    )


@portal_router.post("/tickets", response_model=TicketResponse, status_code=status.HTTP_201_CREATED)
async def create_customer_ticket(
    subject: str = Form(..., min_length=3, max_length=255),
    description: str = Form(..., min_length=5, max_length=10000),
    priority: str = Form("medium"),
    attachment: UploadFile = File(None),
    db: Session = Depends(get_db),
    customer: Customer = Depends(get_current_customer),
):
    """
    Creates a new support ticket submitted by customer with optional attachment.
    Validates file MIME type and max size (<= 2MB).
    """
    attachment_path = None
    attachment_public_id = None
    if attachment and attachment.filename:
        if attachment.content_type not in ALLOWED_ATTACHMENT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid file type '{attachment.content_type}'. Allowed types: JPG, PNG, WebP, PDF.",
            )
        content = await attachment.read()
        if len(content) > MAX_ATTACHMENT_SIZE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File size exceeds maximum limit of 2MB (got {len(content)} bytes).",
            )
        # Store relative storage path with basename to prevent path traversal
        safe_name = os.path.basename(attachment.filename).replace(" ", "_")
        public_id = f"tickets/{customer.id}/{uuid.uuid4().hex[:12]}_{safe_name}"
        fallback_path = public_id

        # Upload attachment to Cloudinary if credentials are configured
        if is_cloudinary_configured():
            upload_res = await upload_file(
                file_bytes=content,
                public_id=public_id,
                folder=f"tickets/{customer.id}",
                resource_type="auto",
            )
            attachment_path = upload_res["secure_url"]
            attachment_public_id = upload_res["public_id"]
        elif (
            settings.SUPABASE_URL
            and settings.SUPABASE_SERVICE_KEY
            and "your-project" not in settings.SUPABASE_URL
            and "your-supabase" not in settings.SUPABASE_SERVICE_KEY
        ):
            # Dual-provider fallback if Supabase is still configured
            try:
                storage_upload_url = f"{settings.SUPABASE_URL.rstrip('/')}/storage/v1/object/catalog/{fallback_path}"
                headers = {
                    "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
                    "apikey": settings.SUPABASE_SERVICE_KEY,
                    "Content-Type": attachment.content_type,
                }
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(storage_upload_url, content=content, headers=headers)
                    if resp.status_code not in (200, 201):
                        logger.error(f"Storage upload failed for ticket attachment: {resp.status_code} {resp.text}")
                        raise HTTPException(
                            status_code=status.HTTP_502_BAD_GATEWAY,
                            detail="Storage upload failed. Remote storage service returned an error.",
                        )
            except HTTPException:
                raise
            except Exception as err:
                logger.error(f"Error uploading attachment to storage: {err}")
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Failed to upload attachment to remote storage service. Please try again later.",
                )
            attachment_path = fallback_path
            attachment_public_id = public_id
        else:
            # Development / test unconfigured fallback
            attachment_path = fallback_path
            attachment_public_id = public_id

    ticket_number = f"TKT-{uuid.uuid4().hex[:8].upper()}"

    ticket = SupportTicket(
        ticket_number=ticket_number,
        customer_id=customer.id,
        subject=subject.strip(),
        description=description.strip(),
        priority=priority.lower(),
        attachment_path=attachment_path,
        attachment_public_id=attachment_public_id,
        status=TicketStatus.OPEN.value,
    )
    db.add(ticket)

    # In-app notification to staff (Admins/Managers)
    from app.modules.auth.models import StaffRole, StaffUser
    admins = (
        db.query(StaffUser)
        .filter(
            StaffUser.is_active == True,
            StaffUser.role.in_([StaffRole.SUPER_ADMIN.value, StaffRole.ADMIN.value, StaffRole.MANAGER.value]),
        )
        .all()
    )
    for admin in admins:
        create_notification(
            db=db,
            recipient_id=admin.id,
            recipient_type="staff",
            type="new_ticket",
            title=f"New Ticket: {ticket.ticket_number}",
            message=f"{customer.name} opened ticket '{ticket.subject}'.",
            link="/staff/tickets",
        )

    db.commit()
    db.refresh(ticket)
    return _format_portal_ticket(ticket, customer.name)


@portal_router.get("/tickets", response_model=List[TicketResponse])
def get_customer_tickets(
    db: Session = Depends(get_db),
    customer: Customer = Depends(get_current_customer),
):
    """
    Retrieve customer's own support tickets isolated via filter_customer_scope.
    """
    tickets = (
        filter_customer_scope(db.query(SupportTicket), SupportTicket, customer)
        .order_by(SupportTicket.created_at.desc())
        .all()
    )
    return [_format_portal_ticket(t, customer.name) for t in tickets]


@portal_router.get("/tickets/{ticket_id}", response_model=TicketResponse)
def get_single_customer_ticket(
    ticket_id: uuid.UUID,
    db: Session = Depends(get_db),
    customer: Customer = Depends(get_current_customer),
):
    """
    Retrieve single ticket with comments thread.
    Returns 404 if record does not exist.
    Returns 403 Forbidden if record exists but belongs to a different customer.
    """
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Support ticket not found.",
        )
    if ticket.customer_id != customer.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access to this support ticket is forbidden.",
        )

    return _format_portal_ticket(ticket, customer.name)


@portal_router.post("/tickets/{ticket_id}/comments", response_model=TicketCommentResponse, status_code=status.HTTP_201_CREATED)
def add_customer_ticket_comment(
    ticket_id: uuid.UUID,
    payload: TicketCommentCreateRequest,
    db: Session = Depends(get_db),
    customer: Customer = Depends(get_current_customer),
):
    """
    Customer replies to own support ticket (append-only thread).
    Returns 404 if not found, 403 if belongs to another customer.
    """
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Support ticket not found.",
        )
    if ticket.customer_id != customer.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access to this support ticket is forbidden.",
        )

    comment = TicketComment(
        ticket_id=ticket.id,
        author_id=customer.id,
        author_type="customer",
        author_name=customer.name,
        body=payload.body,
    )
    db.add(comment)

    # Reopen ticket if it was resolved/closed
    if ticket.status in (TicketStatus.RESOLVED.value, TicketStatus.CLOSED.value):
        ticket.status = TicketStatus.IN_PROGRESS.value

    # Notify assigned staff member or admins
    if ticket.assigned_staff_id:
        create_notification(
            db=db,
            recipient_id=ticket.assigned_staff_id,
            recipient_type="staff",
            type="ticket_reply",
            title=f"Reply on Ticket #{ticket.ticket_number}",
            message=f"{customer.name} responded to ticket '{ticket.subject}'.",
            link="/staff/tickets",
        )

    db.commit()
    db.refresh(comment)

    return TicketCommentResponse(
        id=comment.id,
        ticket_id=comment.ticket_id,
        author_id=comment.author_id,
        author_type=comment.author_type,
        author_name=comment.author_name,
        body=comment.body,
        created_at=comment.created_at,
    )


# ==========================================
# 9. CUSTOMER NOTIFICATIONS
# ==========================================

@portal_router.get("/notifications", response_model=NotificationListResponse)
def list_customer_notifications(
    db: Session = Depends(get_db),
    customer: Customer = Depends(get_current_customer),
):
    """
    Returns unread and recent notifications for the customer.
    """
    notifications = (
        db.query(Notification)
        .filter(
            Notification.recipient_id == customer.id,
            Notification.recipient_type == "customer",
        )
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )

    unread_count = (
        db.query(Notification)
        .filter(
            Notification.recipient_id == customer.id,
            Notification.recipient_type == "customer",
            Notification.read_at == None,
        )
        .count()
    )

    return NotificationListResponse(
        unread_count=unread_count,
        items=notifications,
    )


@portal_router.post("/notifications/{notification_id}/read", response_model=NotificationResponse)
def mark_customer_notification_read(
    notification_id: uuid.UUID,
    db: Session = Depends(get_db),
    customer: Customer = Depends(get_current_customer),
):
    """
    Marks a customer notification as read (idempotent).
    """
    notification = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.recipient_id == customer.id,
            Notification.recipient_type == "customer",
        )
        .first()
    )
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        )

    if not notification.read_at:
        notification.read_at = datetime.utcnow()
        db.commit()
        db.refresh(notification)

    return notification


@portal_router.post("/notifications/read-all", status_code=status.HTTP_200_OK)
def mark_all_customer_notifications_read(
    db: Session = Depends(get_db),
    customer: Customer = Depends(get_current_customer),
):
    """
    Marks all notifications as read for current customer.
    """
    now = datetime.utcnow()
    db.query(Notification).filter(
        Notification.recipient_id == customer.id,
        Notification.recipient_type == "customer",
        Notification.read_at == None,
    ).update({"read_at": now})
    db.commit()

    return {"message": "All customer notifications marked as read."}
