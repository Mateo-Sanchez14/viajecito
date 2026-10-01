import Link from "next/link";

export type SectionNavItem = {
  key: string;
  label: string;
  href: string;
  active: boolean;
};

type SectionNavProps = {
  label: string;
  items: SectionNavItem[];
};

/** Horizontal tab-like navigation; scrolls sideways on narrow screens. */
export function SectionNav({ label, items }: SectionNavProps) {
  return (
    <nav aria-label={label} className="-mx-6 overflow-x-auto px-6">
      <ul className="flex w-max min-w-full gap-1 border-b border-border">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={`block whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
                item.active
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
