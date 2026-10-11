import { describe, expect, it } from 'vitest';
import { matchSubject } from '@/lib/timetable/match';

const subjects = [
  { code: 'SM', title: 'Strategic Management', aliases: [] },
  { code: 'MM II', title: 'Marketing Management II', aliases: ['Marketing-2'] },
  { code: 'OM', title: 'Operations Management', aliases: [] },
  { code: 'TOD', title: 'Team and Organizational Dynamics', aliases: [] },
];

describe('matchSubject', () => {
  it('matches codes, titles and aliases', () => {
    expect(matchSubject('SM (RKS) R-101', subjects)?.code).toBe('SM');
    expect(matchSubject('MM-II\nProf. X', subjects)?.code).toBe('MM II');
    expect(matchSubject('MM 2', subjects)?.code).toBe('MM II');
    expect(matchSubject('Marketing-2 lab', subjects)?.code).toBe('MM II');
    expect(matchSubject('Operations Management — Room 4', subjects)?.code).toBe('OM');
    expect(matchSubject('Team & Organizational Dynamics', subjects)?.code).toBe('TOD');
    expect(matchSubject('TOD', subjects)?.code).toBe('TOD');
  });
  it('does not match inside other words', () => {
    expect(matchSubject('SMART session', subjects)).toBeNull();
    expect(matchSubject('Guest lecture', subjects)).toBeNull();
  });
});
