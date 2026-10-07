"use client";

import { useCallback, useMemo, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMe } from "@/features/auth/MeProvider";
import { PlusIcon } from "@/ui/icons";
import { Sheet } from "@/ui/molecules/Sheet";
import { CaptureToast, type CaptureToastData } from "../components/CaptureToast";
import { resolveCaptureTarget } from "../lib/target";
import { CaptureFlow } from "./CaptureFlow";

type RouteParams = { crewId?: string | string[]; tripId?: string | string[] };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Container, mounted once in the (app) layout: the "Agregar rápido" trigger and its sheet. It
 * shows on trip pages (target: that trip) and on home (target: the crews' default trips), and
 * nowhere else. A confirmation toast outlives the sheet it came from.
 */
export function QuickCaptureContainer() {
  const t = useTranslations("capture");
  const tUi = useTranslations("ui");
  const { crews } = useMe();
  const params = useParams<RouteParams>();
  const pathname = usePathname();
  // The sheet belongs to the page it was opened on: navigating elsewhere closes it.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const [toast, setToast] = useState<CaptureToastData | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const routeTripId = first(params?.tripId);
  const target = useMemo(
    () => resolveCaptureTarget(routeTripId, crews, first(params?.crewId)),
    [routeTripId, crews, params?.crewId],
  );
  const onCapturePage = routeTripId !== undefined || pathname === "/";
  const open = openedOn === pathname;

  return (
    <>
      {onCapturePage && target.kind !== "none" && (
        <>
          <button
            type="button"
            className="quick-capture-fab"
            aria-haspopup="dialog"
            onClick={() => setOpenedOn(pathname)}
          >
            <PlusIcon size={24} aria-hidden="true" />
            <span className="quick-capture-label">{t("trigger")}</span>
          </button>
          <Sheet open={open} onClose={() => setOpenedOn(null)} title={t("title")} closeLabel={tUi("close")}>
            <CaptureFlow target={target} onClose={() => setOpenedOn(null)} onCaptured={setToast} />
          </Sheet>
        </>
      )}
      <div className="capture-toast-region" role="status">
        {toast && <CaptureToast toast={toast} onDismiss={dismissToast} />}
      </div>
    </>
  );
}
