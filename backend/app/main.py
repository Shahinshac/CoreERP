import logging
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.errors import register_error_handlers
from app.core.logging import setup_logging

logger = logging.getLogger("app.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info("Application starting up...")
    yield
    logger.info("Application shutting down...")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.PROJECT_NAME,
        lifespan=lifespan,
    )

    # CORS Configuration from settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register centralized exception handlers
    register_error_handlers(app)

    @app.get("/api/ping", tags=["Health"])
    async def ping():
        """
        Lightweight liveness probe that performs no database calls.
        Used by uptime monitors and keepalive cron jobs.
        """
        return {"status": "ok"}

    @app.get("/api/health", tags=["Health"])
    def health_check(db: Session = Depends(get_db)):
        """
        Readiness check that verifies database connectivity.
        """
        try:
            db.execute(text("SELECT 1"))
            return {"status": "healthy", "database": "connected"}
        except Exception as exc:
            logger.error(f"Health check database connection failed: {exc}")
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={"status": "unhealthy", "database": "unreachable"},
            )

    return app


app = create_app()
