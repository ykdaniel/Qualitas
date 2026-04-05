"""
Error Handler Middleware
Sanitizes error messages to prevent information disclosure
"""
import logging
import traceback
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import HTTPException, RequestValidationError
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)

# Generic error messages that don't expose internal details
GENERIC_ERROR_MESSAGES = {
    400: "Invalid request. Please check your input.",
    401: "Authentication required. Please log in.",
    403: "You don't have permission to perform this action.",
    404: "The requested resource was not found.",
    409: "This operation conflicts with an existing resource.",
    422: "The request data is invalid or incomplete.",
    500: "An internal error occurred. Please try again later.",
    503: "The service is temporarily unavailable. Please try again later."
}


def sanitize_error_message(status_code: int, detail: str = None, is_dev: bool = False) -> str:
    """
    Sanitize error message based on status code.
    In production, returns generic messages.
    In development, can include more details.

    Args:
        status_code: HTTP status code
        detail: Original error detail
        is_dev: Whether running in development mode

    Returns:
        Sanitized error message
    """
    # For validation errors, keep some context but don't expose internals
    if status_code == 422 and detail:
        # Still sanitize but preserve field-level information
        if "field" in detail.lower() or "required" in detail.lower():
            return detail

    # In development, include original detail if available
    if is_dev and detail:
        return detail

    # In production, return generic message
    return GENERIC_ERROR_MESSAGES.get(status_code, "An error occurred.")


async def error_handler_middleware(request: Request, call_next):
    """
    Global error handler middleware for FastAPI.
    Catches all exceptions and returns sanitized responses.
    """
    try:
        response = await call_next(request)
        return response

    except HTTPException as e:
        # Log detailed error internally
        logger.warning(
            f"HTTPException: {e.status_code} - {e.detail}",
            extra={
                "path": request.url.path,
                "method": request.method,
                "status_code": e.status_code,
                "detail": e.detail
            }
        )

        # Return sanitized message to client
        from core.config import settings
        is_dev = settings.ENVIRONMENT == "development"

        sanitized_detail = sanitize_error_message(e.status_code, str(e.detail), is_dev)

        return JSONResponse(
            status_code=e.status_code,
            content={"detail": sanitized_detail}
        )

    except StarletteHTTPException as e:
        # Handle Starlette HTTP exceptions
        logger.warning(
            f"StarletteHTTPException: {e.status_code} - {e.detail}",
            extra={
                "path": request.url.path,
                "method": request.method,
                "status_code": e.status_code
            }
        )

        from core.config import settings
        is_dev = settings.ENVIRONMENT == "development"

        sanitized_detail = sanitize_error_message(e.status_code, str(e.detail), is_dev)

        return JSONResponse(
            status_code=e.status_code,
            content={"detail": sanitized_detail}
        )

    except RequestValidationError as e:
        # Log validation errors
        logger.info(
            f"Validation error: {str(e)}",
            extra={
                "path": request.url.path,
                "method": request.method,
                "errors": e.errors()
            }
        )

        # Return validation errors (these are safe to expose)
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": e.errors()}
        )

    except SQLAlchemyError as e:
        # CRITICAL: Never expose database errors to client
        logger.error(
            f"Database error: {str(e)}",
            exc_info=True,
            extra={
                "path": request.url.path,
                "method": request.method
            }
        )

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": GENERIC_ERROR_MESSAGES[500]}
        )

    except Exception as e:
        # CRITICAL: Log full exception details internally
        logger.error(
            f"Unhandled exception: {type(e).__name__}: {str(e)}",
            exc_info=True,
            extra={
                "path": request.url.path,
                "method": request.method,
                "exception_type": type(e).__name__,
                "traceback": traceback.format_exc()
            }
        )

        # Never expose internal error details
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": GENERIC_ERROR_MESSAGES[500]}
        )


def log_error_detail(error: Exception, context: str = ""):
    """
    Helper function to log error details internally.

    Args:
        error: The exception to log
        context: Additional context about where the error occurred
    """
    logger.error(
        f"{context}: {type(error).__name__}: {str(error)}",
        exc_info=True,
        extra={
            "context": context,
            "exception_type": type(error).__name__
        }
    )
