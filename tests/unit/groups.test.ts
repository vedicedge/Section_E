import { describe, expect, it } from 'vitest';
import { parseGroups, rowsFromText } from '../../src/lib/groups/parse';

const summary = (text: string) =>
  parseGroups(rowsFromText(text)).groups.map((g) => `${g.name}${g.topic ? ` [${g.topic}]` : ''}: ${g.rolls.join(' ')}`);

describe('parseGroups', () => {
  it('reads one row per student with Group and Topic columns, repeating blank groups', () => {
    const text = ['Sr\tRoll No\tName\tGroup No\tTopic', '1\t26PGDM101\tA\t1\tTata Steel', '2\t26pgdm102\tB\t\t', '3\t26PGDM103\tC\t2\tInfosys'].join('\n');
    expect(summary(text)).toEqual(['Group 1 [Tata Steel]: 26PGDM101 26PGDM102', 'Group 2 [Infosys]: 26PGDM103']);
  });

  it('reads one row per group with roll numbers across', () => {
    const text = ['Group 1, 26PGDM101, 26PGDM102', 'Group 2, 26PGDM103, 26 PGDM 104'].join('\n');
    expect(summary(text)).toEqual(['Group 1: 26PGDM101 26PGDM102', 'Group 2: 26PGDM103 26PGDM104']);
  });

  it('reads "Group N" headings with members underneath, including a topic after a dash', () => {
    const text = ['CF project groups', 'Group 10 – Reliance', 'Riya Kapoor 26PGDM101', 'Kabir 26PGDM102', '', 'Group 2', '26PGDM103'].join('\n');
    const parsed = parseGroups(rowsFromText(text));
    expect(parsed.groups.map((g) => `${g.name}${g.topic ? ` [${g.topic}]` : ''}: ${g.rolls.join(' ')}`)).toEqual([
      'Group 2: 26PGDM103',
      'Group 10 [Reliance]: 26PGDM101 26PGDM102',
    ]);
    expect(parsed.ignoredRows).toBe(1); // the title line
  });

  it('keeps a roll number in its first group only and reports it', () => {
    const parsed = parseGroups(rowsFromText(['Roll\tTeam', '26PGDM101\tA', '26PGDM101\tB', '26PGDM102\tB'].join('\n')));
    expect(parsed.groups.map((g) => [g.name, g.rolls])).toEqual([
      ['A', ['26PGDM101']],
      ['B', ['26PGDM102']],
    ]);
    expect(parsed.duplicates).toEqual(['26PGDM101']);
  });

  it('reads a topics-only list (Group | Topic) for some groups', () => {
    const parsed = parseGroups(rowsFromText(['Group\tTopic', '1\tConflict in teams', 'Group-3\tPower and politics', '4\t'].join('\n')));
    expect(parsed.groups).toEqual([]);
    expect(parsed.topics).toEqual([
      { name: 'Group 1', topic: 'Conflict in teams' },
      { name: 'Group 3', topic: 'Power and politics' },
    ]);
  });

  it('reads topics without a header row too', () => {
    const parsed = parseGroups(rowsFromText(['Group 2 – Motivation at work', 'G5: Leadership styles'].join('\n')));
    expect(parsed.topics).toEqual([
      { name: 'Group 2', topic: 'Motivation at work' },
      { name: 'Group 5', topic: 'Leadership styles' },
    ]);
  });

  it('finds nothing in text without roll numbers', () => {
    expect(parseGroups(rowsFromText('hello\nworld')).groups).toEqual([]);
  });
});
