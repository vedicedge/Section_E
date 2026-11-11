import 'server-only';
import { query } from './db';
import { newId } from './crypto';

/** Study material: links to notes (Drive, Docs, PDFs) and videos, grouped by subject. */

export interface StudyMaterial {
  id: string;
  /** Subject code such as "TOD"; null for general material. */
  subject: string | null;
  title: string;
  url: string;
  addedAt: string;
}

type Row = { id: string; subject: string | null; title: string; url: string; created_at: Date };

export async function listStudyMaterials(): Promise<StudyMaterial[]> {
  const rows = await query<Row>('SELECT id, subject, title, url, created_at FROM study_materials ORDER BY created_at DESC');
  return rows.map((r) => ({ id: r.id, subject: r.subject, title: r.title, url: r.url, addedAt: new Date(r.created_at).toISOString() }));
}

export async function countStudyMaterials(): Promise<number> {
  try {
    const [row] = await query<{ n: number }>('SELECT count(*)::int AS n FROM study_materials');
    return Number(row?.n ?? 0);
  } catch {
    return 0; // a count is not worth failing the landing page over
  }
}

export async function addStudyMaterial(input: { subject: string | null; title: string; url: string }) {
  await query('INSERT INTO study_materials (id, subject, title, url) VALUES ($1, $2, $3, $4)', [newId(), input.subject, input.title, input.url]);
}

export async function deleteStudyMaterial(id: string) {
  await query('DELETE FROM study_materials WHERE id = $1', [id]);
}
