// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-AS, R-BA (gate G); docs/specs/01-pipeline/56_source_massing.md
//
// WF2 link_massing nonzero-close (plan .cursor/wf2_link_massing_nonzero_close_active_task.md D3):
// the HEALING COHORT bracket `scripts/analysis/link-massing-healing-cohort.js`. Two arms:
//   U = 50 non-primary centroid_in_parcel links get confidence - 0.01; the guarded upsert (e2) must heal them.
//   X = 25 phantom links (P, B), B's centroid NOT in P; the keyed delete (e3) must remove them and the
//       lost-link flag (e4) must NULL massing_enriched_at on the 25 P parcels.
// The pre-restore diff (fold X-1) is the negative control; the post-restore STRICT whole-table hash
// (operator ruling 2026-10-06, R-AS (ii): every column incl. linked_at) is the restore proof.
// This file EXECUTES the script's pure exports; it never asserts on the script's source text.

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { spawnSync } from 'child_process';

type Key = { parcel_id: number; building_id: number };
type PbRow = Key & { id: number; is_primary: boolean; structure_type: string; match_type: string; confidence: number | string; linked_at: string };
type Link = Key & { is_primary: boolean; structure_type: string; match_type: string; confidence: number | string };
type Recipe = { u_keys: Key[]; x_pairs: Key[] };
type Diff = {
  pb: { extra: Key[]; missing: Key[]; changed: Array<Key & { guard_equal: boolean; linked_at_moved: boolean }> };
  pm: { extra: number; missing: number; changed: Array<{ id: number; before: string | null; after: string | null }> };
};

// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS module
const mod = require('../../scripts/analysis/link-massing-healing-cohort.js') as {
  COHORT_LOCK_ID: number;
  N_U: number;
  N_X: number;
  U_DECREMENT: number;
  RECIPE_REL: string;
  CAPTURE_REL: string;
  parseArgs: (argv: string[]) => { mode: string; backupBase: string | null; out: string; chain: string };
  backupNames: (base: unknown) => { pb: string; pm: string };
  assertLocalTarget: (description: unknown) => string;
  selectPhantoms: (a: { candidates: Array<{ parcel_id: number; primary_building_id: number }>; derivedPairs: Set<string>; storedPairs: Set<string>; n: number }) => Key[];
  pairKey: (parcelId: number, buildingId: number) => string;
  driftCheck: (a: { stored: Link[]; derived: Link[] }) => { ok: boolean; extra: Key[]; missing: Key[]; guardDiff: Key[] };
  judgePreRestore: (a: { diff: Diff; recipe: Recipe }) => { ok: boolean; reasons: string[] };
  countsClaim: (summary: unknown, recipe: Recipe) => { ok: boolean; reasons: string[] };
  rerunClaim: (doc: unknown) => { ok: boolean; reasons: string[] };
  captureShapeClaim: (doc: unknown, descriptor: unknown) => { ok: boolean; reasons: string[] };
  restorePlan: (live: PbRow[], backup: PbRow[]) => { del: Key[]; ins: PbRow[]; upd: PbRow[] };
  applyRestorePlan: (live: PbRow[], plan: { del: Key[]; ins: PbRow[]; upd: PbRow[] }) => PbRow[];
  identityCheck: (recorded: unknown, live: unknown) => { ok: boolean; reason?: string };
  exitCodeFor: (a: { asserted: boolean; restored: boolean; restoreFailed: boolean }) => number;
  abortIfInterrupted: (state: { interrupted: boolean }) => void;
  selfTest: () => void;
};

const REPO_ROOT = path.resolve(__dirname, '../..');
const k = (parcel_id: number, building_id: number): Key => ({ parcel_id, building_id });
const pb = (id: number, parcel_id: number, building_id: number, over: Partial<PbRow> = {}): PbRow => ({
  id, parcel_id, building_id, is_primary: false, structure_type: 'other', match_type: 'centroid_in_parcel',
  confidence: '0.95', linked_at: '2026-10-01T00:00:00.000Z', ...over,
});
const U = [k(1, 10), k(1, 11)];
const X = [k(5, 77)];
const RECIPE: Recipe = { u_keys: U, x_pairs: X };
const goodDiff = (): Diff => ({
  pb: { extra: [], missing: [], changed: U.map((u) => ({ ...u, guard_equal: true, linked_at_moved: true })) },
  pm: { extra: 0, missing: 0, changed: X.map((x) => ({ id: x.parcel_id, before: '2026-09-01T00:00:00.000Z', after: null })) },
});

describe('link-massing-healing-cohort — pure helpers (T7)', () => {
  describe('constants', () => {
    it('the cohort is N_U=50 / N_X=25 with a 0.01 confidence decrement', () => {
      expect(mod.N_U).toBe(50);
      expect(mod.N_X).toBe(25);
      expect(mod.U_DECREMENT).toBe(0.01);
      expect(mod.RECIPE_REL).toBe('docs/reports/golden/link_massing/healing/recipe.json');
      expect(mod.CAPTURE_REL).toBe('docs/reports/golden/link_massing/post/cohort-heal.json');
    });

    it('COHORT_LOCK_ID is pinned to 902004, is not the step lock 91, and no other scripts/ file uses it (fold I-3)', () => {
      expect(mod.COHORT_LOCK_ID).toBe(902004);
      expect(mod.COHORT_LOCK_ID).not.toBe(91);
      const g = spawnSync('git', ['grep', '--untracked', '-nE', '902004', '--', 'scripts'], { cwd: REPO_ROOT, encoding: 'utf8' });
      const files = [...new Set(String(g.stdout).split('\n').filter(Boolean).map((l) => l.split(':')[0]))];
      expect(files).toEqual(['scripts/analysis/link-massing-healing-cohort.js']);
      for (const other of ['902001', '902002', '902003']) {
        const o = spawnSync('git', ['grep', '--untracked', '-nE', other, '--', 'scripts/analysis/link-massing-healing-cohort.js'], { cwd: REPO_ROOT, encoding: 'utf8' });
        expect(String(o.stdout), `${other} is another bracket's lock`).toBe('');
      }
    });
  });

  describe('argv + safety refusals (before any connect)', () => {
    it('parseArgs: exactly one mode; --backup/--run/--restore need a valid --backup-table', () => {
      expect(mod.parseArgs(['--self-test']).mode).toBe('self-test');
      expect(mod.parseArgs(['--derive']).mode).toBe('derive');
      const r = mod.parseArgs(['--run', '--backup-table=link_massing_cohort_bak_20261006t2200z']);
      expect(r.mode).toBe('run');
      expect(r.backupBase).toBe('link_massing_cohort_bak_20261006t2200z');
      expect(r.out).toBe('docs/reports/golden/link_massing/post/cohort-heal.json');
      expect(r.chain).toBe('sources');
      expect(() => mod.parseArgs(['--derive', '--run'])).toThrow();
      expect(() => mod.parseArgs([])).toThrow();
      expect(() => mod.parseArgs(['--bogus'])).toThrow();
      expect(() => mod.parseArgs(['--run'])).toThrow();
      expect(() => mod.parseArgs(['--backup', '--backup-table=x; DROP TABLE parcels'])).toThrow();
    });

    it('backupNames: a bad base name is refused; _pb/_pm are constant suffixes appended after validation (folds F-10, X-14)', () => {
      expect(mod.backupNames('link_massing_cohort_bak_20261006t2200z')).toEqual({
        pb: 'link_massing_cohort_bak_20261006t2200z_pb',
        pm: 'link_massing_cohort_bak_20261006t2200z_pm',
      });
      for (const bad of ['', 'parcels', 'link_massing_cohort_bak_20261006t2200z_pb', 'link_massing_cohort_bak_2026106t2200z', 'LINK_MASSING_COHORT_BAK_20261006T2200Z', 'link_massing_cohort_bak_20261006t2200z;', null]) {
        expect(() => mod.backupNames(bad), String(bad)).toThrow();
      }
    });

    it('assertLocalTarget: a non-loopback target is refused', () => {
      expect(mod.assertLocalTarget('postgres://postgres:***@127.0.0.1:54322/postgres')).toContain('127.0.0.1');
      expect(() => mod.assertLocalTarget('postgres://postgres:***@db.example.supabase.co:5432/postgres')).toThrow();
      expect(() => mod.assertLocalTarget(undefined)).toThrow();
    });

    it('identityCheck: a recorded system_identifier or database that differs from live refuses (fold R-1)', () => {
      const rec = { database: 'postgres', system_identifier: '7400000000000000001' };
      expect(mod.identityCheck(rec, { database: 'postgres', system_identifier: '7400000000000000001' }).ok).toBe(true);
      expect(mod.identityCheck(rec, { database: 'postgres', system_identifier: '7400000000000000002' }).ok).toBe(false);
      expect(mod.identityCheck(rec, { database: 'other', system_identifier: '7400000000000000001' }).ok).toBe(false);
      expect(mod.identityCheck(null, { database: 'postgres', system_identifier: '7400000000000000001' }).ok).toBe(false);
    });

    it('abortIfInterrupted throws only when interrupted', () => {
      expect(() => mod.abortIfInterrupted({ interrupted: false })).not.toThrow();
      expect(() => mod.abortIfInterrupted({ interrupted: true })).toThrow();
    });
  });

  describe('selection proofs (folds F-1/F-2/F-3)', () => {
    const cands = [
      { parcel_id: 1, primary_building_id: 100 },
      { parcel_id: 2, primary_building_id: 200 },
      { parcel_id: 3, primary_building_id: 300 },
      { parcel_id: 4, primary_building_id: 400 },
    ];
    it('selectPhantoms walks forward from P+1 and takes the first B that is neither derived nor stored for P', () => {
      const derived = new Set([mod.pairKey(1, 200)]);
      const stored = new Set([mod.pairKey(1, 300)]);
      const got = mod.selectPhantoms({ candidates: cands, derivedPairs: derived, storedPairs: stored, n: 2 });
      expect(got).toEqual([k(1, 400), k(2, 300)]);
    });
    it('selectPhantoms refuses (no wrap-around) when a P finds no B ahead of it', () => {
      const derived = new Set([mod.pairKey(2, 300), mod.pairKey(2, 400)]);
      expect(() => mod.selectPhantoms({ candidates: cands, derivedPairs: derived, storedPairs: new Set(), n: 2 })).toThrow();
      expect(() => mod.selectPhantoms({ candidates: cands.slice(0, 2), derivedPairs: new Set(), storedPairs: new Set(), n: 2 })).toThrow();
    });
    it('driftCheck: stored == derived (keys + guard columns, numeric confidence) is ok; any extra/missing/guard diff is not', () => {
      const a: Link = { ...k(1, 10), is_primary: true, structure_type: 'primary', match_type: 'centroid_in_parcel', confidence: '0.95' };
      const b: Link = { ...k(1, 11), is_primary: false, structure_type: 'other', match_type: 'centroid_in_parcel', confidence: 0.95 };
      expect(mod.driftCheck({ stored: [a, b], derived: [{ ...a, confidence: 0.95 }, b] }).ok).toBe(true);
      const extra = mod.driftCheck({ stored: [a, b], derived: [a] });
      expect(extra.ok).toBe(false);
      expect(extra.extra).toEqual([k(1, 11)]);
      const missing = mod.driftCheck({ stored: [a], derived: [a, b] });
      expect(missing.missing).toEqual([k(1, 11)]);
      const guard = mod.driftCheck({ stored: [a, { ...b, structure_type: 'garage' }], derived: [a, b] });
      expect(guard.guardDiff).toEqual([k(1, 11)]);
    });
  });

  describe('pre-restore diff classifier (fold X-1 — the negative control)', () => {
    it('the expected diff (exactly the U keys healed, only linked_at moved; exactly the X parcels flagged) passes', () => {
      expect(mod.judgePreRestore({ diff: goodDiff(), recipe: RECIPE })).toEqual({ ok: true, reasons: [] });
    });
    it('an extra row, a missing row, a guard change on a U row, a changed non-U row, or a stray parcel each fail', () => {
      const cases: Array<(d: Diff) => void> = [
        (d) => { d.pb.extra.push(k(5, 77)); },
        (d) => { d.pb.missing.push(k(9, 90)); },
        (d) => { d.pb.changed[0]!.guard_equal = false; },
        (d) => { d.pb.changed.push({ ...k(8, 80), guard_equal: true, linked_at_moved: true }); },
        (d) => { d.pb.changed.pop(); },
        (d) => { d.pm.changed.push({ id: 6, before: '2026-09-01T00:00:00.000Z', after: null }); },
        (d) => { d.pm.changed[0]!.after = '2026-10-06T00:00:00.000Z'; },
        (d) => { d.pm.extra = 1; },
      ];
      for (const mutate of cases) {
        const d = goodDiff();
        mutate(d);
        const j = mod.judgePreRestore({ diff: d, recipe: RECIPE });
        expect(j.ok, JSON.stringify(d)).toBe(false);
        expect(j.reasons.length).toBeGreaterThan(0);
      }
    });
  });

  describe('restore plan (fold F-4/F-5 — full-diff restore reproduces the backup)', () => {
    it('extra rows are deleted, missing rows re-inserted with their original id, changed rows updated', () => {
      const backup = [pb(1, 1, 10), pb(2, 1, 11, { confidence: '0.95' }), pb(3, 2, 20, { is_primary: true, structure_type: 'primary' })];
      const live = [
        pb(1, 1, 10),
        pb(2, 1, 11, { confidence: '0.94', linked_at: '2026-10-06T22:00:00.000Z' }),
        pb(99, 5, 77, { linked_at: '2000-01-01T00:00:00.000Z' }),
      ];
      const plan = mod.restorePlan(live, backup);
      expect(plan.del).toEqual([k(5, 77)]);
      expect(plan.ins.map((r) => r.id)).toEqual([3]);
      expect(plan.upd.map((r) => [r.parcel_id, r.building_id])).toEqual([[1, 11]]);
      const restored = mod.applyRestorePlan(live, plan);
      const sort = (rows: PbRow[]) => [...rows].sort((a, b) => a.parcel_id - b.parcel_id || a.building_id - b.building_id);
      expect(sort(restored)).toEqual(sort(backup));
    });
  });

  describe('capture claims', () => {
    const summary = (meta: Record<string, unknown>, upd = 50, nw = 0) => ({ records_new: nw, records_updated: upd, records_meta: meta });
    const exact = { links_updated: 2, links_inserted: 0, primary_cleared: 0, links_deleted: 1, parcels_flagged_lost_link: 1 };
    it('countsClaim: exact per-target counts pass; any off-by-one is a STOP (never a >=)', () => {
      expect(mod.countsClaim(summary(exact, 2), RECIPE).ok).toBe(true);
      expect(mod.countsClaim(summary({ ...exact, links_updated: 3 }, 2), RECIPE).ok).toBe(false);
      expect(mod.countsClaim(summary({ ...exact, links_deleted: 2 }, 2), RECIPE).ok).toBe(false);
      expect(mod.countsClaim(summary({ ...exact, parcels_flagged_lost_link: 0 }, 2), RECIPE).ok).toBe(false);
      expect(mod.countsClaim(summary({ ...exact, primary_cleared: 1 }, 2), RECIPE).ok).toBe(false);
      expect(mod.countsClaim(summary(exact, 3), RECIPE).ok).toBe(false);
      expect(mod.countsClaim(summary(exact, 2, 1), RECIPE).ok).toBe(false);
      expect(mod.countsClaim(summary({ ...exact, links_updated: null }, 2), RECIPE).ok).toBe(false);
      expect(mod.countsClaim(undefined, RECIPE).ok).toBe(false);
    });
    it('rerunClaim: run 2 must write 0 (parcels zero; parcel_buildings drift_declared or zero)', () => {
      const doc = (pbAns: string, pAns: string, exit = 0) => ({
        rerun_proof: { rows: [{ table: 'parcel_buildings', answer: pbAns }, { table: 'parcels', answer: pAns }], run2: { exit_code: exit } },
      });
      expect(mod.rerunClaim(doc('drift_declared', 'zero')).ok).toBe(true);
      expect(mod.rerunClaim(doc('zero', 'zero')).ok).toBe(true);
      expect(mod.rerunClaim(doc('drift_declared', 'rewrote')).ok).toBe(false);
      expect(mod.rerunClaim(doc('rewrote', 'zero')).ok).toBe(false);
      expect(mod.rerunClaim(doc('drift_declared', 'zero', 1)).ok).toBe(false);
      expect(mod.rerunClaim({}).ok).toBe(false);
    });
    it('captureShapeClaim: descriptor-derived invariants (invariants_file null, count read from the descriptor — fold I-4)', () => {
      const descriptor = { invariants: [1, 2, 3, 4, 5], plausibility: [1, 2] };
      const ok = { exit_code: 0, invariants_file: null, invariants: new Array(7).fill({}) };
      expect(mod.captureShapeClaim(ok, descriptor).ok).toBe(true);
      expect(mod.captureShapeClaim({ ...ok, invariants_file: 'x.json' }, descriptor).ok).toBe(false);
      expect(mod.captureShapeClaim({ ...ok, invariants: new Array(6).fill({}) }, descriptor).ok).toBe(false);
      expect(mod.captureShapeClaim({ ...ok, exit_code: 1 }, descriptor).ok).toBe(false);
    });
    it('exitCodeFor: 2 when the restore failed, 1 when a claim failed or the restore did not verify, else 0', () => {
      expect(mod.exitCodeFor({ asserted: true, restored: true, restoreFailed: false })).toBe(0);
      expect(mod.exitCodeFor({ asserted: false, restored: true, restoreFailed: false })).toBe(1);
      expect(mod.exitCodeFor({ asserted: true, restored: false, restoreFailed: false })).toBe(1);
      expect(mod.exitCodeFor({ asserted: true, restored: false, restoreFailed: true })).toBe(2);
    });
  });

  describe('--self-test', () => {
    it('selfTest() runs clean in-process', () => {
      expect(() => mod.selfTest()).not.toThrow();
    });
    it('the CLI --self-test exits 0 and prints self-test PASSED (no DB)', () => {
      const env = { ...process.env };
      for (const key of Object.keys(env)) if (/^(PG_|PG[A-Z]|DATABASE_URL|SUPABASE_DATABASE_URL)/.test(key)) delete env[key];
      const r = spawnSync('node', ['scripts/analysis/link-massing-healing-cohort.js', '--self-test'], { cwd: REPO_ROOT, encoding: 'utf8', env, timeout: 60_000 });
      expect(r.status, String(r.stderr)).toBe(0);
      expect(String(r.stdout)).toContain('self-test PASSED');
    });
  });
});
