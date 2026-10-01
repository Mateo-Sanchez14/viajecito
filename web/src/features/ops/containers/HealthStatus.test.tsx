import { screen } from "@testing-library/react";
import { HttpResponse } from "msw";
import { createOpenApiHttp } from "openapi-msw";
import { describe, expect, it } from "vitest";
import type { paths } from "@/shared/api/schema";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import { renderWithProviders } from "@/test/render";
import { HealthStatus } from "./HealthStatus";

const http = createOpenApiHttp<paths>({ baseUrl: globalThis.location.origin });

describe("HealthStatus", () => {
  it("shows a loading hint while the request is in flight", () => {
    server.use(http.get("/api/health", () => new Promise(() => {})));

    renderWithProviders(<HealthStatus />);

    expect(screen.getByText(messages.ops.health.loading)).toBeInTheDocument();
  });

  it("shows the ok badge when the api is healthy", async () => {
    server.use(
      http.get("/api/health", ({ response }) =>
        response(200).json({
          status: "ok",
          version: "0.1.0",
          checks: { db: "ok", media: "ok" },
        }),
      ),
    );

    renderWithProviders(<HealthStatus />);

    expect(await screen.findByText(messages.ops.health.ok)).toBeInTheDocument();
    expect(screen.getByText(`${messages.ops.health.checks.db}: ${messages.ops.health.check.ok}`)).toBeInTheDocument();
  });

  it("shows the degraded badge and the failing check on a 503", async () => {
    server.use(
      http.get("/api/health", ({ response }) =>
        response(503).json({
          status: "degraded",
          version: "0.1.0",
          checks: { db: "error", media: "ok" },
        }),
      ),
    );

    renderWithProviders(<HealthStatus />);

    expect(await screen.findByText(messages.ops.health.degraded)).toBeInTheDocument();
    expect(
      screen.getByText(
        `${messages.ops.health.checks.db}: ${messages.ops.health.check.error}`,
      ),
    ).toBeInTheDocument();
  });

  it("shows the error copy when the network fails", async () => {
    server.use(
      http.untyped.get(`${globalThis.location.origin}/api/health`, () =>
        HttpResponse.error(),
      ),
    );

    renderWithProviders(<HealthStatus />);

    expect(
      await screen.findByText(messages.ops.health.error),
    ).toBeInTheDocument();
  });

  it("shows the error copy for a 500 with a JSON body", async () => {
    server.use(
      http.untyped.get(`${globalThis.location.origin}/api/health`, () =>
        HttpResponse.json({ detail: "boom" }, { status: 500 }),
      ),
    );

    renderWithProviders(<HealthStatus />);

    expect(
      await screen.findByText(messages.ops.health.error),
    ).toBeInTheDocument();
  });

  it("shows the error copy for a 502 html page from the proxy", async () => {
    server.use(
      http.untyped.get(
        `${globalThis.location.origin}/api/health`,
        () =>
          new HttpResponse("<html>Bad Gateway</html>", {
            status: 502,
            headers: { "Content-Type": "text/html" },
          }),
      ),
    );

    renderWithProviders(<HealthStatus />);

    expect(
      await screen.findByText(messages.ops.health.error),
    ).toBeInTheDocument();
  });

  it("shows the error copy for a 503 whose body is not a health payload", async () => {
    server.use(
      http.untyped.get(`${globalThis.location.origin}/api/health`, () =>
        HttpResponse.json({ detail: "nope" }, { status: 503 }),
      ),
    );

    renderWithProviders(<HealthStatus />);

    expect(
      await screen.findByText(messages.ops.health.error),
    ).toBeInTheDocument();
  });
});
