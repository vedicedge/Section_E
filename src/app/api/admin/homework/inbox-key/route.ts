import { z } from 'zod';
import { ok, readJson, requireAdmin, route, siteOrigin } from '@/lib/http';
import { inboxStatus, rotateInboxKey } from '@/lib/homework/inbox';
import { inboxScript } from '@/lib/homework/inbox-script';

export const dynamic = 'force-dynamic';

const body = z.object({
  sectionList: z.email('Enter the section’s mailing-list address, e.g. pgdm2026sec-e@imi.edu.').max(320),
  facultyDomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'Enter the college email domain, e.g. imi.edu.')
    .max(253),
});

/**
 * Issues a new inbox key (the previous one stops working) and returns the Apps Script with it
 * baked in. The key is shown only in this response; we keep just its hash.
 */
export const POST = route(async (req) => {
  await requireAdmin();
  const { sectionList, facultyDomain } = await readJson(req, body);
  const key = await rotateInboxKey();
  const endpoint = `${siteOrigin(req)}/api/homework/inbox`;
  return ok({
    endpoint,
    script: inboxScript({ endpoint, inboxKey: key, sectionList: sectionList.toLowerCase(), facultyDomain }),
    status: await inboxStatus(),
  });
});
