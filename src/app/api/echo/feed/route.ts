import { HttpError, clientIp, ok, route } from '@/lib/http';
import { enforce } from '@/lib/rate-limit';
import { sha256 } from '@/lib/crypto';
import { buildEchoFeed, markPulled, verifyEchoKey } from '@/lib/echo-feed';

export const dynamic = 'force-dynamic';

/**
 * Echo's nightly knowledge feed (class-wide facts only; see lib/echo-feed). Read by the owner's sync
 * task with `Authorization: Bearer <key>`; the key is made in Admin → Posters, links & study.
 */
export const GET = route(async (req) => {
  await enforce(`echo-feed-ip:${clientIp(req)}`, 30, 15 * 60, 'Too many feed requests.');
  const key = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null;
  if (!(await verifyEchoKey(key))) {
    throw new HttpError(401, 'Unknown Echo feed key. Make a new one in Admin → Posters, links & study.', 'unauthorized');
  }
  await enforce(`echo-feed:${sha256(key!).slice(0, 12)}`, 60, 3600, 'The Echo feed is being read too often.');
  const feed = await buildEchoFeed();
  await markPulled();
  return ok(feed, { headers: { 'Cache-Control': 'no-store' } });
});
