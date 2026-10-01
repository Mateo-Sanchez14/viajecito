"use client";

import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/ui/atoms/Button";
import { Input } from "@/ui/atoms/Input";

export const CODE_LENGTH = 6;

type CodeStepProps = {
  phone: string;
  pending: boolean;
  secondsLeft: number;
  errorMessage?: string;
  onSubmit: (code: string) => void;
  onResend: () => void;
  onChangePhone: () => void;
};

/** Presentational: the 6-digit code form with a resend countdown. */
export function CodeStep({
  phone,
  pending,
  secondsLeft,
  errorMessage,
  onSubmit,
  onResend,
  onChangePhone,
}: CodeStepProps) {
  const t = useTranslations("auth.code");
  const [code, setCode] = useState("");
  const inputId = useId();
  const errorId = useId();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit(code);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-sm font-medium">
          {t("label")}
        </label>
        <Input
          id={inputId}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={CODE_LENGTH}
          value={code}
          onChange={(event) =>
            setCode(event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))
          }
          invalid={Boolean(errorMessage)}
          aria-describedby={errorMessage ? errorId : undefined}
          className="text-center font-mono text-2xl tracking-[0.5em]"
        />
        <p className="text-sm text-muted">{t("hint", { phone })}</p>
      </div>
      {errorMessage && (
        <p id={errorId} role="alert" className="text-sm text-warn">
          {errorMessage}
        </p>
      )}
      <Button type="submit" disabled={pending || code.length !== CODE_LENGTH}>
        {t("submit")}
      </Button>
      <div className="flex items-center justify-between">
        <Button
          variant="link"
          onClick={onResend}
          disabled={pending || secondsLeft > 0}
        >
          {secondsLeft > 0
            ? t("resend", { seconds: secondsLeft })
            : t("resendNow")}
        </Button>
        <Button variant="link" onClick={onChangePhone}>
          {t("changeNumber")}
        </Button>
      </div>
    </form>
  );
}
