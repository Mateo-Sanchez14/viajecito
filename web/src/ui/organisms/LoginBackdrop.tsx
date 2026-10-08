import type { ReactNode } from "react";

type LoginBackdropProps = {
  /** The decorative footage layer (an `AmbientVideo`); the container decides what plays. */
  media: ReactNode;
  /** The app name, shown as a quiet wordmark in the top corner. */
  brand: string;
};

/**
 * Presentational: the cinematic frame behind the login card: footage, a dark-to-transparent scrim
 * and film grain. Hidden from assistive tech and inert; the login card above it carries all the text.
 */
export function LoginBackdrop({ media, brand }: LoginBackdropProps) {
  return (
    <div className="login-backdrop" aria-hidden="true">
      {media}
      <span className="login-backdrop-scrim" />
      <span className="login-backdrop-grain" />
      <span className="login-brand">{brand}</span>
    </div>
  );
}
