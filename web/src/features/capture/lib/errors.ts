import { DuplicateProposalError } from "@/features/proposals/api/proposals";
import { ApiError } from "@/shared/api/errors";

/** Keys of `capture.errors.*`. The developer `message` of an api error is never shown. */
export type CaptureErrorKey = "duplicate" | "invalidUrl" | "ignoredUrl" | "invalid" | "failed";

export type CaptureError = { key: CaptureErrorKey; proposalId?: string };

const BY_CODE: Record<string, CaptureErrorKey> = {
  invalid_url: "invalidUrl",
  ignored_url: "ignoredUrl",
  invalid_request: "invalid",
};

/** Maps whatever a capture mutation threw to copy; anything unknown is the generic retry. */
export function toCaptureError(error: unknown): CaptureError {
  if (error instanceof DuplicateProposalError) return { key: "duplicate", proposalId: error.proposalId };
  if (error instanceof ApiError && error.code in BY_CODE) return { key: BY_CODE[error.code] };
  return { key: "failed" };
}
