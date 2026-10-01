import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetInstallCapture } from "../lib/installEvent";
import { resetServiceWorkerRegistration } from "../lib/registerServiceWorker";
import { ServiceWorkerBoot } from "./ServiceWorkerBoot";

describe("ServiceWorkerBoot", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetServiceWorkerRegistration();
    resetInstallCapture();
    Reflect.deleteProperty(window.navigator, "serviceWorker");
  });

  it("registers the service worker and renders nothing", () => {
    vi.stubEnv("NODE_ENV", "production");
    const register = vi.fn().mockResolvedValue({});
    Object.defineProperty(window.navigator, "serviceWorker", { configurable: true, value: { register } });

    const { container } = render(<ServiceWorkerBoot />);

    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
    expect(container).toBeEmptyDOMElement();
  });

  it("holds on to beforeinstallprompt so later cards can use it", async () => {
    const { getInstallEvent } = await import("../lib/installEvent");
    render(<ServiceWorkerBoot />);

    const event = new Event("beforeinstallprompt", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(getInstallEvent()).toBe(event);
  });
});
