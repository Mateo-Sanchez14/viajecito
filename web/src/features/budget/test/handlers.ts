import { http, HttpResponse } from "msw";
import type { Budget } from "../api/budget";
export function makeBudget(overrides: Partial<Budget> = {}): Budget {
  return {
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
    unconverted: [],
    missing_price: [],
    fx_rates: {},
    gastito_url: null,
    ...overrides,
  };
}
export function budgetHandlers(budget: Budget = makeBudget()) {
  return [http.get("*/api/trips/:id/budget", () => HttpResponse.json(budget))];
}
