"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/ui/atoms/Button";
import { Input } from "@/ui/atoms/Input";
import { Select } from "@/ui/atoms/Select";
import type { TripCreate } from "../api/trips";
import { useCreateTrip } from "../hooks/mutations";
import { tripPath } from "../lib/paths";

// These match the registered api trip types; a trip-types endpoint could replace this list.
const TRIP_TYPES = ["generic", "ski"] as const;
const CURRENCY = /^[A-Z]{3}$/;

type Field = "name" | "dates" | "currency";
type ErrorKey = "nameRequired" | "endBeforeStart" | "currencyInvalid";
type Errors = Partial<Record<Field, ErrorKey>>;

function validate(name: string, start: string, end: string, currency: string): Errors {
  const errors: Errors = {};
  if (!name.trim()) errors.name = "nameRequired";
  if (start && end && end < start) errors.dates = "endBeforeStart";
  if (currency.trim() && !CURRENCY.test(currency.trim().toUpperCase())) {
    errors.currency = "currencyInvalid";
  }
  return errors;
}

/** Container: creates a trip in a crew, then opens it. */
export function CreateTripForm({ crewId }: { crewId: string }) {
  const t = useTranslations("trips");
  const router = useRouter();
  const create = useCreateTrip(crewId);
  const id = useId();
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("generic");
  const [startOn, setStartOn] = useState("");
  const [endOn, setEndOn] = useState("");
  const [destination, setDestination] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [errors, setErrors] = useState<Errors>({});

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validate(name, startOn, endOn, currency);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const body: TripCreate = {
      name: name.trim(),
      type,
      start_on: startOn || null,
      end_on: endOn || null,
      destination_label: destination.trim(),
      currency: currency.trim().toUpperCase() || "USD",
    };

    create.mutate(body, {
      onSuccess: (trip) => router.push(tripPath(crewId, trip.id)),
    });
  }

  const err = (field: Field) => (errors[field] ? t(`create.errors.${errors[field]}`) : null);
  const describedBy = (field: Field) => (errors[field] ? `${id}-${field}-error` : undefined);

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      <h3 className="text-base font-semibold">{t("create.title")}</h3>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-name`} className="text-sm font-medium">{t("create.name")}</label>
        <Input
          id={`${id}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("create.namePlaceholder")}
          invalid={Boolean(errors.name)}
          aria-describedby={describedBy("name")}
        />
        {err("name") && (
          <p id={`${id}-name-error`} role="alert" className="text-sm text-warn">{err("name")}</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-type`} className="text-sm font-medium">{t("create.type")}</label>
        <Select id={`${id}-type`} value={type} onChange={(e) => setType(e.target.value)}>
          {TRIP_TYPES.map((key) => (
            <option key={key} value={key}>{t(`types.${key}`)}</option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-start`} className="text-sm font-medium">{t("create.startOn")}</label>
          <Input id={`${id}-start`} type="date" value={startOn} onChange={(e) => setStartOn(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-end`} className="text-sm font-medium">{t("create.endOn")}</label>
          <Input
            id={`${id}-end`}
            type="date"
            value={endOn}
            onChange={(e) => setEndOn(e.target.value)}
            invalid={Boolean(errors.dates)}
            aria-describedby={describedBy("dates")}
          />
        </div>
        {err("dates") && (
          <p id={`${id}-dates-error`} role="alert" className="col-span-2 text-sm text-warn">{err("dates")}</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-destination`} className="text-sm font-medium">{t("create.destination")}</label>
        <Input
          id={`${id}-destination`}
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder={t("create.destinationPlaceholder")}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-currency`} className="text-sm font-medium">{t("create.currency")}</label>
        <Input
          id={`${id}-currency`}
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          maxLength={3}
          invalid={Boolean(errors.currency)}
          aria-describedby={describedBy("currency")}
        />
        {err("currency") && (
          <p id={`${id}-currency-error`} role="alert" className="text-sm text-warn">{err("currency")}</p>
        )}
      </div>

      {create.isError && (
        <p role="alert" className="text-sm text-warn">{t("create.errors.failed")}</p>
      )}
      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? t("create.submitting") : t("create.submit")}
      </Button>
    </form>
  );
}
