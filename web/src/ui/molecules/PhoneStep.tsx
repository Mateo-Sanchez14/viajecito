"use client";

import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/ui/atoms/Button";
import { Input } from "@/ui/atoms/Input";

type PhoneStepProps = {
  pending: boolean;
  errorMessage?: string;
  onSubmit: (phone: string) => void;
};

/** Presentational: asks for the WhatsApp number; validation is the api's job. */
export function PhoneStep({ pending, errorMessage, onSubmit }: PhoneStepProps) {
  const t = useTranslations("auth.phone");
  const [phone, setPhone] = useState("");
  const inputId = useId();
  const errorId = useId();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit(phone.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-sm font-medium">
          {t("label")}
        </label>
        <Input
          id={inputId}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={t("placeholder")}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          invalid={Boolean(errorMessage)}
          aria-describedby={errorMessage ? errorId : undefined}
        />
        <p className="text-sm text-muted">{t("hint")}</p>
      </div>
      {errorMessage && (
        <p id={errorId} role="alert" className="text-sm text-warn">
          {errorMessage}
        </p>
      )}
      <Button type="submit" disabled={pending || phone.trim() === ""}>
        {t("submit")}
      </Button>
    </form>
  );
}
