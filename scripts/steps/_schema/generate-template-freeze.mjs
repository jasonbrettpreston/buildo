#!/usr/bin/env node
/**
 * template-freeze.json generator — Spec 122 §8.2 ("freeze the template after
 * the eighth, never the first").
 *
 * WHY THIS EXISTS. §8.2 was prose ("STD-8", `scripts/steps/_schema/
 * programme-items.json`) with no artifact and no gate — a schema field could
 * be widened, a runner's phase order reshuffled, or a new archetype dispatch
 * path added with zero red anywhere (G1/G2/G9, WF2 "template freeze" plan
 * grounding). This generator produces the declared freeze artifact
 * (`template-freeze.json`) that `src/tests/template-freeze.infra.test.ts`'s
 * R-E lock checks both directions against, mirroring the generated+drift-
 * guarded pattern `generate-schema-baseline.mjs`/`generate-programme-
 * backlog.mjs` already use in this same directory.
 *
 * DERIVED vs DECLARED. Most fields are mechanically derived from the live
 * tree every run (schema_sha256, categories, archetype_profiles,
 * phase_runners, batching_prereq_snapshot) — never hand-transcribed. Three
 * fields are DECLARED constants below (frozen_after_pilot, lg21_decision,
 * does_not_freeze) because they ARE the human ruling this artifact exists to
 * record, not something a query can produce — the same posture `schema-
 * baseline.json`'s x-ruling ratchet takes for "which cheaper rung was tried".
 *
 * DETERMINISM (mirrors step-churn-complexity.mjs's window_end protocol).
 * `frozen_at` is NOT recomputed on every run — a plain regenerate (no flag)
 * PRESERVES the committed file's `frozen_at`, so `--check`'s byte-identical
 * comparison is stable across an unrelated commit. `--refresh` advances
 * `frozen_at` to the CURRENT HEAD and rewrites the whole file — run this only
 * when deliberately re-freezing (a real re-derivation, per the R-E lock).
 *
 * Usage:
 *   node scripts/steps/_schema/generate-template-freeze.mjs           (write, frozen_at preserved)
 *   node scripts/steps/_schema/generate-template-freeze.mjs --check   (exit 1 on drift, writes nothing)
 *   node scripts/steps/_schema/generate-template-freeze.mjs --refresh (write, frozen_at := HEAD)
 *
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §8.2, §10.3
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §9 (Rule 11, GAP G-3)
 */
'use strict';

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isOpenBatchingItem, DELIVERED_ITEM_STATUSES } from '../../violations/generate-programme-backlog.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');

const SCHEMA_PATH = path.join(HERE, 'step.schema.json');
const OUT_PATH = path.join(HERE, 'template-freeze.json');
const INDEX_JS_PATH = path.join(ROOT, 'scripts/lib/step/index.js');
const PROGRAMME_ITEMS_PATH = path.join(HERE, 'programme-items.json');
const CONVERTED_PATH = path.join(HERE, 'converted.json');
const MANIFEST_PATH = path.join(ROOT, 'scripts/manifest.json');
const SPEC_122_PATH = path.join(ROOT, 'docs/specs/01-pipeline/122_pipeline_step_optimization.md');

function runGit(args) {
  const res = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`);
  return res.stdout.trim();
}

function currentHeadSha() {
  return runGit(['rev-parse', 'HEAD']);
}

// ---------------------------------------------------------------------------
// R-E LOCK (C4) — is the schema still what template-freeze.json says it froze?
//
// "The commit" mirrors step-validate.mjs's own gitStagedFiles(): at pre-commit
// time the index (`git diff --cached`) IS the commit-in-progress; at pre-push
// time the index is normally clean (the commit already landed), so fall back
// to the last real commit's own diff (`git diff HEAD~1 HEAD`) — "what did the
// thing about to be pushed change."
// ---------------------------------------------------------------------------

function gitDiffNameOnly(args) {
  const res = spawnSync('git', ['diff', '--name-only', ...args], { cwd: ROOT, encoding: 'utf8' });
  if (res.status !== 0) return [];
  return (res.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.replace(/\\/g, '/'));
}

/** `git show <ref>:<path>` — the file's content at ref, or null if it does not exist there. */
export function gitShowFile(ref, relPath) {
  const res = spawnSync('git', ['show', `${ref}:${relPath}`], { cwd: ROOT, encoding: 'utf8' });
  if (res.status !== 0) return null;
  return res.stdout;
}

/**
 * Text of one `## N. Heading` markdown section (this heading up to, but not
 * including, the next `## ` heading, or EOF). Returns '' if the heading is
 * not found — a caller comparing two such extractions across a diff treats a
 * heading that DISAPPEARED as a real, non-empty change (old !== '').
 *
 * CRLF-tolerant (mirrors the `heritage-418`/`cost-ledger-gate` precedent,
 * `docs/reports/review_followups.md` "CRLF-tolerant" — `quality-ledger-
 * window.logic.test.ts:206-211`'s own note on why this is load-bearing on a
 * Windows checkout, `core.autocrlf=true`, no `.gitattributes`). `gitShowFile`
 * returns the committed blob (LF); a disk `readFileSync` of the SAME spec on
 * Windows returns CRLF. Comparing the two RAW would make `section8Changed`
 * always true, permanently disarming the R-E "re-freeze without a Spec 122
 * §8 diff" hard stop. Normalise line endings AND trailing whitespace before
 * splitting, so a checkout-line-ending difference — never a real edit — can
 * not move the comparison.
 */
export function extractSection(markdown, headingPattern) {
  const normalised = markdown.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '');
  const lines = normalised.split('\n');
  const startIdx = lines.findIndex((l) => headingPattern.test(l));
  if (startIdx === -1) return '';
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx, endIdx).join('\n');
}

const SECTION_8_HEADING = /^## 8\. /;

/**
 * Pure R-E predicate — every input is a plain value so this is fixture-
 * testable both directions with no git process involved (Spec 121 §12b.6).
 *
 * `oldFrozenSchemaSha256` — what scripts/steps/_schema/template-freeze.json's
 * `schema_sha256` was BEFORE this commit's changes (the commit baseline: the
 * index's HEAD, or HEAD~1 once the commit has landed).
 * `newFrozenSchemaSha256` — what it is in the commit-in-progress's working
 * copy (identical to `oldFrozenSchemaSha256` unless this commit ran --refresh).
 * `liveSchemaSha256` — a fresh hash of the CURRENT step.schema.json.
 *
 * `ok:false` is the HARD STOP case: the live schema no longer matches the
 * LAST freeze, and this commit does not carry BOTH a deliberate re-freeze
 * (schema_sha256 bumped to match the live schema) AND a real Spec 122 §8
 * text change — the `f5446fa3` "same-commit spec amendment missed 4x" lesson,
 * Spec 124 §R-8.
 */
export function checkFrozenSchemaConsistency({ oldFrozenSchemaSha256, newFrozenSchemaSha256, liveSchemaSha256, section8Changed }) {
  if (oldFrozenSchemaSha256 === null) {
    // GENESIS — template-freeze.json did not exist before this commit (this
    // IS the first freeze, C3). Nothing to re-freeze yet, so the "same-commit
    // spec amendment" rule (which governs a RE-freeze) does not apply here;
    // the freeze artifact must simply match the live schema, which C3's own
    // "regeneration reproduces byte-identical" gate already enforces.
    return newFrozenSchemaSha256 === liveSchemaSha256
      ? { ok: true, reason: 'first freeze (genesis) — schema_sha256 matches the live schema' }
      : { ok: false, reason: 'first freeze (genesis) but schema_sha256 does not match the live schema — regenerate with --refresh' };
  }
  if (liveSchemaSha256 === oldFrozenSchemaSha256) return { ok: true, reason: 'schema unchanged since the last freeze' };
  if (newFrozenSchemaSha256 !== liveSchemaSha256) {
    return { ok: false, reason: 'step.schema.json changed but scripts/steps/_schema/template-freeze.json was not re-frozen to match in this commit (run --refresh and amend Spec 122 §8 in the SAME commit)' };
  }
  if (!section8Changed) {
    return { ok: false, reason: 'template-freeze.json was re-frozen (schema_sha256 bumped to match the live schema) but Spec 122 §8 ("The conversion process") carries no text change in this commit — a re-freeze must be accompanied by a spec amendment, not a silent hash bump' };
  }
  return { ok: true, reason: 're-freeze: schema_sha256 bumped to match the live schema, Spec 122 §8 amended, both in the same commit' };
}

// ---------------------------------------------------------------------------
// FREEZE-1 LOCK (WF2 "FREEZE-1, the freeze precondition", commit 1, 2026-09-09)
// — is the FREEZE-1 declaration itself honest, given the programme-items.json
// ledger it is derived from and the archetype_profiles this same artifact
// records?
//
// Spec 122 §8.2's PRECONDITION ("the template may honestly freeze after the
// eighth pilot only when the batching_prereq set is empty") had, until this
// commit, only a console line (`blocks batching: N`) as its guard — the exact
// defect class this programme refuses everywhere else (a claim with no lock).
// This predicate is that lock, pure and fixture-testable both directions
// (Spec 121 §12b.6), mirroring `checkFrozenSchemaConsistency` above.
//
// Arms (operator Ask A1, ruled NO, 2026-09-09 — STD-7 may not read BUILT
// while any `archetype_profiles[]` row is not `proven === true`; arm E is
// armed):
//   A — FREEZE-1 declared BUILT/SUPERSEDED but another batching_prereq item
//       is still open, per a FRESH scan of programme-items.json (excluding
//       FREEZE-1's own row): the LEDGER disagrees with the declaration.
//   B — FREEZE-1 declared BUILT/SUPERSEDED but the COMMITTED, on-disk
//       template-freeze.json's own batching_prereq_snapshot still lists an
//       open item: the ARTIFACT disagrees — distinct from A, and read from a
//       genuinely different source (the on-disk file, not the freshly
//       re-derived live tier main() is about to write), so a hand-edited or
//       stale-regenerated artifact is caught even when a fresh ledger scan
//       (arm A) is honest.
//   C — FREEZE-1 not yet declared (NOT_STARTED/PARTIAL): vacuous ok:true —
//       this is today's state, and the honest interim state through phase 1.
//   E — FREEZE-1 declared BUILT/SUPERSEDED, every other gate clear, but an
//       archetype_profiles[] row is not proven === true (a missing/
//       non-boolean value fails closed, same as an explicit false): "8
//       archetypes dispatched" (STD-7's own promise) is false while the
//       frozen artifact records one unproven — a freeze declared over that
//       is counted, not honest.
//   D — FREEZE-1 declared BUILT/SUPERSEDED, no other open item, snapshot
//       empty, every archetype proven: ok:true — the target state.
// ---------------------------------------------------------------------------

// Same closed pair `isOpenBatchingItem` uses to decide "delivered" — imported,
// never re-copied (LOW followup, WF2 "FREEZE-1, the freeze precondition"
// output review: a second hand-written `!== 'BUILT' && !== 'SUPERSEDED'`
// literal is exactly the "second, independently-drifting reimplementation"
// `isOpenBatchingItem`'s own docblock refuses).
const DECLARED_FREEZE_STATUSES = new Set(DELIVERED_ITEM_STATUSES);

export function checkFreezeDeclarationHonesty({ freezeItemStatus, otherOpenBatchingIds, snapshotIds, archetypeProfiles }) {
  if (!DECLARED_FREEZE_STATUSES.has(freezeItemStatus)) {
    return { ok: true, reason: `FREEZE-1 is not yet declared (status: ${freezeItemStatus}) — the lock is vacuous until the declaration is made (arm C)` };
  }
  if (otherOpenBatchingIds.length > 0) {
    return {
      ok: false,
      reason: `FREEZE-1 is declared ${freezeItemStatus} but ${otherOpenBatchingIds.length} other batching_prereq item(s) are still open (${otherOpenBatchingIds.join(', ')}) — the declaration claims a precondition that is measurably unmet (arm A)`,
    };
  }
  if (snapshotIds.length > 0) {
    return {
      ok: false,
      reason: `FREEZE-1 is declared ${freezeItemStatus} but batching_prereq_snapshot still lists ${snapshotIds.length} open item(s) (${snapshotIds.join(', ')}) — the artifact and the ledger disagree (arm B)`,
    };
  }
  // `!== true`, not `=== false` — a missing/undefined/non-boolean `proven`
  // must fail closed the same as an explicit `false` (fail-open on absence
  // is exactly the "green because it never looked" defect class this
  // programme refuses elsewhere).
  const unproven = archetypeProfiles.filter((p) => p.proven !== true).map((p) => p.archetype);
  if (unproven.length > 0) {
    return {
      ok: false,
      reason: `FREEZE-1 is declared ${freezeItemStatus} but archetype_profiles still records ${unproven.join(', ')} as not proven:true — "8 archetypes dispatched" is false while an unproven archetype stands in the frozen artifact (arm E, Ask A1 ruled NO)`,
    };
  }
  return { ok: true, reason: `FREEZE-1 is declared ${freezeItemStatus}, the batching_prereq set is genuinely empty, and every archetype_profiles[] row is proven — the declaration is honest (arm D)` };
}

// ---------------------------------------------------------------------------
// DECLARED constants (the ruling itself — see file header).
// ---------------------------------------------------------------------------

const FROZEN_AFTER_PILOT = 9;

const LG21_DECISION = {
  ruling: 'fork-over-share RATIFIED',
  reasons: [
    "pilot 4 forked runCascadePhase because a tiers[] branch inside runLinkPhase would split its keyset loop",
    "pilot 5 forked runMaterializePhase because runLinkPhase's SELECT-then-batch write would split a single server-side statement and break G2's verbatim-SQL guarantee",
    'pilot 6 deferred a shared runPhaseScaffold a 3rd time (Fold D)',
    'pilot 7 forked runLinkKeyedPhase leaving runLinkPhase byte-for-byte untouched (245 lines) — Spec 124 §9 :306-310',
    'consolidating the 7 runners AT the freeze commit would rewrite all of them in the one commit that promises they stop changing — the exact inversion of "enforcement must be harder to change than the enforced" (§10b.1)',
  ],
  superseded_items: ['LG-21'],
};

const DOES_NOT_FREEZE = [
  'Library internals — runner bodies, helper extraction, perf work inside scripts/lib/step/** — only the phase ORDER per shape and the shape enum are frozen.',
  'Compute — scripts/lib/compute/<slug>.js is per-step logic, never template surface.',
  'Descriptor VALUES — every converted step keeps editing its own checks[]/invariants[]/plausibility[]/thresholds/config.logic_variables[] freely (Spec 123 §5\'s 55 PER_STEP claims; the freeze governs the 235 UNIVERSAL ones).',
  'converted.json / programme-items.json / grandfathered.json / schema-baseline.json — enforcement-scope registries that must keep growing as steps convert.',
  'Additive fields carrying x-ruling — the G-1 ratchet stays the path for a genuinely new field; the freeze adds the requirement that such a commit ALSO bumps template-freeze.json and amends Spec 122 §8.',
  'Notes/fences, spec prose, review followups.',
];

// ---------------------------------------------------------------------------
// DERIVED: schema categories + hash.
// ---------------------------------------------------------------------------

function deriveSchema() {
  const raw = readFileSync(SCHEMA_PATH);
  const schema = JSON.parse(raw.toString('utf8'));
  const schema_sha256 = createHash('sha256').update(raw).digest('hex');
  const categories = [...schema.required];
  return { schema_sha256, categories };
}

// ---------------------------------------------------------------------------
// DERIVED: phase_runners — mechanical, ordered, deduplicated (first
// occurrence) sequence of staleness.*/write.*/acquire.*/pipeline.*/
// preWriteGate library calls each runner's source makes. Comment-text is
// NEVER used (this codebase's phase-divider comments are inconsistently
// formatted — measured while building this generator — so a comment-based
// extraction both misses real phases and invents phantom ones off unrelated
// prose; the library CALL SEQUENCE is what actually encodes execution order
// and is immune to a comment rewording).
// ---------------------------------------------------------------------------

const RUNNER_NAMES = ['runIngestPhase', 'runLinkPhase', 'runLinkKeyedPhase', 'runCascadePhase', 'runMaterializePhase', 'runBackfillPhase', 'runRecorderPhase', 'runEnrichPhase'];
const RUNNER_TO_SHAPE = {
  runIngestPhase: 'ingest',
  runLinkPhase: 'link',
  runLinkKeyedPhase: 'link_keyed',
  runCascadePhase: 'cascade',
  runMaterializePhase: 'materialize',
  runBackfillPhase: 'backfill',
  runRecorderPhase: 'recorder',
  // RE-FREEZE #3 (pilot 9 commit 7d/2, 2026-09-04, LG-28) — the 8th runner, ENRICHER's own
  // `execution.shape:"enrich"`.
  runEnrichPhase: 'enrich',
};
const LIBRARY_CALL_RE = /\b(staleness|write|verdict|ledger|acquire|pipeline)\.(\w+)\(|\b(preWriteGate)\(/g;

// pilot 9 commit 7e/1 (2026-09-04) — RE-FREEZE #3's own generator side-effect, closed here.
// The PRIOR bound was "the next `async function run\w+(` match" — a `run\w+` name is not a
// runner boundary, it's an accident of THIS runner's own naming convention colliding with
// unrelated `run`-prefixed helpers (`runWithPool`, `runTierToConvergence`,
// `runBackfillFullRecompute`) and, when no such helper follows, with nothing at all — which is
// exactly how `runRecorderPhase` (until 7d) and then `runEnrichPhase` (from 7d) each in turn
// silently inherited `executeOrderedWrites`' write.executeSetBasedClear/write.executeUpsertBatch
// calls: neither `executeOrderedWrites` nor `makePreWriteGate`, the two non-"run"-named
// functions sitting directly after them in file order, are `run\w+`-shaped, so the old
// heuristic ran straight past them to the next accidental `run\w+` match. A runner's true
// boundary is "the next top-level declaration of ANY kind" — every declaration in this file
// (function or async function, "run"-prefixed or not) starts at column 0, so bounding on that
// is both correct and a STRICT NARROWING of the old bound (the new boundary set is a superset
// of the old one, so a range can only shrink, never grow) — which is why regenerating below
// leaves all seven pre-existing runners' phase_order byte-identical and fixes only
// runEnrichPhase's.
const TOP_LEVEL_DECLARATION_RE = /^(?:async )?function (\w+)\(/;

/** { runnerName -> source line range } for every top-level `async function run*(` in index.js,
 * each bounded by the START of the next top-level declaration of ANY kind (see the note above
 * `TOP_LEVEL_DECLARATION_RE` for why a `run\w+`-only bound is wrong). */
export function runnerRanges(source) {
  const lines = source.split('\n');
  const declarationStarts = [];
  for (let i = 0; i < lines.length; i++) {
    if (TOP_LEVEL_DECLARATION_RE.test(lines[i])) declarationStarts.push(i);
  }
  declarationStarts.push(lines.length); // EOF sentinel
  const runnerStarts = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^async function (run\w+)\(/);
    if (m) runnerStarts.push({ name: m[1], line: i });
  }
  const ranges = {};
  for (const { name, line } of runnerStarts) {
    const end = declarationStarts.find((b) => b > line);
    ranges[name] = { start: line, end };
  }
  return { lines, ranges };
}

/** The ordered, deduplicated (first-occurrence) library-call sequence for one runner's body. */
export function extractPhaseOrder(lines, range) {
  const body = lines
    .slice(range.start, range.end)
    .map((l) => l.replace(/\/\/.*$/, '')) // strip line comments — code only
    .join('\n');
  const seen = new Set();
  const seq = [];
  let m;
  LIBRARY_CALL_RE.lastIndex = 0;
  while ((m = LIBRARY_CALL_RE.exec(body))) {
    const label = m[3] ? 'preWriteGate' : `${m[1]}.${m[2]}`;
    if (!seen.has(label)) {
      seen.add(label);
      seq.push(label);
    }
  }
  return seq;
}

function derivePhaseRunners() {
  const source = readFileSync(INDEX_JS_PATH, 'utf8');
  const { lines, ranges } = runnerRanges(source);
  return RUNNER_NAMES.map((runner) => {
    const range = ranges[runner];
    if (!range) throw new Error(`generate-template-freeze: ${runner} not found in ${path.relative(ROOT, INDEX_JS_PATH)} — has it been renamed?`);
    const phase_order = extractPhaseOrder(lines, range);
    if (phase_order.length === 0) throw new Error(`generate-template-freeze: ${runner} yielded an empty phase_order — extraction regex likely stale`);
    return { shape: RUNNER_TO_SHAPE[runner], runner, phase_order };
  });
}

// ---------------------------------------------------------------------------
// DERIVED: archetype_profiles — one row per identity.archetype enum value,
// cross-referenced against converted.json (pilot order) + manifest.json
// (file -> slug) + each converted descriptor's own identity.archetype /
// execution.shape. LINK maps to 2 shapes (link, link_keyed) in the live
// schema — recorded as arrays, never collapsed to one (see template-
// freeze.schema.json's own description; filed review_followups.md MED
// against Spec 124 §9's table, which shows only 1 LINK row).
// ---------------------------------------------------------------------------

function deriveArchetypeProfiles(schema) {
  const archetypeEnum = schema.properties.identity.properties.archetype.enum;
  const converted = JSON.parse(readFileSync(CONVERTED_PATH, 'utf8')).converted;
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const slugFor = (file) => {
    const found = Object.entries(manifest.scripts).find(([, e]) => e.file === file);
    if (!found) throw new Error(`generate-template-freeze: no manifest.scripts entry points at ${file}`);
    return found[0];
  };

  const byArchetype = new Map(archetypeEnum.map((a) => [a, { shapes: [], runners: [], first_step: null }]));

  for (const file of converted) {
    const descPath = path.join(ROOT, file.replace(/\.js$/, '.descriptor.json'));
    const descriptor = JSON.parse(readFileSync(descPath, 'utf8'));
    const archetype = descriptor.identity.archetype;
    const shape = descriptor.execution && typeof descriptor.execution === 'object' ? descriptor.execution.shape : undefined;
    const slug = slugFor(file);
    const entry = byArchetype.get(archetype);
    if (!entry) throw new Error(`generate-template-freeze: ${file} declares unknown archetype "${archetype}"`);
    if (entry.first_step === null) entry.first_step = slug; // first, in converted.json/pilot order
    if (shape && !entry.shapes.includes(shape)) {
      entry.shapes.push(shape);
      const runner = Object.entries(RUNNER_TO_SHAPE).find(([, s]) => s === shape)?.[0];
      if (runner && !entry.runners.includes(runner)) entry.runners.push(runner);
    }
  }

  return archetypeEnum.map((archetype) => {
    const entry = byArchetype.get(archetype);
    return { archetype, shapes: entry.shapes, runners: entry.runners, first_step: entry.first_step, proven: entry.first_step !== null };
  });
}

// ---------------------------------------------------------------------------
// DERIVED: batching_prereq_snapshot — programme-items.json's open set right
// now. Filters with the SAME `isOpenBatchingItem` predicate step-validate.
// mjs's blocksBatchingCount and generate-programme-backlog.mjs's
// openBatchingCount use — G9, WF2 "template freeze" C1 + remediation
// (2026-09-04) — so this generator can never drift into a second,
// independently-maintained copy of the same filter.
// ---------------------------------------------------------------------------

function deriveBatchingPrereqSnapshot() {
  const items = JSON.parse(readFileSync(PROGRAMME_ITEMS_PATH, 'utf8')).items;
  return items
    .filter(isOpenBatchingItem)
    .map((it) => ({ id: it.id, status: it.status, owner: it.owner.kind === 'none' ? '—' : `${it.owner.kind}: ${it.owner.ref}` }));
}

// ---------------------------------------------------------------------------
// Assemble + I/O.
//
// TWO TIERS OF FIELD, on purpose (found building the R-E lock, C4): if EVERY
// field were re-derived from the live tree on every plain regenerate, a
// schema edit followed by an innocent `npm run template-freeze` would
// silently absorb the new hash into "the frozen baseline" and `--check` would
// read clean — exactly the "freeze that isn't" defect this whole mechanism
// exists to close. So:
//   FROZEN tier (frozen_at, schema_sha256, categories, archetype_profiles,
//   phase_runners) — re-derived ONLY on `--refresh` (a deliberate re-freeze)
//   or the very first generation. A plain regenerate PRESERVES these
//   verbatim from the committed file, unchanged, no matter what the live
//   tree currently says — the whole point is that they DON'T silently track
//   the tree. Drift between these and the LIVE tree is exactly what the R-E
//   lock (template-freeze.infra.test.ts) is for, and it MUST see that drift,
//   never have this generator paper over it.
//   LIVE tier (batching_prereq_snapshot) — re-derived on every regenerate,
//   `--check` included. This field tracks the moving programme-items.json
//   state on purpose, unrelated to the frozen schema/runner shape.
// ---------------------------------------------------------------------------

function deriveFrozenTier() {
  const { schema_sha256, categories } = deriveSchema();
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
  return {
    schema_sha256,
    categories,
    archetype_profiles: deriveArchetypeProfiles(schema),
    phase_runners: derivePhaseRunners(),
  };
}

export function assembleArtifact(frozenAt, frozenTier, liveTier) {
  return {
    $comment: [
      'GENERATED by scripts/steps/_schema/generate-template-freeze.mjs — do not hand-edit.',
      'Spec 122 §8.2 ("freeze the template after the eighth, never the first") as a declared',
      'artifact + a both-directions gate (src/tests/template-freeze.infra.test.ts, the R-E lock).',
      'frozen_after_pilot/lg21_decision/does_not_freeze are DECLARED rulings (edit the generator',
      'constants + Spec 122 §8, same commit). frozen_at/schema_sha256/categories/',
      'archetype_profiles/phase_runners are the FROZEN tier — re-derived ONLY by `--refresh`',
      '(a deliberate re-freeze), never by a plain regenerate, so a schema edit cannot silently',
      'launder itself into the new baseline. batching_prereq_snapshot is the LIVE tier —',
      're-derived on every regenerate, `--check` included.',
      'Regenerate with `node scripts/steps/_schema/generate-template-freeze.mjs` (frozen tier',
      'preserved, live tier refreshed) or `--refresh` (frozen tier re-derived, frozen_at := HEAD).',
    ],
    contract_version: 1,
    frozen_at: frozenAt,
    frozen_after_pilot: FROZEN_AFTER_PILOT,
    schema_sha256: frozenTier.schema_sha256,
    categories: frozenTier.categories,
    archetype_profiles: frozenTier.archetype_profiles,
    phase_runners: frozenTier.phase_runners,
    lg21_decision: LG21_DECISION,
    batching_prereq_snapshot: liveTier.batching_prereq_snapshot,
    does_not_freeze: DOES_NOT_FREEZE,
  };
}

function serialize(artifact) {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

function main() {
  const check = process.argv.includes('--check');
  const refresh = process.argv.includes('--refresh');
  if (check && refresh) throw new Error('generate-template-freeze: --check and --refresh are mutually exclusive');

  const existing = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, 'utf8')) : null;
  const firstEver = existing === null;

  let frozenAt;
  let frozenTier;
  if (refresh || firstEver) {
    frozenAt = currentHeadSha();
    frozenTier = deriveFrozenTier();
  } else {
    frozenAt = existing.frozen_at;
    frozenTier = {
      schema_sha256: existing.schema_sha256,
      categories: existing.categories,
      archetype_profiles: existing.archetype_profiles,
      phase_runners: existing.phase_runners,
    };
  }
  const liveTier = { batching_prereq_snapshot: deriveBatchingPrereqSnapshot() };

  const artifact = assembleArtifact(frozenAt, frozenTier, liveTier);
  const rendered = serialize(artifact);

  if (check) {
    const current = existsSync(OUT_PATH) ? readFileSync(OUT_PATH, 'utf8') : null;
    if (current !== rendered) {
      console.error('[generate-template-freeze] DRIFT — scripts/steps/_schema/template-freeze.json is stale relative to the live tree. Run `node scripts/steps/_schema/generate-template-freeze.mjs` to regenerate.');
      process.exit(1);
    }

    // R-E lock (C4) — the schema must still be what the frozen artifact says
    // it froze, UNLESS this commit deliberately re-froze it (bump + Spec 122
    // §8 amendment, same commit).
    const liveSchemaSha256 = createHash('sha256').update(readFileSync(SCHEMA_PATH)).digest('hex');
    const cachedBaseline = gitDiffNameOnly(['--cached']).length > 0 ? 'HEAD' : 'HEAD~1';
    const freezeRelPath = path.relative(ROOT, OUT_PATH).replace(/\\/g, '/');
    const oldFreezeRaw = gitShowFile(cachedBaseline, freezeRelPath);
    const oldFrozenSchemaSha256 = oldFreezeRaw ? JSON.parse(oldFreezeRaw).schema_sha256 : null;
    const newFrozenSchemaSha256 = existing ? existing.schema_sha256 : null;
    const specRelPath = path.relative(ROOT, SPEC_122_PATH).replace(/\\/g, '/');
    const oldSpec = gitShowFile(cachedBaseline, specRelPath) || '';
    const newSpec = existsSync(SPEC_122_PATH) ? readFileSync(SPEC_122_PATH, 'utf8') : '';
    const section8Changed = extractSection(oldSpec, SECTION_8_HEADING) !== extractSection(newSpec, SECTION_8_HEADING);

    const reCheck = checkFrozenSchemaConsistency({ oldFrozenSchemaSha256, newFrozenSchemaSha256, liveSchemaSha256, section8Changed });
    if (!reCheck.ok) {
      console.error(`[generate-template-freeze] R-E VIOLATION: ${reCheck.reason}`);
      process.exit(1);
    }

    // FREEZE-1 lock (WF2 "FREEZE-1, the freeze precondition", commit 1) — is
    // the FREEZE-1 declaration itself honest? Arms A and B are DELIBERATELY
    // fed from two different sources (output-review fix, 2026-09-09 — the
    // original wiring fed both from the same freshly-derived `artifact.
    // batching_prereq_snapshot`, so arm B could never independently fire:
    // whatever made arm A's otherOpenBatchingIds empty ALSO made arm B's
    // snapshotIds empty, every time, because they were the same live-derived
    // array with FREEZE-1 filtered out). Arm A reads a FRESH scan of
    // programme-items.json (the ledger, right now). Arm B reads the
    // COMMITTED, on-disk artifact's own batching_prereq_snapshot (`existing`
    // — null on first-ever generation, in which case there is nothing yet to
    // disagree with) — never the just-assembled `artifact` this same run is
    // about to (over)write, so a stale or hand-edited committed snapshot is
    // visible even when the fresh ledger scan is honest. Check-path only:
    // never mutates OUT_PATH.
    const programmeItems = JSON.parse(readFileSync(PROGRAMME_ITEMS_PATH, 'utf8')).items;
    const freezeItem = programmeItems.find((it) => it.id === 'FREEZE-1');
    if (!freezeItem) throw new Error('generate-template-freeze: FREEZE-1 not found in programme-items.json');
    const otherOpenBatchingIds = programmeItems.filter((it) => it.id !== 'FREEZE-1' && isOpenBatchingItem(it)).map((it) => it.id);
    const committedSnapshotIds = existing ? existing.batching_prereq_snapshot.map((s) => s.id) : [];
    const honesty = checkFreezeDeclarationHonesty({
      freezeItemStatus: freezeItem.status,
      otherOpenBatchingIds,
      snapshotIds: committedSnapshotIds,
      archetypeProfiles: artifact.archetype_profiles,
    });
    if (!honesty.ok) {
      console.error(`[generate-template-freeze] FREEZE-1 VIOLATION: ${honesty.reason}`);
      process.exit(1);
    }

    console.log('[generate-template-freeze] clean — no drift, R-E consistent, FREEZE-1 honest');
    return;
  }

  writeFileSync(OUT_PATH, rendered);
  console.log(`[generate-template-freeze] wrote ${path.relative(ROOT, OUT_PATH)} (frozen_at=${frozenAt.slice(0, 8)}, ${artifact.categories.length} categories, ${artifact.phase_runners.length} runners, ${artifact.batching_prereq_snapshot.length} open batching_prereq item(s))`);
}

const isEntry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) main();
