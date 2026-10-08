import { fireEvent, screen } from "@testing-library/react";
import { createOpenApiHttp } from "openapi-msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCsrfToken } from "@/shared/api/csrf";
import type { paths } from "@/shared/api/schema";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import { TourProvider } from "@/features/onboarding/TourProvider";
import { MeProvider, type Me } from "../MeProvider";
import { ShellHeader } from "./ShellHeader";

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
  usePathname: () => "/",
  useParams: () => ({}),
}));

const http = createOpenApiHttp<paths>({ baseUrl: globalThis.location.origin });
const me = {
  person: {
    id: "7b9f6d52-5d3a-4c53-9a3e-1d0c3f4d9b11",
    phone: "+5491155551234",
    display_name: "Mateo",
    locale: "es-AR",
    tour_seen_version: 0,
  },
  crews: [],
};

function renderHeader() {
  return renderWithProviders(
    <MeProvider me={me}>
      <ShellHeader />
    </MeProvider>,
  );
}

const csrf = http.get("/api/auth/csrf", ({ response }) => response(200).json({ csrf_token: "tok" }));

/** A browser push subscription as `navigator.serviceWorker` would hand it out. */
function stubPushSubscription() {
  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "BP-key", auth: "auth-secret" } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
  const registration = { pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) } };
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration: vi.fn().mockResolvedValue(registration) },
  });
  return subscription;
}

const CREW_ID = "11111111-1111-4111-8111-111111111111";
const TRIP_ID = "22222222-2222-4222-8222-222222222222";
const withDefaultTrip: Me = {
  ...me,
  crews: [{ id: CREW_ID, name: "Los Pibes", role: "admin" as const, gastito_group_url: null, default_trip_id: TRIP_ID }],
};

function renderInTour(value: Me) {
  return renderWithProviders(
    <MeProvider me={value}>
      <TourProvider>
        <ShellHeader />
      </TourProvider>
    </MeProvider>,
  );
}

describe("ShellHeader", () => {
  beforeEach(() => {
    replace.mockReset();
    push.mockReset();
  });
  afterEach(() => {
    resetCsrfToken();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window.navigator, "serviceWorker");
  });

  it("links to the notification settings from an icon button inside the header, next to logout", () => {
    renderHeader();

    const link = screen.getByRole("link", { name: messages.push.nav });
    expect(link).toHaveAttribute("href", "/me/notifications");
    expect(link.closest("header")).toBe(screen.getByRole("banner"));
    expect(link.querySelector("svg[aria-hidden='true']")).toBeInTheDocument();
    expect(link).toHaveTextContent("");
    expect(link.nextElementSibling).toBe(screen.getByRole("button", { name: messages.auth.logout }));
    expect(screen.queryByRole("navigation", { name: messages.push.nav })).not.toBeInTheDocument();
  });

  it("re-sends an existing push subscription so it belongs to whoever is signed in now", async () => {
    stubPushSubscription();
    vi.stubGlobal("Notification", { permission: "granted" });
    let posted: unknown;
    server.use(
      csrf,
      http.post("/api/notifications/subscriptions", async ({ request, response }) => {
        posted = await request.json();
        return response(200).json({ id: "5c2c3c0e-8a07-4a43-9f60-0c8f3a4b6a11", endpoint_host: "fcm.googleapis.com", created_at: "2027-06-01T10:00:00Z" });
      }),
    );

    renderHeader();

    await vi.waitFor(() =>
      expect(posted).toEqual({
        endpoint: "https://fcm.googleapis.com/fcm/send/abc",
        keys: { p256dh: "BP-key", auth: "auth-secret" },
        user_agent: expect.any(String),
      }),
    );
  });

  it("drops this device's push subscription (server row first) before logging out", async () => {
    const subscription = stubPushSubscription();
    vi.stubGlobal("Notification", { permission: "default" });
    const calls: string[] = [];
    server.use(
      csrf,
      http.delete("/api/notifications/subscriptions", ({ response }) => {
        calls.push("delete-subscription");
        return response(204).empty();
      }),
      http.post("/api/auth/logout", ({ response }) => {
        calls.push("logout");
        return response(204).empty();
      }),
    );

    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: messages.auth.logout }));

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(calls).toEqual(["delete-subscription", "logout"]);
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it("still logs out when the push cleanup fails", async () => {
    stubPushSubscription();
    vi.stubGlobal("Notification", { permission: "default" });
    server.use(
      csrf,
      http.untyped.delete(`${globalThis.location.origin}/api/notifications/subscriptions`, () => new Response(null, { status: 500 })),
      http.post("/api/auth/logout", ({ response }) => response(204).empty()),
    );

    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: messages.auth.logout }));

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("offers the tour replay right before the bell when a trip can be toured, keeping bell then logout in order", () => {
    renderInTour(withDefaultTrip);

    const help = screen.getByRole("button", { name: messages.onboarding.replay });
    const bell = screen.getByRole("link", { name: messages.push.nav });
    expect(help).toHaveAttribute("aria-haspopup", "dialog");
    expect(help.closest("header")).toBe(screen.getByRole("banner"));
    expect(help.nextElementSibling).toBe(bell);
    expect(bell.nextElementSibling).toBe(screen.getByRole("button", { name: messages.auth.logout }));
  });

  it("routes the replay from home to the default trip overview and leaves a pending start", () => {
    renderInTour(withDefaultTrip);

    fireEvent.click(screen.getByRole("button", { name: messages.onboarding.replay }));

    expect(push).toHaveBeenCalledWith(`/crews/${CREW_ID}/trips/${TRIP_ID}`);
  });

  it("hides the replay when there is no trip to tour", () => {
    renderInTour(me);

    expect(screen.queryByRole("button", { name: messages.onboarding.replay })).not.toBeInTheDocument();
  });

  it("hides the replay outside a tour provider", () => {
    renderHeader();

    expect(screen.queryByRole("button", { name: messages.onboarding.replay })).not.toBeInTheDocument();
  });

  it("links the wordmark home", () => {
    renderHeader();

    const link = screen.getByRole("link", { name: messages.app.name });
    expect(link).toHaveAttribute("href", "/");
    expect(link.closest("header")).toBe(screen.getByRole("banner"));
  });

  it("greets the person by display name", () => {
    renderHeader();

    expect(
      screen.getByText(messages.home.greeting.replace("{name}", "Mateo")),
    ).toBeInTheDocument();
    expect(screen.getByText(messages.app.name)).toBeInTheDocument();
  });

  it("greets with just \"Hola\" when the person has no display name yet", () => {
    renderWithProviders(
      <MeProvider me={{ ...me, person: { ...me.person, display_name: "  " } }}>
        <ShellHeader />
      </MeProvider>,
    );

    expect(screen.getByText(messages.home.greetingAnonymous)).toBeInTheDocument();
    expect(screen.queryByText(/Hola,/)).not.toBeInTheDocument();
  });

  it("logs out and replaces the route with /login", async () => {
    let loggedOut = false;
    server.use(
      http.get("/api/auth/csrf", ({ response }) =>
        response(200).json({ csrf_token: "tok" }),
      ),
      http.post("/api/auth/logout", ({ response }) => {
        loggedOut = true;
        return response(204).empty();
      }),
    );

    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: messages.auth.logout }));

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(loggedOut).toBe(true);
  });

  it("shows the unknown error and stays put when logout fails", async () => {
    server.use(
      http.get("/api/auth/csrf", ({ response }) =>
        response(200).json({ csrf_token: "tok" }),
      ),
      http.untyped.post(
        `${globalThis.location.origin}/api/auth/logout`,
        () => new Response(null, { status: 500 }),
      ),
    );

    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: messages.auth.logout }));

    expect(
      await screen.findByText(messages.auth.errors.unknown),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
