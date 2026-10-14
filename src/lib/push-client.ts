/**
 * Browser-side: drop the remembered "reminders are on for this student" note, so the reminder
 * switch re-checks with the server (after signing in, the server may have forgotten this device).
 */
export function forgetReminderOwner() {
  try {
    localStorage.removeItem('se.reminders.owner');
  } catch {
    /* storage unavailable */
  }
}

/**
 * Browser-side: forget this device's reminder subscription before signing out, so the next person
 * on a shared phone doesn't receive the previous student's homework reminders.
 */
export async function forgetThisDevice(): Promise<void> {
  forgetReminderOwner();
  try {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker) return;
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = await registration?.pushManager?.getSubscription();
    if (!subscription) return;
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => undefined);
    await subscription.unsubscribe().catch(() => false);
  } catch {
    /* best effort — never block signing out */
  }
}
