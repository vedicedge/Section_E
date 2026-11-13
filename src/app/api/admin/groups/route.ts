import { z } from 'zod';
import { HttpError, ok, requireAdmin, route } from '@/lib/http';
import { readWorkbook, looksLikeXlsx } from '@/lib/xlsx';
import { parseGroups, rowsFromText } from '@/lib/groups/parse';
import { existingGroupNames, rosterNames, saveGroupSet, setGroupTopics } from '@/lib/groups/repo';

const MAX_UPLOAD = 5 * 1024 * 1024;

const options = z.object({
  commit: z.enum(['0', '1']).default('0'),
  subject: z.string().trim().min(1, 'Enter the subject, e.g. CF.').max(40),
  title: z.string().trim().max(60).default('').transform((v) => v || 'Groups'),
  text: z.string().max(200_000).default(''),
});

/**
 * Upload a subject's group list (an .xlsx / .csv file, or text pasted from a sheet).
 * commit=0 returns a preview with the names from the roster; commit=1 saves it.
 */
export const POST = route(async (req) => {
  await requireAdmin();
  const form = await req.formData();
  const opts = options.parse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string')));

  let rows: string[][];
  let sourceName = 'pasted list';
  const file = form.get('file');
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD) throw new HttpError(413, 'That file is larger than 5 MB.', 'too_large');
    const bytes = new Uint8Array(await file.arrayBuffer());
    sourceName = file.name;
    if (looksLikeXlsx(bytes)) {
      try {
        const sheets = (await readWorkbook(Buffer.from(bytes))).filter((g) => !g.hidden);
        // Every visible sheet, one after another (a sheet per group works too).
        rows = sheets.flatMap((g) => g.cells.map((r) => r.map((c) => c?.text ?? '')));
      } catch (err) {
        throw new HttpError(422, (err as Error).message, 'unreadable');
      }
    } else {
      rows = rowsFromText(new TextDecoder().decode(bytes));
    }
  } else if (opts.text.trim()) {
    rows = rowsFromText(opts.text);
  } else {
    throw new HttpError(422, 'Choose an .xlsx or .csv file, or paste the list.', 'no_input');
  }

  const parsed = parseGroups(rows);

  // No roll numbers but group topics: add the topics to the list that is already up.
  if (!parsed.groups.length && parsed.topics.length) {
    const existing = await existingGroupNames(opts.subject, opts.title);
    if (!existing) {
      throw new HttpError(404, `This looks like a topics list, but there is no “${opts.subject} · ${opts.title}” group list yet. Upload the groups with roll numbers first, using the same subject and title.`, 'no_set');
    }
    const known = new Set(existing.map((n) => n.toLowerCase()));
    const preview = {
      kind: 'topics' as const,
      sourceName,
      subject: opts.subject,
      title: opts.title,
      topics: parsed.topics.map((t) => ({ ...t, found: known.has(t.name.toLowerCase()) })),
    };
    if (opts.commit !== '1') return ok({ preview });
    const saved = await setGroupTopics(opts.subject, opts.title, parsed.topics);
    return ok({ preview, saved });
  }

  if (!parsed.groups.length) {
    throw new HttpError(
      422,
      'No groups with roll numbers were found. Use a “Roll No” and a “Group” column, one row per group, or a “Group 1” line above its members.',
      'no_groups',
    );
  }

  const names = await rosterNames(parsed.groups.flatMap((g) => g.rolls));
  const preview = {
    kind: 'groups' as const,
    sourceName,
    subject: opts.subject,
    title: opts.title,
    groups: parsed.groups.map((g) => ({
      name: g.name,
      topic: g.topic,
      members: g.rolls.map((r) => ({ rollNo: r, name: names.get(r) ?? null })),
    })),
    unknown: parsed.groups.flatMap((g) => g.rolls).filter((r) => !names.has(r)),
    duplicates: parsed.duplicates,
    ignoredRows: parsed.ignoredRows,
  };
  if (opts.commit !== '1') return ok({ preview });

  const saved = await saveGroupSet({ subject: opts.subject, title: opts.title, groups: parsed.groups });
  return ok({ preview, saved });
});
