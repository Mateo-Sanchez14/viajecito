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
it("reloads stored quantities and edits or clears them through PATCH", async () => {
  let quantity: number | null = 3;
  const entry = () => ({
    id: "p1",
    section: "custom",
    item_key: null,
    label: "Socks",
    quantity,
    packed: false,
    position: 0,
  });
  server.use(
    http.get("*/api/trips/:id/packing/summary", () => HttpResponse.json([])),
    http.get("*/api/trips/:id/packing/me", () =>
      HttpResponse.json({
        templates_available: [],
        applied: [],
        sections: [{ key: "custom", label: "Custom", entries: [entry()] }],
        progress: { packed: 0, total: 1 },
      }),
    ),
    http.get("*/api/auth/csrf", () => HttpResponse.json({ csrf_token: "tok" })),
    http.patch("*/api/packing_entries/:id", async ({ request }) => {
      const body = await request.json() as { quantity: number | null };
      quantity = body.quantity;
      return HttpResponse.json(entry());
    }),
  );
  const view = renderWithProviders(<PackingList tripId="t1" />);
  const input = await screen.findByRole("spinbutton", { name: "Cantidad de Socks" });
  expect(input).toHaveValue(3);
  fireEvent.change(input, { target: { value: "4" } });
  fireEvent.blur(input);
  await waitFor(() => expect(quantity).toBe(4));
  view.unmount();
  renderWithProviders(<PackingList tripId="t1" />);
  const reloaded = await screen.findByRole("spinbutton", { name: "Cantidad de Socks" });
  expect(reloaded).toHaveValue(4);
  fireEvent.change(reloaded, { target: { value: "32768" } });
  expect((reloaded as HTMLInputElement).checkValidity()).toBe(false);
  fireEvent.blur(reloaded);
  expect(quantity).toBe(4);
  fireEvent.change(reloaded, { target: { value: "" } });
  fireEvent.blur(reloaded);
  await waitFor(() => expect(quantity).toBeNull());
});
it("shows a skeleton while loading and an illustrated empty state without sections", async () => {
  server.use(
    http.get("*/api/trips/:id/packing/summary", () => HttpResponse.json([])),
    http.get("*/api/trips/:id/packing/me", () =>
      HttpResponse.json({ templates_available: [], applied: [], sections: [], progress: { packed: 0, total: 0 } }),
    ),
  );
  const view = renderWithProviders(<PackingList tripId="t1" />);

  expect(screen.getByRole("status", { name: "Cargando…" })).toBeInTheDocument();
  await screen.findByText("Arrancá con una lista armada");
  expect(view.container.querySelector("svg[data-scene='suitcase']")).toBeInTheDocument();
  expect(screen.getByRole("progressbar", { name: "Valija" })).toHaveAttribute("aria-valuenow", "0");
});
it("exposes packing progress as a progressbar and lists the crew with their own meters", async () => {
  server.use(
    http.get("*/api/trips/:id/packing/me", () =>
      HttpResponse.json({
        templates_available: [],
        applied: [],
        sections: [],
        progress: { packed: 1, total: 4 },
      }),
    ),
    http.get("*/api/trips/:id/packing/summary", () =>
      HttpResponse.json([{ person: { person_id: "p", display_name: "Lucia" }, packed: 3, total: 4 }]),
    ),
  );
  renderWithProviders(<PackingList tripId="t1" />);

  await screen.findByText("1 de 4 en la valija");
  expect(screen.getByRole("progressbar", { name: "Valija" })).toHaveAttribute("aria-valuenow", "25");
  expect(await screen.findByRole("progressbar", { name: "Lucia" })).toHaveAttribute("aria-valuenow", "75");
  expect(screen.getByText("3 de 4 en la valija")).toBeInTheDocument();
});
it("shows an inline error with a retry when the packing list fails", async () => {
  let calls = 0;
  server.use(
    http.get("*/api/trips/:id/packing/summary", () => HttpResponse.json([])),
    http.get("*/api/trips/:id/packing/me", () => {
      calls += 1;
      return calls === 1
        ? HttpResponse.json({ code: "boom" }, { status: 500 })
        : HttpResponse.json({ templates_available: [], applied: [], sections: [], progress: { packed: 0, total: 0 } });
    }),
  );
  renderWithProviders(<PackingList tripId="t1" />);

  expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar la lista");
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  await screen.findByText("Arrancá con una lista armada");
});
