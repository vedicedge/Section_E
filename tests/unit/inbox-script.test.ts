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

describe('generated script regex', () => {
  it('keeps the escaped dot in the spreadsheet filter', () => {
    expect(script).toContain('/\.xlsx?$/i');
  });
});
