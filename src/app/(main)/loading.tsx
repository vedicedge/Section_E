/**
 * Shown the instant a student page is opened, while the server prepares it: a shimmering outline of
 * a page (title, intro, a few cards) inside the normal header and footer, instead of the old page
 * sitting frozen.
 */
export default function MainLoading() {
  return (
    <div className="container page page-skeleton" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="skeleton page-skeleton__eyebrow" />
      <div className="skeleton page-skeleton__title" />
      <div className="skeleton page-skeleton__lede" />
      <div className="page-skeleton__cards">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton page-skeleton__card" style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
    </div>
  );
}
