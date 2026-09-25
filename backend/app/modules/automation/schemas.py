from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class JobRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    job_name: str
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    items_processed: int
    details: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None


class JobExecutionResult(BaseModel):
    job_name: str
    status: str
    items_processed: int
    details: Dict[str, Any]
    started_at: datetime
    completed_at: datetime
    duration_ms: float


class AllJobsExecutionResult(BaseModel):
    status: str
    total_jobs: int
    successful_jobs: int
    failed_jobs: int
    jobs: List[JobExecutionResult]


class JobStatusItem(BaseModel):
    job_name: str
    last_run_at: Optional[datetime] = None
    last_status: Optional[str] = None
    last_items_processed: Optional[int] = None
    last_details: Optional[Dict[str, Any]] = None
    last_error: Optional[str] = None


class SystemAutomationStatus(BaseModel):
    server_time: datetime
    total_runs_recorded: int
    jobs: List[JobStatusItem]


class OrphanedStorageCleanupRequest(BaseModel):
    dry_run: bool = True
    scanned_storage_keys: Optional[List[str]] = Field(
        default=None,
        description="Optional list of storage keys to simulate/override remote bucket listing (useful for tests/mock environments)",
    )
