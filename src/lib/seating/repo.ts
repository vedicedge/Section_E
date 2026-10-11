import 'server-only';
import { json, query, transaction } from '../db';
import { newId } from '../crypto';
import { todayISO } from '../time';
import type { ParsedSeatingWorkbook } from './parse';

/** Room shape without any identities — safe to send to every student. */
export interface LayoutRow {
  label: string;
  number: number | null;
  seats: { n: number; vacant: boolean }[];
}

export interface PlanRecord {
  id: string;
  code: string;
  title: string;
  kind: 'class' | 'exam';
  room: string | null;
  aliases: string[];
  validFrom: string | null;
  validTo: string | null;
  layout: LayoutRow[];
  notes: string | null;
  sourceName: string | null;
  position: number;
  active: boolean;
  assigned: number;
  updatedAt: string;
}

export interface MySeat {
  plan: Omit<PlanRecord, 'assigned' | 'sourceName' | 'active' | 'position' | 'updatedAt'>;
  status: 'current' | 'upcoming' | 'expired';
  seat: {
    rowLabel: string;
    rowNumber: number | null;
    rowIndex: number; // index into plan.layout
    seatNumber: number;
    position: number;
    note: string | null;
  } | null;
}

interface PlanRow {
  id: string;
  code: string;
  title: string;
  kind: 'class' | 'exam';
  room: string | null;
  aliases: string[];
  valid_from: string | null;
  valid_to: string | null;
  layout: LayoutRow[];
  notes: string | null;
  source_name: string | null;
  position: number;
  active: boolean;
  updated_at: Date;
  assigned?: number;
}

function toPlan(row: PlanRow): PlanRecord {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    kind: row.kind,
    room: row.room,
    aliases: row.aliases ?? [],
    validFrom: row.valid_from,
    validTo: row.valid_to,
    layout: row.layout,
    notes: row.notes,
    sourceName: row.source_name,
    position: Number(row.position),
    active: row.active,
    assigned: Number(row.assigned ?? 0),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function planStatus(plan: { validFrom: string | null; validTo: string | null }, today = todayISO()): MySeat['status'] {
  if (plan.validFrom && plan.validFrom > today) return 'upcoming';
  if (plan.validTo && plan.validTo < today) return 'expired';
  return 'current';
}

export async function listPlans(): Promise<PlanRecord[]> {
  const rows = await query<PlanRow>(
    `SELECT p.*, (SELECT count(*)::int FROM seat_assignments a WHERE a.plan_id = p.id) AS assigned
     FROM seating_plans p ORDER BY p.kind, p.valid_from NULLS FIRST, p.position, p.code`,
  );
  return rows.map(toPlan);
}

export async function activePlanSummaries() {
  const rows = await query<PlanRow>(`SELECT * FROM seating_plans WHERE active ORDER BY kind, position, code`);
  return rows.map(toPlan);
}

export async function seatsForStudent(rollNo: string): Promise<MySeat[]> {
  const rows = await query<
    PlanRow & {
      row_label: string | null;
      row_number: number | null;
      row_index: number | null;
      seat_number: number | null;
      seat_position: number | null;
      note: string | null;
    }
  >(
    `SELECT p.*, a.row_label, a.row_number, a.row_index, a.seat_number, a.position AS seat_position, a.note
     FROM seating_plans p
     LEFT JOIN seat_assignments a ON a.plan_id = p.id AND a.roll_no = $1
     WHERE p.active
     ORDER BY p.kind, p.valid_from NULLS FIRST, p.position, p.code`,
    [rollNo],
  );
  const today = todayISO();
  return rows.map((row) => {
    const plan = toPlan(row);
    return {
      plan: {
        id: plan.id,
        code: plan.code,
        title: plan.title,
        kind: plan.kind,
        room: plan.room,
        aliases: plan.aliases,
        validFrom: plan.validFrom,
        validTo: plan.validTo,
        layout: plan.layout,
        notes: plan.notes,
      },
      status: planStatus(plan, today),
      seat:
        row.seat_number === null || row.row_index === null
          ? null
          : {
              rowLabel: row.row_label ?? '',
              rowNumber: row.row_number === null ? null : Number(row.row_number),
              rowIndex: Number(row.row_index),
              seatNumber: Number(row.seat_number),
              position: Number(row.seat_position),
              note: row.note,
            },
    };
  });
}

export interface ImportOptions {
  mode: 'replace' | 'add';
  kind: 'class' | 'exam';
  validFrom: string | null;
  validTo: string | null;
  room: string | null;
  sourceName: string;
  /** Only import these sheet names (default: all). */
  sheets?: string[];
}

export async function importSeating(parsed: ParsedSeatingWorkbook, opts: ImportOptions) {
  const batchId = newId();
  const plans = opts.sheets?.length ? parsed.plans.filter((p) => opts.sheets!.includes(p.sheetName)) : parsed.plans;
  if (!plans.length) throw new Error('No seating plans selected for import.');

  return transaction(async (tx) => {
    let removed = 0;
    if (opts.mode === 'replace') {
      const res = await tx.query<{ id: string }>('DELETE FROM seating_plans RETURNING id');
      removed = res.rows.length;
    }

    // Roster: add new students, refresh names that came from earlier seating imports.
    const rosterRolls = new Set(plans.flatMap((p) => p.rows.flatMap((r) => r.seats.map((s) => s.rollNo).filter(Boolean)))) as Set<string>;
    let addedStudents = 0;
    for (const student of parsed.students) {
      if (!rosterRolls.has(student.rollNo)) continue;
      const res = await tx.query<{ inserted: boolean }>(
        `INSERT INTO students (roll_no, name, source) VALUES ($1, $2, 'seating')
         ON CONFLICT (roll_no) DO UPDATE SET
           name = CASE WHEN students.source = 'seating' THEN EXCLUDED.name ELSE students.name END,
           updated_at = now()
         RETURNING (xmax = 0) AS inserted`,
        [student.rollNo, student.name],
      );
      if (res.rows[0]?.inserted) addedStudents++;
    }

    let position = 0;
    for (const plan of plans) {
      const id = newId();
      const layout: LayoutRow[] = plan.rows.map((row) => ({
        label: row.label,
        number: row.number,
        seats: row.seats.map((s) => ({ n: s.seatNumber, vacant: !s.rollNo })),
      }));
      await tx.query(
        `INSERT INTO seating_plans (id, code, title, kind, room, valid_from, valid_to, layout, source_name, batch_id, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)`,
        [id, plan.code, plan.title, opts.kind, opts.room, opts.validFrom, opts.validTo, json(layout), `${opts.sourceName} › ${plan.sheetName}`, batchId, position++],
      );
      for (const [rowIndex, row] of plan.rows.entries()) {
        for (const seat of row.seats) {
          if (!seat.rollNo) continue;
          const conflict = plan.conflicts[seat.rollNo];
          await tx.query(
            `INSERT INTO seat_assignments (plan_id, roll_no, row_label, row_number, row_index, seat_number, position, note)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              id,
              seat.rollNo,
              row.label,
              row.number,
              rowIndex,
              seat.seatNumber,
              seat.position,
              conflict ? `The official sheet also lists your roll number at ${conflict}. Please confirm with your class representative.` : null,
            ],
          );
        }
      }
    }
    return { batchId, imported: plans.length, removed, addedStudents };
  });
}

export interface PlanPatch {
  code?: string;
  title?: string;
  kind?: 'class' | 'exam';
  room?: string | null;
  aliases?: string[];
  validFrom?: string | null;
  validTo?: string | null;
  notes?: string | null;
  active?: boolean;
}

export async function updatePlan(id: string, patch: PlanPatch) {
  const fields: string[] = [];
  const values: unknown[] = [];
  const set = (col: string, value: unknown, cast = '') => {
    values.push(value);
    fields.push(`${col} = $${values.length}${cast}`);
  };
  if (patch.code !== undefined) set('code', patch.code);
  if (patch.title !== undefined) set('title', patch.title);
  if (patch.kind !== undefined) set('kind', patch.kind);
  if (patch.room !== undefined) set('room', patch.room);
  if (patch.aliases !== undefined) set('aliases', json(patch.aliases), '::jsonb');
  if (patch.validFrom !== undefined) set('valid_from', patch.validFrom);
  if (patch.validTo !== undefined) set('valid_to', patch.validTo);
  if (patch.notes !== undefined) set('notes', patch.notes);
  if (patch.active !== undefined) set('active', patch.active);
  if (!fields.length) return;
  values.push(id);
  await query(`UPDATE seating_plans SET ${fields.join(', ')}, updated_at = now() WHERE id = $${values.length}`, values);
}

export async function deletePlan(id: string) {
  await query('DELETE FROM seating_plans WHERE id = $1', [id]);
}
