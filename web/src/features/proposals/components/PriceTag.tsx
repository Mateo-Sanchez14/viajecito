"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { PriceBasis } from "../api/proposals";

type PriceTagProps = { amount: string | null; currency: string; basis: PriceBasis };

/** Estimated price as "US$ 1.500,00 por noche"; renders nothing when there is no price. */
export function PriceTag({ amount, currency, basis }: PriceTagProps) {
  const t = useTranslations("proposals.price");
  const format = useFormatter();
  if (amount === null) return null;

  let formatted: string;
  try {
    formatted = format.number(Number(amount), { style: "currency", currency });
  } catch {
    formatted = `${amount} ${currency}`;
  }
  const suffix = basis === "per_person" ? t("perPerson") : basis === "per_night" ? t("perNight") : "";

  return <span className="text-sm font-medium">{suffix ? `${formatted} ${suffix}` : formatted}</span>;
}
