#!/usr/bin/env node
/**
 * Claim register extractor + island-architecture classifier.
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md
 *
 * WHY THIS EXISTS. Spec 121's header records a measured ~60% citation-error rate
 * on hand-written detail, and states its own corrective in §12.1a: "the plan must
 * be GENERATED from the spec, not written from it." The S0 extractor that header
 * describes as "built and run" on 2026-08-22 was never committed, so every
 * [generated] figure in Spec 121 is presently unreproducible and undrift-checkable
 * — the tier-0 "documented" state Spec 119 §4.6 ranks lowest, inside the spec that
 * mandates the opposite. This is that tool, committed.
 *
 * DESIGN — Appendix E's split, kept deliberately: a SMALL authored rule set plus a
 * GENERATED rendering. The RULES table below is the only hand-maintained data.
 * Anything a rule does not match falls to REVIEW, never to a default bucket,
 * because a classifier that silently defaults reports a clean total it has not
 * earned. That is the same failure shape as the basename collision and the
 * `(\d+[a-e]?)` regex that silently dropped claims 52f/52g/52h (App. G).
 *
 * TOOLING GATE — Spec 121 §12b.6, "anything that enforces must be proven to fire."
 * `--self-test` runs the parser against a known-bad fixture, asserts each guard
 * fires, and includes a negative control. Normal runs execute the self-test first
 * and refuse to emit output if it fails.
 *
 * NB: this is analysis tooling under scripts/violations/, not a chain step. Spec 47
 * §R1-R12 (advisory lock, pipeline.run, emitSummary) governs chain scripts and does
 * not apply here — same posture as scripts/analysis/**.
 *
 * Usage:
 *   node scripts/violations/extract-claims.mjs                  # print to stdout
 *   node scripts/violations/extract-claims.mjs out.md           # write to a file
 *   node scripts/violations/extract-claims.mjs --self-test      # prove the parser
 *   node scripts/violations/extract-claims.mjs --json           # machine-readable
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPEC_121 = path.join(ROOT, 'docs/specs/01-pipeline/121_assessment_and_verification_methodology.md');

/** Below this, assume the parser silently truncated rather than the register shrank. */
const MIN_PLAUSIBLE_CLAIMS = 200;

// ---------------------------------------------------------------------------
// PARSER
// ---------------------------------------------------------------------------

/** First cell of a claim row: `12`, `52a`, or a range `109-115` / `109–115`. */
const ID_CELL = /^(\d+[a-z]?)(?:\s*[–—-]\s*(\d+))?$/;

function splitRow(line) {
  const t = line.trim();
  if (!t.startsWith('|')) return null;
  const body = t.endsWith('|') ? t.slice(1, -1) : t.slice(1);
  const cells = body.split('|').map((c) => c.trim());
  return cells.length >= 2 ? cells : null;
}

const isSeparator = (cells) => cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, '')));

/**
 * Extract every claim row from Appendix A.
 *
 * Two shape hazards this handles, both recorded in Spec 121 as having bitten:
 *  - sections are NOT schema-consistent (A.18/A.21 carry 5 columns, A.1 carries 4),
 *    so the violation cell is read from the END, never from a fixed index;
 *  - IDs carry letter suffixes and ranges, and a `[a-e]` regex once dropped 52f-h.
 */
export function parseRegister(markdown) {
  const lines = markdown.split(/\r?\n/);
  const claims = [];
  const seen = new Set();
  let section = null;
  let inAppendixA = false;
  let violationCol = -1;   // index of the column the HEADER names as the violation

  for (const line of lines) {
    const h2 = /^##\s+(.*)$/.exec(line);
    if (h2) {
      inAppendixA = /^Appendix A\b/.test(h2[1].replace(/[*_`]/g, '').trim());
      if (!inAppendixA) section = null;
      continue;
    }
    if (!inAppendixA) continue;

    const h3 = /^###\s+(A\.\d+)\s+(.*)$/.exec(line);
    if (h3) {
      section = { id: h3[1], title: h3[2].replace(/[*`]/g, '').trim() };
      violationCol = -1;
      continue;
    }
    if (!section) continue;

    const cells = splitRow(line);
    if (!cells || isSeparator(cells)) continue;

    // A header row names its columns. `The violation` (A.1-A.17) and `The test`
    // (A.18/A.21) are the same thing under two names; `Status` is not.
    if (/^#$/.test(cells[0].replace(/[*`\s]/g, ''))) {
      violationCol = cells.findIndex((c) => /the violation|the test/i.test(c));
      continue;
    }

    const raw = cells[0].replace(/[*`⚠️\s]/g, '');
    const m = ID_CELL.exec(raw);
    if (!m) continue;

    const claimText = cells[1] ?? '';
    // Shape is VALIDATED, never assumed by position: the register's tables are not
    // schema-consistent (A.18/A.21 carry different columns), so cells[2] is prose
    // there, not a shape code. Spec 121 records the inconsistency; this respects it.
    const rawShape = cells.length >= 4 ? (cells[2] ?? '').replace(/[*`\s]/g, '') : '';
    const shape = /^[PBRW]$/.test(rawShape) ? rawShape : '';

    // ⚠️ The violation column is named by the HEADER, never taken from the end.
    // Reading cells[last] was a laundering bug: A.18/A.21 are 5-column tables
    // (`# | Class | Occurrences | The test | Status`), so the last cell is the
    // ADJUDICATION. Claims #263/#265/#270 were then homed to RUNNER purely because
    // their adjudication text says "eslint … already bans" — while the spec's own
    // verdict on those rows is "the architecture does NOT close it". They never
    // surfaced as orphans, so nothing flagged them. 33 claims read a truncated
    // haystack this way.
    const vIdx = violationCol >= 0 && violationCol < cells.length
      ? violationCol
      : cells.length - 1;
    const violation = cells[vIdx] ?? '';

    const push = (id) => {
      if (seen.has(id)) return;
      seen.add(id);
      claims.push({ id, section: section.id, sectionTitle: section.title, claim: claimText, shape, violation });
    };

    if (m[2]) {
      const lo = Number(m[1]);
      const hi = Number(m[2]);
      // Expand so the denominator is per-claim, not per-row. Spec 121 records
      // 288-vs-276 as exactly this distinction; 288 is the correct denominator
      // for "does every claim have a disposition".
      for (let n = lo; n <= hi; n++) push(String(n));
    } else {
      push(m[1]);
    }
  }
  return claims;
}

// ---------------------------------------------------------------------------
// CLASSIFIER — the only hand-authored data in this file.
//
//   DEAD          stops being meaningful under the island model
//   RESHAPED      survives; wording/mechanism changes, replacement NAMED
//   UNCHANGED     holds identically
//   STRENGTHENED  cheaper or more enforceable than under the runner
//   REVIEW        no rule matched — must be adjudicated explicitly
//
// Ordered; first match wins. Per-claim overrides precede section rules.
//
// THE ISLAND MODEL, stated once so every verdict below is checkable against it:
//   - each step script stays at scripts/<name>.js, keeps its lock ID, keeps its
//     manifest entry and its run-chain.js invocation;
//   - it ships a DATA-ONLY sibling <name>.descriptor.json (Spec 120 §3's 13
//     categories) and exports `compute`;
//   - scripts/lib/step/ owns the whole lifecycle via pipeline.step(desc, compute);
//   - enforcement is conformance test + eslint/ast-grep, not a loader;
//   - the cross-step ledger is generated by collecting the 27 descriptor files.
// ---------------------------------------------------------------------------

// The FORK. ~8 claims flip on whether the descriptor is a data-only sibling file
// or an object literal exported from the .js. Passed as --variant=<name>.
// Default is sibling-json: it costs one file per step and buys back most of the
// weakened bucket (SH4, #82, #77, #78, and #86's structural half).
const VARIANT = (process.argv.find((a) => a.startsWith('--variant=')) ?? '--variant=sibling-json').split('=')[1];
const VARIANTS = ['sibling-json', 'js-export'];
if (!VARIANTS.includes(VARIANT)) {
  // Throw rather than process.exit(): eslint bans process.exit() under scripts/**,
  // and an uncaught throw at module scope already yields a non-zero exit.
  throw new Error(`Unknown --variant=${VARIANT}. Expected one of: ${VARIANTS.join(', ')}`);
}
const SIBLING = VARIANT === 'sibling-json';

const RULES = [
  // =========================================================================
  // PER-CLAIM OVERRIDES.
  //
  // PROVENANCE: an independent adjudication pass read both specs plus the
  // load-bearing code and disagreed with this file's first section-level rule
  // set on 11 claims. Every disagreement was checked and the adjudication won.
  // The section rules below are now a FALLBACK for claims nobody contested,
  // not the primary mechanism — a coarse rule produced a falsely clean
  // "0 DEAD" total, which is the exact failure this file's header warns about.
  // =========================================================================

  { ids: ['1'], v: 'DEAD',
    why: 'CORRECTED (was UNCHANGED). The claim is not merely satisfied — its violation test is UNAUTHORABLE. "Put a fixture step at repo root and assert coverage stops" cannot be written when no step can be anywhere else. A register entry whose violation cannot be written is dead, whatever its sentence still says. NB the risk it guarded is real and Spec 120 UNDER-states it: generate-logic-vars-docs.mjs:38 scans [scripts, scripts/quality] NON-RECURSIVELY, so Spec 120\'s own target path scripts/steps/<slug>/compute.js would have silently emptied the logic-vars consumer map for all 27 steps. Islands remove the hazard by construction.' },

  { ids: ['82'], v: SIBLING ? 'UNCHANGED' : 'DEAD', forked: true,
    why: SIBLING
      ? 'Descriptors are committed data files; "generated at build time and committed" holds verbatim.'
      : 'CONTRADICTED, not weakened: under descriptor-in-JS every declaration is produced at load time by definition, which is the precise thing this claim forbids.' },

  { ids: ['145'], v: 'DEAD',
    why: 'CORRECTED (was RESHAPED). The claim is "the DAG is DERIVED from writes, never declared — declare an edge and no such field exists". Islands keep manifest.chains and its declared ordering, so the DAG stays declared. The premise is retired by the proposal itself. REPLACEMENT CLAIM NEEDED: descriptor reads/writes must be consistent with manifest order, because they can now disagree.' },

  { ids: ['158'], v: 'DEAD',
    why: 'CORRECTED (was STRENGTHENED). "Gate 5: the old script is deleted or dated-ticketed" has no referent — there is no old script, the file IS the step refactored in place. Replacement: pipeline.run( must not appear in any file listed in manifest.chains[*].file.' },

  { ids: ['132'], v: 'RESHAPED', repl: 'explicit checkJs tsconfig project over scripts/**, or .ts computes',
    why: 'CORRECTED (was UNCHANGED). The CLAIM survives; its FREE-NESS dies. Spec 120 §12b.4 calls typechecking "the cheapest large win — requires no additional work" because a TS compute in a new tree is typechecked on arrival. Island files stay .js CommonJS under scripts/, which is the untypechecked zone (Spec 119 §2). THIS IS THE LARGEST SINGLE BENEFIT ISLANDS FORFEIT. Orthogonal to the programme and shippable today.' },

  { ids: ['128'], v: 'RESHAPED', repl: 'ast-grep: manifest step files must be exactly `module.exports = pipeline.step(<descriptor>, <fn>)` + ban `pipeline.run(`',
    why: 'THE LOAD-BEARING LOSS. Spec 120 §12.6 calls "no per-step escape hatches" the single most important rule, and enforces it by schema-rejecting an override key. Under islands a step needs no override key — it can simply NOT CALL pipeline.step(), or wrap it, or keep a second path beside it. That is today\'s situation, which the programme exists to end. Failure is SILENT and its arrival is "the moment one step gets a special case, there are 27". This rule is mandatory, not optional, and ships with its own fixture per §12b.6.' },

  { ids: ['9'], v: 'RESHAPED', repl: 'descriptor <-> LOCK_ID_REGISTRY agreement test (a 4th axis on an existing 3-axis test)',
    why: 'Spec 120 §9.1 names this the blocking constraint and Gate S makes it a hard prerequisite. VERIFIED: pipeline-advisory-lock.infra.test.ts:22 records registry keys as manifest file paths, and :297 filters manifest files against the registry — no file moves, so :297 passes on step 1 and step 27. The blocker DOES NOT OCCUR and Spec 121 §12.18a\'s "② is the hard blocker" entry criterion is void. CAVEAT, verified and initially missed: the SAME FILE carries three further per-script loops — :241 (source must contain `const ADVISORY_LOCK_ID = <n>`), :253 (must contain `withAdvisoryLock`), :284 (constant matches registry). Those DO red on conversion 1 unless the convention keeps ADVISORY_LOCK_ID textually in the file and passes it as identity.lock. One line per step, reversible.' },

  { ids: ['86'], v: SIBLING ? 'UNCHANGED' : 'RESHAPED', forked: true,
    repl: SIBLING ? undefined : 'require-under-pg.Pool-spy conformance case + the #128 ast-grep rule (BOTH required)',
    why: SIBLING
      ? 'Survives STRUCTURALLY: a data-only sibling descriptor is readable without executing anything, so no tool needs to require() 27 modules.'
      : 'Survives BEHAVIOURALLY, dies STRUCTURALLY. Three real losses: (1) every descriptor-consuming tool must require() 27 modules and inherits their import side effects; (2) #82 is contradicted; (3) THE ASYMMETRIC ONE — a step whose module throws at import becomes unloadable and silently DROPS OUT of every generated artifact rather than failing loudly. NEW CLAIM REQUIRED: every generator asserts loaded.length === manifest file count. The spy catches a pool; only ast-grep catches a top-level fs.readFileSync or dotenv load.' },

  { ids: ['77', '78'], v: SIBLING ? 'UNCHANGED' : 'RESHAPED', forked: true,
    repl: SIBLING ? undefined : 'ast-grep: the descriptor argument must be a literal-only object expression',
    why: SIBLING
      ? 'Transfer verbatim — a JSON file cannot contain a conditional, a template literal or a runtime reference.'
      : 'Structural impossibilities of a data format become ENUMERATED PATTERN BANS, and you ban only what you list: no ConditionalExpression, TemplateLiteral, IfStatement, CallExpression, computed member, or non-whitelisted identifier.' },

  { ids: ['52a', '52b', '52c', '52d', '52e', '52f', '52g', '52h', '13'], v: 'RESHAPED',
    repl: 'fingerprint extractor keyed on the pipeline.step() call-site AST node',
    why: 'Under Spec 120 compute and descriptor sit in disjoint FILES, so the hash\'s include/exclude split is file selection. Under islands they share a file, so #52c (identity/why/notes/deviations never feed the hash) and #52g (per-FIELD membership, seven assertions) become AST surgery on the call-site node. Second-largest island cost after #128; #52a (prettier sweep) and #52c are the regressions easiest to get wrong here.' },

  { ids: ['39'], v: 'RESHAPED', repl: 'the library owns the pipeline_runs row unconditionally; run-chain.js stops writing it',
    why: 'Ledger ownership is split today — run-chain.js:716-732 writes the row for in-chain steps while standalone runs write their own, and 11 of 27 branch on PIPELINE_CHAIN. Consolidating is inside Spec 120 §2\'s own "~25-30 lines at three sites" budget, so the island proposal\'s "no run-chain.js change" is OVERSTATED for this claim.' },

  { ids: ['85'], v: 'RESHAPED', repl: 'a `reconcile` step at the head of manifest.chains.sources, or a run-chain.js preamble',
    why: 'THE ONE GENUINE ARCHITECTURAL GAP. Spec 120 §4.1 Step 0 reconciles the previous run ONCE at start, before any work. Islands have no single start — run-chain.js:167 spawns each step as its own process — so reconcile would either run 27 times (reaping other steps\' rows) or have no home at all. It also owns published_batch rollback, which is otherwise ownerless. DECIDE THIS BEFORE COMMITTING TO THE APPROACH.' },

  { ids: ['31'], v: 'RESHAPED', repl: 'conformance test enumerates permitted sibling files per slug and rejects any other <slug>.*',
    why: 'A directory-shape claim with no directory.' },
  { ids: ['184'], v: 'RESHAPED', repl: 'scripts/step-fixtures/<slug>/ + a lint mapping every fixture dir to a live manifest slug',
    why: 'Same class as #31 — fixtures had a home in the step directory and now need one.' },

  { ids: ['21'], v: 'STRENGTHENED',
    why: 'CORRECTED (was RESHAPED). module.exports = pipeline.step(descriptor, compute) makes compute a LITERAL ARGUMENT at the export site — indirection becomes syntactically impossible rather than merely forbidden. The island signature IS this claim.' },

  { ids: ['144', '75', '79', '80', '143', '127'], v: 'STRENGTHENED',
    why: 'Free under islands. #144 (a step is a process) is ALREADY TRUE — run-chain.js:167,635 spawns each step as a child; Spec 120\'s in-process runner would have had to deliberately preserve it. #75 rides existing spawnStepChild timeout plumbing. #79/#80 are true by construction because the DAG is committed manifest.json. #143 (stable step IDs) is vacuous — nothing renames. #127 (constant-placement lint) becomes a single-file AST comparison instead of cross-file resolution.' },

  { ids: ['254', '263', '271'], v: 'STRENGTHENED',
    why: 'These are the eslint.config.mjs:96 scripts/** bans. A.20 notes Spec 120 §2\'s path constraint is load-bearing for #254 — under islands the path never moves, so it is satisfied by construction and the load-bearing risk disappears.' },

  { ids: ['163'], v: 'RESHAPED', repl: 'SH3-prime: named `descriptor` + `compute` exports alongside the runnable, + ast-grep banning compute from referencing the module-level pipeline binding',
    why: 'Spec 120 §12.17 calls this the single highest-yield step test and names SH3 as its dependency. ISLANDS KILL SH3 BY CONSTRUCTION — the compute module imports the runner. The swap test needs a step whose compute is REPLACEABLE, so the export contract must widen. Strictly more machinery than SH3\'s "use three modules", affordable, but DECIDE UP FRONT: retrofitting an export contract across 64 files is exactly what #140\'s codemod rule exists for.' },

  { ids: ['124'], v: 'RESHAPED', repl: 'scripts/_step-template.js + npm run step:new, with the #128 ast-grep shape rule as the real enforcement',
    why: 'No step directory to shape-lint. For a 64-conversion programme over EXISTING files the exemplar is a converted file, which is what §14.8 wanted anyway.' },

  { ids: ['2'], v: 'RESHAPED', repl: 'descriptor schema + a lint asserting one sibling .descriptor.json per manifest script',
    why: 'JSON-not-YAML holds; the actor changes.' },

  // ---- section-level FALLBACK rules ----
  // These now cover only claims no override contested. Treat a section verdict as
  // weaker evidence than a per-claim one.

  { ids: ['2'], v: 'RESHAPED', repl: 'JSON Schema + step-shape lint',
    why: 'No loader exists to refuse a .yaml. JSON-not-YAML is enforced by the descriptor schema and a lint asserting each manifest script has exactly one sibling .descriptor.json.' },

  { ids: ['9'], v: 'RESHAPED', repl: 'pipeline-advisory-lock.infra.test.ts:297 (already green)',
    why: 'DECISIVE. Lock uniqueness asserts against the EXISTING LOCK_ID_REGISTRY, whose keys are manifest file paths — and no file moves, so the assertion never fires. Spec 120 §9.1\'s "blocking constraint", the hard prerequisite of Gate S, simply does not occur. Generation of the registry becomes an optional later tidy, not a blocker.' },

  { ids: ['21'], v: 'RESHAPED', repl: 'ast-grep: module.exports = pipeline.step(desc, compute)',
    why: 'compute is the second argument to pipeline.step(), not a config key. Same intent (no indirection between the file and its logic), different surface.' },

  { ids: ['86'], v: 'RESHAPED', repl: 'data-only sibling <name>.descriptor.json + an import-side-effect test',
    why: 'THE HINGE CLAIM. "A declaration is never executable" is preserved ONLY if the descriptor is a data-only sibling file. If the descriptor is instead exported from the .js, requiring it executes module scope, this claim becomes unenforceable, and the cross-step ledger could no longer be built without running 27 scripts. compute-centroids.js:60 and link-parcels.js:124 already fail this today.' },

  { ids: ['124'], v: 'RESHAPED', repl: 'descriptor template + scaffold generator + shape lint',
    why: 'There is no step directory to shape-lint. "The template is the only entry point" becomes: the scaffold emits the descriptor+call-site pair, and a lint asserts every manifest script matches that shape.' },

  { ids: ['163'], v: 'RESHAPED', repl: 'compute exported as a named export, separate module from the call site',
    why: 'The compute-swap test survives and stays the highest-yield step test, but it now depends on SH3 being restated: compute must live in its own module, not inline in the step file.' },

  // ---- section-level rules ----
  { section: 'A.1', v: 'RESHAPED', repl: 'JSON Schema validated in CI and at the pipeline.step() boundary',
    why: 'Every schema claim survives verbatim — closed schema, 13 categories, "none" explicit, off-vocabulary rejected, ! vocabularies. Only the actor changes: "the loader refuses" becomes "schema validation refuses", in CI and again at the call site.' },

  { section: 'A.2', v: 'UNCHANGED',
    why: 'Status vocabulary, the single exported constant and the pipeline_runs DB CHECK are database- and constant-level. Nothing here ever referenced packaging.' },

  { section: 'A.3', v: 'RESHAPED', repl: 'sibling <name>.notes.json + the same CI checks',
    why: 'Interpretation moves to a sibling notes file. The cap, the no-quoted-numbers rule, detected_by existence and the staleness flag are all CI checks over a JSON file and transfer unchanged.' },

  { section: 'A.4', v: 'UNCHANGED',
    why: 'The 36 lifecycle behaviours are owned by pipeline.step(). A library owns a lifecycle exactly as completely as a runner does — this is Template Method, and it is what pipeline.run() already does at 27/27 adoption.' },

  { section: 'A.5', v: 'UNCHANGED',
    why: '--plan, --backfill, budget propagation, the REFUSE list and self-observability are library features reached through the same call site.' },

  { section: 'A.6', v: 'UNCHANGED',
    why: 'The validator is a module either way. Baking it into pipeline.step() is what makes checks non-optional — arguably more enforced than a runner that a step could be invoked outside of.' },

  { section: 'A.7', v: 'RESHAPED', repl: 'migrations sequenced per capability, not as a prerequisite block',
    why: 'The four state tables survive as FEATURES but stop being prerequisites. Interval ledger, publish pointer, step_error and quarantine each land with the capability that needs them, so migrations 245-248 leave the critical path.' },

  { section: 'A.8', v: 'UNCHANGED',
    why: 'Recovery and the admin surface read emitted state; the emitter is the library. The three reset guards and the T1-only editing rule are untouched.' },

  { section: 'A.9', v: 'RESHAPED', repl: 'eslint + ast-grep over scripts/**, plus the conformance test',
    why: 'Anti-hollowing survives in full. Enforcement moves from "the loader is the only entry point" to lint plus conformance — which is where eslint.config.mjs:96 already operates, on exactly this path.' },

  { section: 'A.10', v: 'UNCHANGED',
    why: 'Lint enforcement transfers wholesale and gets cheaper: eslint.config.mjs:96 already scopes the pipeline bans to scripts/**, which is where the steps already are. Under Spec 120 the new tree had to be placed carefully to stay inside that scope.' },

  { section: 'A.11', v: 'RESHAPED', repl: 'wc -l budget asserted against scripts/lib/step/**',
    why: 'The maintainability budgets apply to the library path instead of a runner module. SH2 must be restated to name that path, or the LOC budget is unmeasurable.' },

  { section: 'A.12', v: 'STRENGTHENED',
    why: 'The conversion workflow gets strictly cheaper: no file move, no manifest edit, no lock-registry rewrite, no test-path churn. The golden-master differential is a smaller diff over an unchanged invocation, which is what makes "same read and write" provable rather than intended.' },

  { section: 'A.13', v: 'UNCHANGED',
    why: 'Step-level testing is about compute, and compute is separated identically under both models.' },

  { section: 'A.14', v: 'UNCHANGED',
    why: 'Red-team claims target the validator, the generators and the enforcement layer. None referenced packaging.' },

  { section: 'A.15', v: 'STRENGTHENED',
    why: 'Load-bearing intent is materially easier to preserve when the file, its path, its lock ID and its existing tests all stay put — the Chesterton\'s-Fence surface shrinks to the diff itself.' },

  { section: 'A.16', v: 'UNCHANGED',
    why: 'Spec 121\'s method claims are architecture-independent by construction (§1: "deliberately domain-independent"). The entire method — register, violation suite, tiers, ratchet — carries over untouched.' },

  { section: 'A.17', v: 'UNCHANGED',
    why: 'The untestable residual is untestable under either architecture.' },

  { section: 'A.18', v: 'UNCHANGED',
    why: 'Incident replays reproduce historical defects. Where the fix lives is irrelevant to whether the replay reds under git revert.' },

  { section: 'A.19', v: 'STRENGTHENED',
    why: 'The wiring census gets its corpus for free: 27 data-only descriptors at predictable paths ARE the declared-field inventory it needs. Under Spec 120 the same corpus existed but only after the tree migration.' },

  { section: 'A.20', v: 'UNCHANGED',
    why: 'Database identity is a connection-time concern, and it is live: measured 2026-08-23, four analysis scripts still default to the pre-cutover DB, where the sanity audit reports 2,394 violations and 0 FAIL gates against 30,288 and 1 on the authoritative DB.' },

  { section: 'A.21', v: 'UNCHANGED',
    why: 'Commit-history defect classes are historical facts about this repo.' },
];

function classify(claim) {
  for (const r of RULES) {
    if (r.ids && r.ids.includes(claim.id)) return r;
    if (r.section && r.section === claim.section) return r;
  }
  return {
    v: 'REVIEW',
    why: 'No rule matched — adjudicate explicitly. A classifier that defaults reports a clean total it has not earned.',
  };
}

// ---------------------------------------------------------------------------
// SELF-TEST — prove the parser fires before believing its output.
// ---------------------------------------------------------------------------

const FIXTURE = [
  '## Appendix A — the claim register',
  '### A.1 Boundaries and the step file (§2–§3.2)',
  '| # | Claim | Shape | The violation |',
  '|---|---|---|---|',
  '| 1 | first claim | P | do a thing |',
  '| 52a | suffixed id, early letter | P | do a thing |',
  '| 52h | suffixed id, LATE letter | P | the [a-e] regex bug |',
  '| 109–111 | an en-dash range row | P | do a thing |',
  '| notanid | must be ignored | P | x |',
  '### A.18 Incident replay (five columns, violation NOT last)',
  '| # | Class | Occurrences | The test | Status |',
  '|---|---|---|---|---|',
  '| 200 | five col claim | B | the real violation | ADJUDICATION — must NOT be read |',
  '## Appendix B — defects, NOT the register',
  '| 999 | must not be captured | P | x |',
].join('\n');

function selfTest({ quiet = false } = {}) {
  const got = parseRegister(FIXTURE);
  const ids = got.map((c) => c.id);
  const fail = [];

  if (!ids.includes('52a')) fail.push('suffixed id 52a dropped');
  if (!ids.includes('52h')) fail.push('suffixed id 52h dropped — this is the recorded [a-e] regex bug that silently shrank the register');
  if (!['109', '110', '111'].every((i) => ids.includes(i))) fail.push('en-dash range row not expanded');
  if (ids.includes('999')) fail.push('captured rows outside Appendix A');
  if (ids.includes('notanid')) fail.push('captured a non-id row');

  const five = got.find((c) => c.id === '200');
  if (!five) fail.push('5-column section produced no claim');
  else if (five.violation !== 'the real violation') fail.push(`5-column section: violation read from the wrong column (got "${five.violation}") - the laundering bug`);
  else if (five.section !== 'A.18') fail.push('5-column section mis-attributed');

  // A.1 yields 1, 52a, 52h, 109, 110, 111 (=6); A.18 yields 200 (=1).
  const EXPECTED = 7;
  if (got.length !== EXPECTED) fail.push(`expected ${EXPECTED} fixture claims, got ${got.length}`);

  // Negative control: break the fixture and assert the parser NOTICES.
  // A checker that cannot fail is not a checker.
  const broken = parseRegister(FIXTURE.replace('| 52h |', '| 52h-BROKEN |'));
  if (broken.some((c) => c.id === '52h')) fail.push('negative control did not fire — the parser accepts a malformed id');

  if (fail.length) {
    console.error('SELF-TEST FAILED:');
    for (const f of fail) console.error(`  - ${f}`);
    return false;
  }
  if (!quiet) console.log(`SELF-TEST PASSED — ${got.length} fixture claims; 9 assertions incl. a negative control.`);
  return true;
}

// ---------------------------------------------------------------------------
// RENDER
// ---------------------------------------------------------------------------

const ORDER = ['DEAD', 'REVIEW', 'RESHAPED', 'STRENGTHENED', 'UNCHANGED'];
const MEANING = {
  DEAD: 'stops being meaningful under the island model',
  RESHAPED: 'survives; wording/mechanism changes, replacement named',
  UNCHANGED: 'holds identically',
  STRENGTHENED: 'cheaper or more enforceable than under the runner',
  REVIEW: '**unadjudicated — resolve before trusting this table**',
};

function render(rows) {
  const by = (v) => rows.filter((r) => r.v === v);
  const o = [];

  o.push('<!-- GENERATED by scripts/violations/extract-claims.mjs — do not hand-edit. -->');
  o.push('<!-- Regenerate: node scripts/violations/extract-claims.mjs <outfile> -->');
  o.push('');
  o.push(`**${rows.length} claims parsed from Spec 121 Appendix A** (range rows expanded per-claim).`);
  o.push('');
  o.push('| Verdict | Count | Meaning |');
  o.push('|---|---:|---|');
  for (const v of ORDER) o.push(`| ${v} | ${by(v).length} | ${MEANING[v]} |`);
  o.push(`| **TOTAL** | **${rows.length}** | |`);
  o.push('');

  const survive = rows.length - by('DEAD').length - by('REVIEW').length;
  const pct = ((survive / rows.length) * 100).toFixed(1);
  o.push(`> **${survive} of ${rows.length} claims (${pct}%) survive the architecture change.** ` +
         `The design of Spec 120 is almost entirely independent of its packaging; what changes is *who enforces*, not *what is enforced*.`);
  o.push('');

  o.push('### By register section');
  o.push('');
  o.push('| Section | Title | ' + ORDER.join(' | ') + ' | Total |');
  o.push('|---|---|' + ORDER.map(() => '---:').join('|') + '|---:|');
  const sections = [...new Set(rows.map((r) => r.section))]
    .sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
  for (const s of sections) {
    const sr = rows.filter((r) => r.section === s);
    const title = sr[0].sectionTitle.replace(/\|/g, '\\|');
    o.push(`| ${s} | ${title} | ` + ORDER.map((v) => sr.filter((r) => r.v === v).length || '·').join(' | ') + ` | ${sr.length} |`);
  }
  o.push('');

  for (const v of ['DEAD', 'REVIEW', 'RESHAPED']) {
    const list = by(v);
    if (!list.length) {
      o.push(`### ${v} — none`);
      o.push('');
      continue;
    }
    o.push(`### ${v} — ${list.length}`);
    o.push('');
    o.push('| # | § | Claim | Replacement mechanism | Why |');
    o.push('|---|---|---|---|---|');
    for (const r of list) {
      const c = r.claim.replace(/\|/g, '\\|');
      o.push(`| **${r.id}** | ${r.section} | ${c} | ${r.repl ?? '—'} | ${r.why} |`);
    }
    o.push('');
  }

  for (const v of ['STRENGTHENED', 'UNCHANGED']) {
    const list = by(v);
    if (!list.length) continue;
    o.push(`### ${v} — ${list.length}`);
    o.push('');
    const bySec = {};
    for (const r of list) (bySec[r.section] ??= []).push(r.id);
    for (const s of Object.keys(bySec).sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)))) {
      const rule = RULES.find((x) => x.section === s) ?? {};
      o.push(`- **${s}** (${bySec[s].length}) — ${bySec[s].join(', ')}`);
      if (rule.why) o.push(`  - ${rule.why}`);
    }
    o.push('');
  }

  return o.join('\n');
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

function main(argv) {
  if (argv.includes('--self-test')) {
    return selfTest() ? 0 : 1;
  }

  if (!selfTest({ quiet: argv.includes('--json') })) {
    console.error('Refusing to emit output from an unproven parser (Spec 121 §12b.6).');
    return 1;
  }

  const md = fs.readFileSync(SPEC_121, 'utf8');
  const claims = parseRegister(md);

  if (claims.length < MIN_PLAUSIBLE_CLAIMS) {
    console.error(
      `Parsed only ${claims.length} claims; the register is ~276-290. ` +
      `Refusing to emit a silently-truncated total — a generator that drops rows reports a clean total.`,
    );
    return 1;
  }

  const rows = claims.map((c) => ({ ...c, ...classify(c) }));
  const unresolved = rows.filter((r) => r.v === 'REVIEW');

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ variant: VARIANT, total: rows.length, unresolved: unresolved.length, rows }, null, 2));
  } else {
    const text = render(rows);
    const outPath = argv.find((a) => !a.startsWith('--'));
    if (outPath) {
      fs.writeFileSync(outPath, `${text}\n`);
      console.log(`Wrote ${rows.length} classified claims (variant=${VARIANT}) -> ${outPath}`);
    } else {
      console.log(text);
    }
  }

  if (unresolved.length) {
    console.error(`\n${unresolved.length} claim(s) fell to REVIEW: ${unresolved.map((r) => r.id).join(', ')}`);
  }
  return 0;
}

// ENTRY-POINT GUARD. Without this, `import { parseRegister }` from a sibling tool
// executes this whole CLI at module scope — which is claim #86 verbatim
// ("a declaration is never executable; require() it and nothing runs"), violated
// by the tool that catalogues it. Caught by plan-claims.mjs importing it.
const isEntryPoint = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isEntryPoint) {
  process.exitCode = main(process.argv.slice(2));
}
