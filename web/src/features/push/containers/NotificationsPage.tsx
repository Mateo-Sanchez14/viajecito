"use client";

import { useTranslations } from "next-intl";
import { PageHeader } from "@/ui/molecules/PageHeader";
import { PushSettings } from "./PushSettings";

/** Body of `/me/notifications`. */
export function NotificationsPage() {
  const t = useTranslations("push");
  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <PushSettings />
    </>
  );
}
