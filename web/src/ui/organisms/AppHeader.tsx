import Link from "next/link";
import { Button } from "@/ui/atoms/Button";
import { BellIcon, QuestionIcon } from "@/ui/icons";

type AppHeaderProps = {
  appName: string;
  greeting: string;
  logoutLabel: string;
  onLogout: () => void;
  logoutPending?: boolean;
  errorMessage?: string;
  /** Icon-only link in the account cluster; `label` is its accessible name. */
  notifications?: { href: string; label: string };
  /** Where the wordmark leads. Without it the wordmark is plain text. */
  homeHref?: string;
  /** Icon-only button before the bell (replays the onboarding tour); `label` is its accessible name. */
  help?: { label: string; onClick: () => void };
};

/** Presentational: app name, greeting, notifications shortcut and the logout control of the authenticated shell. */
export function AppHeader({
  appName,
  greeting,
  logoutLabel,
  onLogout,
  logoutPending = false,
  errorMessage,
  notifications,
  homeHref,
  help,
}: AppHeaderProps) {
  return (
    <header className="app-header border border-border bg-surface">
      <div className="app-header-inner flex w-full items-center justify-between gap-4 px-5 py-3">
        {homeHref ? (
          <Link href={homeHref} className="app-wordmark text-xl font-semibold tracking-tight">
            <span className="app-wordmark-text">{appName}</span>
          </Link>
        ) : (
          <span className="app-wordmark text-xl font-semibold tracking-tight">
            <span className="app-wordmark-text">{appName}</span>
          </span>
        )}
        <div className="app-account flex min-w-0 items-center gap-3">
          <span className="app-greeting text-sm text-muted">{greeting}</span>
          {help && (
            <Button
              variant="icon"
              aria-label={help.label}
              title={help.label}
              aria-haspopup="dialog"
              className="app-header-help"
              onClick={help.onClick}
            >
              <QuestionIcon size={22} aria-hidden="true" />
            </Button>
          )}
          {notifications && (
            <Link
              href={notifications.href}
              aria-label={notifications.label}
              title={notifications.label}
              className="app-header-notifications ui-button ui-button-icon"
            >
              <BellIcon size={22} aria-hidden="true" />
            </Link>
          )}
          <Button variant="link" onClick={onLogout} disabled={logoutPending}>
            {logoutLabel}
          </Button>
        </div>
      </div>
      {errorMessage && (
        <p role="alert" className="px-6 pb-2 text-center text-sm text-warn">
          {errorMessage}
        </p>
      )}
    </header>
  );
}
