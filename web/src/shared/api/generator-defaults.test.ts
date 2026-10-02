// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// A mismatched drift command would regenerate the old unsafe request requirements.
const manifest: { scripts: Record<string, string> } = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
);

it.each(["api:types", "api:types:check"])("%s preserves optional defaulted request fields", (script) => {
  expect(manifest.scripts[script]).toContain("--default-non-nullable false");
});
