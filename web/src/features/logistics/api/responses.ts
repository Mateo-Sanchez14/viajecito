import { toApiError } from "@/shared/api/errors";
import type { paths } from "@/shared/api/schema";

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
