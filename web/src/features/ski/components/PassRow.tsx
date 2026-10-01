import { useTranslations } from "next-intl";
import { Avatar } from "@/ui/atoms/Avatar";
import type { PassRow as PassRowData } from "../api/ski";
import { PassStatusBadge } from "./PassStatusBadge";

/** Presentational: one person's lift pass for one resort. */
export function PassRow({ row, resortName }: { row: PassRowData; resortName: string }) {
  const t = useTranslations("ski.passes");
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-2">
      <span className="flex items-center gap-3">
        <Avatar name={row.person.display_name} />
        <span className="flex flex-col">
          <span className="font-medium">{row.person.display_name}</span>
          <span className="text-sm text-muted">
            {resortName}
            {row.product && <> · <span>{row.product}</span></>}
            {row.days !== null && <> · {t("daysCount", { count: row.days })}</>}
          </span>
        </span>
      </span>
      <PassStatusBadge status={row.status} />
    </li>
  );
}
