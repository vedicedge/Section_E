/**
 * The Google Apps Script the admin pastes into script.google.com while signed in to their college
 * mailbox. Every 30 minutes it sends new emails from faculty to the section's mailing list to
 * /api/homework/inbox. The site keeps only the deadline sentences, as suggestions for the admin.
 */

const TEMPLATE = `/**
 * Section E — homework inbox.
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
}

export function inboxScript({ endpoint, inboxKey, sectionList, facultyDomain }: InboxScriptOptions): string {
  const values: Record<string, string> = {
    ENDPOINT: endpoint,
    INBOX_KEY: inboxKey,
    SECTION_LIST: sectionList,
    FACULTY_DOMAIN: facultyDomain,
  };
  // One pass, so a value that happens to contain another placeholder is never substituted twice.
  return TEMPLATE.replace(/__(ENDPOINT|INBOX_KEY|SECTION_LIST|FACULTY_DOMAIN)__/g, (_, name: string) => JSON.stringify(values[name]));
}
