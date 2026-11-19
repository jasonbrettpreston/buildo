// SPEC LINK: Spec 137 §4 rule 2 (137_mcqueue.md:81) and rule 3 (:84); Spec 137 §3 status words (137:59-71); plan v8.1 section 1 "status" row
// (.cursor/active_task.md, RR-0205, RR-0212). Test 1 of 11: the loader's status table is exhaustive over the 36 first words of the real
// sequence.json (the census fixture), an unknown word exits 1, and the precedence is closed typed word > evidence > typed first word.
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { byPlan, draftsOf, EXPECTED, labelsOf, load, loadedFixture, rawCopy, tasksOf } from './helpers';

// BL-R3 note: byPlan() and draftsOf() read the files separately, so identity (includes) never matched; drafts are compared by file name.
const NINE = ['LATER', 'WAITS', 'RUNNING', 'BUILT', 'OPERATOR', 'MERGED', 'FROZEN', 'DROPPED', 'DONE'];

describe('plan-to-backlog status table (test 1)', () => {
  it('loads the census fixture (36 first words) with exit 0 and no unknown word', () => {
    const l = loadedFixture();
    expect(l.run.status, l.run.stderr).toBe(0);
    expect(EXPECTED.censusWords).toHaveLength(36);
  });

  it('maps every census item to one of the nine Spec 137 words or a draft', () => {
    const l = loadedFixture();
    expect(l.run.status, l.run.stderr).toBe(0);
    const missing: string[] = [];
    Object.keys(EXPECTED.expect).filter((id) => id.startsWith('CEN.')).forEach((id) => {
      const t = byPlan(l.target, id);
      if (!t) { missing.push(id); return; }
      if (!draftsOf(l.target).some((d) => d.file === t.file)) expect(NINE, `${id} status ${String(t.fm.status)}`).toContain(String(t.fm.status));
    });
    expect(missing).toEqual([]);
  });

  it('applies the pinned expectation per word (plan section 1): closed words, evidence, typed first word, proposals as drafts', () => {
    const l = loadedFixture();
    expect(l.run.status, l.run.stderr).toBe(0);
    const bad: string[] = [];
    for (const [id, e] of Object.entries(EXPECTED.expect)) {
      if (!e) continue;
      const t = byPlan(l.target, id);
      if (!t) { bad.push(`${id}: no task or draft with label plan:${id}`); continue; }
      const got = draftsOf(l.target).some((d) => d.file === t.file) ? 'draft' : String(t.fm.status);
      if (got !== e.status) bad.push(`${id}: want ${e.status} got ${got}`);
      for (const lab of e.labels) if (!labelsOf(t).includes(lab)) bad.push(`${id}: label ${lab} missing`);
    }
    expect(bad).toEqual([]);
  });

  it('keeps the closed typed word over evidence: a ruled DROPPED item with DONE evidence stays DROPPED, FOLDED with LANDED evidence stays MERGED', () => {
    const l = loadedFixture();
    expect(l.run.status, l.run.stderr).toBe(0);
    expect(String(byPlan(l.target, 'EV.3')?.fm.status)).toBe('DROPPED');
    expect(String(byPlan(l.target, 'EV.4')?.fm.status)).toBe('MERGED');
  });

  it('lets evidence beat the typed word: WAITING + DONE rung -> DONE, READY + BUILT rung -> BUILT, WAITING + LANDED -> DONE', () => {
    const l = loadedFixture();
    expect(l.run.status, l.run.stderr).toBe(0);
    expect(String(byPlan(l.target, 'EV.1')?.fm.status)).toBe('DONE');
    expect(String(byPlan(l.target, 'EV.2')?.fm.status)).toBe('BUILT');
    expect(String(byPlan(l.target, 'EV.5')?.fm.status)).toBe('DONE');
  });

  it('HELD becomes WAITS + held-unruled + an open comment and invents no ruling text; FROZEN and DROPPED keep the quoted ruling as a ruling: line', () => {
    const l = loadedFixture();
    expect(l.run.status, l.run.stderr).toBe(0);
    const held = byPlan(l.target, 'EV.8');
    expect(String(held?.fm.status)).toBe('WAITS');
    expect(labelsOf(held!)).toContain('held-unruled');
    expect(held?.text).toMatch(/## Comments/);
    expect(held?.text).not.toMatch(/^ruling:/m);
    expect(String(byPlan(l.target, 'EV.6')?.fm.status)).toBe('FROZEN');
    expect(byPlan(l.target, 'EV.6')?.text).toMatch(/^ruling: .*hold this until push 8/m);
    expect(byPlan(l.target, 'EV.3')?.text).toMatch(/^ruling: .*we do not need it/m);
  });

  it('CONDITIONAL with task ids -> WAITS, without ids -> OPERATOR', () => {
    const l = loadedFixture();
    expect(l.run.status, l.run.stderr).toBe(0);
    expect(String(byPlan(l.target, 'EV.7')?.fm.status)).toBe('WAITS');
    const noIds = Object.keys(EXPECTED.expect).find((id) => id.startsWith('CEN.') && EXPECTED.expect[id]?.status === 'OPERATOR');
    expect(noIds).toBeDefined();
    expect(String(byPlan(l.target, noIds!)?.fm.status)).toBe('OPERATOR');
  });

  it('exits 1 naming the item and the word when a first word is not in the table, and creates nothing', () => {
    const raw = rawCopy((d) => {
      const f = path.join(d, 'sequence.json');
      const s = JSON.parse(fs.readFileSync(f, 'utf8'));
      s.increments[0].items.push({ number: 'ZZ.1', id: 'ZZ.1', title: 'unknown word', kind: 'build', who: 'lane', dependsOn: [], hours: 'x', sources: [], slicePart: '(1)', status: 'ZORP is not a status word', patch: 'x' });
      fs.writeFileSync(f, JSON.stringify(s, null, 1));
    });
    const l = load(raw);
    expect(l.run.status).toBe(1);
    expect(l.run.stderr).toMatch(/unknown status word/i);
    expect(l.run.stderr).toMatch(/ZZ\.1/);
    expect(l.run.stderr).toMatch(/ZORP/);
    expect(fs.existsSync(path.join(l.target, 'backlog'))).toBe(false);
    expect(tasksOf(l.target)).toHaveLength(0);
  });
});
