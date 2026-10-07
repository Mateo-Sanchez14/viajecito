import Link from "next/link";
import type { ReactNode } from "react";
import { CaretRightIcon } from "@/ui/icons";

export type NextActionTone = "accent" | "warn" | "neutral";

type NextActionRowProps = {
  /** Decorative icon; the caller marks it `aria-hidden`. */
  icon: ReactNode;
  title: string;
  detail?: string;
  /** Makes the whole row one link, with a caret. */
  href?: string;
  tone?: NextActionTone;
};

/** One "what's missing" row: tinted icon chip, what to do, an optional hint and where to do it. */
export function NextActionRow({ icon, title, detail, href, tone = "accent" }: NextActionRowProps) {
  const content = (
    <>
      <span className="next-action-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="next-action-text">
        <span className="next-action-title">{title}</span>
        {detail && (
          <>
            {" "}
            <span className="next-action-detail">{detail}</span>
          </>
        )}
      </span>
      {href && <CaretRightIcon size={18} aria-hidden="true" className="next-action-caret" />}
    </>
  );

  return href ? (
    <Link href={href} data-tone={tone} className="next-action ui-card">
      {content}
    </Link>
  ) : (
    <div data-tone={tone} className="next-action ui-card">
      {content}
    </div>
  );
}
