import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bannerPhoto } from "@/ui/photos/photos";
import { SectionBanner } from "./SectionBanner";

const packing = bannerPhoto("logistics");

afterEach(() => vi.unstubAllGlobals());

describe("SectionBanner", () => {
  it("renders the title as the section's h2 on the panel and the photo as a decorative strip", () => {
    const { container } = render(<SectionBanner photo={packing} title="Logística" />);

    expect(screen.getByRole("heading", { level: 2, name: "Logística" })).toBeInTheDocument();
    expect(container.querySelector(".section-banner-panel h2")).toBeInTheDocument();
    const media = container.querySelector(".section-banner-media")!;
    expect(media).toHaveAttribute("aria-hidden", "true");
    expect(media.querySelector("img")).toHaveAttribute("alt", "");
    expect(media.querySelector("img")).toHaveAttribute("data-photo", "packing");
    expect(media.querySelector("img")).toHaveAttribute("loading", "lazy");
    // Never text over the photo: the heading is not inside the media box.
    expect(media.querySelector("h2, p")).toBeNull();
  });

  it("draws the eyebrow, subtitle and actions on the panel", () => {
    const { container } = render(
      <SectionBanner photo={packing} eyebrow="Mapa" title="Dónde" subtitle="Los lugares" actions={<button type="button">Agregar</button>} />,
    );

    const panel = container.querySelector(".section-banner-panel")!;
    expect(panel).toContainElement(screen.getByText("Mapa"));
    expect(panel).toContainElement(screen.getByText("Los lugares"));
    expect(panel).toContainElement(screen.getByRole("button", { name: "Agregar" }));
  });

  it("is just the title panel without a photo", () => {
    const { container } = render(<SectionBanner photo={null} title="Fechas" />);

    expect(container.querySelector(".section-banner-media")).toBeNull();
    expect(container.querySelector(".section-banner")).not.toHaveAttribute("data-photo");
    expect(screen.getByRole("heading", { level: 2, name: "Fechas" })).toBeInTheDocument();
  });

  it("uses only the small photo, with no srcset, when the person saves data", () => {
    vi.stubGlobal("navigator", { ...globalThis.navigator, connection: { saveData: true, addEventListener: () => {}, removeEventListener: () => {} } });
    const { container } = render(<SectionBanner photo={packing} title="Logística" />);

    const img = container.querySelector(".section-banner-media img")!;
    expect(img.getAttribute("src")).toMatch(/\.640\.webp$/);
    expect(img).not.toHaveAttribute("srcset");
  });

  it("serves the full srcset to everyone else", () => {
    const { container } = render(<SectionBanner photo={packing} title="Logística" />);

    expect(container.querySelector(".section-banner-media img")!.getAttribute("srcset")).toMatch(/640w, .+1280w$/);
  });

  it("leaves the photo out of the server markup, so nothing is fetched before the page knows about Save-Data", () => {
    const html = renderToString(<SectionBanner photo={packing} title="Logística" />);

    expect(html).toContain("section-banner-media");
    expect(html).not.toContain("<img");
    expect(html).toContain("Logística");
  });
});
