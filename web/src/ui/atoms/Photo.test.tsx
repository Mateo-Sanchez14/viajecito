import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { scenePhotos } from "@/ui/photos/photos";
import { Photo } from "./Photo";

const lake = scenePhotos("lake")[0];
const city = scenePhotos("city")[0];

describe("Photo", () => {
  it("renders the srcset, the ratio and decoding of a lazy decorative image by default", () => {
    const { container } = render(<Photo photo={lake} sizes="100vw" />);
    const img = container.querySelector("img")!;

    expect(img).toHaveAttribute("alt", "");
    expect(img.getAttribute("srcset")).toMatch(/640w, .+1280w$/);
    expect(img).toHaveAttribute("sizes", "100vw");
    expect(img.getAttribute("src")).toMatch(/\/photos\/lake-patagonia\.[0-9a-f]{10}\.1280\.webp$/);
    expect(img).toHaveAttribute("width", "1280");
    expect(img).toHaveAttribute("height", "854");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("decoding", "async");
    expect(img).not.toHaveAttribute("fetchpriority");
    expect(img).toHaveAttribute("data-photo", "lake-patagonia");
  });

  it("is eager and high priority when it is the first thing on screen", () => {
    const { container } = render(<Photo photo={lake} priority />);
    const img = container.querySelector("img")!;

    expect(img).toHaveAttribute("loading", "eager");
    expect(img).toHaveAttribute("fetchpriority", "high");
  });

  it("uses only the smallest file, with no srcset or sizes, when saving data", () => {
    const { container } = render(<Photo photo={lake} small sizes="100vw" />);
    const img = container.querySelector("img")!;

    expect(img.getAttribute("src")).toMatch(/\.640\.webp$/);
    expect(img).not.toHaveAttribute("srcset");
    expect(img).not.toHaveAttribute("sizes");
    expect(img).toHaveAttribute("width", "640");
  });

  it("takes the alt text it is given and the focal point of a cropped portrait", () => {
    const { container } = render(<Photo photo={city} alt="Puerto Madero al atardecer" />);
    const img = container.querySelector("img")!;

    expect(img).toHaveAttribute("alt", "Puerto Madero al atardecer");
    expect(img.style.objectPosition).toBe("50% 35%");
  });

  it("reports a failed load to its owner", () => {
    const onError = vi.fn();
    const { container } = render(<Photo photo={lake} onError={onError} />);

    fireEvent.error(container.querySelector("img")!);

    expect(onError).toHaveBeenCalledOnce();
  });
});
