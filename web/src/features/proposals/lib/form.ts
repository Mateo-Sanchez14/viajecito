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

export type FormField = "url" | "price" | "currency" | "dates";
export type FormErrorKey =
  | "urlInvalid"
  | "needUrlOrTitle"
  | "priceInvalid"
  | "currencyInvalid"
  | "endBeforeStart";
export type FormErrors = Partial<Record<FormField, FormErrorKey>>;

const PRICE = /^\d+([.,]\d{1,2})?$/;
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

/** "1500,5" -> "1500.50": a decimal string with two places, as the api expects. */
function normalizePrice(value: string): string {
  return Number(value.trim().replace(",", ".")).toFixed(2);
}

export function validateProposal(
  values: FormValues,
  { requireUrlOrTitle }: { requireUrlOrTitle: boolean },
): FormErrors {
  const errors: FormErrors = {};
  const url = normalizeUrl(values.url);
  if (url && !isHttpUrl(url)) errors.url = "urlInvalid";
  else if (requireUrlOrTitle && !url && !values.title.trim()) errors.url = "needUrlOrTitle";
  if (values.price.trim() && !PRICE.test(values.price.trim())) errors.price = "priceInvalid";
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
    body.est_price = normalizePrice(values.price);
    body.currency = values.currency.trim().toUpperCase();
    body.price_basis = values.basis;
  }
  if (values.startsOn) body.starts_on = values.startsOn;
  if (values.endsOn) body.ends_on = values.endsOn;
  return body;
}

/** Edit sends every editable field; an emptied price or date clears it (`null`). */
export function toPatchBody(values: FormValues): ProposalPatch {
  const hasPrice = values.price.trim() !== "";
  return {
    title: values.title.trim(),
    note: values.note.trim(),
    category: values.category || undefined,
    est_price: hasPrice ? normalizePrice(values.price) : null,
    currency: values.currency.trim().toUpperCase() || undefined,
    price_basis: values.basis,
    starts_on: values.startsOn || null,
    ends_on: values.endsOn || null,
  };
}
