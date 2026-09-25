import abc
from datetime import date, datetime, timedelta
import logging
from typing import List, Optional
import uuid
import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.notifications.models import Notification

logger = logging.getLogger("app.notifications")


# ==========================================
# 1. IN-APP NOTIFICATION SERVICE
# ==========================================

def create_notification(
    db: Session,
    recipient_id: uuid.UUID,
    recipient_type: str,  # 'staff' | 'customer'
    type: str,
    title: str,
    message: str,
    link: Optional[str] = None,
) -> Notification:
    """
    Creates an in-app notification record.
    """
    notification = Notification(
        recipient_id=recipient_id,
        recipient_type=recipient_type,
        type=type,
        title=title,
        message=message,
        link=link,
    )
    db.add(notification)
    return notification


# ==========================================
# 2. SWAPPABLE EMAIL PROVIDER INTERFACE & IMPLEMENTATIONS
# ==========================================

class EmailProvider(abc.ABC):
    @abc.abstractmethod
    def send_email(
        self,
        to_email: str,
        subject: str,
        body_text: str,
        body_html: Optional[str] = None,
    ) -> bool:
        pass


class LogOnlyEmailService(EmailProvider):
    """
    Zero-dependency log-only email provider for dev, staging, and local environments.
    Outputs dispatch details to structured logs without incurring paid API charges.
    """
    def send_email(
        self,
        to_email: str,
        subject: str,
        body_text: str,
        body_html: Optional[str] = None,
    ) -> bool:
        logger.info(
            f"[EMAIL DISPATCH] To: {to_email} | Subject: '{subject}' | Message: {body_text}"
        )
        return True


class BrevoEmailService(EmailProvider):
    """
    Transactional email provider backed by Brevo v3 HTTP API.
    Operates within the free tier (300 emails/day) with zero card required.
    """
    def __init__(self, api_key: str, from_email: str, from_name: str):
        self.api_key = api_key
        self.from_email = from_email
        self.from_name = from_name

    def send_email(
        self,
        to_email: str,
        subject: str,
        body_text: str,
        body_html: Optional[str] = None,
    ) -> bool:
        if not self.api_key or not self.api_key.strip():
            logger.warning("[BREVO] API key is empty; falling back to log-only dispatch.")
            logger.info(f"[EMAIL DISPATCH] To: {to_email} | Subject: '{subject}' | Message: {body_text}")
            return True

        logger.info(
            f"[BREVO EMAIL] Dispatching email to {to_email} via Brevo HTTP API. "
            "(Free-tier quota notice: 300 emails/day)."
        )
        url = "https://api.brevo.com/v3/smtp/email"
        headers = {
            "api-key": self.api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        payload = {
            "sender": {"name": self.from_name, "email": self.from_email},
            "to": [{"email": to_email}],
            "subject": subject,
            "textContent": body_text,
        }
        if body_html:
            payload["htmlContent"] = body_html
        else:
            payload["htmlContent"] = f"<div>{body_text.replace(chr(10), '<br/>')}</div>"

        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.post(url, json=payload, headers=headers)
                if resp.status_code in (200, 201, 202):
                    logger.info(f"[BREVO EMAIL SUCCESS] Successfully sent email to {to_email}")
                    return True
                else:
                    logger.error(
                        f"[BREVO EMAIL ERROR] HTTP {resp.status_code} from Brevo API: {resp.text}"
                    )
                    return False
        except Exception as e:
            logger.error(f"[BREVO EMAIL EXCEPTION] Failed to dispatch email to {to_email}: {str(e)}")
            return False


def get_email_service() -> EmailProvider:
    if settings.BREVO_API_KEY and settings.BREVO_API_KEY.strip():
        return BrevoEmailService(
            api_key=settings.BREVO_API_KEY.strip(),
            from_email=settings.EMAIL_FROM,
            from_name=settings.EMAIL_FROM_NAME,
        )
    return LogOnlyEmailService()


class EmailServiceProxy(EmailProvider):
    """Dynamically routes email dispatches through the active configured provider."""
    def send_email(
        self,
        to_email: str,
        subject: str,
        body_text: str,
        body_html: Optional[str] = None,
    ) -> bool:
        provider = get_email_service()
        return provider.send_email(
            to_email=to_email,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
        )


# Global default instance
email_service: EmailProvider = EmailServiceProxy()


# ==========================================
# 3. SCHEDULED CALLABLE HELPERS (FOR PHASE 16)
# ==========================================

def check_low_stock_alerts(db: Session) -> List[Notification]:
    """
    Callable helper for Phase 16 scheduler:
    Scans products where current_stock <= min_stock and generates notifications for admin staff.
    """
    from app.modules.auth.models import StaffRole, StaffUser
    from app.modules.catalog.models import Product

    low_stock_products = (
        db.query(Product)
        .filter(Product.is_active == True, Product.current_stock <= Product.min_stock)
        .all()
    )

    if not low_stock_products:
        return []

    admins = (
        db.query(StaffUser)
        .filter(StaffUser.is_active == True, StaffUser.role.in_([StaffRole.SUPER_ADMIN.value, StaffRole.ADMIN.value, StaffRole.MANAGER.value]))
        .all()
    )

    created = []
    for product in low_stock_products:
        msg = f"Product '{product.name}' (SKU: {product.sku}) is low on stock: {product.current_stock} remaining (Min: {product.min_stock})."
        for admin in admins:
            notif = create_notification(
                db=db,
                recipient_id=admin.id,
                recipient_type="staff",
                type="low_stock",
                title=f"Low Stock Alert: {product.sku}",
                message=msg,
                link="/staff/inventory",
            )
            created.append(notif)

    return created


def check_emi_due_alerts(db: Session, days_ahead: int = 3) -> List[Notification]:
    """
    Callable helper for Phase 16 scheduler:
    Scans upcoming pending installments within `days_ahead` and generates customer alerts.
    """
    from app.modules.emi.models import EmiInstallment, EmiPlan

    target_date = date.today() + timedelta(days=days_ahead)
    installments = (
        db.query(EmiInstallment)
        .join(EmiPlan, EmiInstallment.emi_plan_id == EmiPlan.id)
        .filter(
            EmiInstallment.status == "pending",
            EmiInstallment.due_date <= target_date,
            EmiInstallment.due_date >= date.today(),
        )
        .all()
    )

    created = []
    for inst in installments:
        plan = inst.emi_plan
        msg = f"Your EMI installment #{inst.installment_number} of ₹{inst.amount_due} is due on {inst.due_date}."
        notif = create_notification(
            db=db,
            recipient_id=plan.customer_id,
            recipient_type="customer",
            type="emi_due",
            title="Upcoming EMI Payment Due",
            message=msg,
            link="/portal/emi",
        )
        created.append(notif)

    return created


def check_warranty_expiring_alerts(db: Session, days_ahead: int = 14) -> List[Notification]:
    """
    Callable helper for Phase 16 scheduler:
    Scans active warranties expiring within `days_ahead` and generates customer notifications.
    """
    from app.modules.support.models import Warranty

    target_date = date.today() + timedelta(days=days_ahead)
    warranties = (
        db.query(Warranty)
        .filter(
            Warranty.is_claimed == False,
            Warranty.end_date <= target_date,
            Warranty.end_date >= date.today(),
        )
        .all()
    )

    created = []
    for w in warranties:
        p_name = w.product.name if w.product else "Product"
        msg = f"Your warranty coverage for '{p_name}' will expire on {w.end_date}."
        notif = create_notification(
            db=db,
            recipient_id=w.customer_id,
            recipient_type="customer",
            type="warranty_expiring",
            title="Warranty Expiring Soon",
            message=msg,
            link="/portal/warranty",
        )
        created.append(notif)

    return created
