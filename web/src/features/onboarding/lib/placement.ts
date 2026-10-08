export type Rect = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };
export type CardPlacement = { x: number; y: number; side: "above" | "below" | "center" };

/** Breathing room between the highlighted element and its ring. */
export const SPOT_PAD = 6;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/** The part of the target that is on screen: a tall element may stick out of the viewport. */
function visiblePart(target: Rect, viewport: Size): Rect {
  const left = Math.max(target.x, 0);
  const top = Math.max(target.y, 0);
  const right = Math.min(target.x + target.width, viewport.width);
  const bottom = Math.min(target.y + target.height, viewport.height);
  return { x: left, y: top, width: Math.max(right - left, 0), height: Math.max(bottom - top, 0) };
}

/**
 * Where the coach card goes, as the top-left corner of the card in viewport pixels. Below the target
 * when it fits and the target sits in the upper half, else above when it fits, else below, else pinned
 * to the bottom margin. Always fully inside the viewport. With no target the card is centered.
 */
export function placeCard(
  target: Rect | null,
  viewport: Size,
  card: Size,
  gap = 16,
  margin = 16,
): CardPlacement {
  const maxX = viewport.width - margin - card.width;
  const maxY = viewport.height - margin - card.height;
  if (!target) {
    return {
      x: clamp((viewport.width - card.width) / 2, margin, maxX),
      y: clamp((viewport.height - card.height) / 2, margin, maxY),
      side: "center",
    };
  }

  const seen = visiblePart(target, viewport);
  const top = seen.y - SPOT_PAD;
  const bottom = seen.y + seen.height + SPOT_PAD;
  const x = clamp(seen.x + seen.width / 2 - card.width / 2, margin, maxX);
  const fitsBelow = bottom + gap + card.height <= viewport.height - margin;
  const fitsAbove = top - gap - card.height >= margin;
  const inUpperHalf = seen.y + seen.height / 2 < viewport.height / 2;

  if (fitsBelow && (inUpperHalf || !fitsAbove)) return { x, y: bottom + gap, side: "below" };
  if (fitsAbove) return { x, y: top - gap - card.height, side: "above" };
  return { x, y: clamp(maxY, margin, maxY), side: "below" };
}
