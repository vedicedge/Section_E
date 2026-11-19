import { describe, expect, it } from 'vitest';
import { matchEmailLines } from '@/lib/placements/email-match';

const roster = [
  { rollNo: '26PGDM001', name: 'Aarushi Nayyar' },
  { rollNo: '26PGDM256', name: 'Agrim Sharma' },
  { rollNo: '26PGDM300', name: 'Himanshu Yadav' },
];

describe('matchEmailLines', () => {
  it('matches by name or by roll, and ignores the header', () => {
    const r = matchEmailLines('Name,IMI Email Id\nAarushi Nayyar,aarushi.p26@imi.edu\n26PGDM256 agrim.p26@imi.edu', roster);
    expect(r.matched).toEqual([
      { rollNo: '26PGDM001', email: 'aarushi.p26@imi.edu' },
      { rollNo: '26PGDM256', email: 'agrim.p26@imi.edu' },
    ]);
    expect(r.unmatched).toEqual([]);
  });
  it('reports unknown names and junk as unmatched', () => {
    const r = matchEmailLines('Nobody Here,x@imi.edu\nhello there', roster);
    expect(r.matched).toEqual([]);
    expect(r.unmatched).toEqual(['Nobody Here,x@imi.edu', 'hello there']);
  });
  it('repairs a comma typo in the email', () => {
    const r = matchEmailLines('himanshuyadav,p26@imi.edu', roster);
    expect(r.matched).toEqual([{ rollNo: '26PGDM300', email: 'himanshuyadav.p26@imi.edu' }]);
  });
  it('lets a roll in the line win over the name', () => {
    const r = matchEmailLines('Aarushi Nayyar 26PGDM256 a@imi.edu', roster);
    expect(r.matched[0].rollNo).toBe('26PGDM256');
  });
});
