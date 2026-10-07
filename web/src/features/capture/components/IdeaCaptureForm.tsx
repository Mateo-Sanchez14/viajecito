"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { PRICE_BASES, type PriceBasis, type Proposal } from "@/features/proposals/api/proposals";
import { Button } from "@/ui/atoms/Button";
import { Input } from "@/ui/atoms/Input";
import { Select } from "@/ui/atoms/Select";
import { useCaptureProposal } from "../hooks/useCaptureMutations";
import { useFocusOnMount } from "../hooks/useFocusOnMount";
import { toCaptureError, type CaptureErrorKey } from "../lib/errors";
import { parseCapturePrice } from "../lib/price";

const CURRENCY = /^[A-Za-z]{3}$/;

type IdeaCaptureFormProps = {
  tripId: string | null;
  /** The trip's currency: what the form starts with (USD until the trip is known). */
  defaultCurrency: string;
  onBack: () => void;
  onCreated: (proposal: Proposal) => void;
};

type FieldErrors = Partial<Record<"title" | "price" | "currency", CaptureErrorKey | "titleRequired" | "priceInvalid" | "currencyInvalid">>;

/**
 * A priced idea is a plain proposal with an estimated price. The api keeps its default status
 * and nothing here moves it: it only counts in the budget once the crew chooses it.
 */
export function IdeaCaptureForm({ tripId, defaultCurrency, onBack, onCreated }: IdeaCaptureFormProps) {
  const t = useTranslations("capture");
  const create = useCaptureProposal(tripId);
  const titleRef = useFocusOnMount<HTMLInputElement>();
  const ids = { title: useId(), price: useId(), currency: useId() };
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<string | null>(null);
  const [basis, setBasis] = useState<PriceBasis>("total");
  const [errors, setErrors] = useState<FieldErrors>({});
  const shownCurrency = currency ?? defaultCurrency;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (create.isPending || !tripId) return;

    const amount = parseCapturePrice(price);
    const found: FieldErrors = {};
    if (!title.trim()) found.title = "titleRequired";
    if (amount === null) found.price = "priceInvalid";
    if (!CURRENCY.test(shownCurrency.trim())) found.currency = "currencyInvalid";
    setErrors(found);
    if (Object.keys(found).length > 0 || amount === null) return;

    // No `status`: the proposal starts with the api default and is never transitioned from here.
    create.mutate(
      { title: title.trim(), est_price: amount, currency: shownCurrency.trim().toUpperCase(), price_basis: basis },
      {
        onSuccess: onCreated,
        onError: (failure) => setErrors({ title: toCaptureError(failure).key }),
      },
    );
  }

  const field = (name: keyof FieldErrors) =>
    errors[name] ? (
      <p id={ids[name]} role="alert" className="capture-error">
        {t(`errors.${errors[name]}`)}
      </p>
    ) : null;

  return (
    <form noValidate onSubmit={onSubmit} className="capture-form" aria-label={t("idea.title")}>
      <label className="ui-field">
        {t("idea.name")}
        <Input
          ref={titleRef}
          value={title}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
          invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? ids.title : undefined}
        />
      </label>
      {field("title")}
      <div className="capture-price-row">
        <label className="ui-field">
          {t("idea.price")}
          <Input
            inputMode="decimal"
            autoComplete="off"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            invalid={Boolean(errors.price)}
            aria-describedby={errors.price ? ids.price : undefined}
          />
        </label>
        <label className="ui-field">
          {t("idea.currency")}
          <Input
            value={shownCurrency}
            maxLength={3}
            autoCapitalize="characters"
            onChange={(event) => setCurrency(event.target.value)}
            invalid={Boolean(errors.currency)}
            aria-describedby={errors.currency ? ids.currency : undefined}
          />
        </label>
      </div>
      {field("price")}
      {field("currency")}
      <label className="ui-field">
        {t("idea.basis")}
        <Select value={basis} onChange={(event) => setBasis(event.target.value as PriceBasis)}>
          {PRICE_BASES.map((value) => (
            <option key={value} value={value}>
              {t(`idea.basisOption.${value}`)}
            </option>
          ))}
        </Select>
      </label>
      <p className="ui-hint">{t("idea.budgetNote")}</p>
      {!tripId && <p className="ui-hint">{t("errors.tripRequired")}</p>}
      <div className="capture-actions">
        <Button type="submit" className="ui-button-auto" disabled={create.isPending || !tripId}>
          {create.isPending ? t("idea.submitting") : t("idea.submit")}
        </Button>
        <Button variant="secondary" onClick={onBack}>
          {t("back")}
        </Button>
      </div>
    </form>
  );
}
