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
// The site rejects over 3,000,000 base64 characters per file, 5 files per email and 4 MB per request.
const MAX_ATTACHMENT_BYTES = 2200000;
const MAX_EMAIL_BYTES = 2600000;
const MAX_ATTACHMENTS = 5;
const MAX_BATCH_BYTES = 3800000;
const MAX_BATCH_EMAILS = 10;

function checkInbox() {
  // Placements run whatever happens to the homework part; a homework error is still reported.
  try {
    checkHomework();
  } finally {
    try {
      checkPlacements();
    } catch (err) {
      Logger.log('Placements: ' + err);
    }
  }
}

function checkHomework() {
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
  // At most 300 ids: a script property holds about 9 KB, and 500 ids would not fit.
  try {
    props.setProperty('SEEN', JSON.stringify(seen.slice(-300)));
  } catch (err) {
    Logger.log('Could not save SEEN: ' + err);
  }
}

function checkPlacements() {
  const props = PropertiesService.getScriptProperties();
  const seen = JSON.parse(props.getProperty('PLACEMENT_SEEN') || '[]');
  const known = {};
  seen.forEach(function (id) { known[id] = true; });
  const me = Session.getActiveUser().getEmail();
  const sender = PLACEMENT_FROM.toLowerCase();
  const query = 'from:' + PLACEMENT_FROM + ' has:attachment (filename:xlsx OR filename:xls) newer_than:7d';
  const emails = [];

  GmailApp.search(query, 0, 50).forEach(function (thread) {
    thread.getMessages().forEach(function (m) {
      if (known[m.getId()]) return;
      // The address itself must match: the display name ("placement.summers@imi.edu" <x@gmail.com>) proves nothing.
      const raw = m.getFrom();
      const parts = /^\\s*"?([^"<]*?)"?\\s*<([^>]+)>\\s*$/.exec(raw);
      if ((parts ? parts[2] : raw).trim().toLowerCase() !== sender) return;
      // The site accepts at most 5 spreadsheets per email and a bounded size, so take the smallest first.
      const files = m.getAttachments().filter(function (a) {
        return /\\.xlsx?$/i.test(a.getName()) && a.getSize() <= MAX_ATTACHMENT_BYTES;
      }).sort(function (a, b) { return a.getSize() - b.getSize(); });
      const attachments = [];
      let total = 0;
      files.forEach(function (a) {
        if (attachments.length >= MAX_ATTACHMENTS || total + a.getSize() > MAX_EMAIL_BYTES) return;
        total += a.getSize();
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

  // Batches of at most 10 emails and about 3.8 MB. Sent even when empty, because the site's reply
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
  const cancels = {};
  function markSeen(batch) {
    batch.forEach(function (e) { seen.push(e.id); });
    try {
      props.setProperty('PLACEMENT_SEEN', JSON.stringify(seen.slice(-300)));
    } catch (err) {
      Logger.log('Could not save PLACEMENT_SEEN: ' + err);
    }
  }
  function send(batch) {
    const res = UrlFetchApp.fetch(PLACEMENTS_ENDPOINT, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + INBOX_KEY },
      payload: JSON.stringify({ emails: batch }),
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    if (code === 200) {
      markSeen(batch);
      const reply = JSON.parse(res.getContentText());
      (reply.invites || []).forEach(function (task) { invites[task.eventId] = task; });
      (reply.cancels || []).forEach(function (c) { cancels[c.eventId] = c; });
      return;
    }
    // Only these mean "the site read this and refused it". Anything else (401, 403, 408, 425, 429, 5xx)
    // is temporary or ours to fix, so stop and try again next run without marking anything.
    if (code !== 400 && code !== 413 && code !== 422) {
      throw new Error('Section E said ' + code + ': ' + res.getContentText());
    }
    if (batch.length > 1) {
      // One bad email must not block the rest: try them one at a time.
      batch.forEach(function (e) { send([e]); });
      return;
    }
    if (!batch.length) throw new Error('Section E said ' + code + ': ' + res.getContentText());
    Logger.log('Section E rejected ' + batch[0].id + ' (' + code + '), skipping it: ' + res.getContentText());
    markSeen(batch);
  }

  let failure = null;
  try {
    batches.forEach(send);
  } catch (err) {
    failure = err; // Retried on the next run; invites already received are still created below.
  }

  const created = JSON.parse(props.getProperty('PLACEMENT_CREATED') || '{}');
  function remember(eventId, calendarEventId) {
    created[eventId] = calendarEventId;
    const keys = Object.keys(created);
    keys.slice(0, Math.max(0, keys.length - 50)).forEach(function (k) { delete created[k]; });
    try {
      props.setProperty('PLACEMENT_CREATED', JSON.stringify(created));
    } catch (err) {
      Logger.log('Could not save PLACEMENT_CREATED: ' + err);
    }
  }
  Object.keys(invites).forEach(function (eventId) {
    const task = invites[eventId];
    try {
      let calendarEventId = created[eventId];
      if (!calendarEventId) {
        // A corrected PPT updates the event students already have (the site's id for it, or the one this
        // script made for the earlier PPT but never got to confirm). Only when that event is gone is a new one made.
        const existingId = task.updateCalendarEventId || (task.replacesEventId ? created[task.replacesEventId] : null);
        const existing = existingId ? CalendarApp.getEventById(existingId) : null;
        if (existing) {
          existing.setTitle(task.title);
          existing.setTime(new Date(task.startIso), new Date(task.endIso));
          existing.setLocation(task.location || '');
          existing.setDescription(task.description);
          task.guests.forEach(function (g) { existing.addGuest(g); });
          calendarEventId = existing.getId();
          remember(eventId, calendarEventId);
        } else if (typeof Calendar !== 'undefined') {
          // Google Calendar API service: the guest list is hidden BEFORE the invites go out, so no
          // student's invite email shows who else is on the list.
          const made = Calendar.Events.insert({
            summary: task.title,
            location: task.location || '',
            description: task.description,
            start: { dateTime: task.startIso },
            end: { dateTime: task.endIso },
            attendees: task.guests.map(function (g) { return { email: g }; }),
            guestsCanSeeOtherGuests: false,
          }, 'primary', { sendUpdates: 'all' });
          // CalendarApp (used for updates and withdrawals) looks events up by their iCalUID.
          calendarEventId = made.iCalUID;
          remember(eventId, calendarEventId);
        } else {
          // Without the Google Calendar API service the invite email still lists every guest.
          Logger.log('Add the Google Calendar API under Services so invites hide the guest list.');
          const event = CalendarApp.getDefaultCalendar().createEvent(task.title, new Date(task.startIso), new Date(task.endIso), {
            location: task.location || '',
            description: task.description,
            guests: task.guests.join(','),
            sendInvites: true,
          });
          calendarEventId = event.getId();
          // Remembered straight away, so a later failure never creates a second event and a second round of invites.
          remember(eventId, calendarEventId);
          event.setGuestsCanSeeOtherGuests(false);
        }
      }
      const confirm = UrlFetchApp.fetch(INVITES_ENDPOINT, {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + INBOX_KEY },
        payload: JSON.stringify({ eventId: task.eventId, calendarEventId: calendarEventId }),
        muteHttpExceptions: true,
      });
      if (confirm.getResponseCode() !== 200) Logger.log('Invite confirm for ' + task.title + ' got ' + confirm.getResponseCode());
    } catch (err) {
      // The site offers unconfirmed invites again after 2 hours.
      Logger.log('Invite for ' + task.title + ' failed: ' + err);
    }
  });
  // Withdrawn PPTs: delete their Calendar events (guests get the cancellation), then tell the site.
  Object.keys(cancels).forEach(function (eventId) {
    const c = cancels[eventId];
    try {
      const event = CalendarApp.getEventById(c.calendarEventId);
      if (event) event.deleteEvent(); // already gone counts as done
      const confirm = UrlFetchApp.fetch(INVITES_ENDPOINT, {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + INBOX_KEY },
        payload: JSON.stringify({ eventId: c.eventId, cancelled: true }),
        muteHttpExceptions: true,
      });
      if (confirm.getResponseCode() !== 200) Logger.log('Cancel confirm for ' + c.eventId + ' got ' + confirm.getResponseCode());
    } catch (err) {
      // The site offers the cancellation again after 2 hours.
      Logger.log('Cancelling ' + c.eventId + ' failed: ' + err);
    }
  });
  if (failure) throw failure;
}

function setUp() {
  if (typeof Calendar === 'undefined') {
    Logger.log('Tip: click + next to Services, add "Google Calendar API" and save, so PPT invites hide the guest list.');
  }
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
