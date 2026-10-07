import { Button } from "@/ui/atoms/Button";
import { WarningCircleIcon } from "@/ui/icons";

type InlineErrorProps = {
  message: string;
  /** Both `retryLabel` and `onRetry` are needed for the retry button to render. */
  retryLabel?: string;
  onRetry?: () => void;
};

/** Inline failure notice for a fetch that did not work, with an optional retry. */
export function InlineError({ message, retryLabel, onRetry }: InlineErrorProps) {
  return (
    <div role="alert" className="ui-inline-error">
      <WarningCircleIcon size={20} aria-hidden="true" />
      <p className="text-sm">{message}</p>
      {onRetry && retryLabel && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
