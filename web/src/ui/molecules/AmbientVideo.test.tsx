import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AmbientVideo } from "./AmbientVideo";

const SRC = "/ambient/city.0123456789.mp4";
const POSTER = "/ambient/city.0123456789.webp";

type Observed = { callback: IntersectionObserverCallback; observed: Element[]; disconnected: boolean };
let observers: Observed[] = [];
let play: ReturnType<typeof vi.spyOn>;
let pause: ReturnType<typeof vi.spyOn>;

/** An IntersectionObserver whose callback the test fires by hand. */
function stubIntersectionObserver() {
  observers = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      entry: Observed;
      constructor(callback: IntersectionObserverCallback) {
        this.entry = { callback, observed: [], disconnected: false };
        observers.push(this.entry);
      }
      observe = (element: Element) => this.entry.observed.push(element);
      disconnect = () => {
        this.entry.disconnected = true;
      };
      unobserve() {}
    },
  );
}

const intersect = (isIntersecting: boolean) =>
  act(() => observers[0].callback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver));

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  stubIntersectionObserver();
  play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.doUnmock("@/ui/ambient/scenes");
  vi.resetModules();
  Reflect.deleteProperty(document, "visibilityState");
});

describe("AmbientVideo", () => {
  it("renders only the decorative poster, and no video, when playing is not allowed", () => {
    const { container } = render(<AmbientVideo src={SRC} poster={POSTER} play={false} />);

    expect(container.querySelector("video")).toBeNull();
    const poster = container.querySelector("img.ambient-poster")!;
    expect(poster).toHaveAttribute("src", POSTER);
    expect(poster).toHaveAttribute("alt", "");
    expect(container.querySelector(".ambient-media")).toHaveAttribute("aria-hidden", "true");
    expect(play).not.toHaveBeenCalled();
  });

  it("renders a muted, looping, inline, non-interactive video with no autoplay attribute when allowed", () => {
    const { container } = render(<AmbientVideo src={SRC} poster={POSTER} play />);

    const video = container.querySelector("video")!;
    expect(video).toHaveAttribute("src", SRC);
    expect(video.muted).toBe(true);
    expect(video.defaultMuted).toBe(true);
    expect(video).toHaveAttribute("loop");
    expect(video).toHaveAttribute("playsinline");
    expect(video).toHaveAttribute("preload", "metadata");
    expect(video).toHaveAttribute("tabindex", "-1");
    expect(video).toHaveAttribute("disablepictureinpicture");
    expect(video).toHaveAttribute("disableremoteplayback");
    expect(video).not.toHaveAttribute("controls");
    expect(video).not.toHaveAttribute("autoplay");
    expect(video.closest("[aria-hidden='true']")).toBe(container.querySelector(".ambient-media"));
  });

  it("starts playing on mount and pauses when it leaves the viewport, resuming when it returns", () => {
    render(<AmbientVideo src={SRC} poster={POSTER} play />);
    expect(play).toHaveBeenCalledTimes(1);
    expect(observers[0].observed).toHaveLength(1);

    intersect(false);
    expect(pause).toHaveBeenCalled();
    const playsBefore = play.mock.calls.length;

    intersect(true);
    expect(play.mock.calls.length).toBe(playsBefore + 1);
  });

  it("pauses while the tab is hidden and resumes when it is visible again", () => {
    render(<AmbientVideo src={SRC} poster={POSTER} play />);
    pause.mockClear();
    play.mockClear();

    setVisibility("hidden");
    expect(pause).toHaveBeenCalledTimes(1);
    expect(play).not.toHaveBeenCalled();

    setVisibility("visible");
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("does not resume a tab that becomes visible while the video is off screen", () => {
    render(<AmbientVideo src={SRC} poster={POSTER} play />);
    intersect(false);
    play.mockClear();

    setVisibility("hidden");
    setVisibility("visible");

    expect(play).not.toHaveBeenCalled();
  });

  it("ignores a rejected play(): the poster stays and nothing is thrown or unhandled", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    play.mockRejectedValue(new DOMException("not allowed", "NotAllowedError"));

    const { container } = render(<AmbientVideo src={SRC} poster={POSTER} play />);
    await act(async () => {
      await Promise.resolve();
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    process.off("unhandledRejection", unhandled);

    expect(unhandled).not.toHaveBeenCalled();
    expect(container.querySelector(".ambient-media")).not.toHaveAttribute("data-playing");
    expect(container.querySelector("img.ambient-poster")).toBeInTheDocument();
  });

  it("still attempts to play where IntersectionObserver does not exist", () => {
    vi.stubGlobal("IntersectionObserver", undefined);

    render(<AmbientVideo src={SRC} poster={POSTER} play />);

    expect(play).toHaveBeenCalledTimes(1);
  });

  it("marks the poster ready when it loads and the video playing only while it plays", () => {
    const { container } = render(<AmbientVideo src={SRC} poster={POSTER} play />);
    const media = container.querySelector(".ambient-media")!;
    expect(media).not.toHaveAttribute("data-poster");
    expect(media).not.toHaveAttribute("data-playing");

    fireEvent.load(container.querySelector("img.ambient-poster")!);
    expect(media).toHaveAttribute("data-poster");

    fireEvent.playing(container.querySelector("video")!);
    expect(media).toHaveAttribute("data-playing");

    fireEvent.error(container.querySelector("video")!);
    expect(media).not.toHaveAttribute("data-playing");
    expect(media).toHaveAttribute("data-poster");
  });

  it("removes the video and stops it when playing is switched off live", () => {
    const { container, rerender } = render(<AmbientVideo src={SRC} poster={POSTER} play />);
    expect(container.querySelector("video")).toBeInTheDocument();

    rerender(<AmbientVideo src={SRC} poster={POSTER} play={false} />);

    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img.ambient-poster")).toBeInTheDocument();
    expect(pause).toHaveBeenCalled();
    expect(observers[0].disconnected).toBe(true);
  });

  it("never mounts a video when the global kill switch is off", async () => {
    vi.resetModules();
    vi.doMock("@/ui/ambient/scenes", () => ({ AMBIENT_VIDEO_ENABLED: false }));
    const { AmbientVideo: Switched } = await import("./AmbientVideo");

    const { container } = render(<Switched src={SRC} poster={POSTER} play />);

    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img.ambient-poster")).toBeInTheDocument();
  });

  it("has no focusable element and takes no part in the tab order", () => {
    const { container } = render(<AmbientVideo src={SRC} poster={POSTER} play />);

    expect(container.querySelectorAll("a, button, input, select, textarea").length).toBe(0);
    expect(container.querySelector("video")).toHaveAttribute("tabindex", "-1");
  });
});
