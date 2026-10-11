import { z } from 'zod';
import { ok, readJson, requireAdmin, route } from '@/lib/http';
import { deletePlan, updatePlan } from '@/lib/seating/repo';

const date = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]);
const patch = z.object({
  code: z.string().trim().min(1).max(20).optional(),
  title: z.string().trim().min(1).max(120).optional(),
  kind: z.enum(['class', 'exam']).optional(),
  room: z.string().trim().max(80).nullable().optional(),
  aliases: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  validFrom: date.optional(),
  validTo: date.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  active: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  await requireAdmin();
  const body = await readJson(req, patch);
  await updatePlan((await params).id, {
    ...body,
    room: body.room === '' ? null : body.room,
    notes: body.notes === '' ? null : body.notes,
  });
  return ok({ ok: true });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  await requireAdmin();
  await deletePlan((await params).id);
  return ok({ ok: true });
});
