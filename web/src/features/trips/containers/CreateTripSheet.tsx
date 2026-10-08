"use client";

import { useTranslations } from "next-intl";
import { Sheet } from "@/ui/molecules/Sheet";
import { CreateTripForm } from "./CreateTripForm";

type CreateTripSheetProps = {
  crewId: string;
  /** Named in the sheet when the person belongs to several crews, so it is clear where the trip lands. */
  crewName?: string;
  open: boolean;
  onClose: () => void;
};

/** Container: the new-trip form in a bottom sheet (phones) or centered panel (wide screens). */
export function CreateTripSheet({ crewId, crewName, open, onClose }: CreateTripSheetProps) {
  const t = useTranslations("trips.create");
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("title")}
      closeLabel={t("close")}
      description={crewName ? t("forCrew", { crew: crewName }) : undefined}
    >
      <CreateTripForm crewId={crewId} />
    </Sheet>
  );
}
