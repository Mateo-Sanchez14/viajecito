import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import messages from "../../../../messages/es-AR";
import { resetInstallCapture, startInstallCapture } from "../lib/installEvent";
import { InstallPrompt } from "./InstallPrompt";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const t = messages.pwa.install;
const DISMISS_KEY = "viajecito:install-dismissed";
const DAY = 86_400_000;

function setStandalone(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: matches && query.includes("standalone"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function fireInstallEvent(outcome: "accepted" | "dismissed" = "accepted") {
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome, platform: "web" }),
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

describe("InstallPrompt", () => {
  beforeEach(() => {
    resetInstallCapture();
    window.localStorage.clear();
    setStandalone(false);
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders nothing until the browser offers an install", () => {
    const { container } = renderWithProviders(<InstallPrompt />);

    expect(container).toBeEmptyDOMElement();
  });

  it("offers the install after beforeinstallprompt and triggers the native prompt", async () => {
    renderWithProviders(<InstallPrompt />);
    const event = fireInstallEvent();

    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByText(t.title)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t.cta }));
    });

    expect(event.prompt).toHaveBeenCalledOnce();
    expect(screen.queryByText(t.title)).not.toBeInTheDocument();
  });

  it("offers an install the browser announced before this component mounted", () => {
    startInstallCapture(); // what the root-level boot does
    fireInstallEvent();

    renderWithProviders(<InstallPrompt />);

    expect(screen.getByText(t.title)).toBeInTheDocument();
  });

  it("keeps the offer when the user cancels the native prompt", async () => {
    renderWithProviders(<InstallPrompt />);
    fireInstallEvent("dismissed");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t.cta }));
    });

    expect(screen.getByText(t.title)).toBeInTheDocument();
  });

  it("shows the Share, Add to Home Screen steps on iOS Safari", () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(IPHONE_UA);
    renderWithProviders(<InstallPrompt />);

    expect(screen.getByText(t.title)).toBeInTheDocument();
    expect(screen.getByText(t.iosSteps.share)).toBeInTheDocument();
    expect(screen.getByText(t.iosSteps.add)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.cta })).not.toBeInTheDocument();
  });

  it("is hidden when the app already runs installed", () => {
    setStandalone(true);
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(IPHONE_UA);
    const { container } = renderWithProviders(<InstallPrompt />);

    expect(container).toBeEmptyDOMElement();
  });

  it("remembers the dismissal for 30 days", () => {
    renderWithProviders(<InstallPrompt />);
    fireInstallEvent();

    fireEvent.click(screen.getByRole("button", { name: t.dismiss }));

    expect(screen.queryByText(t.title)).not.toBeInTheDocument();
    expect(Number(window.localStorage.getItem(DISMISS_KEY))).toBeGreaterThan(Date.now() - 5_000);
  });

  it("stays hidden within 30 days of a dismissal and returns after", () => {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now() - 29 * DAY));
    const first = renderWithProviders(<InstallPrompt />);
    fireInstallEvent();
    expect(screen.queryByText(t.title)).not.toBeInTheDocument();
    first.unmount();

    window.localStorage.setItem(DISMISS_KEY, String(Date.now() - 31 * DAY));
    renderWithProviders(<InstallPrompt />);
    fireInstallEvent();
    expect(screen.getByText(t.title)).toBeInTheDocument();
  });
});
