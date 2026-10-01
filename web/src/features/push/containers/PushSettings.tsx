"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/shared/api/errors";
import { Button } from "@/ui/atoms/Button";
import { PUSH_CATEGORIES, type PushCategory } from "../api/push";
import { CategoryToggle } from "../components/CategoryToggle";
import { PermissionState } from "../components/PermissionState";
import { useSavePreferences, useSendTestPush } from "../hooks/mutations";
import { usePushDevice } from "../hooks/usePushDevice";
import { usePushPreferences } from "../hooks/queries";

const KNOWN_ERRORS = new Set(["push_unavailable", "invalid_subscription", "rate_limited"]);

/** `/me/notifications`: enable or disable push on this device, pick categories, send a test. */
export function PushSettings() {
  const t = useTranslations("push");
  const device = usePushDevice();
  const preferences = usePushPreferences({ enabled: device.subscribed });
  const savePreferences = useSavePreferences();
  const sendTest = useSendTestPush();
  const [feedback, setFeedback] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  const [testWaitSeconds, setTestWaitSeconds] = useState<number | null>(null);
  const waitTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(waitTimer.current), []);

  const fail = (error: unknown) => {
    if (error instanceof ApiError && error.status === 429 && error.retryAfterSeconds) {
      const seconds = error.retryAfterSeconds;
      setFeedback({ kind: "error", text: t("errors.rate_limited_wait", { seconds }) });
      setTestWaitSeconds(seconds);
      clearTimeout(waitTimer.current);
      waitTimer.current = setTimeout(() => setTestWaitSeconds(null), seconds * 1000);
      return;
    }
    setFeedback({
      kind: "error",
      text: t(`errors.${error instanceof ApiError && KNOWN_ERRORS.has(error.code) ? error.code : "unknown"}`),
    });
  };

  if (device.support === "unknown") return null;

  const busy = device.enable.isPending || device.disable.isPending;

  const status = (() => {
    if (device.support === "unsupported") return { tone: "warn", text: t("unsupported") } as const;
    if (device.support === "ios-needs-install") return { tone: "warn", text: t("iosNeedsInstall") } as const;
    if (device.permission === "denied") return { tone: "warn", text: t("denied") } as const;
    if (device.subscribed) return { tone: "ok", text: t("enabled") } as const;
    return { tone: "neutral", text: t("disabled") } as const;
  })();

  const canToggle = device.support === "supported" && device.permission !== "denied" && !device.loading;

  const toggleCategory = (category: PushCategory, checked: boolean) => {
    if (!preferences.data) return;
    setFeedback(null);
    savePreferences.mutate({ ...preferences.data, [category]: checked }, { onError: () => setFeedback({ kind: "error", text: t("errors.preferences") }) });
  };

  return (
    <div className="flex flex-col gap-6">
      <PermissionState tone={status.tone}>{status.text}</PermissionState>

      {canToggle && !device.subscribed && (
        <Button
          className="min-h-11 sm:w-auto"
          disabled={busy}
          onClick={() => {
            setFeedback(null);
            device.enable.mutate(undefined, { onError: fail });
          }}
        >
          {device.enable.isPending ? t("enabling") : t("enable")}
        </Button>
      )}

      {canToggle && device.subscribed && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            className="min-h-11 w-auto"
            disabled={sendTest.isPending || testWaitSeconds !== null}
            onClick={() => {
              setFeedback(null);
              sendTest.mutate(undefined, {
                onSuccess: (sent) => setFeedback({ kind: "info", text: sent > 0 ? t("testSent") : t("testNone") }),
                onError: fail,
              });
            }}
          >
            {t("test")}
          </Button>
          <Button
            variant="link"
            className="min-h-11"
            disabled={busy}
            onClick={() => {
              setFeedback(null);
              device.disable.mutate(undefined, { onError: fail });
            }}
          >
            {t("disable")}
          </Button>
        </div>
      )}

      {feedback && (
        <p role={feedback.kind === "error" ? "alert" : "status"} className="text-sm">
          {feedback.text}
        </p>
      )}

      {device.subscribed && preferences.data && (
        <section aria-labelledby="push-preferences" className="flex flex-col gap-2">
          <h2 id="push-preferences" className="text-lg font-semibold">
            {t("preferences")}
          </h2>
          {PUSH_CATEGORIES.map((category) => (
            <CategoryToggle
              key={category}
              label={t(`categories.${category}`)}
              checked={preferences.data[category]}
              disabled={savePreferences.isPending || (category !== "all" && !preferences.data.all)}
              onChange={(checked) => toggleCategory(category, checked)}
            />
          ))}
        </section>
      )}

      <p className="text-sm text-muted">{t("sharedDevice")}</p>
    </div>
  );
}
