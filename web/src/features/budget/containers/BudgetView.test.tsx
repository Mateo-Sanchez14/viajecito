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
