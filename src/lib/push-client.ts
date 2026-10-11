/**
 * Browser-side: forget this device's reminder subscription before signing out, so the next person
 * on a shared phone doesn't receive the previous student's homework reminders.
 */
export async function forgetThisDevice(): Promise<void> {
  try {
    localStorage.removeItem('se.reminders.owner');
  } catch {
    /* storage unavailable */
  }
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
