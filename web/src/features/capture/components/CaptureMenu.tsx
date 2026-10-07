"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CheckSquareIcon, LinkSimpleIcon, TagIcon } from "@/ui/icons";

export type CaptureKind = "link" | "idea" | "task";

const ICONS: Record<CaptureKind, ReactNode> = {
  link: <LinkSimpleIcon size={22} aria-hidden="true" />,
  idea: <TagIcon size={22} aria-hidden="true" />,
  task: <CheckSquareIcon size={22} aria-hidden="true" />,
};

const KINDS: CaptureKind[] = ["link", "idea", "task"];

/** First step of the sheet: pick what to add. One form is active at a time. */
export function CaptureMenu({ onPick }: { onPick: (kind: CaptureKind) => void }) {
  const t = useTranslations("capture.menu");
  return (
    <ul aria-label={t("label")} className="capture-menu">
      {KINDS.map((kind) => (
        <li key={kind}>
          <button type="button" className="capture-menu-item" onClick={() => onPick(kind)}>
            <span className="capture-menu-icon">{ICONS[kind]}</span>
            <span className="capture-menu-text">
              <span className="capture-menu-title">{t(`${kind}.title`)}</span>
              <span className="capture-menu-hint">{t(`${kind}.hint`)}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
