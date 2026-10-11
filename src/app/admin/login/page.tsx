import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { isAdmin, isAdminConfigured } from '@/lib/session';
import { Logo } from '@/components/Logo';
import { Crown } from '@/components/Engravings';
import { LoginForm } from './LoginForm';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Admin sign-in' };
export const dynamic = 'force-dynamic';

export default async function AdminLogin() {
  if (await isAdmin()) redirect('/admin');
  const configured = isAdminConfigured();
  return (
    <main id="main" className={styles.loginWrap}>
      <div className={styles.loginCard}>
        <Logo />
        <Crown className={styles.loginArt} />
        <h1 className={styles.loginTitle}>Admin</h1>
        {configured ? (
          <LoginForm />
        ) : (
          <p className="notice">
            Admin access isn’t configured yet. Set <code>ADMIN_PASSWORD_HASH</code> (recommended — generate it with{' '}
            <code>npm run hash-password</code>) or <code>ADMIN_PASSWORD</code> in the server environment, then redeploy.
          </p>
        )}
      </div>
    </main>
  );
}
