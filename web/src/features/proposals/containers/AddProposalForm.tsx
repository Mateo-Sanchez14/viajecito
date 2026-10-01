"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useTripContext } from "@/features/trips/TripProvider";
import { Button } from "@/ui/atoms/Button";
import { Card } from "@/ui/atoms/Card";
import { DuplicateProposalError } from "../api/proposals";
import { ProposalFormFields } from "../components/ProposalFormFields";
import { useCreateProposal } from "../hooks/mutations";
import { emptyValues, toCreateBody, validateProposal, type FormErrors, type FormValues } from "../lib/form";
import { proposalPath } from "../lib/paths";
import { useErrorMessage } from "../lib/useErrorMessage";

type AddProposalFormProps = { tripId: string; crewId: string; onCreated?: () => void };

/** Container: add a proposal from a pasted link or by hand. */
export function AddProposalForm({ tripId, crewId, onCreated }: AddProposalFormProps) {
  const t = useTranslations("proposals.add");
  const errorMessage = useErrorMessage();
  const { trip } = useTripContext();
  const create = useCreateProposal(tripId);
  const headingId = useId();
  const [values, setValues] = useState<FormValues>(() => emptyValues(trip.currency));
  const [errors, setErrors] = useState<FormErrors>({});

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validateProposal(values, { requireUrlOrTitle: true });
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    create.mutate(toCreateBody(values), {
      onSuccess: () => {
        setValues(emptyValues(trip.currency));
        onCreated?.();
      },
    });
  }

  return (
    <Card as="section" className="flex flex-col gap-4">
      <form noValidate aria-labelledby={headingId} onSubmit={onSubmit} className="flex flex-col gap-4">
        <h2 id={headingId} className="text-lg font-semibold">
          {t("title")}
        </h2>
        <ProposalFormFields
          mode="add"
          values={values}
          errors={errors}
          onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
        />
        {create.isError && (
          <div className="flex flex-col gap-1">
            <p role="alert" className="text-sm text-warn">
              {errorMessage(create.error)}
            </p>
            {create.error instanceof DuplicateProposalError && (
              <Link
                href={proposalPath(crewId, tripId, create.error.proposalId)}
                className="text-sm underline underline-offset-2"
              >
                {t("seeExisting")}
              </Link>
            )}
          </div>
        )}
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? t("submitting") : t("submit")}
        </Button>
      </form>
    </Card>
  );
}
