import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { LoginBackdropContainer } from "./LoginBackdropContainer";

// The shipped manifest has the clips; each test decides what the manifest and the policy say.
const ambient = vi.hoisted(() => ({
  clips: {} as Record<string, { mp4: string; poster: string; hash: string }>,
  allowed: false,
}));
vi.mock("@/ui/ambient/scenes", () => ({
  AMBIENT_VIDEO_ENABLED: true,
  ambientClip: (scene: string) => ambient.clips[scene] ?? null,
}));
vi.mock("@/shared/lib/useAmbientAllowed", () => ({ useAmbientAllowed: () => ambient.allowed }));

const BEACH = { mp4: "/ambient/beach.0123456789.mp4", poster: "/ambient/beach.0123456789.webp", hash: "0123456789" };

beforeEach(() => {
  ambient.clips = { beach: BEACH };
  ambient.allowed = false;
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

describe("LoginBackdropContainer", () => {
  it("shows only the poster, no video, when motion is not allowed (reduced motion or Save-Data)", () => {
    const { container } = renderWithProviders(<LoginBackdropContainer />);

    expect(container.querySelector(".login-backdrop")).not.toBeNull();
    expect(container.querySelector(".ambient-media img.ambient-poster")).toHaveAttribute("src", BEACH.poster);
    expect(container.querySelector("video")).toBeNull();
  });

  it("plays the beach loop when motion is allowed", () => {
    ambient.allowed = true;
    const { container } = renderWithProviders(<LoginBackdropContainer />);

    expect(container.querySelector("video.ambient-video")).toHaveAttribute("src", BEACH.mp4);
  });

  it("writes the app name as the brand", () => {
    const { container } = renderWithProviders(<LoginBackdropContainer />);

    expect(container.querySelector(".login-brand")).toHaveTextContent("viajecito");
  });

  it("renders nothing without a beach clip, leaving the plain login canvas", () => {
    ambient.clips = { city: { ...BEACH, mp4: "/ambient/city.0123456789.mp4" } };
    const { container } = renderWithProviders(<LoginBackdropContainer />);

    expect(container).toBeEmptyDOMElement();
  });
});
