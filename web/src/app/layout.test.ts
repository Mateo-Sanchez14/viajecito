import { describe, expect, it, vi } from "vitest";
import { themeTokens } from "@/test/cssTokens";

// next/font only works inside the Next compiler: stand in for it so the layout module can load.
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

const { viewport } = await import("./layout");

describe("root layout viewport", () => {
  it("lets the page draw under the safe areas and keeps pinch zoom", () => {
    expect(viewport).toMatchObject({ width: "device-width", initialScale: 1, viewportFit: "cover" });
    expect(viewport).not.toHaveProperty("maximumScale");
    expect(viewport).not.toHaveProperty("userScalable");
  });

  it("declares both color schemes", () => {
    expect(viewport.colorScheme).toBe("light dark");
  });

  it("has a light and a dark theme color equal to each theme's --background token", () => {
    const colors = viewport.themeColor as { media: string; color: string }[];

    expect(colors).toHaveLength(2);
    expect(colors.find((entry) => entry.media === "(prefers-color-scheme: light)")?.color).toBe(
      themeTokens("light")["--background"],
    );
    expect(colors.find((entry) => entry.media === "(prefers-color-scheme: dark)")?.color).toBe(
      themeTokens("dark")["--background"],
    );
  });
});
