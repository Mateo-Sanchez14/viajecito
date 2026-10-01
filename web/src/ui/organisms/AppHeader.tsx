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
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-6 py-3">
        <span className="text-lg font-semibold tracking-tight">{appName}</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted">{greeting}</span>
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
