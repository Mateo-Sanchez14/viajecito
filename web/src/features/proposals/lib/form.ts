import type { Category, PriceBasis, Proposal, ProposalCreate, ProposalPatch } from "../api/proposals";

export type FormValues = {
  url: string;
  title: string;
  category: Category | "";
  note: string;
  price: string;
  currency: string;
  basis: PriceBasis;
  startsOn: string;
  endsOn: string;
};

export type FormField = "url" | "title" | "price" | "currency" | "dates";
export type FormErrorKey =
  | "urlInvalid"
  | "needUrlOrTitle"
  | "invalid_price"
  | "titleRequired"
  | "currencyInvalid"
  | "endBeforeStart";
export type FormErrors = Partial<Record<FormField, FormErrorKey>>;

const CURRENCY = /^[A-Za-z]{3}$/;

export function emptyValues(currency: string): FormValues {
  return {
    url: "",
    title: "",
    category: "",
    note: "",
    price: "",
    currency,
    basis: "total",
    startsOn: "",
    endsOn: "",
  };
}

export function valuesFromProposal(proposal: Proposal, fallbackCurrency: string): FormValues {
  return {
    url: "",
    title: proposal.title,
    category: proposal.category,
    note: proposal.note,
    price: proposal.est_price ?? "",
    currency: proposal.currency || fallbackCurrency,
    basis: proposal.price_basis,
    startsOn: proposal.starts_on ?? "",
    endsOn: proposal.ends_on ?? "",
  };
}

/** Trims and adds the scheme to a bare `www.` host, like the api's link extraction does. */
export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  return /^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const THOUSANDS = /^\d{1,3}(\.\d{3})+$/;

/**
 * Reads an amount the way an Argentine user types it and returns a two-place decimal string,
 * or null when it is malformed or ambiguous. `,` is the decimal separator; `.` is a decimal
 * point only when followed by 1-2 digits, and a thousands separator when followed by 3.
 * "1.500" is 1500 (never 1.50), "1.500,50" is 1500.50, "1500.5" is 1500.50.
 */
export function parsePrice(raw: string): string | null {
  const value = raw.trim();
  let integer: string;
  let fraction = "";
  if (value.includes(",")) {
    const parts = value.split(",");
    if (parts.length !== 2 || !/^\d{1,2}$/.test(parts[1])) return null;
    [integer, fraction] = parts;
  } else if (/^\d+\.\d{1,2}$/.test(value)) {
    [integer, fraction] = value.split(".");
  } else {
    integer = value;
  }
  if (THOUSANDS.test(integer)) integer = integer.replaceAll(".", "");
  if (!/^\d+$/.test(integer)) return null;
  return Number(`${integer}.${fraction || "0"}`).toFixed(2);
}

export function validateProposal(
  values: FormValues,
  { requireUrlOrTitle, requireTitle = false }: { requireUrlOrTitle: boolean; requireTitle?: boolean },
): FormErrors {
  const errors: FormErrors = {};
  const url = normalizeUrl(values.url);
  if (url && !isHttpUrl(url)) errors.url = "urlInvalid";
  else if (requireUrlOrTitle && !url && !values.title.trim()) errors.url = "needUrlOrTitle";
  if (requireTitle && !values.title.trim()) errors.title = "titleRequired";
  if (values.price.trim() && parsePrice(values.price) === null) errors.price = "invalid_price";
  if (values.currency.trim() && !CURRENCY.test(values.currency.trim())) errors.currency = "currencyInvalid";
  if (values.startsOn && values.endsOn && values.endsOn < values.startsOn) errors.dates = "endBeforeStart";
  return errors;
}

/** Only what was filled in: the api classifies, titles and defaults the rest. */
export function toCreateBody(values: FormValues): ProposalCreate {
  const body: ProposalCreate = {};
  const url = normalizeUrl(values.url);
  if (url) body.url = url;
  if (values.title.trim()) body.title = values.title.trim();
  if (values.category) body.category = values.category;
  if (values.note.trim()) body.note = values.note.trim();
  if (values.price.trim()) {
    body.est_price = parsePrice(values.price) ?? undefined;
    body.currency = values.currency.trim().toUpperCase();
    body.price_basis = values.basis;
  }
  if (values.startsOn) body.starts_on = values.startsOn;
  if (values.endsOn) body.ends_on = values.endsOn;
  return body;
}

/** Edit sends every editable field; an emptied price or date clears it (`null`). */
export function toPatchBody(values: FormValues): ProposalPatch {
  const price = values.price.trim() === "" ? null : parsePrice(values.price);
  return {
    ...(values.title.trim() ? { title: values.title.trim() } : {}),
    note: values.note.trim(),
    category: values.category || undefined,
    est_price: price,
    currency: values.currency.trim().toUpperCase() || undefined,
    price_basis: values.basis,
    starts_on: values.startsOn || null,
    ends_on: values.endsOn || null,
  };
}
