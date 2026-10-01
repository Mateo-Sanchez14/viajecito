import { describe, expect, it } from "vitest";
import { resolveRequestConfig } from "./config";

describe("i18n request config", () => {
  it("resolves es-AR and loads the voseo copy the app relies on", () => {
    const { locale, messages } = resolveRequestConfig();

    expect(locale).toBe("es-AR");
    expect(messages.app.name).toBe("viajecito");
    expect(messages.app.tagline).toEqual(expect.any(String));
    expect(Object.keys(messages.ops.health)).toEqual(
      expect.arrayContaining(["ok", "degraded", "loading", "error"]),
    );
  });
});
