import logging
from typing import Any, Dict
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("app.errors")


def create_error_response(code: str, message: str, details: Any = None) -> Dict[str, Any]:
    response = {
        "error": {
            "code": code,
            "message": message,
        }
    }
    if details is not None:
        response["error"]["details"] = details
    return response


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        code_map = {
            status.HTTP_400_BAD_REQUEST: "BAD_REQUEST",
            status.HTTP_401_UNAUTHORIZED: "UNAUTHORIZED",
            status.HTTP_403_FORBIDDEN: "FORBIDDEN",
            status.HTTP_404_NOT_FOUND: "NOT_FOUND",
            status.HTTP_405_METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
            status.HTTP_409_CONFLICT: "CONFLICT",
            status.HTTP_422_UNPROCESSABLE_ENTITY: "UNPROCESSABLE_ENTITY",
            status.HTTP_500_INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
            status.HTTP_503_SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
        }
        error_code = code_map.get(exc.status_code, f"HTTP_{exc.status_code}")
        message = exc.detail if isinstance(exc.detail, str) else "An HTTP error occurred."
        details = exc.detail if not isinstance(exc.detail, str) else None

        return JSONResponse(
            status_code=exc.status_code,
            content=create_error_response(code=error_code, message=message, details=details),
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        # Format validation errors cleanly without raw internals
        formatted_errors = []
        for err in exc.errors():
            loc = " -> ".join(str(item) for item in err.get("loc", []))
            formatted_errors.append(
                {
                    "location": loc,
                    "message": err.get("msg", "Invalid input"),
                    "type": err.get("type", "value_error"),
                }
            )

        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=create_error_response(
                code="VALIDATION_ERROR",
                message="Request validation failed.",
                details=formatted_errors,
            ),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.error(
            f"Unhandled exception on {request.method} {request.url.path}: {exc.__class__.__name__}",
            exc_info=True,
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=create_error_response(
                code="INTERNAL_SERVER_ERROR",
                message="An unexpected internal server error occurred.",
            ),
        )
