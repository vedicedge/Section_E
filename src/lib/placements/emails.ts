import 'server-only';
import { query } from '../db';
import { matchEmailLines } from './email-match';

export { matchEmailLines };

export async function saveStudentEmails(text: string): Promise<{ saved: number; unmatched: string[] }> {
  const roster = await query<{ rollNo: string; name: string }>('SELECT roll_no AS "rollNo", name FROM students');
  const { matched, unmatched } = matchEmailLines(text, roster);
  for (const m of matched) {
    await query('UPDATE students SET email = $2, updated_at = now() WHERE roll_no = $1', [m.rollNo, m.email]);
  }
  return { saved: matched.length, unmatched };
}
