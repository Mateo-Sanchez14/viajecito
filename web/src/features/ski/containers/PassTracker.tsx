"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useMe } from "@/features/auth/MeProvider";
import { Badge } from "@/ui/atoms/Badge";
import { Button } from "@/ui/atoms/Button";
import { Card } from "@/ui/atoms/Card";
import { Input } from "@/ui/atoms/Input";
import { Select } from "@/ui/atoms/Select";
import { Skeleton } from "@/ui/atoms/Skeleton";
import { PASS_STATUSES, type PassRow as PassRowData, type PassStatus } from "../api/ski";
import { PassRow } from "../components/PassRow";
import { useSetMyPass } from "../hooks/mutations";
import { useSkiOverview } from "../hooks/queries";

type MyPassProps = {
  tripId: string;
  resortId: string;
  row: PassRowData | undefined;
};

/** My pass for one resort: the status applies at once, product and days are saved together. */
function MyPassDetails({ tripId, resortId, row }: MyPassProps) {
  const t = useTranslations("ski.passes");
  const tError = useTranslations("ski.errors");
  const id = useId();
  const me = useMe();
  const setPass = useSetMyPass(tripId, { person_id: me.person.id, display_name: me.person.display_name });
  const [product, setProduct] = useState(row?.product ?? "");
  const [days, setDays] = useState(row?.days?.toString() ?? "");

  const base = { resort_id: resortId || null, price: row?.price ?? undefined };
  const choose = (status: PassStatus) =>
    setPass.mutate({ ...base, status, product: row?.product || undefined, days: row?.days ?? undefined });
  const saveDetails = (event: FormEvent) => {
    event.preventDefault();
    setPass.mutate({
      ...base,
      status: row?.status ?? "needed",
      product: product.trim(),
      days: days ? Number(days) : null,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <p id={`${id}-status`} className="text-sm font-medium">{t("status.label")}</p>
      <div role="group" aria-labelledby={`${id}-status`} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PASS_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={row?.status === status}
            onClick={() => choose(status)}
            className={`rounded-xl border border-border px-3 py-2 text-sm font-medium ${
              row?.status === status ? "bg-foreground text-background" : "bg-surface text-foreground"
            }`}
          >
            {t(`status.${status}`)}
          </button>
        ))}
      </div>

      <form onSubmit={saveDetails} className="grid grid-cols-2 items-end gap-3" aria-label={t("details")}>
        <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
          <label htmlFor={`${id}-product`} className="text-sm font-medium">{t("product")}</label>
          <Input
            id={`${id}-product`}
            value={product}
            maxLength={120}
            placeholder={t("productPlaceholder")}
            onChange={(e) => setProduct(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-days`} className="text-sm font-medium">{t("days")}</label>
          <Input
            id={`${id}-days`}
            type="number"
            inputMode="numeric"
            min={1}
            max={60}
            step={1}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={setPass.isPending} className="col-span-2 sm:col-span-1">
          {t("saveDetails")}
        </Button>
      </form>
      {setPass.isError && <p role="alert" className="text-sm text-warn">{tError("generic")}</p>}
    </div>
  );
}

/** Container: who still needs a lift pass, my own pass, and the crew's passes. */
export function PassTracker({ tripId }: { tripId: string }) {
  const t = useTranslations("ski.passes");
  const me = useMe();
  const { data: overview, isPending } = useSkiOverview(tripId);
  const [chosenResort, setChosenResort] = useState<string | null>(null);
  const id = useId();

  if (isPending) return <Skeleton className="h-40" />;
  if (!overview) return null;

  const { resorts, passes } = overview;
  const resortName = (resortId: string | null) =>
    resorts.find((r) => r.resort.id === resortId)?.resort.name ?? t("anyResort");
  const resortId = chosenResort ?? resorts[0]?.resort.id ?? "";
  const myRow = passes.rows.find(
    (row) => row.person.person_id === me.person.id && (row.resort_id ?? "") === resortId,
  );

  return (
    <Card as="section" aria-labelledby={`${id}-title`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="text-lg font-semibold">{t("title")}</h2>
        {passes.missing.length > 0 && (
          <Badge variant="degraded">{t("missing", { n: passes.missing.length })}</Badge>
        )}
      </div>

      {passes.missing.length > 0 ? (
        <ul aria-label={t("missingTitle")} className="flex flex-col gap-1 rounded-xl border border-warn bg-warn-soft px-4 py-3">
          {passes.missing.map((m) => (
            <li key={`${m.person.person_id}-${m.resort_id ?? "any"}`} className="text-sm font-medium text-warn">
              {t("missingFor", { name: m.person.display_name, resort: resortName(m.resort_id) })}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{t("allCovered")}</p>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="text-base font-semibold">{t("mine")}</h3>
        {resorts.length > 0 && (
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-resort`} className="text-sm font-medium">{t("resort")}</label>
            <Select id={`${id}-resort`} value={resortId} onChange={(e) => setChosenResort(e.target.value)}>
              <option value="">{t("anyResort")}</option>
              {resorts.map(({ resort }) => (
                <option key={resort.id} value={resort.id}>{resort.name}</option>
              ))}
            </Select>
          </div>
        )}
        <MyPassDetails key={`${resortId}|${myRow?.product}|${myRow?.days}`} tripId={tripId} resortId={resortId} row={myRow} />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">{t("crew")}</h3>
        {passes.rows.length === 0 ? (
          <p className="text-sm text-muted">{t("noRows")}</p>
        ) : (
          <ul aria-label={t("crew")} className="flex flex-col gap-2">
            {passes.rows.map((row) => (
              <PassRow key={`${row.person.person_id}-${row.resort_id ?? "any"}`} row={row} resortName={resortName(row.resort_id)} />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
