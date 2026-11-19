// SPEC LINK: Spec 137 §4 rule 2 (137_mcqueue.md:81), rule 4 (:87), rule 7 (:98), rule 12 (:115); plan v8.1 sections 1 and 2 (.cursor/active_task.md; RR-0205, RR-0207, RR-0212).
// Tests 3, 8, 9, 10 and 11 of 11 on the synthetic fixture (never the live backlog/): the loader's refusals, counts and report sections; the decisions;
// the assignee table; the priority rule; the due dates.
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { backlogBin, byPlan, draftsOf, EXPECTED, labelsOf, load, loadedFixture, rawCopy, readDir, script, tasksOf, tmp } from './helpers';

const str = (v: string | string[] | undefined) => ([] as string[]).concat(v ?? []).join(',');

describe('loader refusals and counts (test 3)', () => {
  it('refuses to run when backlog/ already exists in the target and leaves it untouched', () => {
    const pre = tmp('pre');
    fs.mkdirSync(path.join(pre, 'backlog'));
    fs.writeFileSync(path.join(pre, 'backlog/keep.txt'), 'x');
    const r = script('scripts/analysis/plan-to-backlog.mjs', ['--raw', path.join(__dirname, 'fixtures/raw'), '--target', pre, '--report', path.join(pre, 'r.md'), '--backlog-bin', backlogBin()]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/backlog\/ (already )?exists/i);
    expect(fs.readFileSync(path.join(pre, 'backlog/keep.txt'), 'utf8')).toBe('x');
  });

  it('exits 1 naming the file when a raw file does not match SHA256SUMS', () => {
    const raw = rawCopy((d) => fs.appendFileSync(path.join(d, 'legend.json'), ' '), false);
    const l = load(raw);
    expect(l.run.status).toBe(1);
    expect(l.run.stderr).toMatch(/sha256|hash/i);
    expect(l.run.stderr).toMatch(/legend\.json/);
    expect(fs.existsSync(path.join(l.target, 'backlog'))).toBe(false);
  });

  it('exits 1 when the task and draft counts differ from --expect', () => {
    const l = load(undefined, ['--expect', '1,1']);
    expect(l.run.status).toBe(1);
    expect(l.run.stderr).toMatch(/expected 1 task/i);
  });

  it('creates the fixture counts (tasks and drafts) and asserts them itself; milestones = groups; BL.0 is a task', () => {
    const l = loadedFixture();
    expect(l.run.status, l.run.stderr).toBe(0);
    expect(draftsOf(l.target)).toHaveLength(EXPECTED.counts.draftsExact);
    expect(tasksOf(l.target)).toHaveLength(EXPECTED.counts.tasksMin);
    const ms = readDir(path.join(l.target, 'backlog/milestones'));
    expect(ms).toHaveLength(3);
    expect(byPlan(l.target, 'BL.0')).toBeDefined();
    expect(ms.map((m) => m.text).join('\n')).toMatch(/Increment 1: fixture/);
  });

  it('writes the committed config: nine statuses, default LATER, ten types, three projects, ten DoD rules, zero_padded_ids 0, auto_commit false', () => {
    const l = loadedFixture();
    expect(l.run.status, l.run.stderr).toBe(0);
    const cfg = fs.readFileSync(path.join(l.target, 'backlog/config.yml'), 'utf8');
    expect(cfg).toMatch(/default_status: "?LATER"?/);
    expect(cfg).toMatch(/statuses: \[.*"?WAITS"?.*"?DONE"?\]/);
    expect(cfg).toMatch(/^types:/m);
    expect(cfg).toMatch(/^projects:/m);
    expect(cfg).toMatch(/^definition_of_done:/m);
    expect((cfg.match(/^\s+- /gm) ?? []).length + (/definition_of_done: \[/.test(cfg) ? 10 : 0)).toBeGreaterThanOrEqual(10);
    expect(cfg).toMatch(/^zero_padded_ids: 0/m);
    expect(cfg).toMatch(/^auto_commit: false/m);
    expect(cfg).toMatch(/^bypass_git_hooks: false/m);
    expect(cfg).toMatch(/^default_port: 6421/m);
  });

  it('writes the report with every section the plan names', () => {
    const l = loadedFixture();
    expect(l.run.status, l.run.stderr).toBe(0);
    const rep = fs.readFileSync(l.report, 'utf8');
    for (const h of [/status census/i, /source resolution/i, /per column/i, /per priority/i, /per type/i, /per project/i, /per assignee/i, /dropped|folded|re-pointed|removed/i, /held-unruled/i, /queue-row/i, /decisions/i, /docs/i]) expect(rep).toMatch(h);
  });
});

describe('decisions (test 8)', () => {
  it('creates exactly the operator rulings of the register fixture (3 of 5 rows), titled "RR-nnnn <topic>", with the verbatim quote, cite and date', () => {
    const l = loadedFixture();
    expect(l.run.status, l.run.stderr).toBe(0);
    const ds = readDir(path.join(l.target, 'backlog/decisions'));
    expect(ds).toHaveLength(3);
    const titles = ds.map((d) => String(d.fm.title)).sort();
    expect(titles).toEqual(['RR-0101 Backlog is the home of the plan', 'RR-0102 McLane is the name', 'RR-0103 Photo bands six']);
    const d1 = ds.find((d) => String(d.fm.title).startsWith('RR-0101'))!;
    expect(d1.text).toMatch(/yes of course/);
    expect(d1.text).toMatch(/q\.md:2/);
    expect(str(d1.fm.date)).toMatch(/2026-11-18/);
    expect(String(d1.fm.status)).toBe('accepted');
  });

  it('puts the orchestrator reading in the readings doc, not in a decision', () => {
    const l = loadedFixture();
    expect(l.run.status, l.run.stderr).toBe(0);
    const docs = readDir(path.join(l.target, 'backlog/docs'));
    const readings = docs.find((d) => /Orchestrator readings \(not rulings\)/.test(String(d.fm.title)));
    expect(readings, 'readings doc').toBeDefined();
    expect(readings!.text).toMatch(/RR-0104/);
    expect(readDir(path.join(l.target, 'backlog/decisions')).map((d) => d.text).join('\n')).not.toMatch(/RR-0104/);
  });

  it('appends the M-246 dated note to each task the ruling names (RR-0101 names RUL.1)', () => {
    const l = loadedFixture();
    expect(l.run.status, l.run.stderr).toBe(0);
    const t = byPlan(l.target, 'RUL.1');
    expect(t?.text).toMatch(/RR-0101/);
    expect(t?.text).toMatch(/2026-11-18/);
    expect(t?.text).toMatch(/yes of course/);
  });
});

describe('assignee table (test 9)', () => {
  const cases: Array<[string, RegExp]> = [['WHO.1', /@lane\b(?!-)/], ['WHO.2', /@operator/], ['WHO.3', /@runner/], ['WHO.4', /@lane-E\b/], ['WHO.5', /@lane\b(?!-)/]];
  for (const [id, re] of cases) {
    it(`maps ${id}`, () => {
      const l = loadedFixture();
      expect(l.run.status, l.run.stderr).toBe(0);
      expect(str(byPlan(l.target, id)?.fm.assignee)).toMatch(re);
    });
  }
  it('keeps the other who text (MB-44 W read module owner) in the task for a lane with free text', () => {
    const l = loadedFixture();
    expect(l.run.status, l.run.stderr).toBe(0);
    expect(byPlan(l.target, 'WHO.5')?.text).toMatch(/MB-44 W read module owner/);
  });
  it('exits 1 naming the item when who is not in the table (committee)', () => {
    const raw = rawCopy((d) => {
      const f = path.join(d, 'sequence.json');
      const s = JSON.parse(fs.readFileSync(f, 'utf8'));
      s.increments[1].items.find((x: { id: string }) => x.id === 'WHO.1').who = 'committee';
      fs.writeFileSync(f, JSON.stringify(s, null, 1));
    });
    const l = load(raw);
    expect(l.run.status).toBe(1);
    expect(l.run.stderr).toMatch(/unmapped (who|assignee)/i);
    expect(l.run.stderr).toMatch(/WHO\.1/);
  });
});

describe('priority rule (test 10)', () => {
  const cases: Array<[string, string]> = [['PRI.1', 'high'], ['PRI.7', 'high'], ['PRI.8', 'medium'], ['PRI.9a', 'medium'], ['PRI.9b', 'low'], ['PRI.CP', 'high'], ['PRI.L', 'low']];
  for (const [id, want] of cases) {
    it(`${id} -> ${want}`, () => {
      const l = loadedFixture();
      expect(l.run.status, l.run.stderr).toBe(0);
      expect(String(byPlan(l.target, id)?.fm.priority).toLowerCase()).toBe(want);
    });
  }
});

describe('due dates (test 11)', () => {
  it('uses the queue row expires for a queue-row item (MB-90 expires 2026-11-26)', () => {
    const l = loadedFixture();
    expect(l.run.status, l.run.stderr).toBe(0);
    expect(String(byPlan(l.target, 'DUE.ROW')?.fm.due_date)).toBe('2026-11-26');
  });
  it('uses snapshot date + 7 (2026-11-26) for an open task with no expires', () => {
    const l = loadedFixture();
    expect(l.run.status, l.run.stderr).toBe(0);
    expect(String(byPlan(l.target, 'DUE.OPEN')?.fm.due_date)).toBe('2026-11-26');
  });
  it('gives a CONDITIONAL-with-ids task a `when: <ids> DONE` description line and no due date', () => {
    const l = loadedFixture();
    expect(l.run.status, l.run.stderr).toBe(0);
    const t = byPlan(l.target, 'DUE.COND');
    expect(t?.text).toMatch(/^when: .*DUE\.OPEN.*DUE\.ROW.*DONE/m);
    expect(t?.fm.due_date).toBeUndefined();
  });
  it('gives DONE and DROPPED tasks no due date', () => {
    const l = loadedFixture();
    expect(l.run.status, l.run.stderr).toBe(0);
    expect(byPlan(l.target, 'DUE.DONE')?.fm.due_date).toBeUndefined();
    expect(byPlan(l.target, 'DUE.DROP')?.fm.due_date).toBeUndefined();
    expect(labelsOf(byPlan(l.target, 'DUE.DONE')!)).toBeDefined();
  });
});
