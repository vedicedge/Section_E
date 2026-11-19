/**
 * The Google Apps Script the admin pastes into script.google.com while signed in to their college
 * mailbox. Every 30 minutes it sends new emails from faculty to the section's mailing list to
 * /api/homework/inbox. The site keeps only the deadline sentences, as suggestions for the admin.
 */

const TEMPLATE = `/**
 * Section E — homework and placement inbox.
 * Runs inside YOUR college Google account. Every 30 minutes it sends new emails from faculty to
 * the section's mailing list to the Section E website, which picks out deadlines and lists them
 * for you to approve in Admin → Homework. Nothing is posted to students until you approve it.
 * Set up once: choose "setUp" in the toolbar, press Run and allow access.
 */
const ENDPOINT = __ENDPOINT__;
const INBOX_KEY = __INBOX_KEY__;
// Which emails to look at. Change these if the mailing list or the college domain changes.
const SECTION_LIST = __SECTION_LIST__;
const FACULTY_DOMAIN = __FACULTY_DOMAIN__;
const LOOK_BACK_DAYS = 3;
// Placement emails (PPT attendee lists) and the calendar invites the site hands back.
const PLACEMENTS_ENDPOINT = __PLACEMENTS_ENDPOINT__;
const INVITES_ENDPOINT = __INVITES_ENDPOINT__;
const PLACEMENT_FROM = __PLACEMENT_FROM__;
const MAX_ATTACHMENT_BYTES = 2500000;
const MAX_BATCH_BYTES = 3500000;
const MAX_BATCH_EMAILS = 10;

function checkInbox() {
  const props = PropertiesService.getScriptProperties();
  const seen = JSON.parse(props.getProperty('SEEN') || '[]');
  const known = {};
  seen.forEach(function (id) { known[id] = true; });
  const me = Session.getActiveUser().getEmail();
  const since = Date.now() - LOOK_BACK_DAYS * 86400000;
  const query = 'to:' + SECTION_LIST + ' from:' + FACULTY_DOMAIN + ' newer_than:' + LOOK_BACK_DAYS + 'd';
  const emails = [];

  GmailApp.search(query, 0, 50).forEach(function (thread) {
    thread.getMessages().forEach(function (m) {
      if (emails.length >= 25 || known[m.getId()] || m.getDate().getTime() < since) return;
      const raw = m.getFrom();
      const parts = /^\\s*"?([^"<]*?)"?\\s*<([^>]+)>\\s*$/.exec(raw);
      const address = (parts ? parts[2] : raw).trim().toLowerCase();
      if (address === me.toLowerCase()) return;
      if (address.slice(-(FACULTY_DOMAIN.length + 1)) !== '@' + FACULTY_DOMAIN.toLowerCase()) return;
      emails.push({
        id: m.getId(),
        threadUrl: 'https://mail.google.com/mail/?authuser=' + encodeURIComponent(me) + '#all/' + thread.getId(),
        from: address,
        fromName: parts ? parts[1].trim() : '',
        subject: m.getSubject() || '',
        receivedAt: m.getDate().toISOString(),
        body: m.getPlainBody().slice(0, 20000),
      });
    });
  });

  // Sent even when empty, so the admin page can show the script is still running.
  const res = UrlFetchApp.fetch(ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + INBOX_KEY },
    payload: JSON.stringify({ emails: emails }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error('Section E said ' + res.getResponseCode() + ': ' + res.getContentText());

  emails.forEach(function (e) { seen.push(e.id); });
  props.setProperty('SEEN', JSON.stringify(seen.slice(-500)));

  // Placements run last and separately: a problem there must never stop the homework part above.
  try {
    checkPlacements();
  } catch (err) {
    console.error('Placements: ' + err);
  }
}

function checkPlacements() {
  const props = PropertiesService.getScriptProperties();
  const seen = JSON.parse(props.getProperty('PLACEMENT_SEEN') || '[]');
  const known = {};
  seen.forEach(function (id) { known[id] = true; });
  const me = Session.getActiveUser().getEmail();
  const query = 'from:' + PLACEMENT_FROM + ' has:attachment filename:xlsx newer_than:7d';
  const emails = [];

  GmailApp.search(query, 0, 50).forEach(function (thread) {
    thread.getMessages().forEach(function (m) {
      if (known[m.getId()]) return;
      const attachments = [];
      m.getAttachments().forEach(function (a) {
        if (!/\.xlsx?$/i.test(a.getName()) || a.getSize() > MAX_ATTACHMENT_BYTES) return;
        attachments.push({ name: a.getName(), dataBase64: Utilities.base64Encode(a.getBytes()) });
      });
      if (!attachments.length) return;
      emails.push({
        id: m.getId(),
        threadUrl: 'https://mail.google.com/mail/?authuser=' + encodeURIComponent(me) + '#all/' + thread.getId(),
        subject: m.getSubject() || '',
        receivedAt: m.getDate().toISOString(),
        body: m.getPlainBody().slice(0, 20000),
        attachments: attachments,
      });
    });
  });

  // Batches of at most 10 emails and about 3.5 MB. Sent even when empty, because the site's reply
  // also carries any calendar invites waiting to be created.
  const batches = [];
  let current = [];
  let size = 0;
  emails.forEach(function (e) {
    const bytes = JSON.stringify(e).length;
    if (current.length && (current.length >= MAX_BATCH_EMAILS || size + bytes > MAX_BATCH_BYTES)) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(e);
    size += bytes;
  });
  batches.push(current);

  const invites = {};
  batches.forEach(function (batch) {
    const res = UrlFetchApp.fetch(PLACEMENTS_ENDPOINT, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + INBOX_KEY },
      payload: JSON.stringify({ emails: batch }),
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) throw new Error('Section E said ' + res.getResponseCode() + ': ' + res.getContentText());
    batch.forEach(function (e) { seen.push(e.id); });
    props.setProperty('PLACEMENT_SEEN', JSON.stringify(seen.slice(-500)));
    (JSON.parse(res.getContentText()).invites || []).forEach(function (task) { invites[task.eventId] = task; });
  });

  Object.keys(invites).forEach(function (eventId) {
    const task = invites[eventId];
    try {
      const event = CalendarApp.getDefaultCalendar().createEvent(task.title, new Date(task.startIso), new Date(task.endIso), {
        location: task.location || '',
        description: task.description,
        guests: task.guests.join(','),
        sendInvites: true,
      });
      event.setGuestsCanSeeOtherGuests(false);
      const confirm = UrlFetchApp.fetch(INVITES_ENDPOINT, {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + INBOX_KEY },
        payload: JSON.stringify({ eventId: task.eventId, calendarEventId: event.getId() }),
        muteHttpExceptions: true,
      });
      if (confirm.getResponseCode() !== 200) console.error('Invite confirm for ' + task.title + ' got ' + confirm.getResponseCode());
    } catch (err) {
      // The site offers unconfirmed invites again after 2 hours.
      console.error('Invite for ' + task.title + ' failed: ' + err);
    }
  });
}

function setUp() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'checkInbox') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkInbox').timeBased().everyMinutes(30).create();
  checkInbox();
}
`;

export interface InboxScriptOptions {
  endpoint: string;
  inboxKey: string;
  sectionList: string;
  facultyDomain: string;
  placementsEndpoint: string;
  invitesEndpoint: string;
  placementFrom?: string;
}

export const DEFAULT_PLACEMENT_FROM = 'placement.summers@imi.edu';

export function inboxScript({
  endpoint,
  inboxKey,
  sectionList,
  facultyDomain,
  placementsEndpoint,
  invitesEndpoint,
  placementFrom = DEFAULT_PLACEMENT_FROM,
}: InboxScriptOptions): string {
  const values: Record<string, string> = {
    ENDPOINT: endpoint,
    INBOX_KEY: inboxKey,
    SECTION_LIST: sectionList,
    FACULTY_DOMAIN: facultyDomain,
    PLACEMENTS_ENDPOINT: placementsEndpoint,
    INVITES_ENDPOINT: invitesEndpoint,
    PLACEMENT_FROM: placementFrom,
  };
  // One pass, so a value that happens to contain another placeholder is never substituted twice.
  return TEMPLATE.replace(/__(ENDPOINT|INBOX_KEY|SECTION_LIST|FACULTY_DOMAIN|PLACEMENTS_ENDPOINT|INVITES_ENDPOINT|PLACEMENT_FROM)__/g, (_, name: string) => JSON.stringify(values[name]));
}
