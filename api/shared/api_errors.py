"""Uniform JSON error bodies ``{"code", "message"}`` for the Ninja API."""

from http import HTTPStatus

from django.http import HttpRequest, HttpResponse
from ninja import NinjaAPI, Schema
from ninja.errors import AuthenticationError, HttpError, ValidationError
from ninja.security import APIKeyCookie


class ErrorOut(Schema):
    code: str
    message: str


class ApiError(Exception):
    def __init__(
        self, status: int, code: str, message: str, headers: dict[str, str] | None = None
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.headers = headers or {}


class CsrfCookie(APIKeyCookie):
    """Auth scheme that only enforces CSRF (Ninja checks it before parsing the body).

    Ninja skips Django's CSRF middleware for every view and checks CSRF only inside cookie
    auth classes, so anonymous unsafe routes use this to get the same protection.
    """

    param_name = "csrftoken"

    def authenticate(self, request: HttpRequest, key: str | None) -> bool:
        return True


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
