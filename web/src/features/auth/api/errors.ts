const KNOWN_CODES = [
  "invalid_phone",
  "invalid_code",
  "expired_code",
  "too_many_attempts",
  "rate_limited",
  "delivery_unavailable",
] as const;

export type AuthErrorMessageKey =
  | `auth.errors.${(typeof KNOWN_CODES)[number]}`
  | "auth.errors.unknown";

/** An api error: `code` comes from the `{"code","message"}` body, `unknown` when absent. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(`API error ${status}: ${code}`);
    this.name = "ApiError";
  }
}

/** Builds an ApiError from whatever openapi-fetch put in `error` (object, text or nothing). */
export function toApiError(error: unknown, status: number): ApiError {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "unknown";
  return new ApiError(code, status);
}

/** Maps an api error code to its i18n key; anything unrecognised is `auth.errors.unknown`. */
export function errorCodeToMessageKey(code: string): AuthErrorMessageKey {
  return (KNOWN_CODES as readonly string[]).includes(code)
    ? (`auth.errors.${code}` as AuthErrorMessageKey)
    : "auth.errors.unknown";
}
