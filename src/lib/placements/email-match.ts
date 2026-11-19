/** Pure parsing of a pasted class list ("Name,email" or "ROLL email" lines). No database here. */

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;
const ROLL_IN_LINE_RE = /\b\d{2}[A-Za-z]{2,8}\d{2,4}[A-Za-z]?\b/;

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

export function matchEmailLines(
  text: string,
  roster: { rollNo: string; name: string }[],
): { matched: { rollNo: string; email: string }[]; unmatched: string[] } {
  const matched: { rollNo: string; email: string }[] = [];
  const unmatched: string[] = [];
  const rolls = new Set(roster.map((r) => r.rollNo.toUpperCase()));

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^name\b/i.test(line) && /e-?mail/i.test(line)) continue;

    const found = line.match(EMAIL_RE);
    if (!found) {
      unmatched.push(line);
      continue;
    }
    let email = found[0].toLowerCase();
    let rest = (line.slice(0, found.index) + ' ' + line.slice(found.index! + found[0].length)).trim();

    // "himanshuyadav,p26@imi.edu": a comma where the dot should be.
    const local = email.split('@')[0];
    const before = line.slice(0, found.index).replace(/[,;\s]+$/, '');
    if (/^p\d{2}$/.test(local) && /^[A-Za-z]+$/.test(before.split(/[,;\s]/).pop() ?? '') && /[,;]\s*$/.test(line.slice(0, found.index))) {
      const first = before.split(/[,;\s]/).pop()!.toLowerCase();
      email = `${first}.${email}`;
      rest = before;
    }

    let roll: string | null = null;
    const rm = rest.match(ROLL_IN_LINE_RE);
    if (rm && rolls.has(rm[0].toUpperCase())) roll = rm[0].toUpperCase();
    if (!roll && !rm) {
      const tokens = words(rest);
      const flat = squash(rest);
      let hits = roster.filter((r) => {
        const w = words(r.name);
        return w.length > 0 && (w.every((x) => tokens.includes(x)) || (flat !== '' && squash(r.name) === flat));
      });
      // "Raj Kumar" also fits "Raj Kumar Singh": prefer the roster name that uses every token.
      if (hits.length > 1) hits = hits.filter((r) => words(r.name).length === tokens.length || squash(r.name) === flat);
      if (hits.length === 1) roll = hits[0].rollNo;
    }
    if (roll) matched.push({ rollNo: roll, email });
    else unmatched.push(line);
  }
  return { matched, unmatched };
}

/**
 * Decides what to write: one email per roll (last line wins), and an email claimed by two different
 * rolls is saved for neither. Pure, so it can be tested without a database.
 */
export function planEmailSave(matched: { rollNo: string; email: string }[]): {
  updates: { rollNo: string; email: string }[];
  duplicates: string[];
  conflicts: { email: string; rollNos: string[] }[];
} {
  const byRoll = new Map<string, string>();
  const duplicates: string[] = [];
  for (const m of matched) {
    if (byRoll.has(m.rollNo)) duplicates.push(m.rollNo);
    byRoll.set(m.rollNo, m.email);
  }
  const byEmail = new Map<string, string[]>();
  for (const [rollNo, email] of byRoll) byEmail.set(email, [...(byEmail.get(email) ?? []), rollNo]);
  const conflicts = [...byEmail].filter(([, r]) => r.length > 1).map(([email, rollNos]) => ({ email, rollNos }));
  const bad = new Set(conflicts.flatMap((c) => c.rollNos));
  const updates = [...byRoll].filter(([r]) => !bad.has(r)).map(([rollNo, email]) => ({ rollNo, email }));
  return { updates, duplicates: [...new Set(duplicates)], conflicts };
}
