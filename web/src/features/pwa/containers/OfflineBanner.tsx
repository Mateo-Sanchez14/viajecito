"use client";

import { useTranslations } from "next-intl";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

/** Tells the user the screen shows cached data. `always` skips the connection check (offline page). */
export function OfflineBanner({ always = false }: { always?: boolean }) {
  const t = useTranslations("pwa.offline");
  const online = useOnlineStatus();

  if (online && !always) return null;
  return (
    <p
      role="status"
      className="rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-sm font-medium text-warn"
    >
      {t("banner")}
    </p>
  );
}
