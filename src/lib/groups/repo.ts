import 'server-only';
import { query, queryOne, transaction } from '../db';
import { newId } from '../crypto';
import { HttpError } from '../http';
import type { ParsedGroup } from './parse';

/** Subject groups: the admin uploads a list per subject; each student sees only their own group. */

export interface GroupSetSummary {
  id: string;
  subject: string;
  title: string;
  groups: number;
  students: number;
  updatedAt: string;
}

export interface MyGroup {
  setId: string;
  subject: string;
  title: string;
  group: string;
  topic: string | null;
  members: { rollNo: string; name: string; me: boolean }[];
}

export async function listGroupSets(): Promise<GroupSetSummary[]> {
  const rows = await query<{ id: string; subject: string; title: string; groups: number; students: number; updated_at: Date }>(
    `SELECT s.id, s.subject, s.title, s.updated_at,
            count(DISTINCT m.group_name)::int AS groups, count(m.roll_no)::int AS students
       FROM group_sets s LEFT JOIN group_members m ON m.set_id = s.id
      GROUP BY s.id ORDER BY s.subject, s.title`,
  );
  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    title: r.title,
    groups: Number(r.groups),
    students: Number(r.students),
    updatedAt: new Date(r.updated_at).toISOString(),
  }));
}

/** A list is identified by subject and title, ignoring case ("cf" + "groups" is CF · Groups). */
const SET_BY_NAME = 'SELECT id FROM group_sets WHERE lower(subject) = lower($1) AND lower(title) = lower($2)';

function findSetId(subject: string, title: string): Promise<string | null> {
  return queryOne<{ id: string }>(SET_BY_NAME, [subject, title]).then((row) => row?.id ?? null);
}

/** Which roll numbers are on the active roster, with names (for the preview and for saving). */
export async function rosterNames(rolls: string[]): Promise<Map<string, string>> {
  if (!rolls.length) return new Map();
  const rows = await query<{ roll_no: string; name: string }>('SELECT roll_no, name FROM students WHERE active AND roll_no = ANY($1)', [rolls]);
  return new Map(rows.map((r) => [r.roll_no, r.name]));
}

/**
 * Saves the groups for a subject. Uploading again with the same subject and title replaces that list,
 * so a corrected sheet simply goes up again. Roll numbers not on the roster are left out.
 */
export async function saveGroupSet(input: { subject: string; title: string; groups: ParsedGroup[] }) {
  const all = input.groups.flatMap((g) => g.rolls);
  const known = await rosterNames(all);
  const keep = input.groups.map((g) => ({ ...g, rolls: g.rolls.filter((r) => known.has(r)) })).filter((g) => g.rolls.length);
  if (!keep.length) throw new HttpError(422, 'None of these roll numbers are on the Section E roster, so there is nothing to save.', 'empty');

  const members = keep.flatMap((g) => g.rolls.map((roll) => ({ roll, group: g.name, topic: g.topic })));
  // One transaction: a failed re-upload leaves the old list in place instead of an empty one, and
  // nobody opening My groups mid-upload sees a half-written list.
  const { id, existing } = await transaction(async (tx) => {
    const found = await tx.query<{ id: string }>(`${SET_BY_NAME} FOR UPDATE`, [input.subject, input.title]);
    const existing = found.rows[0];
    const id = existing?.id ?? newId();
    if (existing) {
      await tx.query('UPDATE group_sets SET subject = $2, title = $3, updated_at = now() WHERE id = $1', [id, input.subject, input.title]);
      await tx.query('DELETE FROM group_members WHERE set_id = $1', [id]);
    } else {
      await tx.query('INSERT INTO group_sets (id, subject, title) VALUES ($1, $2, $3)', [id, input.subject, input.title]);
    }
    await tx.query(
      `INSERT INTO group_members (set_id, roll_no, group_name, topic)
       SELECT $1, m.roll, m.grp, m.topic FROM unnest($2::text[], $3::text[], $4::text[]) AS m(roll, grp, topic)
       ON CONFLICT DO NOTHING`,
      [id, members.map((m) => m.roll), members.map((m) => m.group), members.map((m) => m.topic)],
    );
    return { id, existing };
  });
  return { id, replaced: Boolean(existing), groups: keep.length, students: keep.reduce((n, g) => n + g.rolls.length, 0) };
}

/** The group names of a list already up, or null when there is no list with this subject and title. */
export async function existingGroupNames(subject: string, title: string): Promise<string[] | null> {
  const setId = await findSetId(subject, title);
  if (!setId) return null;
  const rows = await query<{ group_name: string }>('SELECT DISTINCT group_name FROM group_members WHERE set_id = $1', [setId]);
  return rows.map((r) => r.group_name);
}

/**
 * Topics on their own (Group | Topic, no roll numbers): sets the topic of each matching group in the
 * list that is already up. Groups not mentioned keep their topic.
 */
export async function setGroupTopics(subject: string, title: string, topics: { name: string; topic: string }[]) {
  const setId = await findSetId(subject, title);
  if (!setId) throw new HttpError(404, `There is no “${subject} · ${title}” list yet. Upload the groups with roll numbers first.`, 'no_set');
  let matched = 0;
  for (const t of topics) {
    const rows = await query<{ roll_no: string }>(
      'UPDATE group_members SET topic = $3 WHERE set_id = $1 AND lower(group_name) = lower($2) RETURNING roll_no',
      [setId, t.name, t.topic],
    );
    if (rows.length) matched++;
  }
  await query('UPDATE group_sets SET updated_at = now() WHERE id = $1', [setId]);
  return { matched };
}

export async function deleteGroupSet(id: string) {
  await query('DELETE FROM group_sets WHERE id = $1', [id]);
}

/** The signed-in student's groups, one per subject list they appear in, with their group-mates. */
export async function myGroups(rollNo: string): Promise<MyGroup[]> {
  const rows = await query<{ set_id: string; subject: string; title: string; group_name: string; topic: string | null; roll_no: string; name: string | null }>(
    `SELECT s.id AS set_id, s.subject, s.title, mine.group_name, mine.topic, m.roll_no, st.name
       FROM group_members mine
       JOIN group_sets s ON s.id = mine.set_id
       JOIN group_members m ON m.set_id = mine.set_id AND m.group_name = mine.group_name
       LEFT JOIN students st ON st.roll_no = m.roll_no
      WHERE mine.roll_no = $1
      ORDER BY s.subject, s.title, m.roll_no`,
    [rollNo],
  );
  const out = new Map<string, MyGroup>();
  for (const r of rows) {
    let g = out.get(r.set_id);
    if (!g) {
      g = { setId: r.set_id, subject: r.subject, title: r.title, group: r.group_name, topic: r.topic, members: [] };
      out.set(r.set_id, g);
    }
    g.members.push({ rollNo: r.roll_no, name: r.name ?? r.roll_no, me: r.roll_no === rollNo });
  }
  return [...out.values()];
}
