type AvatarProps = {
  name: string;
  src?: string;
  className?: string;
};

/** Up to two uppercase initials; "?" when the name is blank. */
export function initialsOf(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase());
  return letters.length > 0 ? letters.join("") : "?";
}

const BASE = "ui-avatar inline-flex size-9 shrink-0 items-center justify-center rounded-full";

/** Round avatar: the image when there is one, otherwise the person's initials. */
export function Avatar({ name, src, className = "" }: AvatarProps) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- tiny user-supplied avatar, no optimization needed
      <img src={src} alt={name} className={`${BASE} object-cover ${className}`} />
    );
  }
  return (
    <span
      role="img"
      aria-label={name}
      className={`${BASE} bg-foreground/10 text-sm font-medium text-foreground ${className}`}
    >
      {initialsOf(name)}
    </span>
  );
}
