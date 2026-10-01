"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useTripContext } from "@/features/trips/TripProvider";
import { Button } from "@/ui/atoms/Button";
import { Card } from "@/ui/atoms/Card";
import type { Proposal } from "../api/proposals";
import { ProposalFormFields } from "../components/ProposalFormFields";
import { useUpdateProposal } from "../hooks/mutations";
import { toPatchBody, validateProposal, valuesFromProposal, type FormErrors, type FormValues } from "../lib/form";
import { useErrorMessage } from "../lib/useErrorMessage";

type ProposalEditFormProps = { proposal: Proposal; onDone: () => void };

/** Container: edit title, note, category, price and dates of a proposal. */
export function ProposalEditForm({ proposal, onDone }: ProposalEditFormProps) {
  const t = useTranslations("proposals.detail");
  const errorMessage = useErrorMessage();
  const { trip } = useTripContext();
  const update = useUpdateProposal(proposal.id);
  const headingId = useId();
  const [values, setValues] = useState<FormValues>(() => valuesFromProposal(proposal, trip.currency));
  const [errors, setErrors] = useState<FormErrors>({});

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validateProposal(values, { requireUrlOrTitle: false, requireTitle: true });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    update.mutate(toPatchBody(values), { onSuccess: onDone });
  }

  return (
    <Card as="section">
      <form noValidate aria-labelledby={headingId} onSubmit={onSubmit} className="flex flex-col gap-4">
        <h2 id={headingId} className="text-lg font-semibold">
          {t("editTitle")}
        </h2>
        <ProposalFormFields
          mode="edit"
          values={values}
          errors={errors}
          onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
        />
        {update.isError && (
          <p role="alert" className="text-sm text-warn">
            {errorMessage(update.error)}
          </p>
        )}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? t("saving") : t("save")}
          </Button>
          <Button variant="link" onClick={onDone}>
            {t("cancelEdit")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
