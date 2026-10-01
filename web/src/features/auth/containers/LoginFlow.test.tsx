import { act, fireEvent, screen } from "@testing-library/react";
import { HttpResponse } from "msw";
import { createOpenApiHttp } from "openapi-msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCsrfToken } from "@/shared/api/csrf";
import type { paths } from "@/shared/api/schema";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR.json";
import { LoginFlow } from "./LoginFlow";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const origin = globalThis.location.origin;
const http = createOpenApiHttp<paths>({ baseUrl: origin });
const person = {
  id: "7b9f6d52-5d3a-4c53-9a3e-1d0c3f4d9b11",
  phone: "+5491155551234",
  display_name: "Mateo",
  locale: "es-AR",
};

function otpRequestOk(retryAfter = 60) {
  return http.post("/api/auth/otp/request", ({ response }) =>
    response(202).json({
      status: "sent",
      retry_after_seconds: retryAfter,
      expires_in_seconds: 300,
    }),
  );
}

function useHandlers(...handlers: Parameters<typeof server.use>) {
  server.use(
    http.get("/api/auth/csrf", ({ response }) =>
      response(200).json({ csrf_token: "tok" }),
    ),
    ...handlers,
  );
}

async function goToCodeStep() {
  fireEvent.change(screen.getByLabelText(messages.auth.phone.label), {
    target: { value: " +54 9 11 5555 1234 " },
  });
  fireEvent.click(
    screen.getByRole("button", { name: messages.auth.phone.submit }),
  );
  return screen.findByLabelText(messages.auth.code.label);
}

function submitCode(code: string) {
  fireEvent.change(screen.getByLabelText(messages.auth.code.label), {
    target: { value: code },
  });
  fireEvent.click(
    screen.getByRole("button", { name: messages.auth.code.submit }),
  );
}

describe("LoginFlow", () => {
  beforeEach(() => replace.mockReset());
  afterEach(() => {
    resetCsrfToken();
    vi.useRealTimers();
  });

  it("moves to the code step after the api accepts the phone", async () => {
    let sentPhone: unknown;
    useHandlers(
      http.post("/api/auth/otp/request", async ({ request, response }) => {
        sentPhone = ((await request.json()) as { phone: string }).phone;
        return response(202).json({
          status: "sent",
          retry_after_seconds: 60,
          expires_in_seconds: 300,
        });
      }),
    );

    renderWithProviders(<LoginFlow />);
    expect(await goToCodeStep()).toBeInTheDocument();

    // Only trimmed client-side; the api normalizes.
    expect(sentPhone).toBe("+54 9 11 5555 1234");
  });

  it("shows the phone error copy when the api rejects the number", async () => {
    useHandlers(
      http.post("/api/auth/otp/request", ({ response }) =>
        response(400).json({ code: "invalid_phone", message: "bad" }),
      ),
    );

    renderWithProviders(<LoginFlow />);
    fireEvent.change(screen.getByLabelText(messages.auth.phone.label), {
      target: { value: "12" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: messages.auth.phone.submit }),
    );

    expect(
      await screen.findByText(messages.auth.errors.invalid_phone),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(messages.auth.code.label),
    ).not.toBeInTheDocument();
  });

  it("shows the invalid_code copy and stays on the code step", async () => {
    useHandlers(
      otpRequestOk(),
      http.post("/api/auth/otp/verify", ({ response }) =>
        response(400).json({ code: "invalid_code", message: "bad" }),
      ),
    );

    renderWithProviders(<LoginFlow />);
    await goToCodeStep();
    submitCode("000000");

    expect(
      await screen.findByText(messages.auth.errors.invalid_code),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("falls back to the unknown copy on a network failure", async () => {
    useHandlers(
      http.untyped.post(`${origin}/api/auth/otp/request`, () =>
        HttpResponse.error(),
      ),
    );

    renderWithProviders(<LoginFlow />);
    fireEvent.change(screen.getByLabelText(messages.auth.phone.label), {
      target: { value: "+5491155551234" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: messages.auth.phone.submit }),
    );

    expect(
      await screen.findByText(messages.auth.errors.unknown),
    ).toBeInTheDocument();
  });

  it("replaces the route with / after a successful login", async () => {
    useHandlers(
      otpRequestOk(),
      http.post("/api/auth/otp/verify", ({ response }) =>
        response(200).json({ person }),
      ),
    );

    renderWithProviders(<LoginFlow />);
    await goToCodeStep();
    submitCode("123456");

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("honors a same-origin next path", async () => {
    useHandlers(
      otpRequestOk(),
      http.post("/api/auth/otp/verify", ({ response }) =>
        response(200).json({ person }),
      ),
    );

    renderWithProviders(<LoginFlow next="/trips/abc" />);
    await goToCodeStep();
    submitCode("123456");

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/trips/abc"));
  });

  it("ignores an absolute next URL", async () => {
    useHandlers(
      otpRequestOk(),
      http.post("/api/auth/otp/verify", ({ response }) =>
        response(200).json({ person }),
      ),
    );

    renderWithProviders(<LoginFlow next="https://evil.example" />);
    await goToCodeStep();
    submitCode("123456");

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("lets the user go back and change the number", async () => {
    useHandlers(otpRequestOk());

    renderWithProviders(<LoginFlow />);
    await goToCodeStep();
    fireEvent.click(
      screen.getByRole("button", { name: messages.auth.code.changeNumber }),
    );

    expect(
      screen.getByLabelText(messages.auth.phone.label),
    ).toBeInTheDocument();
  });

  it("disables resend until the retry_after countdown ends", async () => {
    // Only intervals are faked so MSW and Testing Library polling keep working.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    useHandlers(otpRequestOk(3));

    renderWithProviders(<LoginFlow />);
    await goToCodeStep();

    const waiting = messages.auth.code.resend.replace("{seconds}", "3");
    expect(screen.getByRole("button", { name: waiting })).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(
      screen.getByRole("button", { name: messages.auth.code.resendNow }),
    ).toBeEnabled();
  });

  it("resend asks for a new code and restarts the countdown", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let requests = 0;
    useHandlers(
      http.post("/api/auth/otp/request", ({ response }) => {
        requests += 1;
        return response(202).json({
          status: "sent",
          retry_after_seconds: 2,
          expires_in_seconds: 300,
        });
      }),
    );

    renderWithProviders(<LoginFlow />);
    await goToCodeStep();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    fireEvent.click(
      screen.getByRole("button", { name: messages.auth.code.resendNow }),
    );

    expect(
      await screen.findByRole("button", {
        name: messages.auth.code.resend.replace("{seconds}", "2"),
      }),
    ).toBeDisabled();
    expect(requests).toBe(2);
  });
});
