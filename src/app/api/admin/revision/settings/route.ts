import { ok, readJson, requireAdmin, route } from '@/lib/http';
import { revisionSettingsSchema } from '@/lib/revision/model';
import { saveRevisionSettings } from '@/lib/revision/repo';

/** When revision mode is visible to students: on a date (auto), now (on) or not at all (off). */
export const POST = route(async (req) => {
  await requireAdmin();
  await saveRevisionSettings(await readJson(req, revisionSettingsSchema));
  return ok({ saved: true });
});
