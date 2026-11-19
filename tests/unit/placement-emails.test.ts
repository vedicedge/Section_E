import { describe, expect, it } from 'vitest';
import { matchEmailLines, planEmailSave } from '@/lib/placements/email-match';

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
  it('does not match a longer first name to a shorter roster name', () => {
    const r = matchEmailLines('Rajesh Kumar,x@imi.edu', [{ rollNo: '26PGDM010', name: 'Raj Kumar' }]);
    expect(r.matched).toEqual([]);
    expect(r.unmatched).toEqual(['Rajesh Kumar,x@imi.edu']);
  });
  it('still matches initial-only roster names', () => {
    const r = matchEmailLines('Kishore Kumar A,kishore.p26@imi.edu', [{ rollNo: '26PGDM011', name: 'Kishore Kumar A' }]);
    expect(r.matched).toEqual([{ rollNo: '26PGDM011', email: 'kishore.p26@imi.edu' }]);
  });
  it('treats ambiguous names as unmatched', () => {
    const r = matchEmailLines('Amit Shah,a@imi.edu', [
      { rollNo: '26PGDM020', name: 'Amit Shah' },
      { rollNo: '26PGDM021', name: 'Amit Shah' },
    ]);
    expect(r.matched).toEqual([]);
  });
});

describe('planEmailSave', () => {
  it('keeps the last line per roll and reports duplicates', () => {
    const p = planEmailSave([
      { rollNo: 'A', email: 'a1@imi.edu' },
      { rollNo: 'A', email: 'a2@imi.edu' },
    ]);
    expect(p.updates).toEqual([{ rollNo: 'A', email: 'a2@imi.edu' }]);
    expect(p.duplicates).toEqual(['A']);
  });
  it('saves an email shared by two rolls for neither', () => {
    const p = planEmailSave([
      { rollNo: 'A', email: 'x@imi.edu' },
      { rollNo: 'B', email: 'x@imi.edu' },
      { rollNo: 'C', email: 'c@imi.edu' },
    ]);
    expect(p.updates).toEqual([{ rollNo: 'C', email: 'c@imi.edu' }]);
    expect(p.conflicts).toEqual([{ email: 'x@imi.edu', rollNos: ['A', 'B'] }]);
  });
});
