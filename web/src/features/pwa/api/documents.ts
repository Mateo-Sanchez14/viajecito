import { ApiError } from "@/shared/api/errors";

/**
 * The slice of M3's `DocumentOut` the offline card needs. The documents endpoints are not in the
 * generated schema yet, so this reads the list with a plain same-origin fetch and narrows it here.
 */
export type OfflineCandidate = { id: string; title: string; download_path: string };

/** Only `/api/documents/<id>/file` may ever be written to the opt-in cache. */
const FILE_PATH = /^\/api\/documents\/[^/?#]+\/file$/;

export const isDocumentFilePath = (path: string) => FILE_PATH.test(path);

export const documentKeys = { list: (tripId: string) => ["pwa", "documents", tripId] as const };

function toCandidate(value: unknown): OfflineCandidate | null {
  if (typeof value !== "object" || value === null) return null;
  const { id, title, download_path } = value as Record<string, unknown>;
  if (typeof id !== "string" || typeof title !== "string" || typeof download_path !== "string") return null;
  return isDocumentFilePath(download_path) ? { id, title, download_path } : null;
}

export async function listOfflineCandidates(tripId: string): Promise<OfflineCandidate[]> {
  const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/documents`, { credentials: "same-origin" });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { code?: unknown } | null;
    throw new ApiError(typeof body?.code === "string" ? body.code : "unknown", response.status);
  }
  const body: unknown = await response.json();
  return Array.isArray(body) ? body.flatMap((item) => toCandidate(item) ?? []) : [];
}
