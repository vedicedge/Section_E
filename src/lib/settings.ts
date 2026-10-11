import 'server-only';
import { json, query, queryOne } from './db';

export async function getSetting<T>(key: string): Promise<T | null> {
  const row = await queryOne<{ value: T }>('SELECT value FROM app_settings WHERE key = $1', [key]);
  return row?.value ?? null;
}

export async function setSetting<T>(key: string, value: T) {
  await query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, json(value)],
  );
}

export async function deleteSetting(key: string) {
  await query('DELETE FROM app_settings WHERE key = $1', [key]);
}
