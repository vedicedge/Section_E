import type { Metadata, Viewport } from 'next';
import '@fontsource/cormorant-garamond/latin-300.css';
import '@fontsource/cormorant-garamond/latin-400.css';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-300-italic.css';
import '@fontsource/cormorant-garamond/latin-400-italic.css';
import '@fontsource/cormorant-garamond/latin-500-italic.css';
import '@fontsource/pinyon-script/latin-400.css';
import '@fontsource-variable/inter/wght.css';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Section E — Outside the building. Above the rest.',
    template: '%s · Section E',
  },
  description: 'Seating, homework, the live timetable and OLT mock tests for PGDM 2026–28, Section E.',
  robots: { index: false, follow: false },
  // Lets iPhone users add Section E to the Home Screen as an app (needed for reminders on iOS).
  appleWebApp: { capable: true, title: 'Section E', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f0360f' },
    { media: '(prefers-color-scheme: dark)', color: '#110c0a' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
