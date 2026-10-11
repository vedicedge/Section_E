import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Section E',
    short_name: 'Section E',
    description: 'Seating, the live timetable, homework reminders and OLT mock tests for PGDM 2026–28, Section E.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f3ece2',
    theme_color: '#f0360f',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
