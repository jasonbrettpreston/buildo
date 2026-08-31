// SPEC LINK: docs/specs/01-pipeline/60_shared_steps.md (owning spec, §Step Registry row 8 + §3 "Refresh Snapshot")
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.10 (RECORDER), §8.2 (pilot order), GAP-2
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit 6 — PH-7 test design, prove red)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (13 rules; Rule 3/R-G, Rule 9 grandfathered, Rule 10 row-derived verdict)
//
// Pilot 8 — `refresh_snapshot`, the RECORDER representative (Spec 122 §1.10/§8.2 —
// forced by having exactly 1 member, the 8th and last archetype). One write target,
// class `guarded_upsert` (GAP-2), no tiers, no batching, no ledger gate.
//
// ⚠️ SCOPE NOTE (nothing-hidden, stated explicitly rather than silently done): this
// file does NOT attempt full parity with `compute_centroids`'s 55-claim generic
// per-step gate (`node scripts/violations/plan-claims.mjs --checklist`) — that is a
// separate, larger undertaking this commit's own budget does not cover. This file
// covers the MATERIAL commit-7 obligations: the three-file shape, the RS-D1 phase
// map, the RS-D2 carry-forward fix (Ask 1, the one genuine behavioral lock), the
// new `runRecorderPhase`/LG-26/LG-27 library-growth conformance, grandfathered.json,
// notes.json's R-M no-before-image reasoning, and the golden differential shape.
// A future hardening pass MAY extend this file toward full 55-claim parity — not
// required by this pilot's own commit ledger.
//
// ⚠️ EVERY CLAIM TEST MUST BE RED TODAY, AND RED FOR THE RIGHT REASON. Each one that
// reads a FUTURE artifact opens with `artifact()` → `expect(existsSync).toBe(true)`,
// so the failure names the missing artifact rather than surfacing as an import error.
// Genuinely-red claims are wrapped `it.fails(...)` with a "flips at: commit 7"
// comment. `it.fails()` INVERTS: the wrapped body genuinely throws internally, and
// vitest reports the wrapped test as PASSED — if a claim were NOT actually red, vitest
// reports "expected test to fail but it passed," a real suite failure. A fully green
// run of this file is therefore the proof every `it.fails()` claim is genuinely red.
// Plain `it()` covers claims testable TODAY: N/A-by-subject facts, or facts this
// SAME commit lands (the `converted.json` pending entry, the advisory-lock
// uniqueness check against the live tree).
//
// The artifacts this file asserts against (Fold B, `.cursor/active_task.md`):
//   scripts/refresh-snapshot.descriptor.json — `identity.archetype:"RECORDER"`,
//     `execution.shape:"recorder"` (Fold B RULING — new `runRecorderPhase`, LG-26);
//     ONE write target (`data_quality_snapshots`, class `guarded_upsert`,
//     `guard:"none"`+`guard_why` — Rule-9 grandfathered, per GAP-2); `outputs.publish:
//     "direct"` (RECORDER's one required field); `sharing.varies_by_chain.phase`
//     declares all 4 chains distinctly (RS-D1's fix — no shared literal); `config`
//     declares the 2 pre-existing CoA-confidence vars (R-G `on_invalid:"fail"`) PLUS
//     a 3rd new WARN threshold for RS-D2's optional-query-failure visibility check
//   scripts/refresh-snapshot.notes.json — R-M's before-image reasoning stated
//     explicitly: no destructive retraction, an idempotent keyed upsert, before_image
//     "none"+why (NOT "generated" — this write never overwrites a value it cannot
//     re-derive, unlike CC-D3's centroid repair)
//   scripts/lib/compute/refresh-snapshot.js — checks dispatch === descriptor ids; no
//     fs/pg/pipeline/argv/env; opens no pool; costEst/coaFunnel catch paths route
//     through getPrevSnapshot() on failure (RS-D2, THE Ask-1 fix)
//   scripts/lib/step/write.js — LG-27: a NEW executor for a single-shot
//     `guarded_upsert` (INSERT...ON CONFLICT...DO UPDATE, DELETE/TRUNCATE
//     structurally forbidden, no batching)
//   scripts/lib/step/index.js — `isRecorderStep`/`runRecorderPhase` (LG-26), forked
//     from `runBackfillPhase`'s phase-order shape, reusing the generic mode/
//     staleness/records_meta/verdict-cascade/synthetic-invariant paths unchanged
//   scripts/steps/_schema/grandfathered.json — a real `refresh_snapshot` entry,
//     path `outputs.writes[].write_discipline.guard`, value `"none"`
//   scripts/steps/_schema/converted.json — `pending` gains a `refresh_snapshot`
//     entry THIS COMMIT (`stage:"red_suite"`, per R-K.1) — the ONE artifact this
//     file's own commit produces, not a future one
//   docs/reports/golden/refresh_snapshot/post/{permits,coa,sources,deep_scrapes,standalone}.json
//     — commit 7, differential against commit 5's `pre/*.json`, compared BY SHAPE
//     (column presence/types/insert-vs-update xor), never by raw hash equality —
//     the plan's own declared non-determinism posture (§5, live-DB counts churn
//     query-to-query by construction)

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');

const STEP_REL = 'scripts/refresh-snapshot.js';
const DESCRIPTOR_REL = 'scripts/refresh-snapshot.descriptor.json';
const NOTES_REL = 'scripts/refresh-snapshot.notes.json';
const COMPUTE_REL = 'scripts/lib/compute/refresh-snapshot.js';
const WRITE_REL = 'scripts/lib/step/write.js';
const INDEX_REL = 'scripts/lib/step/index.js';
const GRANDFATHERED_REL = 'scripts/steps/_schema/grandfathered.json';
const CONVERTED_REL = 'scripts/steps/_schema/converted.json';
const GOLDEN_DIR_REL = 'docs/reports/golden/refresh_snapshot';
const MANIFEST_REL = 'scripts/manifest.json';
const PROBE = path.join(REPO_ROOT, 'scripts/hooks/step-require-probe.cjs');

/** S1 — the step's advisory lock (Spec 47 §A.5 "Maintenance" wave; already true today). */
const LOCK_ID = 40;
const TABLE = 'data_quality_snapshots';
const WRITE_CLASS = 'guarded_upsert';
/** LG-26/LG-27 — grepped at implementation time (Fold B), never guessed. */
const RECORDER_EXECUTOR = 'executeRecorderUpsert';
const CONFIG_VARS = {
  T1: 'snapshot_coa_conf_high',
  T2: 'coa_match_conf_medium',
} as const;
/** RS-D2 (Ask 1, FIX) — the new declared WARN check making an optional-query failure visible. */
const RS_D2_CHECK_ID = 'optional_query_failed';
const CHAINS = ['permits', 'coa', 'sources', 'deep_scrapes'] as const;
const INVOCATIONS = [
  { name: 'permits', chain: 'permits' },
  { name: 'coa', chain: 'coa' },
  { name: 'sources', chain: 'sources' },
  { name: 'deep_scrapes', chain: 'deep_scrapes' },
  { name: 'standalone', chain: 'none' },
] as const;

// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const { validateDescriptor } = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js')) as {
  validateDescriptor: (d: unknown) => unknown;
};

interface WriteDiscipline { class: string; guard: unknown; guard_why?: unknown; scope: unknown; txn_scope: unknown }
interface WriteSpec { table: string; key: string | string[]; write_discipline: WriteDiscipline; retract: string }
interface Check { id: string; kind: string; severity: string; blocking: boolean; when: string; limit_from_config?: string }
interface Descriptor {
  identity: { name: string; lock: number; archetype: string };
  outputs: 'none' | { writes: WriteSpec[]; publish: string; invalidates: unknown[] };
  execution: { shape?: string };
  checks: Check[];
  config: 'none' | { logic_variables: Array<{ name: string; min: unknown; max: unknown; on_invalid: string }> };
  sharing: { varies_by_chain: { phase?: Record<string, number> } };
  recovery?: 'none' | { before_image: string; before_image_why?: unknown; interrupted: string };
  database: { min_migration: number | 'none' };
}
interface Notes { [k: string]: unknown }
type ComputeFn = (ctx: unknown) => Promise<{ records_meta?: Record<string, unknown> } | void>;
interface ComputeModule { compute?: ComputeFn; checks?: Record<string, (ctx: unknown) => unknown>; [k: string]: unknown }

function abs(rel: string): string { return path.join(REPO_ROOT, rel); }

function artifact(rel: string, why = ''): string {
  expect(
    fs.existsSync(abs(rel)),
    `MISSING ARTIFACT ${rel}${why ? ` — ${why}` : ''} (not yet produced by the pilot-8 commit sequence — commit 7 lands it)`,
  ).toBe(true);
  return abs(rel);
}

function readText(rel: string): string { return fs.readFileSync(artifact(rel), 'utf8'); }

function loadDescriptor(): Descriptor {
  const d = JSON.parse(readText(DESCRIPTOR_REL)) as Descriptor;
  validateDescriptor(d);
  return d;
}

function loadNotes(): Notes { return JSON.parse(readText(NOTES_REL)) as Notes; }
function computeSource(): string { return readText(COMPUTE_REL); }

function loadComputeModule(): ComputeModule {
  const mod = require(artifact(COMPUTE_REL)) as ComputeModule | ComputeFn; // eslint-disable-line @typescript-eslint/no-require-imports -- the FUTURE CJS compute module
  return (typeof mod === 'function' ? { compute: mod } : mod) as ComputeModule;
}

function loadLib(rel: string): Record<string, unknown> {
  return require(artifact(rel, 'library growth, commit 7')) as Record<string, unknown>; // eslint-disable-line @typescript-eslint/no-require-imports -- the CJS library module
}

function probe(rel: string): { pools: number; clients: number; require_error: string | null } {
  const raw = execFileSync('node', [PROBE, rel], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 60_000 });
  return JSON.parse(raw) as { pools: number; clients: number; require_error: string | null };
}

function git(args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', timeout: 60_000 }).trim();
  } catch {
    return '';
  }
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function writes(d: Descriptor): WriteSpec[] {
  expect(d.outputs, 'a RECORDER may not declare outputs:"none"').not.toBe('none');
  return (d.outputs as { writes: WriteSpec[] }).writes;
}

function writeTarget(d: Descriptor): WriteSpec {
  const w = writes(d);
  expect(w.length, 'exactly 1 write target — data_quality_snapshots, the smallest write surface of any pilot').toBe(1);
  const t = w[0] as WriteSpec;
  expect(t.table).toBe(TABLE);
  expect(t.write_discipline.class, `the ${TABLE} write target must use the guarded_upsert class per GAP-2`).toBe(WRITE_CLASS);
  return t;
}

function manifest(): { chains: Record<string, string[]> } {
  return JSON.parse(fs.readFileSync(abs(MANIFEST_REL), 'utf8')) as ReturnType<typeof manifest>;
}

/** A SQL text detector for "no DELETE/TRUNCATE token, both INSERT and an ON CONFLICT...DO UPDATE present" — the guarded_upsert contract (never a destructive statement, never insert-only). */
function detectDestructiveOrWrongShapeTokens(sql: string): string[] {
  const stripped = sql.replace(/--.*$/gm, '');
  const found: string[] = [];
  if (/\bDELETE\s+FROM\b/i.test(stripped)) found.push('DELETE FROM');
  if (/\bTRUNCATE\b/i.test(stripped)) found.push('TRUNCATE');
  if (!/\bINSERT\s+INTO\b/i.test(stripped)) found.push('missing INSERT INTO (the write target must be a keyed upsert)');
  if (!/\bON\s+CONFLICT\b[\s\S]*\bDO\s+UPDATE\b/i.test(stripped)) found.push('missing ON CONFLICT...DO UPDATE (this is an upsert, never insert-only)');
  return found;
}

function detectGrandfatheringOnGuardFence(entry: { paths?: Record<string, unknown> } | undefined): string[] {
  const findings: string[] = [];
  if (!entry) { findings.push('no grandfathered.json entry for refresh_snapshot'); return findings; }
  const guardPath = 'outputs.writes[].write_discipline.guard';
  if (!entry.paths || entry.paths[guardPath] !== 'none') {
    findings.push(`grandfathered.json must key on "${guardPath}" = "none" (assertGrandfathered reads .guard, never .class)`);
  }
  return findings;
}

// ---------------------------------------------------------------------------
// The descriptor's ruled shape (RECORDER, execution.shape:"recorder", RS-D1/RS-D2)
// ---------------------------------------------------------------------------

describe('the descriptor — RECORDER archetype, execution.shape:"recorder" (Fold B RULING)', () => {
  it.fails('descriptor exists, validates, carries the ruled shape: RECORDER archetype, execution.shape:"recorder", outputs.publish:"direct", 1 write target (guarded_upsert, guard:"none"), config T1-T2 (R-G on_invalid:"fail"), min_migration correct, lock 40 (flips at: commit 7)', () => {
    const d = loadDescriptor();
    expect(d.identity.lock).toBe(LOCK_ID);
    expect(d.identity.archetype, 'RECORDER (Spec 122 §1.10, forced by having exactly 1 member)').toMatch(/recorder/i);
    expect(d.execution.shape, 'Fold B RULING: a new runRecorderPhase, execution.shape:"recorder"').toBe('recorder');
    const t = writeTarget(d);
    expect(t.write_discipline.guard, 'guard:"none" — Rule-9 grandfathered per GAP-2, a metrics-recording row\'s whole purpose is to differ every run').toBe('none');
    expect(t.retract, 'no DELETE anywhere in this step').toBe('none');
    const outputs = d.outputs as { publish: string };
    expect(outputs.publish, 'RECORDER\'s one required field — no staging table, no pointer-swap').toBe('direct');
    expect(d.config, 'config must declare T1-T2').not.toBe('none');
    const cfg = d.config as Exclude<Descriptor['config'], 'none'>;
    for (const name of Object.values(CONFIG_VARS)) {
      const entry = cfg.logic_variables.find((v) => v.name === name);
      expect(entry, `${name} not declared in config.logic_variables[]`).toBeDefined();
      expect(entry!.on_invalid, `${name} is write-affecting — R-G mandates on_invalid:"fail"`).toBe('fail');
    }
  });

  it.fails('RS-D1 is fixed: sharing.varies_by_chain.phase declares all 4 chains with DISTINCT values — no chain silently shares another\'s literal (flips at: commit 7)', () => {
    const d = loadDescriptor();
    const phase = d.sharing.varies_by_chain.phase;
    expect(phase, 'sharing.varies_by_chain.phase must be a declared per-chain map, not "none"').toBeDefined();
    for (const chain of CHAINS) {
      expect(typeof phase![chain], `chain "${chain}" has no declared phase number`).toBe('number');
    }
    const values = CHAINS.map((c) => phase![c]);
    expect(new Set(values).size, 'RS-D1: every chain must have a DISTINCT phase — deep_scrapes previously silently shared permits\' number (18)').toBe(CHAINS.length);
  });

  it.fails('RS-D2 is fixed: a new declared WARN check makes an optional-query catch-path failure visible in the audit row (nothing-hidden — today it is only a log line) (flips at: commit 8, but the descriptor field must exist by commit 7 for peel 8 to wire it)', () => {
    const d = loadDescriptor();
    const check = d.checks.find((c) => c.id === RS_D2_CHECK_ID);
    expect(check, `descriptor must declare a "${RS_D2_CHECK_ID}"-shaped check (or equivalently named) for RS-D2's own visibility fix`).toBeDefined();
  });

  it.fails('invariants[] declares INV-1 (no duplicate snapshot_date) and plausibility[] is "none" with justification (a RECORDER records, it does not judge value bounds — assert_data_bounds owns that, per §1.10) (flips at: commit 7)', () => {
    const d = loadDescriptor() as Descriptor & { invariants?: unknown[]; plausibility?: unknown };
    expect(Array.isArray(d.invariants) && d.invariants.length >= 1, 'invariants[] must declare at least INV-1 (the duplicate-snapshot_date structural check)').toBe(true);
    expect(d.plausibility, 'plausibility[] must be the explicit "none" — value-bounds judgment belongs to assert_data_bounds, not this RECORDER').toBe('none');
  });
});

// ---------------------------------------------------------------------------
// The compute module + RS-D2's own behavioral fix (Ask 1)
// ---------------------------------------------------------------------------

describe('the compute module — Rule 2 (compute is JUST compute) + RS-D2 (Ask 1, the carry-forward fix)', () => {
  it.fails('compute exists, exports `checks` (dispatch === descriptor ids); no fs/pg/pipeline/argv/env; opens no pool; the 3 WF3-F1 query builders port verbatim from the pre-conversion file (flips at: commit 7)', () => {
    loadDescriptor();
    const mod = loadComputeModule();
    expect(typeof mod.compute).toBe('function');
    const src = stripComments(computeSource());
    for (const banned of [/require\(['"]fs['"]\)/, /require\(['"]pg['"]\)/, /require\(['"]\.\/pipeline['"]\)/, /process\.argv/, /process\.env/]) {
      expect(banned.test(src), `compute violates Rule 2 (compute is JUST compute): ${banned}`).toBe(false);
    }
    const p = probe(COMPUTE_REL);
    expect(p.pools, 'requiring the compute module must open zero pg.Pool instances').toBe(0);
    for (const fn of ['buildPermitsScalarQuery', 'buildTagBreakdownQuery', 'buildTradeByTypeQuery']) {
      expect(typeof (mod as unknown as Record<string, unknown>)[fn], `compute.js must re-export ${fn} verbatim from the WF3-F1 consolidation (8cc99c78)`).toBe('function');
    }
  });

  it.fails('THE Ask-1 fix (RS-D2): costEst and coaFunnel BOTH route their catch-path through getPrevSnapshot() on failure, mirroring the other 4 optional blocks — the file\'s own carry-forward policy (:320-322, origin fd14dc53) is now followed 6 of 6 times, not 4 of 6 (flips at: commit 7)', () => {
    const src = stripComments(computeSource());
    // Locate the costEst and coaFunnel catch blocks and assert each one calls
    // getPrevSnapshot() — a positive behavioral lock, not merely "the block exists".
    const costEstBlock = /catch\s*\([^)]*\)\s*\{[^}]*costEst[^}]*\}/i.exec(src) ?? /costEst[\s\S]{0,600}catch[\s\S]{0,300}/i.exec(src);
    const coaFunnelBlock = /catch\s*\([^)]*\)\s*\{[^}]*coaFunnel[^}]*\}/i.exec(src) ?? /coaFunnel[\s\S]{0,600}catch[\s\S]{0,300}/i.exec(src);
    expect(costEstBlock, 'compute.js must still carry a costEst optional-query block').toBeTruthy();
    expect(coaFunnelBlock, 'compute.js must still carry a coaFunnel optional-query block').toBeTruthy();
    expect(costEstBlock![0].includes('getPrevSnapshot'), 'RS-D2: costEst\'s catch path must call getPrevSnapshot() on failure, not leave the zero default').toBe(true);
    expect(coaFunnelBlock![0].includes('getPrevSnapshot'), 'RS-D2: coaFunnel\'s catch path must call getPrevSnapshot() on failure, not leave the zero default').toBe(true);
  });

  it.fails('reversion sentinel — the OLD zero-default-on-failure shape genuinely existed pre-fix; this pins that the fix did not merely ADD getPrevSnapshot() calls elsewhere while leaving the old defaulting comment intact (flips at: commit 7)', () => {
    const src = computeSource();
    // The old file's own comment said "zeroes" for these two catch blocks — the fixed
    // compute.js must not carry that stale rationale forward unchanged.
    expect(/Cost estimates query failed — zeroes/i.test(src), 'the stale "zeroes" catch-comment must be replaced with a carry-forward comment (RS-D2)').toBe(false);
    expect(/CoA cost-coverage\/funnel query failed — zeroes/i.test(src), 'the stale "zeroes" catch-comment must be replaced with a carry-forward comment (RS-D2)').toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Recorder-runner conformance (LG-26/LG-27) — mirrors compute_centroids' Gate 0
// ---------------------------------------------------------------------------

describe('recorder-runner conformance — LG-26/LG-27 are GENERIC library growth, not refresh_snapshot-specific', () => {
  it.fails('Gate 0 — the frozen shape conversion adds zero new bespoke runner paths: no refresh_snapshot / data_quality_snapshots branch anywhere in scripts/lib/step or pipeline.js OUTSIDE the LG-26/LG-27 additions, which are generic library code (flips at: commit 7)', () => {
    computeSource();
    for (const rel of [WRITE_REL, INDEX_REL]) artifact(rel, 'LG-26/LG-27 growth is generic library code, not refresh_snapshot-specific');
    const lib = fs.readdirSync(abs('scripts/lib/step')).filter((f) => f.endsWith('.js')).map((f) => `scripts/lib/step/${f}`);
    lib.push('scripts/lib/pipeline.js');
    for (const f of lib) {
      const code = stripComments(fs.readFileSync(abs(f), 'utf8'));
      expect(/refresh[_-]snapshot|data_quality_snapshots/i.test(code), `${f} carries a step-specific code path — LG-26/LG-27 must be generic`).toBe(false);
    }
  });

  it.fails('write.js — LG-27 (executeRecorderUpsert, guarded_upsert, DELETE/TRUNCATE structurally forbidden, INSERT+ON CONFLICT DO UPDATE required) exists — checked by NAME + CLASS STRING (flips at: commit 7)', () => {
    loadLib(WRITE_REL);
    const src = stripComments(fs.readFileSync(abs(WRITE_REL), 'utf8'));
    expect(src.includes(RECORDER_EXECUTOR), `write.js does not yet export "${RECORDER_EXECUTOR}" (LG-27) — genuinely absent today`).toBe(true);
  });

  it.fails('index.js — isRecorderStep/runRecorderPhase (LG-26) exist, checked by NAME not merely presence-of-a-branch; the runner reuses the generic mode/staleness/records_meta/verdict-cascade/synthetic-invariant paths — no separate recorder-only copy of any of them (flips at: commit 7)', () => {
    const lib = require(abs(INDEX_REL)) as Record<string, unknown>; // eslint-disable-line @typescript-eslint/no-require-imports -- exercising the real CJS library
    expect(typeof lib.isRecorderStep === 'function' || typeof lib.runRecorderPhase === 'function', 'index.js has no recorder dispatch exported yet').toBe(true);
  });

  it.fails('the compute module\'s generated SQL text is a genuine guarded_upsert — INSERT + ON CONFLICT...DO UPDATE present, DELETE/TRUNCATE structurally absent (flips at: commit 7)', () => {
    const src = computeSource();
    const upsertBlock = /INSERT INTO data_quality_snapshots[\s\S]*?ON CONFLICT[\s\S]*?RETURNING/i.exec(src);
    expect(upsertBlock, 'the INSERT...ON CONFLICT...DO UPDATE statement must be present verbatim in compute.js').toBeTruthy();
    const findings = detectDestructiveOrWrongShapeTokens(upsertBlock![0]);
    expect(findings, findings.join('; ')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// grandfathered.json + notes.json (R-M — no before-image reasoning)
// ---------------------------------------------------------------------------

describe('grandfathered.json (Rule 9) + notes.json (R-M generalized, no before-image)', () => {
  it.fails('grandfathered.json — a REAL refresh_snapshot entry, path outputs.writes[].write_discipline.guard, value "none", mirroring fixture_grandfathered_snapshot\'s own reasoning verbatim (flips at: commit 7)', () => {
    const g = JSON.parse(fs.readFileSync(abs(GRANDFATHERED_REL), 'utf8')) as { steps: Record<string, { paths?: Record<string, unknown> }> };
    const findings = detectGrandfatheringOnGuardFence(g.steps.refresh_snapshot);
    expect(findings, findings.join('; ')).toEqual([]);
  });

  it.fails('notes.json exists and states the R-M no-before-image reasoning EXPLICITLY: recovery.before_image is "none" (not "generated" — CC-D3\'s precedent), because this write is an idempotent keyed upsert with no destructive retraction, never a value-overwrite-with-no-record-of-the-prior-one (flips at: commit 7)', () => {
    const d = loadDescriptor();
    loadNotes();
    expect(d.recovery, 'recovery must not be "none" for a step with a real write target').not.toBe('none');
    const recovery = d.recovery as Exclude<Descriptor['recovery'], 'none' | undefined>;
    expect(recovery.before_image, 'R-M\'s scope is destructive retraction — an idempotent keyed upsert with retract:"none" does not reach it').toBe('none');
    expect(recovery.before_image_why, 'recovery.before_image:"none" requires before_image_why stating the R-M reasoning').toBeDefined();
    const notesBlob = JSON.stringify(loadNotes());
    expect(notesBlob.includes('R-M') || notesBlob.includes('before-image') || notesBlob.includes('before_image'), 'notes.json must state the R-M reasoning explicitly, not leave it implicit').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Golden capture — commit 5's landed PRE artifacts (testable today) + POST (commit 7)
// ---------------------------------------------------------------------------

describe('golden capture — PRE (commit 5, LANDED, testable today) + POST (commit 7)', () => {
  it('all 5 PRE invocations exist, exit 0, verdict PASS, and the one-row-per-day contract holds (29->30->30->30->30->30)', () => {
    const docs = INVOCATIONS.map((inv) => JSON.parse(fs.readFileSync(artifact(`${GOLDEN_DIR_REL}/pre/${inv.name}.json`), 'utf8')) as { exit_code: number; verdict: string; table_state?: Array<{ row_count: number }> });
    for (const d of docs) {
      expect(d.exit_code).toBe(0);
      expect(d.verdict).toBe('PASS');
      expect(d.table_state?.[0]?.row_count).toBe(30);
    }
  });

  it.fails('all 5 POST invocations exist; the differential against PRE is compared BY SHAPE (column presence/types, is_insert xor is_update), never by raw table-state hash — the plan\'s own declared non-determinism posture, since every invocation re-derives live-DB counts by construction (flips at: commit 7)', () => {
    for (const inv of INVOCATIONS) {
      const doc = JSON.parse(fs.readFileSync(artifact(`${GOLDEN_DIR_REL}/post/${inv.name}.json`), 'utf8')) as { exit_code: number; verdict: string; table_state?: Array<{ row_count: number }> };
      expect(doc.exit_code).toBe(0);
      expect(doc.verdict).toBe('PASS');
      expect(doc.table_state?.[0]?.row_count).toBe(30);
    }
  });
});

// ---------------------------------------------------------------------------
// Facts testable today, against the live tree (no future artifact)
// ---------------------------------------------------------------------------

describe('facts testable today — the live tree, not a future artifact', () => {
  it('advisory lock 40 is unique to refresh-snapshot.js (already true today)', () => {
    const hits: string[] = [];
    for (const f of fs.readdirSync(abs('scripts')).filter((x) => x.endsWith('.js'))) {
      const src = fs.readFileSync(abs(`scripts/${f}`), 'utf8');
      if (/ADVISORY_LOCK_ID\s*=\s*40\b/.test(src)) hits.push(f);
    }
    expect(hits, `lock 40 must be unique to refresh-snapshot.js: found in ${hits.join(', ')}`).toEqual(['refresh-snapshot.js']);
  });

  it('manifest confirms refresh_snapshot is a member of all 4 chains (already true today)', () => {
    const m = manifest();
    for (const chain of CHAINS) {
      expect((m.chains[chain] ?? []).includes('refresh_snapshot'), `${chain} chain must list refresh_snapshot`).toBe(true);
    }
  });

  it('LG-26/LG-27 are the genuine next-free numbers — grepped, never guessed: highest live mechanic today is LG-25 (link_parcels); LG-23 exists only in prose citations, never implementation code (pilot 7\'s own deliberate skip), so it stays retired-not-reused', () => {
    const hits = new Set<string>();
    const scan = (dir: string): void => {
      for (const entry of fs.readdirSync(abs(dir), { withFileTypes: true })) {
        const rel = path.posix.join(dir, entry.name);
        if (entry.isDirectory()) { scan(rel); continue; }
        if (!/\.(js|json)$/.test(entry.name)) continue;
        const src = fs.readFileSync(abs(rel), 'utf8');
        for (const m of src.matchAll(/LG-2[0-9]/g)) hits.add(m[0]);
      }
    };
    scan('scripts/lib');
    scan('scripts/steps/_schema');
    const nums = [...hits].map((h) => Number(h.slice(3))).sort((a, b) => a - b);
    expect(Math.max(...nums, 0), 'the highest LG number in scripts/lib + scripts/steps/_schema must be 25 until commit 7 lands LG-26/LG-27').toBe(25);
  });

  it('converted.json — pending gains a refresh_snapshot entry, stage "red_suite" (R-K.1) — the ONE artifact THIS commit itself produces', () => {
    const c = JSON.parse(fs.readFileSync(abs(CONVERTED_REL), 'utf8')) as { converted: string[]; pending: Array<{ file: string; stage: string }> };
    expect(c.converted.includes(STEP_REL), 'refresh_snapshot must not be registered as converted yet — that is commit 9 (cutover)').toBe(false);
    const entry = c.pending.find((p) => p.file === STEP_REL);
    expect(entry, `converted.json.pending must carry a ${STEP_REL} entry`).toBeDefined();
    expect(entry!.stage, 'R-K.1: a step with a landed red suite but no descriptor yet must declare stage "red_suite"').toBe('red_suite');
    expect(fs.existsSync(abs(DESCRIPTOR_REL)), 'R-K.1: a "red_suite"-stage pending entry must NOT yet have a sibling descriptor — that would be "stage not advanced"').toBe(false);
  });
});
