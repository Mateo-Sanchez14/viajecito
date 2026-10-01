import { useId } from "react";
import { useTranslations } from "next-intl";
import { Select } from "@/ui/atoms/Select";
import type { GearMode } from "../api/ski";

export type GearModeValue = GearMode | "none";
const MODES = ["none", "own", "rent", "borrow"] as const satisfies readonly GearModeValue[];

type GearModeSelectProps = {
  label: string;
  value: GearModeValue;
  onChange: (value: GearModeValue) => void;
};

/** Presentational: native select to choose how I get one piece of gear. */
export function GearModeSelect({ label, value, onChange }: GearModeSelectProps) {
  const t = useTranslations("ski.gear.mode");
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value as GearModeValue)}>
        {MODES.map((mode) => (
          <option key={mode} value={mode}>{t(mode)}</option>
        ))}
      </Select>
    </div>
  );
}
