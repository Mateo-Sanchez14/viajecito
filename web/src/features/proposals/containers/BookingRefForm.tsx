"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/ui/atoms/Button";
import { Input } from "@/ui/atoms/Input";
import { useUpdateProposal } from "../hooks/mutations";
import { useErrorMessage } from "../lib/useErrorMessage";

type BookingRefFormProps = { proposalId: string; bookingRef: string };

/** Container: the booking code of a chosen or booked proposal (saved with PATCH). */
export function BookingRefForm({ proposalId, bookingRef }: BookingRefFormProps) {
  const t = useTranslations("proposals.detail");
  const errorMessage = useErrorMessage();
  const update = useUpdateProposal(proposalId);
  const id = useId();
  const [value, setValue] = useState(bookingRef);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    update.mutate({ booking_ref: value.trim() });
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-2">
      <label htmlFor={`${id}-ref`} className="text-sm font-medium">
        {t("bookingRef")}
      </label>
      <div className="flex gap-2">
        <Input id={`${id}-ref`} maxLength={120} value={value} onChange={(e) => setValue(e.target.value)} />
        <Button type="submit" disabled={update.isPending} className="w-auto! shrink-0">
          {t("saveBookingRef")}
        </Button>
      </div>
      {update.isError && (
        <p role="alert" className="text-sm text-warn">
          {errorMessage(update.error)}
        </p>
      )}
    </form>
  );
}
