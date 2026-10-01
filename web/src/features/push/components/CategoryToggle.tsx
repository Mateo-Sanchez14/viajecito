import { useId } from "react";

type CategoryToggleProps = {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
};

/** Presentational switch: the whole row is the (>= 44px) touch target. */
export function CategoryToggle({ label, checked, disabled = false, onChange }: CategoryToggleProps) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
    >
      <span className="font-medium">{label}</span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="size-5 accent-foreground"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
