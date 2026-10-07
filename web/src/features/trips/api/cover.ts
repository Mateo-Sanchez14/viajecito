import { toApiError, ApiError } from "@/shared/api/errors";
import { createBrowserClient } from "@/shared/api/client";
import { getCsrfToken, resetCsrfToken } from "@/shared/api/csrf";
import { unwrap, type Trip } from "./trips";

/**
 * The cover image URL. `?v=<cover_version>` changes whenever the cover is set, replaced or
 * removed, so the week-long private cache of the image can never show a stale photo.
 */
export function coverPath(trip: { id: string; cover_version: number }): string {
  return `/api/trips/${encodeURIComponent(trip.id)}/cover?v=${trip.cover_version}`;
}

async function post(tripId: string, blob: Blob): Promise<Response> {
  const body = new FormData();
  const name = blob.type === "image/webp" ? "cover.webp" : blob.type === "image/jpeg" ? "cover.jpg" : "cover";
  body.append("file", new File([blob], name, { type: blob.type }));
  try {
    return await fetch(`/api/trips/${encodeURIComponent(tripId)}/cover`, {
      method: "POST",
      body,
      credentials: "same-origin",
      headers: { "X-CSRFToken": await getCsrfToken() },
    });
  } catch {
    // Offline or the connection dropped: nothing reached the api.
    throw new ApiError("network_error", 0);
  }
}

async function isCsrfFailure(response: Response): Promise<boolean> {
  if (response.status !== 403) return false;
  const body: unknown = await response.clone().json().catch(() => null);
  return typeof body === "object" && body !== null && "code" in body && body.code === "csrf_failed";
}

/**
 * Uploads the cover as multipart (the api reads files from POST only) and resolves the updated
 * trip. A rotated CSRF token is reloaded and the upload replayed once, as the typed client does.
 */
export async function uploadCover(tripId: string, blob: Blob): Promise<Trip> {
  let response = await post(tripId, blob);
  if (await isCsrfFailure(response)) {
    resetCsrfToken();
    response = await post(tripId, blob);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw toApiError(body, response);
  return body as Trip;
}

/** Removes the cover (idempotent) and resolves the updated trip. */
export async function deleteCover(tripId: string): Promise<Trip> {
  return unwrap(
    await createBrowserClient().DELETE("/api/trips/{trip_id}/cover", {
      params: { path: { trip_id: tripId } },
    }),
  );
}
