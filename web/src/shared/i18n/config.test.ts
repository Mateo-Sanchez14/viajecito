import { describe, expect, it } from "vitest";
import messages from "../../../messages/es-AR.json";
import { LOCALE, resolveRequestConfig } from "./config";

describe("i18n request config", () => {
  it("resolves the single es-AR locale with its messages", () => {
    const config = resolveRequestConfig();

    expect(LOCALE).toBe("es-AR");
    expect(config.locale).toBe("es-AR");
    expect(config.messages).toEqual(messages);
  });
});
