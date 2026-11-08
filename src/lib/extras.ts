import 'server-only';
import { query, queryOne } from './db';
import { newId } from './crypto';
import { todayISO } from './time';

/** Event posters (shown as a pop-up between two dates) and mock tests hosted as Claude artifacts. */

export interface Promotion {
  id: string;
  title: string;
  link: string | null;
  startsOn: string;
  endsOn: string;
}

const PROMO_COLS = 'id, title, link, starts_on::text AS starts_on, ends_on::text AS ends_on';
type PromoRow = { id: string; title: string; link: string | null; starts_on: string; ends_on: string };
const toPromo = (r: PromoRow): Promotion => ({ id: r.id, title: r.title, link: r.link, startsOn: r.starts_on, endsOn: r.ends_on });

export async function listPromotions(): Promise<Promotion[]> {
  return (await query<PromoRow>(`SELECT ${PROMO_COLS} FROM promotions ORDER BY starts_on DESC, created_at DESC`)).map(toPromo);
}

export async function activePromotions(today = todayISO()): Promise<Promotion[]> {
  try {
    const rows = await query<PromoRow>(`SELECT ${PROMO_COLS} FROM promotions WHERE starts_on <= $1 AND ends_on >= $1 ORDER BY created_at DESC`, [today]);
    return rows.map(toPromo);
  } catch {
    return []; // never let a poster break a page
  }
}

export async function addPromotion(p: Omit<Promotion, 'id'> & { mime: string; image: Uint8Array }) {
  await query('INSERT INTO promotions (id, title, link, starts_on, ends_on, mime, image) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
    newId(),
    p.title,
    p.link,
    p.startsOn,
    p.endsOn,
    p.mime,
    Buffer.from(p.image),
  ]);
}

export async function deletePromotion(id: string) {
  await query('DELETE FROM promotions WHERE id = $1', [id]);
}

export async function promotionImage(id: string): Promise<{ mime: string; image: Uint8Array } | null> {
  const row = await queryOne<{ mime: string; image: Uint8Array }>('SELECT mime, image FROM promotions WHERE id = $1', [id]);
  return row ? { mime: row.mime, image: new Uint8Array(row.image) } : null;
}

export interface MockLink {
  id: string;
  title: string;
  url: string;
}

export async function listMockLinks(): Promise<MockLink[]> {
  try {
    return await query<MockLink>('SELECT id, title, url FROM mock_links ORDER BY created_at DESC');
  } catch {
    return [];
  }
}

export async function addMockLink(title: string, url: string) {
  await query('INSERT INTO mock_links (id, title, url) VALUES ($1, $2, $3)', [newId(), title, url]);
}

export async function deleteMockLink(id: string) {
  await query('DELETE FROM mock_links WHERE id = $1', [id]);
}
