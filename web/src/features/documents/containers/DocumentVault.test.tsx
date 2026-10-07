import { fireEvent, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import { DocumentVault } from "./DocumentVault";
it("shows private documents with a same-origin download", async () => {
  server.use(
    http.get("*/api/trips/:id/documents", () =>
      HttpResponse.json([
        {
          id: "d1",
          trip_id: "t1",
          title: "Passport",
          kind: "id",
          mime: "application/pdf",
          size: 20,
          visibility: "owner_only",
          owner: { person_id: "p1", display_name: "A" },
          uploader: { person_id: "p1", display_name: "A" },
          valid_until: null,
          proposal_id: null,
          created_at: "2020-01-01",
          download_path: "/api/documents/d1/file",
          can_delete: true,
        },
      ]),
    ),
  );
  renderWithProviders(<DocumentVault tripId="t1" />);
  await screen.findByText("Passport");
  expect(screen.getByText("Solo vos")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Descargar Passport" }),
  ).toHaveAttribute("href", "/api/documents/d1/file");
});
it("rejects unsupported extensions before upload", async () => {
  server.use(
    http.get("*/api/trips/:id/documents", () => HttpResponse.json([])),
  );
  renderWithProviders(<DocumentVault tripId="t1" />);
  fireEvent.change(screen.getByLabelText("Archivo"), {
    target: {
      files: [new File(["x"], "fake.pdf.exe", { type: "application/pdf" })],
    },
  });
  await screen.findByRole("alert");
  expect(screen.getByRole("alert")).toHaveTextContent("Solo PDF o fotos");
});
it("forces IDs private and explains visibility", async () => {
  server.use(
    http.get("*/api/trips/:id/documents", () => HttpResponse.json([])),
  );
  renderWithProviders(<DocumentVault tripId="t1" />);
  fireEvent.change(screen.getByLabelText("Tipo de documento"), {
    target: { value: "id" },
  });
  expect(screen.getByLabelText("Visibilidad")).toBeDisabled();
  expect(screen.getByLabelText("Visibilidad")).toHaveValue("owner_only");
  expect(screen.getByText("Solo vos lo vas a ver")).toBeInTheDocument();
});
it("does not offer visibility changes to a non-owner", async () => {
  server.use(
    http.get("*/api/trips/:id/documents", () =>
      HttpResponse.json([
        {
          id: "d1",
          trip_id: "t1",
          title: "Ticket",
          kind: "ticket",
          mime: "application/pdf",
          size: 20,
          visibility: "crew",
          owner: { person_id: "other", display_name: "A" },
          uploader: { person_id: "other", display_name: "A" },
          valid_until: null,
          proposal_id: null,
          created_at: "2020-01-01",
          download_path: "/api/documents/d1/file",
          can_delete: false,
        },
      ]),
    ),
  );
  renderWithProviders(<DocumentVault tripId="t1" />);
  await screen.findByText("Ticket");
  fireEvent.click(screen.getByRole("button", { name: "Editar" }));
  expect(screen.getAllByLabelText("Visibilidad")).toHaveLength(1);
});
it("shows a layout-shaped skeleton while loading", () => {
  server.use(http.get("*/api/trips/:id/documents", () => new Promise(() => {})));
  const { container } = renderWithProviders(<DocumentVault tripId="t1" />);

  expect(screen.getByRole("status", { name: "Cargando…" })).toBeInTheDocument();
  expect(container.querySelectorAll(".ui-skeleton").length).toBeGreaterThanOrEqual(3);
});
it("shows an illustrated empty state whose call to action focuses the file input", async () => {
  server.use(
    http.get("*/api/trips/:id/documents", () => HttpResponse.json([])),
  );
  const { container } = renderWithProviders(<DocumentVault tripId="t1" />);
  await screen.findByText("Todavía no hay documentos");
  expect(container.querySelector("svg[data-scene='ticket']")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  expect(
    screen.getByText(
      "Subí reservas, pasajes y seguros para tenerlos a mano en el viaje",
    ),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Elegir un archivo" }));
  expect(screen.getByLabelText("Archivo")).toHaveFocus();
});
it("shows an inline error with a retry when the list fails, then recovers", async () => {
  let calls = 0;
  server.use(
    http.get("*/api/trips/:id/documents", () => {
      calls += 1;
      return calls === 1
        ? HttpResponse.json({ code: "boom" }, { status: 500 })
        : HttpResponse.json([]);
    }),
  );
  renderWithProviders(<DocumentVault tripId="t1" />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No pudimos cargar los documentos",
  );
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  await screen.findByText("Todavía no hay documentos");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(calls).toBe(2);
});
it("names the row actions and keeps them 44px icon buttons", async () => {
  server.use(
    http.get("*/api/trips/:id/documents", () =>
      HttpResponse.json([
        {
          id: "d1",
          trip_id: "t1",
          title: "Seguro",
          kind: "insurance",
          mime: "image/png",
          size: 2048,
          visibility: "crew",
          owner: { person_id: "p1", display_name: "A" },
          uploader: { person_id: "p1", display_name: "A" },
          valid_until: "2027-07-01",
          proposal_id: null,
          created_at: "2020-01-01",
          download_path: "/api/documents/d1/file",
          can_delete: true,
        },
      ]),
    ),
  );
  renderWithProviders(<DocumentVault tripId="t1" />);
  await screen.findByRole("heading", { name: "Seguro", level: 4 });
  expect(screen.getByRole("button", { name: "Editar" })).toHaveClass("ui-button-icon");
  expect(screen.getByRole("button", { name: "Eliminar" })).toHaveClass("ui-button-icon");
  expect(screen.getByRole("link", { name: "Ver" })).toHaveAttribute("href", "/api/documents/d1/file?inline=true");
  expect(screen.getByText(/2 KB/)).toBeInTheDocument();
  expect(screen.getByText(/Vence el/)).toBeInTheDocument();
});
