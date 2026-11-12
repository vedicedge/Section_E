/**
 * Remounts on every navigation between student pages (layouts persist; templates don't), so each
 * page's content fades and rises in while the header and footer stay put. Plain CSS (see
 * .page-enter in globals.css): no View Transitions, so it behaves the same on every browser.
 */
export default function MainTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
