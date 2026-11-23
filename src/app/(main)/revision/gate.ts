import 'server-only';
import { notFound } from 'next/navigation';
import { isAdmin } from '@/lib/session';
import { revisionOpenNow } from '@/lib/revision/repo';

/**
 * Revision mode is invisible to students until it opens (a plain 404). The admin can always open it,
 * to try it out before launch; `preview` is true while students still can't see it.
 */
export async function revisionGate(): Promise<{ preview: boolean }> {
  const [open, admin] = await Promise.all([revisionOpenNow(), isAdmin()]);
  if (!open && !admin) notFound();
  return { preview: !open };
}
