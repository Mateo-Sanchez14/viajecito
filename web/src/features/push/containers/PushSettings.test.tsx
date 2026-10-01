import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { HttpResponse } from "msw";
import { createOpenApiHttp } from "openapi-msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCsrfToken } from "@/shared/api/csrf";
import type { paths } from "@/shared/api/schema";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import { PushSettings } from "./PushSettings";

const t = messages.push;
const http = createOpenApiHttp<paths>({ baseUrl: globalThis.location.origin });
const VAPID = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 9)]).toString("base64url");
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const SUB_OUT = { id: "5c2c3c0e-8a07-4a43-9f60-0c8f3a4b6a11", endpoint_host: "fcm.googleapis.com", created_at: "2027-06-01T10:00:00Z" };

const csrf = http.get("/api/auth/csrf", ({ response }) => response(200).json({ csrf_token: "tok" }));
const vapid = http.get("/api/notifications/vapid_public_key", ({ response }) => response(200).json({ public_key: VAPID }));
const prefs = (push: Record<string, boolean> = {}) =>
  http.get("/api/notifications/preferences", ({ response }) => response(200).json({ push }));

type FakeSub = ReturnType<typeof makeSub>;
function makeSub(endpoint = "https://fcm.googleapis.com/fcm/send/abc") {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: "BP-key", auth: "auth-secret" } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
}

function setupBrowser({
  permission = "default" as NotificationPermission,
  requestResult = "granted" as NotificationPermission,
  subscription = null as FakeSub | null,
  pushManager = true,
} = {}) {
  const current = { sub: subscription };
  const newSub = makeSub();
  const registration = {
    pushManager: {
      getSubscription: vi.fn(async () => current.sub),
      subscribe: vi.fn<(options: PushSubscriptionOptionsInit) => Promise<FakeSub>>(async () => {
        current.sub = newSub;
        return newSub;
      }),
    },
  };
  const requestPermission = vi.fn(async () => {
    Object.assign(Notification, { permission: requestResult });
    return requestResult;
  });
  vi.stubGlobal("Notification", { permission: permission, requestPermission });
  if (pushManager) vi.stubGlobal("PushManager", class {});
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: Promise.resolve(registration),
      register: vi.fn().mockResolvedValue(registration),
      getRegistration: vi.fn().mockResolvedValue(registration),
    },
  });
  return { registration, requestPermission, newSub };
}

describe("PushSettings", () => {
  beforeEach(() => resetCsrfToken());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window.navigator, "serviceWorker");
    resetCsrfToken();
  });

  it("explains when the browser cannot do push", async () => {
    vi.stubGlobal("Notification", undefined);
    renderWithProviders(<PushSettings />);

    expect(await screen.findByText(t.unsupported)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.enable })).not.toBeInTheDocument();
  });

  it("asks iPhone users to install the app first", async () => {
    setupBrowser();
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(IPHONE_UA);
    renderWithProviders(<PushSettings />);

    expect(await screen.findByText(t.iosNeedsInstall)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.enable })).not.toBeInTheDocument();
  });

  it("shows how to unblock when the permission was denied", async () => {
    setupBrowser({ permission: "denied" });
    renderWithProviders(<PushSettings />);

    expect(await screen.findByText(t.denied)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.enable })).not.toBeInTheDocument();
  });

  it("enables push: permission, subscribe with the VAPID key, then POST the subscription", async () => {
    const { registration, requestPermission } = setupBrowser();
    let posted: unknown;
    server.use(
      csrf,
      vapid,
      http.post("/api/notifications/subscriptions", async ({ request, response }) => {
        posted = await request.json();
        return response(201).json(SUB_OUT);
      }),
      prefs(),
    );
    renderWithProviders(<PushSettings />);

    fireEvent.click(await screen.findByRole("button", { name: t.enable }));

    await waitFor(() => expect(screen.getByRole("button", { name: t.disable })).toBeInTheDocument());
    expect(requestPermission).toHaveBeenCalledOnce();
    const options = registration.pushManager.subscribe.mock.calls[0]?.[0] as PushSubscriptionOptionsInit;
    expect(options.userVisibleOnly).toBe(true);
    expect((options.applicationServerKey as Uint8Array).length).toBe(65);
    expect(posted).toEqual({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      keys: { p256dh: "BP-key", auth: "auth-secret" },
      user_agent: expect.any(String),
    });
  });

  it("does not subscribe when the user refuses the permission prompt", async () => {
    const { registration } = setupBrowser({ requestResult: "denied" });
    renderWithProviders(<PushSettings />);

    fireEvent.click(await screen.findByRole("button", { name: t.enable }));

    expect(await screen.findByText(t.denied)).toBeInTheDocument();
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("rolls the browser subscription back when the api refuses it", async () => {
    const { newSub } = setupBrowser();
    server.use(
      csrf,
      vapid,
      http.post("/api/notifications/subscriptions", ({ response }) =>
        response(400).json({ code: "invalid_subscription", message: "bad host" }),
      ),
    );
    renderWithProviders(<PushSettings />);

    fireEvent.click(await screen.findByRole("button", { name: t.enable }));

    expect(await screen.findByRole("alert")).toHaveTextContent(t.errors.invalid_subscription);
    expect(newSub.unsubscribe).toHaveBeenCalledOnce();
  });

  it("disables push: DELETE the endpoint and unsubscribe the browser", async () => {
    const existing = makeSub();
    setupBrowser({ permission: "granted", subscription: existing });
    let deleted: unknown;
    server.use(
      csrf,
      prefs(),
      http.delete("/api/notifications/subscriptions", async ({ request }) => {
        deleted = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<PushSettings />);

    fireEvent.click(await screen.findByRole("button", { name: t.disable }));

    await waitFor(() => expect(screen.getByRole("button", { name: t.enable })).toBeInTheDocument());
    expect(deleted).toEqual({ endpoint: existing.endpoint });
    expect(existing.unsubscribe).toHaveBeenCalledOnce();
  });

  it("toggles a category and saves the full preference map", async () => {
    setupBrowser({ permission: "granted", subscription: makeSub() });
    let saved: unknown;
    server.use(
      csrf,
      prefs({ digest: false }),
      http.put("/api/notifications/preferences", async ({ request, response }) => {
        saved = await request.json();
        return response(200).json((saved as { push: Record<string, boolean> }));
      }),
    );
    renderWithProviders(<PushSettings />);

    const toggle = await screen.findByRole("switch", { name: t.categories.countdown });
    expect(screen.getByRole("switch", { name: t.categories.digest })).not.toBeChecked();
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);

    await waitFor(() => expect(screen.getByRole("switch", { name: t.categories.countdown })).not.toBeChecked());
    expect(saved).toEqual({
      push: { all: true, reminders: true, digest: false, countdown: false, proposals: true },
    });
  });

  it("sends a test notification and reports how many devices got it", async () => {
    setupBrowser({ permission: "granted", subscription: makeSub() });
    server.use(
      csrf,
      prefs(),
      http.post("/api/notifications/test", ({ response }) => response(202).json({ sent: 1 })),
    );
    renderWithProviders(<PushSettings />);

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: t.test }));
    });

    expect(await screen.findByText(t.testSent)).toBeInTheDocument();
  });

  it("tells the user when push is not configured on the server", async () => {
    setupBrowser({ permission: "granted", subscription: makeSub() });
    server.use(
      csrf,
      prefs(),
      http.post("/api/notifications/test", ({ response }) =>
        response(503).json({ code: "push_unavailable", message: "no keys" }),
      ),
    );
    renderWithProviders(<PushSettings />);

    fireEvent.click(await screen.findByRole("button", { name: t.test }));

    expect(await screen.findByRole("alert")).toHaveTextContent(t.errors.push_unavailable);
  });

  it("honours Retry-After on a rate-limited test: shows the wait and blocks the button", async () => {
    setupBrowser({ permission: "granted", subscription: makeSub() });
    server.use(
      csrf,
      prefs(),
      http.untyped.post(
        `${globalThis.location.origin}/api/notifications/test`,
        () =>
          HttpResponse.json({ code: "rate_limited", message: "slow down" }, { status: 429, headers: { "Retry-After": "1" } }),
      ),
    );
    renderWithProviders(<PushSettings />);

    fireEvent.click(await screen.findByRole("button", { name: t.test }));

    expect(await screen.findByRole("alert")).toHaveTextContent(t.errors.rate_limited_wait.replace("{seconds}", "1"));
    expect(screen.getByRole("button", { name: t.test })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole("button", { name: t.test })).toBeEnabled(), { timeout: 3000 });
  });
});
