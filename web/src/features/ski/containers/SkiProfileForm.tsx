"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/ui/atoms/Button";
import { Card } from "@/ui/atoms/Card";
import { Input } from "@/ui/atoms/Input";
import { Select } from "@/ui/atoms/Select";
import { Skeleton } from "@/ui/atoms/Skeleton";
import { DISCIPLINES, LEVELS, toDiscipline, toLevel, type SkiProfile } from "../api/ski";
import { useSaveSkiProfile } from "../hooks/mutations";
import { useSkiProfile } from "../hooks/queries";
import { useSkiErrorMessage } from "../lib/useErrorMessage";
import { parseSizes, type SizeField } from "../lib/profile";

function ProfileFields({ profile }: { profile: SkiProfile }) {
  const t = useTranslations("ski.profile");
  const errorMessage = useSkiErrorMessage();
  const id = useId();
  const save = useSaveSkiProfile();
  const [discipline, setDiscipline] = useState(toDiscipline(profile.discipline));
  const [level, setLevel] = useState(toLevel(profile.level));
  const [ownsGear, setOwnsGear] = useState(profile.owns_gear);
  const [boot, setBoot] = useState(profile.boot_size_eu?.toString() ?? "");
  const [height, setHeight] = useState(profile.height_cm?.toString() ?? "");
  const [weight, setWeight] = useState(profile.weight_kg?.toString() ?? "");
  const [share, setShare] = useState(profile.share_sizes_with_trip);
  const [errors, setErrors] = useState<Partial<Record<SizeField, true>>>({});

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseSizes({ boot, height, weight });
    setErrors(parsed.errors);
    if (Object.keys(parsed.errors).length > 0) return;
    save.mutate({
      discipline,
      level,
      owns_gear: ownsGear,
      boot_size_eu: parsed.sizes.boot,
      height_cm: parsed.sizes.height,
      weight_kg: parsed.sizes.weight,
      share_sizes_with_trip: share,
    });
  }

  const sizeField = (field: SizeField, label: string, value: string, set: (v: string) => void, step: number, min: number, max: number) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`${id}-${field}`} className="text-sm font-medium">{label}</label>
      <Input
        id={`${id}-${field}`}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={value}
        invalid={Boolean(errors[field])}
        aria-describedby={errors[field] ? `${id}-${field}-error` : undefined}
        onChange={(e) => set(e.target.value)}
      />
      {errors[field] && (
        <p id={`${id}-${field}-error`} role="alert" className="text-sm text-warn">{t(`errors.${field}`)}</p>
      )}
    </div>
  );

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-discipline`} className="text-sm font-medium">{t("discipline")}</label>
          <Select id={`${id}-discipline`} value={discipline} onChange={(e) => setDiscipline(e.target.value as typeof discipline)}>
            {DISCIPLINES.map((key) => (
              <option key={key} value={key}>{t(`disciplines.${key}`)}</option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-level`} className="text-sm font-medium">{t("level")}</label>
          <Select id={`${id}-level`} value={level} onChange={(e) => setLevel(e.target.value as typeof level)}>
            {LEVELS.map((key) => (
              <option key={key} value={key}>{t(`levels.${key}`)}</option>
            ))}
          </Select>
        </div>
      </div>

      <label className="flex items-center gap-3 text-sm font-medium">
        <input type="checkbox" checked={ownsGear} onChange={(e) => setOwnsGear(e.target.checked)} className="size-5" />
        {t("ownsGear")}
      </label>

      <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <legend className="px-1 text-base font-semibold">{t("sizes")}</legend>
        <p className="text-sm text-muted">{t("sizesHelp")}</p>
        <div className="grid grid-cols-3 gap-3">
          {sizeField("boot", t("boot"), boot, setBoot, 0.5, 30, 50)}
          {sizeField("height", t("height"), height, setHeight, 1, 100, 230)}
          {sizeField("weight", t("weight"), weight, setWeight, 1, 25, 200)}
        </div>
        <label className="flex items-center gap-3 text-sm font-medium">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="size-5" />
          {t("share")}
        </label>
      </fieldset>

      <Button type="submit" disabled={save.isPending}>{save.isPending ? t("saving") : t("save")}</Button>
      {save.isSuccess && <p role="status" className="text-sm text-ok">{t("saved")}</p>}
      {save.isError && <p role="alert" className="text-sm text-warn">{errorMessage(save.error)}</p>}
    </form>
  );
}

/** Container: my own ski profile (sensitive: sizes are shared only with explicit consent). */
export function SkiProfileForm() {
  const t = useTranslations("ski");
  const { data: profile, isPending, isError, refetch } = useSkiProfile();

  return (
    <Card as="section" className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{t("profile.title")}</h2>
      {isPending && <Skeleton className="h-48" />}
      {isError && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-sm text-warn">{t("loadFailed")}</p>
          <Button variant="link" onClick={() => refetch()}>{t("retry")}</Button>
        </div>
      )}
      {profile && <ProfileFields profile={profile} />}
    </Card>
  );
}
