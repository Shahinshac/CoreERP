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


class SecurityHeadersMiddleware:
    """ASGI middleware injecting standard security headers into all HTTP responses."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                header_names = {h[0].lower() for h in headers}
                if b"x-content-type-options" not in header_names:
                    headers.append((b"x-content-type-options", b"nosniff"))
                if b"x-frame-options" not in header_names:
                    headers.append((b"x-frame-options", b"DENY"))
                if b"referrer-policy" not in header_names:
                    headers.append((b"referrer-policy", b"strict-origin-when-cross-origin"))
                if b"permissions-policy" not in header_names:
                    headers.append((b"permissions-policy", b"geolocation=(), camera=(), microphone=()"))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_wrapper)


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.PROJECT_NAME,
        lifespan=lifespan,
    )

    # Security Headers Middleware
    app.add_middleware(SecurityHeadersMiddleware)

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

    from app.modules.auth.customer_routes import staff_customer_router
    from app.modules.auth.routes import customer_auth_router, staff_auth_router, staff_sessions_router
    from app.modules.catalog.routes import catalog_router
    from app.modules.inventory.routes import inventory_router
    from app.modules.invoicing.routes import router as invoicing_router
    from app.modules.payments.routes import router as payments_router
    from app.modules.emi.routes import emi_router
    from app.modules.hr.routes import hr_router
    from app.modules.finance.routes import finance_router
    from app.modules.reports.routes import reports_router
    from app.modules.sales.routes import pos_router
    from app.modules.sales.cash_drawer_routes import cash_drawer_router
    from app.modules.portal.routes import portal_router
    from app.modules.support.routes import support_router
    from app.modules.notifications.routes import notifications_router
    from app.modules.automation.routes import automation_router
    from app.modules.audit.routes import audit_router
    from app.modules.search.routes import search_router
    from app.modules.reports.dashboard_routes import dashboard_router

    app.include_router(staff_auth_router)
    app.include_router(staff_sessions_router)
    app.include_router(customer_auth_router)
    app.include_router(staff_customer_router)
    app.include_router(catalog_router)
    app.include_router(inventory_router)
    app.include_router(pos_router)
    app.include_router(cash_drawer_router)
    app.include_router(invoicing_router)
    app.include_router(payments_router)
    app.include_router(emi_router, prefix="/api/emi")
    app.include_router(hr_router, prefix="/api/hr")
    app.include_router(finance_router, prefix="/api/finance")
    app.include_router(reports_router)
    app.include_router(dashboard_router)
    app.include_router(portal_router)
    app.include_router(support_router)
    app.include_router(notifications_router)
    app.include_router(automation_router)
    app.include_router(audit_router)
    app.include_router(search_router)

    return app


app = create_app()
