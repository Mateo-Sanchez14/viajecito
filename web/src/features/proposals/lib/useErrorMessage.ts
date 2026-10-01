import { useTranslations } from "next-intl";
import { ApiError } from "@/shared/api/errors";

/** Maps an api error code to `proposals.errors.<code>`, falling back to the generic copy. */
export function useErrorMessage() {
  const t = useTranslations("proposals.errors");
  const unexpected = useTranslations("errors.unexpected");
  return (error: unknown): string =>
    error instanceof ApiError && t.has(error.code) ? t(error.code) : unexpected("title");
}
