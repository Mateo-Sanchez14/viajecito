"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/ui/atoms/Button";
import { Card } from "@/ui/atoms/Card";
import { InstallSteps } from "../components/InstallSteps";
import { useDismissal } from "../hooks/useDismissal";
import { useInstallState } from "../hooks/useInstallState";
import { DAY_MS } from "../lib/dismissal";

export const INSTALL_DISMISS_KEY = "viajecito:install-dismissed";
const DISMISS_FOR_MS = 30 * DAY_MS;

/** Offers the install: native prompt where available, "Share, Add to Home Screen" on iOS. */
export function InstallPrompt() {
  const t = useTranslations("pwa.install");
  const { mode, install } = useInstallState();
  const [dismissed, dismiss] = useDismissal(INSTALL_DISMISS_KEY, DISMISS_FOR_MS);

  if (dismissed || (mode !== "prompt" && mode !== "ios")) return null;

  return (
    <Card as="section" aria-label={t("title")} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted">{t("body")}</p>
      </div>
      {mode === "ios" && (
        <InstallSteps steps={[t("iosSteps.share"), t("iosSteps.add"), t("iosSteps.confirm")]} />
      )}
      <div className="flex flex-wrap items-center gap-3">
        {mode === "prompt" && (
          <Button className="w-auto" onClick={() => void install()}>
            {t("cta")}
          </Button>
        )}
        <Button variant="link" className="min-h-11" onClick={dismiss}>
          {t("dismiss")}
        </Button>
      </div>
    </Card>
  );
}
