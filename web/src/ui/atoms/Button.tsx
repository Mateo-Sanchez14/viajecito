import type { ComponentProps } from "react";

export type ButtonVariant = "primary" | "secondary" | "destructive" | "icon" | "link";
export type ButtonSize = "md" | "sm";

/** Only what Tailwind has to say; geometry, color and motion live in the authored `.ui-button-*` rules. */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "w-full",
  secondary: "",
  destructive: "",
  icon: "",
  link: "text-sm text-muted underline underline-offset-2",
};

type BaseProps = Omit<ComponentProps<"button">, "type"> & {
  size?: ButtonSize;
  type?: "button" | "submit";
};

/** An icon-only button has no visible text, so it must carry an accessible name. */
type ButtonProps =
  | (BaseProps & { variant?: Exclude<ButtonVariant, "icon"> })
  | (BaseProps & { variant: "icon"; "aria-label": string });

export function Button({
  variant = "primary",
  size = "md",
  type = "button",
  className = "",
  ...props
}: ButtonProps) {
  const sizeClass = size === "sm" ? "ui-button-sm" : "";
  return (
    <button
      type={type}
      className={`ui-button ui-button-${variant} ${sizeClass} ${VARIANT_CLASSES[variant]} disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
