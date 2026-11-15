/** Wording shared by the announcements page, the push notification and the WhatsApp share. */

export interface AnnouncementText {
  title: string;
  body: string;
  link: string | null;
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** Push notifications show ~2 lines; keep the body short. */
export function pushBody(a: AnnouncementText): string {
  return clip(a.body || 'Open Section E for details.', 160);
}

/** The message pre-filled in WhatsApp: title in bold, the notice, its link, then where to read more. */
export function whatsappMessage(a: AnnouncementText, siteUrl: string): string {
  const lines = [`*${a.title.trim()}*`];
  if (a.body.trim()) lines.push('', a.body.trim());
  if (a.link) lines.push('', a.link);
  lines.push('', `Section E · ${siteUrl.replace(/\/+$/, '')}/announcements`);
  return lines.join('\n');
}

/** wa.me opens WhatsApp (app or web) with the text ready; the admin picks the group and taps send. */
export function whatsappUrl(a: AnnouncementText, siteUrl: string): string {
  return `https://wa.me/?text=${encodeURIComponent(whatsappMessage(a, siteUrl))}`;
}
