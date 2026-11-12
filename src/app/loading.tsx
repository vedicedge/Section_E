/**
 * Shown while the home page (and any page outside the student layout) is being prepared: the
 * Section E tile gently pulsing in the middle of the screen.
 */
export default function RootLoading() {
  return (
    <div className="app-loader" aria-busy="true" aria-live="polite">
      <span className="app-loader__tile" aria-hidden>
        E
      </span>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
