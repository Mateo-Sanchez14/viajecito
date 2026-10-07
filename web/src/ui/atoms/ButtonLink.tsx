import Link from "next/link";
import type { ComponentProps } from "react";
import type { ButtonSize } from "./Button";

export type ButtonLinkVariant = "primary" | "secondary" | "link";

const VARIANT_CLASSES: Record<ButtonLinkVariant, string> = {
  primary: "no-underline",
  secondary: "no-underline",
  link: "text-sm text-muted underline underline-offset-2",
};

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonLinkVariant;
  size?: ButtonSize;
};

/** A navigation link that looks like a Button. Unlike Button it is never full width by default. */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonLinkProps) {
  const sizeClass = size === "sm" ? "ui-button-sm" : "";
  return (
    <Link
      className={`ui-button ui-button-${variant} ${sizeClass} ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
