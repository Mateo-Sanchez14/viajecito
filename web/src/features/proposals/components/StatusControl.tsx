"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/ui/atoms/Button";
import { ConfirmDialog } from "@/ui/molecules/ConfirmDialog";
import type { ProposalStatus } from "../api/proposals";
import { isBackwards, needsConfirm, transitionLabelKey } from "../lib/status";

type StatusControlProps = {
  status: ProposalStatus;
  /** Straight from the api: this component never invents a transition. */
  allowedTransitions: ProposalStatus[];
  onTransition: (to: ProposalStatus) => void;
  pending?: boolean;
};

/**
 * One button per transition the api allows for the viewer. Discarding and moving backwards go
 * through a confirmation dialog first.
 */
export function StatusControl({ status, allowedTransitions, onTransition, pending = false }: StatusControlProps) {
  const t = useTranslations("proposals.transition");
  const labels = useTranslations("proposals.status");
  const [confirming, setConfirming] = useState<ProposalStatus | null>(null);

  if (allowedTransitions.length === 0) return null;

  const request = (to: ProposalStatus) => (needsConfirm(status, to) ? setConfirming(to) : onTransition(to));
  const confirm = () => {
    if (confirming) onTransition(confirming);
    setConfirming(null);
  };
  const discarding = confirming === "discarded";

  return (
    <>
      <div role="group" aria-label={t("label")} className="flex flex-wrap gap-2">
        {allowedTransitions.map((to) => (
          <Button
            key={to}
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => request(to)}
            className="min-h-11"
          >
            {t(transitionLabelKey(status, to))}
          </Button>
        ))}
      </div>
      <ConfirmDialog
        open={confirming !== null}
        title={discarding ? t("confirmDiscard") : t("confirmBackwards")}
        description={
          discarding
            ? t("confirmDiscardBody")
            : confirming && isBackwards(status, confirming)
              ? t("confirmBackwardsBody", { from: labels(status), to: labels(confirming) })
              : undefined
        }
        confirmLabel={t("confirm")}
        cancelLabel={t("cancel")}
        onConfirm={confirm}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}
