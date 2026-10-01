import { describe, expect, it } from "vitest";
import {
  emptyValues,
  normalizeUrl,
  parsePrice,
  toCreateBody,
  toPatchBody,
  validateProposal,
  valuesFromProposal,
} from "./form";
import { makeProposal } from "../test/handlers";

const base = emptyValues("USD");

describe("validateProposal", () => {
  it("requires a link or a title when creating", () => {
    expect(validateProposal(base, { requireUrlOrTitle: true })).toEqual({ url: "needUrlOrTitle" });
    expect(validateProposal({ ...base, title: "Cabana" }, { requireUrlOrTitle: true })).toEqual({});
    expect(validateProposal({ ...base, url: "https://a.com/x" }, { requireUrlOrTitle: true })).toEqual({});
  });

  it("does not require either when editing", () => {
    expect(validateProposal(base, { requireUrlOrTitle: false })).toEqual({});
  });

  it("rejects a link that is not http(s)", () => {
    expect(validateProposal({ ...base, url: "ftp://a.com" }, { requireUrlOrTitle: true }).url).toBe("urlInvalid");
    expect(validateProposal({ ...base, url: "hola que tal" }, { requireUrlOrTitle: true }).url).toBe("urlInvalid");
  });

  it("accepts a bare www host", () => {
    expect(validateProposal({ ...base, url: "www.booking.com/x" }, { requireUrlOrTitle: true })).toEqual({});
    expect(normalizeUrl("www.booking.com/x")).toBe("https://www.booking.com/x");
  });

  it("reads Argentine and plain decimals without ever shrinking an amount", () => {
    const cases: Record<string, string> = {
      "0": "0.00",
      "1500": "1500.00",
      "1500.5": "1500.50",
      "1500,50": "1500.50",
      "1500,5": "1500.50",
      "1.500": "1500.00",
      "1.500,50": "1500.50",
      "1.234.567": "1234567.00",
      "12.50": "12.50",
    };
    for (const [input, expected] of Object.entries(cases)) {
      expect(parsePrice(input), input).toBe(expected);
      expect(validateProposal({ ...base, title: "x", price: input }, { requireUrlOrTitle: true }).price).toBeUndefined();
    }
  });

  it("rejects ambiguous or malformed prices", () => {
    for (const bad of ["-1", "abc", "1.5000", "1,2,3", "1.2.3", "1,500.50", "1.500,5,0", "1,234", ".5", "1.", "1 500"]) {
      expect(parsePrice(bad), bad).toBeNull();
      expect(validateProposal({ ...base, title: "x", price: bad }, { requireUrlOrTitle: true }).price, bad).toBe(
        "invalid_price",
      );
    }
  });

  it("requires a title when editing and never lets it be blank", () => {
    const values = { ...base, title: "   " };

    expect(validateProposal(values, { requireUrlOrTitle: false, requireTitle: true }).title).toBe("titleRequired");
    expect(validateProposal({ ...values, title: "ok" }, { requireUrlOrTitle: false, requireTitle: true })).toEqual({});
    expect(toPatchBody(values)).not.toHaveProperty("title");
  });

  it("checks the currency code and the date order", () => {
    expect(validateProposal({ ...base, title: "x", currency: "US" }, { requireUrlOrTitle: true }).currency).toBe(
      "currencyInvalid",
    );
    expect(
      validateProposal(
        { ...base, title: "x", startsOn: "2027-07-08", endsOn: "2027-07-01" },
        { requireUrlOrTitle: true },
      ).dates,
    ).toBe("endBeforeStart");
    expect(
      validateProposal(
        { ...base, title: "x", startsOn: "2027-07-01", endsOn: "2027-07-01" },
        { requireUrlOrTitle: true },
      ).dates,
    ).toBeUndefined();
  });
});

describe("request bodies", () => {
  it("sends only what was filled in, with a normalized price and upper-case currency", () => {
    const body = toCreateBody({
      ...base,
      url: " www.airbnb.com/rooms/1 ",
      category: "lodging",
      note: " cerca del lago ",
      price: "1500,5",
      currency: "usd",
      basis: "per_night",
      startsOn: "2027-07-01",
    });

    expect(body).toEqual({
      url: "https://www.airbnb.com/rooms/1",
      category: "lodging",
      note: "cerca del lago",
      est_price: "1500.50",
      currency: "USD",
      price_basis: "per_night",
      starts_on: "2027-07-01",
    });
  });

  it("omits empty fields on create (the api classifies and defaults them)", () => {
    expect(toCreateBody({ ...base, title: "Cabana" })).toEqual({ title: "Cabana" });
  });

  it("clears the price and dates on edit when the fields are emptied", () => {
    const values = valuesFromProposal(
      makeProposal({ est_price: "100.00", starts_on: "2027-07-01", ends_on: "2027-07-02", note: "n" }),
      "USD",
    );

    expect(toPatchBody({ ...values, price: "", startsOn: "", endsOn: "", note: "" })).toMatchObject({
      est_price: null,
      starts_on: null,
      ends_on: null,
      note: "",
    });
  });

  it("round-trips a proposal into form values", () => {
    const values = valuesFromProposal(makeProposal({ est_price: "1234.50", currency: "ARS", price_basis: "per_person" }), "USD");

    expect(values).toMatchObject({ title: "Llao Llao Resort", price: "1234.50", currency: "ARS", basis: "per_person" });
  });
});
