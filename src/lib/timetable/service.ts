import 'server-only';
import { env } from '../env';
import { sha256 } from '../crypto';
import { getSetting, setSetting } from '../settings';
import { readWorkbook } from '../xlsx';
import { describeSource, downloadSource, parseSourceUrl, SourceError } from './source';
import { parseTimetable, PARSER_VERSION, type ParsedTimetable, type Session } from './parse';

/**
 * Live timetable with a short shared cache (Postgres), so every visitor sees the same fresh copy
 * while the source is downloaded at most once per TTL. If the source is unreachable the last good
 * copy is served and clearly marked as stale.
 */

export interface TimetableConfig {
  url: string | null;
  section: string;
}

export interface Change {
  key: string;
  date: string | null;
  day: string | null;
  start: string | null;
  before: string | null;
  after: string | null;
  detectedAt: string;
}

interface CacheRecord {
  sourceUrl: string;
  hash: string;
  parserVersion: number;
  fileName: string | null;
  via: string;
  checkedAt: string; // last successful download
  contentChangedAt: string; // when the content hash last changed
  sourceModifiedAt: string | null; // as reported by the source (Drive API / Last-Modified)
  data: ParsedTimetable;
  changes: Change[];
  lastError: { code: string; message: string; at: string } | null;
}

export type TimetableState =
  | { status: 'unconfigured' }
  | { status: 'error'; error: { code: string; message: string }; source: string }
  | {
      status: 'ok' | 'stale';
      source: string;
      fileName: string | null;
      via: string;
      checkedAt: string;
      contentChangedAt: string;
      sourceModifiedAt: string | null;
      data: ParsedTimetable;
      changes: Change[];
      error?: { code: string; message: string };
    };

const CONFIG_KEY = 'timetable.config';
const CACHE_KEY = 'timetable.cache';
const CHANGE_WINDOW_MS = 72 * 3600 * 1000;

export async function getTimetableConfig(): Promise<TimetableConfig> {
  const saved = await getSetting<Partial<TimetableConfig>>(CONFIG_KEY);
  return {
    url: saved?.url ?? env.timetableUrl,
    section: (saved?.section || env.timetableSection).toUpperCase(),
  };
}

export async function saveTimetableConfig(config: TimetableConfig) {
  await setSetting(CONFIG_KEY, config);
}

function diff(prev: Session[], next: Session[], at: string): Change[] {
  const before = new Map<string, string[]>();
  for (const s of prev) before.set(s.key, [...(before.get(s.key) ?? []), s.text]);
  const after = new Map<string, string[]>();
  for (const s of next) after.set(s.key, [...(after.get(s.key) ?? []), s.text]);
  const meta = new Map<string, Session>();
  for (const s of [...prev, ...next]) meta.set(s.key, s);

  const changes: Change[] = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const a = (before.get(key) ?? []).join(' · ');
    const b = (after.get(key) ?? []).join(' · ');
    if (a === b) continue;
    const s = meta.get(key)!;
    changes.push({ key, date: s.date, day: s.day, start: s.start, before: a || null, after: b || null, detectedAt: at });
  }
  return changes;
}

function toState(cache: CacheRecord, status: 'ok' | 'stale', error?: { code: string; message: string }): TimetableState {
  const cutoff = Date.now() - CHANGE_WINDOW_MS;
  return {
    status,
    source: describeSource(parseSourceUrl(cache.sourceUrl)),
    fileName: cache.fileName,
    via: cache.via,
    checkedAt: cache.checkedAt,
    contentChangedAt: cache.contentChangedAt,
    sourceModifiedAt: cache.sourceModifiedAt,
    data: cache.data,
    changes: cache.changes.filter((c) => Date.parse(c.detectedAt) > cutoff),
    ...(error ? { error } : {}),
  };
}

let inflight: Promise<TimetableState> | null = null;

async function refresh(config: TimetableConfig & { url: string }, cache: CacheRecord | null): Promise<TimetableState> {
  const now = new Date().toISOString();
  let source;
  try {
    source = parseSourceUrl(config.url);
  } catch (err) {
    return { status: 'error', error: { code: 'invalid_url', message: (err as Error).message }, source: 'invalid link' };
  }

  try {
    const file = await downloadSource(source, env.googleApiKey);
    const hash = sha256(Buffer.from(file.bytes));
    const sameContent = cache && cache.sourceUrl === config.url && cache.hash === hash && cache.parserVersion === PARSER_VERSION && cache.data;
    let next: CacheRecord;
    if (sameContent) {
      next = { ...cache, checkedAt: now, sourceModifiedAt: file.modifiedAt ?? cache.sourceModifiedAt, lastError: null };
    } else {
      const grids = await readWorkbook(Buffer.from(file.bytes));
      const data = parseTimetable(grids, { section: config.section });
      const contentChanged = !cache || cache.hash !== hash || cache.sourceUrl !== config.url;
      const sameSource = cache && cache.sourceUrl === config.url;
      const fresh = sameSource && contentChanged && cache.data ? diff(cache.data.sessions, data.sessions, now) : [];
      const freshKeys = new Set(fresh.map((c) => c.key));
      const carried = sameSource ? cache.changes.filter((c) => !freshKeys.has(c.key) && Date.parse(c.detectedAt) > Date.now() - CHANGE_WINDOW_MS) : [];
      next = {
        sourceUrl: config.url,
        hash,
        parserVersion: PARSER_VERSION,
        fileName: file.fileName,
        via: file.via,
        checkedAt: now,
        contentChangedAt: contentChanged || !cache ? now : cache.contentChangedAt,
        sourceModifiedAt: file.modifiedAt,
        data,
        changes: [...fresh, ...carried],
        lastError: null,
      };
    }
    await setSetting(CACHE_KEY, next);
    return toState(next, 'ok');
  } catch (err) {
    const error =
      err instanceof SourceError
        ? { code: err.code, message: err.message }
        : { code: 'parse', message: err instanceof Error ? err.message : 'The timetable could not be read.' };
    console.error('[section-e] timetable refresh failed:', error.message);
    if (cache && cache.sourceUrl === config.url && cache.data) {
      await setSetting(CACHE_KEY, { ...cache, lastError: { ...error, at: now } });
      return toState(cache, 'stale', error);
    }
    return { status: 'error', error, source: describeSource(source) };
  }
}

export async function getTimetable(opts: { force?: boolean } = {}): Promise<TimetableState> {
  const config = await getTimetableConfig();
  if (!config.url) return { status: 'unconfigured' };
  const cache = await getSetting<CacheRecord>(CACHE_KEY);
  const ttl = env.timetableTtlSeconds * 1000;
  const usable = cache && cache.sourceUrl === config.url && cache.parserVersion === PARSER_VERSION;
  if (usable && !opts.force && Date.now() - Date.parse(cache.checkedAt) < ttl) {
    return toState(cache, 'ok');
  }
  if (!inflight) {
    inflight = refresh({ ...config, url: config.url }, cache).finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export async function getTimetableDiagnostics() {
  const [config, cache] = await Promise.all([getTimetableConfig(), getSetting<CacheRecord>(CACHE_KEY)]);
  return {
    config,
    cache: cache
      ? {
          fileName: cache.fileName,
          via: cache.via,
          checkedAt: cache.checkedAt,
          contentChangedAt: cache.contentChangedAt,
          sourceModifiedAt: cache.sourceModifiedAt,
          detection: cache.data?.detection ?? null,
          warnings: cache.data?.warnings ?? [],
          sessions: cache.data?.sessions.length ?? 0,
          lastError: cache.lastError,
          sourceMatches: cache.sourceUrl === config.url,
        }
      : null,
    hasApiKey: Boolean(env.googleApiKey),
    ttlSeconds: env.timetableTtlSeconds,
  };
}
