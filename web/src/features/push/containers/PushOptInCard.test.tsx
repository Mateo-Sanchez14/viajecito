import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import messages from "../../../../messages/es-AR";
import { PushOptInCard } from "./PushOptInCard";

const t = messages.pwa.pushOptIn;

function setup({ installed = true, permission = "default" as NotificationPermission, push = true } = {}) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: installed && query.includes("standalone"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  vi.stubGlobal("Notification", push ? { permission } : undefined);
  vi.stubGlobal("PushManager", push ? class {} : undefined);
  Object.defineProperty(window.navigator, "serviceWorker", { configurable: true, value: {} });
  return renderWithProviders(<PushOptInCard tripId="t" crewId="c" />);
}

describe("PushOptInCard", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window.navigator, "serviceWorker");
  });

  it("invites installed users who have not decided yet to the settings page", () => {
    setup();

    expect(screen.getByText(t.title)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.cta })).toHaveAttribute("href", "/me/notifications");
  });

  it.each([
    ["not installed", { installed: false }],
    ["already granted", { permission: "granted" as const }],
    ["denied", { permission: "denied" as const }],
    ["push unsupported", { push: false }],
  ])("stays hidden when %s", (_name, options) => {
    const { container } = setup(options);

    expect(container).toBeEmptyDOMElement();
  });

  it("is shown once: dismissing hides it for good", () => {
    const first = setup();

    fireEvent.click(screen.getByRole("button", { name: t.dismiss }));
    expect(screen.queryByText(t.title)).not.toBeInTheDocument();
    first.unmount();

    const { container } = setup();
    expect(container).toBeEmptyDOMElement();
  });
});
