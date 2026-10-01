"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/ui/atoms/Input";
import { Select } from "@/ui/atoms/Select";
import { Textarea } from "@/ui/atoms/Textarea";
import { CATEGORIES, PRICE_BASES, type Category, type PriceBasis } from "../api/proposals";
import type { FormErrors, FormField, FormValues } from "../lib/form";

type ProposalFormFieldsProps = {
  values: FormValues;
  errors: FormErrors;
  onChange: (patch: Partial<FormValues>) => void;
  /** The add form takes a link and lets the api pick the category; the edit form does neither. */
  mode: "add" | "edit";
};

const BASIS_KEY = { total: "total", per_person: "perPerson", per_night: "perNight" } as const satisfies Record<
  PriceBasis,
  string
>;

/** Controlled fields shared by the add and edit forms. */
export function ProposalFormFields({ values, errors, onChange, mode }: ProposalFormFieldsProps) {
  const t = useTranslations("proposals");
  const id = useId();
  const err = (field: FormField) => {
    const key = errors[field];
    if (!key) return null;
    return key === "invalid_price" ? t("errors.invalid_price") : t(`add.errors.${key}`);
  };
  const describedBy = (field: FormField) => (errors[field] ? `${id}-${field}-error` : undefined);
  const fieldError = (field: FormField, className = "") =>
    err(field) && (
      <p id={`${id}-${field}-error`} role="alert" className={`text-sm text-warn ${className}`}>
        {err(field)}
      </p>
    );

  return (
    <>
      {mode === "add" && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-url`} className="text-sm font-medium">
            {t("add.url")}
          </label>
          <Input
            id={`${id}-url`}
            inputMode="url"
            autoComplete="off"
            value={values.url}
            onChange={(e) => onChange({ url: e.target.value })}
            invalid={Boolean(errors.url)}
            aria-describedby={describedBy("url") ?? `${id}-url-hint`}
          />
          <p id={`${id}-url-hint`} className="text-sm text-muted">
            {t("add.urlHint")}
          </p>
          {fieldError("url")}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-title`} className="text-sm font-medium">
          {t("add.titleField")}
        </label>
        <Input
          id={`${id}-title`}
          maxLength={300}
          value={values.title}
          onChange={(e) => onChange({ title: e.target.value })}
          invalid={Boolean(errors.title)}
          aria-describedby={describedBy("title")}
        />
        {fieldError("title")}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-category`} className="text-sm font-medium">
          {t("add.category")}
        </label>
        <Select
          id={`${id}-category`}
          value={values.category}
          onChange={(e) => onChange({ category: e.target.value as Category | "" })}
        >
          {mode === "add" && <option value="">{t("add.categoryAuto")}</option>}
          {CATEGORIES.map((key) => (
            <option key={key} value={key}>
              {t(`category.${key}`)}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-note`} className="text-sm font-medium">
          {t("add.note")}
        </label>
        <Textarea
          id={`${id}-note`}
          rows={2}
          maxLength={2000}
          value={values.note}
          onChange={(e) => onChange({ note: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-price`} className="text-sm font-medium">
            {t("add.price")}
          </label>
          <Input
            id={`${id}-price`}
            inputMode="decimal"
            value={values.price}
            onChange={(e) => onChange({ price: e.target.value })}
            invalid={Boolean(errors.price)}
            aria-describedby={describedBy("price")}
          />
          {fieldError("price")}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-currency`} className="text-sm font-medium">
            {t("add.currency")}
          </label>
          <Input
            id={`${id}-currency`}
            maxLength={3}
            value={values.currency}
            onChange={(e) => onChange({ currency: e.target.value })}
            invalid={Boolean(errors.currency)}
            aria-describedby={describedBy("currency")}
          />
          {fieldError("currency")}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-basis`} className="text-sm font-medium">
            {t("add.basis")}
          </label>
          <Select
            id={`${id}-basis`}
            value={values.basis}
            onChange={(e) => onChange({ basis: e.target.value as PriceBasis })}
          >
            {PRICE_BASES.map((key) => (
              <option key={key} value={key}>
                {t(`price.${BASIS_KEY[key]}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-starts`} className="text-sm font-medium">
            {t("add.startsOn")}
          </label>
          <Input
            id={`${id}-starts`}
            type="date"
            value={values.startsOn}
            onChange={(e) => onChange({ startsOn: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-ends`} className="text-sm font-medium">
            {t("add.endsOn")}
          </label>
          <Input
            id={`${id}-ends`}
            type="date"
            value={values.endsOn}
            onChange={(e) => onChange({ endsOn: e.target.value })}
            invalid={Boolean(errors.dates)}
            aria-describedby={describedBy("dates")}
          />
        </div>
        {fieldError("dates", "col-span-2")}
      </div>
    </>
  );
}
