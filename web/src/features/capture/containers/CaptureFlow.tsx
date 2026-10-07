"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { proposalPath } from "@/features/proposals/lib/paths";
import { sectionPath } from "@/features/trips/lib/paths";
import { CaptureMenu, type CaptureKind } from "../components/CaptureMenu";
import type { CaptureToastData } from "../components/CaptureToast";
import { IdeaCaptureForm } from "../components/IdeaCaptureForm";
import { LinkCaptureForm } from "../components/LinkCaptureForm";
import { TaskCaptureForm } from "../components/TaskCaptureForm";
import { TripChooser } from "../components/TripChooser";
import { useCaptureTrip } from "../hooks/useCaptureTrip";
import type { CaptureTarget } from "../lib/target";

type CaptureFlowProps = {
  target: Exclude<CaptureTarget, { kind: "none" }>;
  onClose: () => void;
  onCaptured: (toast: CaptureToastData) => void;
};

const FALLBACK_CURRENCY = "USD";

/**
 * The content of the sheet: which trip (when it has to be asked), what to add and its form.
 * It only exists while the sheet is open, so every opening starts from the menu.
 */
export function CaptureFlow({ target, onClose, onCaptured }: CaptureFlowProps) {
  const t = useTranslations("capture");
  const [step, setStep] = useState<CaptureKind | null>(null);
  const [chosen, setChosen] = useState("");

  const tripId = target.kind === "trip" ? target.tripId : chosen || null;
  const option = target.kind === "choose" ? target.options.find((entry) => entry.tripId === chosen) : undefined;
  const { data: trip } = useCaptureTrip(tripId);
  const crewId = (target.kind === "trip" ? target.crewId : option?.crewId) ?? trip?.crew_id;

  const finish = (kind: "proposal" | "idea" | "task", href?: string) => {
    onCaptured({ message: t(`toast.${kind}`), href });
    onClose();
  };
  const proposalHref = (proposalId: string) =>
    crewId && tripId ? proposalPath(crewId, tripId, proposalId) : undefined;
  const back = () => setStep(null);

  return (
    <>
      {target.kind === "choose" ? (
        <TripChooser options={target.options} value={chosen} onChange={setChosen} />
      ) : (
        trip && <p className="capture-target">{t("target", { name: trip.name })}</p>
      )}
      {step === null && <CaptureMenu onPick={setStep} />}
      {step === "link" && (
        <LinkCaptureForm
          tripId={tripId}
          crewId={crewId}
          onBack={back}
          onNavigate={onClose}
          onCreated={(proposal) => finish("proposal", proposalHref(proposal.id))}
        />
      )}
      {step === "idea" && (
        <IdeaCaptureForm
          tripId={tripId}
          defaultCurrency={trip?.currency ?? FALLBACK_CURRENCY}
          onBack={back}
          onCreated={(proposal) => finish("idea", proposalHref(proposal.id))}
        />
      )}
      {step === "task" && (
        <TaskCaptureForm
          tripId={tripId}
          onBack={back}
          onCreated={() => finish("task", crewId && tripId ? sectionPath(crewId, tripId, "logistics") : undefined)}
        />
      )}
    </>
  );
}
