"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import type { TripCard } from "@/features/trips/cards/types";
import { useDismissal } from "@/features/pwa/hooks/useDismissal";
import { useStandalone } from "@/features/pwa/hooks/useInstallState";
import { DAY_MS } from "@/features/pwa/lib/dismissal";
import { Button } from "@/ui/atoms/Button";
import { Card } from "@/ui/atoms/Card";
import { readPermission, subscribePermission } from "../lib/permission";

export const PUSH_OPT_IN_DISMISS_KEY = "viajecito:push-opt-in-dismissed";
const FOREVER_MS = 3650 * DAY_MS;

/** Overview card (`order: 3`): shown once, to installed users who have not chosen on notifications. */
export const PushOptInCard: TripCard["Component"] = () => {
  const t = useTranslations("pwa.pushOptIn");
  const installed = useStandalone();
  const permission = useSyncExternalStore(subscribePermission, readPermission, () => "unsupported" as const);
  const [dismissed, dismiss] = useDismissal(PUSH_OPT_IN_DISMISS_KEY, FOREVER_MS);

  const canPush = typeof PushManager !== "undefined" && "serviceWorker" in navigator;
  if (!installed || dismissed || permission !== "default" || !canPush) return null;

  return (
    <Card as="section" aria-label={t("title")} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted">{t("body")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/me/notifications"
          className="inline-flex min-h-11 items-center rounded-xl bg-foreground px-4 text-base font-medium text-background"
        >
          {t("cta")}
        </Link>
        <Button variant="link" className="min-h-11" onClick={dismiss}>
          {t("dismiss")}
        </Button>
      </div>
    </Card>
  );
};
