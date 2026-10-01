import { afterEach, describe, expect, it, vi } from "vitest";
import { registerServiceWorker, resetServiceWorkerRegistration } from "./registerServiceWorker";

function stubServiceWorker(register = vi.fn().mockResolvedValue({ scope: "/" })) {
  Object.defineProperty(window.navigator, "serviceWorker", { configurable: true, value: { register } });
  return register;
}

describe("registerServiceWorker", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetServiceWorkerRegistration();
    Reflect.deleteProperty(window.navigator, "serviceWorker");
  });

  it("registers /sw.js at the site scope in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const register = stubServiceWorker();

    await registerServiceWorker();

    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });

  it("registers only once however many cards ask for it", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const register = stubServiceWorker();

    await Promise.all([registerServiceWorker(), registerServiceWorker()]);

    expect(register).toHaveBeenCalledOnce();
  });

  it("does nothing outside production, where the worker is not built", async () => {
    const register = stubServiceWorker();

    await expect(registerServiceWorker()).resolves.toBeNull();
    expect(register).not.toHaveBeenCalled();
  });

  it("does nothing where service workers are unsupported", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(registerServiceWorker()).resolves.toBeNull();
  });

  it("swallows a registration failure so the app keeps working", async () => {
    vi.stubEnv("NODE_ENV", "production");
    stubServiceWorker(vi.fn().mockRejectedValue(new Error("blocked")));

    await expect(registerServiceWorker()).resolves.toBeNull();
  });
});
