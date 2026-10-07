import { describe, expect, it } from "vitest";
import { DuplicateProposalError } from "@/features/proposals/api/proposals";
import { ApiError } from "@/shared/api/errors";
import { toCaptureError } from "./errors";

describe("toCaptureError", () => {
  it("maps a duplicate proposal and keeps the id of the existing one", () => {
    expect(toCaptureError(new DuplicateProposalError("P1", 409))).toEqual({ key: "duplicate", proposalId: "P1" });
  });

  it("maps the validation codes to their own copy", () => {
    expect(toCaptureError(new ApiError("invalid_url", 400))).toEqual({ key: "invalidUrl" });
    expect(toCaptureError(new ApiError("ignored_url", 400))).toEqual({ key: "ignoredUrl" });
    expect(toCaptureError(new ApiError("invalid_request", 400))).toEqual({ key: "invalid" });
  });

  it("falls back to the generic retryable copy for anything else", () => {
    expect(toCaptureError(new ApiError("unknown", 500))).toEqual({ key: "failed" });
    expect(toCaptureError(new ApiError("not_found", 404))).toEqual({ key: "failed" });
    expect(toCaptureError(new TypeError("Failed to fetch"))).toEqual({ key: "failed" });
    expect(toCaptureError(undefined)).toEqual({ key: "failed" });
  });
});
