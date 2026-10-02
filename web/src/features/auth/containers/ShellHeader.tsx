"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import Link from "next/link";
import { PushSubscriptionSync } from "@/features/push/containers/PushSubscriptionSync";
import { dropThisDeviceSubscription } from "@/features/push/lib/device";
import { AppHeader } from "@/ui/organisms/AppHeader";
import { logout } from "../api/session";
import { useMe } from "../MeProvider";

/** Container: wires the header to the current person and the logout call. */
export function ShellHeader() {
  const t = useTranslations();
  const router = useRouter();
  const { person } = useMe();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleLogout() {
    setPending(true);
    setFailed(false);
    try {
      // Before the session ends: the api needs it to delete this device's subscription.
      await dropThisDeviceSubscription();
      await logout();
      router.replace("/login");
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <>
      <PushSubscriptionSync />
      <AppHeader
        appName={t("app.name")}
        greeting={t("home.greeting", { name: person.display_name })}
        logoutLabel={t("auth.logout")}
        onLogout={handleLogout}
        logoutPending={pending}
        errorMessage={failed ? t("auth.errors.unknown") : undefined}
      />
      <nav aria-label={t("push.nav")} className="shell-notifications mx-auto flex w-full justify-end px-6 pt-2">
        <Link href="/me/notifications" className="shell-notifications-link inline-flex min-h-11 items-center text-sm text-muted underline underline-offset-2">
          {t("push.nav")}
        </Link>
      </nav>
    </>
  );
}
