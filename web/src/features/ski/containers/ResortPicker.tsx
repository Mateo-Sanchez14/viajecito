"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/ui/atoms/Button";
import { Card } from "@/ui/atoms/Card";
import { Input } from "@/ui/atoms/Input";
import { Skeleton } from "@/ui/atoms/Skeleton";
import { ResortChip } from "../components/ResortChip";
import { useAddTripResort, useRemoveTripResort } from "../hooks/mutations";
import { useResorts, useSkiOverview } from "../hooks/queries";
import { fold } from "../lib/search";
import { useSkiErrorMessage } from "../lib/useErrorMessage";

/** Container: the trip's resorts, plus a searchable catalog to add more. */
export function ResortPicker({ tripId }: { tripId: string }) {
  const t = useTranslations("ski.resorts");
  const errorMessage = useSkiErrorMessage();
  const id = useId();
  const [query, setQuery] = useState("");
  const { data: overview } = useSkiOverview(tripId);
  const catalog = useResorts();
  const add = useAddTripResort(tripId);
  const remove = useRemoveTripResort(tripId);

  const added = overview?.resorts ?? [];
  const addedIds = new Set(added.map((r) => r.resort.id));
  const needle = fold(query.trim());
  const available = (catalog.data ?? []).filter(
    (resort) => !addedIds.has(resort.id) && (needle === "" || fold(`${resort.name} ${resort.region}`).includes(needle)),
  );
  const error = add.error ?? remove.error;

  return (
    <Card as="section" aria-labelledby={`${id}-title`} className="flex flex-col gap-4">
      <h2 id={`${id}-title`} className="text-lg font-semibold">{t("title")}</h2>

      {added.length > 0 && (
        <ul aria-label={t("added")} className="flex flex-col gap-2">
          {added.map(({ resort, nights }) => (
            <ResortChip
              key={resort.id}
              name={resort.name}
              detail={[resort.region, nights !== null ? t("nights", { count: nights }) : null].filter(Boolean).join(" · ")}
              action={
                <Button
                  variant="link"
                  disabled={remove.isPending}
                  aria-label={t("remove", { name: resort.name })}
                  onClick={() => remove.mutate(resort.id)}
                >
                  ✕
                </Button>
              }
            />
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-search`} className="text-sm font-medium">{t("search")}</label>
        <Input
          id={`${id}-search`}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {catalog.isPending && <Skeleton className="h-16" />}
        {catalog.isError && <p role="alert" className="text-sm text-warn">{t("catalogError")}</p>}
        {catalog.data && available.length === 0 && <p className="text-sm text-muted">{t("noMatches")}</p>}
        {available.length > 0 && (
          <ul aria-label={t("available")} className="flex flex-col gap-2">
            {available.map((resort) => (
              <ResortChip
                key={resort.id}
                name={resort.name}
                detail={resort.region}
                action={
                  <Button
                    variant="link"
                    disabled={add.isPending}
                    aria-label={t("addNamed", { name: resort.name })}
                    onClick={() => add.mutate(resort.id)}
                  >
                    {t("add")}
                  </Button>
                }
              />
            ))}
          </ul>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-warn">{errorMessage(error)}</p>}
    </Card>
  );
}
