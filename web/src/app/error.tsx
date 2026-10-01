"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/ui/atoms/Button";

/** Root error boundary: unexpected failures (e.g. an api outage behind the auth gate). */
export default function ErrorPage({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations("errors.unexpected");

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <Button onClick={() => retry()}>{t("retry")}</Button>
    </main>
  );
}
