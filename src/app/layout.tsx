import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Suspense } from 'react';
import { preload } from 'react-dom';
import { NavProgress } from '@/components/NavProgress';
import './fonts.css';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Section E — Outside the building. Above the rest.',
    template: '%s · Section E',
  },
  description: 'Seating, homework, the live timetable and OLT mock tests for PGDM 2026–28, Section E.',
  robots: { index: false, follow: false },
  // Lets iPhone users add Section E to the Home Screen as an app (needed for reminders on iOS).
  appleWebApp: { capable: true, title: 'Section E', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#110c0a',
};

/**
 * Dark is the default. A visitor who picked light keeps it on this device. This runs before the
 * first paint so the page never flashes the wrong theme.
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('sectionE.theme');if(t==='light'){document.documentElement.setAttribute('data-theme','light');var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content','#f3ece2');}}catch(e){}})();`;

/**
 * Phones and laptops without Apple's system font draw the site in Inter. A preload at the top of the
 * page starts that download with the stylesheets instead of after them. Apple devices use their own
 * system font and never fetch Inter, so they don't get the preload.
 */
async function preloadInter() {
  const ua = (await headers()).get('user-agent') ?? '';
  if (/Mac|iPhone|iPad|iPod/.test(ua)) return;
  preload('/fonts/inter-5.3.0/inter-latin-wght-normal.woff2', { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' });
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await preloadInter();
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
