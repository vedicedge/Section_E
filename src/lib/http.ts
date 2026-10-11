import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError, type ZodType } from 'zod';
import { isAdmin, getStudent, type StudentSession } from './session';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'error',
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { 'Cache-Control': 'no-store', ...init?.headers } });
}

export function fail(status: number, message: string, code = 'error', extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Rejects cross-site state-changing requests (defence in depth on top of SameSite=Lax cookies).
 */
export function assertSameOrigin(req: Request) {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') {
    throw new HttpError(403, 'Cross-site request blocked.', 'cross_site');
  }
  const origin = req.headers.get('origin');
  if (!origin) return;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, 'Bad origin.', 'cross_site');
  }
  if (!host || originHost !== host) throw new HttpError(403, 'Cross-site request blocked.', 'cross_site');
}

export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, 'Request body must be JSON.', 'bad_json');
  }
  return schema.parse(body);
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export async function requireAdmin() {
  if (!(await isAdmin())) throw new HttpError(401, 'Admin sign-in required.', 'unauthorized');
}

export async function requireStudent(): Promise<StudentSession> {
  const student = await getStudent();
  if (!student) throw new HttpError(401, 'Please register with your roll number first.', 'unregistered');
  return student;
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wraps a route handler: same-origin check for writes + uniform error responses. */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') assertSameOrigin(req);
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) return fail(err.status, err.message, err.code, err.extra);
      if (err instanceof ZodError) {
        const first = err.issues[0];
        const where = first?.path.length ? `${first.path.join('.')}: ` : '';
        return fail(422, `${where}${first?.message ?? 'Invalid input.'}`, 'invalid', { issues: err.issues });
      }
      console.error('[section-e] unhandled route error', err);
      return fail(500, 'Something went wrong on our side. Please try again.', 'internal');
    }
  };
}
