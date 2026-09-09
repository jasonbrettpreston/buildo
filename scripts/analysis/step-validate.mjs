#!/usr/bin/env node
/**
 * step:validate — Spec 123 integrated validation (operator ruling R-R, 2026-08-29).
 * Also the mechanism behind Spec 124 Rule 13 "A step validates itself."
 *
 * "Validation is part of the standard step and ENFORCED — never a separate track"
 * (Spec 120's validator drifted on a separate track; Spec 123's scorecard was not
 * produced for pilots 4-5). This is the ONE command that, for a converted (or
 * pending) step:
 *   (i)   runs validateDescriptor (AJV + grandfathered + semantic) on its descriptor
 *   (ii)  runs the shape gate for its file + compute module
 *   (iii) runs vitest for step-conformance + golden-fingerprint + src/tests/steps/<slug>/
 *   (iv)  checks golden captures: post/ present for every declared invocation,
 *         fingerprint current, --compare of newest post vs pre shows only
 *         explained-bucket diffs
 *   (v)   computes the Spec 123 SS6 SCORECARD G0-G9 from ARTIFACTS, never prose
 *   (vi)  prints the Spec 124 POLICY COVERAGE MATRIX (Rules 1-13) for this step
 *
 * PLUS the 7 fast invariants (the "fast descriptor gate" followup, subsumed here
 * per the operator's instruction) — always run, always cheap, no vitest/DB needed:
 *   1. database.min_migration <= migrations/*.sql COUNT (LW-D8 — a COUNT floor,
 *      never a filename number)
 *   2. every declared config.logic_variables[].name has a scripts/seeds/logic_variables.json entry
 *   3. config.retired[].name INTERSECT config.logic_variables[].name === empty
 *   4. converted.json: converted INTERSECT pending === empty
 *   5. every real `it.fails(` call site under src/tests/steps/ sits under a slug
 *      that is in converted.json's `pending` list AND carries a "flips at" comment
 *   6. golden-fingerprint currency (shares its result with item iv/G8)
 *   7. the step file carries a `SPEC LINK:` header comment
 *   8. G-4 (Rule 3) — a verdict-affecting logic variable (named by some check's
 *      `limit_from_config`) has `on_invalid:"fail"`, unless `deviations[]` names a
 *      reviewed, dated exception (the `load_ravines` cloud-seed-timing precedent)
 *
 * SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md SS6 (gates),
 *            SS5.2 (per-step checklist), SS4.4 (checker self-test doctrine, SS12b.6)
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md SS2 (Rules 1-13)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md ruling R-C (fingerprint lockfile)
 *
 * Usage:
 *   node scripts/analysis/step-validate.mjs --step=link_massing
 *   node scripts/analysis/step-validate.mjs --all
 *   node scripts/analysis/step-validate.mjs --all --write      (backfill the scorecard into each report)
 *   node scripts/analysis/step-validate.mjs --all --fast       (skip the vitest spawn — pre-commit/pre-push)
 *
 * Exit codes: 0 = clean · 1 = a hard stop fired (G6/G7/G8 == 0, G9 fails, or a fast
 * invariant fails) on any validated step, or the built-in self-test did not fire as
 * expected · 2 = bad setup.
 *
 * ---------------------------------------------------------------------------------
 * POLICY-COVERAGE MAP (item vi) — describe title (regex) -> Spec 124 Rule, scoped to
 * a test whose title also names THIS step's slug/file/compute-path where the describe
 * loops per-step. A rule with no line here, or whose matched tests never ran for this
 * step, prints PROSE-ONLY (never silently "green"). Documented here because the task
 * itself requires the map to live in this file's header, not to be inferred.
 *
 *   Rule 1  (nothing hidden)        -> (i) AJV `checks` minItems + (ii) compute-shape scan clean +
 *                                       G-1's schema-baseline `--check` (new fields need x-ruling).
 *   Rule 2  (compute is just compute) -> (ii) compute-shape ast-grep + describe /§5\.5.*compute shape/i,
 *                                       scoped to a title containing the step's compute path.
 *   Rule 3  (tunables externalized) -> (ii) compute-no-literal-* ast-grep rules + describes
 *                                       /§1\.2a P4/i, /LW-D10/i, /R-A —/i (scoped to slug/file where present)
 *                                       + Rule 4-closing G-4 lock (on_invalid:fail binding — validate.js).
 *   Rule 4  (compute rule declared) -> G-2: checkPreservedInComputeHasWhy(report) — every
 *                                       preserved-in-compute Intent Ledger row names where the
 *                                       rule is written down (why/notes.json/checks[] in the same row).
 *   Rule 5  (checks != "none")      -> (i) AJV `checks` minItems:1.
 *   Rule 6  (omission fails)        -> (i) AJV top-level `required` (18 categories).
 *   Rule 7  (archetype gates categories) -> (i) AJV allOf archetype profiles.
 *   Rule 8  (per-target write discipline) -> (i) AJV write_discipline if/then blocks.
 *   Rule 9  (banned write needs ledger) -> (i) assertGrandfathered + assertNoRetraction (V7 no_retraction,
 *                                       validate.js semanticFindings).
 *   Rule 10 (verdict row-derived)   -> checkVerdictSingleSource(report) — two halves: (a) a static scan
 *                                       of the closed VERDICT_LIBRARY_CORPUS (scripts/lib/step/*.js +
 *                                       pipeline.js + source-version.js) for an unsanctioned second
 *                                       PASS/WARN/FAIL cascade (SANCTIONED_VERDICT_SITES is the declared,
 *                                       cited exemption list); (b) a SELF_SKIPPED terminal's all-INFO rows
 *                                       must fold to verdict != PASS — KNOWN-DEFECT today (Spec 123 §3.1
 *                                       pin, review_followups.md "A lock-skipped converted step verdicts
 *                                       as PASS"), so this rule prints `enforced-red` on every step, never
 *                                       `prose-only` and never a false `enforced-green`. Same result for
 *                                       every step (a corpus-level check, not per-step), by design.
 *   Rule 11 (phase-order re-derive) -> checkOrderGuaranteesCited(descriptor) — DECLARED half only:
 *                                       every when:"pre_write" check's order_guarantee.spec_ref
 *                                       resolves under docs/specs/, its anchor is found literally in
 *                                       that file, and spec_ref agrees with identity.spec. GAP G-3's
 *                                       completeness half (does the declaration cover EVERY "before X"
 *                                       the spec states?) stays open — noted in the row's own detail.
 *   Rule 12 (truthful crash posture) -> checkInterruptedPostureTruthful(descriptor) — R-B half: static +
 *                                       runner-derived (declaration truthfulness + REACHABILITY, scanning
 *                                       scripts/lib/step/index.js's actual runner for the descriptor's
 *                                       execution.shape — a runner behind a gated-skip early return must
 *                                       fold interruptedRetraction into `bypassed`, else "unreachable") +
 *                                       describe /R-M\/LG-17/i (before-image; scoped to slug, hyphen-normalized).
 *   Rule 13 (a step validates itself) -> (i)-(vi) all ran successfully for this step, this run
 *                                       (this tool IS Rule 13's mechanism — a step with no scorecard
 *                                       block or a stale one violates it; see the conformance lock).
 *   (extra, not a numbered Rule) P3 (Spec 122 §1.2a disk-I/O cost adjudication) -> NOT a schema
 *                                       field (Spec 122's own text: "programme mechanics... not a
 *                                       property of a finished step"). measureP3Footprint reports
 *                                       descriptor/notes bytes, checks[] count, and the newest post/
 *                                       capture's records_meta bytes — a MEASUREMENT, never pass/fail
 *                                       ("visibility wins by default; the cost is stated").
 * ---------------------------------------------------------------------------------
 */
'use strict';

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const CONVERTED_PATH = path.join(REPO_ROOT, 'scripts/steps/_schema/converted.json');
const MANIFEST_PATH = path.join(REPO_ROOT, 'scripts/manifest.json');
const GOLDEN_ROOT = path.join(REPO_ROOT, 'docs/reports/golden');
const DEFECT_LEDGER_PATH = path.join(REPO_ROOT, 'docs/reports/defect-ledger.md');

const validateLib = require(path.join(REPO_ROOT, 'scripts/lib/step/validate.js'));
const harness = require(path.join(REPO_ROOT, 'scripts/analysis/capture-step-golden.js'));
// R-T addendum (Spec 124 §2 Rule 13, commit 3) — the SAME invariants[]/plausibility[]
// executor the run-end hook uses (scripts/lib/step/index.js:1834). `--write`'s cutover/
// backfill context calls it directly for BOTH frequencies (every_run AND validate_only —
// frequency gating is a run-end-hook-only concern; the cutover context validates the DATA,
// not just the cheap subset). Lazily required (only when a descriptor actually declares
// invariants/plausibility) so a plain --write scorecard-only run never pays for pg/resolve-db.

const STEP_SHAPE_RULE = 'scripts/ast-grep-rules/step-shape.yml';
const COMPUTE_SHAPE_RULE = 'scripts/ast-grep-rules/compute-shape.yml';
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'migrations');
const SEEDS_PATH = path.join(REPO_ROOT, 'scripts/seeds/logic_variables.json');
const STEPS_TEST_ROOT = path.join(REPO_ROOT, 'src/tests/steps');

const DISPOSITION_VOCAB = [
  'preserved-in-runner',
  'preserved-in-validator',
  'preserved-in-compute',
  'encoded-as-descriptor-field',
  'encoded-as-deviation',
  'knowingly-retired',
];

// The G6 closed vocabulary for a defect-ledger row's STATUS column (Rule/G6 normalisation,
// WF1 commit 1 fix). A DEFECT-classified row's status must be exactly one of these buckets;
// free text like "OPEN · fix scheduled commit 7" is not machine-checkable — the row itself
// must carry one of these tokens.
const LEDGER_STATUS_VOCAB = /\b(CLOSED|PIN)\b/i;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const out = { fast: false, write: false, all: false, staged: false, step: null, selfTestOnly: false };
  for (const a of argv) {
    if (a === '--all') out.all = true;
    else if (a === '--staged') out.staged = true;
    else if (a === '--write') out.write = true;
    else if (a === '--fast') out.fast = true;
    else if (a === '--self-test-only') out.selfTestOnly = true;
    else if (a.startsWith('--step=')) out.step = a.slice('--step='.length);
    else throw new Error(`unrecognised argument: ${a}`);
  }
  if (!out.all && !out.staged && !out.step && !out.selfTestOnly) {
    throw new Error('usage: --step=<slug> | --all | --staged [--write] [--fast]');
  }
  return out;
}

/**
 * `--staged` — the git hooks' mode, and NOT the same thing as `--all`.
 *
 * A hard stop is meant to gate a PILOT'S OWN cutover ("you may not land commit
 * 9 with G6/G7/G8 red"), per Spec 123 §6's own wording — never to permanently
 * block every future commit repo-wide until every HISTORICAL pilot report is
 * perfect. Measured 2026-08-29, building this exact tool: wiring `--all` into
 * `.husky/pre-commit` bricked the repo — four of five pilots pre-date this
 * scorecard and score below 14/17, so EVERY commit (including the one adding
 * this tool) failed the hook, forever, until all four were individually fixed.
 * `--staged` fixes the SCOPE, not the SEVERITY: it still hard-stops, but only
 * for a step whose OWN files (descriptor/notes/compute/script/report/tests)
 * are part of THIS commit. `--all` stays available, unchanged, for a full-fleet
 * CI/manual audit that is explicitly allowed to report red without blocking
 * anything — that is `review_followups.md`'s job, not a commit gate's.
 */
function gitDiffNameOnly(args) {
  const res = spawnSync('git', ['diff', '--name-only', ...args], { cwd: REPO_ROOT, encoding: 'utf8' });
  if (res.status !== 0) return null;
  return (res.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.replace(/\\/g, '/'));
}

/**
 * The index (`git diff --cached`) at pre-commit time; at pre-push time the
 * index is normally clean (the commit already landed), so that call returns
 * empty and we fall back to the LAST commit's own changed files
 * (`git diff HEAD~1 HEAD`) — "what did the thing about to be pushed change."
 * A repo with only one commit ever (no `HEAD~1`) falls back again to nothing
 * staged, which `main()` already treats as a clean no-op exit, never a crash.
 */
function gitStagedFiles() {
  const cached = gitDiffNameOnly(['--cached']);
  if (cached && cached.length > 0) return cached;
  return gitDiffNameOnly(['HEAD~1', 'HEAD']) || [];
}

/**
 * `blocking: true` — the step's own CODE moved (script/descriptor/notes/compute)
 * in this commit: a hard stop is a real gate here.
 * `blocking: false` — only the REPORT or its `violations.test.ts` moved (a
 * doc/scorecard/test-wording fix). Still scored and printed for visibility,
 * but never counted toward `anyHardStop` — a step's OWN pre-existing red score
 * must never block a commit that merely documents it honestly (measured
 * 2026-08-29 building this tool: the very commit backfilling all five pilots'
 * scorecards would otherwise be permanently unable to land, since backfilling
 * IS touching every report on purpose).
 */
function filterToStaged(registry) {
  const staged = new Set(gitStagedFiles());
  if (staged.size === 0) return [];
  const out = [];
  for (const row of registry) {
    const notesPath = path.dirname(row.relFile) + '/' + path.basename(row.relFile).replace(/\.(js|py)$/, '') + '.notes.json';
    const computePath = harness.computePathFor(row.relFile);
    const codeCandidates = [row.relFile, harness.descriptorPathFor(row.relFile), notesPath, computePath].filter(Boolean);
    const docCandidates = [
      row.report ? path.relative(REPO_ROOT, row.report).replace(/\\/g, '/') : null,
      `src/tests/steps/${row.slug}/violations.test.ts`,
    ].filter(Boolean);
    const codeTouched = codeCandidates.some((c) => staged.has(c));
    const docTouched = docCandidates.some((c) => staged.has(c));
    if (codeTouched || docTouched) out.push({ ...row, blocking: codeTouched });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Step registry — derived from converted.json + pending + manifest.json, never
// hand-maintained (a hardcoded list would drift the moment pilot 6 lands).
// ---------------------------------------------------------------------------
function loadConverted() {
  const parsed = JSON.parse(readFileSync(CONVERTED_PATH, 'utf8'));
  const pendingRaw = parsed.pending || [];
  // pendingStages: relFile -> declared `stage` string, straight from the JSON,
  // UNVALIDATED here (a legacy string-only pending entry carries no stage at
  // all, which stageExclusions() below treats as "no exclusion" — today's
  // behaviour). Validation against the closed vocabulary happens where the
  // stage is actually CONSUMED (stageExclusions), so a bad value REDs loudly
  // at the row that needs it rather than aborting the whole registry load.
  const pendingStages = {};
  for (const p of pendingRaw) {
    if (typeof p === 'string' || !p || !p.stage) continue;
    pendingStages[String(p.file).replace(/\\/g, '/')] = p.stage;
  }
  return {
    converted: (parsed.converted || []).map((f) => String(f).replace(/\\/g, '/')),
    pending: pendingRaw.map((p) => (typeof p === 'string' ? p : p.file)).map((f) => String(f).replace(/\\/g, '/')),
    pendingStages,
  };
}

function loadManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

/** slug for a manifest step file — throws rather than silently skipping (mirrors golden-fingerprint's own rule). */
function slugFor(manifest, relFile) {
  const found = Object.entries(manifest.scripts).find(([, e]) => e.file === relFile)?.[0];
  if (!found) throw new Error(`no manifest.scripts entry points at ${relFile}`);
  return found;
}

// ---------------------------------------------------------------------------
// Programme backlog (R-T, 2026-08-29) — Spec 122 §10.3.
// scripts/steps/_schema/programme-items.json is the cross-cutting items no
// single pilot owns (batching prerequisites, per-slug cutover prerequisites,
// nice-to-haves). This section is what makes that data ENFORCED rather than
// merely generated: a cutover (a slug landing in converted.json) must not be
// able to silently ignore a declared cutover_prereq item that names it.
// ---------------------------------------------------------------------------
// BUILDO_PROGRAMME_ITEMS_PATH is a TEST-ONLY override (same shape as
// check-step-shape.mjs's BUILDO_COMPUTE_DIR) so the conformance suite can
// point this at a fixture file and prove the cutover-prereq lock fires RED,
// without importing this module (which unconditionally runs its own CLI
// main() as a side effect of import — see the try{main()} at file end).
const PROGRAMME_ITEMS_PATH = process.env.BUILDO_PROGRAMME_ITEMS_PATH
  ? path.join(REPO_ROOT, process.env.BUILDO_PROGRAMME_ITEMS_PATH)
  : path.join(REPO_ROOT, 'scripts/steps/_schema/programme-items.json');

/** Every declared programme item, or [] if the file is genuinely absent (never for a partial/corrupt read — that throws). */
function loadProgrammeItems() {
  if (!existsSync(PROGRAMME_ITEMS_PATH)) return [];
  const parsed = JSON.parse(readFileSync(PROGRAMME_ITEMS_PATH, 'utf8'));
  return Array.isArray(parsed.items) ? parsed.items : [];
}

/**
 * How many declared items still block "batching" (Spec 122 §8.2 freeze-after-
 * the-eighth). G9 defect (WF2 "template freeze" C1, 2026-09-04): this used to
 * count every item whose gate.blocks names "batching", regardless of status —
 * a BUILT item (its promise already delivered) still counted as an open
 * blocker forever, meaning §8.2's "empty set" precondition could never be
 * satisfied except by deleting the row. A BUILT or SUPERSEDED item is closed;
 * it does not block anything.
 */
function blocksBatchingCount(items) {
  return items.filter((it) => it.gate?.blocks?.includes('batching') && it.status !== 'BUILT' && it.status !== 'SUPERSEDED').length;
}

/**
 * Every programme item whose gate.blocks names THIS slug directly — a
 * cutover_prereq that names the step being validated. Deliberately does NOT
 * fold in the "batching" (freeze-after-the-eighth) set: those items block
 * the programme-wide freeze DECLARATION, not any one step's own cutover, so
 * conflating them here would misleadingly report an already-shipped pilot
 * (e.g. compute_centroids) as "blocked" by items that have nothing to do
 * with its own conversion. The "batching" count is printed once, globally,
 * by blocksBatchingCount — see main()'s top-of-run line. Exported so both
 * the fast invariant below and src/tests/programme-backlog.infra.test.ts
 * exercise the exact same predicate (never a re-implementation the test
 * could drift from).
 */
export function blockingItemsFor(slug, items) {
  return items.filter((it) => it.gate?.blocks?.includes(slug));
}

// ---------------------------------------------------------------------------
// G2 — churn×complexity, PH-2 BATCH artifact (Spec 123 §2/§6, S6b — R-T
// followup review_followups.md:2994). scripts/analysis/step-churn-complexity.mjs
// is the ONE generator (run once, deterministic at a recorded `window_end`
// SHA); this file only CONSUMES its output. Parsed ONCE upstream in main()
// into `churnFindings` (mirrors `checkCaptures(row,…)` -> `scoreG8(captureFindings)`
// below), never re-read per row and never read inside scoreG2 itself.
// ---------------------------------------------------------------------------
// BUILDO_CHURN_TABLE_PATH is a TEST-ONLY override, same convention as
// BUILDO_PROGRAMME_ITEMS_PATH above — src/tests/step-conformance.infra.test.ts
// points this at a fixture/nonexistent file to exercise the loader in a
// spawned child process without importing this module.
const CHURN_TABLE_PATH = process.env.BUILDO_CHURN_TABLE_PATH
  ? path.join(REPO_ROOT, process.env.BUILDO_CHURN_TABLE_PATH)
  : path.join(REPO_ROOT, 'docs/reports/generated/122-churn-complexity.md');

/**
 * Pure parse of a rendered `122-churn-complexity.md` table into
 * `{windowEnd, bySlug: Map<slug, {quadrant}>}`. Split out from disk I/O
 * (mirrors `validateNotesFences`/`parseDefectLedgerRow` below) so it is
 * self-testable in-memory. `quadrant` is `null` for an excluded row (e.g.
 * `reconcile`, marked `excluded: chain-head (A3)`) or a genuinely empty
 * cell — both must read as "no quadrant" to `scoreG2`, never as a hit.
 */
export function parseChurnTable(text) {
  const windowMatch = /window_end:\s*`([0-9a-f]{40})`/.exec(text);
  const windowEnd = windowMatch ? windowMatch[1] : null;
  const bySlug = new Map();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    if (/^\|[-\s|:]+\|$/.test(line)) continue; // separator row
    const cells = splitTableRow(line);
    const [, slug, , , , , , quadrantRaw] = cells;
    if (!slug || slug === 'slug') continue; // header row guard
    const quadrant = quadrantRaw && quadrantRaw.length > 0 && !quadrantRaw.startsWith('excluded') ? quadrantRaw : null;
    bySlug.set(slug, { quadrant });
  }
  return { windowEnd, bySlug };
}

const EMPTY_CHURN_FINDINGS = { windowEnd: null, bySlug: new Map() };

/**
 * Disk-reading wrapper over parseChurnTable. A missing table is a legitimate
 * "not yet generated" state (returns the empty findings, never throws) — G2
 * falls through to its pre-existing report-driven paths, exactly the
 * "unhappy path: missing generated table -> not a crash, not a free pass"
 * requirement. `filePath` defaults to CHURN_TABLE_PATH but takes an explicit
 * override so main()'s self-test can prove the RED (hidden-file) direction
 * in-process without spawning a child process or mutating process.env.
 */
function loadChurnFindings(filePath = CHURN_TABLE_PATH) {
  if (!existsSync(filePath)) return EMPTY_CHURN_FINDINGS;
  return parseChurnTable(readFileSync(filePath, 'utf8'));
}

/**
 * Generic dot-path lookup (e.g. "recovery.reset") into a plain object — no
 * step names, no special-casing. Returns undefined on any missing segment.
 */
function getByPath(obj, dotPath) {
  return dotPath.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj);
}

/**
 * The cutover-prereq lock: for every slug already registered in
 * converted.json, every cutover_prereq item that names it (by gate.blocks)
 * must be status BUILT. A registered-but-still-blocked slug means a cutover
 * commit landed while a declared precondition for it was left unmet — the
 * exact "promise with no owner and no gate" failure this whole mechanism
 * exists to catch. batching_prereq items are NOT checked here (they gate
 * the programme-wide freeze declaration, not an individual slug's cutover —
 * see STD-8/PRG-10) — only cutover_prereq.
 *
 * RS-D-STA (pilot 8 commit 9, 2026-09-03, operator ruling) — a gate declared
 * before its target archetype was ever measured (STA-2/STA-3, authored
 * against Spec 120 §6b's generic "reset generated per archetype" promise,
 * pre-dating any RECORDER descriptor to check it against) may carry an
 * OPTIONAL `gate.applies_when: {descriptor_path, equals}`: the item only
 * blocks a slug whose OWN descriptor's value at `descriptor_path` (dot
 * notation, resolved via `getByPath`) equals `equals`. A slug whose
 * descriptor doesn't match is not blocked by that item at all — the gate's
 * applicability becomes declared data, not a hand-adjudicated exemption. An
 * item with no `applies_when` keeps the unconditional behaviour this lock
 * always had. `descriptorsBySlug` is an optional slug -> parsed-descriptor
 * map; a slug missing from it (or an item with no matching descriptor) is
 * treated conservatively — still blocked — never silently exempted for lack
 * of wiring.
 */
export function checkCutoverPrereqs(convertedSlugs, items, descriptorsBySlug = {}) {
  const violations = [];
  for (const slug of convertedSlugs) {
    for (const it of items) {
      if (it.gate?.kind !== 'cutover_prereq') continue;
      if (!it.gate.blocks?.includes(slug)) continue;
      if (it.gate.applies_when) {
        const descriptor = descriptorsBySlug[slug];
        // A descriptor genuinely resolved for this slug is trusted to answer the
        // condition (match -> still block; mismatch -> skip, the whole point of
        // this feature). A descriptor we could NOT resolve is NOT evidence of a
        // mismatch — falling through here keeps the pre-applies_when behaviour
        // (still block) rather than silently exempting a slug for lack of wiring.
        if (descriptor !== undefined) {
          const actual = getByPath(descriptor, it.gate.applies_when.descriptor_path);
          if (actual !== it.gate.applies_when.equals) continue; // condition genuinely unmet — this item does not block this slug
        }
      }
      if (it.status !== 'BUILT') {
        violations.push({ slug, id: it.id, status: it.status, title: it.title });
      }
    }
  }
  return violations;
}

/** The estate's initials convention (AS/LR/LM/LW/LPA) — one letter per underscore-separated word, uppercased. */
function defectPrefixFor(slug) {
  return slug.split('_').map((w) => w[0].toUpperCase()).join('');
}

/** The assessment report for a slug, found by dash-form filename match — never hand-mapped. */
function reportPathFor(slug) {
  const dashSlug = slug.replace(/_/g, '-');
  const dir = path.join(REPO_ROOT, 'docs/reports');
  const hit = readdirSync(dir).find(
    (f) => /^\d{4}-\d{2}-\d{2}-pilot\d+-.*-assessment\.md$/.test(f) && f.includes(`-${dashSlug}-assessment.md`),
  );
  return hit ? path.join(dir, hit) : null;
}

function buildRegistry() {
  const manifest = loadManifest();
  const { converted, pending, pendingStages } = loadConverted();
  const rows = [];
  for (const relFile of converted) {
    const slug = slugFor(manifest, relFile);
    rows.push({ slug, relFile, stage: 'converted', prefix: defectPrefixFor(slug), report: reportPathFor(slug) });
  }
  for (const relFile of pending) {
    let slug;
    try {
      slug = slugFor(manifest, relFile);
    } catch {
      continue; // a pending entry not (yet) reachable from any chain is not this tool's problem
    }
    // `pendingStage` (R-K amendment, distinct from the `stage: 'pending'`
    // registry-membership field two lines below — that one only ever says
    // pending-vs-converted) is the DECLARED converted.json.pending[].stage
    // value (red_suite | descriptor_only | compute_ported | runner_wired |
    // shape_clean), read here so computeScorecard can gate hardStop by it.
    rows.push({ slug, relFile, stage: 'pending', pendingStage: pendingStages[relFile], prefix: defectPrefixFor(slug), report: reportPathFor(slug) });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// (i) validateDescriptor
// ---------------------------------------------------------------------------
function checkDescriptor(row) {
  const descriptorPath = harness.descriptorPathFor(row.relFile);
  const abs = path.join(REPO_ROOT, descriptorPath);
  if (!existsSync(abs)) return { ok: false, descriptorPath, error: `${descriptorPath} does not exist` };
  let descriptor;
  try {
    descriptor = JSON.parse(readFileSync(abs, 'utf8'));
  } catch (err) {
    return { ok: false, descriptorPath, error: `not valid JSON: ${err.message}` };
  }
  try {
    validateLib.validateDescriptor(descriptor);
    return { ok: true, descriptorPath, descriptor };
  } catch (err) {
    return { ok: false, descriptorPath, descriptor, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// (ii) shape gate — "for its file + compute" (the task's own words): a NARROW
// ast-grep scan over only the targets being validated, not the full ~66-file
// manifest corpus scripts/hooks/check-step-shape.mjs sweeps (which is already
// enforced, full-corpus, later in the SAME pre-commit hook via
// scripts/hooks/ast-grep-leads.sh). Measured 2026-08-29: the full-corpus
// driver alone costs ~1.5s; a scan scoped to N converted files is the
// difference between step:validate meeting its own <1s --fast budget and not.
// Same rule files, same ast-grep binary resolution — narrower scope only.
// ---------------------------------------------------------------------------
function astGrepBinary() {
  const candidates =
    process.platform === 'win32'
      ? [
          path.join(REPO_ROOT, 'node_modules', '@ast-grep', 'cli-win32-x64-msvc', 'ast-grep.exe'),
          path.join(REPO_ROOT, 'node_modules', '@ast-grep', 'cli', 'ast-grep.exe'),
        ]
      : [path.join(REPO_ROOT, 'node_modules', '.bin', 'ast-grep')];
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new Error(`ast-grep binary not found (looked in ${candidates.join(', ')}) — run npm ci`);
  return found;
}

function scanFiles(files, rule) {
  const byFile = new Map(files.map((f) => [f, []]));
  if (files.length === 0) return byFile;
  const res = spawnSync(astGrepBinary(), ['scan', '--rule', rule, '--report-style=short', '--color=never', ...files], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error) throw res.error;
  const stdout = res.stdout || '';
  if (!stdout.trim() && res.status !== 0 && res.status !== 1) {
    throw new Error(`ast-grep failed (exit ${res.status}): ${res.stderr}`);
  }
  const LINE = /^(.+?):(\d+):(\d+): (?:error|warning|note|info)\[([\w-]+)\]:/;
  for (const line of stdout.split(/\r?\n/)) {
    const m = LINE.exec(line);
    if (!m) continue;
    const rel = path.relative(REPO_ROOT, path.resolve(REPO_ROOT, m[1])).replace(/\\/g, '/');
    if (!byFile.has(rel)) byFile.set(rel, []);
    byFile.get(rel).push({ rule: m[4], line: Number(m[2]) });
  }
  return byFile;
}

/** Batched across every target so --all pays exactly 2 ast-grep spawns total, not 2xN. */
function checkShapeBatch(rows) {
  const stepFiles = rows.filter((r) => r.stage === 'converted').map((r) => r.relFile);
  const computeFiles = [...new Set(rows.map((r) => harness.computePathFor(r.relFile)).filter(Boolean))];
  const stepResults = scanFiles(stepFiles, STEP_SHAPE_RULE);
  const computeResults = scanFiles(computeFiles, COMPUTE_SHAPE_RULE);
  const out = new Map();
  for (const row of rows) {
    const computePath = harness.computePathFor(row.relFile);
    const fileViolations = row.stage === 'converted' ? stepResults.get(row.relFile) || [] : [];
    const computeViolations = computePath ? computeResults.get(computePath) || [] : [];
    out.set(row.slug, {
      fileClean: row.stage === 'converted' ? fileViolations.length === 0 : null,
      computeClean: computePath ? computeViolations.length === 0 : null,
      fileViolations,
      computeViolations,
    });
  }
  return out;
}

/**
 * The vitest entry point, resolved WITHOUT a shell and WITHOUT the npm-generated
 * .cmd shim.
 *
 * ⚠️ `spawnSync('npx.cmd'|'npx', …)` fails EINVAL on Node 20+/Windows (the
 * shell-less .cmd restriction from CVE-2024-27980) — the exact gotcha already
 * documented in `scripts/hooks/check-step-shape.mjs`'s `astGrepBinary()` for
 * ast-grep, reproduced here because this file spawned `npx.cmd` independently.
 * `vitest`'s package.json `bin` points at a real `.mjs` entry (`vitest.mjs`),
 * so run that directly under the current `node` — no shell, no shim, works
 * identically on win32/posix. Filed: docs/reports/review_followups.md (vitest
 * spawn EINVAL, 2026-08-29).
 */
function vitestEntry() {
  const entry = path.join(REPO_ROOT, 'node_modules', 'vitest', 'vitest.mjs');
  if (!existsSync(entry)) throw new Error(`vitest entry not found at ${entry} — run npm ci`);
  return entry;
}

// ---------------------------------------------------------------------------
// (iii) vitest — one spawn for the whole run, not one per step (the shared
// suites already loop over converted.json internally).
// ---------------------------------------------------------------------------
function runVitest() {
  const outFile = path.join(os.tmpdir(), `step-validate-vitest-${process.pid}.json`);
  const targets = ['src/tests/step-conformance.infra.test.ts', 'src/tests/golden-fingerprint.infra.test.ts', 'src/tests/steps/'];
  // WF3 "Rules 10-12 output panel remediation" commit 4 (found en route, not
  // filed further — the same class LW-D15's "found and fixed en route"
  // precedent covers). `step-validate.mjs` itself is routinely invoked as
  // `node -r dotenv/config scripts/analysis/step-validate.mjs` (this repo's
  // own sanctioned invocation, e.g. this spec's Rule 4 grounding commit),
  // which loads `.env`'s `DATABASE_URL` into THIS process's env — and
  // `spawnSync` inherits the full parent env into the child by default.
  // None of `targets` above is a `.db.test.ts` file, but `vitest.config.ts`'s
  // `globalSetup` (`src/tests/db/setup-testcontainer.ts`) checks
  // `process.env.DATABASE_URL` FIRST, unconditionally of which files are
  // actually selected, and (believing itself to be in CI) attempts to run
  // real migrations/seeding against whatever `DATABASE_URL` points at —
  // measured live: a real local dev DB, refused with "permission denied for
  // schema auth" (the connecting role correctly lacks the elevated grants a
  // CI/testcontainer superuser would have) — a SAFE refusal this time, but
  // never an intended one, and the resulting vitest run silently produces a
  // 0-test, `success:true` report (see the `numTotalTests` guard below) —
  // exactly the "green because it never looked" class this whole file exists
  // to retire, one layer up. Strip both URL forms from the CHILD's env only
  // (never step-validate.mjs's own — `runDataValidatorsForWrite` still needs
  // a real pool) so this scoped, DB-test-free target set can never trip
  // globalSetup's CI-path at all.
  const childEnv = { ...process.env };
  delete childEnv.DATABASE_URL;
  delete childEnv.SUPABASE_DATABASE_URL;
  const run = spawnSync(
    process.execPath,
    [vitestEntry(), 'run', ...targets, '--reporter=json', `--outputFile=${outFile}`],
    { cwd: REPO_ROOT, encoding: 'utf8', timeout: 600_000, maxBuffer: 256 * 1024 * 1024, env: childEnv },
  );
  if (!existsSync(outFile)) {
    return { ranOk: false, error: `vitest produced no JSON report (exit ${run.status}); stderr: ${(run.stderr || '').slice(0, 2000)}`, tests: [] };
  }
  const parsed = JSON.parse(readFileSync(outFile, 'utf8'));
  // A genuine run of these 3 targets is never 0 tests — this repo's own
  // conformance/golden-fingerprint/per-step suites are never empty. Treat a
  // 0-test "success" the same as no report at all: a checker that reports
  // clean because it silently ran nothing is the exact defect class this
  // guard exists to catch (found live via the DATABASE_URL issue above,
  // closed structurally rather than only by removing that one cause).
  if (parsed.numTotalTests === 0) {
    return { ranOk: false, error: `vitest collected 0 tests across ${targets.join(', ')} (exit ${run.status}) — treated as a failed run, never a vacuous pass; stderr: ${(run.stderr || '').slice(0, 2000)}`, tests: [] };
  }
  const tests = [];
  for (const file of parsed.testResults || []) {
    for (const a of file.assertionResults || []) {
      tests.push({
        file: file.name,
        ancestorTitles: a.ancestorTitles || [],
        title: a.title,
        fullName: [...(a.ancestorTitles || []), a.title].join(' > '),
        status: a.status, // 'passed' | 'failed' | 'pending'
      });
    }
  }
  return {
    ranOk: true,
    numTotalTests: parsed.numTotalTests,
    numPassedTests: parsed.numPassedTests,
    numFailedTests: parsed.numFailedTests,
    success: parsed.success,
    tests,
  };
}

// ---------------------------------------------------------------------------
// (iv) captures — invocation coverage + fingerprint currency + compare
// (deliberately re-derives the SAME logic golden-fingerprint.infra.test.ts
// proves, off the SAME exported harness functions, so a red here and a red
// there always agree — never two independent implementations of one gate).
// ---------------------------------------------------------------------------
function derivedInvocations(manifest, slug) {
  const chains = Object.entries(manifest.chains).filter(([, slugs]) => slugs.includes(slug)).map(([id]) => id);
  const scriptEntry = manifest.scripts[slug];
  const out = chains.map((chain) => ({ chain, args: [...((scriptEntry?.chain_args || {})[chain] || [])] }));
  out.push({ chain: 'none', args: [] });
  return out;
}
function invocationKey(inv) {
  return `${inv.chain}::${inv.args.join(',')}`;
}
function capturesIn(slug, sub) {
  const dir = path.join(GOLDEN_ROOT, slug, sub);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const abs = path.join(dir, f);
      let doc = null;
      try {
        doc = JSON.parse(readFileSync(abs, 'utf8'));
      } catch {
        doc = null;
      }
      return { file: f, abs, mtime: statSync(abs).mtimeMs, doc };
    });
}

function checkCaptures(row, descriptorInfo, computePath, report) {
  const manifest = loadManifest();
  const findings = { invocationsMissing: [], staleFingerprints: [], compareRan: false, diffs: [], unexplainedDiffs: [] };

  const invocations = derivedInvocations(manifest, row.slug);
  const posts = capturesIn(row.slug, 'post');
  const postKeys = new Set(posts.filter((p) => p.doc).map((p) => invocationKey({ chain: String(p.doc.chain), args: p.doc.args || [] })));
  findings.invocationsMissing = invocations.filter((inv) => !postKeys.has(invocationKey(inv))).map(invocationKey);

  let expected = null;
  if (descriptorInfo.ok || existsSync(path.join(REPO_ROOT, descriptorInfo.descriptorPath))) {
    try {
      expected = harness.computeSourceFingerprint({
        step: row.relFile,
        descriptorPath: descriptorInfo.descriptorPath,
        notesPath: harness.notesPathFor(descriptorInfo.descriptor, descriptorInfo.descriptorPath),
        computePath,
      });
    } catch (err) {
      findings.fingerprintError = err.message;
    }
  }
  if (expected) {
    for (const p of posts) {
      if (!p.doc) continue;
      if (p.doc.source_fingerprint !== expected.source_fingerprint) findings.staleFingerprints.push(p.file);
    }
  }

  // --compare: newest pre vs newest post, matched by SHARED FILENAME (the
  // scenario-label convention every step's golden/ directory already follows).
  const pres = capturesIn(row.slug, 'pre');
  const postByName = new Map(posts.map((p) => [p.file, p]));
  for (const pre of pres) {
    const post = postByName.get(pre.file);
    if (!post || !pre.doc || !post.doc) continue;
    findings.compareRan = true;
    const preNorm = pre.doc.normalised ?? pre.doc;
    const postNorm = post.doc.normalised ?? post.doc;
    let diffs = [];
    try {
      diffs = harness.diffNormalised(preNorm, postNorm) || [];
    } catch (err) {
      findings.diffError = err.message;
      continue;
    }
    for (const d of diffs) {
      const key = typeof d === 'string' ? d : d.path || JSON.stringify(d);
      findings.diffs.push({ scenario: pre.file, key });
      // A diff is EXPLAINED when its own deepest field name is cited anywhere in
      // the assessment report — a Defect Ledger ID, a ruling id, or the literal
      // field name discussed as a declared diff — never silently. Deliberately
      // the DEEPEST segment only, never a generic wrapper ("records_meta",
      // "audit_table", "rows", "summary" appear on every diff regardless of
      // whether THIS specific field was ever discussed — matching on those would
      // silently mark every diff "explained" and defeat the gate).
      const GENERIC_WRAPPERS = new Set(['summary', 'records_meta', 'audit_table', 'rows', 'table_state', 'invariants', 'stdout_lines']);
      const rawSegments = String(key).replace(/\[\d+\]/g, '').split('.').filter((s) => s && !/^\d+$/.test(s));
      const segments = rawSegments.filter((s) => !GENERIC_WRAPPERS.has(s));
      let cited;
      if (segments.length > 0) {
        // A real field name survives filtering — require it cited BY NAME.
        const leaf = segments[segments.length - 1];
        cited = report && report.toLowerCase().includes(leaf.toLowerCase());
      } else {
        // Purely structural (an array-index diff with no field name of its own,
        // e.g. "invariants[9]" or "stdout_lines[0]") CANNOT be explained by
        // literal-name citation — there is no name. The only honest evidence is
        // an explicit, NARROWLY-SCOPED blanket acknowledgment: the report must
        // mention an actual difference COUNT ("N differences") within ~400 chars
        // of the bucket word this diff fell under. This is deliberately much
        // narrower than "the word appears anywhere in the document" (which
        // would silently explain everything — measured regression, reverted).
        const bucketWord = rawSegments[rawSegments.length - 1] || String(key).replace(/\[\d+\]/g, '');
        const countRe = /\d+\s+differences?[\s\S]{0,400}/gi;
        cited = false;
        if (report) {
          for (const m of report.matchAll(countRe)) {
            if (m[0].toLowerCase().includes(bucketWord.toLowerCase())) {
              cited = true;
              break;
            }
          }
        }
      }
      if (!cited) findings.unexplainedDiffs.push({ scenario: pre.file, key });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Fast invariants — the "fast descriptor gate" followup, subsumed here.
// Always run (not only under --fast): cheap, no DB, no vitest.
// ---------------------------------------------------------------------------
function fastMigrationCount() {
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).length;
}
function fastSeeds() {
  if (!existsSync(SEEDS_PATH)) return {};
  return JSON.parse(readFileSync(SEEDS_PATH, 'utf8'));
}
function fastInvariants(rows, converted, pending) {
  const results = [];
  const migCount = fastMigrationCount();
  const seeds = fastSeeds();
  const seedNames = new Set(Object.keys(seeds));

  for (const row of rows) {
    const descPath = harness.descriptorPathFor(row.relFile);
    const abs = path.join(REPO_ROOT, descPath);
    if (!existsSync(abs)) continue;
    let descriptor;
    try {
      descriptor = JSON.parse(readFileSync(abs, 'utf8'));
    } catch {
      continue;
    }

    // 1. database.min_migration <= migrations/*.sql COUNT (LW-D8).
    const db = descriptor.database;
    if (db && db !== 'none' && db.min_migration !== undefined && db.min_migration !== 'none') {
      const pass = db.min_migration <= migCount;
      results.push({ id: 1, slug: row.slug, pass, detail: `min_migration=${db.min_migration} <= migrations count=${migCount}` });
    }

    // 2. declared logic_variables SUBSET OF seeds.
    const cfg = descriptor.config;
    const declared = cfg && cfg !== 'none' && Array.isArray(cfg.logic_variables) ? cfg.logic_variables.map((v) => v.name) : [];
    const missingSeeds = declared.filter((n) => !seedNames.has(n));
    results.push({ id: 2, slug: row.slug, pass: missingSeeds.length === 0, detail: `${declared.length} declared, missing from seeds: ${missingSeeds.join(', ') || 'none'}` });

    // 3. retired INTERSECT declared === empty.
    const retired = cfg && cfg !== 'none' && Array.isArray(cfg.retired) ? cfg.retired.map((r) => r.name) : [];
    const overlap = retired.filter((n) => declared.includes(n));
    results.push({ id: 3, slug: row.slug, pass: overlap.length === 0, detail: `retired=${retired.length} overlap-with-declared=${overlap.join(', ') || 'none'}` });

    // 7. SPEC LINK header exists.
    const stepAbs = path.join(REPO_ROOT, row.relFile);
    const hasSpecLink = existsSync(stepAbs) && /SPEC LINK:/.test(readFileSync(stepAbs, 'utf8'));
    results.push({ id: 7, slug: row.slug, pass: hasSpecLink, detail: `SPEC LINK header present=${hasSpecLink}` });

    // 8. G-4 (Rule 3) — a verdict-affecting logic variable's on_invalid must be "fail",
    // unless a deviations[] entry names a reviewed, dated exception (load_ravines precedent).
    const g4 = checkOnInvalidFail(descriptor);
    results.push({ id: 8, slug: row.slug, pass: g4.pass, detail: `G-4: ${g4.detail}` });
  }

  // 4. converted INTERSECT pending === empty (whole-registry, one row).
  const overlap4 = converted.filter((f) => pending.includes(f));
  results.push({ id: 4, slug: '(registry)', pass: overlap4.length === 0, detail: `overlap: ${overlap4.join(', ') || 'none'}` });

  // 5. every real `it.fails(` call site sits under a pending slug and carries "flips at".
  const pendingSlugs = new Set();
  {
    const manifest = loadManifest();
    for (const f of pending) {
      try {
        pendingSlugs.add(slugFor(manifest, f));
      } catch {
        /* unreachable pending entry — item 5 has nothing to scope it to below */
      }
    }
  }
  const badCallSites = [];
  if (existsSync(STEPS_TEST_ROOT)) {
    for (const slugDir of readdirSync(STEPS_TEST_ROOT)) {
      const f = path.join(STEPS_TEST_ROOT, slugDir, 'violations.test.ts');
      if (!existsSync(f)) continue;
      const text = readFileSync(f, 'utf8');
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (!/^it\.fails\s*\(/.test(trimmed)) return; // real call sites only, never a backticked mention in prose
        const carriesFlip = /flips at/i.test(line);
        if (!pendingSlugs.has(slugDir) || !carriesFlip) {
          badCallSites.push(`${slugDir}/violations.test.ts:${i + 1}`);
        }
      });
    }
  }
  results.push({ id: 5, slug: '(registry)', pass: badCallSites.length === 0, detail: badCallSites.length ? `bad call sites: ${badCallSites.join(', ')}` : 'clean (0 it.fails( call sites outside a declared pending slug)' });

  // 9. Programme backlog (R-T) — a converted slug may not carry an unmet
  // cutover_prereq item naming it. Registry-scoped (one row for the whole
  // fleet, mirrors items 4/5's shape) since a violation is a fleet-integrity
  // fact, not a property of the ONE step currently being validated.
  const programmeItems = loadProgrammeItems();
  const manifestForCutover = loadManifest();
  const descriptorsBySlug = {};
  for (const relFile of converted) {
    const slug = slugFor(manifestForCutover, relFile);
    const descAbs = path.join(REPO_ROOT, harness.descriptorPathFor(relFile));
    if (!existsSync(descAbs)) continue;
    try {
      descriptorsBySlug[slug] = JSON.parse(readFileSync(descAbs, 'utf8'));
    } catch {
      /* unparsable descriptor — leave the slug undefined, checkCutoverPrereqs blocks conservatively */
    }
  }
  const cutoverViolations = checkCutoverPrereqs(converted.map((f) => slugFor(manifestForCutover, f)), programmeItems, descriptorsBySlug);
  results.push({
    id: 9,
    slug: '(registry)',
    pass: cutoverViolations.length === 0,
    // EP-D13-adjacent fix (pilot 9 commit 8 P9, 2026-09-08) — `blockedSlugs` names
    // EXACTLY which converted slug(s) an unmet cutover_prereq blocks, so the hard-stop
    // computation below can scope this invariant to the step actually being validated
    // rather than treating ANY other step's own unmet prereq as this step's own
    // hard-stop. `checkCutoverPrereqs` is honoured LITERALLY (a `gate.blocks` entry
    // names specific slugs, e.g. CLOUDPARITY blocks `enrich_parcels` alone) — a
    // completely unrelated step (e.g. `compute_centroids`) must not hard-stop on
    // `enrich_parcels`'s own CLOUDPARITY-pending state.
    blockedSlugs: cutoverViolations.map((v) => v.slug),
    detail: cutoverViolations.length
      ? `unmet cutover_prereq blocking an already-converted slug: ${cutoverViolations.map((v) => `${v.slug} <- ${v.id} (${v.status})`).join('; ')}`
      : `clean (0 converted slugs blocked by an unmet cutover_prereq item; blocks batching: ${blocksBatchingCount(programmeItems)})`,
  });

  return results;
}

// ---------------------------------------------------------------------------
// G-1 — new schema fields require x-ruling (Spec 124 §2 Rule 1). One spawn,
// cached across the whole run (schema-wide, not per-step) — mirrors the shape
// checkShapeBatch already uses for the same reason.
// ---------------------------------------------------------------------------
const SCHEMA_BASELINE_GENERATOR = path.join(REPO_ROOT, 'scripts/steps/_schema/generate-schema-baseline.mjs');
let _schemaBaselineResult = null;
function checkSchemaBaseline() {
  if (_schemaBaselineResult) return _schemaBaselineResult;
  const run = spawnSync('node', [SCHEMA_BASELINE_GENERATOR, '--check'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 30_000 });
  _schemaBaselineResult = { pass: run.status === 0, detail: run.status === 0 ? 'schema-baseline clean' : (run.stderr || run.stdout || '').split('\n')[0] };
  return _schemaBaselineResult;
}

/**
 * G-4 (Spec 124 §2 Rule 3, GAP G-4) — "no check ties on_invalid:'fail' to
 * 'verdict- or write-affecting'; applied by author judgment, reviewed narratively."
 *
 * VERDICT-affecting is mechanically decidable: a `config.logic_variables[]`
 * entry is verdict-affecting iff SOME `checks[].limit_from_config` in the same
 * descriptor names it — that is exactly the schema's own established mechanism
 * for "this config value moves a check's PASS/WARN/FAIL boundary" (already the
 * P4 battery's own `limit_from_config` cross-reference). WRITE-affecting has no
 * equivalent named field anywhere in the schema today and is left PROSE-ONLY —
 * narrowing honestly rather than inventing a shape nothing else in the schema
 * uses (matching G-2's own narrowing precedent).
 *
 * Real descriptors ALREADY carry a legitimate, ratified exception to the naive
 * rule: `load_ravines`'s 6 variables are ALL `on_invalid:"default"` despite 3
 * being verdict-affecting, because `deviations[]` records a dated, adjudicated
 * why (the mig-099 cloud-seed timing hole — `fail` would halt the sources
 * chain on every un-seeded database before the seed runs). A mechanical check
 * that flagged this as a violation would be WRONG, not merely strict — so a
 * verdict-affecting variable with `on_invalid !== "fail"` is a G-4 violation
 * UNLESS the descriptor's `deviations[]` has an entry whose `from` text
 * mentions both "on_invalid" and "fail" (the same rung-(a) descriptor
 * mechanism Rule 1 already prefers for a declared exception).
 */
function checkOnInvalidFail(descriptor) {
  if (!descriptor) return { pass: true, detail: 'no descriptor', violations: [] };
  const cfg = descriptor.config;
  const vars = cfg && cfg !== 'none' && Array.isArray(cfg.logic_variables) ? cfg.logic_variables : [];
  if (vars.length === 0) return { pass: true, detail: 'no declared logic_variables', violations: [] };
  const limitRefs = new Set((descriptor.checks || []).map((c) => c && c.limit_from_config).filter(Boolean));
  const deviations = Array.isArray(descriptor.deviations) ? descriptor.deviations : [];
  const hasOnInvalidDeviation = deviations.some((d) => {
    const from = (d && d.from) || '';
    return /on_invalid/i.test(from) && /fail/i.test(from);
  });
  const violations = vars.filter((v) => limitRefs.has(v.name) && v.on_invalid !== 'fail' && !hasOnInvalidDeviation).map((v) => v.name);
  return {
    pass: violations.length === 0,
    detail: `${vars.length} declared, ${limitRefs.size ? [...limitRefs].length : 0} verdict-affecting, ${violations.length} violate on_invalid:fail with no deviations[] cover`,
    violations,
  };
}

/**
 * P3 (Spec 122 §1.2a) — CORRECTED 2026-08-29 after re-reading the governing text
 * directly, per CLAUDE.md PD#10 (spec-first, never infer from a name). Spec 122's
 * own words: "P3 stays here — it is programme mechanics (a conversion-proposal
 * discipline for this effort, not a PROPERTY OF A FINISHED STEP), per Spec 124
 * §6." P3 is NOT a schema field — it is a MEASURE-AND-STATE discipline: "Disk
 * I/O is a balance that is ADJUDICATED WITH NUMBERS, never assumed... a proposal
 * to add [a box/check/audit row] carries its measured cost (bytes and rows per
 * run) ... Visibility wins by default; the cost is stated." Pilot 1's own P3
 * baseline table (records_meta B / check rows / stdout B, pre→post) is exactly
 * this measurement, done once by hand. This function is that measurement, done
 * automatically, every run, from committed artifacts — never a schema field, and
 * never pass/fail (a footprint has no "correct" size; the discipline is that it
 * is STATED, so an operator reviewing a growth can adjudicate it, per the spec's
 * own words).
 *
 * ⚠️ CORRECTS A REAL MISTAKE: the WF1 commit that first built this validator
 * invented `execution.io_budget` as a new schema field before reading this
 * section of Spec 122 closely enough — a genuine "infer from a name" violation
 * of the project's own PD#10, caught and fixed while building GAP P3's real
 * closure. No such field exists in step.schema.json, and none is added by this
 * function.
 */
function measureP3Footprint(row, descriptorInfo) {
  const descPath = harness.descriptorPathFor(row.relFile);
  const descAbs = path.join(REPO_ROOT, descPath);
  const descriptorBytes = existsSync(descAbs) ? Buffer.byteLength(readFileSync(descAbs)) : 0;
  const notesPath = harness.notesPathFor(descriptorInfo.descriptor, descPath);
  const notesAbs = notesPath ? path.join(REPO_ROOT, notesPath) : null;
  const notesBytes = notesAbs && existsSync(notesAbs) ? Buffer.byteLength(readFileSync(notesAbs)) : 0;
  const checksCount = descriptorInfo.descriptor && Array.isArray(descriptorInfo.descriptor.checks) ? descriptorInfo.descriptor.checks.length : 0;

  // The newest post/ capture's records_meta, if one exists — the same "bytes
  // per run" half of Pilot 1's baseline table, read from a REAL run rather
  // than re-derived. Not required (a step with no capture yet still reports
  // the descriptor/notes/checks half).
  const posts = capturesIn(row.slug, 'post');
  let recordsMetaBytes = null;
  if (posts.length > 0) {
    const newest = posts.reduce((a, b) => (b.mtime > a.mtime ? b : a));
    const rm = newest.doc && newest.doc.summary && newest.doc.summary.records_meta;
    if (rm !== undefined) recordsMetaBytes = Buffer.byteLength(JSON.stringify(rm));
  }
  return {
    descriptorBytes,
    notesBytes,
    checksCount,
    recordsMetaBytes,
    detail:
      `descriptor=${descriptorBytes}B notes=${notesBytes}B checks=${checksCount} rows` +
      (recordsMetaBytes === null ? ' records_meta=(no capture)' : ` records_meta=${recordsMetaBytes}B (newest post/ capture)`),
  };
}

// ---------------------------------------------------------------------------
// (v) SCORECARD G0-G9 — every check reads an ARTIFACT (the report text, the
// descriptor, the defect ledger, the capture files, the test file) — never a
// hand-typed number. §6.1's G4d and G-shape ride along as separate booleans.
// ---------------------------------------------------------------------------
function section(report, headingRe, stopRe = /^##\s/m) {
  const m = headingRe.exec(report);
  if (!m) return null;
  const rest = report.slice(m.index + m[0].length);
  const stop = stopRe.exec(rest);
  return rest.slice(0, stop ? stop.index : rest.length);
}

/**
 * R-T addendum, commit 6 — strict-row-schema parse (the SAME failure class
 * as defect-ledger's silent column loss, below): the OLD `catch { return
 * []; }` made an EXISTING but malformed/corrupt notes.json read exactly
 * like "this step declares zero fences" — which made G7's `lockCoverage =
 * fences.length === 0 || itCount >= fences.length` (`:1024` today)
 * vacuously TRUE (0 fences === always covered) for a step whose notes file
 * is simply broken, not empty. A missing FILE is still a legitimate "no
 * fences declared" (most steps have no notes.json at all); a PRESENT but
 * unparseable file, or a `fences` key declared as something other than an
 * array, throws instead — callers (`scoreG7`/`scoreG4d`) turn that into an
 * explicit FAIL score, never a silent pass.
 */
/**
 * Pure shape check on an already-`JSON.parse()`d notes object, split out
 * from disk I/O so `selfTest()` can exercise the strict-schema rule
 * in-memory (Spec 121 §12b.6 — a checker never proven to fire is not
 * evidence) without needing a fixture file on disk.
 */
function validateNotesFences(notes, notesRelPathForError) {
  if (notes.fences === undefined) return [];
  if (!Array.isArray(notes.fences)) {
    throw new Error(`notes.json "fences" must be an array when declared: ${notesRelPathForError} (got ${typeof notes.fences})`);
  }
  return notes.fences;
}

function notesFencesFor(row) {
  const notesPath = path.join(REPO_ROOT, path.dirname(row.relFile), path.basename(row.relFile).replace(/\.(js|py)$/, '') + '.notes.json');
  if (!existsSync(notesPath)) return [];
  let notes;
  try {
    notes = JSON.parse(readFileSync(notesPath, 'utf8'));
  } catch (err) {
    throw new Error(`notes.json is not valid JSON: ${path.relative(REPO_ROOT, notesPath)} (${err.message})`);
  }
  return validateNotesFences(notes, path.relative(REPO_ROOT, notesPath));
}

/** Markdown table row split that respects `\|`-escaped pipes inside a cell's prose (defect-ledger.md rows routinely quote code containing `||`/`|`). A naive `l.split('|')` shifts every later column on such a row. */
function splitTableRow(line) {
  return line.split(/(?<!\\)\|/).map((c) => c.trim());
}

// | ID | Step | Anchor | One-line | Status | Closes at | Source |
const DEFECT_LEDGER_REQUIRED_CELLS = ['id', 'step', 'anchor', 'summary', 'status', 'closesAt', 'source'];

/**
 * R-T addendum, commit 6 — strict-row-schema parse. The OLD `{id: cells[1],
 * status: cells[5] || ''}` silently coerced a row with a missing/shifted
 * column into `status: ''` — indistinguishable from a genuinely empty
 * Status cell, and (since `LEDGER_STATUS_VOCAB.test('')` is false) it would
 * simply count as an ordinary "not CLOSED/PIN" row in `scoreG6`'s bad-row
 * list, with NO signal that the row was actually malformed rather than
 * legitimately open. A row missing any of the 7 declared columns — or
 * whose `id` doesn't match the caller's own `<prefix>-D<N>` filter (a
 * defense-in-depth re-check: an escaped `\|` earlier in the row can shift
 * every later cell even though the raw-text prefix filter passed) — throws
 * loudly instead.
 */
function parseDefectLedgerRow(line, expectedPrefix) {
  const cells = splitTableRow(line);
  // cells[0] and cells[cells.length-1] are the empty boundary strings a
  // leading/trailing '|' produces on a well-formed row — the 7 declared
  // columns live at cells[1..7].
  const [, id, step, anchor, summary, status, closesAt, source] = cells;
  const parsed = { id, step, anchor, summary, status, closesAt, source };
  const missing = DEFECT_LEDGER_REQUIRED_CELLS.filter((k) => !parsed[k]);
  if (missing.length > 0) {
    throw new Error(`defect-ledger.md: malformed row (missing required column(s): ${missing.join(', ')}) — "${line.trim()}"`);
  }
  if (!new RegExp(`^${expectedPrefix}-D\\d+`).test(id)) {
    throw new Error(`defect-ledger.md: row id "${id}" does not match the declared prefix "${expectedPrefix}-D<N>" — "${line.trim()}"`);
  }
  return parsed;
}

function defectLedgerRowsFor(row) {
  const text = readFileSync(DEFECT_LEDGER_PATH, 'utf8');
  const lines = text.split('\n').filter((l) => l.startsWith('| ') && l.slice(2).trim().startsWith(`${row.prefix}-D`));
  return lines.map((l) => parseDefectLedgerRow(l, row.prefix));
}

function scoreG0(report) {
  const hasBoundary = /(§0|PH-0)[^\n]{0,100}\b(boundary|seed)\b/i.test(report) || /##\s*\d*\.?\s*PH-0\s*—?\s*boundary freeze/i.test(report);
  const hasSpecLine = /(target spec|governing spec|governing plan|governing:|governing specs)/i.test(report);
  return { max: 1, score: hasBoundary && hasSpecLine ? 1 : 0, detail: `boundary-section=${hasBoundary} spec-line=${hasSpecLine}` };
}
function scoreG1(report) {
  const phSection = section(report, /##\s*.{0,10}\d*\.?\s*PH-3[^\n]*\n/i) || section(report, /##\s*.{0,10}\d*\.?\s*(Intent Ledger)[^\n]*\n/i);
  const shaCount = phSection ? (phSection.match(/\b[0-9a-f]{7,10}\b/g) || []).length : 0;
  return { max: 1, score: phSection && shaCount >= 2 ? 1 : 0, detail: `PH-3 section found=${!!phSection} sha-count=${shaCount}` };
}
/**
 * R-T addendum, commit 6 — the KNOWN vacuous-green fix (Spec 123 §6's own
 * documented defect note, `123_step_opt_assessment_validation.md:313`):
 * the OLD logic returned a full 1/1 "vacuously satisfied" for ANY report
 * that never wrote the literal string "ASSESSMENT-INCOMPLETE" — with no
 * churn×complexity plot (PH-2, Spec 123 §6's actual G2 criterion:
 * "structure — churn × complexity, four quadrants... the top-right
 * quadrant, named") EVER having been produced or checked for. `compute_
 * centroids`'s own generated scorecard read `G2 | 1 | 1 | ASSESSMENT-
 * INCOMPLETE not claimed (vacuously satisfied)` with zero PH-2 evidence —
 * a lie, not a pass.
 *
 * The PH-2 BATCH artifact (the churn×complexity plot over the 27 domain
 * steps, run ONCE, not per-pilot — operator ruling 2026-08-25 decision 2,
 * `review_followups.md:2994`) now EXISTS: `scripts/analysis/step-churn-
 * complexity.mjs` generates `docs/reports/generated/122-churn-complexity.md`
 * (S6b, PH-2 churn×complexity batch WF2). `scoreG2` derives from it FIRST —
 * a generated, drift-checked fact beats a hand-written report section (the
 * R-R rule: generated, never hand-written). Fall-through order:
 *   (1) the generated table names THIS slug's quadrant (real quadrant, not
 *       the `excluded: chain-head (A3)` sentinel) -> 1, cites the artifact.
 *   (2) an actual PH-2/churn×complexity section in the report itself names
 *       a quadrant (mirrors G0/G1/G3/G5's own `section()` convention;
 *       unchanged from before this artifact existed) -> 1.
 *   (3) an honest ASSESSMENT-INCOMPLETE self-flag with a stated reason (the
 *       pre-existing justification mechanism, unchanged) -> 1.
 *   (4) none of the above -> 0 — the true state, never a fabricated pass.
 * `churnFindings` is parsed ONCE upstream (main(), mirrors captureFindings/
 * checkCaptures) — this function does no I/O of its own (FOLD 1).
 */
function scoreG2(row, report, churnFindings) {
  const churnRow = churnFindings.bySlug.get(row.slug);
  if (churnRow && churnRow.quadrant) {
    const sha7 = churnFindings.windowEnd ? churnFindings.windowEnd.slice(0, 7) : '(unknown)';
    return { max: 1, score: 1, detail: `122-churn-complexity.md quadrant=${churnRow.quadrant} window=${sha7}` };
  }
  const phSection = section(report, /##\s*.{0,10}\d*\.?\s*PH-2[^\n]*\n/i)
    || section(report, /##\s*.{0,10}\d*\.?\s*(churn.{0,20}complexity)[^\n]*\n/i);
  if (phSection) {
    const hasQuadrant = /top-right|top-left|bottom-right|bottom-left|quadrant/i.test(phSection);
    return { max: 1, score: hasQuadrant ? 1 : 0, detail: `PH-2/churn×complexity section found; quadrant named=${hasQuadrant}` };
  }
  const hasIncomplete = /ASSESSMENT-INCOMPLETE/.test(report);
  if (!hasIncomplete) {
    return { max: 1, score: 0, detail: 'no generated churn×complexity row for this slug, no PH-2/churn×complexity section, and ASSESSMENT-INCOMPLETE not claimed either' };
  }
  const stated = /ASSESSMENT-INCOMPLETE[\s\S]{0,300}?(because|why|reason|time-box|saturation)/i.test(report);
  return { max: 1, score: stated ? 1 : 0, detail: `no generated churn×complexity row; no PH-2 section; ASSESSMENT-INCOMPLETE claimed instead; why-stated=${stated}` };
}
function scoreG3(report) {
  const phSection = section(report, /##\s*.{0,10}\d*\.?\s*PH-3[^\n]*\n/i);
  if (!phSection) return { max: 2, score: 0, detail: 'no PH-3/Intent Ledger section found' };
  const rows = phSection.split('\n').filter((l) => l.trim().startsWith('|') && !/^\|[-\s|]+\|$/.test(l.trim()));
  const vocabHitRows = rows.filter((r) => DISPOSITION_VOCAB.some((v) => r.toLowerCase().includes(v)));
  const score = rows.length > 0 && vocabHitRows.length > 0 ? (vocabHitRows.length === rows.length ? 2 : 1) : phSection ? 1 : 0;
  return { max: 2, score, detail: `table rows=${rows.length} vocab-hit rows=${vocabHitRows.length}` };
}
/**
 * G-2 (Spec 124 §2 Rule 4, GAP G-2) — "no test asserts that a preserved-in-compute
 * disposition has a corresponding checks[].why. A future disposition could mark
 * something preserved-in-compute and simply not write the rule down anywhere."
 *
 * A disposition and a specific check's `why` text are two different artifacts
 * (a markdown table row in a report; a JSON string in a descriptor) with no
 * shared id to join on — there is no way to mechanically prove row N's rule is
 * THE SAME rule as check id X's why without semantic understanding this tool
 * does not have. What IS mechanically checkable, and matches the report
 * culture's own existing practice (pilot 3's own Intent Ledger: "preserved-
 * in-compute (buildMatchSql, A-2) with the predicate ... DECLARED in
 * notes.json + a shape lock"): every `preserved-in-compute` row must itself
 * NAME where the rule was written down — "why", "notes.json", or "checks[]"
 * appearing in the SAME row. A row that says only the disposition, with no
 * grounding of where the rule lives, is exactly the failure mode G-2 names.
 */
function checkPreservedInComputeHasWhy(report) {
  const phSection = section(report, /##\s*.{0,10}\d*\.?\s*PH-3[^\n]*\n/i);
  if (!phSection) return { pass: true, detail: 'no PH-3 section — vacuously nothing to check', violations: [] };
  const rows = phSection.split('\n').filter((l) => l.trim().startsWith('|') && !/^\|[-\s|]+\|$/.test(l.trim()));
  const preservedRows = rows.filter((r) => r.toLowerCase().includes('preserved-in-compute'));
  const violations = preservedRows.filter((r) => !/\bwhy\b|notes\.json|checks\[\]/i.test(r));
  return {
    pass: violations.length === 0,
    detail: `${preservedRows.length} preserved-in-compute row(s), ${violations.length} with no why/notes.json/checks[] grounding`,
    violations,
  };
}

function scoreG4(report) {
  const hit = /risk class[\s\S]{0,400}?\bchance\b[\s\S]{0,200}?\bimpact\b/i.test(report) || /\bchance\b[\s\S]{0,100}?\bimpact\b[\s\S]{0,200}?risk class/i.test(report);
  return { max: 2, score: hit ? 2 : 0, detail: `risk-class row with chance+impact found=${hit}` };
}
function scoreG5(report) {
  const phSection = section(report, /##\s*.{0,10}\d*\.?\s*PH-5[^\n]*\n/i) || section(report, /##\s*.{0,10}\d*\.?\s*(Seam map)[^\n]*\n/i);
  if (!phSection) return { max: 1, score: 0, detail: 'no PH-5/Seam map section found' };
  const has = (re) => re.test(phSection);
  const all = has(/db seam/i) && has(/clock seam/i) && has(/network seam/i) && has(/argv[\s/]*env seam|env seam/i);
  return { max: 1, score: all ? 1 : 0, detail: `db=${has(/db seam/i)} clock=${has(/clock seam/i)} network=${has(/network seam/i)} argv/env=${has(/argv[\s/]*env seam|env seam/i)}` };
}
function scoreG6(row) {
  // R-T addendum, commit 6 — a malformed row now THROWS from the parser
  // (parseDefectLedgerRow) rather than silently coercing into a normal-
  // looking {status: ''} row; caught HERE and turned into an explicit
  // FAIL for THIS step only — a corrupt defect-ledger.md row under one
  // step's prefix must not abort `--all`'s validation of every other step.
  let rows;
  try {
    rows = defectLedgerRowsFor(row);
  } catch (err) {
    return { max: 3, score: 0, detail: `defect-ledger.md malformed for prefix ${row.prefix}-D*: ${err.message}` };
  }
  if (rows.length === 0) return { max: 3, score: 0, detail: `no defect-ledger rows found for prefix ${row.prefix}-D*` };
  const bad = rows.filter((r) => !LEDGER_STATUS_VOCAB.test(r.status));
  return { max: 3, score: bad.length === 0 ? 3 : 0, detail: `${rows.length} ledger row(s), ${bad.length} without CLOSED/PIN (${bad.map((b) => b.id).join(', ')})` };
}
function scoreG7(row, report) {
  const violationsPath = path.join(REPO_ROOT, 'src/tests/steps', row.slug, 'violations.test.ts');
  const fileExists = existsSync(violationsPath);
  // R-T addendum, commit 6 — same posture as scoreG6 above: a malformed
  // notes.json now throws from notesFencesFor; caught here as an explicit
  // FAIL rather than letting it either crash the whole run OR (the OLD
  // behavior) silently read as "zero fences", which made `lockCoverage`
  // vacuously true for a step whose notes file is simply broken.
  let fences;
  try {
    fences = notesFencesFor(row);
  } catch (err) {
    return { max: 3, score: 0, detail: `notes.json malformed: ${err.message}` };
  }
  let itCount = 0;
  if (fileExists) {
    const text = readFileSync(violationsPath, 'utf8');
    itCount = (text.match(/\bit(?:\.each|\.fails)?\s*\(/g) || []).length;
  }
  const hasRed = /\bRED\b/.test(report);
  const lockCoverage = fences.length === 0 || itCount >= fences.length;
  const score = fileExists && lockCoverage && hasRed ? 3 : fileExists && hasRed ? 1 : 0;
  return { max: 3, score, detail: `file=${fileExists} fences=${fences.length} it-count=${itCount} RED-evidence=${hasRed}` };
}
function scoreG8(captureFindings) {
  const invOk = captureFindings.invocationsMissing.length === 0;
  const fpOk = captureFindings.staleFingerprints.length === 0;
  const diffOk = captureFindings.unexplainedDiffs.length === 0;
  const score = invOk && fpOk && diffOk ? 3 : 0;
  return {
    max: 3,
    score,
    detail: `missing-invocations=${captureFindings.invocationsMissing.length} stale-fingerprints=${captureFindings.staleFingerprints.length} unexplained-diffs=${captureFindings.unexplainedDiffs.length}`,
  };
}
function scoreG9(report) {
  const hasHeading = /§?R\.?\s*Reflection/i.test(report);
  const hasLow = /LOW-CONFIDENCE/i.test(report);
  const hasRecurring = /RECURRING\s*\/?\s*STANDARD-SHAPING|RECURRING\/STANDARD-SHAPING/i.test(report);
  return { pass: hasHeading && hasLow && hasRecurring, detail: `heading=${hasHeading} low-confidence-table=${hasLow} recurring-table=${hasRecurring}` };
}
function scoreG4d(row) {
  // R-T addendum, commit 6 — same catch-and-report posture as scoreG7.
  let fences;
  try {
    fences = notesFencesFor(row);
  } catch (err) {
    return { pass: false, detail: `notes.json malformed: ${err.message}` };
  }
  const violationsPath = path.join(REPO_ROOT, 'src/tests/steps', row.slug, 'violations.test.ts');
  let itCount = 0;
  if (existsSync(violationsPath)) {
    itCount = (readFileSync(violationsPath, 'utf8').match(/\bit(?:\.each|\.fails)?\s*\(/g) || []).length;
  }
  return { pass: fences.length <= itCount, detail: `fences=${fences.length} lock-it-count=${itCount}` };
}
function scoreGShape(shape) {
  const pass = shape.fileClean !== false && shape.computeClean !== false;
  return { pass, detail: `file-clean=${shape.fileClean} compute-clean=${shape.computeClean}` };
}

/**
 * Rule 13 hard-stop wiring (Spec 124 §2 Rule 13, WF3 "Rules 10-12 output
 * panel remediation" commit 4). Before this, the policy-coverage matrix
 * (Rules 1-13) was purely REPORTED — a genuine, unpinned `enforced-red` row
 * (a checker finding a real, unadjudicated defect) never fed `hardStop`,
 * only G6/G7/G8/G9/the fast invariants did. That is the "green because it
 * never looked" class one layer up: the matrix COULD read red forever
 * without ever blocking anything.
 *
 * A row is exempt from gating ONLY when it carries a declared pin
 * (`pinned: true`, the SAME mechanism Rule 10's `checkVerdictSingleSource`
 * already uses for its own Spec 123 §3.1 KNOWN-DEFECT — `computePolicyMatrix`
 * sets it there and nowhere else today) — a checker that is correct while
 * the code is a FILED, adjudicated, ships-red-on-purpose defect. An
 * `enforced-red` row with no pin is either a brand-new finding nobody has
 * adjudicated, or (as `link_wsib`'s Rule 4 is, live, as of this commit) a
 * defect already reported to the operator but not yet ruled on — either way,
 * pre-commit/pre-push must not go green over it silently.
 *
 * Pure and side-effect-free so `selfTest()` can exercise all three cases
 * in-memory (Spec 121 §12b.6): unpinned red -> hard stop; pinned red -> no
 * hard stop; green -> no hard stop.
 *
 * @param {Array<{rule:number|string, status:string, pinned?:boolean}>} matrix
 * @returns {{hardStop:boolean, reasons:string[]}}
 */
function computeMatrixHardStop(matrix, excludedRules = new Set()) {
  const unpinnedRed = (matrix || []).filter(
    (r) => r.status === 'enforced-red' && !r.pinned && !excludedRules.has(Number(r.rule)),
  );
  return {
    hardStop: unpinnedRed.length > 0,
    reasons: unpinnedRed.map((r) => `Rule ${r.rule} (unpinned enforced-red)`),
  };
}

/**
 * R-K amendment (Spec 124), pilot 9 commit "step-validate honours declared
 * pending.stage for hard-stop" (2026-09-04) — "stage gates the hard-stop
 * set". `converted.json.pending[].stage` is DECLARED DATA (R-K.1) naming how
 * far a SPLIT commit-7 (descriptor before compute before runner — pilot 9,
 * ENRICHER, is the first pilot to do this; every pilot through 8 landed all
 * three in one commit) has progressed. G7 (RED-evidence, needs compute to
 * exist) / G8 (golden POST captures, need the runner actually wired to
 * dispatch compute) / G9 (the pilot's own closing Reflection, written once
 * the conversion concludes) and Rules 4 (compute-rule grounding) / 11
 * (order-guarantee reachability) / 12 (crash-posture reachability) are each
 * UNDECIDABLE — not merely unmet — before their own artifact exists; scoring
 * them 0/enforced-red and hard-stopping on that is indistinguishable from a
 * genuine regression, which this table exists to stop conflating.
 *
 * A step NOT named in `pending`, or named with NO declared `stage`, or
 * `stage` one of the two ORIGINAL terminal values (`red_suite` — nothing has
 * landed, `shape_clean` — everything has) gets TODAY'S BEHAVIOUR BYTE FOR
 * BYTE: `stageExclusions(undefined)` and `stageExclusions('red_suite'|
 * 'shape_clean')` all return empty sets, so every downstream `.has(...)`
 * check is always false and every arithmetic expression this feeds is
 * identical to the pre-amendment code path.
 *
 * An unrecognised `stage` string throws — "REDs the schema" — rather than
 * silently defaulting to "no exclusion" (which would hide a typo'd stage as
 * a full hard-stop, the wrong failure direction) or "exclude everything"
 * (which would hide a typo'd stage as a free pass, the dangerous direction).
 *
 * **R-K.2 amendment (pilot 9 commit 8, 2026-09-08) — `"shape_clean_pending_recapture"`,
 * a SIXTH value, NOT a no-op.** Pilot 9's commit-8 sequence (Spec 123 §3.1 pin-then-fix,
 * one policy concern per peel) fixes B4.5/EP-D9/EP-D8 across THREE SEPARATE commits
 * (P2/P3/P4), each editing `scripts/lib/compute/enrich-parcels.js` — but the golden POST
 * captures are recaptured ONCE, in a LATER commit (P6), after all three land: recapturing
 * after every peel would cost ~40 real minutes apiece to explain a diff only the FINAL
 * post-P4 state needs to account for. This is the first value that is genuinely a
 * TERMINAL-shaped stage (the file IS shape-clean — `conformanceFindings()` is `[]`, same
 * promise `"shape_clean"` makes) that STILL excludes a gate: G8 alone (golden fingerprint
 * currency), because that is the ONE thing the batched-recapture design deliberately defers.
 * Unlike `descriptor_only`/`compute_ported`/`runner_wired` (which exclude gates that are
 * UNDECIDABLE because their artifact does not exist yet), G8 here is fully decidable and
 * genuinely red — the exclusion is a DECLARED, BOUNDED deferral, not an artifact gap.
 */
const PENDING_STAGE_VOCAB = ['red_suite', 'descriptor_only', 'compute_ported', 'runner_wired', 'shape_clean', 'shape_clean_pending_recapture'];
const STAGE_HARDSTOP_EXCLUSIONS = {
  // red_suite and shape_clean are deliberately ABSENT — they fall through to
  // the `{gates:[], rules:[]}` default below, not a table entry, so a NEW
  // terminal value added to PENDING_STAGE_VOCAB without a matching table row
  // is "no exclusion" (safe direction) rather than a silent KeyError.
  descriptor_only: { gates: ['G7', 'G8', 'G9'], rules: [4, 11, 12] },
  compute_ported: { gates: ['G8', 'G9'], rules: [] },
  runner_wired: { gates: ['G9'], rules: [] },
  // R-K.2 — G8 ONLY. G7/G9/Rules 4/11/12 all remain enforced: this stage's whole point is
  // that everything BUT golden-fingerprint currency is genuinely, presently true.
  shape_clean_pending_recapture: { gates: ['G8'], rules: [] },
};

/** @param {string|undefined} stage @returns {{gates: Set<string>, rules: Set<number>}} */
function stageExclusions(stage) {
  if (stage === undefined || stage === null) return { gates: new Set(), rules: new Set() };
  if (!PENDING_STAGE_VOCAB.includes(stage)) {
    throw new Error(
      `converted.json pending[].stage "${stage}" is not in the closed vocabulary (${PENDING_STAGE_VOCAB.join(' | ')}) — R-K`,
    );
  }
  const entry = STAGE_HARDSTOP_EXCLUSIONS[stage];
  return entry ? { gates: new Set(entry.gates), rules: new Set(entry.rules) } : { gates: new Set(), rules: new Set() };
}

/** Appends " — stage-gated (<stage>)" to an excluded-and-red matrix row's `note`, never mutating the input array. */
function annotateStageGatedMatrix(matrix, excludedRules, stage) {
  if (!excludedRules || excludedRules.size === 0) return matrix;
  return (matrix || []).map((r) => (
    r.status === 'enforced-red' && !r.pinned && excludedRules.has(Number(r.rule))
      ? { ...r, note: `${r.note} — stage-gated (${stage})` }
      : r
  ));
}

/**
 * The hard-stop AGGREGATION only — split out of computeScorecard so the R-K
 * stage-gating behaviour is self-testable on synthetic `g`/`g9`/`matrixHardStop`
 * fixtures, with no need to fabricate a realistic report/descriptor/capture-
 * findings just to drive G6-G9 to particular values (Spec 121 §12b.6, the
 * SAME "test the pure computation in-memory" posture computeMatrixHardStop's
 * own self-test already uses). G6 is never excludable — no `pending.stage`
 * value speaks to whether the DEFECT LEDGER is well-formed, only to whether
 * compute/runner/golden artifacts exist yet.
 *
 * @param {Record<string,{score:number,max:number,detail:string}>} g - G0-G8
 * @param {{pass:boolean,detail:string}} g9
 * @param {boolean} invariantsFail
 * @param {{hardStop:boolean,reasons:string[]}} matrixHardStop - already computed with excl.rules applied
 * @param {{gates:Set<string>,rules:Set<number>}} excl
 * @param {string|undefined} stage
 */
function aggregateHardStop(g, g9, invariantsFail, matrixHardStop, excl, stage) {
  const g7Excluded = excl.gates.has('G7');
  const g8Excluded = excl.gates.has('G8');
  const g9Excluded = excl.gates.has('G9');
  const g7 = g7Excluded && g.G7.score === 0 ? { ...g.G7, detail: `${g.G7.detail} — stage-gated (${stage})` } : g.G7;
  const g8 = g8Excluded && g.G8.score === 0 ? { ...g.G8, detail: `${g.G8.detail} — stage-gated (${stage})` } : g.G8;
  const g9a = g9Excluded && !g9.pass ? { ...g9, detail: `${g9.detail} — stage-gated (${stage})` } : g9;
  const hardStopReasons = [
    ...(g.G6.score === 0 ? ['G6'] : []),
    ...(g.G7.score === 0 && !g7Excluded ? ['G7'] : []),
    ...(g.G8.score === 0 && !g8Excluded ? ['G8'] : []),
    ...(!g9.pass && !g9Excluded ? ['G9'] : []),
    ...(invariantsFail ? ['fast invariant'] : []),
    ...matrixHardStop.reasons,
  ];
  const hardStop =
    g.G6.score === 0
    || (g.G7.score === 0 && !g7Excluded)
    || (g.G8.score === 0 && !g8Excluded)
    || (!g9.pass && !g9Excluded)
    || invariantsFail
    || matrixHardStop.hardStop;
  return { g: { ...g, G7: g7, G8: g8 }, g9: g9a, hardStop, hardStopReasons };
}

function computeScorecard(row, report, descriptorInfo, shape, captureFindings, invariantResults, churnFindings, matrix) {
  const g = {
    G0: scoreG0(report),
    G1: scoreG1(report),
    G2: scoreG2(row, report, churnFindings),
    G3: scoreG3(report),
    G4: scoreG4(report),
    G5: scoreG5(report),
    G6: scoreG6(row),
    G7: scoreG7(row, report),
    G8: scoreG8(captureFindings),
  };
  const total = Object.values(g).reduce((s, x) => s + x.score, 0);
  const maxTotal = Object.values(g).reduce((s, x) => s + x.max, 0);
  const g9raw = scoreG9(report);
  const g4d = scoreG4d(row);
  const gshape = scoreGShape(shape);
  // EP-D13-adjacent fix (pilot 9 commit 8 P9, 2026-09-08) — id:9's `blockedSlugs` (when
  // present) scopes its hard-stop to the slug(s) it ACTUALLY names via `gate.blocks`
  // (checked literally, per checkCutoverPrereqs), not to every OTHER converted step's
  // own unrelated `--step=X` run. Every other `(registry)` invariant (4, 5 — genuine
  // fleet-wide integrity checks with no single implicated slug) keeps its existing
  // "any registry fail matters to everyone" semantics unchanged.
  const invariantsFail = invariantResults.some((r) => {
    if (!r.pass && r.slug === row.slug) return true;
    if (!r.pass && r.slug === '(registry)') {
      if (r.id === 9 && Array.isArray(r.blockedSlugs)) return r.blockedSlugs.includes(row.slug);
      return true;
    }
    return false;
  });
  // R-K amendment: `row.pendingStage` is undefined for every converted step
  // and for a pending step with no declared stage — `stageExclusions`
  // returns empty sets for both, so `aggregateHardStop` below is byte-for-
  // byte the pre-amendment scoring for every step not naming a partial stage.
  const excl = stageExclusions(row.pendingStage);
  const matrixHardStop = computeMatrixHardStop(matrix, excl.rules);
  const agg = aggregateHardStop(g, g9raw, invariantsFail, matrixHardStop, excl, row.pendingStage);
  const annotatedMatrix = annotateStageGatedMatrix(matrix, excl.rules, row.pendingStage);
  return {
    g: agg.g,
    total,
    maxTotal,
    g9: agg.g9,
    g4d,
    gshape,
    hardStop: agg.hardStop,
    hardStopReasons: agg.hardStopReasons,
    descriptorOk: descriptorInfo.ok,
    matrix: annotatedMatrix,
  };
}

// ---------------------------------------------------------------------------
// Rule 10 (Spec 124 §2, WF2 "Rules 10/11/12 mechanical checkers", C1, Fold A
// item 1, binding) — checkVerdictSingleSource: the audit_table verdict is
// derived from rows in exactly ONE place, scripts/lib/step/verdict.js's
// deriveVerdict. Two mechanically-decidable halves:
//   (a) checkNoSecondDerivation — no OTHER file in the closed library corpus
//       hand-rolls a duplicate PASS/WARN/FAIL cascade, unless it is EITHER
//       routed through deriveVerdict OR declared + cited in
//       SANCTIONED_VERDICT_SITES below (Rule 1 "nothing hidden" — the
//       exemption is a schema-visible row, not a code comment a scan would
//       never read).
//   (b) checkSelfSkipNeverPass — a SELF_SKIPPED terminal's all-INFO audit
//       rows must fold to a verdict OTHER than PASS. This CANNOT pass today
//       (SEVERITY_RANK has no SKIP rank — verdict.js:22) and Spec 123 §3.1
//       requires shipping the checker RED, pinned KNOWN-DEFECT, rather than
//       silently narrowing scope until it goes green: review_followups.md's
//       HIGH entry at "A lock-skipped converted step verdicts as PASS"
//       (filed 2026-09-03, grounder-confirmed) IS this defect, and
//       programme-items.json's VRD-SKIP item is its owner.
// ---------------------------------------------------------------------------

// The CLOSED corpus (Fold A item 1, binding): every scripts/lib/step/*.js
// file plus scripts/lib/pipeline.js and scripts/lib/source-version.js — the
// library files that see a full `rows` array and could therefore hand-roll a
// second cascade. scripts/lib/step/verdict.js itself is EXCLUDED: it is the
// canonical site, not "outside" it. Unconverted step scripts' own hand-rolled
// cascades (row 4 of the grounding table — enrich-parcels.js,
// enrich-permits.js, etc.) are OUT OF SCOPE by design (Operating Boundaries).
const VERDICT_LIBRARY_CORPUS = [
  'scripts/lib/step/index.js',
  'scripts/lib/step/acquire.js',
  'scripts/lib/step/config.js',
  'scripts/lib/step/ledger.js',
  'scripts/lib/step/plausibility.js',
  'scripts/lib/step/seam.js',
  'scripts/lib/step/staleness.js',
  'scripts/lib/step/validate.js',
  'scripts/lib/step/write.js',
  'scripts/lib/pipeline.js',
  'scripts/lib/source-version.js',
];

// BUILDO_VERDICT_CORPUS_EXTRA is a TEST-ONLY, ADDITIVE override (same
// convention as BUILDO_PROGRAMME_ITEMS_PATH/BUILDO_CHURN_TABLE_PATH/
// BUILDO_COMPUTE_DIR — a repo-relative path resolved once at module load) so
// `checkNoSecondDerivation`'s own real-CLI conformance lock (Spec 124 §2 Rule
// 10, WF3 "Rules 10-12 output panel remediation", commit 3) can fixture an
// UNSANCTIONED second verdict-derivation site into the SCANNED corpus without
// ever editing a live corpus file. ADDITIVE, not a replacement: the real 11
// files are always scanned too, so this cannot be used to silently narrow
// what production reads as clean.
const VERDICT_CORPUS_EXTRA = process.env.BUILDO_VERDICT_CORPUS_EXTRA
  ? [process.env.BUILDO_VERDICT_CORPUS_EXTRA]
  : [];

/**
 * Declared, cited exceptions — the SINGLE sanctioned re-derivation per site.
 * Matched by EXACT (whitespace-normalized) text: an edit to the sanctioned
 * line un-sanctions it until a human re-reviews and updates the snippet —
 * the sanction is tied to the actual code, not to a filename.
 */
const SANCTIONED_VERDICT_SITES = [
  {
    file: 'scripts/lib/pipeline.js',
    anchor: 'emitSummary — escalate-only verdict recompute (pipeline.js:461-469)',
    reason:
      'Deliberately asymmetric from deriveVerdict, per Spec 48 §3.5/§3.6: raises the ' +
      'verdict when an auto-injected sys_*/err_*/dq_*/cov_* health-metric row is more ' +
      'severe than the caller-supplied verdict, but NEVER downgrades an already-set ' +
      'verdict, and preserves SKIP/UNKNOWN verbatim. deriveVerdict has no escalate-only ' +
      'mode and no SKIP/UNKNOWN concept, so this is not behaviour-identical and cannot ' +
      'be routed through it — it is the one sanctioned second site in the corpus.',
    snippets: [
      "rows.some((r) => r.status === 'FAIL') ? 'FAIL' : rows.some((r) => r.status === 'WARN') ? 'WARN'",
      '.verdict = rowDerived',
    ],
  },
];

// The hand-rolled duplicate-of-deriveVerdict cascade shape, regardless of what
// it is assigned to (Fold A: "the checker REDs on any other verdict assignment").
const VERDICT_CASCADE_RE = /rows\.some\(\s*\(?\s*[\w$]+\s*\)?\s*=>\s*[\w.$]+\.status\s*===\s*(['"])FAIL\1\s*\)\s*\?\s*(['"])FAIL\2[\s\S]{0,120}?rows\.some\(\s*\(?\s*[\w$]+\s*\)?\s*=>\s*[\w.$]+\.status\s*===\s*(['"])WARN\3\s*\)\s*\?\s*(['"])WARN\4/g;
// An assignment/declaration whose LHS is literally `verdict` (a bare variable
// or object key) or a `.verdict` member — the direct tell of a second
// derivation SITE, independent of the cascade shape above (e.g. `at.verdict =
// rowDerived` reads the cascade's own OUTPUT, not the cascade itself).
const VERDICT_SITE_RE = /((?:(?<![.\w])verdict\s*[:=](?!=))|(?:\.verdict\s*=))\s*([^;,\n]+)/g;

function normalizeVerdictSnippet(s) {
  return s.replace(/\s+/g, ' ').trim();
}

/** True iff `rhs` is a routed call, a plain string-literal sentinel, or a bare property-read alias — none of which are a SECOND derivation. */
function isVerdictSiteExempt(rhs) {
  const t = rhs.trim().replace(/;\s*$/, '');
  if (/deriveVerdict\s*\(/.test(t)) return true; // routed — the single source, not duplicated
  if (/^(['"]).*\1$/.test(t)) return true; // a hardcoded sentinel (e.g. 'UNKNOWN'), not row-derived
  if (/^[\w.$]+\.verdict$/.test(t)) return true; // `X.verdict` — a READ/alias, not an assignment TO verdict
  return false;
}

/**
 * Every hand-rolled verdict-derivation site in `source` — pure (no I/O), so
 * `selfTest()` can exercise it in-memory (Spec 121 §12b.6: a checker never
 * proven to fire is not evidence).
 * @returns {Array<{line:number, text:string}>}
 */
function findVerdictDerivationSites(source) {
  const hits = [];
  let m;
  VERDICT_CASCADE_RE.lastIndex = 0;
  while ((m = VERDICT_CASCADE_RE.exec(source))) {
    hits.push({ line: source.slice(0, m.index).split('\n').length, text: normalizeVerdictSnippet(m[0]) });
  }
  VERDICT_SITE_RE.lastIndex = 0;
  while ((m = VERDICT_SITE_RE.exec(source))) {
    if (isVerdictSiteExempt(m[2])) continue;
    hits.push({ line: source.slice(0, m.index).split('\n').length, text: normalizeVerdictSnippet(m[0]) });
  }
  return hits;
}

/** (a) — no unlisted second derivation across the closed library corpus. */
function checkNoSecondDerivation() {
  const corpus = [...VERDICT_LIBRARY_CORPUS, ...VERDICT_CORPUS_EXTRA];
  const sanctionedByFile = new Map(SANCTIONED_VERDICT_SITES.map((s) => [s.file, s]));
  const unsanctioned = [];
  const sanctionedHits = [];
  for (const relFile of corpus) {
    const abs = path.join(REPO_ROOT, relFile);
    if (!existsSync(abs)) continue;
    const source = readFileSync(abs, 'utf8');
    for (const hit of findVerdictDerivationSites(source)) {
      const sanction = sanctionedByFile.get(relFile);
      const isSanctioned = !!sanction && sanction.snippets.some((s) => normalizeVerdictSnippet(s) === hit.text);
      if (isSanctioned) sanctionedHits.push({ file: relFile, ...hit });
      else unsanctioned.push({ file: relFile, ...hit });
    }
  }
  return {
    pass: unsanctioned.length === 0,
    detail: unsanctioned.length === 0
      ? `${corpus.length} corpus file(s) scanned, 0 unsanctioned second derivations, ${sanctionedHits.length} sanctioned hit(s) matched SANCTIONED_VERDICT_SITES`
      : `unsanctioned second derivation(s): ${unsanctioned.map((u) => `${u.file}:${u.line}`).join(', ')}`,
    unsanctioned,
    sanctionedHits,
  };
}

/** (b) — a SELF_SKIPPED terminal's audit rows must not fold to PASS. KNOWN-DEFECT: ships RED. */
function checkSelfSkipNeverPass() {
  const stepIndex = require(path.join(REPO_ROOT, 'scripts/lib/step/index.js'));
  const meta = stepIndex.skipRecordsMeta({ identity: { display_name: '__rule10_self_test__' } }, 'advisory_lock_held_elsewhere');
  const verdict = meta.audit_table.verdict;
  return {
    pass: verdict !== 'PASS',
    detail: verdict === 'PASS'
      ? `KNOWN-DEFECT (Spec 123 §3.1 pin): skipRecordsMeta's all-INFO audit table folds to verdict=PASS — ` +
        `SEVERITY_RANK has no SKIP rank (scripts/lib/step/verdict.js:22). Pinned against ` +
        `review_followups.md "A lock-skipped converted step verdicts as PASS" (HIGH, 2026-09-03) and ` +
        `scripts/steps/_schema/programme-items.json "VRD-SKIP" (nice_to_have).`
      : `SELF_SKIPPED audit table folds to verdict=${verdict} (!= PASS) — the KNOWN-DEFECT is closed; VRD-SKIP should move to BUILT`,
  };
}

/** Both halves, folded into the ONE matrix-row status + detail for Rule 10. */
function checkVerdictSingleSource() {
  const singleSource = checkNoSecondDerivation();
  const skipNeverPass = checkSelfSkipNeverPass();
  // A genuinely UNSANCTIONED second derivation is a real, unpinned bug — that
  // reds independent of the KNOWN-DEFECT pin below. Otherwise the row is
  // `enforced-red` by RULING (Spec 123 §3.1): the checker is correct and the
  // library is not, pinned rather than silently narrowed to pass.
  const status = !singleSource.pass ? 'enforced-red' : (skipNeverPass.pass ? 'enforced-green' : 'enforced-red');
  const detail = !singleSource.pass
    ? `(a) FAILED — ${singleSource.detail}`
    : `(a) OK — ${singleSource.detail} · (b) ${skipNeverPass.pass ? 'OK' : 'KNOWN-DEFECT (pinned)'} — ${skipNeverPass.detail}`;
  return { status, detail, singleSource, skipNeverPass };
}

// ---------------------------------------------------------------------------
// Rule 11 (Spec 124 §2, WF2 "Rules 10/11/12 mechanical checkers", C2) —
// checkOrderGuaranteesCited: the DECLARED half only (GAP G-3's completeness
// half stays open — nothing proves the declaration is COMPLETE w.r.t. the
// spec's prose, and a future generic phase-order change is not re-audited
// automatically). Regex-scanning a spec's free-form "before X" prose is
// explicitly REJECTED (simultaneously false-positive on every incidental
// "before" and false-negative on any other phrasing) — the checker instead
// verifies the DECLARED `checks[].order_guarantee` field the schema now
// requires on every `when:"pre_write"` check:
//   (a) every pre_write check carries order_guarantee — schema-enforced
//       (allOf if/then, step.schema.json), re-verified here defensively
//       since a caller may hand this function a descriptor that bypassed
//       AJV (e.g. a fixture).
//   (b) order_guarantee.spec_ref resolves to a real file under docs/specs/.
//   (c) order_guarantee.anchor is found LITERALLY in that file — an anchor
//       that rots (the cited prose moved or changed) is RED, never silently
//       stale.
//   (d) spec_ref agrees with the descriptor's own identity.spec — a
//       pre_write check's ordering guarantee must trace to THIS STEP's own
//       governing spec, never an unrelated one. Ask 6 amendment (pilot 9
//       commit 1): an anchor may be spec-qualified "<specnum>:<anchor text>"
//       to name a DIFFERENT governing spec for THIS check only (identity.spec
//       stays single-valued) — rule (d) then compares spec_ref against the
//       qualifier's own resolved file instead. An unqualified anchor is the
//       unchanged pre-existing behavior.
// ---------------------------------------------------------------------------

/** The docs/specs/**\/<n>_*.md file for a bare spec number string (e.g. "59"), or null if none/ambiguous. Two levels deep only — matches the real tree (docs/specs/*.md, docs/specs/<subdir>/*.md). */
function resolveSpecFileForNumber(specNumber) {
  if (!specNumber || !/^\d+$/.test(String(specNumber))) return null;
  const specsRoot = path.join(REPO_ROOT, 'docs/specs');
  const re = new RegExp(`^${specNumber}_.*\\.md$`);
  const hits = [];
  const scan = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        for (const f of readdirSync(path.join(dir, entry.name))) {
          if (re.test(f)) hits.push(path.join(dir, entry.name, f));
        }
      } else if (re.test(entry.name)) {
        hits.push(path.join(dir, entry.name));
      }
    }
  };
  scan(specsRoot);
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Pure over an already-parsed descriptor, so `selfTest()` can exercise it
 * in-memory. `specTextByFile` is an OPTIONAL override map (relFile -> text)
 * used only by the self-test to avoid disk I/O for synthetic fixtures —
 * production calls it with no override and real files are read.
 */
function checkOrderGuaranteesCited(descriptor, specTextByFile = null) {
  if (!descriptor) return { pass: true, detail: 'no descriptor', violations: [] };
  const checks = Array.isArray(descriptor.checks) ? descriptor.checks : [];
  const preWrite = checks.filter((c) => c && c.when === 'pre_write');
  if (preWrite.length === 0) {
    return { pass: true, detail: 'no when:"pre_write" checks — vacuously nothing to cite', violations: [] };
  }
  const identitySpec = descriptor.identity && descriptor.identity.spec;
  const specFile = specTextByFile ? null : resolveSpecFileForNumber(identitySpec);
  const violations = [];
  for (const c of preWrite) {
    const og = c.order_guarantee;
    if (!og || typeof og !== 'object' || !og.spec_ref || !og.anchor) {
      violations.push(`${c.id}: no order_guarantee {guarantee, spec_ref, anchor} declared`);
      continue;
    }
    // Ask 6 amendment (Spec 124 §2 Rule 11, pilot 9 commit 1) — an anchor MAY be
    // spec-qualified as "<specnum>:<anchor text>" to declare that THIS pre_write
    // check's order_guarantee governs under a DIFFERENT spec than the descriptor's
    // own identity.spec. Rule (d) below (spec_ref must agree with the governing
    // spec) then compares spec_ref against the QUALIFIER's resolved file instead
    // of identity.spec's — the step-wide identity.spec stays single-valued
    // (unchanged), but one specific pre_write check can cite a spec the step's
    // outputs genuinely span (e.g. enrich_parcels: identity.spec "65", pass 5's
    // own order_guarantee governed by Spec 78 §P3A.1). An UNQUALIFIED anchor is
    // byte-for-byte the pre-existing behavior — nothing changes for any other
    // pilot's descriptor.
    const qualified = /^(\d+):([\s\S]+)$/.exec(og.anchor);
    const qualifiedSpecNumber = qualified ? qualified[1] : null;
    const anchorText = qualified ? qualified[2] : og.anchor;

    let text;
    if (specTextByFile) {
      text = Object.prototype.hasOwnProperty.call(specTextByFile, og.spec_ref) ? specTextByFile[og.spec_ref] : null;
      if (text === null) {
        violations.push(`${c.id}: spec_ref "${og.spec_ref}" does not resolve`);
        continue;
      }
    } else {
      const abs = path.join(REPO_ROOT, og.spec_ref);
      if (!og.spec_ref.startsWith('docs/specs/') || !existsSync(abs)) {
        violations.push(`${c.id}: spec_ref "${og.spec_ref}" does not resolve to a real file under docs/specs/`);
        continue;
      }
      text = readFileSync(abs, 'utf8');
    }
    if (!text.includes(anchorText)) {
      violations.push(`${c.id}: anchor not found literally in ${og.spec_ref} — rotted citation`);
      continue;
    }
    if (!specTextByFile) {
      if (qualifiedSpecNumber) {
        const qualifiedFile = resolveSpecFileForNumber(qualifiedSpecNumber);
        if (!qualifiedFile) {
          violations.push(`${c.id}: anchor qualifier "${qualifiedSpecNumber}:" does not resolve to exactly one docs/specs/**/<n>_*.md file`);
        } else if (path.resolve(REPO_ROOT, og.spec_ref) !== path.resolve(qualifiedFile)) {
          violations.push(`${c.id}: spec_ref "${og.spec_ref}" does not agree with its own anchor qualifier "${qualifiedSpecNumber}:" (-> ${path.relative(REPO_ROOT, qualifiedFile)})`);
        }
      } else if (identitySpec) {
        if (!specFile) {
          violations.push(`${c.id}: identity.spec "${identitySpec}" does not resolve to exactly one docs/specs/**/<n>_*.md file, so spec_ref agreement cannot be checked`);
        } else if (path.resolve(REPO_ROOT, og.spec_ref) !== path.resolve(specFile)) {
          violations.push(`${c.id}: spec_ref "${og.spec_ref}" does not agree with identity.spec "${identitySpec}" (-> ${path.relative(REPO_ROOT, specFile)}) — qualify the anchor "<specnum>:<text>" if this check genuinely governs under a different spec`);
        }
      }
    }
  }
  return {
    pass: violations.length === 0,
    detail: `${preWrite.length} when:"pre_write" check(s), ${violations.length} order_guarantee violation(s)`,
    violations,
  };
}

// ---------------------------------------------------------------------------
// Rule 12 (Spec 124 §2, WF2 "Rules 10/11/12 mechanical checkers", C3) —
// checkInterruptedPostureTruthful: static, runner-derived crash-recovery
// posture. Two parts, over ONE converted descriptor:
//   (a) DECLARATION — a destructive retraction target (a write with
//       `retract:"all"` or `retract_when:"full_only"`) must declare
//       `recovery.interrupted === "force_full_on_next_run"`. Mirrors the
//       existing R-B lock (step-conformance.infra.test.ts) so Rule 12's OWN
//       matrix row is not silently PROSE-ONLY from step:validate's vantage.
//   (b) REACHABILITY — when `recovery.interrupted` IS declared
//       "force_full_on_next_run", the descriptor's `execution.shape`'s own
//       runner (scripts/lib/step/index.js) must actually REACH
//       `detectInterruptedRetraction` on every path — DERIVED, never hand-
//       listed, from a source scan: a runner that calls
//       `staleness.ledgerGatedSkip` must fold `interruptedRetraction` into
//       its `bypassed` term BEFORE that call, else the check sits dead
//       behind the gated-skip early return (the LW-D20 recurrence shape —
//       closed for MATERIALIZE at `febd0968`, ahead of this checker landing,
//       per Fold A item 2). A runner with NO `ledgerGatedSkip` call at all
//       instead calls `staleness.selectMode` UNCONDITIONALLY, which folds
//       the same reader internally (`staleness.js`) — also reachable. A
//       runner reaching neither is unreachable.
// ---------------------------------------------------------------------------

/** shape -> the run*Phase function name that drives it (scripts/lib/step/index.js). "assert" has none — an ASSERT writes nothing, so it can never have a destructive retraction target to protect. */
const SHAPE_RUNNER_FN = {
  assert: null,
  ingest: 'runIngestPhase',
  link: 'runLinkPhase',
  link_keyed: 'runLinkKeyedPhase',
  cascade: 'runCascadePhase',
  materialize: 'runMaterializePhase',
  backfill: 'runBackfillPhase',
  recorder: 'runRecorderPhase',
  enrich: 'runEnrichPhase',
};

/**
 * The brace-matched body of `async function <fnName>(` in `source`, or null if
 * not found. Pure text scan — no AST dependency, mirrors the rest of this
 * file's own convention (e.g. `section()`). Every runner here takes ONE
 * destructured object parameter (`({ descriptor, pool, ... })`), so the
 * parameter list's OWN `{`/`}` must be paren-matched past FIRST — searching
 * for the body's `{` from `m.index` directly would stop at the destructuring
 * pattern's opening brace instead of the function body's.
 */
function extractFunctionBody(source, fnName) {
  const m = new RegExp(`\\basync function ${fnName}\\s*\\(`).exec(source);
  if (!m) return null;
  const parenStart = source.indexOf('(', m.index);
  if (parenStart === -1) return null;
  let pdepth = 0;
  let parenEnd = -1;
  for (let i = parenStart; i < source.length; i++) {
    if (source[i] === '(') pdepth++;
    else if (source[i] === ')') {
      pdepth--;
      if (pdepth === 0) { parenEnd = i; break; }
    }
  }
  if (parenEnd === -1) return null;
  const braceStart = source.indexOf('{', parenEnd);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(braceStart, i + 1);
    }
  }
  return null;
}

/** Pure — takes a runner function BODY (already extracted), so `selfTest()` can exercise it in-memory against synthetic bodies. */
function runnerReachability(body) {
  if (!body) return { reachable: false, reason: 'runner function not found in scripts/lib/step/index.js' };
  const callsLedgerGatedSkip = /staleness\.ledgerGatedSkip\s*\(/.test(body);
  const callsDetectInterrupted = /detectInterruptedRetraction\s*\(/.test(body);
  const bypassedFoldsInterrupted = /bypassed\s*=[^;\n]*interruptedRetraction/.test(body);
  if (callsLedgerGatedSkip) {
    if (callsDetectInterrupted && bypassedFoldsInterrupted) {
      return { reachable: true, reason: 'calls staleness.ledgerGatedSkip; bypassed folds interruptedRetraction.interrupted before the early-return can short-circuit past it' };
    }
    return {
      reachable: false,
      reason: 'calls staleness.ledgerGatedSkip but `bypassed` does not fold interruptedRetraction.interrupted — a crashed/stuck-running prior run cannot force FULL past the gated-skip early return (the LW-D20 recurrence shape)',
    };
  }
  if (/staleness\.selectMode\s*\(/.test(body)) {
    return { reachable: true, reason: 'no staleness.ledgerGatedSkip early-return on this path; calls staleness.selectMode unconditionally, which folds detectInterruptedRetraction internally' };
  }
  // ENRICHER (pilot 9, runEnrichPhase) — a THIRD reachable shape. This archetype
  // has no ledger-gated skip and no full/incremental mode selector to fold into
  // (its own staleness mechanism is the DECLARED scope-defer, Spec 122 §3.0b, an
  // unconditional pre-transaction count check, not a staleness.selectMode call).
  // Reachable iff the runner calls staleness.detectInterruptedRetraction directly
  // AND folds interruptedRetraction.interrupted into the `full` decision that
  // every pass reads — the same structural guarantee CASCADE's `bypassed` fold
  // gives, under ENRICHER's own vocabulary.
  if (/detectInterruptedRetraction\s*\(/.test(body) && /\bfull\s*=[^;\n]*interruptedRetraction/.test(body)) {
    return { reachable: true, reason: 'no staleness.ledgerGatedSkip/selectMode on this path (ENRICHER\'s own scope-defer archetype, Spec 122 §3.0b); calls staleness.detectInterruptedRetraction directly and folds interruptedRetraction.interrupted into the full/incremental decision before any pass runs' };
  }
  return { reachable: false, reason: 'reaches neither staleness.ledgerGatedSkip, staleness.selectMode, nor an interruptedRetraction fold into `full` — no interrupted-retraction check exists on this runner\'s path' };
}

function checkInterruptedPostureTruthful(descriptor, indexSourceOverride = null) {
  if (!descriptor) return { pass: true, detail: 'no descriptor', declarationViolations: [], reachability: null };
  const writes = descriptor.outputs && descriptor.outputs !== 'none' && Array.isArray(descriptor.outputs.writes) ? descriptor.outputs.writes : [];
  const hasDestructiveRetraction = writes.some((w) => w.retract === 'all' || w.retract_when === 'full_only');
  const interrupted = descriptor.recovery && descriptor.recovery !== 'none' ? descriptor.recovery.interrupted : undefined;

  const declarationViolations = [];
  if (hasDestructiveRetraction && interrupted !== 'force_full_on_next_run') {
    declarationViolations.push(`a destructive retraction target (retract:"all" or retract_when:"full_only") requires recovery.interrupted === "force_full_on_next_run", got ${JSON.stringify(interrupted ?? null)}`);
  }

  if (interrupted !== 'force_full_on_next_run') {
    return {
      pass: declarationViolations.length === 0,
      detail: declarationViolations.length === 0
        ? `recovery.interrupted=${JSON.stringify(interrupted ?? null)} — no reachability claim to verify`
        : declarationViolations.join('; '),
      declarationViolations,
      reachability: null,
    };
  }

  const shape = descriptor.execution && descriptor.execution.shape;
  const fnName = shape ? SHAPE_RUNNER_FN[shape] : undefined;
  if (fnName === undefined) {
    return { pass: false, detail: `execution.shape ${JSON.stringify(shape ?? null)} is not a recognized shape — cannot verify reachability`, declarationViolations, reachability: null };
  }
  if (fnName === null) {
    return { pass: false, detail: `execution.shape "${shape}" has no runner that could ever reach an interrupted-retraction check, yet recovery.interrupted="force_full_on_next_run" is declared — an unreachable declaration`, declarationViolations, reachability: null };
  }
  const source = indexSourceOverride !== null ? indexSourceOverride : readFileSync(path.join(REPO_ROOT, 'scripts/lib/step/index.js'), 'utf8');
  const body = extractFunctionBody(source, fnName);
  const reachability = runnerReachability(body);
  return {
    pass: declarationViolations.length === 0 && reachability.reachable,
    detail: `shape=${shape} runner=${fnName}: ${reachability.reason}${declarationViolations.length ? ` · ${declarationViolations.join('; ')}` : ''}`,
    declarationViolations,
    reachability,
  };
}

// ---------------------------------------------------------------------------
// (vi) POLICY COVERAGE MATRIX — Spec 124 Rules 1-13, per the header map above.
// ---------------------------------------------------------------------------
/**
 * C4 (Fold A item 3, binding correction) — a test title scopes to a step via
 * its RELATIVE FILE PATH (`scripts/link-massing.js`, hyphenated, since that
 * is the literal string every `it(\`${relFile} — …\`)` call site in
 * step-conformance.infra.test.ts embeds — measured, not assumed), while
 * every caller here passed `row.slug` (underscored, `link_massing`, the
 * manifest.scripts registry key) as the scope token. `"link_massing".
 * toLowerCase().includes("link-massing")` is false, so EVERY scoped match
 * in this file — Rule 3's §1.2a P4/LW-D10/R-A matching included, not only
 * Rule 11's now-retired one — silently matched ZERO tests and fell through
 * to whatever the caller's own "m.length === 0" branch did, never actually
 * reading the vitest result it claimed to. Normalizing BOTH sides to the
 * same separator makes the match direction-agnostic: a caller may pass
 * either the underscored slug or the hyphenated relFile.
 */
function normalizeScopeToken(s) {
  return s.toLowerCase().replace(/[-_]/g, '-');
}
function matchTests(tests, describeRe, scopeToken) {
  return tests.filter((t) => {
    if (!describeRe.test(t.fullName) && !t.ancestorTitles.some((a) => describeRe.test(a))) return false;
    if (!scopeToken) return true;
    return normalizeScopeToken(t.fullName).includes(normalizeScopeToken(scopeToken));
  });
}
function ruleStatus(matched) {
  if (matched.length === 0) return 'prose-only';
  return matched.every((t) => t.status === 'passed') ? 'enforced-green' : 'enforced-red';
}

function computePolicyMatrix(row, descriptorInfo, shape, vitestResult, p3, report) {
  const tests = vitestResult.ranOk ? vitestResult.tests : [];
  const slugToken = row.slug;
  const computeToken = harness.computePathFor(row.relFile) || '';

  const rows = [];
  // `pinned` (Rule 13 hard-stop wiring, WF3 commit 4, `computeMatrixHardStop`
  // above) — the SAME Spec 123 §3.1 KNOWN-DEFECT concept `checkVerdictSingleSource`
  // already carries in its own `detail` prose, now also a structured flag on
  // the row itself so a consumer never has to string-match "KNOWN-DEFECT" out
  // of free text to know whether an `enforced-red` row gates. Defaults false —
  // an `enforced-red` row is a hard stop unless explicitly, narrowly pinned.
  const push = (rule, name, status, note, pinned = false) => rows.push({ rule, name, status, note, pinned });

  {
    const baseline = checkSchemaBaseline();
    const ok = descriptorInfo.ok && shape.computeClean !== false && baseline.pass;
    push(1, 'Nothing hidden', ok ? 'enforced-green' : 'enforced-red', `G-1 schema-baseline: ${baseline.detail}`);
  }
  {
    const m = vitestResult.ranOk ? matchTests(tests, /§5\.5.*compute shape/i, computeToken) : [];
    const shapeOk = shape.computeClean !== false;
    const status = !vitestResult.ranOk ? (shapeOk ? 'enforced-green' : 'enforced-red') : m.length > 0 ? ruleStatus(m) : (shapeOk ? 'enforced-green' : 'enforced-red');
    push(2, 'Compute is just compute', status, m.length === 0 ? '§5.5 describe not scoped to this step in the vitest run' : '');
  }
  {
    const m = vitestResult.ranOk ? [
      ...matchTests(tests, /§1\.2a P4/i, slugToken),
      ...matchTests(tests, /LW-D10/i, slugToken),
      ...matchTests(tests, /R-A —/i, slugToken),
    ] : [];
    const g4 = checkOnInvalidFail(descriptorInfo.descriptor);
    const vitestOk = m.length === 0 || ruleStatus(m) === 'enforced-green';
    const status = g4.pass && vitestOk ? 'enforced-green' : 'enforced-red';
    push(3, 'Tunables externalized', status, `G-4: ${g4.detail}`);
  }
  {
    const g2 = checkPreservedInComputeHasWhy(report || '');
    push(4, 'Compute rule declared', g2.pass ? 'enforced-green' : 'enforced-red', `G-2: ${g2.detail}`);
  }
  push(5, 'checks >= 1', descriptorInfo.ok ? 'enforced-green' : 'enforced-red', '');
  push(6, 'Omission fails (18 categories)', descriptorInfo.ok ? 'enforced-green' : 'enforced-red', '');
  push(7, 'Archetype gates categories', descriptorInfo.ok ? 'enforced-green' : 'enforced-red', '');
  push(8, 'Per-target write discipline', descriptorInfo.ok ? 'enforced-green' : 'enforced-red', '');
  push(9, 'Banned write needs ledger (+ V7 no_retraction)', descriptorInfo.ok ? 'enforced-green' : 'enforced-red', '');
  {
    const v10 = checkVerdictSingleSource();
    // Pinned iff the red is caused SOLELY by the filed KNOWN-DEFECT
    // (skipNeverPass failing) with zero unsanctioned second derivations
    // (singleSource passing) — a genuine unsanctioned site (singleSource
    // failing) is NOT covered by the pin and still gates, per Fold A's own
    // "reds independent of the KNOWN-DEFECT pin below" ruling.
    const v10Pinned = v10.status === 'enforced-red' && v10.singleSource.pass && !v10.skipNeverPass.pass;
    push(10, 'Verdict row-derived', v10.status, v10.detail, v10Pinned);
  }
  {
    const v11 = checkOrderGuaranteesCited(descriptorInfo.descriptor);
    const status = v11.pass ? 'enforced-green' : 'enforced-red';
    push(11, 'Phase-order re-derive (declared half, checkOrderGuaranteesCited)', status, `${v11.detail}${v11.violations.length ? `: ${v11.violations.join('; ')}` : ''} — G-3 completeness half stays open`);
  }
  {
    // R-B half (recovery.interrupted, this checker's own job): static, mechanical.
    const v12 = checkInterruptedPostureTruthful(descriptorInfo.descriptor);
    // R-M half (recovery.before_image — Spec 124's own rulings table also tags
    // R-M "Rule 12 (recovery category)"): the EXISTING step-conformance.infra.
    // test.ts describe already enforces this robustly; it just could not be SEEN
    // by this tool's vitest-title matching, for the same underscore/hyphen
    // scopeToken bug C4 now fixes generically in `matchTests` itself (Fold A
    // item 3) — no local workaround needed here anymore.
    const mRM = vitestResult.ranOk ? matchTests(tests, /R-M\/LG-17/i, row.slug) : [];
    const rmStatus = mRM.length > 0 ? ruleStatus(mRM) : 'prose-only';
    const rmNote = mRM.length === 0 ? 'R-M/LG-17 describe not scoped to this step (vitest not run, or no before-image target)' : '';
    // R-B (this checker) is the PRIMARY, always-live claim; R-M only REDS the row
    // when it has actually run and found a real problem — a 'prose-only' R-M
    // (vitest skipped via --fast, or no before-image target on this step) never
    // downgrades an otherwise-green R-B half.
    const status = !v12.pass || rmStatus === 'enforced-red' ? 'enforced-red' : 'enforced-green';
    push(12, 'Truthful crash posture (R-B reachability, static + R-M before-image)', status, `R-B (checkInterruptedPostureTruthful): ${v12.detail} · R-M: ${rmStatus}${rmNote ? ` (${rmNote})` : ''}`);
  }
  push(13, 'A step validates itself', descriptorInfo.ok ? 'enforced-green' : 'enforced-red', 'this run of step:validate IS the mechanism');
  push('P3', 'I/O cost adjudication (measured, not gated)', 'measured', p3.detail);

  return rows;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function renderScorecard(row, sc, matrix, captureFindings, vitestResult, invariantResults) {
  const lines = [];
  lines.push('## Validation scorecard (generated)');
  lines.push('');
  lines.push(`> Generated by \`node scripts/analysis/step-validate.mjs --step=${row.slug} --write\` — Spec 123 §6, ruling R-R (2026-08-29).`);
  lines.push(`> Regenerate with the same command; a stale block is a conformance-lock finding (\`step-conformance.infra.test.ts\`).`);
  lines.push('');
  lines.push(`**Score: ${sc.total}/${sc.maxTotal}** · G9 Reflection: ${sc.g9.pass ? 'PASS' : 'FAIL'} · G4d fence-lock coverage: ${sc.g4d.pass ? 'PASS' : 'FAIL'} · G-shape: ${sc.gshape.pass ? 'PASS' : 'FAIL'} · **Hard stop: ${sc.hardStop ? `YES (${sc.hardStopReasons.join(', ')})` : 'no'}**`);
  lines.push('');
  lines.push('| Gate | Score | Max | Detail |');
  lines.push('|---|---:|---:|---|');
  for (const [id, v] of Object.entries(sc.g)) {
    lines.push(`| ${id} | ${v.score} | ${v.max} | ${v.detail} |`);
  }
  lines.push(`| G9 (binary) | ${sc.g9.pass ? 'PASS' : 'FAIL'} | — | ${sc.g9.detail} |`);
  lines.push(`| G4d (fence<=lock) | ${sc.g4d.pass ? 'PASS' : 'FAIL'} | — | ${sc.g4d.detail} |`);
  lines.push(`| G-shape | ${sc.gshape.pass ? 'PASS' : 'FAIL'} | — | ${sc.gshape.detail} |`);
  lines.push('');
  lines.push('### Fast invariants (always run — the fast descriptor gate)');
  lines.push('');
  lines.push('| # | Scope | Pass | Detail |');
  lines.push('|---|---|---|---|');
  const mine = invariantResults.filter((r) => r.slug === row.slug || r.slug === '(registry)');
  for (const r of mine) lines.push(`| ${r.id} | ${r.slug} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.detail} |`);
  lines.push('');
  lines.push('### Captures (item iv)');
  lines.push(`- missing invocations: ${captureFindings.invocationsMissing.length ? captureFindings.invocationsMissing.join(', ') : 'none'}`);
  lines.push(`- stale fingerprints: ${captureFindings.staleFingerprints.length ? captureFindings.staleFingerprints.join(', ') : 'none'}`);
  lines.push(`- compare ran: ${captureFindings.compareRan} · diffs found: ${captureFindings.diffs.length} · unexplained: ${captureFindings.unexplainedDiffs.length}`);
  if (captureFindings.unexplainedDiffs.length) {
    lines.push(`  - unexplained: ${captureFindings.unexplainedDiffs.map((d) => `${d.scenario}:${d.key}`).join('; ')}`);
  }
  lines.push('');
  lines.push('### Test suite (item iii)');
  lines.push(vitestResult.ranOk ? `- ${vitestResult.numPassedTests}/${vitestResult.numTotalTests} passed (suite success=${vitestResult.success})` : `- SKIPPED or failed to run: ${vitestResult.error || '--fast'}`);
  lines.push('');
  lines.push('### Policy coverage matrix (item vi) — Spec 124 Rules 1-13');
  lines.push('');
  lines.push('| Rule | Name | Status | Note |');
  lines.push('|---|---|---|---|');
  for (const r of matrix) lines.push(`| ${r.rule} | ${r.name} | ${r.status} | ${r.note} |`);
  const enforcedGreen = matrix.filter((r) => r.status === 'enforced-green').length;
  lines.push('');
  lines.push(`**Enforced-green: ${enforcedGreen}/${matrix.length}**`);
  lines.push('');
  return lines.join('\n');
}

/**
 * Strip a previously-generated scorecard block before scoring the report's OWN
 * prose. Without this, a report that already carries a block is SELF-CONTAMINATING:
 * the block's own rendered text ("ASSESSMENT-INCOMPLETE claimed; why-stated=…",
 * literal G0-G9 gate ids, "RED" appearing in G7's own detail column, etc.) gets
 * read back as if it were evidence, making a second `--write` run score
 * DIFFERENTLY from the first over the identical underlying prose — measured
 * 2026-08-29: G2 flipped 0->1 between two consecutive runs purely because the
 * first run's own "why-stated=false" text satisfied the SECOND run's own
 * "why-stated" proximity regex. A generated artifact must never become an input
 * to its own regeneration.
 */
function stripScorecard(text) {
  const marker = '## Validation scorecard (generated)';
  const idx = text.indexOf(marker);
  return idx === -1 ? text : text.slice(0, idx);
}

function writeScorecard(reportPath, block) {
  const text = readFileSync(reportPath, 'utf8');
  const marker = '## Validation scorecard (generated)';
  const idx = text.indexOf(marker);
  let next;
  if (idx === -1) {
    next = text.replace(/\n?$/, '\n') + '\n---\n\n' + block + '\n';
  } else {
    const rest = text.slice(idx);
    const nextHeadingMatch = /\n##\s(?!\s)/.exec(rest.slice(marker.length));
    const end = nextHeadingMatch ? idx + marker.length + nextHeadingMatch.index + 1 : text.length;
    next = text.slice(0, idx) + block + '\n' + text.slice(end);
  }
  writeFileSync(reportPath, next);
}

// ---------------------------------------------------------------------------
// Self-test (Spec 121 §12b.6 — a checker that has never been proven to fire is
// not evidence). Runs in-memory against synthetic fixtures on every invocation,
// cheap enough to always pay: it must FIRE on the bad case and stay quiet on
// the good one, or step:validate refuses to do real work.
// ---------------------------------------------------------------------------
function selfTest() {
  const goodReport = [
    '## §0. PH-0 seed — measured boundary table',
    'Target Spec: docs/specs/x.md',
    '## §1. PH-0 — boundary freeze (commit 1, G0)',
    'stuff',
    '## §2. PH-3 — Intent Ledger over the corpus (commit 2, G3)',
    '| commit | note |',
    '|---|---|',
    '| `abcdef1234` | preserved-in-compute disposition |',
    '| `1234abcdef` | encoded-as-descriptor-field disposition |',
    '## §3. PH-5 — Seam map (commit 3, G5)',
    '### DB seam',
    '### Clock seam',
    '### Network seam',
    '### argv/env seam',
    '## §R Reflection',
    'LOW-CONFIDENCE table here',
    'RECURRING/STANDARD-SHAPING table here',
  ].join('\n');
  const badReport = '## Some report\nnothing structured here at all.\n';

  const g0good = scoreG0(goodReport);
  const g0bad = scoreG0(badReport);
  if (g0good.score !== 1 || g0bad.score !== 0) {
    throw new Error(`self-test FAILED: G0 did not discriminate good/bad fixtures (good=${g0good.score}, bad=${g0bad.score})`);
  }
  const g5good = scoreG5(goodReport);
  const g5bad = scoreG5(badReport);
  if (g5good.score !== 1 || g5bad.score !== 0) {
    throw new Error(`self-test FAILED: G5 did not discriminate good/bad fixtures (good=${g5good.score}, bad=${g5bad.score})`);
  }
  const g9good = scoreG9(goodReport);
  const g9bad = scoreG9(badReport);
  if (!g9good.pass || g9bad.pass) {
    throw new Error(`self-test FAILED: G9 did not discriminate good/bad fixtures (good=${g9good.pass}, bad=${g9bad.pass})`);
  }
  const g3good = scoreG3(goodReport);
  const g3bad = scoreG3(badReport);
  if (g3good.score < 1 || g3bad.score !== 0) {
    throw new Error(`self-test FAILED: G3 did not discriminate good/bad fixtures (good=${g3good.score}, bad=${g3bad.score})`);
  }
  const g6good = { status: 'CLOSED · commit 7' };
  const g6bad = { status: 'OPEN · fix scheduled commit 7' };
  if (!LEDGER_STATUS_VOCAB.test(g6good.status) || LEDGER_STATUS_VOCAB.test(g6bad.status)) {
    throw new Error('self-test FAILED: LEDGER_STATUS_VOCAB did not discriminate CLOSED/PIN vs free-text OPEN');
  }
  // R-T addendum, commit 6 — scoreG2's vacuous-green fix (Spec 123 §6's own
  // documented defect, `123_step_opt_assessment_validation.md:313`), BYTE-
  // PRESERVED here with EMPTY_CHURN_FINDINGS (no generated table entry for
  // this fixture slug, so this exercises exactly the pre-existing report-
  // driven fallback — Regression Guardian's "old path unchanged" concern).
  // RED: `goodReport` (defined above) has NO PH-2/churn×complexity section
  // and never claims ASSESSMENT-INCOMPLETE either — the OLD code scored
  // this 1/1 "vacuously satisfied"; the fix must score it 0. GREEN: a
  // report that DOES carry a PH-2 section naming a quadrant scores 1.
  const g2Row = { slug: '__self_test_g2_fixture_slug__' };
  {
    const g2NoPh2 = scoreG2(g2Row, goodReport, EMPTY_CHURN_FINDINGS);
    if (g2NoPh2.score !== 0) {
      throw new Error(`self-test FAILED: scoreG2 still vacuously passes a report with no PH-2 section and no ASSESSMENT-INCOMPLETE claim (score=${g2NoPh2.score})`);
    }
    const withPh2 = goodReport + '\n## §4. PH-2 — churn × complexity (S6b batch, commit 6)\nthe top-right quadrant is named here.\n';
    const g2WithPh2 = scoreG2(g2Row, withPh2, EMPTY_CHURN_FINDINGS);
    if (g2WithPh2.score !== 1) {
      throw new Error(`self-test FAILED: scoreG2 did not award the point for a genuine PH-2 section naming a quadrant (score=${g2WithPh2.score}, detail=${g2WithPh2.detail})`);
    }
  }
  // PH-2 churn×complexity BATCH generator (S6b) — both-directions locks on
  // the NEW artifact-derived path (FOLD 1: scoreG2 does no I/O of its own;
  // churnFindings is threaded in). RED: the artifact "hidden" (loadChurnFindings
  // pointed at a nonexistent path, same test-only-override convention as
  // BUILDO_PROGRAMME_ITEMS_PATH — here exercised via the function's own
  // override parameter rather than env/child-process, since this self-test
  // runs in-process on every invocation) still scores exactly the pre-
  // existing report-driven result — a hidden/missing table is a fall-through,
  // never a crash and never a free pass. GREEN: a fixture table containing
  // the slug with a real quadrant scores 1 and the detail cites the artifact.
  // FABRICATED direction: a fixture row whose quadrant cell is genuinely
  // empty must NOT score 1 off the table's mere existence.
  {
    const hidden = loadChurnFindings(path.join(REPO_ROOT, '__nonexistent_churn_table_for_self_test__.md'));
    const g2Hidden = scoreG2(g2Row, badReport, hidden);
    const g2HiddenBaseline = scoreG2(g2Row, badReport, EMPTY_CHURN_FINDINGS);
    if (g2Hidden.score !== 0 || g2Hidden.score !== g2HiddenBaseline.score) {
      throw new Error(`self-test FAILED: scoreG2 with a hidden/missing churn table must fall through exactly like EMPTY_CHURN_FINDINGS (got score=${g2Hidden.score}, baseline=${g2HiddenBaseline.score})`);
    }
    const fixtureTable = [
      '| slug | file | commits | lines_changed | LOC | branches | quadrant |',
      '|---|---|---:|---:|---:|---:|---|',
      '| pilot4_g2_fixture | `scripts/pilot4-g2-fixture.js` | 10 | 100 | 50 | 20 | top-right |',
      '| pilot4_g2_empty | `scripts/pilot4-g2-empty.js` | 10 | 100 | 50 | 20 |  |',
    ].join('\n');
    const findings = parseChurnTable(`window_end: \`${'a'.repeat(40)}\`\n\n${fixtureTable}\n`);
    const g2Hit = scoreG2({ slug: 'pilot4_g2_fixture' }, badReport, findings);
    if (g2Hit.score !== 1 || !g2Hit.detail.includes('122-churn-complexity.md') || !g2Hit.detail.includes('top-right')) {
      throw new Error(`self-test FAILED: scoreG2 did not award the point for a real generated-table quadrant hit (${JSON.stringify(g2Hit)})`);
    }
    const g2EmptyCell = scoreG2({ slug: 'pilot4_g2_empty' }, badReport, findings);
    if (g2EmptyCell.score !== 0) {
      throw new Error(`self-test FAILED: a fixture row with an EMPTY quadrant cell must not score 1 off the table's mere existence (score=${g2EmptyCell.score})`);
    }
  }
  // R-T addendum, commit 6 — defect-ledger.md strict-row-schema parse. RED:
  // a row missing a required column (Status, here) throws; GREEN: the same
  // shape with every column present parses cleanly and round-trips the id.
  {
    const wellFormed = '| AS-D99 | assert_schema | `x.js:1` | a one-line summary | CLOSED · commit 9 | commit 9 | same |';
    const parsedGood = parseDefectLedgerRow(wellFormed, 'AS');
    if (parsedGood.id !== 'AS-D99' || parsedGood.status !== 'CLOSED · commit 9') {
      throw new Error(`self-test FAILED: parseDefectLedgerRow did not parse a well-formed row correctly (${JSON.stringify(parsedGood)})`);
    }
    const missingStatus = '| AS-D99 | assert_schema | `x.js:1` | a one-line summary |  | commit 9 | same |';
    let threwMissing = false;
    try { parseDefectLedgerRow(missingStatus, 'AS'); } catch { threwMissing = true; }
    if (!threwMissing) {
      throw new Error('self-test FAILED: parseDefectLedgerRow did not reject a row with an empty required Status column');
    }
  }
  // R-T addendum, commit 6 — notes.json fences strict-shape check
  // (validateNotesFences, the pure half of notesFencesFor split out for
  // in-memory self-testing). RED: `fences` declared as a non-array throws;
  // GREEN: a proper array round-trips, and an absent `fences` key is the
  // legitimate "declares nothing" case (empty array, not an error).
  {
    const fencesArr = validateNotesFences({ fences: [{ why: 'fixture' }] }, 'fixture.notes.json');
    if (fencesArr.length !== 1) {
      throw new Error(`self-test FAILED: validateNotesFences did not pass through a well-formed fences array (${JSON.stringify(fencesArr)})`);
    }
    const fencesAbsent = validateNotesFences({}, 'fixture.notes.json');
    if (fencesAbsent.length !== 0) {
      throw new Error('self-test FAILED: validateNotesFences did not treat an absent "fences" key as zero fences declared');
    }
    let threwBadShape = false;
    try { validateNotesFences({ fences: 'not-an-array' }, 'fixture.notes.json'); } catch { threwBadShape = true; }
    if (!threwBadShape) {
      throw new Error('self-test FAILED: validateNotesFences did not reject a "fences" value that is not an array');
    }
  }
  // Self-contamination regression lock (measured 2026-08-29): a report already
  // carrying a generated block must score IDENTICALLY to the same report with
  // the block absent — the block itself must never become evidence.
  {
    const contaminated = badReport + '\n## Validation scorecard (generated)\n\n| G2 | 0 | 1 | ASSESSMENT-INCOMPLETE claimed; why-stated=false |\n';
    const g2Clean = scoreG2(g2Row, badReport, EMPTY_CHURN_FINDINGS);
    const g2FromStripped = scoreG2(g2Row, stripScorecard(contaminated), EMPTY_CHURN_FINDINGS);
    if (g2Clean.score !== g2FromStripped.score) {
      throw new Error('self-test FAILED: stripScorecard did not neutralise a self-contaminating prior block');
    }
    const g2Unstripped = scoreG2(g2Row, contaminated, EMPTY_CHURN_FINDINGS);
    if (g2Unstripped.score === g2Clean.score && g2Unstripped.detail === g2Clean.detail) {
      throw new Error('self-test FAILED: the contamination fixture does not actually contaminate — the RED half of this lock never fires');
    }
  }
  // measureP3Footprint is a MEASUREMENT, not an enforcer — there is no violation
  // to prove it catches (Spec 121 §12b.6 applies to checkers that gate something).
  // The smoke test instead proves it runs against a real artifact and reports a
  // well-formed number, never silently returning garbage.
  const p3Smoke = measureP3Footprint(
    { slug: '__p3_self_test_nonexistent_slug__', relFile: 'scripts/quality/assert-schema.js' },
    { descriptor: null },
  );
  if (typeof p3Smoke.descriptorBytes !== 'number' || p3Smoke.descriptorBytes <= 0 || !/^descriptor=\d+B/.test(p3Smoke.detail)) {
    throw new Error(`self-test FAILED: measureP3Footprint did not produce a well-formed measurement (${JSON.stringify(p3Smoke)})`);
  }
  const g2GoodReport = '## §2. PH-3\n| c | note |\n|---|---|\n| `abc1234` | preserved-in-compute, the rule is DECLARED in notes.json |\n';
  const g2BadReport = '## §2. PH-3\n| c | note |\n|---|---|\n| `abc1234` | preserved-in-compute, nothing more said |\n';
  const g2Good = checkPreservedInComputeHasWhy(g2GoodReport);
  const g2Bad = checkPreservedInComputeHasWhy(g2BadReport);
  if (!g2Good.pass || g2Bad.pass) {
    throw new Error(`self-test FAILED: checkPreservedInComputeHasWhy did not discriminate good/bad fixtures (good=${g2Good.pass}, bad=${g2Bad.pass})`);
  }
  const g4Descriptor = {
    config: { logic_variables: [{ name: 'x_warn_pct', on_invalid: 'default' }] },
    checks: [{ id: 'c1', limit_from_config: 'x_warn_pct' }],
    deviations: [],
  };
  const g4Bad = checkOnInvalidFail(g4Descriptor);
  const g4Covered = checkOnInvalidFail({ ...g4Descriptor, deviations: [{ from: 'on_invalid: "fail" for a declared logic variable', why: 'fixture' }] });
  const g4Good = checkOnInvalidFail({ ...g4Descriptor, config: { logic_variables: [{ name: 'x_warn_pct', on_invalid: 'fail' }] } });
  if (g4Bad.pass || !g4Covered.pass || !g4Good.pass) {
    throw new Error(`self-test FAILED: checkOnInvalidFail did not discriminate fixtures (bad=${g4Bad.pass}, covered=${g4Covered.pass}, good=${g4Good.pass})`);
  }
  // Rule 10 (Spec 124 §2 Rule 10, WF2 C1) — findVerdictDerivationSites, in-memory
  // (Spec 121 §12b.6: proven to fire before it is trusted as evidence).
  // RED: a hand-rolled duplicate cascade, regardless of what it is assigned to.
  {
    const badCascade = "function f(rows) {\n  const x = rows.some((r) => r.status === 'FAIL') ? 'FAIL'\n    : rows.some((r) => r.status === 'WARN') ? 'WARN' : 'PASS';\n  return x;\n}\n";
    const hits = findVerdictDerivationSites(badCascade);
    if (hits.length === 0) {
      throw new Error('self-test FAILED: findVerdictDerivationSites did not fire on a hand-rolled duplicate cascade');
    }
  }
  // RED: a direct, non-literal `verdict =`/`.verdict =` assignment not routed through deriveVerdict.
  {
    const badAssign = "function f(rows, at) {\n  const verdict = computeSomethingElse(rows);\n  at.verdict = verdict;\n  return at;\n}\n";
    const hits = findVerdictDerivationSites(badAssign);
    if (hits.length !== 2) {
      throw new Error(`self-test FAILED: findVerdictDerivationSites did not catch both the "verdict =" declaration and the ".verdict =" assignment (got ${hits.length})`);
    }
  }
  // GREEN: routed through deriveVerdict — never flagged, however it is named/assigned.
  {
    const routed = "function f(rows, at) {\n  const verdict = deriveVerdict(rows);\n  at.verdict = deriveVerdict(rows);\n  return verdict;\n}\n";
    const hits = findVerdictDerivationSites(routed);
    if (hits.length !== 0) {
      throw new Error(`self-test FAILED: findVerdictDerivationSites flagged code that routes through deriveVerdict (${JSON.stringify(hits)})`);
    }
  }
  // GREEN: a hardcoded sentinel literal (e.g. the "no audit_table given at all" default) is not a derivation.
  // GREEN: a plain `X.verdict` alias/read is not an assignment TO verdict.
  {
    const exempt = "function f(payload, built) {\n  const audit = { verdict: 'UNKNOWN', rows: [] };\n  const alias = built.audit_table.verdict;\n  return { audit, alias };\n}\n";
    const hits = findVerdictDerivationSites(exempt);
    if (hits.length !== 0) {
      throw new Error(`self-test FAILED: findVerdictDerivationSites flagged a literal sentinel or a plain property-read alias (${JSON.stringify(hits)})`);
    }
  }
  // checkSelfSkipNeverPass — proven to RED today (the KNOWN-DEFECT this WF pins,
  // never silently fixed by narrowing the check itself).
  {
    const skip = checkSelfSkipNeverPass();
    if (skip.pass !== false) {
      throw new Error(`self-test FAILED: checkSelfSkipNeverPass no longer reproduces the KNOWN-DEFECT (pass=${skip.pass}) — if this is a genuine fix, VRD-SKIP must move to BUILT and this self-test assertion must flip WITH it, in the same commit`);
    }
  }
  // Rule 11 (Spec 124 §2 Rule 11, WF2 C2) — checkOrderGuaranteesCited, in-memory
  // via the specTextByFile override (no disk I/O — Spec 121 §12b.6).
  {
    // GREEN: no pre_write checks at all — vacuously satisfied.
    const vacuous = checkOrderGuaranteesCited({ identity: { spec: '999' }, checks: [{ id: 'c1', when: 'post' }] });
    if (!vacuous.pass) throw new Error(`self-test FAILED: checkOrderGuaranteesCited did not vacuously pass a descriptor with no pre_write checks (${JSON.stringify(vacuous)})`);

    // RED: a pre_write check with NO order_guarantee at all.
    const noGuarantee = checkOrderGuaranteesCited({ identity: { spec: '999' }, checks: [{ id: 'c1', when: 'pre_write' }] });
    if (noGuarantee.pass) throw new Error('self-test FAILED: checkOrderGuaranteesCited did not RED on a pre_write check with no order_guarantee');

    const goodDescriptor = {
      identity: { spec: '999' },
      checks: [{ id: 'c1', when: 'pre_write', order_guarantee: { guarantee: 'abort before any write', spec_ref: 'docs/specs/fixture/999_fixture.md', anchor: 'THE ANCHOR TEXT' } }],
    };
    const fixtureText = { 'docs/specs/fixture/999_fixture.md': 'some prose ... THE ANCHOR TEXT ... more prose' };

    // GREEN: anchor present, spec_ref resolves (via the override map — spec_ref
    // agreement with identity.spec is skipped under the override, by design:
    // that half needs the real docs/specs/ tree, exercised at integration
    // altitude against the real descriptors instead, see step-conformance.infra.test.ts).
    const good = checkOrderGuaranteesCited(goodDescriptor, fixtureText);
    if (!good.pass) throw new Error(`self-test FAILED: checkOrderGuaranteesCited did not pass a well-formed order_guarantee (${JSON.stringify(good)})`);

    // RED: the anchor is NOT present in the cited spec text — a rotted citation.
    const rotted = checkOrderGuaranteesCited(goodDescriptor, { 'docs/specs/fixture/999_fixture.md': 'the anchor text moved or was reworded, and is no longer here verbatim' });
    if (rotted.pass) throw new Error('self-test FAILED: checkOrderGuaranteesCited did not RED on a rotted (no-longer-present) anchor');

    // RED: spec_ref does not resolve at all.
    const unresolved = checkOrderGuaranteesCited(goodDescriptor, { 'docs/specs/fixture/OTHER.md': 'irrelevant' });
    if (unresolved.pass) throw new Error('self-test FAILED: checkOrderGuaranteesCited did not RED on an unresolved spec_ref');

    // Ask 6 amendment (pilot 9 commit 1) — spec-qualified anchors, exercised
    // against the REAL docs/specs/ tree (specTextByFile = null / omitted):
    // rule (d)'s spec_ref-agreement half is a no-op under the fixture override
    // (see the comment on `good`, above), so these three cases need real files.
    const SPEC_78_REL_FIXTURE = 'docs/specs/01-pipeline/78_optimal_lot_configuration.md';
    const multiSpecDescriptor = (anchor) => ({
      identity: { spec: '65' }, // enrich_parcels's own identity.spec — NOT 78
      checks: [{ id: 'pass5_post_commit_read_order', when: 'pre_write', order_guarantee: {
        guarantee: 'a same-txn read would be invisible', spec_ref: SPEC_78_REL_FIXTURE, anchor,
      } }],
    });

    // RED (control, unchanged behavior): an UNQUALIFIED anchor whose spec_ref
    // points at Spec 78 while identity.spec is "65" still disagrees under rule
    // (d) — qualifying the anchor is what makes this legal, not merely citing 78.
    const unqualifiedMultiSpec = checkOrderGuaranteesCited(multiSpecDescriptor('read would be invisible'));
    if (unqualifiedMultiSpec.pass) throw new Error(`self-test FAILED: checkOrderGuaranteesCited did not RED on an unqualified anchor whose spec_ref disagrees with identity.spec (${JSON.stringify(unqualifiedMultiSpec)})`);

    // GREEN: the SAME anchor text, qualified "78:...", resolves against Spec 78
    // (its own literal text) and agrees with spec_ref via the qualifier, not
    // identity.spec — identity.spec "65" is never consulted for this check.
    const qualifiedMultiSpec = checkOrderGuaranteesCited(multiSpecDescriptor('78:read would be invisible'));
    if (!qualifiedMultiSpec.pass) throw new Error(`self-test FAILED: checkOrderGuaranteesCited did not GREEN a qualified anchor citing its own spec_ref's real spec (${JSON.stringify(qualifiedMultiSpec)})`);

    // RED: a qualifier naming a spec number that resolves to no file at all.
    const badQualifier = checkOrderGuaranteesCited(multiSpecDescriptor('999999:read would be invisible'));
    if (badQualifier.pass) throw new Error('self-test FAILED: checkOrderGuaranteesCited did not RED on an anchor qualifier naming a nonexistent spec number');
  }
  // Rule 12 (Spec 124 §2 Rule 12, WF2 C3) — checkInterruptedPostureTruthful +
  // runnerReachability, in-memory via a synthetic index.js source override.
  {
    // (a) DECLARATION half — a destructive retraction target with no truthful
    // recovery.interrupted is RED, independent of shape/reachability.
    const destructiveNoDecl = checkInterruptedPostureTruthful({
      outputs: { writes: [{ table: 't', retract: 'all' }] },
      recovery: { interrupted: 'none' },
      execution: { shape: 'cascade' },
    });
    if (destructiveNoDecl.pass) throw new Error('self-test FAILED: checkInterruptedPostureTruthful did not RED a destructive retraction target declaring recovery.interrupted "none"');

    // GREEN: no destructive retraction target at all, interrupted "none" — legal.
    const noTarget = checkInterruptedPostureTruthful({
      outputs: { writes: [{ table: 't', retract: 'departed' }] },
      recovery: { interrupted: 'none' },
      execution: { shape: 'ingest' },
    });
    if (!noTarget.pass) throw new Error(`self-test FAILED: checkInterruptedPostureTruthful RED with no destructive retraction target (${JSON.stringify(noTarget)})`);

    // (b) REACHABILITY half — the exact PRE-fix runMaterializePhase shape
    // (bypassed omits interruptedRetraction entirely): RED.
    const preFixMaterializeSource =
      'async function runMaterializePhase({ descriptor, pool, overrides, ownRunId, clockNow }) {\n' +
      '  const bypassed = overrides.force_full === true;\n' +
      '  const gatedSkip = await staleness.ledgerGatedSkip(pool, descriptor, { now: clockNow, bypassed });\n' +
      '  return gatedSkip;\n' +
      '}\n';
    const preFixRed = checkInterruptedPostureTruthful(
      { outputs: { writes: [{ table: 't', retract: 'all' }] }, recovery: { interrupted: 'force_full_on_next_run' }, execution: { shape: 'materialize' } },
      preFixMaterializeSource,
    );
    if (preFixRed.pass) throw new Error(`self-test FAILED: checkInterruptedPostureTruthful did not RED the pre-fix runMaterializePhase shape (bypassed omits interruptedRetraction) (${JSON.stringify(preFixRed)})`);

    // GREEN: the real, POST-fix shape (bypassed folds interruptedRetraction).
    const postFixMaterializeSource =
      'async function runMaterializePhase({ descriptor, pool, overrides, ownRunId, clockNow }) {\n' +
      '  const interruptedRetraction = await staleness.detectInterruptedRetraction(pool, descriptor, { ownRunId });\n' +
      '  const bypassed = overrides.force_full === true || interruptedRetraction.interrupted;\n' +
      '  const gatedSkip = await staleness.ledgerGatedSkip(pool, descriptor, { now: clockNow, bypassed });\n' +
      '  return gatedSkip;\n' +
      '}\n';
    const postFixGreen = checkInterruptedPostureTruthful(
      { outputs: { writes: [{ table: 't', retract: 'all' }] }, recovery: { interrupted: 'force_full_on_next_run' }, execution: { shape: 'materialize' } },
      postFixMaterializeSource,
    );
    if (!postFixGreen.pass) throw new Error(`self-test FAILED: checkInterruptedPostureTruthful did not pass the post-fix runMaterializePhase shape (${JSON.stringify(postFixGreen)})`);

    // GREEN: a LINK-shaped runner with no ledgerGatedSkip at all, calling
    // selectMode unconditionally — reachable via selectMode's own internal fold.
    const linkSource = 'async function runLinkPhase({ descriptor, pool, ownRunId }) {\n  const gate = await staleness.selectMode({ descriptor, pool, ownRunId });\n  return gate;\n}\n';
    const linkGreen = checkInterruptedPostureTruthful(
      { outputs: { writes: [{ table: 't', retract: 'all' }] }, recovery: { interrupted: 'force_full_on_next_run' }, execution: { shape: 'link' } },
      linkSource,
    );
    if (!linkGreen.pass) throw new Error(`self-test FAILED: checkInterruptedPostureTruthful did not pass a link-shaped runner reaching selectMode unconditionally (${JSON.stringify(linkGreen)})`);

    // RED: a shape whose runner reaches NEITHER ledgerGatedSkip nor selectMode.
    const deadSource = 'async function runRecorderPhase({ descriptor, pool }) {\n  return { ok: true };\n}\n';
    const deadRed = checkInterruptedPostureTruthful(
      { outputs: { writes: [{ table: 't', retract: 'all' }] }, recovery: { interrupted: 'force_full_on_next_run' }, execution: { shape: 'recorder' } },
      deadSource,
    );
    if (deadRed.pass) throw new Error(`self-test FAILED: checkInterruptedPostureTruthful did not RED a runner reaching neither ledgerGatedSkip nor selectMode (${JSON.stringify(deadRed)})`);
  }
  // Rule 13 hard-stop wiring (Spec 124 §2 Rule 13, WF3 "Rules 10-12 output
  // panel remediation" commit 4) — computeMatrixHardStop, pure, in-memory
  // (Spec 121 §12b.6). Three cases, all directions: an UNPINNED enforced-red
  // row hard-stops and names its rule number in the reason; a PINNED
  // enforced-red row (the same mechanism Rule 10's own KNOWN-DEFECT already
  // sets) does NOT hard-stop; an enforced-green row never hard-stops either.
  {
    const unpinnedRed = computeMatrixHardStop([{ rule: 4, status: 'enforced-red' }]);
    if (!unpinnedRed.hardStop) {
      throw new Error(`self-test FAILED: computeMatrixHardStop did not hard-stop on an unpinned enforced-red row (${JSON.stringify(unpinnedRed)})`);
    }
    if (!unpinnedRed.reasons.some((r) => r.includes('Rule 4'))) {
      throw new Error(`self-test FAILED: computeMatrixHardStop's reason did not name the rule number (${JSON.stringify(unpinnedRed)})`);
    }

    const pinnedRed = computeMatrixHardStop([{ rule: 10, status: 'enforced-red', pinned: true }]);
    if (pinnedRed.hardStop) {
      throw new Error(`self-test FAILED: computeMatrixHardStop hard-stopped on a PINNED enforced-red row (${JSON.stringify(pinnedRed)})`);
    }

    const green = computeMatrixHardStop([{ rule: 4, status: 'enforced-green' }]);
    if (green.hardStop) {
      throw new Error(`self-test FAILED: computeMatrixHardStop hard-stopped on an enforced-green row (${JSON.stringify(green)})`);
    }

    // Mixed matrix: one pinned red (Rule 10) + one unpinned red (Rule 4) —
    // the pin is per-row, never a blanket "any pin present neutralizes the
    // whole matrix" — the overall result still hard-stops, naming only the
    // unpinned rule.
    const mixed = computeMatrixHardStop([
      { rule: 10, status: 'enforced-red', pinned: true },
      { rule: 4, status: 'enforced-red' },
      { rule: 11, status: 'enforced-green' },
    ]);
    if (!mixed.hardStop || mixed.reasons.length !== 1 || !mixed.reasons[0].includes('Rule 4')) {
      throw new Error(`self-test FAILED: computeMatrixHardStop did not isolate the unpinned row in a mixed matrix (${JSON.stringify(mixed)})`);
    }
  }
  // R-K amendment (Spec 124) — stageExclusions / aggregateHardStop, both
  // directions, in-memory (Spec 121 §12b.6). A synthetic GREEN g/g9/matrix
  // fixture with G7/G8 forced RED (score 0) and matrix Rules 4/11/12 forced
  // enforced-red — the exact shape a descriptor-only commit produces before
  // compute/golden/reflection exist.
  {
    const redG7 = { score: 0, max: 3, detail: 'file=true fences=2 it-count=35 RED-evidence=false' };
    const redG8 = { score: 0, max: 3, detail: 'missing-invocations=2 stale-fingerprints=0 unexplained-diffs=0' };
    const greenG = {
      G0: { score: 1, max: 1, detail: '' }, G1: { score: 1, max: 1, detail: '' }, G2: { score: 1, max: 1, detail: '' },
      G3: { score: 1, max: 1, detail: '' }, G4: { score: 1, max: 1, detail: '' }, G5: { score: 1, max: 1, detail: '' },
      G6: { score: 3, max: 3, detail: '' }, G7: redG7, G8: redG8,
    };
    const redG9 = { pass: false, detail: 'heading=false low-confidence-table=false recurring-table=false' };
    const redMatrix = [
      { rule: 4, name: 'Compute rule declared', status: 'enforced-red', note: 'x', pinned: false },
      { rule: 11, name: 'Phase-order re-derive', status: 'enforced-red', note: 'y', pinned: false },
      { rule: 12, name: 'Truthful crash posture', status: 'enforced-red', note: 'z', pinned: false },
    ];

    // (a) stageExclusions itself — the three partial values, the two
    // no-op values, undefined, and an unrecognised value (RED-the-schema).
    const doExcl = stageExclusions('descriptor_only');
    if (doExcl.gates.size !== 3 || !['G7', 'G8', 'G9'].every((k) => doExcl.gates.has(k))) {
      throw new Error(`self-test FAILED: stageExclusions('descriptor_only') gates wrong (${JSON.stringify([...doExcl.gates])})`);
    }
    if (![4, 11, 12].every((r) => doExcl.rules.has(r))) {
      throw new Error(`self-test FAILED: stageExclusions('descriptor_only') rules wrong (${JSON.stringify([...doExcl.rules])})`);
    }
    const cpExcl = stageExclusions('compute_ported');
    if (!cpExcl.gates.has('G8') || !cpExcl.gates.has('G9') || cpExcl.gates.has('G7') || cpExcl.rules.size !== 0) {
      throw new Error(`self-test FAILED: stageExclusions('compute_ported') wrong (${JSON.stringify({ gates: [...cpExcl.gates], rules: [...cpExcl.rules] })})`);
    }
    const rwExcl = stageExclusions('runner_wired');
    if (!rwExcl.gates.has('G9') || rwExcl.gates.has('G7') || rwExcl.gates.has('G8') || rwExcl.rules.size !== 0) {
      throw new Error(`self-test FAILED: stageExclusions('runner_wired') wrong (${JSON.stringify({ gates: [...rwExcl.gates], rules: [...rwExcl.rules] })})`);
    }
    for (const noop of [undefined, 'red_suite', 'shape_clean']) {
      const e = stageExclusions(noop);
      if (e.gates.size !== 0 || e.rules.size !== 0) {
        throw new Error(`self-test FAILED: stageExclusions(${JSON.stringify(noop)}) must be a no-op (today's-behaviour direction) but excluded something (${JSON.stringify({ gates: [...e.gates], rules: [...e.rules] })})`);
      }
    }
    let threw = false;
    try { stageExclusions('bogus_stage'); } catch { threw = true; }
    if (!threw) throw new Error("self-test FAILED: stageExclusions('bogus_stage') did not throw — an unknown stage value must RED the schema, not silently pass through");

    // (b) aggregateHardStop, descriptor_only — G7/G8/Rules 4/11/12 excluded,
    // G9 excluded too; G6 green, invariants clean -> NOT a hard stop, and
    // every excluded row's own detail/note carries "stage-gated (...)".
    const excl1 = stageExclusions('descriptor_only');
    const mh1 = computeMatrixHardStop(redMatrix, excl1.rules);
    const agg1 = aggregateHardStop(greenG, redG9, false, mh1, excl1, 'descriptor_only');
    if (agg1.hardStop) throw new Error(`self-test FAILED: aggregateHardStop hard-stopped a descriptor_only fixture whose only reds are ALL stage-gated (${JSON.stringify(agg1)})`);
    if (agg1.hardStopReasons.length !== 0) throw new Error(`self-test FAILED: aggregateHardStop reported hardStopReasons on a fully stage-gated descriptor_only fixture (${JSON.stringify(agg1.hardStopReasons)})`);
    if (!agg1.g.G7.detail.includes('stage-gated (descriptor_only)') || !agg1.g.G8.detail.includes('stage-gated (descriptor_only)') || !agg1.g9.detail.includes('stage-gated (descriptor_only)')) {
      throw new Error(`self-test FAILED: aggregateHardStop did not annotate every excluded row's detail with "stage-gated (descriptor_only)" (${JSON.stringify(agg1)})`);
    }
    const annotated1 = annotateStageGatedMatrix(redMatrix, excl1.rules, 'descriptor_only');
    if (!annotated1.every((r) => r.note.includes('stage-gated (descriptor_only)'))) {
      throw new Error(`self-test FAILED: annotateStageGatedMatrix did not annotate every excluded-rule row (${JSON.stringify(annotated1)})`);
    }

    // (c) SAME reds, NO stage (the "step absent from pending" / red_suite /
    // shape_clean direction) -> DOES hard-stop, naming every red gate/rule.
    const excl0 = stageExclusions(undefined);
    const mh0 = computeMatrixHardStop(redMatrix, excl0.rules);
    const agg0 = aggregateHardStop(greenG, redG9, false, mh0, excl0, undefined);
    if (!agg0.hardStop) throw new Error(`self-test FAILED: aggregateHardStop did NOT hard-stop the SAME reds with no declared stage — a step absent from pending must get today's behaviour byte-for-byte (${JSON.stringify(agg0)})`);
    if (!['G7', 'G8', 'G9'].every((k) => agg0.hardStopReasons.includes(k))) {
      throw new Error(`self-test FAILED: unstaged fixture's hardStopReasons missing an expected gate (${JSON.stringify(agg0.hardStopReasons)})`);
    }
    if (!agg0.hardStopReasons.some((r) => r.includes('Rule 4')) || !agg0.hardStopReasons.some((r) => r.includes('Rule 11')) || !agg0.hardStopReasons.some((r) => r.includes('Rule 12'))) {
      throw new Error(`self-test FAILED: unstaged fixture's hardStopReasons missing an expected Rule (${JSON.stringify(agg0.hardStopReasons)})`);
    }

    // (d) compute_ported — only G8/G9 excluded; G7 (still red in this
    // fixture) now DOES hard-stop, proving the exclusion set narrows as the
    // stage advances rather than being all-or-nothing.
    const excl2 = stageExclusions('compute_ported');
    const mh2 = computeMatrixHardStop(redMatrix, excl2.rules);
    const agg2 = aggregateHardStop(greenG, redG9, false, mh2, excl2, 'compute_ported');
    if (!agg2.hardStop || !agg2.hardStopReasons.includes('G7')) {
      throw new Error(`self-test FAILED: compute_ported must still hard-stop on G7 (not yet excludable at this stage) (${JSON.stringify(agg2)})`);
    }
    if (agg2.hardStopReasons.includes('G8') || agg2.hardStopReasons.includes('G9')) {
      throw new Error(`self-test FAILED: compute_ported must exclude G8/G9 from hardStopReasons (${JSON.stringify(agg2.hardStopReasons)})`);
    }

    // (e) R-K.2 — shape_clean_pending_recapture: G8 ONLY excluded. A fixture with
    // EVERYTHING green except G8 (the genuinely-decidable, deliberately-deferred gate)
    // must NOT hard-stop; the SAME fixture with G7 ALSO red (an artifact gap this
    // stage does NOT excuse, unlike descriptor_only/compute_ported) MUST still
    // hard-stop, proving the exclusion is scoped to G8 alone, not "everything late-stage".
    const excl3 = stageExclusions('shape_clean_pending_recapture');
    if (!excl3.gates.has('G8') || excl3.gates.has('G7') || excl3.gates.has('G9') || excl3.rules.size !== 0) {
      throw new Error(`self-test FAILED: stageExclusions('shape_clean_pending_recapture') wrong (${JSON.stringify({ gates: [...excl3.gates], rules: [...excl3.rules] })})`);
    }
    const greenGWithRedG8Only = { ...greenG, G7: { score: 3, max: 3, detail: '' }, G8: redG8 };
    const cleanMatrix = redMatrix.map((r) => ({ ...r, status: 'enforced-green' }));
    const cleanG9 = { pass: true, detail: '' };
    const mh3 = computeMatrixHardStop(cleanMatrix, excl3.rules);
    const agg3 = aggregateHardStop(greenGWithRedG8Only, cleanG9, false, mh3, excl3, 'shape_clean_pending_recapture');
    if (agg3.hardStop) throw new Error(`self-test FAILED: shape_clean_pending_recapture hard-stopped on G8 alone, which this stage exists to declare-and-defer (${JSON.stringify(agg3)})`);
    if (!agg3.g.G8.detail.includes('stage-gated (shape_clean_pending_recapture)')) {
      throw new Error(`self-test FAILED: shape_clean_pending_recapture did not annotate the excluded G8 row's detail (${JSON.stringify(agg3.g.G8)})`);
    }
    const greenGWithRedG7AndG8 = { ...greenG, G7: redG7, G8: redG8 };
    const agg4 = aggregateHardStop(greenGWithRedG7AndG8, cleanG9, false, mh3, excl3, 'shape_clean_pending_recapture');
    if (!agg4.hardStop || !agg4.hardStopReasons.includes('G7')) {
      throw new Error(`self-test FAILED: shape_clean_pending_recapture must still hard-stop on a red G7 — the exclusion is G8-ONLY, not "everything late-stage" (${JSON.stringify(agg4)})`);
    }
    if (agg4.hardStopReasons.includes('G8')) {
      throw new Error(`self-test FAILED: shape_clean_pending_recapture must exclude G8 from hardStopReasons even when G7 is ALSO red (${JSON.stringify(agg4.hardStopReasons)})`);
    }
  }
  // C4 (Fold A item 3) — matchTests's scopeToken must match regardless of
  // whether the caller passes the underscored slug (row.slug, e.g.
  // "link_massing") or the hyphenated relFile a real it(`${relFile} — …`)
  // title embeds (e.g. "scripts/link-massing.js"). Both directions proven:
  // a slug-scoped match actually matches (the bug this fixes: it used to
  // match ZERO tests, always), and an unrelated slug still does not.
  {
    const fixtureTests = [
      { fullName: 'some describe > scripts/link-massing.js — declared ⊆ registry, declared ⊆ GROUPS, consumed ≡ declared', ancestorTitles: ['some describe'], status: 'passed' },
      { fullName: 'some describe > scripts/link-wsib.js — declared ⊆ registry, declared ⊆ GROUPS, consumed ≡ declared', ancestorTitles: ['some describe'], status: 'passed' },
    ];
    const describeRe = /declared ⊆ registry/i;
    const matchedByUnderscoredSlug = matchTests(fixtureTests, describeRe, 'link_massing');
    if (matchedByUnderscoredSlug.length !== 1 || !matchedByUnderscoredSlug[0].fullName.includes('link-massing')) {
      throw new Error(`self-test FAILED: matchTests did not match a hyphenated test title when scoped by the underscored slug "link_massing" (matched ${matchedByUnderscoredSlug.length})`);
    }
    const matchedByHyphenatedRelFile = matchTests(fixtureTests, describeRe, 'scripts/link-wsib.js');
    if (matchedByHyphenatedRelFile.length !== 1 || !matchedByHyphenatedRelFile[0].fullName.includes('link-wsib')) {
      throw new Error(`self-test FAILED: matchTests did not match when scoped by a hyphenated relFile "scripts/link-wsib.js" (matched ${matchedByHyphenatedRelFile.length})`);
    }
    const matchedByUnrelatedSlug = matchTests(fixtureTests, describeRe, 'compute_centroids');
    if (matchedByUnrelatedSlug.length !== 0) {
      throw new Error(`self-test FAILED: matchTests matched an unrelated slug "compute_centroids" against link-massing/link-wsib titles (matched ${matchedByUnrelatedSlug.length})`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
// R-T addendum (commit 3) — lazy shared pool, opened on first use, closed once at the end
// of main(). Lazy so a plain `--write` run over descriptors with no declared invariants/
// plausibility (every step except link_massing, as of this commit) never touches pg/DB at
// all — unchanged cost for the common case.
let dataValidatorPool = null;
function getDataValidatorPool() {
  if (!dataValidatorPool) {
    const { createResolvedPool } = require(path.join(REPO_ROOT, 'scripts/lib/resolve-db.js'));
    dataValidatorPool = createResolvedPool({ label: 'step-validate --write' });
  }
  return dataValidatorPool;
}

/**
 * R-T addendum (Spec 124 §2 Rule 13, commit 3) — `--write`'s cutover/backfill context runs
 * the SAME executor (scripts/lib/step/plausibility.js) `--full` invariants[]/plausibility[]
 * for BOTH frequencies (unlike the run-end hook, which only fires `every_run`). No-op when
 * the descriptor declares neither category (or declares them "none") — the common case
 * today. Reports PASS/WARN/FAIL per entry; does not write last_measured back to the
 * descriptor (a separate, not-yet-built backfill concern — flagged, not silently done here).
 */
async function runDataValidatorsForWrite(row, descriptorInfo) {
  const d = descriptorInfo.descriptor;
  const hasInvariants = d && Array.isArray(d.invariants) && d.invariants.length > 0;
  const hasPlausibility = d && Array.isArray(d.plausibility) && d.plausibility.length > 0;
  if (!hasInvariants && !hasPlausibility) return null;
  const { runInvariants, runPlausibility } = require(path.join(REPO_ROOT, 'scripts/lib/step/plausibility.js'));
  const pool = getDataValidatorPool();
  const results = [];
  for (const frequency of ['every_run', 'validate_only']) {
    const invRun = hasInvariants ? await runInvariants(pool, d, { frequency, when: null }) : { checks: [], observations: {} };
    const plRun = hasPlausibility ? await runPlausibility(pool, d, { frequency, when: null }) : { checks: [], observations: {} };
    for (const check of [...invRun.checks, ...plRun.checks]) {
      const obs = invRun.observations[check.id] ?? plRun.observations[check.id];
      const verdict = obs && obs.error
        ? { status: 'ERROR', detail: String(obs.error && obs.error.message || obs.error) }
        : { status: 'ok', value: obs ? obs.value : undefined };
      results.push({ id: check.id, source: check.source, frequency, ...verdict });
    }
  }
  console.log(`[step-validate] ${row.slug}: data validator (--write, both frequencies) — ${results.length} entries executed:`);
  for (const r of results) {
    console.log(`  ${r.id} (${r.source}, ${r.frequency}): ${r.status === 'ERROR' ? `ERROR — ${r.detail}` : `value=${JSON.stringify(r.value)}`}`);
  }
  return results;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  selfTest();
  if (opts.selfTestOnly) {
    console.log('[step-validate] self-test PASSED');
    return;
  }

  // Programme backlog (R-T) — printed unconditionally, before any --staged
  // early-return, so the hook fast path always surfaces it (a doc-only or
  // non-pipeline commit still sees the freeze-readiness count).
  const programmeItemsAll = loadProgrammeItems();
  console.log(`[step-validate] programme: blocks batching: ${blocksBatchingCount(programmeItemsAll)} (scripts/steps/_schema/programme-items.json; npm run programme-backlog for the full table)`);

  const registry = buildRegistry();
  let targets;
  if (opts.staged) {
    targets = filterToStaged(registry);
    if (targets.length === 0) {
      console.log('[step-validate] --staged: no converted/pending step touched by this commit — nothing to validate, exiting clean.');
      return;
    }
  } else {
    targets = opts.all ? registry : registry.filter((r) => r.slug === opts.step);
    if (targets.length === 0) {
      throw new Error(`no step found for ${opts.all ? '--all' : `--step=${opts.step}`} (registry has: ${registry.map((r) => r.slug).join(', ')})`);
    }
  }

  const { converted, pending } = loadConverted();
  const invariantResults = fastInvariants(targets, converted, pending);
  const shapeBatch = checkShapeBatch(targets);
  const vitestResult = opts.fast ? { ranOk: false, error: '--fast: vitest spawn skipped' } : runVitest();
  // G2 (FOLD 1) — the generated churn×complexity table is parsed ONCE here,
  // never per-row and never inside scoreG2 itself.
  const churnFindings = loadChurnFindings();

  let anyHardStop = false;
  const summaries = [];

  for (const row of targets) {
    const descriptorInfo = checkDescriptor(row);
    const computePath = harness.computePathFor(row.relFile);
    const shape = shapeBatch.get(row.slug);
    const report = row.report ? stripScorecard(readFileSync(row.report, 'utf8')) : '';
    if (!row.report) {
      console.error(`[step-validate] WARNING: no assessment report found for ${row.slug} — scorecard gates that read the report will read as empty/0`);
    }
    const captureFindings = checkCaptures(row, descriptorInfo, computePath, report);
    const p3 = measureP3Footprint(row, descriptorInfo);
    // matrix computed BEFORE the scorecard (Rule 13 hard-stop wiring, WF3
    // commit 4) — computeScorecard now folds an unpinned enforced-red matrix
    // row into hardStop, so it needs the matrix as an input, not a sibling.
    const matrix = computePolicyMatrix(row, descriptorInfo, shape, vitestResult, p3, report);
    const sc = computeScorecard(row, report, descriptorInfo, shape, captureFindings, invariantResults, churnFindings, matrix);
    // sc.matrix carries the same rows with a " — stage-gated (<stage>)" note
    // appended on any row a declared pending[].stage excluded from hardStop
    // (R-K amendment) — rendering it, not the raw `matrix`, is what keeps the
    // printed table from reading as a silent pass.
    const block = renderScorecard(row, sc, sc.matrix, captureFindings, vitestResult, invariantResults);

    console.log(`\n\`\`\`\n[step-validate] ${row.slug} (${row.stage}) — ${sc.total}/${sc.maxTotal}, hard-stop=${sc.hardStop}${sc.hardStop ? ` (${sc.hardStopReasons.join(', ')})` : ''}\n\`\`\`\n`);
    console.log(block);

    const blockingForRow = blockingItemsFor(row.slug, programmeItemsAll);
    if (blockingForRow.length) {
      console.log(`[step-validate] programme: ${row.slug} is named by ${blockingForRow.length} blocking item(s):`);
      for (const b of blockingForRow) console.log(`  ${b.id} (${b.gate.kind}, ${b.status}): ${b.title}`);
    }

    if (opts.write) {
      if (!row.report) {
        console.error(`[step-validate] --write requested but no report found for ${row.slug}; skipping write`);
      } else {
        writeScorecard(row.report, block);
        console.log(`[step-validate] wrote scorecard into ${path.relative(REPO_ROOT, row.report)}`);
      }
      // R-T addendum (commit 3) — the cutover/backfill data-validator pass, both
      // frequencies. No-op (returns null, logs nothing) for a descriptor with no
      // declared invariants[]/plausibility[].
      await runDataValidatorsForWrite(row, descriptorInfo);
    }

    if (!descriptorInfo.ok) console.error(`[step-validate] ${row.slug}: descriptor validation FAILED — ${descriptorInfo.error}`);
    // row.blocking is only set by --staged (filterToStaged); --all/--step have no
    // doc-only distinction to make and always block on their own hard stops.
    const isBlocking = row.blocking === undefined ? true : row.blocking;
    if (sc.hardStop && !isBlocking) {
      console.log(`[step-validate] ${row.slug}: hard-stop scored but NOT gating — only its report/tests are staged, not its code (--staged doc-only rule)`);
    }
    if (sc.hardStop && isBlocking) anyHardStop = true;
    summaries.push({ slug: row.slug, total: sc.total, maxTotal: sc.maxTotal, hardStop: sc.hardStop, blocking: isBlocking });
  }

  const registryFails = invariantResults.filter((r) => r.slug === '(registry)' && !r.pass);
  // EP-D13-adjacent fix (pilot 9 commit 8 P9, 2026-09-08) — id:9 (checkCutoverPrereqs)
  // is scoped to `blockedSlugs`: it only forces this INVOCATION's overall exit code
  // non-zero when a step actually being validated THIS run is one of the named,
  // literally-blocked slugs (e.g. `enrich_parcels` under CLOUDPARITY) — a completely
  // unrelated `--step=X` run (or `--all`/`--staged` run that never touches the blocked
  // slug) must not fail on another step's own unmet cutover_prereq. Every OTHER
  // registry invariant (4, 5 — genuine fleet-wide integrity, no single implicated
  // slug) keeps its existing unconditional hard-stop.
  const validatedSlugs = new Set(summaries.map((s) => s.slug));
  const registryHardStopFails = registryFails.filter((r) => {
    if (r.id !== 9) return true;
    return Array.isArray(r.blockedSlugs) && r.blockedSlugs.some((slug) => validatedSlugs.has(slug));
  });
  if (registryHardStopFails.length) anyHardStop = true;

  console.log('\n[step-validate] summary:');
  for (const s of summaries) console.log(`  ${s.slug}: ${s.total}/${s.maxTotal} hard-stop=${s.hardStop}${s.blocking ? '' : ' (non-blocking: doc-only touch)'}`);
  if (registryFails.length) {
    console.log('[step-validate] registry-level fast invariant failures:');
    for (const r of registryFails) {
      const gates = r.id === 9 && !registryHardStopFails.includes(r) ? ' (informational — does not name a slug in this run)' : '';
      console.log(`  #${r.id}: ${r.detail}${gates}`);
    }
  }

  if (dataValidatorPool) await dataValidatorPool.end();

  if (anyHardStop) {
    console.error('\n[step-validate] HARD STOP on at least one step (G6/G7/G8 == 0, G9 FAIL, a fast invariant FAIL, or an unpinned enforced-red policy-matrix row). Exiting non-zero.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[step-validate] ${err.stack || err.message}`);
  process.exit(2);
});
