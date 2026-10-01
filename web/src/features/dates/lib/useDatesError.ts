import { useTranslations } from "next-intl";
import { ApiError } from "@/shared/api/errors";

/** Maps an api error to `dates.errors.<code>`; anything unrecognized gets the generic message. */
export function useDatesError() {
  const t = useTranslations("dates.errors");
  return (error: unknown): string => {
    const code = error instanceof ApiError ? error.code : "unknown";
    return t.has(code) ? t(code) : t("unknown");
  };
}
