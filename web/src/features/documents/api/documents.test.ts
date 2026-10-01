import { describe, expect, it, vi, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { resetCsrfToken } from "@/shared/api/csrf";
import {
  downloadPath,
  validateUpload,
  MAX_UPLOAD_BYTES,
  uploadDocument,
} from "./documents";
afterEach(() => {
  vi.unstubAllGlobals();
  resetCsrfToken();
});
describe("upload safety", () => {
  it.each([
    "sample.pdf",
    "sample.jpg",
    "sample.png",
    "sample.webp",
    "sample.heic",
    "sample.heif",
  ])("accepts %s", (name) =>
    expect(validateUpload(new File(["x"], name))).toBeNull(),
  );
  it.each(["fake.pdf.exe", "x.svg", "x.html", "x.zip"])(
    "rejects %s regardless of claimed MIME",
    (name) =>
      expect(
        validateUpload(new File(["x"], name, { type: "application/pdf" })),
      ).toBe("unsupported_type"),
  );
  it("rejects files over 15 MiB", () => {
    const file = new File(["x"], "a.pdf");
    Object.defineProperty(file, "size", { value: MAX_UPLOAD_BYTES + 1 });
    expect(validateUpload(file)).toBe("file_too_large");
  });
  it.each([
    "https://evil.test/api/documents/d/file",
    "//evil.test/api/documents/d/file",
    "/media/vault/x.enc",
    "/api/documents/../file",
    "/api/documents/d/file?inline=true",
  ])("rejects unexpected download path %s", (path) =>
    expect(downloadPath(path)).toBeNull(),
  );
  it("uses same-origin XHR with CSRF, progress, and quota error mapping", async () => {
    server.use(
      http.get("*/api/auth/csrf", () =>
        HttpResponse.json({ csrf_token: "tok" }),
      ),
    );
    const calls: unknown[] = [];
    class FakeXHR {
      upload: {
        onprogress?: (event: {
          lengthComputable: boolean;
          loaded: number;
          total: number;
        }) => void;
      } = {};
      withCredentials = false;
      status = 507;
      responseText = JSON.stringify({ code: "quota_exceeded" });
      onload?: () => void;
      open(...args: unknown[]) {
        calls.push(args);
      }
      setRequestHeader(...args: unknown[]) {
        calls.push(args);
      }
      send() {
        expect(this.withCredentials).toBe(true);
        this.upload.onprogress?.({
          lengthComputable: true,
          loaded: 1,
          total: 2,
        });
        this.onload?.();
      }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
    const progress = vi.fn();
    await expect(
      uploadDocument("t1", new FormData(), progress),
    ).rejects.toMatchObject({ code: "quota_exceeded", status: 507 });
    expect(calls).toContainEqual(["POST", "/api/trips/t1/documents"]);
    expect(calls).toContainEqual(["X-CSRFToken", "tok"]);
    expect(progress).toHaveBeenCalledWith(50);
  });
});
