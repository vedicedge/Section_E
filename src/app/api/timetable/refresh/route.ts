import { clientIp, ok, route } from '@/lib/http';
import { enforce } from '@/lib/rate-limit';
import { getTimetable, getTimetableConfig } from '@/lib/timetable/service';

/**
 * Re-download the official timetable now (link mode; rate-limited, concurrent requests share one
 * download). Relay and upload copies are pushed to us, so there is nothing to pull: we return the
 * current state.
 */
export const POST = route(async (req) => {
  await enforce(`tt-refresh:${clientIp(req)}`, 4, 60, 'The timetable was just refreshed.');
  const { mode } = await getTimetableConfig();
  const state = await getTimetable({ force: mode === 'link' });
  return ok({
    status: state.status,
    mode: 'mode' in state ? state.mode : mode,
    checkedAt: 'checkedAt' in state ? state.checkedAt : null,
    error: 'error' in state ? (state.error ?? null) : null,
  });
});
