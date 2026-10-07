"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useTranslations } from "next-intl";

export type CaptureToastData = { message: string; href?: string };

const DISMISS_AFTER_MS = 5000;

/**
 * Confirmation of a capture. The caller keeps one persistent `role="status"` region and renders
 * this inside it, so the message is announced; it dismisses itself after five seconds.
 */
export function CaptureToast({ toast, onDismiss }: { toast: CaptureToastData; onDismiss: () => void }) {
  const t = useTranslations("capture.toast");

  useEffect(() => {
    const timer = window.setTimeout(onDismiss, DISMISS_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  return (
    <div className="capture-toast">
      <p>{toast.message}</p>
      {toast.href && (
        <Link href={toast.href} onClick={onDismiss} className="capture-toast-link">
          {t("view")}
        </Link>
      )}
    </div>
  );
}
