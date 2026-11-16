import { ok, requireAdmin, route, siteOrigin } from '@/lib/http';
import { echoFeedStatus, rotateEchoKey } from '@/lib/echo-feed';

export const dynamic = 'force-dynamic';

/** Makes a new Echo feed key (the previous one stops working). The key is shown only in this response. */
export const POST = route(async (req) => {
  await requireAdmin();
  const key = await rotateEchoKey();
  return ok({ key, endpoint: `${siteOrigin(req)}/api/echo/feed`, status: await echoFeedStatus() });
});
