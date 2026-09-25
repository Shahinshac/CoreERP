import logging
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional, Set
import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.cloudinary import (
    check_cloudinary_usage,
    delete_resources,
    is_cloudinary_configured,
    list_resources,
)
from app.modules.audit.service import log_audit_event
from app.modules.auth.models import Customer, StaffRole, StaffUser
from app.modules.automation.models import AutomationJobRun
from app.modules.automation.schemas import JobExecutionResult
from app.modules.catalog.models import Product
from app.modules.emi.models import EmiInstallment, EmiInstallmentStatus, EmiPlan, EmiPlanStatus
from app.modules.hr.models import SalaryRecord, SalaryRecordStatus
from app.modules.notifications.models import Notification
from app.modules.notifications.service import create_notification, email_service
from app.modules.support.models import SupportTicket, Warranty

logger = logging.getLogger("app.automation")


# ==========================================
# 1. LOW STOCK CHECK (IDEMPOTENT, 24H WINDOW)
# ==========================================

def run_low_stock_check(db: Session) -> Dict[str, Any]:
    """
    Scans products where current_stock <= min_stock.
    Idempotency: Prevents duplicate notifications by checking if an unread 'low_stock'
    notification for the same product was dispatched to the staff member within the last 24 hours.
    """
    low_stock_products = (
        db.query(Product)
        .filter(Product.is_active == True, Product.current_stock <= Product.min_stock)
        .all()
    )

    if not low_stock_products:
        return {
            "products_checked": 0,
            "low_stock_detected": 0,
            "notifications_created": 0,
            "skipped_deduplicated": 0,
        }

    admins = (
        db.query(StaffUser)
        .filter(
            StaffUser.is_active == True,
            StaffUser.role.in_([
                StaffRole.SUPER_ADMIN.value,
                StaffRole.ADMIN.value,
                StaffRole.MANAGER.value,
            ]),
        )
        .all()
    )

    created_count = 0
    skipped_count = 0
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    for product in low_stock_products:
        for admin in admins:
            # Deduplication check: existing unread low_stock notification within 24h
            existing = (
                db.query(Notification)
                .filter(
                    Notification.recipient_id == admin.id,
                    Notification.type == "low_stock",
                    Notification.read_at.is_(None),
                    Notification.created_at >= cutoff,
                    Notification.message.like(f"%'{product.name}'%"),
                )
                .first()
            )

            if existing:
                skipped_count += 1
                continue

            msg = (
                f"Product '{product.name}' (SKU: {product.sku}) is low on stock: "
                f"{product.current_stock} remaining (Min threshold: {product.min_stock})."
            )
            create_notification(
                db=db,
                recipient_id=admin.id,
                recipient_type="staff",
                type="low_stock",
                title=f"Low Stock Alert: {product.sku}",
                message=msg,
                link="/staff/inventory",
            )
            created_count += 1

    return {
        "products_checked": len(low_stock_products),
        "low_stock_detected": len(low_stock_products),
        "notifications_created": created_count,
        "skipped_deduplicated": skipped_count,
    }


# ==========================================
# 2. EMI DUE AND OVERDUE CHECK
# ==========================================

def run_emi_due_and_overdue_check(db: Session, today: Optional[date] = None) -> Dict[str, Any]:
    """
    1. Due Soon: Alerts customers for pending installments due within 3 days.
       Deduplication: Checks if an 'emi_due' notification was sent for this installment in the last 72 hours.
    2. Overdue Transition: Persists status transition for past-due installments.
       - If overdue > 90 days: transitions to 'defaulted'
       - Else: transitions to 'overdue'
       - Alerts customer & admin staff. Deduplication: max 1 alert per 7-day window.
    """
    if today is None:
        today = date.today()

    due_window = today + timedelta(days=3)
    due_notifications_sent = 0
    overdue_transitioned = 0
    overdue_notifications_sent = 0
    skipped_dedup = 0

    # 1. UPCOMING DUE (Next 3 days)
    upcoming_installments = (
        db.query(EmiInstallment)
        .join(EmiPlan, EmiInstallment.emi_plan_id == EmiPlan.id)
        .filter(
            EmiInstallment.status == EmiInstallmentStatus.PENDING.value,
            EmiInstallment.due_date >= today,
            EmiInstallment.due_date <= due_window,
        )
        .all()
    )

    cutoff_72h = datetime.now(timezone.utc) - timedelta(hours=72)
    for inst in upcoming_installments:
        plan = inst.plan
        # Check if customer already received an emi_due notification recently for this installment
        existing_due = (
            db.query(Notification)
            .filter(
                Notification.recipient_id == plan.customer_id,
                Notification.type == "emi_due",
                Notification.created_at >= cutoff_72h,
                Notification.message.like(f"%installment #{inst.installment_number}%"),
            )
            .first()
        )
        if existing_due:
            skipped_dedup += 1
            continue

        msg = (
            f"Your EMI installment #{inst.installment_number} of ₹{inst.amount_due} "
            f"for plan #{str(plan.id)[:8]} is due on {inst.due_date}."
        )
        create_notification(
            db=db,
            recipient_id=plan.customer_id,
            recipient_type="customer",
            type="emi_due",
            title="Upcoming EMI Payment Due",
            message=msg,
            link="/portal/emi",
        )
        due_notifications_sent += 1

    # 2. OVERDUE TRANSITIONS (Past due date and unpaid/partially paid)
    past_due_installments = (
        db.query(EmiInstallment)
        .join(EmiPlan, EmiInstallment.emi_plan_id == EmiPlan.id)
        .filter(
            EmiInstallment.status.in_([
                EmiInstallmentStatus.PENDING.value,
                EmiInstallmentStatus.PARTIAL.value,
            ]),
            EmiInstallment.due_date < today,
        )
        .all()
    )

    cutoff_7d = datetime.now(timezone.utc) - timedelta(days=7)
    admins = (
        db.query(StaffUser)
        .filter(
            StaffUser.is_active == True,
            StaffUser.role.in_([StaffRole.SUPER_ADMIN.value, StaffRole.ADMIN.value, StaffRole.MANAGER.value]),
        )
        .all()
    )

    for inst in past_due_installments:
        days_overdue = (today - inst.due_date).days
        new_status = (
            EmiInstallmentStatus.DEFAULTED.value
            if days_overdue > 90
            else EmiInstallmentStatus.OVERDUE.value
        )
        inst.status = new_status
        overdue_transitioned += 1

        plan = inst.plan
        # Check if customer already received an emi_overdue notification for this installment in last 7 days
        existing_overdue = (
            db.query(Notification)
            .filter(
                Notification.recipient_id == plan.customer_id,
                Notification.type == "emi_overdue",
                Notification.created_at >= cutoff_7d,
                Notification.message.like(f"%installment #{inst.installment_number}%"),
            )
            .first()
        )

        if not existing_overdue:
            msg_cust = (
                f"Your EMI installment #{inst.installment_number} of ₹{inst.amount_due} "
                f"is {days_overdue} days overdue (Due Date: {inst.due_date}). Please pay promptly."
            )
            create_notification(
                db=db,
                recipient_id=plan.customer_id,
                recipient_type="customer",
                type="emi_overdue",
                title="Overdue EMI Payment Notice",
                message=msg_cust,
                link="/portal/emi",
            )
            overdue_notifications_sent += 1

            # Also notify staff
            for admin in admins:
                create_notification(
                    db=db,
                    recipient_id=admin.id,
                    recipient_type="staff",
                    type="emi_overdue",
                    title=f"EMI Overdue Alert: Plan #{str(plan.id)[:8]}",
                    message=f"Plan #{str(plan.id)[:8]} (Customer {plan.customer_id}) installment #{inst.installment_number} is {days_overdue} days overdue.",
                    link=f"/staff/emi/{plan.id}",
                )

    db.flush()

    return {
        "due_notifications_sent": due_notifications_sent,
        "overdue_installments_transitioned": overdue_transitioned,
        "overdue_notifications_sent": overdue_notifications_sent,
        "skipped_deduplicated": skipped_dedup,
    }


# ==========================================
# 3. EMI DEFAULT TRANSITION (PHASE 9 RULE)
# ==========================================

def run_emi_default_transition(db: Session, today: Optional[date] = None) -> Dict[str, Any]:
    """
    Applies the Phase 9 documented default rule:
    - Default condition: 3 or more overdue/defaulted installments, OR any installment > 90 days overdue.
    - Transitions active plan to 'defaulted'.
    - Dispatches notifications to customer and staff.
    Idempotent: Only acts on plans currently in 'active' status.
    """
    if today is None:
        today = date.today()

    active_plans = (
        db.query(EmiPlan)
        .filter(EmiPlan.status == EmiPlanStatus.ACTIVE.value)
        .all()
    )

    plans_defaulted = 0
    admins = (
        db.query(StaffUser)
        .filter(
            StaffUser.is_active == True,
            StaffUser.role.in_([StaffRole.SUPER_ADMIN.value, StaffRole.ADMIN.value, StaffRole.MANAGER.value]),
        )
        .all()
    )

    for plan in active_plans:
        overdue_count = 0
        has_90_day_default = False

        for inst in plan.installments:
            is_unpaid = inst.amount_paid < inst.amount_due
            if is_unpaid and inst.due_date < today:
                days_overdue = (today - inst.due_date).days
                if days_overdue > 90:
                    has_90_day_default = True
                    overdue_count += 1
                else:
                    overdue_count += 1

        if has_90_day_default or overdue_count >= 3:
            plan.status = EmiPlanStatus.DEFAULTED.value
            plans_defaulted += 1

            # Notify customer
            msg_cust = (
                f"Your EMI Plan #{str(plan.id)[:8]} has entered default status due to "
                f"{overdue_count} overdue installment(s). Please contact support immediately."
            )
            create_notification(
                db=db,
                recipient_id=plan.customer_id,
                recipient_type="customer",
                type="emi_defaulted",
                title="EMI Plan Defaulted",
                message=msg_cust,
                link="/portal/emi",
            )

            # Notify staff
            for admin in admins:
                create_notification(
                    db=db,
                    recipient_id=admin.id,
                    recipient_type="staff",
                    type="emi_defaulted",
                    title=f"Plan Defaulted: #{str(plan.id)[:8]}",
                    message=f"EMI Plan #{str(plan.id)[:8]} defaulted (Overdue count: {overdue_count}, >90d: {has_90_day_default}).",
                    link=f"/staff/emi/{plan.id}",
                )

    db.flush()

    return {
        "active_plans_evaluated": len(active_plans),
        "plans_defaulted": plans_defaulted,
    }


# ==========================================
# 4. WARRANTY EXPIRING CHECK (30D & 7D WINDOWS)
# ==========================================

def run_warranty_expiring_check(db: Session, today: Optional[date] = None) -> Dict[str, Any]:
    """
    Scans active, unclaimed warranties expiring within 30 days or 7 days.
    Deduplication:
    - 30-day notice: max once per 14-day window.
    - 7-day urgent notice: max once per 5-day window.
    """
    if today is None:
        today = date.today()

    window_30d = today + timedelta(days=30)
    warranties = (
        db.query(Warranty)
        .filter(
            Warranty.is_claimed == False,
            Warranty.end_date >= today,
            Warranty.end_date <= window_30d,
        )
        .all()
    )

    notifications_sent = 0
    skipped_count = 0
    cutoff_14d = datetime.now(timezone.utc) - timedelta(days=14)
    cutoff_5d = datetime.now(timezone.utc) - timedelta(days=5)

    for w in warranties:
        days_remaining = (w.end_date - today).days
        p_name = w.product.name if w.product else "Product"

        if days_remaining <= 7:
            # 7-day urgent window
            existing = (
                db.query(Notification)
                .filter(
                    Notification.recipient_id == w.customer_id,
                    Notification.type == "warranty_expiring",
                    Notification.created_at >= cutoff_5d,
                    Notification.message.like(f"%'{p_name}'%"),
                )
                .first()
            )
            if existing:
                skipped_count += 1
                continue

            msg = (
                f"Urgent: Your warranty coverage for '{p_name}' expires in "
                f"{days_remaining} day(s) on {w.end_date}."
            )
            create_notification(
                db=db,
                recipient_id=w.customer_id,
                recipient_type="customer",
                type="warranty_expiring",
                title="Warranty Expiring Soon (7 Days)",
                message=msg,
                link="/portal/warranty",
            )
            notifications_sent += 1

        else:
            # 30-day window
            existing = (
                db.query(Notification)
                .filter(
                    Notification.recipient_id == w.customer_id,
                    Notification.type == "warranty_expiring",
                    Notification.created_at >= cutoff_14d,
                    Notification.message.like(f"%'{p_name}'%"),
                )
                .first()
            )
            if existing:
                skipped_count += 1
                continue

            msg = (
                f"Your warranty coverage for '{p_name}' will expire in "
                f"{days_remaining} days on {w.end_date}."
            )
            create_notification(
                db=db,
                recipient_id=w.customer_id,
                recipient_type="customer",
                type="warranty_expiring",
                title="Warranty Expiring Soon",
                message=msg,
                link="/portal/warranty",
            )
            notifications_sent += 1

    return {
        "warranties_checked": len(warranties),
        "notifications_created": notifications_sent,
        "skipped_deduplicated": skipped_count,
    }


# ==========================================
# 5. SALARY GENERATION REMINDER (MONTH-END)
# ==========================================

def run_salary_reminder_check(db: Session, today: Optional[date] = None) -> Dict[str, Any]:
    """
    Staff confirms and approves salary generation, but near month-end (day >= 25),
    this automated check alerts Admin/Accountant staff if payroll has not been generated.
    Deduplication: max once per 5-day window.
    """
    if today is None:
        today = date.today()

    # Only trigger near month-end (day 25 onwards) or first 5 days of next month
    if today.day < 25 and today.day > 5:
        return {
            "status": "skipped",
            "reason": f"Day {today.day} is not within month-end reminder window (days 25-31 or 1-5)",
            "reminders_sent": 0,
        }

    target_month = today.month if today.day >= 25 else (today.month - 1 or 12)
    target_year = today.year if today.day >= 25 or today.month > 1 else today.year - 1

    target_period = f"{target_year}-{target_month:02d}"

    # Check if salary records already exist for target period
    records_count = (
        db.query(func.count(SalaryRecord.id))
        .filter(SalaryRecord.period == target_period)
        .scalar()
        or 0
    )

    if records_count > 0:
        return {
            "status": "already_generated",
            "target_period": f"{target_year}-{target_month:02d}",
            "existing_records": records_count,
            "reminders_sent": 0,
        }

    # Deduplication: check if reminder was sent in last 5 days
    cutoff_5d = datetime.now(timezone.utc) - timedelta(days=5)
    admins = (
        db.query(StaffUser)
        .filter(
            StaffUser.is_active == True,
            StaffUser.role.in_([
                StaffRole.SUPER_ADMIN.value,
                StaffRole.ADMIN.value,
                StaffRole.MANAGER.value,
                StaffRole.ACCOUNTANT.value,
            ]),
        )
        .all()
    )

    reminders_sent = 0
    skipped_count = 0

    for admin in admins:
        existing = (
            db.query(Notification)
            .filter(
                Notification.recipient_id == admin.id,
                Notification.type == "salary_reminder",
                Notification.created_at >= cutoff_5d,
                Notification.message.like(f"%{target_year}-{target_month:02d}%"),
            )
            .first()
        )
        if existing:
            skipped_count += 1
            continue

        msg = (
            f"Monthly payroll for period {target_year}-{target_month:02d} is pending generation. "
            f"Please review staff attendance and confirm salary records."
        )
        create_notification(
            db=db,
            recipient_id=admin.id,
            recipient_type="staff",
            type="salary_reminder",
            title=f"Payroll Reminder: {target_year}-{target_month:02d}",
            message=msg,
            link="/staff/salaries",
        )
        reminders_sent += 1

    return {
        "status": "reminder_dispatched",
        "target_period": f"{target_year}-{target_month:02d}",
        "reminders_sent": reminders_sent,
        "skipped_deduplicated": skipped_count,
    }


# ==========================================
# 6. ORPHANED STORAGE ASSET CLEANUP
# ==========================================

async def run_orphaned_storage_cleanup(
    db: Session,
    dry_run: bool = True,
    scanned_storage_keys: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Identifies storage assets that are no longer referenced by any active database entity.
    - Database references: Product.image_path, Product.image_public_id,
      SupportTicket.attachment_path, SupportTicket.attachment_public_id.
    - Cloudinary Admin API integration: queries remote resources and monitors 25-credit free-tier pool.
    - If scanned_storage_keys is provided, evaluates against that list (mock/test friendly).
    - If dry_run=True: returns detected orphaned paths/public_ids without deleting them.
    - If dry_run=False: invokes DELETE on the remote storage service and returns deleted keys.
    """
    # 1. Gather all active DB references (both paths/URLs and public_ids)
    product_images = (
        db.query(Product.image_path, Product.image_public_id)
        .filter((Product.image_path.isnot(None)) | (Product.image_public_id.isnot(None)))
        .all()
    )
    ticket_attachments = (
        db.query(SupportTicket.attachment_path, SupportTicket.attachment_public_id)
        .filter((SupportTicket.attachment_path.isnot(None)) | (SupportTicket.attachment_public_id.isnot(None)))
        .all()
    )

    active_keys: Set[str] = set()
    for row in product_images:
        if row[0]:
            active_keys.add(str(row[0]))
        if row[1]:
            active_keys.add(str(row[1]))
    for row in ticket_attachments:
        if row[0]:
            active_keys.add(str(row[0]))
        if row[1]:
            active_keys.add(str(row[1]))

    # 2. Collect remote or provided storage keys
    remote_keys: List[str] = []
    storage_provider = "mock"
    usage_info: Optional[Dict[str, Any]] = None

    if scanned_storage_keys is not None:
        remote_keys = scanned_storage_keys
        storage_provider = "mock"
    elif is_cloudinary_configured():
        storage_provider = "cloudinary"
        try:
            # Audit account usage and surface warning if approaching 25 monthly credits
            usage_info = await check_cloudinary_usage()

            # Query Cloudinary Admin API for uploaded resources
            cld_resources = await list_resources(max_results=500, resource_type="image")
            raw_resources = await list_resources(max_results=500, resource_type="raw")
            all_resources = cld_resources + raw_resources

            remote_keys = list(dict.fromkeys([
                r.get("public_id")
                for r in all_resources
                if r.get("public_id")
            ]))
        except Exception as err:
            logger.warning(f"Unable to query Cloudinary Admin API: {err}")
    elif (
        settings.SUPABASE_URL
        and settings.SUPABASE_SERVICE_KEY
        and "your-project" not in settings.SUPABASE_URL
    ):
        storage_provider = "supabase"
        try:
            list_url = f"{settings.SUPABASE_URL.rstrip('/')}/storage/v1/object/list/catalog"
            headers = {
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
                "apikey": settings.SUPABASE_SERVICE_KEY,
            }
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(list_url, json={"prefix": "", "limit": 1000}, headers=headers)
                if resp.status_code == 200:
                    remote_keys = [item.get("name") for item in resp.json() if item.get("name")]
        except Exception as err:
            logger.warning(f"Unable to query remote Supabase storage bucket: {err}")

    # 3. Identify orphaned keys (not referenced in DB by URL, path, or public_id)
    orphaned_keys = [k for k in remote_keys if k not in active_keys]

    # 4. If not dry_run, perform deletion
    deleted_keys: List[str] = []
    if not dry_run and orphaned_keys:
        if storage_provider == "cloudinary" and is_cloudinary_configured():
            try:
                del_res = await delete_resources(orphaned_keys)
                deleted_map = del_res.get("deleted", {})
                deleted_keys = [k for k, v in deleted_map.items() if v in ("deleted", "not_found")]
                if not deleted_keys and "error" not in del_res:
                    deleted_keys = list(orphaned_keys)
            except Exception as exc:
                logger.error(f"Failed to delete orphaned Cloudinary assets: {exc}")
        elif storage_provider == "supabase":
            headers = {
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
                "apikey": settings.SUPABASE_SERVICE_KEY,
            }
            async with httpx.AsyncClient(timeout=10.0) as client:
                for key in orphaned_keys:
                    try:
                        del_url = f"{settings.SUPABASE_URL.rstrip('/')}/storage/v1/object/catalog/{key}"
                        del_resp = await client.delete(del_url, headers=headers)
                        if del_resp.status_code in (200, 204):
                            deleted_keys.append(key)
                    except Exception as exc:
                        logger.error(f"Failed to delete orphaned storage asset {key}: {exc}")
        else:
            # In mock or test runs without live credentials, mark identified orphans as processed
            deleted_keys = list(orphaned_keys)

    return {
        "dry_run": dry_run,
        "storage_provider": storage_provider,
        "active_references_count": len(active_keys),
        "total_scanned_keys": len(remote_keys),
        "orphaned_count": len(orphaned_keys),
        "orphaned_keys": orphaned_keys,
        "deleted_count": len(deleted_keys),
        "deleted_keys": deleted_keys,
        "cloudinary_usage_checked": usage_info is not None,
    }


# ==========================================
# 7. EXECUTION WRAPPER & OBSERVABILITY
# ==========================================

def execute_automation_job(
    job_name: str,
    job_func: Callable[[Session], Dict[str, Any]],
    db: Session,
) -> JobExecutionResult:
    """
    Executes an automation job inside a managed transaction, records start/end timestamps,
    computes duration, logs status, and records an AutomationJobRun history entry in DB.
    """
    start_time = datetime.now(timezone.utc)
    t0 = time.perf_counter()

    try:
        details = job_func(db)
        duration_ms = round((time.perf_counter() - t0) * 1000, 2)
        completed_at = datetime.now(timezone.utc)

        # Count items processed from common keys
        items_processed = (
            details.get("notifications_created", 0)
            + details.get("overdue_installments_transitioned", 0)
            + details.get("plans_defaulted", 0)
            + details.get("deleted_count", 0)
            + details.get("reminders_sent", 0)
        )

        job_run = AutomationJobRun(
            job_name=job_name,
            status="success",
            started_at=start_time,
            completed_at=completed_at,
            items_processed=items_processed,
            details=details,
        )
        db.add(job_run)
        log_audit_event(
            db=db,
            event_type="automation.job_run",
            description=f"Automation job '{job_name}' completed with status 'success' ({items_processed} items processed).",
            actor_type="system",
            resource_type="automation_job",
            resource_id=job_name,
            details={"status": "success", "duration_ms": duration_ms, "items_processed": items_processed},
        )
        db.commit()

        logger.info(f"[AUTOMATION JOB '{job_name}'] Success in {duration_ms}ms: {details}")

        return JobExecutionResult(
            job_name=job_name,
            status="success",
            items_processed=items_processed,
            details=details,
            started_at=start_time,
            completed_at=completed_at,
            duration_ms=duration_ms,
        )

    except Exception as err:
        duration_ms = round((time.perf_counter() - t0) * 1000, 2)
        completed_at = datetime.now(timezone.utc)
        error_msg = str(err)

        db.rollback()
        job_run = AutomationJobRun(
            job_name=job_name,
            status="failed",
            started_at=start_time,
            completed_at=completed_at,
            items_processed=0,
            details={"error": error_msg},
            error_message=error_msg,
        )
        db.add(job_run)
        db.commit()

        logger.error(f"[AUTOMATION JOB '{job_name}'] Failed in {duration_ms}ms: {error_msg}", exc_info=True)

        return JobExecutionResult(
            job_name=job_name,
            status="failed",
            items_processed=0,
            details={"error": error_msg},
            started_at=start_time,
            completed_at=completed_at,
            duration_ms=duration_ms,
        )
