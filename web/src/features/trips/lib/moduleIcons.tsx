import {
  CalendarBlankIcon,
  FileTextIcon,
  HouseSimpleIcon,
  LightbulbIcon,
  ListChecksIcon,
  MapTrifoldIcon,
  MountainsIcon,
  SquaresFourIcon,
  SunHorizonIcon,
  WalletIcon,
  type IconProps,
} from "@/ui/icons";
import type { ComponentType } from "react";

const ICONS: Record<string, ComponentType<IconProps>> = {
  overview: HouseSimpleIcon,
  proposals: LightbulbIcon,
  dates: CalendarBlankIcon,
  logistics: ListChecksIcon,
  itinerary: MapTrifoldIcon,
  today: SunHorizonIcon,
  budget: WalletIcon,
  documents: FileTextIcon,
  ski: MountainsIcon,
};

/** Decorative icon of a trip section; the fill weight marks the active one. Unknown keys get a neutral grid. */
export function moduleIcon(key: string, active = false) {
  const Icon = ICONS[key] ?? SquaresFourIcon;
  return <Icon size={22} weight={active ? "fill" : "regular"} aria-hidden="true" />;
}
