"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
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
      await logout();
      router.replace("/login");
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <AppHeader
      appName={t("app.name")}
      greeting={t("home.greeting", { name: person.display_name })}
      logoutLabel={t("auth.logout")}
      onLogout={handleLogout}
      logoutPending={pending}
      errorMessage={failed ? t("auth.errors.unknown") : undefined}
    />
  );
}
