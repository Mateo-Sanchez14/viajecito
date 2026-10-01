import { useTranslations } from "next-intl";
import { Badge } from "@/ui/atoms/Badge";

/** How many people a window collides with: green when nobody does. */
export function WindowBadge({ blocked }: { blocked: number }) {
  const t = useTranslations("dates.best");
  return blocked === 0 ? (
    <Badge variant="ok">{t("none")}</Badge>
  ) : (
    <Badge variant="degraded">{t("blocked", { count: blocked })}</Badge>
  );
}
