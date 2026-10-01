/** Presentational: the manual "Add to Home Screen" steps for iOS. */
export function InstallSteps({ steps }: { steps: string[] }) {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
      {steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  );
}
