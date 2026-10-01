import { useTranslations } from "next-intl";

/** Label for a trip module/section key; modules without copy fall back to their key. */
export function useSectionLabel() {
  const t = useTranslations("trips.sections");
  return (key: string): string => (t.has(key) ? t(key) : key);
}
