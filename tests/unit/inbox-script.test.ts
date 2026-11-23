import { describe, expect, it } from 'vitest';
import { inboxScript } from '@/lib/homework/inbox-script';

const script = inboxScript({
  endpoint: 'https://site.test/api/homework/inbox',
  inboxKey: 'key123',
  sectionList: 'list@imi.edu',
  facultyDomain: 'imi.edu',
  placementsEndpoint: 'https://site.test/api/placements/inbox',
  invitesEndpoint: 'https://site.test/api/placements/invites',
  placementFrom: 'placement.summers@imi.edu',
});

describe('inboxScript', () => {
  it('leaves no placeholder behind', () => {
    expect(script).not.toMatch(/__[A-Z_]+__/);
  });
  it('contains the placement and calendar pieces', () => {
    for (const s of [
      'function checkPlacements',
      'CalendarApp',
      'setGuestsCanSeeOtherGuests(false)',
      'sendInvites: true',
      'PLACEMENT_SEEN',
      '"placement.summers@imi.edu"',
      '"https://site.test/api/placements/inbox"',
      '"https://site.test/api/placements/invites"',
    ]) expect(script).toContain(s);
  });
  it('parses as JavaScript', () => {
    expect(() => new Function(script)).not.toThrow();
  });
});

describe('generated script behaviour', () => {
  it('escapes the dot in the spreadsheet filter (evaluated, not just matched as text)', () => {
    const m = /return (\/[^\n]*?\/i)\.test\(a\.getName/.exec(script);
    expect(m).not.toBeNull();
    const re = new Function('return ' + m![1])() as RegExp;
    expect(re.test('list.xlsx')).toBe(true);
    expect(re.test('listaxlsx')).toBe(false);
  });
  it('stays under the site limits', () => {
    expect(script).toContain('MAX_ATTACHMENT_BYTES = 2200000');
    expect(script).toContain('MAX_ATTACHMENTS = 5');
  });
  it('hides the guest list before invites are sent when the Calendar API service is on', () => {
    const insert = script.indexOf('Calendar.Events.insert(');
    expect(insert).toBeGreaterThan(-1);
    const call = script.slice(insert, script.indexOf("{ sendUpdates: 'all' })", insert));
    expect(call).toContain('guestsCanSeeOtherGuests: false');
    expect(call).toContain('attendees:');
    expect(script).toContain('calendarEventId = made.iCalUID');
    expect(script).toContain("typeof Calendar !== 'undefined'");
    // The script must still parse as JavaScript.
    expect(() => new Function(script)).not.toThrow();
  });
  it('checks the sender per message, dedupes invites and keeps properties small', () => {
    for (const s of ['.trim().toLowerCase() !== sender', 'slice(-300)', 'CalendarApp.getEventById', 'deleteEvent()', 'cancelled: true', 'PLACEMENT_CREATED', 'slice(-300)', '(filename:xlsx OR filename:xls)', 'finally']) {
      expect(script).toContain(s);
    }
  });
  it('treats only 400, 413 and 422 as poison, never 429', () => {
    expect(script).toContain('code !== 400 && code !== 413 && code !== 422');
    expect(script).not.toContain('code >= 500');
  });
});
