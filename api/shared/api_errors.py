"""Uniform JSON error bodies ``{"code", "message"}`` for the Ninja API."""

from http import HTTPStatus

from django.http import HttpRequest, HttpResponse
from ninja import NinjaAPI
from ninja.errors import AuthenticationError, HttpError, ValidationError
from ninja.utils import check_csrf


class ApiError(Exception):
    def __init__(
        self, status: int, code: str, message: str, headers: dict[str, str] | None = None
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.headers = headers or {}


def enforce_csrf(request: HttpRequest) -> None:
    """Ninja only checks CSRF for cookie-authenticated routes; call this on anonymous POSTs."""
    if check_csrf(request) is not None:
        raise ApiError(HTTPStatus.FORBIDDEN, "csrf_failed", "CSRF token missing or incorrect")


def _respond(api: NinjaAPI, request: HttpRequest, error: ApiError) -> HttpResponse:
    response = api.create_response(
        request, {"code": error.code, "message": error.message}, status=error.status
    )
    for name, value in error.headers.items():
        response[name] = value
    return response


def _validation_code(exc: ValidationError) -> str:
    fields = {part for error in exc.errors for part in error.get("loc", ())}
    if "phone" in fields:
        return "invalid_phone"
    if "code" in fields:
        return "invalid_code"
    return "invalid_request"


def register_error_handlers(api: NinjaAPI) -> None:
    @api.exception_handler(ApiError)
    def api_error(request, exc: ApiError):
        return _respond(api, request, exc)

    @api.exception_handler(ValidationError)
    def validation_error(request, exc: ValidationError):
        error = ApiError(HTTPStatus.BAD_REQUEST, _validation_code(exc), "Request body is invalid")
        return _respond(api, request, error)

    @api.exception_handler(AuthenticationError)
    def unauthenticated(request, exc: AuthenticationError):
        error = ApiError(HTTPStatus.UNAUTHORIZED, "unauthenticated", "Authentication required")
        return _respond(api, request, error)

    @api.exception_handler(HttpError)
    def http_error(request, exc: HttpError):
        code = "csrf_failed" if exc.status_code == HTTPStatus.FORBIDDEN else "http_error"
        return _respond(api, request, ApiError(exc.status_code, code, str(exc.message)))
