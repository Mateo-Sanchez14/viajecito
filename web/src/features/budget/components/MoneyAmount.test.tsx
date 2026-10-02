import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { MoneyAmount } from "./MoneyAmount";
it.each(["ARS", "CLP"])("formats %s without decimals", (currency) => {
  render(<MoneyAmount amount="120.50" currency={currency} />);
  expect(screen.getByText(/121/)).toBeInTheDocument();
});
it("keeps USD cents", () => {
  render(<MoneyAmount amount="120.50" currency="USD" />);
  expect(screen.getByText(/120,50/)).toBeInTheDocument();
});
