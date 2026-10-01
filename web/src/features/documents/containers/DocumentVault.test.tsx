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
