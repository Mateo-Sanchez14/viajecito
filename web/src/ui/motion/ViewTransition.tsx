import * as React from "react";
import type { ComponentType, ReactNode, ViewTransitionProps } from "react";

/** Stable React (vitest/jsdom) has no <ViewTransition>: render the children unchanged. */
function Passthrough({ children }: ViewTransitionProps): ReactNode {
  return children ?? null;
}

const native = (React as unknown as { ViewTransition?: ComponentType<ViewTransitionProps> }).ViewTransition;

/**
 * React's <ViewTransition> where the runtime ships it (the Next App Router canary build), a
 * passthrough elsewhere. Import it only from here: every other module goes through this file.
 */
export const ViewTransition: ComponentType<ViewTransitionProps> = native ?? Passthrough;
export const hasNativeViewTransition = native !== undefined;
