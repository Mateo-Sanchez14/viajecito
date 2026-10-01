import {
  client,
  unwrap,
  expectOk,
  type JsonRequest,
} from "@/features/logistics/api/client";
import type { paths } from "@/features/logistics/api/draft-schema";
import { getCsrfToken } from "@/shared/api/csrf";
import { ApiError } from "@/shared/api/errors";
export type Document =
  paths["/api/trips/{trip_id}/documents"]["get"]["responses"][200]["content"]["application/json"][number];
export type DocumentPatch = JsonRequest<
  "/api/documents/{document_id}",
  "patch"
>;
export const documentKeys = {
  list: (tripId: string, kind?: string) =>
    ["documents", tripId, "list", kind ?? "all"] as const,
};
export async function listDocuments(tripId: string, kind?: string) {
  return unwrap(
    await client().GET("/api/trips/{trip_id}/documents", {
      params: { path: { trip_id: tripId }, query: { kind } },
    }),
  );
}
export async function updateDocument(id: string, body: DocumentPatch) {
  return unwrap(
    await client().PATCH("/api/documents/{document_id}", {
      params: { path: { document_id: id } },
      body,
    }),
  );
}
export async function deleteDocument(id: string) {
  expectOk(
    await client().DELETE("/api/documents/{document_id}", {
      params: { path: { document_id: id } },
    }),
  );
}
/** XHR is required for upload progress; file requests remain same-origin and carry CSRF. */
export async function uploadDocument(
  tripId: string,
  body: FormData,
  onProgress: (percent: number) => void,
): Promise<Document> {
  const csrf = await getCsrfToken();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/trips/${encodeURIComponent(tripId)}/documents`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("X-CSRFToken", csrf);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () => reject(new ApiError("network_error", 0));
    xhr.onabort = () => reject(new ApiError("upload_cancelled", 0));
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(100);
          resolve(data as Document);
        } else
          reject(
            new ApiError(
              typeof data.code === "string" ? data.code : "invalid_request",
              xhr.status,
            ),
          );
      } catch {
        reject(new ApiError("invalid_response", xhr.status));
      }
    };
    xhr.send(body);
  });
}
export function downloadPath(path: string): string | null {
  return /^\/api\/documents\/[a-zA-Z0-9-]+\/file$/.test(path) ? path : null;
}
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export function validateUpload(
  file: File,
): "file_too_large" | "unsupported_type" | null {
  if (file.size > MAX_UPLOAD_BYTES) return "file_too_large";
  if (!/\.(pdf|jpe?g|png|webp|heic|heif)$/i.test(file.name))
    return "unsupported_type";
  return null;
}
