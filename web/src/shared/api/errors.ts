/** An api error: `code` comes from the `{"code","message"}` body, `unknown` when absent. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(`API error ${status}: ${code}`);
    this.name = "ApiError";
  }
}

/** Builds an ApiError from whatever openapi-fetch put in `error` (object, text or nothing). */
export function toApiError(error: unknown, response: Response): ApiError {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "unknown";
  const retryAfter = Number.parseInt(
    response.headers.get("Retry-After") ?? "",
    10,
  );
  return new ApiError(
    code,
    response.status,
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  );
}
