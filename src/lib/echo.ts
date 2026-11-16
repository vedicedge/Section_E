/**
 * Echo, Section E's study assistant: Claude artifacts shared by email invitation on claude.ai.
 * A claude.ai artifact can be shared with only 43 people, so the section is split across two identical
 * copies of Echo by roll number. The home page and menu link to /echo, which sends each signed-in
 * student to the copy they were invited to.
 */
export const ECHO_URLS = ['https://claude.ai/artifact/6hy8QqByKn3tGKEDbidyQ9', 'https://claude.ai/artifact/AthRNRtiNRX7GWFgDCzfsQ'] as const;

/** The first copy (the owner's, and the one the admin page links to). */
export const ECHO_URL = ECHO_URLS[0];

/** Roll numbers up to and including this one are invited to the first Echo; later ones to the second. */
export const LAST_ROLL_ON_FIRST_ECHO = '26PGDM284';

/** Which Echo a student belongs to, by roll number. */
export function echoUrlFor(rollNo: string): string {
  return rollNo.trim().toUpperCase() <= LAST_ROLL_ON_FIRST_ECHO ? ECHO_URLS[0] : ECHO_URLS[1];
}
