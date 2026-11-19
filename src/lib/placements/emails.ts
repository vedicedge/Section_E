import 'server-only';
import { query, transaction } from '../db';
import { matchEmailLines, planEmailSave } from './email-match';

export { matchEmailLines, planEmailSave };

export async function saveStudentEmails(
  text: string,
): Promise<{ saved: number; unmatched: string[]; duplicates: string[]; conflicts: { email: string; rollNos: string[] }[] }> {
  const roster = await query<{ rollNo: string; name: string }>('SELECT roll_no AS "rollNo", name FROM students');
  const { matched, unmatched } = matchEmailLines(text, roster);
  const { updates, duplicates, conflicts } = planEmailSave(matched);
  await transaction(async (tx) => {
    for (const u of updates) {
      await tx.query('UPDATE students SET email = $2, updated_at = now() WHERE roll_no = $1', [u.rollNo, u.email]);
    }
  });
  return { saved: updates.length, unmatched, duplicates, conflicts };
}
