import asyncio
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.modules.automation.models import AutomationJobRun
from app.modules.automation.schemas import (
    AllJobsExecutionResult,
    JobExecutionResult,
    JobStatusItem,
    OrphanedStorageCleanupRequest,
    SystemAutomationStatus,
)
from app.modules.automation.security import verify_automation_secret
from app.modules.automation.service import (
    execute_automation_job,
    run_emi_default_transition,
    run_emi_due_and_overdue_check,
    run_low_stock_check,
    run_orphaned_storage_cleanup,
    run_salary_reminder_check,
    run_warranty_expiring_check,
)

automation_router = APIRouter(
    prefix="/api/automation",
    tags=["Automation & Scheduled Jobs"],
    dependencies=[Depends(verify_automation_secret)],
)


# ==========================================
# 1. LOW STOCK NOTIFICATIONS JOB
# ==========================================

@automation_router.post(
    "/jobs/low-stock",
    response_model=JobExecutionResult,
    summary="Low stock notification check (idempotent 24h window)",
)
def trigger_low_stock_job(db: Session = Depends(get_db)):
    return execute_automation_job("low_stock", run_low_stock_check, db)


# ==========================================
# 2. EMI DUE AND OVERDUE CHECK
# ==========================================

@automation_router.post(
    "/jobs/emi-due-overdue",
    response_model=JobExecutionResult,
    summary="EMI due alerts & overdue status transitions",
)
def trigger_emi_due_overdue_job(db: Session = Depends(get_db)):
    return execute_automation_job("emi_due_overdue", run_emi_due_and_overdue_check, db)


# ==========================================
# 3. EMI DEFAULT TRANSITION (PHASE 9 RULE)
# ==========================================

@automation_router.post(
    "/jobs/emi-default",
    response_model=JobExecutionResult,
    summary="EMI default status transition (>90d or >=3 overdue)",
)
def trigger_emi_default_job(db: Session = Depends(get_db)):
    return execute_automation_job("emi_default", run_emi_default_transition, db)


# ==========================================
# 4. WARRANTY EXPIRING NOTIFICATIONS (30D & 7D)
# ==========================================

@automation_router.post(
    "/jobs/warranty-expiring",
    response_model=JobExecutionResult,
    summary="Warranty expiration alerts (30d and 7d thresholds)",
)
def trigger_warranty_expiring_job(db: Session = Depends(get_db)):
    return execute_automation_job("warranty_expiring", run_warranty_expiring_check, db)


# ==========================================
# 5. SALARY GENERATION REMINDER
# ==========================================

@automation_router.post(
    "/jobs/salary-reminder",
    response_model=JobExecutionResult,
    summary="Month-end payroll generation reminder to staff",
)
def trigger_salary_reminder_job(db: Session = Depends(get_db)):
    return execute_automation_job("salary_reminder", run_salary_reminder_check, db)


# ==========================================
# 6. ORPHANED STORAGE ASSET CLEANUP
# ==========================================

@automation_router.post(
    "/jobs/orphaned-storage-cleanup",
    response_model=JobExecutionResult,
    summary="Identify & clean up orphaned storage objects (dry-run by default)",
)
def trigger_orphaned_storage_cleanup_job(
    payload: Optional[OrphanedStorageCleanupRequest] = None,
    dry_run: bool = Query(True, description="When true, identifies orphaned assets without deleting"),
    db: Session = Depends(get_db),
):
    effective_dry_run = payload.dry_run if payload is not None else dry_run
    scanned_keys = payload.scanned_storage_keys if payload is not None else None

    def _job_wrapper(session: Session):
        # Run async function in synchronous wrapper
        return asyncio.run(
            run_orphaned_storage_cleanup(
                session,
                dry_run=effective_dry_run,
                scanned_storage_keys=scanned_keys,
            )
        )

    return execute_automation_job("orphaned_storage_cleanup", _job_wrapper, db)


# ==========================================
# 7. RUN ALL SCHEDULED JOBS (DAILY CRON TARGET)
# ==========================================

@automation_router.post(
    "/jobs/run-all",
    response_model=AllJobsExecutionResult,
    summary="Execute all scheduled checks sequentially",
)
def trigger_all_jobs(db: Session = Depends(get_db)):
    results: List[JobExecutionResult] = [
        execute_automation_job("low_stock", run_low_stock_check, db),
        execute_automation_job("emi_due_overdue", run_emi_due_and_overdue_check, db),
        execute_automation_job("emi_default", run_emi_default_transition, db),
        execute_automation_job("warranty_expiring", run_warranty_expiring_check, db),
        execute_automation_job("salary_reminder", run_salary_reminder_check, db),
    ]

    successful = sum(1 for r in results if r.status == "success")
    failed = sum(1 for r in results if r.status == "failed")

    return AllJobsExecutionResult(
        status="success" if failed == 0 else ("partial" if successful > 0 else "failed"),
        total_jobs=len(results),
        successful_jobs=successful,
        failed_jobs=failed,
        jobs=results,
    )


# ==========================================
# 8. JOB STATUS AND OBSERVABILITY
# ==========================================

KNOWN_JOBS = [
    "low_stock",
    "emi_due_overdue",
    "emi_default",
    "warranty_expiring",
    "salary_reminder",
    "orphaned_storage_cleanup",
]


@automation_router.get(
    "/jobs/status",
    response_model=SystemAutomationStatus,
    summary="Observability: Latest status and execution timestamp per job",
)
def get_jobs_status(db: Session = Depends(get_db)):
    total_runs = db.query(func.count(AutomationJobRun.id)).scalar() or 0
    job_statuses: List[JobStatusItem] = []

    for name in KNOWN_JOBS:
        last_run = (
            db.query(AutomationJobRun)
            .filter(AutomationJobRun.job_name == name)
            .order_by(desc(AutomationJobRun.started_at))
            .first()
        )
        if last_run:
            job_statuses.append(
                JobStatusItem(
                    job_name=name,
                    last_run_at=last_run.started_at,
                    last_status=last_run.status,
                    last_items_processed=last_run.items_processed,
                    last_details=last_run.details,
                    last_error=last_run.error_message,
                )
            )
        else:
            job_statuses.append(
                JobStatusItem(
                    job_name=name,
                    last_run_at=None,
                    last_status="never_run",
                    last_items_processed=0,
                    last_details=None,
                    last_error=None,
                )
            )

    return SystemAutomationStatus(
        server_time=datetime.now(timezone.utc),
        total_runs_recorded=total_runs,
        jobs=job_statuses,
    )
