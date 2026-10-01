import { useTranslations } from "next-intl";
import { ApiError } from "@/shared/api/errors";

/** Maps an api error code to `ski.errors.<code>`, falling back to the generic message. */
export function useSkiErrorMessage() {
  const t = useTranslations("ski.errors");
  return (error: unknown): string =>
    error instanceof ApiError && t.has(error.code) ? t(error.code) : t("generic");
}
