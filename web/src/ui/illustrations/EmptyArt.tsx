import type { ReactElement } from "react";

export type EmptyArtScene = "map" | "suitcase" | "ticket" | "coins";

/**
 * Small flat scenes for empty states, at most eight shapes each. Like the cover scenes they take
 * every color from the art tokens through `art-*` classes. The ringed dot is the login route motif.
 */
const SCENES: Record<EmptyArtScene, () => ReactElement> = {
  // Proposals and itinerary: a folded map with a dashed way to a ringed destination.
  map: () => (
    <>
      <path className="art-paper art-outline" d="M32 42L62 34L98 42L128 34V90L98 98L62 90L32 98Z" />
      <path className="art-ground" d="M62 34L98 42V98L62 90Z" />
      <path className="art-route" d="M46 82C62 70 70 76 82 64S100 52 108 52" />
      <circle className="art-accent" cx="46" cy="82" r="4" />
      <circle className="art-ring" cx="110" cy="50" r="8" />
      <circle className="art-accent" cx="110" cy="50" r="3" />
    </>
  ),
  // Logistics: a rolling suitcase heading somewhere.
  suitcase: () => (
    <>
      <path className="art-line art-line-bold" d="M62 44V34a6 6 0 0 1 6-6h16a6 6 0 0 1 6 6V44" />
      <rect className="art-accent art-outline" x="38" y="44" width="68" height="52" rx="10" />
      <path className="art-ink" d="M58 44h6v52h-6ZM80 44h6v52h-6Z" />
      <path className="art-ink" d="M58 97a5 5 0 1 0 0 10a5 5 0 1 0 0-10ZM86 97a5 5 0 1 0 0 10a5 5 0 1 0 0-10Z" />
      <path className="art-route" d="M112 84C128 80 132 68 126 54" />
      <circle className="art-ring" cx="124" cy="44" r="8" />
      <circle className="art-accent" cx="124" cy="44" r="3" />
    </>
  ),
  // Documents: a ticket with a perforated stub.
  ticket: () => (
    <>
      <path
        className="art-paper art-outline"
        d="M26 46a6 6 0 0 1 6-6H96a6 6 0 0 0 12 0H128a6 6 0 0 1 6 6V80a6 6 0 0 1-6 6H108a6 6 0 0 0-12 0H32a6 6 0 0 1-6-6Z"
      />
      <path className="art-line art-dash-sm" d="M102 50V76" />
      <path className="art-line art-line-bold" d="M40 54h38M40 63h26M40 72h34" />
      <circle className="art-ring" cx="118" cy="63" r="8" />
      <circle className="art-accent" cx="118" cy="63" r="3" />
    </>
  ),
  // Budget: a stack of coins with one leaning on it.
  coins: () => (
    <>
      <path className="art-line" d="M28 100H132" />
      <rect className="art-accent art-outline" x="34" y="86" width="52" height="12" rx="6" />
      <rect className="art-paper art-outline" x="38" y="73" width="52" height="12" rx="6" />
      <rect className="art-accent art-outline" x="34" y="60" width="52" height="12" rx="6" />
      <circle className="art-sun art-outline" cx="110" cy="76" r="22" />
      <circle className="art-line" cx="110" cy="76" r="12" />
    </>
  ),
};

/** Decorative illustration for an empty state. Hidden from assistive tech. */
export function EmptyArt({ scene, className = "" }: { scene: EmptyArtScene; className?: string }) {
  const Scene = SCENES[scene];
  return (
    <svg
      viewBox="0 0 160 120"
      aria-hidden="true"
      focusable="false"
      data-scene={scene}
      className={`empty-art ${className}`}
    >
      <ellipse className="art-sky" cx="80" cy="64" rx="72" ry="50" />
      <Scene />
    </svg>
  );
}
