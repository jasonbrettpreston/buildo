#!/usr/bin/env node
/**
 * Claim -> tier -> scope -> stage -> test-artifact planner.
 * SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md
 *
 * WHY THIS EXISTS. Spec 121 §12.9's coverage matrix mapped ID *spaces* to stages
 * and looked complete; a per-claim check found 162 of 283 claims (57%) cited
 * NOWHERE in the plan. The same granularity failure recurred four times in that
 * session (ID-space vs claim, claim vs table-row, field vs property, stage-gate vs
 * item). This tool refuses to repeat it: it maps EVERY claim individually and
 * hard-fails on a single orphan.
 *
 * It answers four questions the implementation plan must answer per claim:
 *   1. TIER   — the cheapest mechanism that actually holds it (Spec 121 §5.12)
 *   2. SCOPE  — built ONCE, or authored PER STEP at conversion (x27)
 *   3. STAGE  — which stage of the plan delivers it
 *   4. K      — at how many CONVERTED STEPS (k of 27) the claim can first fully close
 * and emits the TEST ARTIFACT for each, so "is the test written?" is checkable.
 *
 * DESIGN — the same split as extract-claims.mjs: a SMALL authored rule set, a
 * GENERATED rendering. Unmatched claims fall to UNASSIGNED and the run FAILS.
 * A planner that silently defaults reports full coverage it has not earned.
 *
 * TOOLING GATE (Spec 121 §12b.6): --self-test proves the totality checks FIRE
 * on a deliberately-broken rule set before any output is believed.
 *
 * Usage:
 *   node scripts/violations/plan-claims.mjs                 # print
 *   node scripts/violations/plan-claims.mjs out.md          # write
 *   node scripts/violations/plan-claims.mjs --self-test
 *   node scripts/violations/plan-claims.mjs --json
 *   node scripts/violations/plan-claims.mjs --checklist     # the per-step template
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRegister } from './extract-claims.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPEC_121 = path.join(ROOT, 'docs/specs/01-pipeline/121_assessment_and_verification_methodology.md');
const MIN_PLAUSIBLE_CLAIMS = 200;

/**
 * PINNED NUMBERS (register claim #241 — "pre-pin the expected number"). These
 * are DERIVED counts, pinned so that a rule edit cannot silently reshape the
 * programme. Re-pin deliberately, in the same commit as the rule change.
 *
 * 55-A/B/C: the per-conversion checklist is unsatisfiable at conversion #1 as
 * one 55-item block — 5 items can only be partly discharged and 6 cannot be
 * gated at all. A = hard gate, B = partial named, C = deferred with its k.
 */
const EXPECTED_ABC = { A: 44, B: 5, C: 6, total: 55 };

/**
 * K distribution. The earlier measured pass recorded 227 / 50 / 13; this rule
 * set derives 229 / 48 / 13. The 13 FLEET agree exactly. The ±2 is one boundary
 * ruling, stated so it can be overturned in one line: #20 ("the vocabulary is
 * generated") and #197 ("hand-editing the generated schema fails the drift
 * check") are scored PER_STEP here, because their subject is ONE generated
 * artifact fixed at S1, not a population that grows per conversion. Score the
 * generated schema as fleet-dependent instead and the numbers become 227/50/13.
 */
const EXPECTED_K = { PER_STEP: 229, MIXED: 48, FLEET: 13 };

// ---------------------------------------------------------------------------
// VOCABULARIES — closed. An unknown value is a bug, not a new category.
// ---------------------------------------------------------------------------

/** Spec 121 §5.12, cheapest first. Assign the cheapest tier that actually holds it. */
const TIERS = {
  0: { name: 'schema', artifact: 'scripts/steps/_schema/step.schema.json + invalid fixtures' },
  1: { name: 'db-constraint', artifact: 'migrations 245-248 (CHECK / NOT NULL)' },
  2: { name: 'lint', artifact: 'scripts/ast-grep-rules/*.yml + eslint.config.mjs' },
  3: { name: 'drift', artifact: 'src/tests/violations/generated-drift.infra.test.ts' },
  4: { name: 'census', artifact: 'src/tests/violations/wiring-census.db.test.ts' },
  5: { name: 'incident-replay', artifact: 'src/tests/violations/incidents/*.test.ts' },
  6: { name: 'reversion', artifact: 'src/tests/violations/patches/*.patch + revert-check.mjs' },
  7: { name: 'per-conversion', artifact: 'src/tests/steps/<slug>/*.test.ts' },
};

/** Spec 121 §5.7 — claim shape decides test shape. */
const SHAPE_TEST = {
  P: 'violation test — do the forbidden thing, assert the specific failure',
  B: 'reversion patch + kill-set EQUALITY — the red set is observed, never declared',
  R: 'observed-set equality — execute the corpus, assert emitted set == declared vocabulary',
  W: 'consumer census — assert >=1 reader, and that deleting it reds a named test',
};

const SCOPES = ['UNIVERSAL', 'PER_STEP'];

/**
 * THE K AXIS — "at how many CONVERTED steps (k of 27) can this claim first fully close?"
 *
 * WHY A THIRD AXIS. SCOPE answers *who authors the test* (once, or at each
 * conversion). It does NOT answer *when the assertion can first be true*, and
 * the two are not the same question. A claim can be UNIVERSAL (one test, built
 * once) and still be unclosable until the last step converts — "all ten run
 * statuses are producible" is one assertion over a corpus that does not exist
 * yet. Scheduling that as a green gate at S6 is a green-because-it-never-looked
 * result: the set is trivially satisfiable while k is small.
 *
 *   PER_STEP — k=1 (or k-independent). One converted step gives a COMPLETE
 *              instance; nothing waits on the fleet. Includes claims held by
 *              construction — schema, DB CHECK, runner behaviour — which a
 *              later conversion cannot violate.
 *   MIXED    — the mechanism + its known-bad fixture are provable now, but the
 *              claim's population is AUTHORED per step (declared checks, notes,
 *              declared lineage, lint-visible step code), so the "for all steps"
 *              half closes only at k=27. Carries a monotone partial.
 *   FLEET    — nothing closes before the named k: an observed-set EQUALITY over
 *              what the fleet emits, or a gate that no single conversion can
 *              satisfy even vacuously. Carries a monotone partial.
 *
 * THE DIVIDING RULE, stated once so the assignments are checkable:
 *   enforced BY CONSTRUCTION (library/schema/database generates or rejects it)
 *      -> PER_STEP;  an AUTHORING OBLIGATION over per-step artifacts (a later
 *      conversion can violate it, only the fleet closes it) -> MIXED/FLEET.
 *
 * MONOTONE PARTIAL (Spec 122 §10, S6a). A MIXED or FLEET claim scheduled before
 * its arming k must name what IS assertable at every k — and that partial must
 * be MONOTONE: a floor or a subset ("⊆", "≥1 reader", "only shrinks"), never a
 * closure ("==", "exactly", "census closes"). A non-monotone partial is a gate
 * that goes red on its own progress, so the generator hard-fails on one.
 */
const K_CLASSES = ['PER_STEP', 'MIXED', 'FLEET'];

/** A partial must contain a floor/subset marker ... */
const MONOTONE_MARKER = /⊆|≥|>=|\bat least\b|\bonly (grows|shrinks)\b|\bnever regress\w*\b|\bnon-decreasing\b|\bnon-increasing\b|\bratchet\w*\b|\bsubset\b|\bfloor\b/i;
/** ... and none of these closure/equality markers, which are what a partial is NOT. */
const CLOSURE_MARKER = /==|===|\bexactly\b|\bcensus closes\b|\bequals\b|\bthe whole fleet\b|\bfully closed?\b|\bcomplete(?:s|d)\b/i;

/**
 * Stages of the implementation plan. Order is execution order.
 *
 * ⚠️ THIS TABLE IS HAND-MAINTAINED AND IT IS THE ONE THING HERE THAT CAN ROT.
 * Everything else on this page is derived from the register, so "regenerate and
 * assert zero drift" catches it — but these strings are BAKED INTO the generator,
 * so a regeneration re-emits the stale text and the drift check passes. Measured:
 * a 2026-08-23 grounding pass found `123-claim-plan.md` still emitting
 * "P2 — 20 commits" and "C1 — Pilot 3, simplest / median / enrich-parcels", both
 * superseded by the v2 plan, with every generator green.
 *
 * SOURCE OF RECORD: `.cursor/active_task.md` (Spec 122 §10). When a stage's
 * meaning changes there, change it HERE — no tool will tell you.
 * Last reconciled against the v2 plan (rulings R1-R6 / V1-V6): 2026-08-23.
 */
const STAGES = [
  ['P0', 'Audit instrument — one `resolve-db.js`; 24 grep-visible + 13 `createPool()` tooling files; re-baseline'],
  ['P1', 'Centroid invalidator — a DECLARED DEVIATION from Spec 121 §4.3 (the defect is upstream of the differential)'],
  ['P2', 'Phase B lands — the 17-commit unit, in dependency order; migrations 240/242/243/244 pending CLOUD-side only'],
  ['P3', 'Envelope + ONE GREEN CLOUD RUN — gates C1, not the S-stages (R3)'],
  ['S1', 'Descriptor contract, SCHEMA-CANONICAL (R2) — `step.schema.json` is the vocabulary; prose is generated from it'],
  ['S2', 'pipeline.step() library core + the validator — a VERTICAL SLICE (R4); grows pilot by pilot'],
  ['S3', 'Conformance suite + ast-grep shape rule'],
  ['S4', 'State tables (migrations 245-248) + DB CHECKs'],
  ['S5', 'Cross-step ledger generator + drift guard'],
  ['S6', 'Violation suite: register, ratchet, reversion harness, census, incident replays'],
  ['C1', 'Pilot BY ARCHETYPE — 8 pilots (R4), `assert_schema` first; each pilot grows the library'],
  ['C2', 'Kill criteria evaluated'],
  ['C3', 'Freeze the contract + template — AFTER THE EIGHTH PILOT (R4/R5), never the first'],
  ['C4', 'Shared steps (10 steps, 28 slots)'],
  ['C*', 'EVERY conversion (C1, C4, C5, C6) — the per-step checklist'],
  ['C5', 'Rest of sources'],
  ['C6', 'Remaining chains'],
];
const STAGE_IDS = STAGES.map(([id]) => id);
const stageIdx = (id) => STAGE_IDS.indexOf(id);

/**
 * k -> the earliest stage at which that many `sources` steps are converted.
 * From the v2 C-track: C1 converts the 8 archetype pilots, C4 the 10 shared
 * steps, C5 the rest of `sources` (so k=27 closes at C5, NOT C6 — C6 is the
 * OTHER chains). A claim that spans chains names `armingStage: 'C6'` itself.
 */
function armingStageFor(k) {
  if (k === 0) return 'P0';   // k-independent — no conversion is required
  if (k <= 8) return 'C1';
  if (k <= 18) return 'C4';
  return 'C5';
}

// ---------------------------------------------------------------------------
// THE AUTHORED RULE SET — the only hand-maintained data.
// Ordered; first match wins. ids beat sections.
// ---------------------------------------------------------------------------

const ids = (s) => s.split(/[,\s]+/).filter(Boolean);

const RULES = [
  // ---- tier 1: DB constraints. Free — the migrations are written anyway.
  { ids: ids('22 60 83 94 103 105 186'), tier: 1, scope: 'UNIVERSAL', stage: 'S4' },

  // ---- tier 3: drift over generated artifacts. One assertion covers all.
  { ids: ids('20 82 129 146 197'), tier: 3, scope: 'UNIVERSAL', stage: 'S5' },

  // ---- tier 4: census / observed-set. One query each over the fleet.
  { ids: ids('26 27 28 29 95 166 194 225 249 250 251 252 253'), tier: 4, scope: 'UNIVERSAL', stage: 'S6' },

  // ---- tier 2: lint. The fixture each rule already ships IS the violation test.
  { ids: ids('23 32 57 77 78 89 90 92 96 125 126 127 128 130 131 133 134 135 136 137 138 254 263 271'),
    tier: 2, scope: 'UNIVERSAL', stage: 'S3' },

  // ---- the ledger claims: cross-step, generated, drift-guarded (Spec 122 §5).
  { ids: ids('45 53 54 61 88 117 145'), tier: 3, scope: 'UNIVERSAL', stage: 'S5' },

  // ---- recovery + admin: ship with the library, not after the fleet converts.
  { section: 'A.8', tier: 6, scope: 'UNIVERSAL', stage: 'S2' },

  // ---- incident replay: patches are free via `git revert` over 96 fence commits.
  { section: 'A.18', tier: 5, scope: 'UNIVERSAL', stage: 'S6' },
  { section: 'A.21', tier: 5, scope: 'UNIVERSAL', stage: 'S6' },
  { ids: ids('272 273 274 275 276 277 278'), tier: 5, scope: 'UNIVERSAL', stage: 'S6' },

  // ---- schema: the closed descriptor. Everything in A.1 not already claimed.
  { section: 'A.1', tier: 0, scope: 'UNIVERSAL', stage: 'S1' },
  { section: 'A.2', tier: 1, scope: 'UNIVERSAL', stage: 'S1' },

  // ---- interpretation: notes.json caps + CI checks. Authored per step, checked once.
  { section: 'A.3', tier: 2, scope: 'PER_STEP', stage: 'C*' },

  // ---- the lifecycle. The library's own behaviour: reversion patches, built once.
  { section: 'A.4', tier: 6, scope: 'UNIVERSAL', stage: 'S2' },
  { section: 'A.5', tier: 6, scope: 'UNIVERSAL', stage: 'S2' },
  { section: 'A.6', tier: 6, scope: 'UNIVERSAL', stage: 'S2' },
  { section: 'A.7', tier: 1, scope: 'UNIVERSAL', stage: 'S4' },

  // ---- authoring, lint, maintainability: enforcement layer.
  { section: 'A.9', tier: 2, scope: 'UNIVERSAL', stage: 'S3' },
  { section: 'A.10', tier: 2, scope: 'UNIVERSAL', stage: 'S3' },
  { section: 'A.11', tier: 3, scope: 'UNIVERSAL', stage: 'S5' },

  // ---- conversion workflow + step testing + load-bearing intent: PER STEP.
  //      These are the claims that cannot be discharged once. They are the
  //      per-conversion checklist, and they are why C5 is 27 iterations.
  { section: 'A.12', tier: 7, scope: 'PER_STEP', stage: 'C*' },
  { section: 'A.13', tier: 7, scope: 'PER_STEP', stage: 'C*' },
  { section: 'A.15', tier: 7, scope: 'PER_STEP', stage: 'C*' },

  // ---- red team: grades the library, runs nightly.
  { section: 'A.14', tier: 6, scope: 'UNIVERSAL', stage: 'S6' },

  // ---- method claims (Spec 121 itself) + database identity.
  { section: 'A.16', tier: 4, scope: 'UNIVERSAL', stage: 'S6' },
  { section: 'A.19', tier: 4, scope: 'UNIVERSAL', stage: 'S6' },
  { section: 'A.20', tier: 2, scope: 'UNIVERSAL', stage: 'P0' },
];

function assign(claim) {
  for (const r of RULES) {
    if (r.ids && r.ids.includes(claim.id)) return r;
    if (r.section && r.section === claim.section) return r;
  }
  return null; // -> UNASSIGNED -> hard fail
}

// ---------------------------------------------------------------------------
// THE K RULE SET — ordered, first match wins, NO CATCH-ALL.
// A claim no rule matches falls to UNASSIGNED and the run FAILS. A default of
// "PER_STEP" would be exactly the silent-default this tool exists to refuse.
// ---------------------------------------------------------------------------

/**
 * The tier-3 claims whose generated artifact is derived from PER-STEP declared
 * material (descriptors' `reads`/`writes`, the cross-step ledger, the DAG), so
 * the artifact is only as complete as the converted subset. The rest of tier 3
 * (20, 197, 139-144) are properties of ONE artifact — the generated schema, the
 * runner core, the deprecation lifecycle — and close without any conversion.
 */
const K_TIER3_FLEET_DEPENDENT = new Set(ids('45 53 54 61 82 88 117 129 145 146 147'));

const K_RULES = [
  { id: 'K1', k: 'PER_STEP', armingK: 1, when: (r) => r.scope === 'PER_STEP',
    why: 'authored AT the conversion — conversion #1 yields a complete instance, #2..27 repeat it' },

  { id: 'K2', k: 'FLEET', armingK: 27, when: (r) => r.shape === 'R',
    partial: 'the observed set at k converted steps is ⊆ the declared vocabulary and only grows; the two are compared for equality once k reaches 27',
    why: 'Spec 121 §5.7 shape R is an observed-set equality over what the corpus EMITS — it cannot close while a producer is unconverted' },

  { id: 'K3', k: 'MIXED', armingK: 27, when: (r) => r.section === 'A.19',
    partial: 'the census runs over the converted subset (⊆ the fleet) and asserts a floor of ≥1 reader per declared field; the covered set only grows',
    why: 'the wiring census is already phrased as a floor, so it runs from k=1 — but "no orphan anywhere" needs every step declared' },

  { id: 'K4', k: 'MIXED', armingK: 27, when: (r) => r.tier === 2 && r.section !== 'A.20',
    partial: 'the rule is red on its own known-bad fixture at k=0, and `amnesty.json` (#138) only shrinks — the amnestied set is ⊆ the previous list at every k',
    why: 'a lint rule binds a file only once that file is authored; unconverted steps sit under amnesty, which IS the partial' },

  { id: 'K5', k: 'PER_STEP', armingK: 0, when: (r) => r.section === 'A.20',
    why: 'database identity is repo-wide (24 grep-visible + 13 createPool tooling files), closed by P0 re-baselining — it does not wait on conversions' },

  { id: 'K6', k: 'MIXED', armingK: 27, when: (r) => r.tier === 3 && K_TIER3_FLEET_DEPENDENT.has(r.id),
    partial: 'the generator + drift guard ship over the converted subset (⊆ the fleet) and the derived edge set only grows; the seed `scripts/seeds/lineage-meta-snapshot.json` already observes 27/28 `sources` slots, so no step is missing at closure',
    why: 'derived from DECLARED lineage, which arrives one conversion at a time' },

  { id: 'K7', k: 'PER_STEP', armingK: 0, when: (r) => r.tier === 3,
    why: 'a property of ONE generated artifact (schema / runner core / deprecation lifecycle) — no conversion changes it' },

  { id: 'K8', k: 'PER_STEP', armingK: 0, when: (r) => r.tier === 0 || r.tier === 1,
    why: 'held BY CONSTRUCTION — the schema or the database rejects the violation, so a later conversion cannot un-hold it' },

  { id: 'K9', k: 'PER_STEP', armingK: 0, when: (r) => r.tier === 4,
    why: 'method / register claims (A.16): their corpus is the two spec texts and the register, not the step fleet' },

  { id: 'K10', k: 'PER_STEP', armingK: 0, when: (r) => r.tier === 5,
    why: 'incident replay — the fixture is reproduced from history; it is red today and stays red' },

  { id: 'K11', k: 'PER_STEP', armingK: 0, when: (r) => r.tier === 6,
    why: 'runner / library behaviour, enforced by construction once the library ships' },
];

/**
 * PER-CLAIM OVERRIDES — the S0 precedent: an override beats a too-coarse rule.
 * Every entry carries the reason the rule is wrong for THAT claim. This table
 * is the honest home for judgment; a rule that quietly absorbs the exception is
 * how a coarse assignment passes review.
 */
const K_OVERRIDES = {
  // --- rule K2 is too coarse: one shape-R claim's corpus is not the fleet.
  225: { k: 'PER_STEP', armingK: 0,
    why: 'shape R, but the observed set is the TWO SPEC TEXTS, not what steps emit — `extract-claims.mjs` closes it today at k=0' },

  // --- rule K11 is too coarse: two tier-6 claims are authoring obligations, not construction.
  97: { k: 'MIXED', armingK: 27,
    partial: 'the cross-reference runs over the converted subset (⊆ the fleet) and the covered invariant set only grows',
    why: 'the runner cannot generate a DECLARED check from a migration — a human authors it per step, so a later conversion can violate it' },
  189: { k: 'MIXED', armingK: 27,
    partial: 'the model-based suite count is a ratchet — ≤1 at every k, and computes carry zero',
    why: 'a count over the fleet\'s suites is an authoring obligation; conversion #12 can add a second suite' },

  // --- the 55-B rows: per-step claims that conversion #1 can only PARTLY discharge.
  36: { k: 'MIXED', armingK: 27,
    partial: 'the flag fires now on a backdated `measured.date` fixture; the real population only grows, and no entry ever un-ages',
    why: 'TIME-armed, not k-armed: at conversion #1 no note is old enough to be stale, so a hard gate is vacuously green' },
  175: { k: 'MIXED', armingK: 27,
    partial: 'every generated statement of the converted subset (⊆ the 64) PREPAREs/EXPLAINs cleanly, and the clean set only grows',
    why: 'the 64 statements exist only once every generator does — "all 64" at conversion #1 is a count of 2' },
  181: { k: 'MIXED', armingK: 2,
    partial: 'the committed precision/recall number is a ratchet — it may only rise, never regress',
    why: 'conversion #1 COMMITS the baseline; "never regress" has nothing to compare against until the second run' },
  183: { k: 'MIXED', armingK: 27,
    partial: 'the age check is red now on a backdated fixture, and the reviewed-fixture set only grows',
    why: 'TIME-armed: no fixture is 180 days old at conversion #1' },
  206: { k: 'MIXED', armingK: 2,
    partial: 'the collision detector is red now on a two-producer fixture; the set of merged producer keys only grows',
    why: 'a merge collision needs two producers — conversion #1 has one' },

  // --- the 55-C rows: DEFERRED. No conversion-#1 gate exists, not even vacuously.
  160: { k: 'FLEET', armingK: 2,
    partial: 'the rate-limit counter is asserted over the conversions already merged (⊆ the fleet) and only grows',
    why: 'a rate LIMIT over conversions is undefined at the first conversion' },
  161: { k: 'FLEET', armingK: 20,
    partial: 'the re-audit queue names ≥1 converted candidate from the merged subset and only grows',
    why: 'the claim names its own arming k: the re-audit happens at ~#20' },
  168: { k: 'FLEET', armingK: 27, armingStage: 'C6',
    partial: 'chain-level e2e tests are ⊆ six at every k — the count is a ceiling that may not be exceeded',
    why: 'SIX CHAIN-level tests, not step-level: it arms only when the last chain converts (C6), and "exactly six" is not a per-step gate' },
  177: { k: 'FLEET', armingK: 27,
    partial: 'the HTTP-fixture harness is red on its own known-bad fixture, and the set of HTTP-source steps under lockdown only grows',
    why: 'BLOCKED, not merely early — `nock` is not installed; S6b must resolve the library before any conversion can be gated on it' },
  178: { k: 'FLEET', armingK: 27,
    partial: 'the unused-fixture assertion is red on its own fixture, and the set of steps under it only grows',
    why: 'same `nock` blocker as #177 (S6b)' },
  179: { k: 'FLEET', armingK: 27,
    partial: 'the empty-terminal-page fixture is red on its own known-bad case, and the set of paging steps covered only grows',
    why: 'same `nock` blocker as #177 (S6b)' },
};

/** K assignment. Override beats rule; nothing defaults. */
function assignK(row) {
  const ov = K_OVERRIDES[row.id];
  if (ov) return { ...ov, kSource: `override #${row.id}` };
  for (const r of K_RULES) {
    if (r.when(row)) {
      return {
        k: r.k, armingK: r.armingK, armingStage: r.armingStage, partial: r.partial, why: r.why, kSource: r.id,
      };
    }
  }
  return null; // -> UNASSIGNED -> hard fail
}

/** Arming stage + the gate stage the checklist will use. Derived, never authored. */
function armingOf(row) {
  const armingStage = row.armingStage ?? armingStageFor(row.armingK);
  // A monotone partial is assertable from k=0 (⊆ of an empty set holds), so a
  // claim that carries one may legitimately be SCHEDULED before its arming k.
  // A claim with no partial may not: it is gated where it can first be true.
  const effectiveArmingStage = row.partial ? 'P0' : armingStage;
  const gateStage = row.k === 'FLEET' ? armingStage : row.stage;
  return { armingStage, effectiveArmingStage, gateStage };
}

/** Test id + target file, derived. Never hand-written. */
function testArtifact(row) {
  const t = TIERS[row.tier];
  const file = row.scope === 'PER_STEP'
    ? 'src/tests/steps/<slug>/violations.test.ts'
    : t.artifact;
  return { testId: `R-${String(row.id).padStart(3, '0')}`, file };
}

// ---------------------------------------------------------------------------
// TOTALITY CHECKS — the whole point. Each returns [] or a list of failures.
// ---------------------------------------------------------------------------

function totality(rows, total) {
  const f = [];
  const un = rows.filter((r) => r.tier === undefined);
  if (un.length) f.push(`${un.length} claim(s) UNASSIGNED: ${un.map((r) => r.id).join(', ')}`);
  if (rows.length !== total) f.push(`row count ${rows.length} != parsed ${total}`);

  const tierSum = Object.keys(TIERS).reduce((n, k) => n + rows.filter((r) => String(r.tier) === k).length, 0);
  if (tierSum !== rows.length) f.push(`tier counts sum to ${tierSum}, not ${rows.length} — an unsummed tier table is how 107 claims hid`);

  const scopeSum = SCOPES.reduce((n, s) => n + rows.filter((r) => r.scope === s).length, 0);
  if (scopeSum !== rows.length) f.push(`scope counts sum to ${scopeSum}, not ${rows.length}`);

  const badStage = rows.filter((r) => !STAGE_IDS.includes(r.stage));
  if (badStage.length) f.push(`${badStage.length} claim(s) at an unknown stage`);

  const noTest = rows.filter((r) => !r.testId || !r.file);
  if (noTest.length) f.push(`${noTest.length} claim(s) have no test artifact`);

  // Every stage that owns claims must be reachable, and no stage may be a
  // silent dumping ground: >40% of the register in one stage is a smell.
  for (const s of STAGE_IDS) {
    const n = rows.filter((r) => r.stage === s).length;
    if (n / rows.length > 0.4) f.push(`stage ${s} holds ${n}/${rows.length} claims (>40%) — likely an over-broad rule`);
  }

  // ---- K AXIS ----------------------------------------------------------
  // K1. Nothing defaults. A claim no K rule matched is a hard fail, exactly as
  //     an unassigned tier is — a K axis with a fallback measures nothing.
  const kUn = rows.filter((r) => !K_CLASSES.includes(r.k));
  if (kUn.length) f.push(`${kUn.length} claim(s) have NO K assignment: ${kUn.map((r) => r.id).join(', ')}`);

  const kSum = K_CLASSES.reduce((n, k) => n + rows.filter((r) => r.k === k).length, 0);
  if (kSum !== rows.length) f.push(`K counts sum to ${kSum}, not ${rows.length}`);
  if (rows.length === total && total >= MIN_PLAUSIBLE_CLAIMS) {
    for (const k of K_CLASSES) {
      const n = rows.filter((r) => r.k === k).length;
      if (n !== EXPECTED_K[k]) f.push(`K ${k} holds ${n}, pinned at ${EXPECTED_K[k]} — re-pin deliberately or fix the assignment`);
    }
  }

  // K2. THE TOTALITY CHECK: stage >= arming_stage. A claim may not be SCHEDULED
  //     at a stage before it can first be true. The only exemption is a monotone
  //     partial — which is why a MIXED/FLEET claim without one fails here too.
  for (const r of rows) {
    if (!r.effectiveArmingStage || !STAGE_IDS.includes(r.effectiveArmingStage)) {
      f.push(`#${r.id}: no arming stage derived`);
      continue;
    }
    if (stageIdx(r.stage) < stageIdx(r.effectiveArmingStage)) {
      f.push(`#${r.id}: scheduled at ${r.stage} but arms at ${r.effectiveArmingStage} (k=${r.armingK}) — it cannot be true when it is gated`);
    }
  }

  // K3. Every MIXED/FLEET claim carries a MONOTONE partial, or it is a gate that
  //     goes red on its own progress (Spec 122 §10 S6a / S6b).
  for (const r of rows.filter((x) => x.k === 'MIXED' || x.k === 'FLEET')) {
    if (!r.partial) { f.push(`#${r.id}: ${r.k} with no partial — name what is assertable at every k, or defer it`); continue; }
    if (!MONOTONE_MARKER.test(r.partial)) f.push(`#${r.id}: partial is not monotone — it states no floor/subset ("⊆", "≥1", "only shrinks")`);
    if (CLOSURE_MARKER.test(r.partial)) f.push(`#${r.id}: partial asserts a CLOSURE ("${(r.partial.match(CLOSURE_MARKER) ?? [])[0]}") — a partial is a floor, never an equality`);
  }

  // K4. The 55 per-step items split A / B / C, and the split is pinned. B must
  //     name its partial; C must name its arming k (that IS the deferral).
  const per = rows.filter((r) => r.scope === 'PER_STEP');
  if (per.length) {
    const abc = { A: per.filter((r) => r.k === 'PER_STEP'), B: per.filter((r) => r.k === 'MIXED'), C: per.filter((r) => r.k === 'FLEET') };
    if (abc.A.length + abc.B.length + abc.C.length !== per.length) f.push(`A/B/C split covers ${abc.A.length + abc.B.length + abc.C.length} of ${per.length} per-step claims`);
    for (const r of abc.C) if (!(r.armingK > 1)) f.push(`#${r.id}: 55-C is DEFERRED, so it must name an arming k > 1`);
    if (per.length === EXPECTED_ABC.total) {
      for (const k of ['A', 'B', 'C']) {
        if (abc[k].length !== EXPECTED_ABC[k]) f.push(`55-${k} holds ${abc[k].length}, pinned at ${EXPECTED_ABC[k]} — re-pin deliberately or fix the assignment`);
      }
    }
  }
  return f;
}

// ---------------------------------------------------------------------------
// SELF-TEST — prove the totality checks fire before believing a green run.
// ---------------------------------------------------------------------------

function selfTest() {
  const fail = [];
  /** A clean row. K fields included — a fixture without them tests nothing about the K axis. */
  const mk = (id, over = {}) => {
    const base = {
      id, section: 'A.1', tier: 0, scope: 'UNIVERSAL', stage: 'S1', testId: 'R-001', file: 'x',
      k: 'PER_STEP', armingK: 0, kSource: 'K8', ...over,
    };
    return { ...base, ...armingOf(base) };
  };

  // 1. an unassigned claim must be caught
  if (!totality([mk('1'), { id: '2', section: 'A.1' }], 2).length) fail.push('UNASSIGNED not caught');
  // 2. a bad stage must be caught
  if (!totality([mk('1', { stage: 'ZZ' })], 1).length) fail.push('unknown stage not caught');
  // 3. a missing test artifact must be caught
  if (!totality([mk('1', { testId: null })], 1).length) fail.push('missing test artifact not caught');
  // 4. a count mismatch must be caught
  if (totality([mk('1')], 2).length === 0) fail.push('count mismatch not caught');
  // 5. an over-broad stage must be caught
  if (!totality(Array.from({ length: 10 }, (_, i) => mk(String(i))), 10).length) fail.push('over-broad stage not caught');
  // 6. NEGATIVE CONTROL — a genuinely clean set must pass
  const clean = [mk('1'), mk('2', { stage: 'S2', tier: 6 }), mk('3', { stage: 'S3', tier: 2 })];
  if (totality(clean, 3).length) fail.push('negative control: a clean set was rejected');

  // ---- K AXIS. Each new hard-fail proved to FIRE on a known-bad fixture FOR
  //      THE RIGHT REASON (the message is matched, not merely the failure count
  //      — a fixture that reds on an unrelated check has proved nothing), and
  //      proved NOT to fire on the corresponding good one (Spec 121 §12b.6).
  const MONO = 'the covered set is ⊆ the fleet and only grows';
  /** Three clean rows at three distinct stages, so no unrelated check fires. */
  const ctx = () => [mk('p1'), mk('p2', { stage: 'S2', tier: 6 }), mk('p3', { stage: 'S3', tier: 2 })];
  const fires = (needle, ...bad) => {
    const rows = [...ctx(), ...bad];
    return totality(rows, rows.length).some((m) => m.includes(needle));
  };
  const passes = (...good) => {
    const rows = [...ctx(), ...good];
    return totality(rows, rows.length).length === 0;
  };

  // 7. a claim no K rule assigned
  if (!fires('NO K assignment', mk('x', { k: undefined, stage: 'S6' }))) fail.push('K UNASSIGNED not caught');
  // 8. an off-vocabulary K value
  if (!fires('NO K assignment', mk('x', { k: 'SOMETIMES', stage: 'S6' }))) fail.push('unknown K class not caught');
  // 9. THE TOTALITY CHECK — a k=1 claim gated at S4, four stages before it can be true
  if (!fires('cannot be true when it is gated', mk('x', { armingK: 1, stage: 'S4' }))) fail.push('stage < arming_stage not caught');
  //    9b. NEGATIVE CONTROL — the same claim gated at C* is legal
  if (!passes(mk('x', { armingK: 1, stage: 'C*' }))) fail.push('negative control: a correctly-scheduled k=1 claim was rejected');
  // 10. MIXED/FLEET with NO partial — trips the partial check AND check 9 (they reinforce)
  if (!fires('with no partial', mk('x', { k: 'FLEET', armingK: 27, stage: 'S6' }))) fail.push('FLEET without a partial not caught');
  if (!fires('with no partial', mk('x', { k: 'MIXED', armingK: 27, stage: 'S6' }))) fail.push('MIXED without a partial not caught');
  if (!fires('cannot be true when it is gated', mk('x', { k: 'FLEET', armingK: 27, stage: 'S6' }))) fail.push('a partial-less FLEET claim was not also caught by the stage check');
  // 11. a NON-MONOTONE partial — a closure dressed up as a partial
  if (!fires('asserts a CLOSURE', mk('x', { k: 'FLEET', armingK: 27, stage: 'S6', partial: 'the observed set == the declared enum, at least in principle' }))) fail.push('non-monotone partial (equality) not caught');
  if (!fires('asserts a CLOSURE', mk('x', { k: 'FLEET', armingK: 27, stage: 'S6', partial: 'at least the declared vocabulary, once the census closes' }))) fail.push('non-monotone partial (closure) not caught');
  // 12. a partial that states no floor at all
  if (!fires('is not monotone', mk('x', { k: 'MIXED', armingK: 27, stage: 'S6', partial: 'the rule runs over the corpus' }))) fail.push('partial with no floor not caught');
  //    12b. NEGATIVE CONTROL — a genuinely monotone partial passes every K check
  if (!passes(mk('x', { k: 'FLEET', armingK: 27, stage: 'S6', partial: MONO }))) fail.push('negative control: a monotone partial was rejected');
  // 13. a deferred 55-C row that does not name its arming k
  if (!fires('must name an arming k', mk('x', { scope: 'PER_STEP', stage: 'C*', k: 'FLEET', armingK: 1, partial: MONO }))) fail.push('deferred 55-C row with no arming k not caught');
  //    13b. NEGATIVE CONTROL — the same row with k=20 named
  if (!passes(mk('x', { scope: 'PER_STEP', stage: 'C*', k: 'FLEET', armingK: 20, partial: MONO }))) fail.push('negative control: a properly-deferred 55-C row was rejected');
  // 14. the pinned A/B/C split — 55 undifferentiated per-step items is the very
  //     state S6a exists to refute, so it must red.
  const per55 = Array.from({ length: 55 }, (_, i) => mk(`q${i}`, { scope: 'PER_STEP', stage: 'C*', armingK: 1 }));
  if (!totality(per55, 55).some((m) => m.includes('55-B'))) fail.push('A/B/C split mismatch (55 A, 0 B, 0 C) not caught');

  if (fail.length) {
    console.error('SELF-TEST FAILED:');
    for (const x of fail) console.error(`  - ${x}`);
    return false;
  }
  console.log('SELF-TEST PASSED — 17 totality assertions incl. 4 negative controls (6 original + 11 K-axis).');
  return true;
}

// ---------------------------------------------------------------------------
// RENDER
// ---------------------------------------------------------------------------

function render(rows) {
  const o = [];
  const by = (k, v) => rows.filter((r) => r[k] === v);

  o.push('<!-- GENERATED by scripts/violations/plan-claims.mjs — do not hand-edit. -->');
  o.push('<!-- Regenerate: node scripts/violations/plan-claims.mjs docs/reports/generated/123-claim-plan.md -->');
  o.push('');
  o.push(`**${rows.length} claims, each assigned a tier, a scope, a stage, a K (arming) class and a test artifact. Zero unassigned on any axis.**`);
  o.push('');

  o.push('## Scope split — the number that sizes the programme');
  o.push('');
  o.push('| Scope | Claims | Meaning |');
  o.push('|---|---:|---|');
  o.push(`| UNIVERSAL | ${by('scope', 'UNIVERSAL').length} | discharged ONCE, before any step converts |`);
  o.push(`| PER_STEP | ${by('scope', 'PER_STEP').length} | authored at each conversion — **×27 for \`sources\`** |`);
  o.push('');
  const per = by('scope', 'PER_STEP').length;
  o.push(`> **${by('scope', 'UNIVERSAL').length} of ${rows.length} claims are front-loaded.** The per-step tail is **${per} claims × 27 steps**, and those are the ones that cannot be written in advance — they need the step's own tables, predicates and fences.`);
  o.push('');

  o.push('## K axis — arming: at how many CONVERTED steps (k of 27) can the claim first fully close?');
  o.push('');
  o.push('> SCOPE says who authors the test. K says **when the assertion can first be true** — and they are not the same question. A UNIVERSAL claim can be one test, built once, and still be unclosable until the last step converts; gating it early is green-because-it-never-looked. The dividing rule: enforced **by construction** (schema / database / library) ⇒ `PER_STEP`; an **authoring obligation** over per-step artifacts, which a later conversion can still violate ⇒ `MIXED`/`FLEET`.');
  o.push('');
  o.push('| K | Claims | Meaning | Discharge |');
  o.push('|---|---:|---|---|');
  o.push(`| PER_STEP | ${by('k', 'PER_STEP').length} | k=1 or k-independent — one converted step gives a complete instance | the hard gate |`);
  o.push(`| MIXED | ${by('k', 'MIXED').length} | mechanism provable now; the population is authored per step, so "for all steps" closes at k=27 | monotone partial now, closure at k=27 |`);
  o.push(`| FLEET | ${by('k', 'FLEET').length} | nothing closes before the named k — an observed-set equality over what the fleet emits, or a gate no single conversion satisfies | monotone partial now, deferred gate at its arming k |`);
  o.push('');
  o.push(`> Measured against the earlier pass's **227 / 50 / 13**: FLEET agrees exactly; PER_STEP/MIXED differ by ±2 (see \`EXPECTED_K\` in the generator — the boundary is whether the generated *schema*'s drift claims (#20, #197) count as fleet-dependent). The counts are pinned: a rule edit that reshapes them hard-fails until re-pinned.`);
  o.push('');
  o.push('### Arming stages — where each k lands on the C-track');
  o.push('');
  o.push('| k | Arms at | Why |');
  o.push('|---|---|---|');
  o.push('| 0 | — | k-independent: no conversion is required |');
  o.push('| 1–8 | **C1** | the eight archetype pilots |');
  o.push('| 9–18 | **C4** | + the ten shared steps |');
  o.push('| 19–27 | **C5** | the rest of `sources` — k=27 closes at **C5**, not C6 |');
  o.push('| across chains | **C6** | permits / coa / deep_scrapes / entities / wsib |');
  o.push('');
  o.push('### The monotone partials — what is assertable at every k');
  o.push('');
  o.push('> A `MIXED`/`FLEET` claim scheduled before its arming k must name a partial, and the partial must be **monotone** — a floor or a subset (`⊆`, `≥1 reader`, "only shrinks"), never a closure (`==`, "exactly", "census closes"). A non-monotone partial is a gate that goes red on its own progress. The generator hard-fails on a missing or non-monotone partial, and the same claim then also trips `stage >= arming_stage` — the two checks reinforce.');
  o.push('');
  o.push('| Source | K | # | Claims | The monotone partial |');
  o.push('|---|---|---:|---|---|');
  const kSources = [...new Set(rows.filter((r) => r.partial).map((r) => r.kSource))];
  for (const src of kSources) {
    const sr = rows.filter((r) => r.kSource === src);
    const all = sr.map((r) => r.id);
    const shown = all.length > 8 ? `${all.slice(0, 8).join(', ')} … (+${all.length - 8})` : all.join(', ');
    o.push(`| \`${src}\` | ${sr[0].k} | ${sr.length} | ${shown} | ${sr[0].partial.replace(/\|/g, '\\|')} |`);
  }
  o.push('');
  o.push('## Tier distribution (Spec 121 §5.12 — cheapest mechanism that holds it)');
  o.push('');
  o.push('| Tier | Mechanism | Claims | Artifact |');
  o.push('|---|---|---:|---|');
  for (const k of Object.keys(TIERS)) {
    const n = rows.filter((r) => String(r.tier) === k).length;
    o.push(`| ${k} | ${TIERS[k].name} | ${n} | \`${TIERS[k].artifact}\` |`);
  }
  o.push(`| | **TOTAL** | **${rows.length}** | |`);
  o.push('');

  o.push('## Claims per stage — the implementation plan');
  o.push('');
  o.push('| Stage | What | Claims | Test shapes |');
  o.push('|---|---|---:|---|');
  for (const [id, what] of STAGES) {
    const sr = by('stage', id);
    const shapes = [...new Set(sr.map((r) => r.shape).filter(Boolean))].sort().join(' ') || '—';
    o.push(`| **${id}** | ${what} | ${sr.length || '·'} | ${shapes} |`);
  }
  o.push('');

  o.push('## Test shape distribution (Spec 121 §5.7)');
  o.push('');
  o.push('| Shape | Claims | Test form |');
  o.push('|---|---:|---|');
  for (const [k, v] of Object.entries(SHAPE_TEST)) {
    o.push(`| ${k} | ${rows.filter((r) => r.shape === k).length} | ${v} |`);
  }
  const noShape = rows.filter((r) => !SHAPE_TEST[r.shape]).length;
  if (noShape) o.push(`| *(unstated)* | ${noShape} | shape not declared in the register — defaults to violation test |`);
  o.push('');

  o.push('## Full assignment — every claim, its stage, its test');
  o.push('');
  for (const [id, what] of STAGES) {
    const sr = by('stage', id);
    if (!sr.length) continue;
    o.push(`### ${id} — ${what} (${sr.length})`);
    o.push('');
    o.push('| # | § | Tier | Scope | K | Arms | Test ID | Test artifact | Claim |');
    o.push('|---|---|---|---|---|---|---|---|---|');
    for (const r of sr) {
      const arm = r.armingK === 0 ? '—' : `k=${r.armingK} → ${r.armingStage}`;
      o.push(`| ${r.id} | ${r.section} | ${r.tier} ${TIERS[r.tier].name} | ${r.scope} | ${r.k} | ${arm} | \`${r.testId}\` | \`${r.file}\` | ${String(r.claim).replace(/\|/g, '\\|').slice(0, 90)} |`);
    }
    o.push('');
  }
  return o.join('\n');
}

function renderChecklist(rows) {
  const per = rows.filter((r) => r.scope === 'PER_STEP');
  const A = per.filter((r) => r.k === 'PER_STEP');
  const B = per.filter((r) => r.k === 'MIXED');
  const C = per.filter((r) => r.k === 'FLEET');
  const cell = (s, n) => String(s ?? '').replace(/\|/g, '\\|').slice(0, n);
  const o = [];
  o.push('<!-- GENERATED by scripts/violations/plan-claims.mjs --checklist — do not hand-edit. -->');
  o.push('');
  o.push(`# Per-conversion claim checklist — ${per.length} items, split ${A.length} / ${B.length} / ${C.length}`);
  o.push('');
  o.push('> Copy into each step\'s conversion task. **These claims cannot be discharged in advance** — they need the step\'s own tables, predicates and fences. Every line becomes a test in `src/tests/steps/<slug>/`.');
  o.push('');
  o.push(`> ⚠️ **The ${per.length} are NOT one block.** At conversion #1 the list is unsatisfiable as written: ${B.length} items can only be *partly* discharged and ${C.length} cannot be gated at all, not even vacuously. Gating all ${per.length} at pilot 1 makes "55-A proven red" undefined — so the list splits by its K assignment (see \`123-claim-plan.md\`): **A = hard gate · B = partial named · C = deferred, arming k named.** Only the A block is a per-conversion pass/fail.`);
  o.push('');

  o.push(`## 55-A — the hard per-conversion gate (${A.length})`);
  o.push('');
  o.push(`> Every one of these is fully dischargeable against a SINGLE converted step (k=1). All ${A.length} present and proven red before the conversion's Gate 4d passes. No exceptions, no partials.`);
  o.push('');
  o.push('| ☐ | # | Test ID | Claim | The violation to write |');
  o.push('|---|---|---|---|---|');
  for (const r of A) o.push(`| ☐ | ${r.id} | \`${r.testId}\` | ${cell(r.claim, 80)} | ${cell(r.violation, 110)} |`);
  o.push('');

  o.push(`## 55-B — partial now, closure at the named k (${B.length})`);
  o.push('');
  o.push('> The mechanism is provable at this conversion; the **population is not there yet**. The partial is the gate — and it is monotone, so it can never go red on the fleet\'s own progress. Asserting the full claim here would be vacuously green.');
  o.push('');
  o.push('| ☐ | # | Test ID | Claim | Arms | Why only a partial at #1 | The partial that IS gated now |');
  o.push('|---|---|---|---|---|---|---|');
  for (const r of B) o.push(`| ☐ | ${r.id} | \`${r.testId}\` | ${cell(r.claim, 70)} | k=${r.armingK} → ${r.armingStage} | ${cell(r.why, 110)} | ${cell(r.partial, 150)} |`);
  o.push('');

  o.push(`## 55-C — DEFERRED, arming k named (${C.length})`);
  o.push('');
  o.push('> **Not a conversion-#1 gate.** No conversion can satisfy these, so a checkbox here would be a lie in either direction. Each names the k at which it arms and the stage that k lands on; each still carries a monotone partial, so progress toward it is visible rather than merely promised.');
  o.push('');
  o.push('| # | Test ID | Claim | Arms at | Gate stage | Why it cannot be gated at #1 | The monotone partial |');
  o.push('|---|---|---|---|---|---|---|');
  for (const r of C) o.push(`| ${r.id} | \`${r.testId}\` | ${cell(r.claim, 60)} | k=${r.armingK} | **${r.gateStage}** | ${cell(r.why, 110)} | ${cell(r.partial, 120)} |`);
  o.push('');

  o.push(`**Gate:** all ${A.length} 55-A items present and proven red, plus all ${B.length} 55-B partials present and proven red, before the conversion's Gate 4d passes. The ${C.length} 55-C items are tracked at their arming stage (${[...new Set(C.map((r) => r.gateStage))].sort().join(', ')}) and are **not** counted against the conversion.`);
  o.push('');
  o.push(`> Expect the ${per.length} to GROW per step (v2 plan, R5: growth is PH-3 working). The split is regenerated with the register — it is not a hand-maintained list.`);
  return o.join('\n');
}

// ---------------------------------------------------------------------------

function main(argv) {
  if (argv.includes('--self-test')) return selfTest() ? 0 : 1;
  if (!selfTest()) {
    console.error('Refusing to emit a plan from unproven totality checks.');
    return 1;
  }

  const claims = parseRegister(fs.readFileSync(SPEC_121, 'utf8'));
  if (claims.length < MIN_PLAUSIBLE_CLAIMS) {
    console.error(`Parsed only ${claims.length} claims — refusing to plan against a truncated register.`);
    return 1;
  }

  const rows = claims.map((c) => {
    const a = assign(c);
    const row = { ...c, ...(a ?? {}) };
    if (a) Object.assign(row, testArtifact(row));
    const kr = assignK(row);
    if (kr) Object.assign(row, kr, armingOf({ ...row, ...kr }));
    return row;
  });

  const failures = totality(rows, claims.length);
  if (failures.length) {
    console.error('TOTALITY FAILED — the plan does not cover every claim:');
    for (const x of failures) console.error(`  - ${x}`);
    return 1;
  }

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ total: rows.length, rows }, null, 2));
    return 0;
  }

  const text = argv.includes('--checklist') ? renderChecklist(rows) : render(rows);
  const outPath = argv.find((a) => !a.startsWith('--'));
  if (outPath) {
    fs.writeFileSync(outPath, `${text}\n`);
    console.log(`Wrote ${rows.length} planned claims -> ${outPath}`);
  } else {
    console.log(text);
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
