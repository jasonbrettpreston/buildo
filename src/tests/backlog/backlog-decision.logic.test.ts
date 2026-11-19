// SPEC LINK: Spec 137 §4 rule 4 (137_mcqueue.md:87) and rule 10 (:109); Spec 08 §11.9; plan v8.1 section 3 gate G2 (RR-0207, RR-0212); decision-log.mjs (R-HK).
// Test 5 of 11: scripts/analysis/backlog-decision.mjs creates a Backlog decision only with a verbatim quote at a resolving cite, appends the M-246 dated note to the named tasks.
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { backlog, makeProject, mk, readDir, script } from './helpers';

function fixture() {
  const d = makeProject();
  const t1 = mk(d, 'Task one');
  const t2 = mk(d, 'Task two');
  fs.mkdirSync(path.join(d, 'cites'), { recursive: true });
  fs.writeFileSync(path.join(d, 'cites/decisions.md'), 'first line\nyes of course, the board is the home\nthird line\n');
  return { d, t1, t2 };
}
const base = (d: string, over: Record<string, string | undefined> = {}) => {
  const o: Record<string, string | undefined> = { '--title': 'RR-0300 Backlog is the home', '--date': '2026-11-19', '--quote': 'yes of course', '--cite': 'cites/decisions.md:2', '--text': 'The plan lives in Backlog.', '--tasks': undefined, ...over };
  return ['--root', d, '--cite-root', d, ...Object.entries(o).flatMap(([k, v]) => (v === undefined ? [] : [k, v]))];
};
const decisions = (d: string) => readDir(path.join(d, 'backlog/decisions'));

describe('G2 backlog-decision (test 5)', () => {
  it('creates a decision with the verbatim quote, cite and date, status accepted, and the title form RR-nnnn <topic>', () => {
    const { d, t1 } = fixture();
    const r = script('scripts/analysis/backlog-decision.mjs', base(d, { '--tasks': t1 }));
    expect(r.status, r.stderr).toBe(0);
    const ds = decisions(d);
    expect(ds).toHaveLength(1);
    const one = ds[0]!;
    expect(String(one.fm.title)).toBe('RR-0300 Backlog is the home');
    expect(one.text).toContain('yes of course');
    expect(one.text).toContain('cites/decisions.md:2');
    expect(one.text).toContain('2026-11-19');
  });

  it('appends the M-246 dated note (date, ruling id, verbatim quote) to each named task', () => {
    const { d, t1, t2 } = fixture();
    const r = script('scripts/analysis/backlog-decision.mjs', base(d, { '--tasks': `${t1},${t2}` }));
    expect(r.status, r.stderr).toBe(0);
    for (const t of [t1, t2]) {
      const v = backlog(d, ['task', t, '--plain']).stdout;
      expect(v).toMatch(/RR-0300/);
      expect(v).toMatch(/2026-11-19/);
      expect(v).toMatch(/yes of course/);
    }
  });

  it('refuses without a quote (exit 1, says quote) and creates nothing', () => {
    const { d } = fixture();
    const r = script('scripts/analysis/backlog-decision.mjs', base(d, { '--quote': undefined }));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/quote/i);
    expect(decisions(d)).toHaveLength(0);
  });

  it('refuses when the cite file does not exist', () => {
    const { d } = fixture();
    const r = script('scripts/analysis/backlog-decision.mjs', base(d, { '--cite': 'cites/nope.md:2' }));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/cite/i);
    expect(r.stderr).toMatch(/nope\.md/);
    expect(decisions(d)).toHaveLength(0);
  });

  it('refuses when the cite is present but the quote is absent at that line', () => {
    const { d } = fixture();
    const r = script('scripts/analysis/backlog-decision.mjs', base(d, { '--quote': 'no such words anywhere', '--cite': 'cites/decisions.md:2' }));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/not found at|does not contain|quote.*absent/i);
    expect(decisions(d)).toHaveLength(0);
  });

  it('refuses the same ruling entered twice as a duplicate', () => {
    const { d } = fixture();
    expect(script('scripts/analysis/backlog-decision.mjs', base(d)).status).toBe(0);
    const r2 = script('scripts/analysis/backlog-decision.mjs', base(d));
    expect(r2.status).toBe(1);
    expect(r2.stderr).toMatch(/duplicate/i);
    expect(decisions(d)).toHaveLength(1);
  });

  it('refuses --spec-amending <stem>#<id> without its decision-log entry, accepts it when docs/reports/decisions has the entry', () => {
    const { d } = fixture();
    const no = script('scripts/analysis/backlog-decision.mjs', base(d, { '--spec-amending': '137_mcqueue#R-ZZ' }));
    expect(no.status).toBe(1);
    expect(no.stderr).toMatch(/decision-log|spec-amending/i);
    expect(decisions(d)).toHaveLength(0);
    fs.mkdirSync(path.join(d, 'docs/reports/decisions'), { recursive: true });
    fs.writeFileSync(path.join(d, 'docs/reports/decisions/137_mcqueue.md'), '## R-ZZ\nentry\n');
    const yes = script('scripts/analysis/backlog-decision.mjs', base(d, { '--spec-amending': '137_mcqueue#R-ZZ' }));
    expect(yes.status, yes.stderr).toBe(0);
    expect(decisions(d)).toHaveLength(1);
  });
});
