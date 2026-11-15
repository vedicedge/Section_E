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
  clearOfflineCopies();
}

/**
 * Browser-side: delete the pages saved for offline use (they show one student's seat, homework
 * and leaves). Runs on sign-out and when someone signs in, so a shared phone never shows the
 * previous student's pages offline.
 */
export function clearOfflineCopies() {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'clear-offline' });
    // Also from the page itself, in case no worker controls it yet.
    if (typeof caches !== 'undefined') caches.delete('se-pages-v1').catch(() => false);
  } catch {
    /* best effort */
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
