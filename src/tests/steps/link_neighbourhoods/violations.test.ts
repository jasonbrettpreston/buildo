// SPEC LINK: docs/specs/01-pipeline/60_shared_steps.md §"Link Neighbourhoods" (PRIMARY — the step's own contract; Spec 57 says so explicitly)
// SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md §Step Breakdown row 11 (the `permits` chain, 11 of 33)
// SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md §Step Breakdown row 18 (the `sources` chain, 18 of 28)
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.8 (LINK archetype), §1.10 (LINK membership), §5.1 (frozen shape), §8 (the shape enum + phase_runners freeze)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §3.1 (PIN, do not fix), §6.1 (G4d both-directions locks), §7 (R-PACE-1 compressed form), §7.1 (the discovering pass may not adjudicate)
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (the 13 rules; Rule 2/R-W PostGIS-branch ban, Rule 3 tunables, Rule 10/R-H row-derived verdict + retighten, Rule 11 order_guarantee, Rule 12 crash posture, R-K.1 pending stages)
// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §A.5 (advisory lock 92)
// SPEC LINK: docs/specs/00-architecture/48_...  §3.6 (verdict cascade is row-derived) — via scripts/lib/step/verdict.js
//
// ============================================================================
// I4 — `link_neighbourhoods`, the LINK archetype's THIRD and last member.
// COMPRESSED 3-commit form (R-PACE-1 / Spec 124 R-AH).
//
// ⚠️ THIS FILE IS **RED** AT COMMIT ①, ON PURPOSE (Spec 123 §7, PH-7 "prove red first").
// Every claim about an artifact that commit ② or ③ produces — the compute module, the
// frozen shell, the `link_column` runner + shape enum, the `converted[]` registration,
// the amended Spec 60/43 text — is written as `it.fails(...)`. They are REAL assertions
// that REALLY fail today; vitest reports a failing `it.fails` as a PASS and, crucially,
// reports it as a FAILURE the moment the claim becomes true. So each one flips to a plain
// `it()` in the commit that makes it true, and a premature flip is caught by the suite
// itself rather than by a reviewer's memory.
//
// Everything asserted with a plain `it()` is TRUE AS OF COMMIT ①: the descriptor, the
// notes.json fences, the three seeded logic variables, the defect-ledger rows, and the
// `pending` registration all land in that commit.
//
// THIS FILE IS DB-FREE BY CONVENTION (matches every other `violations.test.ts` in this
// programme). Every live number it cites was measured against the local dev DB on
// 2026-09-16 and recorded, with its query, in
// `docs/reports/2026-09-16-batch2-i4-link-neighbourhoods-assessment.md`. This file's job
// is the STRUCTURAL lock, never a re-derivation of the measurement.
//
// THE EIGHT FENCES (notes.json `fences[]`; G4d requires lock-count >= fence-count):
//   1. e53cdcf5 — the link rate is CUMULATIVE, never run-scoped
//   2. 7a147377 — the UPDATE carries an IS DISTINCT FROM guard on neighbourhood_id
//   3. b1102cdb — forward progress does not depend on the eligible set shrinking
//   4. bd1f0e61 — the verdict is row-derived, never a parallel boolean
//   5. bd9e67ab — the early-exit path still emits both a summary and PIPELINE_META
//   6. c1ef0b73 — advisory lock 92
//   7. 7edb231e — permits.neighbourhood_id is FK-constrained to neighbourhoods.id
//   8. e37eaab9 — records_updated counts LINKED permits only  ← found by the Regression
//      Guardian at the PLAN panel; the PH-0 draft declared only seven. Its own
//      pre-conversion lock (`src/tests/chain.logic.test.ts`, the §11 Counter Semantic
//      Contract describe) is a SOURCE-STRING check against the file the conversion
//      empties, so it would have gone VACUOUSLY GREEN at commit ②. This file is its new
//      home.
// ============================================================================

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');

const STEP_REL = 'scripts/link-neighbourhoods.js';
const COMPUTE_REL = 'scripts/lib/compute/link-neighbourhoods.js';
const DESCRIPTOR_REL = 'scripts/link-neighbourhoods.descriptor.json';
const NOTES_REL = 'scripts/link-neighbourhoods.notes.json';
const CONVERTED_REL = 'scripts/steps/_schema/converted.json';
const SEEDS_REL = 'scripts/seeds/logic_variables.json';
const LEDGER_REL = 'docs/reports/defect-ledger.md';
const SCHEMA_REL = 'scripts/steps/_schema/step.schema.json';
const INDEX_REL = 'scripts/lib/step/index.js';
const SPEC60_REL = 'docs/specs/01-pipeline/60_shared_steps.md';
const SPEC43_REL = 'docs/specs/01-pipeline/43_chain_sources.md';

function abs(rel: string): string { return path.join(REPO_ROOT, rel); }
function readText(rel: string): string { return fs.readFileSync(abs(rel), 'utf8'); }
function readJson<T>(rel: string): T { return JSON.parse(readText(rel)) as T; }

/**
 * A file's CODE, with block and line comments stripped.
 *
 * The retirement locks below assert that `hasPostGIS` / `pg_extension` / `@turf` do not
 * appear in the compute — but the compute's own docblock NAMES all three, because
 * documenting what was retired and why is the point of that docblock. A whole-file text
 * scan cannot tell the two apart, which is the same false-positive class
 * `step-validate.mjs`'s own `checkNoSecondDerivation` hit when it flagged a JSDoc phrase
 * as a hand-rolled verdict assignment. Stripping comments makes the assertion PRECISE
 * rather than lenient: the real rule (`scripts/ast-grep-rules/compute-shape.yml`'s
 * `compute-no-postgis-branch`) is an AST rule over code, and this mirrors its scope.
 */
function readCode(rel: string): string {
  return readText(rel)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Assert a lookup actually resolved, and NARROW it. Used instead of `!` so a missing
 * key fails with the name of the thing that was missing rather than a bare
 * "cannot read property of undefined" three lines later. `noUncheckedIndexedAccess`
 * makes every Record/array lookup `T | undefined`, which is exactly right here —
 * these tests exist to catch a key that is NOT there.
 */
function must<T>(value: T | undefined, what: string): T {
  expect(value, `MISSING: ${what}`).toBeDefined();
  if (value === undefined) throw new Error(`MISSING: ${what}`);
  return value;
}

interface Check {
  id: string;
  limit: string;
  warn_limit?: string;
  limit_from_config?: string;
  severity: string;
  when: string;
  blocking: boolean;
  retighten_when?: string;
  order_guarantee?: { guarantee: string; spec_ref: string; anchor: string };
}
interface Descriptor {
  identity: { lock: number; spec: string; archetype: string };
  inputs: { reads: { tables: Array<{ table: string; columns: string[] }> } };
  outputs: { writes: Array<{ table: string; write_discipline: Record<string, unknown> }>; write_inventory: { statements: number } };
  staleness: Record<string, unknown>;
  guards: { requires: Array<{ kind: string; name: string; on_missing: string }> };
  execution: Record<string, unknown>;
  checks: Check[];
  invariants: Array<{ id: string; last_measured: { value: number | null; sample_n: number } }>;
  plausibility: Array<{ id: string; last_measured: { value: number | null; sample_n: number }; retighten_when?: string }>;
  override: Record<string, string>;
  deviations: Array<{ from: string; adjudicated_by: string }>;
  limitations: Array<{ what: string; check_id: string }>;
  recovery: Record<string, unknown>;
  database: { min_migration: number };
  counters: Record<string, { source: string; why?: unknown }>;
  config: { logic_variables: Array<{ name: string; on_invalid: string }> };
  terminals: Array<{ id: string; kind: string; status: string }>;
}
interface Notes { fences: Array<{ const: string; commit: string; lock_test: string }> }

const descriptor = (): Descriptor => readJson<Descriptor>(DESCRIPTOR_REL);
const notes = (): Notes => readJson<Notes>(NOTES_REL);

// ---------------------------------------------------------------------------
// FENCE 1 — e53cdcf5: the link rate is CUMULATIVE, never run-scoped
// ---------------------------------------------------------------------------
describe('FENCE e53cdcf5 — the link rate is cumulative, never run-scoped', () => {
  it('both rate checks exist as SEPARATE rows and both say CUMULATIVE — two bounds on one metric are two rows (Rule 10), never one row with a computed severity', () => {
    const d = descriptor();
    const warn = d.checks.find((c) => c.id === 'link_rate');
    const floor = d.checks.find((c) => c.id === 'link_rate_floor');
    expect(warn, 'link_rate check missing').toBeTruthy();
    expect(floor, 'link_rate_floor check missing').toBeTruthy();
    expect(warn?.severity).toBe('WARN');
    expect(floor?.severity).toBe('FAIL');
    expect(JSON.stringify(warn)).toMatch(/CUMULATIVE/);
    expect(JSON.stringify(warn)).toMatch(/e53cdcf5/);
  });

  it('BOTH DIRECTIONS — the fence is declared in notes.json fences[] with its own commit sha, so retiring the cumulative denominator cannot happen silently', () => {
    expect(notes().fences.some((f) => f.commit === 'e53cdcf5')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FENCE 2 — 7a147377: the IS DISTINCT FROM guard
// ---------------------------------------------------------------------------
describe('FENCE 7a147377 — IS DISTINCT FROM guard on neighbourhood_id', () => {
  it('the single write target declares guard "is_distinct_from" scoped to exactly neighbourhood_id', () => {
    const w = descriptor().outputs.writes[0];
    expect(w?.write_discipline.guard).toBe('is_distinct_from');
    expect(w?.write_discipline.guard_columns).toEqual(['neighbourhood_id']);
  });

  it('BOTH DIRECTIONS — guard_why records that the guard is VACUOUS under this step\'s own scope, so a later reader cannot mistake it for the mechanism that delivers zero_writes (Idempotency Lens, plan panel 2026-09-16)', () => {
    const w = descriptor().outputs.writes[0] as unknown as { write_discipline: { guard_why: { text: string }; idempotent_rerun: string } };
    expect(w.write_discipline.guard_why.text).toMatch(/VACUOUS/);
    expect(w.write_discipline.guard_why.text).toMatch(/7a147377/);
    // The declaration must still say zero_writes — the scope emptying is what delivers it.
    expect(w.write_discipline.idempotent_rerun).toBe('zero_writes');
  });
});

// ---------------------------------------------------------------------------
// FENCE 3 — b1102cdb: forward progress independent of the eligible set shrinking
// ---------------------------------------------------------------------------
describe('FENCE b1102cdb — forward progress does not depend on the eligible set shrinking', () => {
  it('the fence is declared, and the descriptor no longer claims a keyset cursor it does not have: the surviving write is ONE statement (txn_scope "statement", batch "none", chunked false, checkpoint "none")', () => {
    const d = descriptor();
    expect(notes().fences.some((f) => f.commit === 'b1102cdb')).toBe(true);
    expect(d.execution.txn_scope).toBe('statement');
    expect(d.execution.batch).toBe('none');
    expect(d.execution.chunked).toBe(false);
    expect(d.execution.partial_fill).toBe('atomic');
    expect(d.staleness.checkpoint).toBe('none');
    expect(d.outputs.write_inventory.statements).toBe(1);
  });

  it('BOTH DIRECTIONS — a SINGLE statement makes the infinite-loop fence structurally unreachable (there is no loop to fail to advance), and recovery.interrupted_why says exactly that rather than describing a batch shape this step does not have', () => {
    const r = descriptor().recovery as unknown as { interrupted: string; interrupted_why: { text: string } };
    expect(r.interrupted).toBe('none');
    expect(r.interrupted_why.text).toMatch(/single statement IS its own transaction|rolls it back whole/);
    // The corrected prose QUOTES the draft's batch-shape claim in order to retract it, so a
    // bare "does not contain that phrase" assertion would fail on the correction itself.
    // What must hold is that the phrase appears only as something being CORRECTED.
    expect(r.interrupted_why.text).toMatch(/CORRECTED AT THE PLAN PANEL/);
    const asserted = r.interrupted_why.text.replace(/CORRECTED AT THE PLAN PANEL[\s\S]*?which this descriptor no longer declares\./, '');
    expect(asserted).not.toMatch(/kill mid-batch leaves the batches already committed/);
    expect(descriptor().execution.partial_fill).toBe('atomic');
  });
});

// ---------------------------------------------------------------------------
// FENCE 4 — bd1f0e61: the verdict is row-derived
// ---------------------------------------------------------------------------
describe('FENCE bd1f0e61 — row-derived verdict, never a parallel boolean', () => {
  it('the fence is declared with its sha', () => {
    expect(notes().fences.some((f) => f.commit === 'bd1f0e61')).toBe(true);
  });

  it('LANDED at commit ② — scripts/lib/compute/link-neighbourhoods.js contains no local verdict cascade: the library\'s deriveVerdict is the only place a verdict is computed (Rule 10)', () => {
    const src = readText(COMPUTE_REL);
    expect(src).not.toMatch(/function verdictCascade/);
    expect(src).not.toMatch(/\.some\(\s*\(?r\)?\s*=>\s*r\.status === 'FAIL'\s*\)/);
  });
});

// ---------------------------------------------------------------------------
// FENCE 5 — bd9e67ab: the early-exit path still emits a summary AND meta
// ---------------------------------------------------------------------------
describe('FENCE bd9e67ab — the zero-work path still emits summary and PIPELINE_META', () => {
  it('a no_eligible_permits terminal is declared, and its kind is "success" — NOT "no_op", which selectTerminal is never called with (Idempotency Lens, plan panel: no_op has zero ledger stamps across the whole converted fleet)', () => {
    const t = descriptor().terminals.find((x) => x.id === 'no_eligible_permits');
    expect(t, 'no_eligible_permits terminal missing').toBeTruthy();
    expect(t?.kind).toBe('success');
    expect(t?.status).toBe('completed');
    expect(notes().fences.some((f) => f.commit === 'bd9e67ab')).toBe(true);
  });

  it('BOTH DIRECTIONS — the hand-written duplicate emit block is what the library replaces, so the terminal\'s own why names the drift it removes', () => {
    const t = descriptor().terminals.find((x) => x.id === 'no_eligible_permits') as unknown as { why: { text: string } };
    expect(t.why.text).toMatch(/bd9e67ab/);
  });
});

// ---------------------------------------------------------------------------
// FENCE 6 — c1ef0b73: advisory lock 92
// ---------------------------------------------------------------------------
describe('FENCE c1ef0b73 — advisory lock 92', () => {
  it('the descriptor declares lock 92, and the fence records that 92 is NOT the spec number (60) and must not be "tidied"', () => {
    const d = descriptor();
    expect(d.identity.lock).toBe(92);
    expect(d.identity.spec).toBe('60');
    expect(notes().fences.some((f) => f.commit === 'c1ef0b73')).toBe(true);
  });

  it('BOTH DIRECTIONS — the step runs in TWO chains, so lock contention is a live path: a lock_held_elsewhere terminal with status self_skipped is declared', () => {
    const t = descriptor().terminals.find((x) => x.id === 'lock_held_elsewhere');
    expect(t?.kind).toBe('skip_lock_contention');
    expect(t?.status).toBe('self_skipped');
  });
});

// ---------------------------------------------------------------------------
// FENCE 7 — 7edb231e: the FK is what makes the -1 sentinel unwriteable
// ---------------------------------------------------------------------------
describe('FENCE 7edb231e — fk_permits_neighbourhoods keeps LN-D1 retired', () => {
  it('the FK is a declared REQUIRED precondition with on_missing "fail" — the mechanism that turns a code deletion into an enforced invariant', () => {
    const fk = descriptor().guards.requires.find((r) => r.name === 'fk_permits_neighbourhoods');
    expect(fk, 'fk_permits_neighbourhoods precondition missing').toBeTruthy();
    expect(fk?.kind).toBe('fk');
    expect(fk?.on_missing).toBe('fail');
    expect(notes().fences.some((f) => f.commit === '7edb231e')).toBe(true);
  });

  it('BOTH DIRECTIONS — the -1 sentinel is UNWRITEABLE, and TWO independent detectors say so: a FAIL check (sentinel_residue) and a table invariant (negative_neighbourhood_ids), both measured 0', () => {
    const d = descriptor();
    const check = d.checks.find((c) => c.id === 'sentinel_residue');
    expect(check?.severity).toBe('FAIL');
    expect(check?.limit).toBe('viol == 0');
    const inv = d.invariants.find((i) => i.id === 'negative_neighbourhood_ids');
    expect(inv, 'negative_neighbourhood_ids invariant missing').toBeTruthy();
    expect(inv?.last_measured.value).toBe(0);
    expect(inv?.last_measured.sample_n).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// FENCE 8 — e37eaab9: records_updated counts LINKED permits only  (NEW, plan panel)
// ---------------------------------------------------------------------------
describe('FENCE e37eaab9 — records_updated is the success count, never success + failures (§11)', () => {
  it('the fence is DECLARED (the PH-0 draft missed it — found by the Regression Guardian at the plan panel)', () => {
    const f = notes().fences.find((x) => x.commit === 'e37eaab9');
    expect(f, 'the e37eaab9 §11 counter fence is absent from notes.json fences[]').toBeTruthy();
    expect(f?.lock_test).toBe('src/tests/steps/link_neighbourhoods/violations.test.ts');
  });

  it('records_updated comes from the single write target\'s own updated count, and its why cites e37eaab9 — the no-match tail reports through its OWN row, never summed in', () => {
    const d = descriptor();
    const ru = must(d.counters.records_updated, 'counters.records_updated');
    expect(ru.source).toBe('written.e1.updated');
    expect(JSON.stringify(ru.why)).toMatch(/e37eaab9/);
    expect(d.checks.some((c) => c.id === 'no_neighbourhood_match')).toBe(true);
  });

  it('BOTH DIRECTIONS — records_new\'s permanent structural 0 is DECLARED rather than left to be discovered (a set_based_join_update target can never INSERT)', () => {
    const d = descriptor();
    const rn = must(d.counters.records_new, 'counters.records_new');
    expect(rn.source).toBe('written.e1.inserted');
    expect(JSON.stringify(rn.why)).toMatch(/STRUCTURALLY ALWAYS 0/);
    expect(d.outputs.writes[0]?.write_discipline.class).toBe('set_based_join_update');
  });
});

// ---------------------------------------------------------------------------
// LN-D3 — the ONE declared differential diff, and the band-preservation that
// keeps it to exactly what it claims to be
// ---------------------------------------------------------------------------
describe('LN-D3 — "== 158" becomes a floor WITHOUT re-severing the verdict bands', () => {
  it('neighbourhoods_loaded uses the two-tier form so the pre-conversion cascade survives exactly: 158+ PASS, 1-157 WARN, 0 FAIL', () => {
    const c = descriptor().checks.find((x) => x.id === 'neighbourhoods_loaded');
    expect(c?.limit).toBe('value_min 158');
    expect(c?.warn_limit).toBe('value_min 1');
    expect(c?.severity).toBe('FAIL');
    expect(c?.limit_from_config).toBe('sources_neighbourhoods_floor');
  });

  it('BOTH DIRECTIONS — a bare value_min at severity FAIL (no warn tier) would silently promote the 1-157 band WARN->FAIL; the ledger row records that the draft did exactly that and that it was corrected', () => {
    const ledger = readText(LEDGER_REL);
    const row = ledger.split('\n').find((l) => l.startsWith('| LN-D3 '));
    expect(row, 'LN-D3 ledger row missing').toBeTruthy();
    expect(row).toMatch(/re-severed the verdict bands/);
  });
});

// ---------------------------------------------------------------------------
// Rule 3 — every hard-coded tunable is externalized, and every limit form
// actually SUBSTITUTES correctly (the draft's four were broken)
// ---------------------------------------------------------------------------
describe('Rule 3 — tunables externalized, and the limit forms substitute correctly', () => {
  it('all four declared logic variables exist in the seed file with default/type/description/min/max/admin.group', () => {
    const seeds = readJson<Record<string, { default: number; type: string; description: string; min: number; max: number; admin: { group: string } }>>(SEEDS_REL);
    for (const v of descriptor().config.logic_variables) {
      const row = must(seeds[v.name], `declared logic variable ${v.name} in ${SEEDS_REL}`);
      expect(typeof row.default).toBe('number');
      expect(row.type).toBe('number');
      expect(row.description.length).toBeGreaterThan(20);
      expect(typeof row.min).toBe('number');
      expect(typeof row.max).toBe('number');
      expect(row.admin.group.length).toBeGreaterThan(0);
    }
  });

  it('the seed DEFAULT and the check\'s own literal agree — ruling A-4 makes the literal carry the seed default, so two different numbers would be two sources of truth', () => {
    const seeds = readJson<Record<string, { default: number }>>(SEEDS_REL);
    const expected: Record<string, number> = {
      neighbourhoods_loaded_before_write: must(seeds.sources_neighbourhoods_floor, 'seed sources_neighbourhoods_floor').default,
      neighbourhoods_loaded: must(seeds.sources_neighbourhoods_floor, 'seed sources_neighbourhoods_floor').default,
      link_rate: must(seeds.link_neighbourhoods_link_rate_warn_pct, 'seed link_neighbourhoods_link_rate_warn_pct').default,
      link_rate_floor: must(seeds.link_neighbourhoods_link_rate_fail_pct, 'seed link_neighbourhoods_link_rate_fail_pct').default,
      no_neighbourhood_match: must(seeds.link_neighbourhoods_no_match_warn_count, 'seed link_neighbourhoods_no_match_warn_count').default,
    };
    for (const c of descriptor().checks) {
      if (!c.limit_from_config) continue;
      const trailing = /(-?[0-9]*\.?[0-9]+)\s*$/.exec(c.limit);
      expect(trailing, `check ${c.id} limit "${c.limit}" has no trailing number for limit_from_config to substitute`).toBeTruthy();
      expect(Number(trailing?.[1]), `check ${c.id}: limit literal disagrees with the seed default of ${c.limit_from_config}`).toBe(expected[c.id]);
    }
  });

  it('BOTH DIRECTIONS — "viol == 0" is NEVER used with limit_from_config: substitution replaces the TRAILING number, so a floor variable would resolve to the nonsense "viol == 158"', () => {
    for (const c of descriptor().checks) {
      if (!c.limit_from_config) continue;
      expect(c.limit, `check ${c.id} pairs limit_from_config with an equality-to-zero form`).not.toBe('viol == 0');
    }
  });

  it('the verdict-affecting variables carry on_invalid "fail" and the WARN-only observational counter carries "clamp" (Rule 3\'s own stated split)', () => {
    const byName = Object.fromEntries(descriptor().config.logic_variables.map((v) => [v.name, v.on_invalid]));
    expect(byName.sources_neighbourhoods_floor).toBe('fail');
    expect(byName.link_neighbourhoods_link_rate_warn_pct).toBe('fail');
    expect(byName.link_neighbourhoods_link_rate_fail_pct).toBe('fail');
    expect(byName.link_neighbourhoods_no_match_warn_count).toBe('clamp');
    expect((descriptor().config as unknown as { hoisted_above_gate: boolean }).hoisted_above_gate).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The preconditions — measured names, not guessed ones
// ---------------------------------------------------------------------------
describe('guards.requires — measured against the live catalog, not guessed', () => {
  it('the GiST index precondition names idx_neighbourhoods_geom_gist — the name that EXISTS (assertRequirements matches indexname exactly, so a wrong name refuses every run forever)', () => {
    const idx = descriptor().guards.requires.find((r) => r.kind === 'index');
    expect(idx?.name).toBe('idx_neighbourhoods_geom_gist');
    expect(idx?.on_missing).toBe('fail');
  });

  it('BOTH DIRECTIONS — the name the draft guessed (idx_neighbourhoods_geom) appears NOWHERE as a declared requirement, and the real one is created by a migration on disk', () => {
    const d = descriptor();
    expect(d.guards.requires.some((r) => r.name === 'idx_neighbourhoods_geom')).toBe(false);
    const migrations = fs.readdirSync(path.join(REPO_ROOT, 'migrations')).filter((f) => f.endsWith('.sql'));
    const created = migrations.some((f) => readText(`migrations/${f}`).includes('idx_neighbourhoods_geom_gist'));
    expect(created, 'no migration on disk creates idx_neighbourhoods_geom_gist').toBe(true);
  });

  it('the step reads neighbourhoods.geom (PostGIS), NOT neighbourhoods.geometry (GeoJSON) — LN-D5\'s two-corpus divergence is resolved by reading one corpus', () => {
    const d = descriptor();
    const n = d.inputs.reads.tables.find((t) => t.table === 'neighbourhoods');
    expect(n?.columns).toContain('geom');
    expect(n?.columns).not.toContain('geometry');
    expect(d.guards.requires.some((r) => r.kind === 'column' && r.name === 'neighbourhouds.geom' || r.name === 'neighbourhoods.geom')).toBe(true);
  });

  it('database.min_migration is the COUNT POSITION of 109_fk_hardening.sql in the sorted migrations listing, never its filename number (LW-D8)', () => {
    const files = fs.readdirSync(path.join(REPO_ROOT, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
    const position = files.findIndex((f) => f.startsWith('109_')) + 1;
    expect(position, '109_fk_hardening.sql not found in migrations/').toBeGreaterThan(0);
    expect(descriptor().database.min_migration).toBe(position);
    expect(descriptor().database.min_migration).toBeLessThanOrEqual(files.length);
  });
});

// ---------------------------------------------------------------------------
// LN-D6 / LN-D9 — the two retirements the PLAN PANEL had to close
// ---------------------------------------------------------------------------
describe('LN-D6 — the retired parcel-centroid capability is COUNTED, not merely described', () => {
  it('a plausibility row measures the FORWARD-going stranded population (neighbourhood_id IS NULL, no coordinates, but a parcel geometry) — the population permits_processed structurally cannot see', () => {
    const p = descriptor().plausibility.find((x) => x.id === 'neighbourhood_id_unreachable_no_coords');
    expect(p, 'neighbourhood_id_unreachable_no_coords plausibility row missing — LN-D6 goes dark without it').toBeTruthy();
    expect(p?.last_measured.value).toBe(1493);
    expect(p?.last_measured.sample_n).toBeGreaterThanOrEqual(1);
  });

  it('BOTH DIRECTIONS — the limitation POINTS AT that row, not at permits_processed (whose own scope requires latitude IS NOT NULL and is therefore disjoint from the population)', () => {
    const lim = descriptor().limitations.find((l) => /WIDER eligible set|wider/i.test(l.what));
    expect(lim, 'the wider-eligible-set limitation is missing').toBeTruthy();
    expect(lim?.check_id).toBe('neighbourhood_id_unreachable_no_coords');
    expect(lim?.check_id).not.toBe('permits_processed');
  });
});

describe('LN-D9 — the conversion introduces NO net-new FULL mode', () => {
  it('override.force_full, recovery.force and staleness.mode_select are all "none", and no linked_full_* terminal is declared', () => {
    const d = descriptor();
    expect(d.override.force_full).toBe('none');
    expect((d.recovery as unknown as { force: string }).force).toBe('none');
    expect(d.staleness.mode_select).toBe('none');
    expect(d.terminals.some((t) => /^linked_full/.test(t.id))).toBe(false);
  });

  it('BOTH DIRECTIONS — the reason is LEDGERED (a capability that silently does nothing is a footgun), and recovery.reset states the operator path that actually works', () => {
    const ledger = readText(LEDGER_REL);
    expect(ledger.split('\n').some((l) => l.startsWith('| LN-D9 '))).toBe(true);
    const reset = (descriptor().recovery as unknown as { reset: string }).reset;
    expect(reset).toMatch(/UPDATE permits SET neighbourhood_id = NULL/);
  });
});

// ---------------------------------------------------------------------------
// R-H — every WARN that can stand permanently carries a REACHABLE retighten
// ---------------------------------------------------------------------------
describe('Rule 10 / R-H — a standing WARN carries a machine-observable, REACHABLE retighten condition', () => {
  it('every WARN check and every plausibility row declares retighten_when', () => {
    const d = descriptor();
    for (const c of d.checks) {
      if (c.severity !== 'WARN') continue;
      expect(c.retighten_when, `WARN check ${c.id} has no retighten_when`).toBeTruthy();
    }
    for (const p of d.plausibility) {
      expect(p.retighten_when, `plausibility row ${p.id} has no retighten_when`).toBeTruthy();
    }
  });

  it('BOTH DIRECTIONS — no retighten condition is gated on "an invalidator (LN-D4) exists", which limitations[] simultaneously declares unmet and unowned: that would launder a permanent WARN as retightenable', () => {
    const d = descriptor();
    const all = [...d.checks.map((c) => c.retighten_when ?? ''), ...d.plausibility.map((p) => p.retighten_when ?? '')];
    for (const text of all) {
      expect(text).not.toMatch(/AND an invalidator \(LN-D4\) exists/);
    }
  });

  it('the link_rate WARN ships RED on purpose and says so: its retighten_when names LN-D7, the denominator defect it is pinned against', () => {
    const c = descriptor().checks.find((x) => x.id === 'link_rate');
    expect(c?.retighten_when).toMatch(/LN-D7/);
  });
});

// ---------------------------------------------------------------------------
// The measurement obligation — declaring a row commits you to measuring it
// ---------------------------------------------------------------------------
describe('every declared invariant and plausibility row carries a REAL last_measured', () => {
  it('no last_measured is null or sample_n 0 — a contract that adjudicates an Ask from a null is not adjudicating (Ask 6)', () => {
    const d = descriptor();
    for (const row of [...d.invariants, ...d.plausibility]) {
      expect(row.last_measured.value, `${row.id} last_measured.value is null`).not.toBeNull();
      expect(row.last_measured.sample_n, `${row.id} last_measured.sample_n is 0`).toBeGreaterThanOrEqual(1);
    }
  });

  it('no deviation is left PENDING an operator ruling — Ask 2 and Ask 5 are recorded as ruled, with the evidence that ruled them', () => {
    for (const dev of descriptor().deviations) {
      expect(dev.adjudicated_by, `a deviation is still PENDING: ${dev.from}`).not.toMatch(/^PENDING/);
    }
  });
});

// ---------------------------------------------------------------------------
// The defect ledger — G6 reads this prefix
// ---------------------------------------------------------------------------
describe('defect-ledger.md carries the LN-D* rows with a closed-vocabulary status', () => {
  it('nine rows, LN-D1 through LN-D9, each with CLOSED or PIN in its Status cell and seven cells exactly', () => {
    const rows = readText(LEDGER_REL).split('\n').filter((l) => /^\| LN-D\d+ \|/.test(l));
    expect(rows.length).toBe(9);
    for (const r of rows) {
      const cells = r.split(/(?<!\\)\|/).slice(1, -1);
      expect(cells.length, `LN-D row has ${cells.length} cells, expected 7: ${r.slice(0, 60)}`).toBe(7);
      expect(cells[4], `row ${cells[0]?.trim()} status cell has no CLOSED/PIN token`).toMatch(/\b(CLOSED|PIN)\b/i);
    }
  });
});

// ---------------------------------------------------------------------------
// R-K.1 — the pending-stage registration
// ---------------------------------------------------------------------------
describe('converted.json — link-neighbourhoods.js is PENDING at shape_clean', () => {
  it('the entry exists with exactly the five required keys, stage shape_clean (advanced at commit ② when the compute + runner landed), and the file is NOT yet in converted[]', () => {
    const c = readJson<{ converted: string[]; pending: Array<Record<string, string>> }>(CONVERTED_REL);
    const entry = c.pending.find((p) => p.file === STEP_REL);
    expect(entry, `no pending entry for ${STEP_REL}`).toBeTruthy();
    expect(Object.keys(entry ?? {}).sort()).toEqual(['declared', 'file', 'reason', 'registers_at', 'stage']);
    expect(entry?.stage).toBe('shape_clean');
    expect(c.converted).not.toContain(STEP_REL);
  });
});

// ---------------------------------------------------------------------------
// OUTPUT-PANEL LOCKS (commit ②c) — each pins a defect the panel actually found
// ---------------------------------------------------------------------------
describe('output-panel locks — the three defects the golden differential and the panel caught', () => {
  it('the _before_write row reads its OWN preserved field, never the one the runner overwrites after the write', () => {
    const compute = readCode(COMPUTE_REL);
    const i = compute.indexOf('function neighbourhoods_loaded_before_write');
    expect(i, 'observer not found').toBeGreaterThan(-1);
    const body = compute.slice(i, compute.indexOf('\n}', i));
    expect(body).toContain('ctx.matched.neighbourhoods_loaded_before_write');
    // The bug: reading the shared field. The check is scored TWICE and the second scoring
    // happens after the runner has overwritten it with the post-write count.
    expect(body).not.toMatch(/ctx\.matched\.neighbourhoods_loaded(?!_before_write)/);
    // and the runner must actually populate the preserved field
    expect(readCode(INDEX_REL)).toContain('neighbourhoods_loaded_before_write: neighbourhoodsLoaded');
  });

  it('scanned is derived from the POST-write snapshot so records_updated can never exceed records_total (the race the Code Reviewer reproduced live)', () => {
    const idx = readCode(INDEX_REL);
    const i = idx.indexOf('async function runLinkColumnPhase');
    const body = idx.slice(i, idx.indexOf('\nasync function', i + 10));
    expect(body).toContain('const processed = changed + matched.no_match;');
    expect(body).toContain("written[write.targetKey(0)].scanned = processed;");
    // the pre-write eligible count must NOT be the counter source any more
    expect(body).not.toMatch(/\.scanned = eligibleCount/);
  });

  it('no post-write scalar is read through `Number(x) || fallback` — a missing column must throw, not render as a plausible zero', () => {
    const idx = readCode(INDEX_REL);
    const i = idx.indexOf('async function runLinkColumnPhase');
    const body = idx.slice(i, idx.indexOf('\nasync function', i + 10));
    expect(body).toContain("compute.scalar(row, 'no_match_remaining')");
    expect(body).toContain("compute.scalar(row, 'neighbourhoods_loaded')");
    // the specific regression: `|| neighbourhoodsLoaded` made the corpus FAIL check unfirable
    expect(body).not.toMatch(/\|\|\s*neighbourhoodsLoaded/);
    // and `scalar` must genuinely refuse rather than coerce
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- matching this suite's source-read idiom
    const mod = require(abs(COMPUTE_REL)) as { scalar: (row: unknown, k: string) => number };
    expect(() => mod.scalar({}, 'nope')).toThrow(/returned no "nope" column/);
    expect(() => mod.scalar({ n: 'abc' }, 'n')).toThrow(/not a finite number/);
    expect(mod.scalar({ n: 0 }, 'n'), 'a REAL zero must survive').toBe(0);
  });

  it("the declared scope/corpus constants are exported AND consumed here — so the compute docblock's claim that they are 'exported so their locks read the real value' is true, not aspirational", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- matching this suite's source-read idiom
    const mod = require(abs(COMPUTE_REL)) as { ELIGIBLE_SCOPE: string; CORPUS_FILTER: string };
    expect(mod.CORPUS_FILTER).toBe('geom IS NOT NULL');
    expect(mod.ELIGIBLE_SCOPE).toContain('p.neighbourhood_id IS NULL');
    expect(mod.ELIGIBLE_SCOPE).toContain('p.latitude IS NOT NULL');
    // LN-D5: the corpus is geom, never the GeoJSON column the retired branch parsed.
    expect(mod.CORPUS_FILTER).not.toContain('geometry');
    // and the descriptor's declared staleness scope must describe the SAME set
    const d = descriptor();
    expect(String(d.staleness.scope)).toContain('neighbourhood_id IS NULL');
  });
});

// ============================================================================
// RED AT COMMIT ① — every claim below is about an artifact commit ② or ③ builds.
// Each is a REAL assertion that REALLY fails today. Flip to a plain it() in the
// commit that makes it true; a premature flip fails this suite.
// ============================================================================

describe('RED (commit ②) — the compute module', () => {
  it('LANDED at commit ② — scripts/lib/compute/link-neighbourhoods.js exists', () => {
    expect(fs.existsSync(abs(COMPUTE_REL))).toBe(true);
  });

  it('LANDED at commit ② — LN-D2: the compute carries NO PostGIS-availability branch (compute-no-postgis-branch, Rule 2 R-W)', () => {
    const src = readCode(COMPUTE_REL);
    expect(src).not.toMatch(/hasPostGIS/);
    expect(src).not.toMatch(/pg_extension/);
    expect(src).not.toMatch(/@turf/);
  });

  it('LANDED at commit ② — LN-D1: no `-1` sentinel write survives anywhere in the compute', () => {
    const src = readCode(COMPUTE_REL);
    expect(src).not.toMatch(/neighbourhood_id\s*=\s*-1/);
  });
});

describe('RED (commit ②) — the frozen shell and the link_column runner', () => {
  it('LANDED at commit ② — the shell is frozen onto pipeline.step() and pipeline.run( no longer appears (G-shape)', () => {
    const src = readText(STEP_REL);
    expect(src).toMatch(/pipeline\.step\(descriptor, compute\)/);
    expect(src).not.toMatch(/pipeline\.run\(/);
  });

  it('LANDED at commit ② — Ask 1 FORK: the descriptor declares execution.shape "link_column" (NOT link_keyed, whose runner destructures two write plans and would TypeError on this one-target descriptor)', () => {
    expect(descriptor().execution.shape).toBe('link_column');
  });

  it('LANDED at commit ② — scripts/lib/step/index.js exports runLinkColumnPhase and gates it on the declared shape', () => {
    const src = readText(INDEX_REL);
    expect(src).toMatch(/async function runLinkColumnPhase/);
    expect(src).toMatch(/shape === 'link_column'/);
    expect(src).toMatch(/runLinkColumnPhase,/);
  });

  it('LANDED at commit ② — the x-frozen execution.shape enum is widened to carry link_column, and the existing x-ruling node records the rungs tried (G-1 schema-baseline ratchet)', () => {
    const schema = readJson<{ properties: { execution: { properties?: { shape?: { enum: string[]; 'x-ruling': { rungs_tried: string[]; why: string } } } } } }>(SCHEMA_REL);
    const shape = schema.properties.execution.properties?.shape;
    expect(shape?.enum).toContain('link_column');
    expect(shape?.['x-ruling'].rungs_tried.length).toBeGreaterThan(0);
    expect(shape?.['x-ruling'].why).toMatch(/link_column/);
  });

  it('the shape <-> runner pairing is registered in BOTH hand-maintained registries, and the two agree (they are separate lists and updating only one is a silent no-op)', () => {
    const validator = readText('scripts/analysis/step-validate.mjs');
    const generator = readText('scripts/steps/_schema/generate-template-freeze.mjs');
    // step-validate's Rule 12 checker resolves the runner to read from this map.
    expect(validator).toMatch(/link_column:\s*'runLinkColumnPhase'/);
    // the freeze generator maps the other direction.
    expect(generator).toMatch(/runLinkColumnPhase:\s*'link_column'/);
    // RUNNER_NAMES used to be a SECOND hand-typed list beside RUNNER_TO_SHAPE, and adding
    // the 9th runner to only one of them froze a phase_runners array that silently omitted
    // it (measured: "--refresh" reported 8 runners and errored nowhere). It is derived now.
    expect(generator).toMatch(/const RUNNER_NAMES = Object\.keys\(RUNNER_TO_SHAPE\)/);
    const freeze = readJson<{ phase_runners: Array<{ shape: string; runner: string; phase_order: string[] }> }>(
      'scripts/steps/_schema/template-freeze.json',
    );
    const row = must(freeze.phase_runners.find((r) => r.runner === 'runLinkColumnPhase'), 'phase_runners row for runLinkColumnPhase');
    expect(row.shape).toBe('link_column');
    // The declared single-statement shape, frozen: the class-N executor is in the phase
    // order and no batch/cursor call is.
    expect(row.phase_order).toContain('write.executeSetBasedJoinUpdate');
    expect(row.phase_order).toContain('staleness.readPriorEmitWithPosture');
    expect(row.phase_order).not.toContain('write.executeUpsertBatch');
    expect(row.phase_order).not.toContain('write.executeBackfillUpdate');
    expect(row.phase_order).not.toContain('write.executeRetraction');
  });
});

describe('RED (commit ③) — cutover and the spec diff', () => {
  it.fails('FUTURE, flips at commit ③ — R-K mutual exclusion: the file is registered in converted[] and its pending entry is deleted in the SAME commit', () => {
    const c = readJson<{ converted: string[]; pending: Array<{ file: string }> }>(CONVERTED_REL);
    expect(c.converted).toContain(STEP_REL);
    expect(c.pending.some((p) => p.file === STEP_REL)).toBe(false);
  });

  it.fails('FUTURE, flips at commit ③ — Spec 60 §"Link Neighbourhoods" no longer states the three measurably-false things (Turf.js as THE method, the `-1` sentinel, the retired N+1 query pattern)', () => {
    const spec = readText(SPEC60_REL);
    const start = spec.indexOf('### Link Neighbourhoods');
    expect(start).toBeGreaterThan(-1);
    const section = spec.slice(start, spec.indexOf('### ', start + 10));
    expect(section).not.toMatch(/sentinel `-1` for unmatched/);
    expect(section).not.toMatch(/N\+1 query pattern/);
    expect(section).not.toMatch(/No coordinates → skipped/);
  });

  it.fails('FUTURE, flips at commit ③ — Spec 43\'s sources-chain row no longer repeats the retired N+1 claim', () => {
    const spec = readText(SPEC43_REL);
    const row = spec.split('\n').find((l) => l.includes('| `link_neighbourhoods` |'));
    expect(row, 'the link_neighbourhoods row is missing from Spec 43').toBeTruthy();
    expect(row).not.toMatch(/N\+1 hot spot/);
  });

  // NOT it.fails — this one is GREEN TODAY and must STAY green. The anchor resolves right
  // now (Spec 60 still carries the sentence); the hazard is that commit ③ amends the spec
  // and rots it. A standing lock is the only shape that catches that: an it.fails here
  // would have gone red on commit ①, which is exactly backwards. (Caught by running the
  // suite — the draft plan filed this under "prove red first" and it is not a red claim.)
  it('Rule 11 — the order_guarantee anchor RESOLVES in its cited spec, today and after commit ③ amends that spec in the same commit that re-points it', () => {
    const d = descriptor();
    const og = d.checks.find((c) => c.order_guarantee)?.order_guarantee;
    expect(og, 'no check declares an order_guarantee').toBeTruthy();
    const spec = readText(og?.spec_ref ?? SPEC60_REL);
    expect(spec.includes(og?.anchor ?? ' '), `order_guarantee.anchor does not resolve in ${og?.spec_ref}`).toBe(true);
  });
});
