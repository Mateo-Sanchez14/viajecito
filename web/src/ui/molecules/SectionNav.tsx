import Link from "next/link";
import type { ReactNode } from "react";

export type SectionNavItem = {
  key: string;
  label: string;
  href: string;
  active: boolean;
  /** Optional leading icon; callers pass it `aria-hidden`. */
  icon?: ReactNode;
};

type SectionNavProps = {
  label: string;
  items: SectionNavItem[];
  className?: string;
};

/** Horizontal tab-like navigation; scrolls sideways on narrow screens. */
export function SectionNav({ label, items, className = "" }: SectionNavProps) {
  return (
    <nav aria-label={label} className={`ui-section-nav w-full overflow-x-auto ${className}`}>
      <ul className="flex w-max min-w-full gap-1">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className="whitespace-nowrap text-sm font-medium"
            >
              {item.icon}
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
