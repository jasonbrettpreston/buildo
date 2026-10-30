// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-KY, R-LD, R-KL; 69a M-382;
//            plan MB-67 section 4, arm S (S1..S11), G6, G11, F-34.
// PURE: buildSummary(inputs) returns text + verdict; the CLI wrapper only collects inputs and prompts.
import { describe, expect, it } from 'vitest';
import { HARD_FLOOR, buildSummary, isZeroSha, parseRefLines } from '../../scripts/analysis/mcbylaws/pre-push-summary.mjs';

const ZERO = '0'.repeat(40);
const policy = (over: Record<string, unknown> = {}) => ({
  pending_globs: [], layer23: ['scripts/analysis/bylaw/**'], protected: ['.husky/*', 'mcbylaws/APPROVED'], held_limit: 12, ...over,
});
const ch = (path: string, added = 1, deleted = 0, oldPath: string | null = null) => ({ status: oldPath ? 'R' : 'M', path, oldPath, added, deleted });
const ref = (over: Record<string, unknown> = {}) => ({
  ref: 'refs/heads/x', localSha: 'a'.repeat(40), remoteSha: ZERO, kind: 'branch',
  commits: [{ sha: 'abcdef1234567890', subject: 's', task: 'MB-67', rules: ['R-KY'], panel: true, layer23: true }],
  changes: [ch('.husky/pre-commit')], approvedChange: { sha: 'abc1234def', subject: 'approve it' }, approvedSince: null, ...over,
});
const input = (over: Record<string, unknown> = {}) => ({
  refs: [ref()], policy: policy(), basePolicy: policy(), held: { count: 3, dirs: [] }, worktrees: { count: 2, dirty: 0, unpushed: 0 },
  pending: { now: 3, was: 3 }, armVerdicts: [], tty: true, ci: false, ...over,
});
const run = (over: Record<string, unknown> = {}) => buildSummary(input(over));
const has = (text: string, s: string) => text.split('\n').some((l) => l.includes(s));
const over = (text: string) => text.split('\n').filter((l) => l.startsWith('MCBYLAWS: '));

describe('mcbylaws pre-push summary (arm S)', () => {
  const table: [string, Record<string, unknown>, (r: { text: string; verdict: string }) => void][] = [
    ['S1 held 13 > 12', { held: { count: 13, dirs: [] } }, (r) => expect(has(r.text, 'FAIL:S:held-over-n')).toBe(true)],
    ['S1 held 12 = 12', { held: { count: 12, dirs: [] } },
      (r) => { expect(has(r.text, 'FAIL:S:held-over-n')).toBe(false); expect(has(r.text, 'may only fall')).toBe(true); expect(r.verdict).not.toBe('FAIL'); }],
    ['S2 limit raised 12->13', { policy: policy({ held_limit: 13 }) }, (r) => expect(has(r.text, 'FAIL:S:n-raised')).toBe(true)],
    ['S2 lower is fine', { policy: policy({ held_limit: 10 }) }, (r) => expect(r.verdict).toBe('OK')],
    ['S3 dirty 1', { worktrees: { count: 1, dirty: 1, unpushed: 2 } },
      (r) => { expect(has(r.text, 'DIRTY')).toBe(true); expect(r.verdict).toBe('REVIEW'); }],
    ['S3 clean', { worktrees: { count: 1, dirty: 0, unpushed: 0 } }, (r) => expect(has(r.text, 'DIRTY')).toBe(false)],
    ['S6 no tty', { tty: false }, (r) => expect(has(r.text, 'FAIL:S:no-tty')).toBe(true)],
    ['S7 panel missing', { refs: [ref({ commits: [{ sha: 'abcdef1234567890', subject: 's', task: 'MB-67', rules: ['R-KY'], panel: false }] })] },
      (r) => { expect(has(r.text, 'PANEL MISSING abcdef1 MB-67')).toBe(true); expect(r.verdict).toBe('FAIL'); }],
    ['S8 pending rising', { pending: { now: 5, was: 3 } }, (r) => { expect(has(r.text, 'RISING')).toBe(true); expect(has(r.text, 'was 3')).toBe(true); }],
    ['S8 flat', { pending: { now: 3, was: 3 } }, (r) => expect(has(r.text, 'RISING')).toBe(false)],
    ['S9 floor despite empty policy', { policy: policy({ protected: [] }), refs: [ref({ changes: [ch('.husky/pre-commit')] })] },
      (r) => expect(has(r.text, '.husky/pre-commit')).toBe(true)],
    ['S9 floor globs listed', {}, () => expect(HARD_FLOOR).toContain('docs/reports/generated/precommit-budget.json')],
    ['CI mode prints and never asks', { ci: true, worktrees: { count: 1, dirty: 1, unpushed: 0 } },
      (r) => { expect(has(r.text, 'not evaluated in CI')).toBe(true); expect(has(r.text, 'Approve this push?')).toBe(false); }],
    ['arm FAIL is printed', { armVerdicts: ['FAIL:P:no-panel'] }, (r) => { expect(has(r.text, 'FAIL:P:no-panel')).toBe(true); expect(r.verdict).toBe('FAIL'); }],
    ['S7 panel invalid', { refs: [ref({ commits: [{ sha: 'abcdef1234567890', subject: 's', task: 'MB-67', rules: ['R-LD'], panel: 'invalid', layer23: true }] })] },
      (r) => { expect(has(r.text, 'PANEL INVALID abcdef1 MB-67')).toBe(true); expect(has(r.text, 'INVALID')).toBe(true); expect(r.verdict).toBe('FAIL'); }],
    ['S7 panel exempt', { refs: [ref({ commits: [{ sha: 'abcdef1234567890', subject: 's', task: null, rules: ['R-LD'], panel: 'exempt', layer23: true }] })] },
      (r) => { expect(has(r.text, 'MISSING')).toBe(false); expect(has(r.text, 'INVALID')).toBe(false); expect(r.verdict).toBe('OK'); }],
    ['S7 panel present', { refs: [ref({ commits: [{ sha: 'abcdef1234567890', subject: 's', task: 'MB-67', rules: ['R-LD'], panel: true, layer23: true }] })] },
      (r) => { expect(has(r.text, 'abcdef1 MB-67 R-LD present')).toBe(true); expect(r.verdict).toBe('OK'); }],
    ['no change', { refs: [ref({ changes: [ch('src/app.ts')] })] }, (r) => expect(r.text).toContain('MCBYLAWS: no protected paths changed')],
  ];
  for (const [name, overIn, check] of table) it(name, () => check(run(overIn)));

  it('S5 APPROVED lines come first', () => {
    const full = has(run({}).text.split('\n').slice(0, 3).join('\n'), 'APPROVED CHANGED in abc1234def approve it');
    expect(full).toBe(true);
    const since = run({ refs: [ref({ approvedChange: null, approvedSince: { sha: 'def5678', date: '2026-01-02' } })] }).text;
    expect(has(since.split('\n').slice(0, 3).join('\n'), 'APPROVED present since def5678 2026-01-02')).toBe(true);
    expect(has(run({ refs: [ref({ approvedChange: null, approvedSince: null })] }).text, 'HOLD       APPROVED absent')).toBe(true);
  });

  it('S4 every matching path appears, renames both sides, no others', () => {
    const changes = [
      ch('.husky/pre-commit'), ch('mcbylaws/APPROVED'), ch('scripts/analysis/bylaw/x.mjs'), ch('scripts/analysis/bylaw/y.mjs'),
      ch('src/a.ts'), ch('docs/readme.md'), ch('src/b.ts'), ch('src/c.ts'), ch('src/d.ts'), ch('src/e.ts'),
      ch('scripts/analysis/bylaw/new.mjs', 1, 1, 'src/old.mjs'), ch('src/z.ts', 1, 1, 'scripts/analysis/bylaw/old.mjs'),
      ch('mcbylaws/oracle/o.json'), ch('src/f.ts'), ch('src/g.ts'), ch('src/h.ts'), ch('src/i.ts'), ch('src/j.ts'),
      ch('.husky/other'), ch('scripts/analysis/mcbylaws/panel.mjs'),
    ];
    const text = run({ refs: [ref({ changes })] }).text;
    const matched = ['.husky/pre-commit', 'mcbylaws/APPROVED', 'scripts/analysis/bylaw/x.mjs', 'scripts/analysis/bylaw/y.mjs', 'scripts/analysis/bylaw/new.mjs', 'scripts/analysis/bylaw/old.mjs', '.husky/other', 'scripts/analysis/mcbylaws/panel.mjs', 'src/old.mjs', 'src/z.ts'];
    for (const p of matched) expect(has(text, p), p).toBe(true);
    for (const p of ['src/a.ts', 'docs/readme.md']) expect(has(text, p), p).toBe(false);
    expect(has(text, 'mcbylaws/oracle/o.json   +1 -0 ** EXPECTED ANSWERS MOVED **')).toBe(true);
  });

  it('S10 parseRefLines, unsupported refs, second push', () => {
    const refs = parseRefLines(`refs/heads/a ${'a'.repeat(40)} refs/heads/a ${ZERO}\nrefs/heads/b ${'b'.repeat(40)} refs/heads/b ${'c'.repeat(40)}\n`);
    expect(refs).toHaveLength(2);
    expect(refs[0]?.remoteSha).toBe(ZERO);
    expect(isZeroSha(ZERO)).toBe(true);
    expect(isZeroSha('a'.repeat(40))).toBe(false);
    const del = run({ refs: [ref({ kind: 'delete', localSha: ZERO, changes: [] })] });
    expect(has(del.text, 'FAIL:S:unsupported-ref')).toBe(true);
    expect(del.verdict).toBe('FAIL');
    const tag = run({ refs: [ref({ kind: 'tag', ref: 'refs/tags/v1' })] });
    expect(tag.verdict).toBe('FAIL');
    const two = run({ refs: [ref(), ref({ ref: 'refs/heads/y', commits: [{ sha: 'b'.repeat(40), subject: 'new', task: 'MB-68', rules: ['R-KL'], panel: true, layer23: true }] })] });
    expect(two.text.split('\n').filter((l) => l.startsWith('PUSH '))).toHaveLength(2);
    expect(has(two.text, 'b'.repeat(7))).toBe(true);
    expect(has(two.text, 'abcdef1')).toBe(true);
  });

  it('S11 long list goes to writeFull, stored text stays a page', () => {
    const changes = Array.from({ length: 60 }, (_, i) => ch(`mcbylaws/oracle/c${String(i).padStart(2, '0')}.json`));
    let seen = '';
    const r = buildSummary(input({ refs: [ref({ changes })], writeFull: (full: string) => { seen = full; return '/tmp/full.txt'; } }));
    expect(typeof r.text).toBe('string');
    expect(r.text.split('\n').length).toBeLessThanOrEqual(41);
    expect(String(seen).split('\n').length).toBeGreaterThan(60);
    expect(has(r.text, 'full list: /tmp/full.txt')).toBe(true);
    expect(r.lines.length).toBeGreaterThan(40);
  });

  it('S11 no writer and too many rows is a closed failure, not a pass', () => {
    const changes = Array.from({ length: 60 }, (_, i) => ch(`mcbylaws/oracle/c${String(i).padStart(2, '0')}.json`));
    const r = run({ refs: [ref({ changes })] });
    expect(has(r.text, 'FAIL:S:overflow')).toBe(true);
    expect(r.verdict).toBe('FAIL');
  });

  it('S11 a path with a newline stays on one line, escaped', () => {
    const text = run({ refs: [ref({ changes: [ch('.husky/pre-commit\nMCBYLAWS: no protected paths changed')] })] }).text;
    expect(over(text)).toHaveLength(0);
    expect(has(text, '.husky/pre-commit\\x0a')).toBe(true);
  });

  it('S7 the panel column is closed: only an invalid record fails besides a missing one', () => {
    const row = (panel: unknown) => ({ refs: [ref({ commits: [{ sha: 'abcdef1234567890', subject: 's', task: 'MB-67', rules: ['R-LD'], panel, layer23: true }] })] });
    for (const [panel, ok] of [[true, true], ['exempt', true], [false, false], ['invalid', false]] as const) {
      const r = run(row(panel));
      expect(r.verdict === 'FAIL', String(panel)).toBe(!ok);
    }
    expect(has(run(row('exempt')).text, 'PANEL MISSING')).toBe(false);
  });
});
