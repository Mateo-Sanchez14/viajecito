import type { ComponentProps } from "react";

export type ButtonVariant = "primary" | "link";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "w-full rounded-xl bg-foreground px-4 py-3 text-base font-medium text-background",
  link: "text-sm text-muted underline underline-offset-2",
};

type ButtonProps = Omit<ComponentProps<"button">, "type"> & {
  variant?: ButtonVariant;
  type?: "button" | "submit";
};

export function Button({
  variant = "primary",
  type = "button",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`ui-button ui-button-${variant} ${VARIANT_CLASSES[variant]} disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
