import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCsrfToken } from "@/shared/api/csrf";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import { TourProvider } from "../TourProvider";
import { CaptureTour, tour } from "../test/captureTour";
import { TOUR_VERSION } from "../lib/version";
import { TourContainer } from "./TourContainer";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const t = messages.onboarding;
const BOX = { x: 20, y: 120, width: 200, height: 48 };

let posts: unknown[] = [];
let postStatus = 200;

/** jsdom has no layout: an anchor is on screen when it has a box, and gone when its box is empty. */
function anchor(name: string, visible = true) {
  const element = document.createElement("div");
  element.dataset.tour = name;
  element.getBoundingClientRect = () =>
    (visible ? { ...BOX, top: BOX.y, left: BOX.x, right: 220, bottom: 168, toJSON: () => ({}) } : { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) }) as DOMRect;
  document.body.append(element);
  return element;
}

function allAnchors() {
  return ["nav", "cover", "next-actions", "rsvp", "capture"].map((name) => anchor(name));
}

function setup() {
  document.body.insertAdjacentHTML("afterbegin", "<main></main>");
  return renderWithProviders(
    <TourProvider>
      <CaptureTour />
      <TourContainer />
    </TourProvider>,
  );
}

const start = () => act(() => tour.start());
const dialog = () => screen.queryByRole("dialog");

beforeEach(() => {
  posts = [];
  postStatus = 200;
  refresh.mockReset();
  server.use(
    http.get("*/api/auth/csrf", () => HttpResponse.json({ csrf_token: "tok" })),
    http.post("*/api/me/tour", async ({ request }) => {
      posts.push(await request.json());
      return postStatus === 200
        ? HttpResponse.json({ person: { id: "p", phone: "+5491155551234", display_name: "M", locale: "es-AR", tour_seen_version: TOUR_VERSION } })
        : HttpResponse.json({ code: "boom", message: "x" }, { status: postStatus });
    }),
  );
});

afterEach(() => {
  resetCsrfToken();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("TourContainer", () => {
  it("renders nothing until the tour is started", () => {
    allAnchors();
    setup();

    expect(dialog()).not.toBeInTheDocument();
  });

  it("opens at the first available step and counts only the steps that are on screen", () => {
    ["nav", "next-actions", "rsvp", "capture"].forEach((name) => anchor(name));
    anchor("cover", false);
    setup();

    start();

    expect(screen.getByRole("dialog", { name: t.steps.nav.title })).toBeInTheDocument();
    expect(screen.getByText(t.progress.replace("{current}", "1").replace("{total}", "4"))).toBeInTheDocument();
  });

  it("walks forward and back, skipping the step whose anchor is hidden", () => {
    ["nav", "next-actions", "rsvp", "capture"].forEach((name) => anchor(name));
    anchor("cover", false);
    setup();
    start();

    fireEvent.click(screen.getByRole("button", { name: t.next }));
    expect(screen.getByRole("dialog", { name: t.steps.nextActions.title })).toBeInTheDocument();
    expect(screen.getByText(t.progress.replace("{current}", "2").replace("{total}", "4"))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: t.back }));
    expect(screen.getByRole("dialog", { name: t.steps.nav.title })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.back })).not.toBeInTheDocument();
  });

  it("does not open and does not persist anything when no anchor is available", async () => {
    setup();

    start();

    expect(dialog()).not.toBeInTheDocument();
    expect(tour.running).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(posts).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("finishes on the last step: one POST with the version, a refresh, and the dialog closes", async () => {
    allAnchors();
    setup();
    start();

    for (let step = 0; step < 4; step += 1) fireEvent.click(screen.getByRole("button", { name: t.next }));
    fireEvent.click(screen.getByRole("button", { name: t.done }));

    expect(dialog()).not.toBeInTheDocument();
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(posts).toEqual([{ version: TOUR_VERSION }]);
  });

  it("skips: closes at once and persists the same way", async () => {
    allAnchors();
    setup();
    start();

    fireEvent.click(screen.getByRole("button", { name: t.skip }));

    expect(dialog()).not.toBeInTheDocument();
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(posts).toEqual([{ version: TOUR_VERSION }]);
  });

  it("treats Escape as Skip", async () => {
    allAnchors();
    setup();
    start();

    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));

    expect(dialog()).not.toBeInTheDocument();
    await waitFor(() => expect(posts).toEqual([{ version: TOUR_VERSION }]));
  });

  it("sends a single request even when Skip is activated twice in the same tick", async () => {
    allAnchors();
    setup();
    start();
    const skip = screen.getByRole("button", { name: t.skip });

    act(() => {
      skip.click();
      skip.click();
    });

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(posts).toHaveLength(1);
  });

  it("closes without any error UI when the POST fails, and does not refresh", async () => {
    postStatus = 500;
    allAnchors();
    setup();
    start();

    fireEvent.click(screen.getByRole("button", { name: t.skip }));

    expect(dialog()).not.toBeInTheDocument();
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("returns focus to the element that had it when the tour started", () => {
    allAnchors();
    setup();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    start();
    expect(opener).not.toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: t.skip }));

    expect(opener).toHaveFocus();
  });

  it("returns focus to the main landmark when that element is gone", () => {
    allAnchors();
    setup();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    start();
    opener.remove();

    fireEvent.click(screen.getByRole("button", { name: t.skip }));

    expect(screen.getByRole("main")).toHaveFocus();
  });

  it("scrolls the anchor into view, smoothly only when motion is allowed", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    allAnchors();
    setup();

    start();
    expect(scroll).toHaveBeenLastCalledWith({ block: "center", behavior: "auto" }); // no matchMedia: treated as reduce

    fireEvent.click(screen.getByRole("button", { name: t.skip }));
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    start();
    expect(scroll).toHaveBeenLastCalledWith({ block: "center", behavior: "smooth" });
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  });

  it("moves to the next available step when the current anchor disappears", async () => {
    const [nav] = allAnchors();
    setup();
    start();
    expect(screen.getByRole("dialog", { name: t.steps.nav.title })).toBeInTheDocument();

    nav.getBoundingClientRect = () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) }) as DOMRect;
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(await screen.findByRole("dialog", { name: t.steps.cover.title })).toBeInTheDocument();
  });

  it("finishes (and persists) when the last anchor disappears and nothing is left", async () => {
    const anchors = allAnchors();
    setup();
    start();
    for (let step = 0; step < 4; step += 1) fireEvent.click(screen.getByRole("button", { name: t.next }));
    expect(screen.getByRole("dialog", { name: t.steps.capture.title })).toBeInTheDocument();

    anchors[4].getBoundingClientRect = () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) }) as DOMRect;
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    await waitFor(() => expect(dialog()).not.toBeInTheDocument());
    await waitFor(() => expect(posts).toEqual([{ version: TOUR_VERSION }]));
  });

  it("can run again after it ended (a replay is a new session)", () => {
    allAnchors();
    setup();
    start();
    fireEvent.click(screen.getByRole("button", { name: t.skip }));

    start();

    expect(screen.getByRole("dialog", { name: t.steps.nav.title })).toBeInTheDocument();
  });
});
