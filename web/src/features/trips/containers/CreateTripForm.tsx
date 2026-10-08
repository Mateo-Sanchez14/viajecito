"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/ui/atoms/Button";
import { Input } from "@/ui/atoms/Input";
import { Select } from "@/ui/atoms/Select";
import { Photo } from "@/ui/atoms/Photo";
import { pickScenePhoto } from "@/ui/photos/photos";
import { CaretRightIcon } from "@/ui/icons";
import type { TripCreate } from "../api/trips";
import { useCreateTrip } from "../hooks/mutations";
import { inferTripKind } from "../lib/coverScene";
import { tripPath } from "../lib/paths";
import { suggestTripName } from "../lib/suggestTripName";

// These match the registered api trip types; a trip-types endpoint could replace this list.
const TRIP_TYPES = ["generic", "ski"] as const;
const CURRENCY = /^[A-Z]{3}$/;
/** Product default kept from the api (`DEFAULT_CURRENCY`); changing it is a product decision. */
const DEFAULT_CURRENCY = "USD";

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

/**
 * Container: creates a trip in a crew, then opens it. The destination comes first (it drives the
 * picture and the suggested name); type and currency hide under "more options" with sensible defaults.
 */
export function CreateTripForm({ crewId }: { crewId: string }) {
  const t = useTranslations("trips");
  const alt = useTranslations("photos.alt");
  const format = useFormatter();
  const router = useRouter();
  const create = useCreateTrip(crewId);
  const id = useId();
  const [destination, setDestination] = useState("");
  const [startOn, setStartOn] = useState("");
  const [endOn, setEndOn] = useState("");
  // `null` = the person has not touched the name: it follows the suggestion.
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [type, setType] = useState<string>("generic");
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [moreOpen, setMoreOpen] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const whenLabel = startOn
    ? format.dateTime(new Date(`${startOn}T00:00:00Z`), { month: "short", year: "numeric", timeZone: "UTC" })
    : null;
  const name = nameOverride ?? suggestTripName(destination, whenLabel);
  const scene = destination.trim() ? inferTripKind({ type, destination_label: destination }) : null;
  const preview = scene ? pickScenePhoto(scene, destination.trim().toLowerCase()) : null;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validate(name, startOn, endOn, currency);
    setErrors(found);
    if (found.currency) setMoreOpen(true); // the error lives in a closed disclosure otherwise
    if (Object.keys(found).length > 0) return;

    const body: TripCreate = {
      name: name.trim(),
      type,
      start_on: startOn || null,
      end_on: endOn || null,
      destination_label: destination.trim(),
      currency: currency.trim().toUpperCase() || DEFAULT_CURRENCY,
    };

    create.mutate(body, {
      onSuccess: (trip) => router.push(tripPath(crewId, trip.id)),
    });
  }

  const err = (field: Field) => (errors[field] ? t(`create.errors.${errors[field]}`) : null);
  const describedBy = (field: Field) => (errors[field] ? `${id}-${field}-error` : undefined);

  return (
    <form noValidate onSubmit={onSubmit} className="create-trip-form flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-destination`} className="text-base font-semibold">{t("create.destination")}</label>
        <Input
          id={`${id}-destination`}
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder={t("create.destinationPlaceholder")}
          autoComplete="off"
        />
        {scene && (
          <div className="create-trip-scene">
            {preview && <Photo photo={preview} small alt={alt(preview.id)} className="create-trip-scene-image" />}
            <p role="status" className="create-trip-scene-hint text-sm text-muted">
              {t("create.sceneHint", { scene: t(`create.scene.${scene}`) })}
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <p id={`${id}-dates-error`} role="alert" className="sm:col-span-2 text-sm text-warn">{err("dates")}</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-name`} className="text-sm font-medium">{t("create.name")}</label>
        <Input
          id={`${id}-name`}
          value={name}
          onChange={(e) => setNameOverride(e.target.value)}
          placeholder={t("create.namePlaceholder")}
          invalid={Boolean(errors.name)}
          aria-describedby={describedBy("name")}
        />
        {err("name") && (
          <p id={`${id}-name-error`} role="alert" className="text-sm text-warn">{err("name")}</p>
        )}
      </div>

      <details
        className="create-trip-more"
        open={moreOpen}
        onToggle={(event) => setMoreOpen(event.currentTarget.open)}
      >
        <summary>
          <CaretRightIcon size={16} aria-hidden="true" />
          {t("create.more")}
        </summary>
        <div className="create-trip-more-body flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-type`} className="text-sm font-medium">{t("create.type")}</label>
            <Select id={`${id}-type`} value={type} onChange={(e) => setType(e.target.value)}>
              {TRIP_TYPES.map((key) => (
                <option key={key} value={key}>{t(`types.${key}`)}</option>
              ))}
            </Select>
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
        </div>
      </details>

      {create.isError && (
        <p role="alert" className="text-sm text-warn">{t("create.errors.failed")}</p>
      )}
      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? t("create.submitting") : t("create.submit")}
      </Button>
    </form>
  );
}
