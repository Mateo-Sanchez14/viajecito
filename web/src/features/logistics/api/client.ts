import createClient from "openapi-fetch";
import { csrfMiddleware } from "@/shared/api/csrf";
import { toApiError } from "@/shared/api/errors";
import type { paths } from "./draft-schema";

/** Contract-local client until the orchestrator integrates the real M3 API. */
export function client() {
  const instance = createClient<paths>({
    baseUrl: globalThis.location?.origin ?? "/",
    credentials: "same-origin",
  });
  instance.use(csrfMiddleware);
  return instance;
}
export function unwrap<T>(result: {
  data?: T;
  error?: unknown;
  response: Response;
}): T {
  if (result.response.ok && result.data !== undefined) return result.data;
  throw toApiError(result.error, result.response);
}
export function expectOk(result: {
  error?: unknown;
  response: Response;
}): void {
  if (!result.response.ok) throw toApiError(result.error, result.response);
}
export type JsonRequest<
  P extends keyof paths,
  M extends keyof paths[P],
> = paths[P][M] extends {
  requestBody?: { content: { "application/json": infer B } };
}
  ? B
  : never;
