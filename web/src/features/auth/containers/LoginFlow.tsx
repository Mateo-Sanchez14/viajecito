"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { CodeStep } from "@/ui/molecules/CodeStep";
import { PhoneStep } from "@/ui/molecules/PhoneStep";
import { LoginCard } from "@/ui/organisms/LoginCard";
import { ApiError, errorCodeToMessageKey } from "../api/errors";
import { requestOtp, verifyOtp } from "../api/otp";
import { safeNextPath } from "../lib/safeNext";

type Step = "phone" | "code";

/** Container: drives phone -> code -> redirect, owns the countdown and error mapping. */
export function LoginFlow({ next }: { next?: string | null }) {
  const t = useTranslations();
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const lastRetryAfter = useRef(60);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const counting = secondsLeft > 0;
  useEffect(() => {
    if (!counting) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [counting]);

  async function send(target: string) {
    setPending(true);
    setErrorCode(null);
    try {
      const sent = await requestOtp(target);
      lastRetryAfter.current = sent.retry_after_seconds;
      setPhone(target);
      setSecondsLeft(sent.retry_after_seconds);
      setStep("code");
    } catch (error) {
      setErrorCode(error instanceof ApiError ? error.code : "unknown");
      if (error instanceof ApiError && error.code === "rate_limited") {
        // Resend was too early: restart the countdown from the server's hint.
        setSecondsLeft(error.retryAfterSeconds ?? lastRetryAfter.current);
      }
    } finally {
      setPending(false);
    }
  }

  async function verify(code: string) {
    setPending(true);
    setErrorCode(null);
    try {
      await verifyOtp(phone, code);
      router.replace(safeNextPath(next));
    } catch (error) {
      setErrorCode(error instanceof ApiError ? error.code : "unknown");
      setPending(false);
    }
  }

  const errorMessage = errorCode
    ? t(errorCodeToMessageKey(errorCode))
    : undefined;

  return (
    <LoginCard>
      {step === "phone" ? (
        <PhoneStep
          initialPhone={phone}
          pending={pending}
          errorMessage={errorMessage}
          onSubmit={send}
        />
      ) : (
        <CodeStep
          phone={phone}
          pending={pending}
          secondsLeft={secondsLeft}
          errorMessage={errorMessage}
          onSubmit={verify}
          onResend={() => send(phone)}
          onChangePhone={() => {
            setErrorCode(null);
            setSecondsLeft(0);
            setStep("phone");
          }}
        />
      )}
    </LoginCard>
  );
}
