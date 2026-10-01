import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import messages from "../../../../messages/es-AR";
import { resetServiceWorkerRegistration } from "../lib/registerServiceWorker";
import { InstallCard } from "./InstallCard";

describe("InstallCard", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.unstubAllEnvs();
    resetServiceWorkerRegistration();
    Reflect.deleteProperty(window.navigator, "serviceWorker");
  });

  it("registers the service worker when the overview mounts it", () => {
    vi.stubEnv("NODE_ENV", "production");
    const register = vi.fn().mockResolvedValue({});
    Object.defineProperty(window.navigator, "serviceWorker", { configurable: true, value: { register } });

    renderWithProviders(<InstallCard tripId="t" crewId="c" />);

    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });

  it("shows the install offer once the browser allows it", () => {
    renderWithProviders(<InstallCard tripId="t" crewId="c" />);
    expect(screen.queryByText(messages.pwa.install.title)).not.toBeInTheDocument();

    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: vi.fn(),
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(screen.getByText(messages.pwa.install.title)).toBeInTheDocument();
  });
});
