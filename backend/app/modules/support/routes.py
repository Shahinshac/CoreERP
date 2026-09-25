from datetime import date, datetime
import logging
from typing import List, Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.modules.auth.dependencies import get_current_staff, require_roles
from app.modules.auth.models import Customer, StaffRole, StaffUser
from app.modules.catalog.models import Product
from app.modules.notifications.service import create_notification, email_service
from app.modules.support.models import (
    SupportTicket,
    TicketComment,
    TicketPriority,
    TicketStatus,
    Warranty,
)
from app.modules.support.schemas import (
    TicketAssignRequest,
    TicketCommentCreateRequest,
    TicketCommentResponse,
    TicketResponse,
    TicketStatusUpdateRequest,
    WarrantyClaimRequest,
    WarrantyCreateRequest,
    WarrantyResponse,
)

logger = logging.getLogger("app.support")

support_router = APIRouter(prefix="/api/support", tags=["Support & Warranties"])


# ==========================================
# 1. STAFF WARRANTY MANAGEMENT
# ==========================================

@support_router.get("/warranties", response_model=List[WarrantyResponse])
def list_warranties(
    customer_id: Optional[uuid.UUID] = None,
    product_id: Optional[uuid.UUID] = None,
    serial_number: Optional[str] = None,
    warranty_status: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    _: StaffUser = Depends(get_current_staff),
):
    """
    Lists all product warranties with optional filtering.
    """
    query = db.query(Warranty).order_by(Warranty.created_at.desc())

    if customer_id:
        query = query.filter(Warranty.customer_id == customer_id)
    if product_id:
        query = query.filter(Warranty.product_id == product_id)
    if serial_number:
        query = query.filter(Warranty.serial_number.ilike(f"%{serial_number.strip()}%"))

    warranties = query.all()

    # Filter in-memory by computed status if requested
    results = []
    for w in warranties:
        computed_status = w.status
        if warranty_status and computed_status.lower() != warranty_status.lower():
            continue

        results.append(
            WarrantyResponse(
                id=w.id,
                product_id=w.product_id,
                product_name=w.product.name if w.product else None,
                customer_id=w.customer_id,
                customer_name=w.customer.name if w.customer else None,
                sale_item_id=w.sale_item_id,
                serial_number=w.serial_number,
                purchase_date=w.purchase_date,
                start_date=w.start_date,
                end_date=w.end_date,
                is_claimed=w.is_claimed,
                claimed_at=w.claimed_at,
                claim_notes=w.claim_notes,
                status=computed_status,
                created_at=w.created_at,
            )
        )

    return results


@support_router.post("/warranties", response_model=WarrantyResponse, status_code=status.HTTP_201_CREATED)
def create_warranty(
    payload: WarrantyCreateRequest,
    db: Session = Depends(get_db),
    _: StaffUser = Depends(get_current_staff),
):
    """
    Manually creates a new warranty record.
    """
    product = db.query(Product).filter(Product.id == payload.product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")

    customer = db.query(Customer).filter(Customer.id == payload.customer_id).first()
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found.")

    if payload.end_date < payload.start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Warranty end_date cannot be earlier than start_date.",
        )

    warranty = Warranty(
        product_id=payload.product_id,
        customer_id=payload.customer_id,
        sale_item_id=payload.sale_item_id,
        serial_number=payload.serial_number,
        purchase_date=payload.purchase_date,
        start_date=payload.start_date,
        end_date=payload.end_date,
    )
    db.add(warranty)
    db.commit()
    db.refresh(warranty)

    return WarrantyResponse(
        id=warranty.id,
        product_id=warranty.product_id,
        product_name=product.name,
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


@support_router.post("/warranties/{warranty_id}/claim", response_model=WarrantyResponse)
def claim_warranty(
    warranty_id: uuid.UUID,
    payload: WarrantyClaimRequest,
    db: Session = Depends(get_db),
    _: StaffUser = Depends(get_current_staff),
):
    """
    Marks a warranty as claimed.
    """
    warranty = db.query(Warranty).filter(Warranty.id == warranty_id).first()
    if not warranty:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warranty not found.")

    if warranty.is_claimed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Warranty has already been marked as claimed.",
        )

    warranty.is_claimed = True
    warranty.claimed_at = datetime.utcnow()
    warranty.claim_notes = payload.claim_notes
    db.commit()
    db.refresh(warranty)

    return WarrantyResponse(
        id=warranty.id,
        product_id=warranty.product_id,
        product_name=warranty.product.name if warranty.product else None,
        customer_id=warranty.customer_id,
        customer_name=warranty.customer.name if warranty.customer else None,
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
# 2. STAFF SUPPORT TICKET MANAGEMENT
# ==========================================

def _format_ticket_response(ticket: SupportTicket) -> TicketResponse:
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
        customer_name=ticket.customer.name if ticket.customer else None,
        customer_email=ticket.customer.email if ticket.customer else None,
        subject=ticket.subject,
        description=ticket.description,
        attachment_path=ticket.attachment_path,
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


@support_router.get("/tickets", response_model=List[TicketResponse])
def list_tickets(
    ticket_status: Optional[str] = Query(None, alias="status"),
    priority: Optional[str] = None,
    assigned_to: Optional[uuid.UUID] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    _: StaffUser = Depends(get_current_staff),
):
    """
    Lists support tickets with filtering by status, priority, assignee, and search pattern.
    """
    query = db.query(SupportTicket).order_by(SupportTicket.created_at.desc())

    if ticket_status:
        query = query.filter(SupportTicket.status == ticket_status.lower())
    if priority:
        query = query.filter(SupportTicket.priority == priority.lower())
    if assigned_to:
        query = query.filter(SupportTicket.assigned_staff_id == assigned_to)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(
            (SupportTicket.ticket_number.ilike(pattern))
            | (SupportTicket.subject.ilike(pattern))
            | (SupportTicket.description.ilike(pattern))
        )

    tickets = query.all()
    return [_format_ticket_response(t) for t in tickets]


@support_router.get("/tickets/{ticket_id}", response_model=TicketResponse)
def get_ticket_details(
    ticket_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: StaffUser = Depends(get_current_staff),
):
    """
    Retrieves a single ticket with its complete append-only comments thread.
    """
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Support ticket not found.")
    return _format_ticket_response(ticket)


@support_router.patch("/tickets/{ticket_id}/assign", response_model=TicketResponse)
def assign_ticket(
    ticket_id: uuid.UUID,
    payload: TicketAssignRequest,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Assigns a support ticket to a staff member.
    """
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Support ticket not found.")

    assignee = db.query(StaffUser).filter(StaffUser.id == payload.staff_id).first()
    if not assignee or not assignee.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff user not found or inactive.")

    ticket.assigned_staff_id = assignee.id
    if ticket.status == TicketStatus.OPEN.value:
        ticket.status = TicketStatus.IN_PROGRESS.value

    db.commit()
    db.refresh(ticket)
    return _format_ticket_response(ticket)


@support_router.patch("/tickets/{ticket_id}/status", response_model=TicketResponse)
def update_ticket_status(
    ticket_id: uuid.UUID,
    payload: TicketStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Updates ticket status:
    - Staff+ can change status (open, in_progress, resolved).
    - ONLY assigned staff or Admin/Manager can close a ticket.
    - Synchronously fires exactly one in-app notification to the customer upon status change.
    """
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Support ticket not found.")

    new_status = payload.status.lower()
    old_status = ticket.status.lower()

    if new_status == TicketStatus.CLOSED.value:
        # Check permissions: must be assigned staff OR Admin/Manager
        is_assigned = ticket.assigned_staff_id == current_staff.id
        is_admin_or_mgr = current_staff.role in (
            StaffRole.SUPER_ADMIN.value,
            StaffRole.ADMIN.value,
            StaffRole.MANAGER.value,
        )
        if not (is_assigned or is_admin_or_mgr):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the assigned staff member or a Manager/Admin can close a support ticket.",
            )
        ticket.closed_at = datetime.utcnow()

    if new_status == TicketStatus.RESOLVED.value:
        ticket.resolved_at = datetime.utcnow()

    ticket.status = new_status

    # Synchronous notification to customer if status actually changed
    if old_status != new_status:
        create_notification(
            db=db,
            recipient_id=ticket.customer_id,
            recipient_type="customer",
            type="ticket_status_change",
            title=f"Ticket #{ticket.ticket_number} Updated",
            message=f"The status of your ticket '{ticket.subject}' has been changed to '{new_status}'.",
            link="/portal/support",
        )
        if ticket.customer and ticket.customer.email:
            email_service.send_email(
                to_email=ticket.customer.email,
                subject=f"Update on Support Ticket #{ticket.ticket_number}",
                body_text=f"Your ticket '{ticket.subject}' is now {new_status}.",
            )

    db.commit()
    db.refresh(ticket)
    return _format_ticket_response(ticket)


@support_router.post("/tickets/{ticket_id}/comments", response_model=TicketCommentResponse, status_code=status.HTTP_201_CREATED)
def add_staff_ticket_comment(
    ticket_id: uuid.UUID,
    payload: TicketCommentCreateRequest,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Staff responds to support ticket (append-only).
    Triggers a notification to the customer.
    """
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Support ticket not found.")

    comment = TicketComment(
        ticket_id=ticket.id,
        author_id=current_staff.id,
        author_type="staff",
        author_name=current_staff.full_name or current_staff.email,
        body=payload.body,
    )
    db.add(comment)

    # If ticket was open, mark as in_progress
    if ticket.status == TicketStatus.OPEN.value:
        ticket.status = TicketStatus.IN_PROGRESS.value

    create_notification(
        db=db,
        recipient_id=ticket.customer_id,
        recipient_type="customer",
        type="ticket_reply",
        title=f"New Response on Ticket #{ticket.ticket_number}",
        message=f"Support staff responded to '{ticket.subject}'.",
        link="/portal/support",
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
