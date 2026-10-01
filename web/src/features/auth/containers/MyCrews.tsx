"use client";

import { useTranslations } from "next-intl";
import { CrewList } from "@/ui/molecules/CrewList";
import { useMe } from "../MeProvider";

/** Container: the signed-in person's crews, read from the shell's `/api/me` payload. */
export function MyCrews() {
  const t = useTranslations("home.crews");
  const { crews } = useMe();

  return (
    <section className="flex w-full flex-col gap-3">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <CrewList crews={crews} />
    </section>
  );
}
