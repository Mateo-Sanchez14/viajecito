import { Button } from "@/ui/atoms/Button";

type AppHeaderProps = {
  appName: string;
  greeting: string;
  logoutLabel: string;
  onLogout: () => void;
  logoutPending?: boolean;
  errorMessage?: string;
};

/** Presentational: app name, greeting and the logout control of the authenticated shell. */
export function AppHeader({
  appName,
  greeting,
  logoutLabel,
  onLogout,
  logoutPending = false,
  errorMessage,
}: AppHeaderProps) {
  return (
    <header className="app-header border border-border bg-surface">
      <div className="app-header-inner flex w-full items-center justify-between gap-4 px-5 py-3">
        <span className="app-wordmark text-xl font-semibold tracking-tight">{appName}</span>
        <div className="app-account flex min-w-0 items-center gap-3">
          <span className="app-greeting text-sm text-muted">{greeting}</span>
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
