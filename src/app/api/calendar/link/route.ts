import { z } from 'zod';
import { ok, readJson, requireStudent, route, siteOrigin } from '@/lib/http';
import { enforce } from '@/lib/rate-limit';
import { calendarToken } from '@/lib/calendar/repo';

export const dynamic = 'force-dynamic';

export interface CalendarLinks {
  /** https link, for copying into Google Calendar ("From URL") or any other calendar app. */
  url: string;
  /** webcal link: on an iPhone it opens Calendar's subscribe sheet. */
  webcal: string;
  /** Opens Google Calendar's "add this calendar" page. */
  google: string;
}

function links(req: Request, token: string): CalendarLinks {
  const url = `${siteOrigin(req)}/api/calendar/${token}.ics`;
  const webcal = url.replace(/^https?:\/\//, 'webcal://');
  return { url, webcal, google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}` };
}

/** The signed-in student's calendar link, if they have made one. */
export const GET = route(async (req) => {
  const student = await requireStudent();
  const token = await calendarToken(student.rollNo);
  return ok({ links: token ? links(req, token) : null });
});

const body = z.object({ reset: z.boolean().optional() });

/** Makes the link (or, with `reset`, a new one — the old link stops working). */
export const POST = route(async (req) => {
  const student = await requireStudent();
  const { reset } = await readJson(req, body);
  await enforce(`calendar-link:${student.rollNo}`, 20, 60 * 60, 'Too many new links. Try again in a while.');
  const token = await calendarToken(student.rollNo, { create: true, reset: Boolean(reset) });
  return ok({ links: links(req, token!) });
});
