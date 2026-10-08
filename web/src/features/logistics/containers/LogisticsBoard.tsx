"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { TaskList } from "./TaskList";
import { SectionBanner } from "@/ui/molecules/SectionBanner";
import { bannerPhoto } from "@/ui/photos/photos";
import { PackingList } from "./PackingList";
export function LogisticsBoard({ tripId }: { tripId: string }) {
  const t = useTranslations("logistics");
  const [tab, setTab] = useState<"tasks" | "packing">("tasks");
  return (
    <div className="ui-stack">
      <SectionBanner photo={bannerPhoto("logistics")} title={t("title")} />
      <div className="ui-segmented" role="tablist" aria-label={t("title")}>
        {(["tasks", "packing"] as const).map((key) => (
          <button
            key={key}
            id={`tab-${key}`}
            type="button"
            role="tab"
            aria-controls={`panel-${key}`}
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            {t(`tabs.${key}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "tasks" ? (
          <TaskList tripId={tripId} />
        ) : (
          <PackingList tripId={tripId} />
        )}
      </div>
    </div>
  );
}
