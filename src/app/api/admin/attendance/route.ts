import { z } from 'zod';
import { ok, readJson, requireAdmin, route } from '@/lib/http';
import { MAX_SESSIONS } from '@/lib/attendance/calc';
import { getAttendanceSettings, saveAttendanceConfig } from '@/lib/attendance/repo';

const body = z.object({
  baseUpdatedAt: z.string().nullable(),
  enabled: z.boolean(),
  minPercent: z.number().min(50).max(100),
  termLabel: z.string().trim().max(40),
  subjects: z
    .array(
      z.object({
        id: z.string().max(40).nullable().optional(),
        code: z.string().trim().min(1, 'Every subject needs a code.').max(20),
        title: z.string().trim().max(120),
        total: z.number().int().min(1).max(MAX_SESSIONS),
        aliases: z.array(z.string().trim().min(1).max(20)).max(6),
      }),
    )
    .max(30),
});

/** Sets the attendance rule, the switch, and the subjects with their session counts. */
export const PUT = route(async (req) => {
  await requireAdmin();
  const { baseUpdatedAt, ...input } = await readJson(req, body);
  await saveAttendanceConfig(input, baseUpdatedAt);
  return ok(await getAttendanceSettings());
});
