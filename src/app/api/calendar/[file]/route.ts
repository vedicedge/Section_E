import { siteOrigin } from '@/lib/http';
import { hit } from '@/lib/rate-limit';
import { sha256 } from '@/lib/crypto';
import { calendarFor, studentForCalendarToken } from '@/lib/calendar/repo';

export const dynamic = 'force-dynamic';

const notFound = () => new Response('Calendar not found. Get a new link from the Section E site.', { status: 404 });

/**
 * A student's class calendar, read by calendar apps (no cookies, so the link's token is the key).
 * Only the student the token belongs to — registered and still on the roster — gets a calendar.
 */
export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const token = file.replace(/\.ics$/i, '');
  const student = await studentForCalendarToken(token);
  if (!student) return notFound();
  const limited = await hit(`calendar:${sha256(token).slice(0, 16)}`, 240, 60 * 60);
  if (!limited.ok) return new Response('Too many requests.', { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } });
  const body = await calendarFor(student.rollNo, siteOrigin(req));
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="section-e.ics"',
      'Cache-Control': 'private, max-age=600',
      'X-Robots-Tag': 'noindex',
    },
  });
}
