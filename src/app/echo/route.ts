import { NextResponse } from 'next/server';
import { getStudent } from '@/lib/session';
import { echoUrlFor } from '@/lib/echo';

export const dynamic = 'force-dynamic';

/** "Ask Echo": sends a signed-in student to the Echo they were invited to; anyone else registers first. */
export async function GET(req: Request) {
  const student = await getStudent();
  if (!student) return NextResponse.redirect(new URL('/register?next=/echo', req.url));
  return NextResponse.redirect(echoUrlFor(student.rollNo));
}
