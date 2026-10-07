import { fireEvent, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import { BudgetView } from "./BudgetView";
it("shows per-person cost, missing FX and submits rates", async () => {
  let saved: unknown;
  const budget = {
    currency: "ARS",
    participants: 2,
    participants_basis: "in",
    lines: [],
    by_category: {},
    committed: "0",
    expected: "240",
    total: "240",
    per_person: "120",
    remainder: "0",
    unconverted: [
      {
        proposal_id: "p",
        title: "Cabin",
        category: "lodging",
        status: "chosen",
        price_basis: "total",
        original_amount: "10",
        original_currency: "USD",
        nights: null,
        nights_assumed: false,
        amount: null,
        per_person: null,
      },
    ],
    missing_price: [],
    fx_rates: {},
    gastito_url: null,
  };
  server.use(
    http.get("*/api/trips/:id/budget", () => HttpResponse.json(budget)),
    http.get("*/api/auth/csrf", () => HttpResponse.json({ csrf_token: "tok" })),
    http.put("*/api/trips/:id/budget/fx_rates", async ({ request }) => {
      saved = await request.json();
      return HttpResponse.json({ ...budget, unconverted: [] });
    }),
  );
  renderWithProviders(<BudgetView tripId="t1" crewId="c1" />);
  await screen.findByText("por persona");
  expect(screen.getByText("por persona")).toHaveTextContent(/120.*por persona/);
  expect(screen.getByText("Falta la cotización de USD")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Moneda"), {
    target: { value: "USD" },
  });
  fireEvent.change(screen.getByLabelText("Cotización"), {
    target: { value: "0.001" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar cotización" }));
  await screen.findByText("Cotización guardada");
  expect(saved).toEqual({ rates: { USD: "0.001" } });
});

const baseBudget = {
  currency: "ARS",
  participants: 2,
  participants_basis: "in",
  lines: [],
  by_category: {},
  committed: "0",
  expected: "0",
  total: "0",
  per_person: "0",
  remainder: "0",
  unconverted: [],
  missing_price: [],
  fx_rates: {},
  gastito_url: null,
};

it("shows a layout-shaped skeleton while loading", () => {
  server.use(http.get("*/api/trips/:id/budget", () => new Promise(() => {})));
  const { container } = renderWithProviders(<BudgetView tripId="t1" crewId="c1" />);

  expect(screen.getByRole("status", { name: "Cargando…" })).toBeInTheDocument();
  expect(container.querySelectorAll(".ui-skeleton").length).toBeGreaterThanOrEqual(4);
});

it("shows an illustrated empty state with the explanation when nothing is priced yet", async () => {
  server.use(http.get("*/api/trips/:id/budget", () => HttpResponse.json(baseBudget)));
  const { container } = renderWithProviders(<BudgetView tripId="t1" crewId="c1" />);

  await screen.findByText("Todavía no hay plata en juego");
  expect(screen.getByText("Cuando elijan propuestas con precio, acá ves cuánto sale")).toBeInTheDocument();
  expect(container.querySelector("svg[data-scene='coins']")).toHaveAttribute("aria-hidden", "true");
  expect(screen.queryByText("por persona")).not.toBeInTheDocument();
  // The exchange-rate form stays available.
  expect(screen.getByLabelText("Moneda")).toBeInTheDocument();
});

it("shows an inline error with a retry that asks the api again and then recovers", async () => {
  let calls = 0;
  server.use(
    http.get("*/api/trips/:id/budget", () => {
      calls += 1;
      return calls === 1
        ? HttpResponse.json({ code: "boom", message: "x" }, { status: 500 })
        : HttpResponse.json({
            ...baseBudget,
            expected: "100",
            total: "100",
            per_person: "50",
            lines: [
              {
                proposal_id: "p1",
                title: "Cabin",
                category: "lodging",
                status: "booked",
                price_basis: "total",
                original_amount: "100",
                original_currency: "ARS",
                nights: null,
                nights_assumed: false,
                amount: "100",
                per_person: "50",
              },
            ],
            by_category: { lodging: "100" },
          });
    }),
  );
  renderWithProviders(<BudgetView tripId="t1" crewId="c1" />);

  expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar el presupuesto");
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  await screen.findByText("por persona");
  expect(calls).toBe(2);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("lists priced lines per category with a state badge", async () => {
  server.use(
    http.get("*/api/trips/:id/budget", () =>
      HttpResponse.json({
        ...baseBudget,
        committed: "100",
        expected: "50",
        total: "150",
        per_person: "75",
        by_category: { lodging: "100", food: "50" },
        lines: [
          { proposal_id: "a", title: "Cabin", category: "lodging", status: "booked", price_basis: "total", original_amount: "100", original_currency: "ARS", nights: null, nights_assumed: true, amount: "100", per_person: "50" },
          { proposal_id: "b", title: "Asado", category: "food", status: "chosen", price_basis: "total", original_amount: "50", original_currency: "ARS", nights: null, nights_assumed: false, amount: "50", per_person: "25" },
        ],
        missing_price: [{ proposal_id: "c", title: "Kayak", category: "activity", status: "chosen" }],
      }),
    ),
  );
  renderWithProviders(<BudgetView tripId="t1" crewId="c1" />);

  await screen.findByText("Cabin");
  expect(screen.getByRole("heading", { name: /Alojamiento/ })).toBeInTheDocument();
  expect(screen.getByText("Se asumió una noche")).toBeInTheDocument();
  // One in the totals grid and one as the badge of the chosen line.
  expect(screen.getAllByText("Elegido, falta reservar")).toHaveLength(2);
  expect(screen.getByText("Sin precio: Kayak")).toBeInTheDocument();
});

it("shows the gastito link only for https addresses", async () => {
  server.use(
    http.get("*/api/trips/:id/budget", () =>
      HttpResponse.json({ ...baseBudget, gastito_url: "https://gastito.example/g/1" }),
    ),
  );
  renderWithProviders(<BudgetView tripId="t1" crewId="c1" />);

  expect(await screen.findByRole("link", { name: "Cargá los gastos en gastito" })).toHaveAttribute(
    "href",
    "https://gastito.example/g/1",
  );
});
