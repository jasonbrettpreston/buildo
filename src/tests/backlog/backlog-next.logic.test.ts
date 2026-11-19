// SPEC LINK: Spec 137 §4 rule 7 (137_mcqueue.md:98) and rule 12 (:115); plan v8.1 section 3 "Also kept" backlog-next.mjs (RR-0205, RR-0212).
// Test 7 of 11: scripts/analysis/backlog-next.mjs --root <dir> --today <date> lists LATER/WAITS tasks that are not drafts, whose dependencies are DONE
// (a MERGED dependency counts when its `merged-into:` target is DONE; FROZEN blocks), whose `when:` ids are DONE; due and overdue listed in their own sections.
import { describe, expect, it } from 'vitest';
import { backlog, makeProject, mk, script } from './helpers';

function fixture() {
  const d = makeProject();
  const done = mk(d, 'Done dependency', ['-s', 'DONE']);
  const open = mk(d, 'Open dependency', ['-s', 'LATER']);
  const frozen = mk(d, 'Frozen dependency', ['-s', 'FROZEN']);
  const mergedTarget = mk(d, 'Merge target done', ['-s', 'DONE']);
  const mergedOpenTarget = mk(d, 'Merge target open', ['-s', 'LATER']);
  const merged = mk(d, 'Merged away', ['-s', 'MERGED', '-d', `merged-into: ${mergedTarget}`]);
  const mergedOpen = mk(d, 'Merged into open', ['-s', 'MERGED', '-d', `merged-into: ${mergedOpenTarget}`]);
  const ready = mk(d, 'READY has DONE dep', ['-s', 'LATER', '--depends-on', done]);
  const blockedOpen = mk(d, 'BLOCKED open dep', ['-s', 'LATER', '--depends-on', open]);
  const blockedFrozen = mk(d, 'BLOCKED frozen dep', ['-s', 'WAITS', '--depends-on', frozen]);
  const viaMerged = mk(d, 'READY via merged target DONE', ['-s', 'WAITS', '--depends-on', merged]);
  const viaMergedOpen = mk(d, 'BLOCKED via merged target open', ['-s', 'WAITS', '--depends-on', mergedOpen]);
  const whenUnmet = mk(d, 'BLOCKED when unmet', ['-s', 'LATER', '-d', `when: ${open} DONE`]);
  const whenMet = mk(d, 'READY when met', ['-s', 'LATER', '-d', `when: ${done} DONE`]);
  const draft = backlog(d, ['task', 'create', 'DRAFT never ready', '--draft', '--plain']).stdout.match(/DRAFT-\d+/)![0];
  const overdue = mk(d, 'OVERDUE item', ['-s', 'LATER', '--due-date', '2026-11-18']);
  const dueSoon = mk(d, 'DUE soon item', ['-s', 'LATER', '--due-date', '2026-11-22']);
  const running = mk(d, 'RUNNING is not offered', ['-s', 'RUNNING']);
  return { d, ids: { done, open, frozen, merged, ready, blockedOpen, blockedFrozen, viaMerged, viaMergedOpen, whenUnmet, whenMet, draft, overdue, dueSoon, running } };
}
// BL-R3 note: task-1 is a prefix of task-11, so the negative assertions match whole ids (a plain toContain cannot tell them apart).
const idRe = (id: string) => new RegExp(`(?<![\\w-])${id}(?!\\d)`);
const next = (d: string) => script('scripts/analysis/backlog-next.mjs', ['--root', d, '--today', '2026-11-20']);
const section = (out: string, head: RegExp) => { const m = new RegExp(`^${head.source}[^\\n]*\\n([\\s\\S]*?)(?=^[A-Z][A-Z -]+:|$(?![\\s\\S]))`, 'm').exec(out); return m?.[1] ?? ''; };

describe('backlog-next (test 7)', () => {
  it('offers a LATER task whose dependencies are all DONE', () => {
    const { d, ids } = fixture();
    const r = next(d);
    expect(r.status, r.stderr).toBe(0);
    expect(section(r.stdout, /READY/)).toContain(ids.ready);
  });

  it('keeps out a task with an open dependency and a task with a FROZEN dependency', () => {
    const { d, ids } = fixture();
    const r = next(d);
    expect(r.status, r.stderr).toBe(0);
    const ready = section(r.stdout, /READY/);
    expect(ready).not.toMatch(idRe(ids.blockedOpen));
    expect(ready).not.toMatch(idRe(ids.blockedFrozen));
    expect(ready.length).toBeGreaterThan(0);
  });

  it('keeps out drafts, DONE, RUNNING and MERGED tasks themselves', () => {
    const { d, ids } = fixture();
    const r = next(d);
    expect(r.status, r.stderr).toBe(0);
    const ready = section(r.stdout, /READY/);
    expect(ready.length).toBeGreaterThan(0);
    for (const x of [ids.draft, ids.done, ids.running, ids.merged]) expect(ready).not.toMatch(idRe(x));
  });

  it('treats a MERGED dependency as satisfied only when its merged-into target is DONE', () => {
    const { d, ids } = fixture();
    const r = next(d);
    expect(r.status, r.stderr).toBe(0);
    const ready = section(r.stdout, /READY/);
    expect(ready).toContain(ids.viaMerged);
    expect(ready).not.toMatch(idRe(ids.viaMergedOpen));
  });

  it('applies the when: <ids> DONE line: unmet is out, met is in', () => {
    const { d, ids } = fixture();
    const r = next(d);
    expect(r.status, r.stderr).toBe(0);
    const ready = section(r.stdout, /READY/);
    expect(ready).toContain(ids.whenMet);
    expect(ready).not.toMatch(idRe(ids.whenUnmet));
  });

  it('lists overdue and due-within-7-days tasks in their own sections (today 2026-11-20)', () => {
    const { d, ids } = fixture();
    const r = next(d);
    expect(r.status, r.stderr).toBe(0);
    expect(section(r.stdout, /OVERDUE/)).toContain(ids.overdue);
    expect(section(r.stdout, /DUE/)).toContain(ids.dueSoon);
    expect(section(r.stdout, /DUE/)).not.toMatch(idRe(ids.overdue));
  });
});
