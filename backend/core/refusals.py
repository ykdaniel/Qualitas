"""
Coded refusals (REFUSAL-DIALOG-2026-001).

A refusal is a business "no" (still referenced, not Void yet, locked, no permission). Besides the English `detail`
it carries a stable `code` and its `params`, so the frontend can show the reason in the user's language:

    HTTP 400
    {"detail": "Cannot delete NCR 'X' with status 'Open'. Please Void the NCR first, then delete.",
     "code": "DELETE_NOT_VOID", "params": {"docType": "NCR", "number": "X", "status": "Open", "allowed": ["Void"]}}

`detail` is unchanged, so every caller that reads it as a string keeps working.

- Services raise `Refusal(code, message, **params)`. It IS a ValueError, so a router that still maps ValueError -> 400
  with `str(e)` answers exactly as before (no code, same detail).
- core.scope.ScopeForbidden (403) carries a code the same way (`Coded`) but is NOT a ValueError, so a router's
  `except ValueError` never turns it into a 400 (REFUSAL-DIALOG-2026-002).
- Routers turn it into HTTP with `refusal_http(e, status)`; anything that is not coded maps exactly as the old
  `HTTPException(status, detail=str(e))` did.
- `refusal_exception_handler` (registered in main.py) writes `code` and `params` next to `detail`. Without the handler
  a RefusalHTTPException is still an HTTPException and answers `{"detail": ...}`.

`params` must be JSON-serialisable (str / int / list / dict).
"""
from typing import Any, Dict, Optional

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


class Coded:
    """A stable `code` and its `params` next to the English message (shared by Refusal and core.scope.ScopeForbidden)."""
    def __init__(self, code: str, message: str, **params: Any):
        super().__init__(message)
        self.code = code
        self.params: Dict[str, Any] = params


class Refusal(Coded, ValueError):
    pass


class RefusalHTTPException(HTTPException):
    def __init__(self, status_code: int, detail: str, code: str, params: Optional[Dict[str, Any]] = None,
                 headers: Optional[Dict[str, str]] = None):
        super().__init__(status_code=status_code, detail=detail, headers=headers)
        self.code = code
        self.params: Dict[str, Any] = params or {}


def refusal_http(exc: Exception, status_code: int = 400) -> HTTPException:
    """The HTTP form of a service refusal: coded when it carries a code (a Refusal, a ScopeForbidden), else the plain
    `HTTPException(status, str(e))`."""
    if isinstance(exc, Coded):
        return RefusalHTTPException(status_code, str(exc), exc.code, exc.params)
    return HTTPException(status_code=status_code, detail=str(exc))


def permission_denied(detail: str, *permissions: str) -> RefusalHTTPException:
    """403 for a missing permission code (same English text as before)."""
    return RefusalHTTPException(403, detail, 'PERMISSION_DENIED', {'permissions': list(permissions)})


async def refusal_exception_handler(request: Request, exc: RefusalHTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={'detail': exc.detail, 'code': exc.code, 'params': exc.params},
        headers=getattr(exc, 'headers', None),
    )
