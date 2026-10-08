/**
 * Presentational: the calm canvas behind the authenticated app. Three large soft glows drift very
 * slowly, over a faint topographic map and a film grain, all painted by globals.css. It is purely
 * decorative (hidden from assistive tech, no pointer events) and sits below the content layer.
 */
export function AppAtmosphere() {
  return (
    <div className="app-atmosphere" aria-hidden="true">
      <span className="app-atmosphere-blob" data-blob="a" />
      <span className="app-atmosphere-blob" data-blob="b" />
      <span className="app-atmosphere-blob" data-blob="c" />
    </div>
  );
}
