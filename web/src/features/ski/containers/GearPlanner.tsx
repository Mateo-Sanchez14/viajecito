"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useMe } from "@/features/auth/MeProvider";
import { Button } from "@/ui/atoms/Button";
import { Card } from "@/ui/atoms/Card";
import { Skeleton } from "@/ui/atoms/Skeleton";
import { GEAR_ITEMS, toGearItem, toGearMode, type GearItem, type GearItemIn, type GearRow } from "../api/ski";
import { GearModeSelect, type GearModeValue } from "../components/GearModeSelect";
import { RentalRollup } from "../components/RentalRollup";
import { useSetMyGear } from "../hooks/mutations";
import { useSkiOverview } from "../hooks/queries";
import { useSkiErrorMessage } from "../lib/useErrorMessage";

type Modes = Record<GearItem, GearModeValue>;

function initialModes(rows: GearRow[]): Modes {
  const modes = Object.fromEntries(GEAR_ITEMS.map((item) => [item, "none"])) as Modes;
  for (const row of rows) modes[toGearItem(row.item)] = toGearMode(row.mode);
  return modes;
}

/** My items x mode. Price, currency and note of an existing row travel along unchanged. */
function MyGearForm({ tripId, mine }: { tripId: string; mine: GearRow[] }) {
  const t = useTranslations("ski.gear");
  const errorMessage = useSkiErrorMessage();
  const setGear = useSetMyGear(tripId);
  const [modes, setModes] = useState<Modes>(() => initialModes(mine));

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const items: GearItemIn[] = [];
    for (const item of GEAR_ITEMS) {
      const mode = modes[item];
      if (mode === "none") continue;
      const previous = mine.find((row) => toGearItem(row.item) === item);
      items.push({
        item,
        mode,
        note: previous?.note ?? "",
        ...(previous?.price != null && { price: previous.price, currency: previous.currency }),
      });
    }
    setGear.mutate(items);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <h3 className="text-base font-semibold">{t("mine")}</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {GEAR_ITEMS.map((item) => (
          <GearModeSelect
            key={item}
            label={t(`item.${item}`)}
            value={modes[item]}
            onChange={(mode) => setModes((current) => ({ ...current, [item]: mode }))}
          />
        ))}
      </div>
      <Button type="submit" disabled={setGear.isPending}>{t("save")}</Button>
      {setGear.isSuccess && <p role="status" className="text-sm text-ok">{t("saved")}</p>}
      {setGear.isError && <p role="alert" className="text-sm text-warn">{errorMessage(setGear.error)}</p>}
    </form>
  );
}

/** Container: my gear plan and the crew's rental roll-up. */
export function GearPlanner({ tripId }: { tripId: string }) {
  const t = useTranslations("ski.gear");
  const me = useMe();
  const id = useId();
  const { data: overview, isPending } = useSkiOverview(tripId);

  if (isPending) return <Skeleton className="h-40" />;
  if (!overview) return null;

  const { gear } = overview;
  const mine = gear.rows.filter((row) => row.person.person_id === me.person.id);

  return (
    <Card as="section" aria-labelledby={`${id}-title`} className="flex flex-col gap-4">
      <h2 id={`${id}-title`} className="text-lg font-semibold">{t("title")}</h2>
      <RentalRollup rentCounts={gear.rent_counts} sizes={gear.sizes} sizesHidden={gear.sizes_hidden} />
      <MyGearForm tripId={tripId} mine={mine} />
    </Card>
  );
}
