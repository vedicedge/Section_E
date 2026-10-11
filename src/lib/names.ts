/** Roll numbers look like 26PGDM123 or 25PGDM999R (repeaters). */
export const ROLL_RE = /^\d{2}[A-Z]{2,8}\d{2,4}[A-Z]?$/;

export function normaliseRoll(input: unknown): string {
  return String(input ?? '')
    .toUpperCase()
    .replace(/[\s\-_/]/g, '')
    .trim();
}

export function isValidRoll(roll: string): boolean {
  return ROLL_RE.test(roll);
}

const KEEP_UPPER = new Set(['II', 'III', 'IV', 'VI', 'HR', 'IT', 'MM', 'OB', 'CF', 'SM', 'OM', 'DT', 'TOD', 'DAM', 'AI', 'ML']);
const KEEP_LOWER = new Set(['and', 'of', 'for', 'the', 'in', 'to', 'a', 'an', 'with', 'on']);

/** "STRATEGIC MANAGEMENT" → "Strategic Management", "TEAM AND ORGANIZATIONAL DYNAMICS" → "Team and Organizational Dynamics". */
export function titleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/(\s+)/)
    .map((word, i) => {
      if (/^\s+$/.test(word)) return word;
      const upper = word.toUpperCase();
      if (KEEP_UPPER.has(upper)) return upper;
      if (i > 0 && KEEP_LOWER.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join('');
}

/** Tidies spreadsheet names: "Meera . Iyer" → "Meera Iyer", "KABIR MEHTA" → "Kabir Mehta". */
export function cleanName(input: string): string {
  let name = input.replace(/\s+\.(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim().replace(/\.$/, '').trim();
  if (/[A-Z]{3,}/.test(name) && name === name.toUpperCase()) {
    name = name
      .toLowerCase()
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  return name;
}

export function firstName(name: string): string {
  return cleanName(name).split(' ')[0] ?? name;
}

/** "Riya S Kapoor" → "Riya K." — enough to confirm identity without publishing full names. */
export function maskedName(name: string): string {
  const parts = cleanName(name).split(' ').filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts[0]} ${parts[parts.length - 1]!.charAt(0)}.`;
}

export function initials(name: string): string {
  const parts = cleanName(name).split(' ').filter(Boolean);
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : '';
  return (first + last).toUpperCase();
}

/** Normalises a subject label for fuzzy matching: "MM-II" / "MM 2" / "mm ii" → "MMII". */
export function subjectKey(input: string): string {
  return input
    .toUpperCase()
    .replace(/\b2\b/g, 'II')
    .replace(/\b3\b/g, 'III')
    .replace(/[^A-Z0-9]/g, '');
}
