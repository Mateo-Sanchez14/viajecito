import type { ReactElement } from "react";

export type TripCoverScene = "road" | "beach" | "snow" | "city";

type TripCoverArtProps = {
  scene: TripCoverScene;
  className?: string;
};

/**
 * Flat geometric cover scenes. Colors come only from the art tokens through `art-*` classes in
 * globals.css, so every scene follows the light and dark themes. Each one carries the same
 * motif as the login route: a dashed way ending on a ringed destination dot.
 *
 * The focal elements sit in the middle 270px of the 480px canvas, so the square crop used by
 * trip tickets and the 4:3 crop of the wide hero keep the point of the picture.
 */
const SCENES: Record<TripCoverScene, () => ReactElement> = {
  road: () => (
    <>
      <circle className="art-sun" cx="338" cy="92" r="40" />
      <rect className="art-cloud" x="64" y="56" width="92" height="12" rx="6" />
      <rect className="art-cloud" x="92" y="76" width="56" height="12" rx="6" />
      <rect className="art-cloud" x="378" y="150" width="64" height="10" rx="5" />
      <path
        className="art-ground"
        d="M0 170C48 148 104 140 160 154C214 168 262 178 322 154C382 130 436 134 480 150V270H0Z"
      />
      <path
        className="art-ground-2"
        d="M0 208C64 180 132 186 196 206C262 226 330 216 392 192C430 178 458 178 480 184V270H0Z"
      />
      <path className="art-ink" d="M92 176L104 204H80Z" />
      <path className="art-ink" d="M118 188L132 218H104Z" />
      <path
        className="art-ink"
        d="M164 270C212 236 298 226 311 198C317 184 319 172 323 160L331 160C335 174 343 186 347 200C353 228 318 248 310 270Z"
      />
      <path
        className="art-stroke-paper art-dash"
        d="M238 270C262 244 320 230 331 198C335 186 333 174 327 164"
      />
      <circle className="art-ring" cx="327" cy="146" r="10" />
      <circle className="art-accent" cx="327" cy="146" r="4" />
    </>
  ),
  beach: () => (
    <>
      <circle className="art-sun" cx="322" cy="88" r="38" />
      <rect className="art-cloud" x="70" y="60" width="96" height="12" rx="6" />
      <rect className="art-cloud" x="104" y="80" width="58" height="12" rx="6" />
      <rect className="art-water" x="0" y="150" width="480" height="120" />
      <path className="art-ground-2" d="M344 150A34 34 0 0 1 412 150Z" />
      <path className="art-stroke-paper art-wave" d="M48 176q16-9 32 0t32 0t32 0" />
      <path className="art-stroke-paper art-wave" d="M300 196q16-9 32 0t32 0t32 0" />
      <path
        className="art-paper"
        d="M0 236C84 218 176 218 262 230C346 242 420 238 480 224V270H0Z"
      />
      <path className="art-route" d="M232 250C286 226 332 196 372 156" />
      <path className="art-line art-line-bold" d="M178 124L170 238" />
      <path className="art-accent" d="M118 160A60 54 0 0 1 238 160Z" />
      <path className="art-paper" d="M178 106L162 160H192Z" />
      <circle className="art-ring" cx="372" cy="128" r="10" />
      <circle className="art-accent" cx="372" cy="128" r="4" />
    </>
  ),
  snow: () => (
    <>
      <circle className="art-sun" cx="372" cy="70" r="26" />
      <rect className="art-cloud" x="76" y="52" width="88" height="12" rx="6" />
      <path className="art-ground" d="M296 220L392 112L488 220Z" />
      <path className="art-snow" d="M392 112L416 138L402 134L392 150L382 134L368 138Z" />
      <path className="art-ground" d="M-24 220L60 128L150 220Z" />
      <path className="art-snow" d="M60 128L84 154L70 150L60 166L50 150L36 154Z" />
      <path className="art-ground-2" d="M104 226L232 74L360 226Z" />
      <path className="art-snow" d="M232 74L268 116L248 110L232 132L216 110L196 116Z" />
      <path
        className="art-snow"
        d="M0 232C80 212 170 220 250 234C320 246 400 236 480 214V270H0Z"
      />
      <path className="art-ink" d="M388 188L406 220H370Z" />
      <path className="art-ink" d="M388 206L412 242H364Z" />
      <path className="art-ink" d="M118 196L134 226H102Z" />
      <path className="art-ink" d="M118 212L140 246H96Z" />
      <path className="art-route" d="M168 262C204 240 214 214 224 186C232 164 240 140 232 98" />
      <circle className="art-ring" cx="232" cy="58" r="10" />
      <circle className="art-accent" cx="232" cy="58" r="4" />
    </>
  ),
  city: () => (
    <>
      <circle className="art-sun" cx="352" cy="118" r="36" />
      <rect className="art-cloud" x="64" y="50" width="94" height="12" rx="6" />
      <rect className="art-cloud" x="380" y="64" width="62" height="10" rx="5" />
      <path
        className="art-ground"
        d="M60 232V164H96V136H132V176H160V150H196V232ZM296 232V144H328V120H366V168H398V140H432V232Z"
      />
      <path
        className="art-ground-2"
        d="M84 232V188H122V156H158V232ZM196 232V108H240V232ZM250 232V170H290V148H330V232ZM338 232V180H376V160H412V232Z"
      />
      <path
        className="art-paper"
        d="M130 168h8v8h-8ZM144 168h8v8h-8ZM130 186h8v8h-8ZM144 186h8v8h-8ZM130 204h8v8h-8ZM144 204h8v8h-8ZM206 124h8v8h-8ZM222 124h8v8h-8ZM206 144h8v8h-8ZM222 144h8v8h-8ZM206 164h8v8h-8ZM222 164h8v8h-8ZM206 184h8v8h-8ZM222 184h8v8h-8ZM264 184h8v8h-8ZM280 184h8v8h-8ZM264 204h8v8h-8ZM280 204h8v8h-8ZM352 194h8v8h-8ZM366 194h8v8h-8ZM352 212h8v8h-8Z"
      />
      <rect className="art-ink" x="0" y="232" width="480" height="38" />
      <path className="art-stroke-paper art-dash" d="M0 252H480" />
      <circle className="art-ring" cx="218" cy="84" r="10" />
      <circle className="art-accent" cx="218" cy="84" r="4" />
      <path className="art-route" d="M218 98V108" />
    </>
  ),
};

/** Decorative scene behind the trip hero and the trip tickets. Hidden from assistive tech. */
export function TripCoverArt({ scene, className = "" }: TripCoverArtProps) {
  const Scene = SCENES[scene];
  return (
    <svg
      viewBox="0 0 480 270"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      data-scene={scene}
      className={`trip-cover-art ${className}`}
    >
      <rect className="art-sky" width="480" height="270" />
      <Scene />
    </svg>
  );
}
