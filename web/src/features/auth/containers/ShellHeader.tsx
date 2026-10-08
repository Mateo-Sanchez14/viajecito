"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
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

  // No dangling "Hola," for a person who has no display name yet.
  const name = person.display_name.trim();

  return (
    <>
      <PushSubscriptionSync />
      <AppHeader
        appName={t("app.name")}
        homeHref="/"
        greeting={name ? t("home.greeting", { name }) : t("home.greetingAnonymous")}
        notifications={{ href: "/me/notifications", label: t("push.nav") }}
        logoutLabel={t("auth.logout")}
        onLogout={handleLogout}
        logoutPending={pending}
        errorMessage={failed ? t("auth.errors.unknown") : undefined}
      />
    </>
  );
}
