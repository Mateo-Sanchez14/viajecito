import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import { PackingList } from "./PackingList";
it("applies a template and updates packed progress", async () => {
  const entry = {
    id: "p1",
    section: "tech",
    item_key: "charger",
    label: "Cargador",
    quantity: null,
    packed: false,
    position: 0,
  };
  let applied = false;
  let packed = false;
  const body = () => ({
    templates_available: [{ key: "generic", label: "Básica" }],
    applied: applied ? ["generic"] : [],
    sections: applied
      ? [{ key: "tech", label: "Tecnología", entries: [{ ...entry, packed }] }]
      : [],
    progress: { packed: packed ? 1 : 0, total: applied ? 1 : 0 },
  });
  server.use(
    http.get("*/api/trips/:id/packing/summary", () => HttpResponse.json([])),
    http.get("*/api/trips/:id/packing/me", () => HttpResponse.json(body())),
    http.get("*/api/auth/csrf", () => HttpResponse.json({ csrf_token: "tok" })),
    http.post("*/api/trips/:id/packing/me/apply", () => {
      applied = true;
      return HttpResponse.json(body());
    }),
    http.patch("*/api/packing_entries/:id", () => {
      packed = true;
      return HttpResponse.json({ ...entry, packed });
    }),
  );
  renderWithProviders(<PackingList tripId="t1" />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Usar la lista Básica" }),
  );
  fireEvent.click(await screen.findByRole("checkbox", { name: "Cargador" }));
  await screen.findByText("1 de 1 en la valija");
});
it("adds a custom item with quantity and section", async () => {
  let body: unknown;
  server.use(
    http.get("*/api/trips/:id/packing/me", () =>
      HttpResponse.json({
        templates_available: [],
        applied: [],
        sections: [],
        progress: { packed: 0, total: 0 },
      }),
    ),
    http.get("*/api/trips/:id/packing/summary", () => HttpResponse.json([])),
    http.get("*/api/auth/csrf", () => HttpResponse.json({ csrf_token: "tok" })),
    http.post("*/api/trips/:id/packing/me/entries", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({
        id: "p",
        section: "tech",
        item_key: null,
        label: "Cables",
        quantity: 2,
        packed: false,
        position: 0,
      });
    }),
  );
  renderWithProviders(<PackingList tripId="t1" />);
  fireEvent.change(screen.getByLabelText("Ítem"), {
    target: { value: "Cables" },
  });
  fireEvent.change(screen.getByLabelText("Cantidad"), {
    target: { value: "2" },
  });
  fireEvent.change(screen.getByLabelText("Sección"), {
    target: { value: "tech" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Agregar a la valija" }));
  await waitFor(() =>
    expect(body).toEqual({ label: "Cables", section: "tech", quantity: 2 }),
  );
});
