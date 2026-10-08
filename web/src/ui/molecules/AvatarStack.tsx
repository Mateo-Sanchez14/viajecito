import { Avatar } from "@/ui/atoms/Avatar";

type AvatarStackProps = {
  /** Names of the people to draw, in order; the caller caps them (the stack draws what it gets). */
  names: readonly string[];
  /** Everyone in the group; anyone beyond `names` becomes a "+N" bubble. */
  total: number;
  /** Visible, accessible summary next to the stack ("5 personas"). The avatars themselves are decorative. */
  label: string;
};

/** Overlapping avatars with the group size spelled out beside them, so the count never relies on the picture. */
export function AvatarStack({ names, total, label }: AvatarStackProps) {
  const hidden = Math.max(0, total - names.length);
  return (
    <span className="avatar-stack">
      <span className="avatar-stack-faces" aria-hidden="true">
        {names.map((name, index) => (
          <Avatar key={`${index}-${name}`} name={name} className="avatar-stack-face" />
        ))}
        {hidden > 0 && <span className="avatar-stack-more ui-tabular">+{hidden}</span>}
      </span>
      <span className="avatar-stack-label">{label}</span>
    </span>
  );
}
