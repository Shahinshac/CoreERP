from datetime import datetime
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.modules.auth.dependencies import get_current_staff
from app.modules.auth.models import StaffUser
from app.modules.notifications.models import Notification
from app.modules.notifications.schemas import NotificationListResponse, NotificationResponse

notifications_router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


@notifications_router.get("", response_model=NotificationListResponse)
def list_staff_notifications(
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Returns unread and recent in-app notifications for the authenticated staff user.
    """
    notifications = (
        db.query(Notification)
        .filter(
            Notification.recipient_id == current_staff.id,
            Notification.recipient_type == "staff",
        )
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )

    unread_count = (
        db.query(Notification)
        .filter(
            Notification.recipient_id == current_staff.id,
            Notification.recipient_type == "staff",
            Notification.read_at == None,
        )
        .count()
    )

    return NotificationListResponse(
        unread_count=unread_count,
        items=notifications,
    )


@notifications_router.post("/{notification_id}/read", response_model=NotificationResponse)
def mark_staff_notification_read(
    notification_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Marks a single staff notification as read (idempotent operation).
    """
    notification = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.recipient_id == current_staff.id,
            Notification.recipient_type == "staff",
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


@notifications_router.post("/read-all", status_code=status.HTTP_200_OK)
def mark_all_staff_notifications_read(
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Marks all notifications as read for current staff.
    """
    now = datetime.utcnow()
    db.query(Notification).filter(
        Notification.recipient_id == current_staff.id,
        Notification.recipient_type == "staff",
        Notification.read_at == None,
    ).update({"read_at": now})
    db.commit()

    return {"message": "All notifications marked as read."}
