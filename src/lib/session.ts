import 'server-only';
import { cookies } from 'next/headers';
import { env } from './env';
import { hmac, safeEqual, sha256, verifySecret } from './crypto';
import { queryOne } from './db';

/**
 * Stateless signed cookies: base64url(payload).base64url(HMAC-SHA256(payload)).
 * Student tokens carry a `v` (session version) checked against the database, so an admin
 * PIN reset signs that student out everywhere. Admin tokens carry a fingerprint of the
 * configured credential, so changing the admin password invalidates old sessions.
 */

export const STUDENT_COOKIE = 'se_student';
export const ADMIN_COOKIE = 'se_admin';
const STUDENT_MAX_AGE = 60 * 60 * 24 * 180; // 180 days
const ADMIN_MAX_AGE = 60 * 60 * 12; // 12 hours

interface TokenPayload {
  sub: string;
  role: 'student' | 'admin';
  v: number | string;
  exp: number;
}

function sign(payload: TokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = hmac(env.sessionSecret, body).toString('base64url');
  return `${body}.${sig}`;
}

function verify(token: string | undefined, role: TokenPayload['role']): TokenPayload | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = hmac(env.sessionSecret, body).toString('base64url');
  if (!safeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    if (payload.role !== role || typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

const cookieBase = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.isProd,
  path: '/',
};

/* ------------------------------------------------------------------ students */

export interface StudentSession {
  rollNo: string;
  name: string;
}

export async function setStudentSession(rollNo: string, sessionVersion: number) {
  const store = await cookies();
  const exp = Math.floor(Date.now() / 1000) + STUDENT_MAX_AGE;
  store.set(STUDENT_COOKIE, sign({ sub: rollNo, role: 'student', v: sessionVersion, exp }), {
    ...cookieBase,
    maxAge: STUDENT_MAX_AGE,
  });
}

export async function clearStudentSession() {
  const store = await cookies();
  store.delete(STUDENT_COOKIE);
}

export async function getStudent(): Promise<StudentSession | null> {
  const store = await cookies();
  const payload = verify(store.get(STUDENT_COOKIE)?.value, 'student');
  if (!payload) return null;
  const row = await queryOne<{ roll_no: string; name: string; session_version: number; active: boolean }>(
    'SELECT roll_no, name, session_version, active FROM students WHERE roll_no = $1',
    [payload.sub],
  );
  if (!row || !row.active || Number(row.session_version) !== Number(payload.v)) return null;
  return { rollNo: row.roll_no, name: row.name };
}

/* --------------------------------------------------------------------- admin */

export function isAdminConfigured(): boolean {
  return Boolean(env.adminPasswordHash || env.adminPassword);
}

function adminFingerprint(): string {
  return sha256(`${env.adminPasswordHash ?? ''}|${env.adminPassword ?? ''}`).slice(0, 16);
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  if (env.adminPasswordHash) return verifySecret(password, env.adminPasswordHash);
  if (env.adminPassword) return safeEqual(sha256(password), sha256(env.adminPassword));
  return false;
}

export async function setAdminSession() {
  const store = await cookies();
  const exp = Math.floor(Date.now() / 1000) + ADMIN_MAX_AGE;
  store.set(ADMIN_COOKIE, sign({ sub: 'admin', role: 'admin', v: adminFingerprint(), exp }), {
    ...cookieBase,
    maxAge: ADMIN_MAX_AGE,
  });
}

export async function clearAdminSession() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  if (!isAdminConfigured()) return false;
  const store = await cookies();
  const payload = verify(store.get(ADMIN_COOKIE)?.value, 'admin');
  return Boolean(payload && payload.v === adminFingerprint());
}
