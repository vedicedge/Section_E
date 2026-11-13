/**
 * Reads subject group lists in whatever shape they arrive, pasted from Excel / Sheets / WhatsApp or
 * uploaded as a sheet. Roll numbers are the anchor: every roll number found joins the group of its row.
 *
 *   1. One row per student:  Roll No | Name | Group | Topic     (empty Group cells repeat the one above,
 *                                                                as merged cells read back)
 *   2. One row per group:    Group 1 | 26PGDM101 | 26PGDM102 …
 *   3. Blocks:               "Group 1" on its own line, then its members underneath
 *   4. Topics only:          Group | Topic   (no roll numbers: adds topics to a list that is already up)
 *
 * Names are never taken from the file: they come from the roster, so a typo can't publish a wrong name.
 */

export interface ParsedGroup {
  name: string;
  topic: string | null;
  rolls: string[];
}

export interface ParsedGroups {
  groups: ParsedGroup[];
  /** A roll number listed in more than one group: it is kept in the first one only. */
  duplicates: string[];
  /** Rows with text but no roll number and no group heading. */
  ignoredRows: number;
  /** Every group that has a topic, including groups listed without roll numbers (a topics-only list). */
  topics: { name: string; topic: string }[];
}

const ROLL_IN_TEXT = /\b(\d{2})\s*-?\s*([A-Za-z]{2,8})\s*-?\s*(\d{2,4})([A-Za-z]?)\b/g;
const GROUP_HEAD = /^(group|grp|team|syndicate|batch|g)\s*[-.:#]?\s*\w+/i;

function rollsIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(ROLL_IN_TEXT)) out.push(`${m[1]}${m[2]}${m[3]}${m[4]}`.toUpperCase());
  return out;
}

function tidyGroupName(raw: string): string {
  const v = raw.replace(/\s+/g, ' ').trim().replace(/[:\-–]+$/, '').trim();
  if (/^\d+$/.test(v)) return `Group ${Number(v)}`;
  const g = /^(?:g|grp|group)\s*[-.:#]?\s*(\d+)$/i.exec(v);
  if (g) return `Group ${Number(g[1])}`;
  return v.slice(0, 60);
}

/** Splits pasted text into rows of cells (tabs from a spreadsheet, else commas or semicolons). */
export function rowsFromText(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const sep = lines.some((l) => l.includes('\t')) ? '\t' : lines.some((l) => l.includes(';')) && !lines.some((l) => l.includes(',')) ? ';' : ',';
  return lines.map((l) => l.split(sep).map((c) => c.replace(/^"(.*)"$/, '$1').trim()));
}

function headerIndex(row: string[], re: RegExp): number {
  return row.findIndex((c) => re.test(c.trim()));
}

export function parseGroups(rows: string[][]): ParsedGroups {
  const clean = rows.map((r) => r.map((c) => String(c ?? '').trim())).filter((r) => r.some(Boolean));

  // A header row (within the first five) names the columns.
  let groupCol = -1;
  let topicCol = -1;
  let start = 0;
  for (let i = 0; i < Math.min(5, clean.length); i++) {
    const row = clean[i];
    if (rollsIn(row.join(' ')).length) break;
    const g = headerIndex(row, /^(group|grp|team|syndicate|batch)(\s*(no\.?|number|name|#))?$/i);
    const roll = headerIndex(row, /roll|enrol|reg/i);
    if (g >= 0 || roll >= 0) {
      groupCol = g;
      topicCol = headerIndex(row, /^(topic|project|company|title|case|theme|note|notes|link)/i);
      start = i + 1;
      break;
    }
  }

  const byName = new Map<string, ParsedGroup>();
  const seen = new Map<string, string>();
  const duplicates = new Set<string>();
  let ignoredRows = 0;
  let current: string | null = null;
  let currentTopic: string | null = null;

  const add = (name: string, topic: string | null, rolls: string[]) => {
    let g = byName.get(name);
    if (!g) {
      g = { name, topic: null, rolls: [] };
      byName.set(name, g);
    }
    if (topic && !g.topic) g.topic = topic.slice(0, 300);
    for (const roll of rolls) {
      const at = seen.get(roll);
      if (at === undefined) {
        seen.set(roll, name);
        g.rolls.push(roll);
      } else if (at !== name) {
        duplicates.add(roll);
      }
    }
  };

  for (const row of clean.slice(start)) {
    const rolls = rollsIn(row.join(' \t '));
    const topicCell = topicCol >= 0 ? row[topicCol] || null : null;

    if (groupCol >= 0) {
      const label = row[groupCol];
      if (label) {
        current = tidyGroupName(label);
        currentTopic = topicCell;
      } else if (topicCell) {
        currentTopic = topicCell;
      }
      if (!rolls.length) {
        if (label) add(current!, currentTopic, []);
        else ignoredRows++;
        continue;
      }
      if (!current) {
        ignoredRows++;
        continue;
      }
      add(current, topicCell ?? currentTopic, rolls);
      continue;
    }

    // No header: a row without roll numbers may be a block heading ("Group 3", "Group 3 – Topic").
    const nonRoll = row.filter((c) => c && !rollsIn(c).length);
    if (!rolls.length) {
      const head = nonRoll[0];
      if (head && (GROUP_HEAD.test(head) || /^\d+$/.test(head))) {
        const [name, ...rest] = head.split(/\s[–—-]\s|:\s/);
        current = tidyGroupName(name);
        currentTopic = rest.join(' – ').trim() || nonRoll[1] || null;
        add(current, currentTopic, []);
      } else {
        ignoredRows++;
      }
      continue;
    }
    // A row that starts with its own group label, e.g. "Group 1 | 26PGDM101 | 26PGDM102".
    const first = row.find(Boolean) ?? '';
    if (!rollsIn(first).length && (GROUP_HEAD.test(first) || /^\d+$/.test(first))) {
      add(tidyGroupName(first), null, rolls);
      continue;
    }
    if (current) add(current, currentTopic, rolls);
    else ignoredRows++;
  }

  const byOrder = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true });
  const groups = [...byName.values()].filter((g) => g.rolls.length).sort(byOrder);
  const topics = [...byName.values()]
    .filter((g): g is ParsedGroup & { topic: string } => Boolean(g.topic))
    .map((g) => ({ name: g.name, topic: g.topic }))
    .sort(byOrder);
  return { groups, duplicates: [...duplicates], ignoredRows, topics };
}
