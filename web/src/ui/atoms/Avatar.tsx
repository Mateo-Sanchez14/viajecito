import { UserIcon } from "@/ui/icons";

type AvatarProps = {
  name: string;
  src?: string;
  className?: string;
};

/**
 * Up to two uppercase initials taken from the words that start with a letter; "?" when the name
 * is blank and "" when it has words but none starts with a letter (a phone number, "+54 11 ...").
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words
    .filter((word) => /^\p{L}/u.test(word))
    .slice(0, 2)
    .map((word) => Array.from(word)[0].toUpperCase())
    .join("");
}

const BASE = "ui-avatar inline-flex size-9 shrink-0 items-center justify-center";

/** Round avatar: the image when there is one, otherwise the initials, or a person icon when there are none. */
export function Avatar({ name, src, className = "" }: AvatarProps) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- tiny user-supplied avatar, no optimization needed
      <img src={src} alt={name} className={`${BASE} object-cover ${className}`} />
    );
  }
  const initials = initialsOf(name);
  return (
    <span
      role="img"
      aria-label={name}
      className={`${BASE} bg-foreground/10 text-sm font-medium text-foreground ${className}`}
    >
      {initials || <UserIcon size={18} aria-hidden="true" />}
    </span>
  );
}
