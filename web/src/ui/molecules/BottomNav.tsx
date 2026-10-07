"use client";

import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";
import { CaretRightIcon } from "@/ui/icons";
import { Sheet } from "./Sheet";
import type { SectionNavItem } from "./SectionNav";

export type BottomNavItem = SectionNavItem & {
  icon: ReactNode;
  /** Rendered instead of `icon` while the item is the current page (the fill weight). */
  activeIcon?: ReactNode;
};

type BottomNavProps = {
  /** Accessible name of the landmark; must differ from the wide section nav's name. */
  label: string;
  items: BottomNavItem[];
  /** Overflow entry: a button opening a sheet with the sections that did not fit. */
  more?: {
    label: string;
    title: string;
    closeLabel: string;
    icon: ReactNode;
    items: BottomNavItem[];
  };
};

/** Floating phone navigation: up to five slots, the last one optionally a "more" sheet. */
export function BottomNav({ label, items, more }: BottomNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const slots = items.length + (more ? 1 : 0);
  const moreActive = more?.items.some((item) => item.active) ?? false;

  return (
    <>
      <nav aria-label={label} className="bottom-nav">
        <ul style={{ "--items": slots } as CSSProperties}>
          {items.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                className="bottom-nav-item"
              >
                {item.active ? (item.activeIcon ?? item.icon) : item.icon}
                <span>{item.label}</span>
              </Link>
            </li>
          ))}
          {more && (
            <li>
              <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={moreOpen}
                data-active={moreActive || undefined}
                className="bottom-nav-item"
                onClick={() => setMoreOpen(true)}
              >
                {more.icon}
                <span>{more.label}</span>
              </button>
            </li>
          )}
        </ul>
      </nav>
      {more && (
        <Sheet
          open={moreOpen}
          onClose={() => setMoreOpen(false)}
          title={more.title}
          closeLabel={more.closeLabel}
        >
          <ul className="bottom-nav-sheet-list">
            {more.items.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  aria-current={item.active ? "page" : undefined}
                  className="bottom-nav-sheet-link"
                  onClick={() => setMoreOpen(false)}
                >
                  {item.active ? (item.activeIcon ?? item.icon) : item.icon}
                  <span>{item.label}</span>
                  <CaretRightIcon size={18} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </>
  );
}
