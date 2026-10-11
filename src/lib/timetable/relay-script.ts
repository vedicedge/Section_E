/**
 * The Google Apps Script the admin pastes into script.google.com. It runs in the admin's own Google
 * account, so it can read a timetable that is restricted to specific email IDs, and pushes the
 * workbook to /api/timetable/ingest whenever the sheet changes.
 */

const TEMPLATE = `/**
 * Section E — timetable relay.
 * Runs inside YOUR Google account (the one that can open the restricted timetable) and sends the
 * workbook to the Section E website whenever it changes. Set up once: choose "setUp" in the
 * toolbar, press Run and allow access. After that it checks every 10 minutes on its own.
 */
const FILE_ID = __FILE_ID__;
const ENDPOINT = __ENDPOINT__;
const RELAY_KEY = __RELAY_KEY__;

function syncTimetable() {
  const file = DriveApp.getFileById(FILE_ID);
  const meta = { fileName: file.getName(), modifiedAt: file.getLastUpdated().toISOString() };
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + RELAY_KEY },
    muteHttpExceptions: true,
  };
  // 1. Tell the site which version of the sheet we have; it replies whether it needs the file.
  let res = UrlFetchApp.fetch(ENDPOINT, Object.assign({}, options, { payload: JSON.stringify(meta) }));
  if (res.getResponseCode() !== 200) throw new Error('Section E said ' + res.getResponseCode() + ': ' + res.getContentText());
  if (!JSON.parse(res.getContentText()).needFile) return;
  // 2. Send the workbook (a native Google Sheet is exported as .xlsx first).
  const blob = file.getMimeType() === MimeType.GOOGLE_SHEETS
    ? UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + FILE_ID + '/export?format=xlsx', {
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      }).getBlob()
    : file.getBlob();
  meta.data = Utilities.base64Encode(blob.getBytes());
  res = UrlFetchApp.fetch(ENDPOINT, Object.assign({}, options, { payload: JSON.stringify(meta) }));
  if (res.getResponseCode() !== 200) throw new Error('Section E rejected the timetable: ' + res.getContentText());
}

function setUp() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('syncTimetable').timeBased().everyMinutes(10).create();
  syncTimetable();
}
`;

export function relayScript({ endpoint, relayKey, fileId }: { endpoint: string; relayKey: string; fileId: string }): string {
  const values: Record<string, string> = { FILE_ID: fileId, ENDPOINT: endpoint, RELAY_KEY: relayKey };
  // One pass, so a value that happens to contain another placeholder is never substituted twice.
  return TEMPLATE.replace(/__(FILE_ID|ENDPOINT|RELAY_KEY)__/g, (_, name: string) => JSON.stringify(values[name]));
}
