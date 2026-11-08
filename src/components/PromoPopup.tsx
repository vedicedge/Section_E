'use client';

import { useEffect, useState } from 'react';

interface Promo {
  id: string;
  title: string;
  link: string | null;
}

const KEY = 'se.promos.seen';

/** Shows the newest current event poster once per visit; the visitor can close it and carry on. */
export function PromoPopup({ promotions }: { promotions: Promo[] }) {
  const [promo, setPromo] = useState<Promo | null>(null);

  useEffect(() => {
    let seen: string[] = [];
    try {
      seen = JSON.parse(sessionStorage.getItem(KEY) ?? '[]');
    } catch {}
    setPromo(promotions.find((p) => !seen.includes(p.id)) ?? null);
  }, [promotions]);

  useEffect(() => {
    if (!promo) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function close() {
    if (!promo) return;
    try {
      const seen: string[] = JSON.parse(sessionStorage.getItem(KEY) ?? '[]');
      sessionStorage.setItem(KEY, JSON.stringify([...seen, promo.id]));
    } catch {}
    setPromo(null);
  }

  if (!promo) return null;
  // eslint-disable-next-line @next/next/no-img-element
  const img = <img src={`/api/promotions/${promo.id}`} alt={promo.title} style={{ display: 'block', maxWidth: '100%', maxHeight: '75vh', borderRadius: 12 }} />;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={promo.title}
      onClick={close}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgb(0 0 0 / 0.7)', display: 'grid', placeItems: 'center', padding: 16 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', maxWidth: 520, width: '100%', display: 'grid', justifyItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          autoFocus
          style={{ position: 'absolute', top: -14, right: -6, width: 44, height: 44, borderRadius: 999, border: 0, background: '#fff', color: '#000', fontSize: 22, cursor: 'pointer' }}
        >
          ×
        </button>
        {promo.link ? (
          <a href={promo.link} target="_blank" rel="noopener noreferrer" onClick={close}>
            {img}
          </a>
        ) : (
          img
        )}
      </div>
    </div>
  );
}
