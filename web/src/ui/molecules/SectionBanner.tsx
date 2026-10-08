"use client";

import type { ReactNode } from "react";
import { useHydrated } from "@/shared/lib/useHydrated";
import { useSaveData } from "@/shared/lib/useSaveData";
import { Photo } from "@/ui/atoms/Photo";
import type { Photo as PhotoData } from "@/ui/photos/photos";

type SectionBannerProps = {
  /** The section's photo; without one the banner is just the title panel. */
  photo: PhotoData | null;
  title: string;
  eyebrow?: string;
  subtitle?: string;
  /** Controls beside the title (an "add" button). */
  actions?: ReactNode;
};

const SIZES = "(min-width: 1120px) 1072px, 100vw";

/**
 * The slim head of a trip section: a strip of photo with the section title on an opaque panel
 * that overlaps its bottom edge, so text never sits on the picture. The title is the section's `h2`.
 * The photo is decorative and non-essential: it is only drawn once the page is hydrated (so people who
 * save data get the small file and nothing is fetched twice) in a box whose height the stylesheet
 * reserves, so it never shifts the layout.
 */
export function SectionBanner({ photo, title, eyebrow, subtitle, actions }: SectionBannerProps) {
  const hydrated = useHydrated();
  const saveData = useSaveData();
  return (
    <header className="section-banner" data-photo={photo ? "" : undefined}>
      {photo && (
        <div className="section-banner-media" aria-hidden="true">
          {hydrated && <Photo photo={photo} small={saveData} sizes={SIZES} />}
        </div>
      )}
      <div className="section-banner-panel">
        <div className="section-banner-text">
          {eyebrow && <p className="section-banner-eyebrow">{eyebrow}</p>}
          <h2 className="section-banner-title">{title}</h2>
          {subtitle && <p className="section-banner-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="section-banner-actions">{actions}</div>}
      </div>
    </header>
  );
}
