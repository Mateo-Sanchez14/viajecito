import { fireEvent, screen } from "@testing-library/react";
import { createOpenApiHttp } from "openapi-msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCsrfToken } from "@/shared/api/csrf";
import type { paths } from "@/shared/api/schema";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR.json";
import { MeProvider } from "../MeProvider";
import { ShellHeader } from "./ShellHeader";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const http = createOpenApiHttp<paths>({ baseUrl: globalThis.location.origin });
const me = {
  person: {
    id: "7b9f6d52-5d3a-4c53-9a3e-1d0c3f4d9b11",
    phone: "+5491155551234",
    display_name: "Mateo",
    locale: "es-AR",
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

describe("ShellHeader", () => {
  beforeEach(() => replace.mockReset());
  afterEach(() => resetCsrfToken());

  it("greets the person by display name", () => {
    renderHeader();

    expect(
      screen.getByText(messages.home.greeting.replace("{name}", "Mateo")),
    ).toBeInTheDocument();
    expect(screen.getByText(messages.app.name)).toBeInTheDocument();
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
