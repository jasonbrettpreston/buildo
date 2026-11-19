// SPEC LINK: Spec 137 §4 rule 2 (137_mcqueue.md:81) and rule 3 (:84); plan v8.1 section 1 rows "dependencies" and "refs" (.cursor/active_task.md, RR-0205).
// Test 2 of 11: dependencies resolve by number or id, tasks are created in topological order, FOLDED edges are re-pointed, DROPPED edges are removed with
// the dep-dropped label, GAP-Q5 is dropped and listed, the CO.2 self-fold imports LATER + unverified; the four ref forms resolve and an unresolvable one lands in MISSING-REFS.
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { byPlan, idNum, labelsOf, loadedFixture, tasksOf } from './helpers';

const deps = (t: { fm: Record<string, string | string[]> } | undefined) => ([] as string[]).concat(t?.fm.dependencies ?? []).map((d) => String(d).toLowerCase());
const idOf = (t: { fm: Record<string, string | string[]> } | undefined) => String(t?.fm.id ?? '').toLowerCase();

describe('plan-to-backlog dependencies (test 2)', () => {
  it('maps dependsOn by number and by id (DB.2 -> D.1 by number; DB.3 -> DB.2 by id and D.1 by number)', () => {
    const l = loadedFixture();
    expect(l.run.status, l.run.stderr).toBe(0);
    const t = (p: string) => byPlan(l.target, p);
    expect(deps(t('DB.2'))).toEqual([idOf(t('DB.1'))]);
    expect(deps(t('DB.3')).sort()).toEqual([idOf(t('DB.2')), idOf(t('DB.1'))].sort());
  });

  it('creates tasks in topological order: every dependency has a smaller task number, even when the dependent is listed first (DB.0 before D.9)', () => {
    const l = loadedFixture();
    expect(l.run.status, l.run.stderr).toBe(0);
    const all = tasksOf(l.target);
    expect(all.length).toBeGreaterThan(0);
    for (const t of all) for (const d of deps(t)) expect(idNum(d), `${idOf(t)} depends on ${d}`).toBeLessThan(idNum(idOf(t)));
    expect(deps(byPlan(l.target, 'DB.0'))).toEqual([idOf(byPlan(l.target, 'DB.9'))]);
  });

  it('re-points an edge onto a FOLDED task to the named target (DB.5 -> D.4 folded into DB.3)', () => {
    const l = loadedFixture();
    expect(l.run.status, l.run.stderr).toBe(0);
    expect(deps(byPlan(l.target, 'DB.5'))).toEqual([idOf(byPlan(l.target, 'DB.3'))]);
    expect(String(byPlan(l.target, 'DB.4')?.fm.status)).toBe('MERGED');
  });

  it('removes edges onto a DROPPED task and a dangling id (GAP-Q5) and labels the task dep-dropped; GAP-Q5 is listed in the report', () => {
    const l = loadedFixture();
    expect(l.run.status, l.run.stderr).toBe(0);
    const t = byPlan(l.target, 'DB.7');
    expect(deps(t)).toEqual([]);
    expect(labelsOf(t!)).toContain('dep-dropped');
    expect(fs.existsSync(l.report), 'import report written').toBe(true);
    expect(fs.readFileSync(l.report, 'utf8')).toMatch(/GAP-Q5/);
  });

  it('imports the CO.2 self-fold as LATER + unverified and lists it in the report', () => {
    const l = loadedFixture();
    expect(l.run.status, l.run.stderr).toBe(0);
    const t = byPlan(l.target, 'CO.2');
    expect(String(t?.fm.status)).toBe('LATER');
    expect(labelsOf(t!)).toContain('unverified');
    expect(fs.readFileSync(l.report, 'utf8')).toMatch(/CO\.2/);
  });
});

describe('plan-to-backlog refs (test 2)', () => {
  it('puts the repo-anchor ref to the raw snapshot first', () => {
    const l = loadedFixture();
    expect(l.run.status, l.run.stderr).toBe(0);
    const refs = ([] as string[]).concat(byPlan(l.target, 'REF.1')?.fm.references ?? []);
    expect(refs[0]).toBe('docs/reports/plan-import/raw/2026-11-19/sequence.json#F/REF.1');
  });

  it('resolves the four source forms to <path>#L<n> sha256=<12>: origin:path:line, origin path:lines, ~/Buildo-scratch/path:line, ROW:id', () => {
    const l = loadedFixture();
    expect(l.run.status, l.run.stderr).toBe(0);
    const refs = ([] as string[]).concat(byPlan(l.target, 'REF.1')?.fm.references ?? []).join('\n');
    expect(refs).toMatch(/docs\/a\.md#L2 sha256=[0-9a-f]{12}/);
    expect(refs).toMatch(/docs\/b\.md#L1(-2)? sha256=[0-9a-f]{12}/);
    expect(refs).toMatch(/Buildo-scratch\/s\.md#L3 sha256=[0-9a-f]{12}/);
    expect(refs).toMatch(/MB-90/);
  });

  it('puts an unresolvable ref in MISSING-REFS.md next to the report and labels the task missing-ref', () => {
    const l = loadedFixture();
    expect(l.run.status, l.run.stderr).toBe(0);
    expect(labelsOf(byPlan(l.target, 'REF.1')!)).toContain('missing-ref');
    const missing = path.join(path.dirname(l.report), 'MISSING-REFS.md');
    expect(fs.existsSync(missing), 'MISSING-REFS.md').toBe(true);
    expect(fs.readFileSync(missing, 'utf8')).toMatch(/docs\/missing\.md/);
  });
});
