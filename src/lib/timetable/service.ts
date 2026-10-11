import 'server-only';
import { env } from '../env';
import { safeEqual, sha256 } from '../crypto';
import { getSetting, setSetting } from '../settings';
import { readWorkbook } from '../xlsx';
import { describeSource, downloadSource, parseSourceUrl, SourceError } from './source';
import { parseTimetable, PARSER_VERSION, type ParsedTimetable, type Session } from './parse';

/**
 * The timetable, from one of three sources:
 *  - link   — a public share link the server downloads itself (at most once per TTL);
 *  - relay  — a small Google Apps Script running in the admin's own Google account pushes the
 *             workbook here (for sheets restricted to specific email IDs);
 *  - upload — the admin uploads the .xlsx by hand whenever it changes.
 * Whatever the source, the parsed copy is cached in Postgres and shared by every visitor. If a
 * source goes quiet or fails, the last good copy is served and clearly marked as stale.
 */

export type TimetableMode = 'link' | 'relay' | 'upload';

export interface TimetableConfig {
  /** When false the timetable is hidden everywhere and homework uses fixed dates only. */
  enabled: boolean;
  mode: TimetableMode;
  url: string | null;
  section: string;
  /** sha256 of the relay key the Apps Script sends; the key itself is only shown once. */
  relayKeyHash: string | null;
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
  /** Which source produced this copy: the link URL, 'relay' or 'upload'. */
  sourceKey: string;
  hash: string;
  parserVersion: number;
  fileName: string | null;
  via: string;
  checkedAt: string; // last time the source confirmed this copy (download, relay heartbeat, upload)
  contentChangedAt: string; // when the content hash last changed
  sourceModifiedAt: string | null; // as reported by the source (Drive / Apps Script / Last-Modified)
  data: ParsedTimetable;
  changes: Change[];
  lastError: { code: string; message: string; at: string } | null;
  /** base64 workbook for relay/upload copies, so a parser upgrade can re-read it without the source. */
  raw?: string;
}

export interface TimetableError {
  code: string;
  message: string;
}

export type TimetableState =
  | { status: 'disabled' }
  | { status: 'unconfigured' }
  | { status: 'pending'; mode: TimetableMode }
  | { status: 'error'; error: TimetableError; source: string; mode: TimetableMode }
  | {
      status: 'ok' | 'stale';
      mode: TimetableMode;
      source: string;
      fileName: string | null;
      via: string;
      checkedAt: string;
      contentChangedAt: string;
      sourceModifiedAt: string | null;
      data: ParsedTimetable;
      changes: Change[];
      error?: TimetableError;
    };

const CONFIG_KEY = 'timetable.config';
const CACHE_KEY = 'timetable.cache';
const CHANGE_WINDOW_MS = 72 * 3600 * 1000;
/** The relay script runs every ~10 minutes; after this long without a heartbeat the copy is flagged. */
export const RELAY_QUIET_MS = 2 * 3600 * 1000;

/* ------------------------------------------------------------------ config */

export async function getTimetableConfig(): Promise<TimetableConfig> {
  const saved = await getSetting<Partial<TimetableConfig>>(CONFIG_KEY);
  return {
    enabled: saved?.enabled ?? true,
    mode: saved?.mode ?? 'link',
    url: saved?.url ?? env.timetableUrl,
    section: (saved?.section || env.timetableSection).toUpperCase(),
    relayKeyHash: saved?.relayKeyHash ?? null,
  };
}

export async function saveTimetableConfig(patch: Partial<TimetableConfig>) {
  const current = (await getSetting<Partial<TimetableConfig>>(CONFIG_KEY)) ?? {};
  await setSetting(CONFIG_KEY, { ...current, ...patch });
}

/** True when the timetable feature is switched on (cheap; no download). */
export async function isTimetableEnabled(): Promise<boolean> {
  return (await getTimetableConfig()).enabled;
}

function sourceKeyOf(config: TimetableConfig): string | null {
  if (config.mode === 'link') return config.url || null;
  return config.mode;
}

function describeKey(sourceKey: string): string {
  if (sourceKey === 'relay') return 'Google Apps Script relay';
  if (sourceKey === 'upload') return 'Uploaded workbook';
  try {
    return describeSource(parseSourceUrl(sourceKey));
  } catch {
    return 'custom link';
  }
}

/** Creates a new relay key, stores only its hash, and returns the key once. */
export async function rotateRelayKey(): Promise<string> {
  const key = `se_${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  await saveTimetableConfig({ relayKeyHash: sha256(key) });
  return key;
}

export async function verifyRelayKey(presented: string | null): Promise<boolean> {
  if (!presented) return false;
  const { relayKeyHash } = await getTimetableConfig();
  return Boolean(relayKeyHash && safeEqual(sha256(presented), relayKeyHash));
}

/* ------------------------------------------------------------------- cache */

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

function toState(cache: CacheRecord, mode: TimetableMode, status: 'ok' | 'stale', error?: TimetableError): TimetableState {
  const cutoff = Date.now() - CHANGE_WINDOW_MS;
  return {
    status,
    mode,
    source: describeKey(cache.sourceKey),
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

async function readCache(): Promise<CacheRecord | null> {
  const cache = await getSetting<CacheRecord & { sourceUrl?: string }>(CACHE_KEY);
  if (!cache) return null;
  // Copies saved before source modes existed used `sourceUrl`.
  if (!cache.sourceKey && cache.sourceUrl) cache.sourceKey = cache.sourceUrl;
  return cache;
}

export interface IncomingFile {
  bytes: Uint8Array;
  fileName: string | null;
  modifiedAt: string | null;
  via: string;
}

/**
 * Stores a freshly obtained workbook: re-parses only when the content (or parser) changed, records
 * what changed for Section E since the previous copy, and keeps recent changes for 72 hours.
 */
async function store(sourceKey: string, file: IncomingFile, config: TimetableConfig, cache: CacheRecord | null): Promise<CacheRecord> {
  const now = new Date().toISOString();
  const buffer = Buffer.from(file.bytes);
  const hash = sha256(buffer);
  const keepRaw = sourceKey === 'relay' || sourceKey === 'upload';
  const sameSource = Boolean(cache && cache.sourceKey === sourceKey);
  let next: CacheRecord;
  if (cache && sameSource && cache.hash === hash && cache.parserVersion === PARSER_VERSION && cache.data) {
    next = { ...cache, checkedAt: now, sourceModifiedAt: file.modifiedAt ?? cache.sourceModifiedAt, lastError: null, via: file.via };
  } else {
    const grids = await readWorkbook(buffer);
    const data = parseTimetable(grids, { section: config.section });
    const contentChanged = !cache || !sameSource || cache.hash !== hash;
    const fresh = cache && sameSource && contentChanged && cache.data ? diff(cache.data.sessions, data.sessions, now) : [];
    const freshKeys = new Set(fresh.map((c) => c.key));
    const carried = cache && sameSource ? cache.changes.filter((c) => !freshKeys.has(c.key) && Date.parse(c.detectedAt) > Date.now() - CHANGE_WINDOW_MS) : [];
    next = {
      sourceKey,
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
  if (keepRaw) next.raw = buffer.toString('base64');
  else delete next.raw;
  await setSetting(CACHE_KEY, next);
  return next;
}

/** Relay / upload entry point: accept a workbook pushed to us. Throws on unreadable files. */
export async function ingestWorkbook(sourceKey: 'relay' | 'upload', file: IncomingFile): Promise<TimetableState> {
  const config = await getTimetableConfig();
  const cache = await readCache();
  try {
    const next = await store(sourceKey, file, config, cache);
    return toState(next, sourceKey, 'ok');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The workbook could not be read.';
    if (cache && cache.sourceKey === sourceKey) {
      await setSetting(CACHE_KEY, { ...cache, lastError: { code: 'parse', message, at: new Date().toISOString() } });
    }
    throw new SourceError('not_xlsx', message);
  }
}

/**
 * Relay heartbeat without a file. Returns true when our copy already matches the sheet's modified
 * time (nothing to send); false asks the relay to send the workbook.
 */
export async function relayHeartbeat(modifiedAt: string | null): Promise<boolean> {
  const cache = await readCache();
  if (!cache || cache.sourceKey !== 'relay' || !modifiedAt || cache.sourceModifiedAt !== modifiedAt || cache.parserVersion !== PARSER_VERSION) {
    return false;
  }
  await setSetting(CACHE_KEY, { ...cache, checkedAt: new Date().toISOString(), lastError: null });
  return true;
}

/* -------------------------------------------------------------- link mode */

let inflight: Promise<TimetableState> | null = null;

async function refreshFromLink(config: TimetableConfig & { url: string }, cache: CacheRecord | null): Promise<TimetableState> {
  const now = new Date().toISOString();
  let source;
  try {
    source = parseSourceUrl(config.url);
  } catch (err) {
    return { status: 'error', mode: 'link', error: { code: 'invalid_url', message: (err as Error).message }, source: 'invalid link' };
  }
  try {
    const file = await downloadSource(source, env.googleApiKey);
    const next = await store(config.url, file, config, cache);
    return toState(next, 'link', 'ok');
  } catch (err) {
    const error =
      err instanceof SourceError
        ? { code: err.code, message: err.message }
        : { code: 'parse', message: err instanceof Error ? err.message : 'The timetable could not be read.' };
    console.error('[section-e] timetable refresh failed:', error.message);
    if (cache && cache.sourceKey === config.url && cache.data) {
      await setSetting(CACHE_KEY, { ...cache, lastError: { ...error, at: now } });
      return toState(cache, 'link', 'stale', error);
    }
    return { status: 'error', mode: 'link', error, source: describeSource(source) };
  }
}

/* ------------------------------------------------------------------ reads */

export async function getTimetable(opts: { force?: boolean } = {}): Promise<TimetableState> {
  const config = await getTimetableConfig();
  if (!config.enabled) return { status: 'disabled' };
  const key = sourceKeyOf(config);
  if (!key) return { status: 'unconfigured' };
  let cache = await readCache();

  if (config.mode !== 'link') {
    if (!cache || cache.sourceKey !== key || !cache.data) return { status: 'pending', mode: config.mode };
    if (cache.parserVersion !== PARSER_VERSION && cache.raw) {
      // Parser upgraded since this copy arrived: re-read the stored workbook.
      cache = await store(key, { bytes: Buffer.from(cache.raw, 'base64'), fileName: cache.fileName, modifiedAt: cache.sourceModifiedAt, via: cache.via }, config, cache);
    }
    if (config.mode === 'relay' && Date.now() - Date.parse(cache.checkedAt) > RELAY_QUIET_MS) {
      return toState(cache, 'relay', 'stale', {
        code: 'relay_quiet',
        message: 'The Google Apps Script relay has not checked in recently, so this copy may be out of date.',
      });
    }
    return toState(cache, config.mode, 'ok', cache.lastError ? { code: cache.lastError.code, message: cache.lastError.message } : undefined);
  }

  const ttl = env.timetableTtlSeconds * 1000;
  const usable = cache && cache.sourceKey === key && cache.parserVersion === PARSER_VERSION;
  if (usable && !opts.force && Date.now() - Date.parse(cache!.checkedAt) < ttl) {
    return toState(cache!, 'link', 'ok');
  }
  if (!inflight) {
    inflight = refreshFromLink({ ...config, url: key }, cache).finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export async function getTimetableDiagnostics() {
  const [config, cache] = await Promise.all([getTimetableConfig(), readCache()]);
  const key = sourceKeyOf(config);
  return {
    config: {
      enabled: config.enabled,
      mode: config.mode,
      url: config.url,
      section: config.section,
      hasRelayKey: Boolean(config.relayKeyHash),
    },
    cache: cache
      ? {
          source: describeKey(cache.sourceKey),
          fileName: cache.fileName,
          via: cache.via,
          checkedAt: cache.checkedAt,
          contentChangedAt: cache.contentChangedAt,
          sourceModifiedAt: cache.sourceModifiedAt,
          detection: cache.data?.detection ?? null,
          warnings: cache.data?.warnings ?? [],
          sessions: cache.data?.sessions.length ?? 0,
          lastError: cache.lastError,
          sourceMatches: cache.sourceKey === key,
        }
      : null,
    hasApiKey: Boolean(env.googleApiKey),
    ttlSeconds: env.timetableTtlSeconds,
    relayQuietHours: RELAY_QUIET_MS / 3600_000,
  };
}

export type TimetableDiagnostics = Awaited<ReturnType<typeof getTimetableDiagnostics>>;
