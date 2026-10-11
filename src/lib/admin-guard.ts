import 'server-only';
import { redirect } from 'next/navigation';
import { isAdmin } from './session';

/**
 * Per-page admin check. Layouts don't re-render on client-side navigation, so every admin page
 * verifies the session itself before loading any data.
 */
export async function requireAdminPage() {
  if (!(await isAdmin())) redirect('/admin/login');
}
