import { clientIp, ok, route } from '@/lib/http';
import { enforce } from '@/lib/rate-limit';
import { getTimetable } from '@/lib/timetable/service';

/** Re-download the official timetable now (rate-limited; concurrent requests share one download). */
export const POST = route(async (req) => {
  await enforce(`tt-refresh:${clientIp(req)}`, 4, 60, 'The timetable was just refreshed.');
  const state = await getTimetable({ force: true });
  return ok({
    status: state.status,
    checkedAt: 'checkedAt' in state ? state.checkedAt : null,
    error: 'error' in state ? (state.error ?? null) : null,
  });
});
