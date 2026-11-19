// SPEC LINK: Spec 137 §4 rule 13 dated note 2026-11-19 (137_mcqueue.md, RR-0232, RR-0233): an open decision reaches the operator as a task in status OPERATOR
// carrying two lines, `Grounded:` and `Recommendation:`; scripts/analysis/backlog-next.mjs lists OPERATOR tasks and flags the ones lacking either line.
// The section is advisory: the tool's exit code stays 0. A line counts only at the start of a description line (a quotation inside another line is not a line).
import { describe, expect, it } from 'vitest';
import { makeProject, mk, script } from './helpers';

const HEAD = 'OPERATOR (waiting on the operator)';
const operatorSection = (out: string) => out.split(HEAD)[1] ?? '';
const rowOf = (sec: string, id: string) => sec.split('\n').find((l) => new RegExp(`(?<![\\w-])${id}(?!\\d)`).test(l)) ?? '';
const next = (d: string) => script('scripts/analysis/backlog-next.mjs', ['--root', d, '--today', '2026-11-20']);

describe('backlog-next OPERATOR section (task-306)', () => {
  it('lists an OPERATOR task with both lines as ok', () => {
    const d = makeProject();
    const id = mk(d, 'Decision with both lines', ['-s', 'OPERATOR', '-d', 'Question text\nGrounded: yes, cite file:1\nRecommendation: option a UNVERIFIED']);
    const r = next(d);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(HEAD);
    const row = rowOf(operatorSection(r.stdout), id);
    expect(row).toContain('ok');
    expect(row).not.toContain('MISSING');
  });

  it('flags an OPERATOR task that lacks a line, naming the missing line', () => {
    const d = makeProject();
    const noRec = mk(d, 'Lacks Recommendation', ['-s', 'OPERATOR', '-d', 'Grounded: yes']);
    const noGrd = mk(d, 'Lacks Grounded', ['-s', 'OPERATOR', '-d', 'Recommendation: a']);
    const r = next(d);
    expect(r.status, r.stderr).toBe(0);
    const sec = operatorSection(r.stdout);
    expect(rowOf(sec, noRec)).toContain('MISSING Recommendation:');
    expect(rowOf(sec, noGrd)).toContain('MISSING Grounded:');
  });

  it('does not count a line that only appears inside a quotation, and ignores non-OPERATOR tasks', () => {
    const d = makeProject();
    const quoted = mk(d, 'Quoted only', ['-s', 'OPERATOR', '-d', 'Grounded: yes, the source says "Recommendation: (a)" here']);
    const later = mk(d, 'A LATER task', ['-s', 'LATER', '-d', 'no lines']);
    const r = next(d);
    expect(r.status, r.stderr).toBe(0);
    const sec = operatorSection(r.stdout);
    expect(rowOf(sec, quoted)).toContain('MISSING Recommendation:');
    expect(rowOf(sec, later)).toBe('');
  });
});
