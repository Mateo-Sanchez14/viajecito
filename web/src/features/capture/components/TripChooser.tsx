"use client";

import { useId } from "react";
import { useQueries } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { getTrip, tripKeys } from "@/features/trips/api/trips";
import { Select } from "@/ui/atoms/Select";
import type { CaptureOption } from "../lib/target";

type TripChooserProps = {
  options: CaptureOption[];
  value: string;
  onChange: (tripId: string) => void;
};

/** Several crews have a default trip: the person says which one this capture is for. */
export function TripChooser({ options, value, onChange }: TripChooserProps) {
  const t = useTranslations("capture.chooser");
  const id = useId();
  const trips = useQueries({
    queries: options.map((option) => ({
      queryKey: tripKeys.detail(option.tripId),
      queryFn: () => getTrip(option.tripId),
      staleTime: 30_000,
    })),
  });

  return (
    <div className="ui-field">
      <label htmlFor={id}>{t("label")}</label>
      <Select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{t("placeholder")}</option>
        {options.map((option, index) => {
          const name = trips[index]?.data?.name;
          return (
            <option key={option.tripId} value={option.tripId}>
              {name ? t("option", { trip: name, crew: option.crewName }) : option.crewName}
            </option>
          );
        })}
      </Select>
    </div>
  );
}
