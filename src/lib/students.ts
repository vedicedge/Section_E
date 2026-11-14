import 'server-only';
import { randomInt } from 'node:crypto';
import { query, queryOne } from './db';
import { hashSecret, verifySecret } from './crypto';
import { HttpError } from './http';
import { cleanName, isValidRoll, normaliseRoll } from './names';
import { removeAllSubscriptions } from './push';

interface StudentRow {
  roll_no: string;
  name: string;
  active: boolean;
  source: string;
  pin_hash: string | null;
  claimed_at: Date | null;
  session_version: number;
  last_seen_at: Date | null;
  recovery_hash: string | null;
}

export async function rosterSize(): Promise<number> {
  const row = await queryOne<{ n: number }>('SELECT count(*)::int AS n FROM students WHERE active');
  return Number(row?.n ?? 0);
}

export async function findStudent(rollInput: string): Promise<StudentRow | null> {
  const roll = normaliseRoll(rollInput);
  if (!isValidRoll(roll)) return null;
  return queryOne<StudentRow>('SELECT * FROM students WHERE roll_no = $1 AND active', [roll]);
}

/** First visit: the student chooses a PIN that protects their roll number from then on. */
export async function claimStudent(rollNo: string, pin: string): Promise<StudentRow> {
  const hash = await hashSecret(pin);
  const row = await queryOne<StudentRow>(
    `UPDATE students SET pin_hash = $2, claimed_at = now(), last_seen_at = now(), updated_at = now()
     WHERE roll_no = $1 AND active AND pin_hash IS NULL RETURNING *`,
    [rollNo, hash],
  );
  if (!row) throw new HttpError(409, 'This roll number has already been registered. Enter its PIN instead.', 'already_claimed');
  return row;
}

export async function verifyStudentPin(rollNo: string, pin: string): Promise<StudentRow | null> {
  const row = await queryOne<StudentRow>('SELECT * FROM students WHERE roll_no = $1 AND active', [rollNo]);
  if (!row?.pin_hash) return null;
  if (!(await verifySecret(pin, row.pin_hash))) return null;
  await query('UPDATE students SET last_seen_at = now() WHERE roll_no = $1', [rollNo]);
  return row;
}

/* ---------------------------------------------------------------- self-service PIN reset */

// No 0/O, 1/I/L: easy to read back from a screenshot or a note. 12 characters ≈ 59 bits.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function newRecoveryCode(): string {
  let out = '';
  for (let i = 0; i < 12; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
}

/** Upper-cases, drops spaces and dashes, and reads look-alike letters as the digits they stand for. */
export function normaliseRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}

/** Gives the student a new recovery code (shown once) and retires any earlier one. */
export async function issueRecoveryCode(rollNo: string): Promise<string> {
  const code = newRecoveryCode();
  const hash = await hashSecret(normaliseRecoveryCode(code));
  await query('UPDATE students SET recovery_hash = $2, updated_at = now() WHERE roll_no = $1 AND active', [rollNo, hash]);
  return code;
}

export async function hasRecoveryCode(rollNo: string): Promise<boolean> {
  const row = await queryOne<{ has: boolean }>('SELECT recovery_hash IS NOT NULL AS has FROM students WHERE roll_no = $1', [rollNo]);
  return Boolean(row?.has);
}

/** Sets a new PIN and signs the student out on every other device (session_version bump). */
export async function setStudentPin(rollNo: string, pin: string): Promise<StudentRow> {
  const hash = await hashSecret(pin);
  const row = await queryOne<StudentRow>(
    `UPDATE students SET pin_hash = $2, session_version = session_version + 1, last_seen_at = now(), updated_at = now()
     WHERE roll_no = $1 AND active AND pin_hash IS NOT NULL RETURNING *`,
    [rollNo, hash],
  );
  if (!row) throw new HttpError(409, 'This roll number isn’t registered yet. Register it first.', 'not_claimed');
  return row;
}

/** True when the code matches the student's current recovery code. */
export async function checkRecoveryCode(rollNo: string, codeInput: string): Promise<boolean> {
  const row = await queryOne<{ recovery_hash: string | null }>('SELECT recovery_hash FROM students WHERE roll_no = $1 AND active', [rollNo]);
  if (!row?.recovery_hash) return false;
  return verifySecret(normaliseRecoveryCode(codeInput), row.recovery_hash);
}

/* ---------------------------------------------------------------- admin */

export interface RosterEntry {
  rollNo: string;
  name: string;
  active: boolean;
  source: string;
  registered: boolean;
  claimedAt: string | null;
  lastSeenAt: string | null;
}

export async function listRoster(): Promise<RosterEntry[]> {
  const rows = await query<StudentRow>('SELECT * FROM students ORDER BY roll_no');
  return rows.map((r) => ({
    rollNo: r.roll_no,
    name: r.name,
    active: r.active,
    source: r.source,
    registered: Boolean(r.pin_hash),
    claimedAt: r.claimed_at ? new Date(r.claimed_at).toISOString() : null,
    lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at).toISOString() : null,
  }));
}

export async function addStudent(rollInput: string, nameInput: string) {
  const roll = normaliseRoll(rollInput);
  if (!isValidRoll(roll)) throw new HttpError(422, 'Roll numbers look like 26PGDM123.', 'invalid_roll');
  const name = cleanName(nameInput);
  if (!name) throw new HttpError(422, 'Enter the student’s name.', 'invalid_name');
  await query(
    `INSERT INTO students (roll_no, name, source) VALUES ($1, $2, 'manual')
     ON CONFLICT (roll_no) DO UPDATE SET name = EXCLUDED.name, source = 'manual', active = TRUE, updated_at = now()`,
    [roll, name],
  );
  return roll;
}

/** Clears the PIN and signs the student out on every device (session_version bump); their calendar link stops working. */
export async function resetStudent(roll: string) {
  await removeAllSubscriptions(roll);
  await query(
    `UPDATE students SET pin_hash = NULL, claimed_at = NULL, session_version = session_version + 1,
       calendar_version = calendar_version + 1, calendar_token_hash = NULL, recovery_hash = NULL, updated_at = now() WHERE roll_no = $1`,
    [roll],
  );
}

export async function setStudentActive(roll: string, active: boolean) {
  if (!active) await removeAllSubscriptions(roll);
  await query(`UPDATE students SET active = $2, session_version = session_version + 1, updated_at = now() WHERE roll_no = $1`, [roll, active]);
}

export async function deleteStudent(roll: string) {
  await removeAllSubscriptions(roll);
  await query('DELETE FROM homework_done WHERE roll_no = $1', [roll]);
  await query('DELETE FROM attendance WHERE roll_no = $1', [roll]);
  await query('DELETE FROM group_members WHERE roll_no = $1', [roll]);
  // quiz_attempts has no foreign key to students, so remove them here (no nameless rows in results).
  await query('DELETE FROM quiz_attempts WHERE roll_no = $1', [roll]);
  await query('DELETE FROM students WHERE roll_no = $1', [roll]);
}
