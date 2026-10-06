// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-C, R-BA (gate G); 123_step_opt_assessment_validation.md §6 G8
//
// WF2 gate G — `scripts/analysis/gates/captures.mjs`, fast invariants #38/#39/#40
// (wiring pending). The ACCURATE word of the five-word standard:
//
//   (1) NONZERO (#38) — a step declaring `outputs.writes[].table` proves a write
//       only when a golden POST capture records `records_new + records_updated >
//       0` (`forced_nonzero` for a single target; `cohort_declared` from
//       `golden/<slug>/cohort.json` for a multi-target step, where step-level
//       counters cannot attribute the write). Else RED. `outputs:"none"` is
//       vacuous, not listed.
//   (2) FRESHNESS (#39) — every post capture's top-level `lib_fingerprint`
//       (sha256 over `scripts/lib/step/**/*.js`) equals the CURRENT tree:
//       `fresh` · `missing` (legacy, ledger-permitted) · `mismatch` (RED under
//       --all regardless of a row).
//   (3) EXPLAINED (#40) — a G8 diff key is explained iff
//       `golden/<slug>/explained-diffs.json` lists it (`[\d+]`→`[]`, why ≥ 20
//       chars). The legacy report citation survives only behind a ledger row.
//
// T2 re-asserts every fixture `captures.mjs`'s own `selfTestCases()` declares,
// DIRECTLY — a checker never proven to fire is not a check (Spec 121 §12b.6).
// T3 proves `computeLibFingerprint` both directions against a tmp copy. T4 is
// the LIVE half: every live violation is ledger-allowed, with 0 orphans
// (RED-first until the orchestrator lands the rows). T5 proves the
// `source_fingerprint` lockfile (`golden-fingerprint.infra.test.ts`'s subject)
// is untouched by the new `lib_fingerprint` field.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import * as capturesRaw from '../../scripts/analysis/gates/captures.mjs';
import * as ledger from '../../scripts/analysis/gates/ledger.mjs';

const REPO_ROOT = path.resolve(__dirname, '../..');

// The gate is a plain `.mjs` module with inferred (loosely-typed) signatures.
type Capture = { file: string; doc: Record<string, unknown> | null };
type FleetEntry = { descriptor: Record<string, unknown>; slug: string; posts: Capture[]; cohort: Record<string, unknown> | null };
type NonzeroState = { table: string; decision: string; detail: string };
type ExplainedResult = { explained: boolean; entry: Record<string, unknown> | null; reason: string };
type NonzeroWalk = {
  pass: boolean;
  unallowed: Array<{ step: string; item: string }>;
  orphans: unknown[];
  vacuous: string[];
  allowed: Array<{ violation: { step: string; item: string } }>;
};

const captures = capturesRaw as unknown as {
  summaryWriteCount: (doc: unknown) => number;
  writeTables: (descriptor: unknown) => string[];
  nonzeroDecision: (descriptor: unknown, posts: Capture[], cohort: unknown) => { states: NonzeroState[]; vacuous: boolean };
  computeLibFingerprint: (repoRoot?: string) => string;
  freshnessDecision: (doc: unknown, current: string) => 'fresh' | 'missing' | 'mismatch';
  fleetFreshness: (
    fleet: Array<{ slug: string; captures: Capture[] }>,
    current: string,
    rows?: Array<Record<string, unknown>>,
    opts?: { staged?: boolean },
  ) => { states: Array<{ slug: string; file: string; state: string; allowed: boolean }>; violations: Array<{ step: string; item: string; detail: string }> };
  normaliseDiffKey: (key: string) => string;
  explainedDecision: (key: string, explained: unknown) => ExplainedResult;
  fleetExplained: (keys: string[], explained: unknown, reportCitationAllowed?: boolean) => { unexplained: Array<{ item: string }>; listed: unknown[] };
  loadPostCaptures: (repoRoot: string, slug: string) => Capture[];
  loadCohort: (repoRoot: string, slug: string) => Record<string, unknown> | null;
  loadExplained: (repoRoot: string, slug: string) => Record<string, unknown> | null;
  loadCapturesFleet: (repoRoot: string) => FleetEntry[];
  checkNonzero: (fleet: Array<Omit<FleetEntry, 'descriptor'> & { descriptor: unknown }>, rows: Array<Record<string, unknown>>) => NonzeroWalk;
  selfTestCases: () => Array<{ name: string; run: () => unknown; expect: Record<string, unknown> }>;
  selfTest: () => void;
};

const CONVERTED_REL = 'scripts/steps/_schema/converted.json';
const LIB_STEP_REL = 'scripts/lib/step';

// ---------------------------------------------------------------------------
// In-memory fixtures — the exact shapes selfTestCases() exercises.
// ---------------------------------------------------------------------------

const cap = (file: string, newN: number | null, updN: number | null): Capture => ({
  file,
  doc: { summary: { records_new: newN, records_updated: updN } },
});

const desc = (tables: string[]): Record<string, unknown> => ({
  identity: { name: 'fixture_step' },
  outputs: { writes: tables.map((table) => ({ table })) },
});

const gateGRow = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  gate: 'G',
  step: 'fixture_step',
  item: 'nonzero:parcels',
  disposition: 'pending_recapture',
  why: 'w',
  closing_brief: '.cursor/wf2_conversion_standard_gates_active_task.md row G',
  filed: '2026-09-25',
  adjudicated_by: 'operator',
  ...over,
});

const decisions = (states: NonzeroState[]): string[] => states.map((s) => s.decision);

describe('gate G — nonzero captures, lib-fingerprint freshness, explained diffs', () => {
  // -------------------------------------------------------------------------
  // T1 — the module's own self-test runs, and it throws on failure.
  // -------------------------------------------------------------------------
  it('T1: selfTest() does not throw, and selfTestCases() is non-empty', () => {
    expect(() => captures.selfTest()).not.toThrow();
    expect(captures.selfTestCases().length).toBeGreaterThan(0);
  });

  it('T1b: ledger.mjs GATES includes G, or the module threw at import time', () => {
    expect(ledger.GATES).toContain('G');
  });

  // -------------------------------------------------------------------------
  // T2 — every RED/GREEN fixture selfTestCases() relies on, asserted DIRECTLY.
  // -------------------------------------------------------------------------
  describe('T2: nonzero RED and GREEN directions', () => {
    it('T2a: RED — a single target whose captures are all 0', () => {
      expect(decisions(captures.nonzeroDecision(desc(['parcels']), [cap('a.json', 0, 0)], null).states)).toEqual(['RED']);
    });

    it('T2b: GREEN — a single target with 548 rows written is forced_nonzero', () => {
      expect(decisions(captures.nonzeroDecision(desc(['parcels']), [cap('a.json', 548, 0)], null).states)).toEqual(['forced_nonzero']);
    });

    it('T2c: RED — a null counter counts as 0 (load_ravines legacy captures)', () => {
      expect(decisions(captures.nonzeroDecision(desc(['parcels']), [cap('a.json', null, null)], null).states)).toEqual(['RED']);
    });

    it('T2d: RED — two targets with no cohort (step counters cannot attribute the write)', () => {
      expect(decisions(captures.nonzeroDecision(desc(['parcels', 'parcel_buildings']), [cap('a.json', 10, 0)], null).states)).toEqual(['RED', 'RED']);
    });

    it('T2e: RED — a cohort naming a 0-write capture', () => {
      const d = captures.nonzeroDecision(
        desc(['parcels', 'parcel_buildings']),
        [cap('a.json', 10, 0), cap('b.json', 0, 0)],
        { contract_version: 1, targets: [{ table: 'parcel_buildings', capture: 'b.json', why: 'w' }] },
      );
      expect(decisions(d.states)).toEqual(['RED', 'RED']);
    });

    it('T2f: GREEN — a cohort naming a nonzero capture yields cohort_declared', () => {
      const d = captures.nonzeroDecision(
        desc(['parcels', 'parcel_buildings']),
        [cap('a.json', 10, 0), cap('b.json', 0, 7)],
        { contract_version: 1, targets: [{ table: 'parcel_buildings', capture: 'b.json', why: 'w' }] },
      );
      expect(decisions(d.states)).toEqual(['RED', 'cohort_declared']);
    });

    it('T2g: RED — a cohort naming a capture that is not on disk', () => {
      const d = captures.nonzeroDecision(
        desc(['parcels', 'parcel_buildings']),
        [cap('a.json', 10, 0)],
        { contract_version: 1, targets: [{ table: 'parcel_buildings', capture: 'missing.json', why: 'w' }] },
      );
      expect(decisions(d.states)).toEqual(['RED', 'RED']);
    });

    it('T2h: GREEN/vacuous — outputs:"none" is NOT listed', () => {
      const d = captures.nonzeroDecision({ identity: { name: 'x' }, outputs: 'none' }, [], null);
      expect(d.vacuous).toBe(true);
      expect(d.states).toEqual([]);
    });

    it('T2i: summaryWriteCount treats absent/null counters as 0', () => {
      expect(captures.summaryWriteCount({ summary: {} })).toBe(0);
      expect(captures.summaryWriteCount({})).toBe(0);
      expect(captures.summaryWriteCount({ summary: { records_new: 5, records_updated: null } })).toBe(5);
    });

    it('T2j: writeTables deduplicates repeated tables, preserving order', () => {
      expect(captures.writeTables({ outputs: { writes: [{ table: 'a' }, { table: 'a' }, { table: 'b' }] } })).toEqual(['a', 'b']);
    });

    it('T2k: GREEN — a nonzero violation with its matching gate-G row is allowed', () => {
      const out = captures.checkNonzero(
        [{ slug: 'fixture_step', posts: [cap('a.json', 0, 0)], cohort: null, descriptor: desc(['parcels']) }],
        [gateGRow({ item: 'nonzero:parcels' })],
      );
      expect(out.pass).toBe(true);
      expect(out.unallowed).toHaveLength(0);
      expect(out.orphans).toHaveLength(0);
    });

    it('T2l: RED — an orphan gate-G row (violation since fixed) is RED (R-X)', () => {
      const out = captures.checkNonzero(
        [{ slug: 'fixture_step', posts: [cap('a.json', 5, 0)], cohort: null, descriptor: desc(['parcels']) }],
        [gateGRow({ item: 'nonzero:parcels' })],
      );
      expect(out.pass).toBe(false);
      expect(out.orphans).toHaveLength(1);
    });

    it('T2m: RED — a nonzero violation with NO row is unallowed', () => {
      const out = captures.checkNonzero(
        [{ slug: 'fixture_step', posts: [cap('a.json', 0, 0)], cohort: null, descriptor: desc(['parcels']) }],
        [],
      );
      expect(out.pass).toBe(false);
      expect(out.unallowed).toHaveLength(1);
      expect(out.unallowed[0]?.item).toBe('nonzero:parcels');
    });
  });

  describe('T2: lib-fingerprint freshness RED and GREEN directions', () => {
    it('T2n: GREEN — the field equals the current fingerprint -> fresh', () => {
      expect(captures.freshnessDecision({ lib_fingerprint: 'abc' }, 'abc')).toBe('fresh');
    });

    it('T2o: missing — no field (a legacy capture) -> missing', () => {
      expect(captures.freshnessDecision({}, 'abc')).toBe('missing');
      expect(captures.freshnessDecision(null, 'abc')).toBe('missing');
    });

    it('T2p: RED — the field differs -> mismatch', () => {
      expect(captures.freshnessDecision({ lib_fingerprint: 'zzz' }, 'abc')).toBe('mismatch');
    });

    it('T2q: RED — a mismatch is a violation under --all EVEN WITH a ledger row', () => {
      const out = captures.fleetFreshness(
        [{ slug: 'fixture_step', captures: [{ file: 'a.json', doc: { lib_fingerprint: 'old' } }] }],
        'new',
        [gateGRow({ item: 'lib_fingerprint', disposition: 'pending_recapture' })],
      );
      expect(out.violations).toHaveLength(1);
    });

    it('T2r: GREEN — a missing capture is permitted by its ledger row during the transition', () => {
      const out = captures.fleetFreshness(
        [{ slug: 'fixture_step', captures: [{ file: 'a.json', doc: {} }] }],
        'new',
        [gateGRow({ item: 'lib_fingerprint' })],
      );
      expect(out.violations).toEqual([]);
      expect(out.states[0]?.state).toBe('missing');
    });

    it('T2s: RED — the same missing capture with NO row is a violation', () => {
      const out = captures.fleetFreshness(
        [{ slug: 'fixture_step', captures: [{ file: 'a.json', doc: {} }] }],
        'new',
        [],
      );
      expect(out.violations).toHaveLength(1);
    });
  });

  describe('T2: explained-diff RED and GREEN directions', () => {
    it('T2t: GREEN — invariants[3].value vs entry invariants[].value -> listed', () => {
      const r = captures.explainedDecision('invariants[3].value', {
        contract_version: 1,
        diffs: [{ key: 'invariants[].value', why: 'a declared diff with a long enough why' }],
      });
      expect(r.explained).toBe(true);
      expect(r.entry).not.toBeNull();
    });

    it('T2u: RED — no entry for the key', () => {
      expect(captures.explainedDecision('invariants[3].value', { contract_version: 1, diffs: [] }).explained).toBe(false);
    });

    it('T2v: RED — a 5-char why is below the 20-char floor', () => {
      expect(captures.explainedDecision('invariants[3].value', {
        contract_version: 1,
        diffs: [{ key: 'invariants[].value', why: 'short' }],
      }).explained).toBe(false);
    });

    it('T2w: RED — an absent explained-diffs.json (null) explains nothing', () => {
      expect(captures.explainedDecision('x.y', null).explained).toBe(false);
    });

    it('T2x: normaliseDiffKey collapses every [n] to []', () => {
      expect(captures.normaliseDiffKey('stdout_lines[0].foo[12]')).toBe('stdout_lines[].foo[]');
    });

    it('T2y: fleetExplained leaves every unlisted key unexplained', () => {
      const out = captures.fleetExplained(['a.b', 'c.d'], { contract_version: 1, diffs: [{ key: 'a.b', why: 'a long enough explanation here' }] });
      expect(out.listed).toHaveLength(1);
      expect(out.unexplained.map((u) => u.item)).toEqual(['explained:c.d']);
    });
  });

  // -------------------------------------------------------------------------
  // T3 — computeLibFingerprint is SENSITIVE: a tmp copy of one lib file, both
  // directions (unchanged -> identical; one byte changed -> differs).
  // -------------------------------------------------------------------------
  it('T3: computeLibFingerprint is deterministic and moves when a lib file changes', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-g-libfp-'));
    const libDir = path.join(tmp, LIB_STEP_REL);
    fs.mkdirSync(libDir, { recursive: true });
    fs.writeFileSync(path.join(libDir, 'a.js'), 'module.exports = { x: 1 };\n', 'utf8');
    fs.writeFileSync(path.join(libDir, 'b.js'), 'module.exports = { y: 2 };\n', 'utf8');

    const a = captures.computeLibFingerprint(tmp);
    // deterministic — re-running over the identical tree is byte-identical.
    expect(captures.computeLibFingerprint(tmp)).toBe(a);

    // CRLF normalisation: rewriting the SAME file with CRLF does NOT move it.
    fs.writeFileSync(path.join(libDir, 'a.js'), 'module.exports = { x: 1 };\r\n', 'utf8');
    expect(captures.computeLibFingerprint(tmp)).toBe(a);

    // GREEN direction — a genuine content change DOES move it.
    fs.writeFileSync(path.join(libDir, 'a.js'), 'module.exports = { x: 999 };\r\n', 'utf8');
    expect(captures.computeLibFingerprint(tmp)).not.toBe(a);

    // Adding a file moves it too (the whole tree, not just the changed file).
    const b = captures.computeLibFingerprint(tmp);
    fs.writeFileSync(path.join(libDir, 'c.js'), 'module.exports = {};\n', 'utf8');
    expect(captures.computeLibFingerprint(tmp)).not.toBe(b);

    // A tree with NO lib/step files THROWS rather than hashing nothing.
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-g-libfp-empty-'));
    expect(() => captures.computeLibFingerprint(empty)).toThrow(/no scripts\/lib\/step/);

    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(empty, { recursive: true, force: true });
  });

  it('T3b: computeLibFingerprint over the REAL tree is a 64-hex sha256 and equals itself across calls', () => {
    const a = captures.computeLibFingerprint(REPO_ROOT);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(captures.computeLibFingerprint(REPO_ROOT)).toBe(a);
  });

  // -------------------------------------------------------------------------
  // T4 — LIVE: every live nonzero violation is either ledger-allowed OR named
  // in the measured RED-FIRST receipt below, and there are ZERO orphans.
  //
  // RED-FIRST (WF2 row G, measured 2026-09-25 against the committed goldens):
  // SIXTEEN writing step/table pairs have NO post capture recording a nonzero
  // write, and currently carry NO gate-G `nonzero:` ledger row. They are pinned
  // EXACTLY here, so the moment the orchestrator lands their rows this assertion
  // moves to `orphans` (RED, R-X — the rows must be deleted with the fix), and a
  // SEVENTEENTH pair appearing is RED immediately. The gate itself is proven in
  // T2's in-memory directions; this half pins the live receipt.
  //
  // The plan row G predicted 12 writing steps; the measured fleet is 16 (the
  // extra 4 are genuinely-zero-capture steps the plan's count did not reach).
  // That is the expected red, not a defect.
  // -------------------------------------------------------------------------
  // WF3 2026-09-28 (pct-flag): address_points:address_points and parcels:parcels CLOSED —
  // their POST goldens were recaptured with a forced-change cohort (records_updated 1000 / 954),
  // and the same commit deleted their two `nonzero:*` ledger rows.
  const KNOWN_RED_FIRST = [
    'compute_centroids:parcels',
    'compute_parcel_cost_estimates:parcels',
    'enrich_heritage:parcels',
    'enrich_parcels:enrich_parcels_pass3_scope',
    'enrich_parcels:parcels',
    'enrich_ravines:parcels',
    'geocode_permits:permits',
    // FLEET-2 §5 (2026-10-06): link_massing's two targets ledgered pending_recapture (A31: the steady-state re-derive
    // wrote 0; closing brief = a healing cohort capture). link_parcel_addresses:parcel_address_points CLOSED: its
    // sources POST now writes 36 new links (measured), and its ledger row was deleted (A29).
    'link_massing:parcel_buildings',
    'link_massing:parcels',
    'link_neighbourhoods:permits',
    'link_parcels:permit_parcels',
    'link_parcels:permits',
    'link_wsib:entities',
    'link_wsib:wsib_registry',
    'load_ravines:ravines',
  ];

  it('T4: live — every measured nonzero violation is now ledger-allowed (landed 2026-09-26), and zero orphans', () => {
    const fleet = captures.loadCapturesFleet(REPO_ROOT);
    const converted = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, CONVERTED_REL), 'utf8')).converted as unknown[];
    // The fleet is DERIVED from converted.json (R-AN), never a retyped list.
    expect(fleet.length).toBe(converted.length);
    expect(fleet.length).toBeGreaterThan(0);

    const { rows } = ledger.loadLedger(REPO_ROOT);
    const out = captures.checkNonzero(
      fleet.map((f) => ({ slug: f.slug, posts: f.posts, cohort: f.cohort, descriptor: f.descriptor })),
      rows,
    );
    // Zero orphans is the STRUCTURAL invariant and holds unconditionally — a row
    // whose violation is fixed must be deleted (R-X).
    expect(out.orphans).toEqual([]);
    // Landed (WF2 gate G wiring, 2026-09-26): the orchestrator filed a
    // pending_recapture row for every measured RED-FIRST pair, so the live
    // walk is now GREEN. The allowed set is EXACTLY the measured receipt.
    expect(out.unallowed).toEqual([]);
    expect(out.pass).toBe(true);
    const allowedSeen = out.allowed
      .map((a) => `${a.violation.step}:${a.violation.item.replace(/^nonzero:/, '')}`)
      .sort();
    expect(allowedSeen).toEqual([...KNOWN_RED_FIRST].sort());
  });

  it('T4b: the writing steps (outputs.writes[]) are a proper subset of the fleet, and every one is measured', () => {
    const fleet = captures.loadCapturesFleet(REPO_ROOT);
    const writing = fleet.filter((f) => captures.writeTables(f.descriptor).length > 0);
    // The corpus is non-trivial — a gate over an empty writing set is vacuous.
    expect(writing.length).toBeGreaterThan(0);
    for (const f of writing) {
      const d = captures.nonzeroDecision(f.descriptor, f.posts, f.cohort);
      expect(d.vacuous).toBe(false);
      expect(d.states.length).toBe(captures.writeTables(f.descriptor).length);
    }
  });

  // -------------------------------------------------------------------------
  // T5 — the golden-fingerprint LOCKFILE is untouched: the new `lib_fingerprint`
  // field rides ALONGSIDE `source_fingerprint`, never folded into it, so
  // `golden-fingerprint.infra.test.ts` stays green (its subject is unchanged).
  // -------------------------------------------------------------------------
  it('T5: the capture harness has no lib_fingerprint folded into source_fingerprint', () => {
    const harness = fs.readFileSync(path.join(REPO_ROOT, 'scripts/analysis/capture-step-golden.js'), 'utf8');
    // The harness may declare the lib fingerprint, but computeSourceFingerprint's
    // own file set is (step, descriptor, notes, compute) only — never lib/step.
    const fn = harness.slice(harness.indexOf('function computeSourceFingerprint'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).not.toContain('lib_fingerprint');
    expect(body).not.toContain('lib/step');
  });

  // -------------------------------------------------------------------------
  // T6 — WIRING (orchestrator, 2026-09-26): checkNonzero's gate-G ledger scope,
  // capture-step-golden.js's CJS lib_fingerprint (must match the ESM answer and
  // land as a top-level doc field), libStagedSelectsAll, and the three live
  // fast invariants (#38/#39/#40) in step-validate.mjs.
  // -------------------------------------------------------------------------
  describe('T6: wiring', () => {
    it('T6a: checkNonzero never reports a lib_fingerprint/explained row as an orphan of the nonzero check', () => {
      const otherRows = [
        { gate: 'G', step: 'fixture_step', item: 'lib_fingerprint', disposition: 'pending_recapture', why: 'w', closing_brief: 'b', filed: '2026-09-26', adjudicated_by: 'operator' },
        { gate: 'G', step: 'fixture_step', item: 'explained:report-citation', disposition: 'pending_remediation', why: 'w', closing_brief: 'b', filed: '2026-09-26', adjudicated_by: 'operator' },
      ];
      const desc = { identity: { name: 'fixture_step' }, outputs: { writes: [{ table: 'parcels' }] } };
      const fleet = [{ descriptor: desc, slug: 'fixture_step', posts: [{ file: 'a.json', doc: { summary: { records_new: 5, records_updated: 0 } } }], cohort: null }];
      const out = captures.checkNonzero(fleet, otherRows);
      expect(out.orphans).toEqual([]);
      expect(out.pass).toBe(true);
    });

    it('T6b: capture-step-golden.js (CJS) computeLibFingerprint matches the ESM gate answer', async () => {
      const cjs = (await import(path.join(REPO_ROOT, 'scripts/analysis/capture-step-golden.js'))) as { computeLibFingerprint: () => string };
      const esmFp = captures.computeLibFingerprint(REPO_ROOT);
      expect(cjs.computeLibFingerprint()).toBe(esmFp);
    });

    it('T6c: capture-step-golden.js stamps a top-level lib_fingerprint (not nested in source_fingerprint)', () => {
      const harness = fs.readFileSync(path.join(REPO_ROOT, 'scripts/analysis/capture-step-golden.js'), 'utf8');
      expect(harness).toMatch(/doc\.lib_fingerprint = computeLibFingerprint\(\)/);
    });

    it('T6d: the three fast invariants #38/#39/#40 are wired in step-validate.mjs, importing captures.mjs', () => {
      const sv = fs.readFileSync(path.join(REPO_ROOT, 'scripts/analysis/step-validate.mjs'), 'utf8');
      expect(sv).toContain("from './gates/captures.mjs'");
      expect(sv).toMatch(/id:\s*38,/);
      expect(sv).toMatch(/id:\s*39,/);
      expect(sv).toMatch(/id:\s*40,/);
      expect(sv).toContain('capturesSelfTest();');
    });

    it('T6e: live — step-validate.mjs --all --fast reports no registry-level gate-G failure', () => {
      const run = spawnSync('node', ['scripts/analysis/step-validate.mjs', '--all', '--fast'], {
        cwd: REPO_ROOT, encoding: 'utf8', timeout: 180_000,
      });
      const stdout = `${run.stdout || ''}`;
      expect(stdout).not.toMatch(/#38:.*FAIL|#39:.*FAIL|#40:.*FAIL/);
    });

    it('T6f: libStagedSelectsAll (pure, in step-validate.mjs) — both directions via the self-test', () => {
      const run = spawnSync('node', ['scripts/analysis/step-validate.mjs', '--self-test-only'], {
        cwd: REPO_ROOT, encoding: 'utf8', timeout: 60_000,
      });
      expect(run.status).toBe(0);
      expect(`${run.stdout || ''}`).toContain('self-test PASSED');
    });
  });
});
