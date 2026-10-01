// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { SkiProfileForm } from "@/features/ski/containers/SkiProfileForm";

const requireMe = vi.fn(async () => undefined);
vi.mock("@/features/auth/server/requireMe", () => ({ requireMe: () => requireMe() }));

import SkiProfilePage from "./page";

describe("ski profile page", () => {
  it("gates on the session and renders the profile form", async () => {
    const element = await SkiProfilePage();

    expect(requireMe).toHaveBeenCalledOnce();
    expect(element.type).toBe(SkiProfileForm);
  });
});
