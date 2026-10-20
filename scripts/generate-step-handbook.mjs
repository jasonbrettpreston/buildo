#!/usr/bin/env node
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-DF, R-BA, R-BE (operator y 2026-10-20 consolidation 1-4)
// ---------------------------------------------------------------------------
// Step-standard handbook generator → docs/handbook/step-standard.md
//
// The Spec 124 register is the authority; the handbook is the reading surface. What this file renders comes from
// three kinds of source, and the handbook header says which part is which:
//   GENERATED FROM CODE   §1 tables 1a/1b (the dispatch order, shape → predicate → phase, what each phase reads
//                         off the compute module, how it decides its mode, which steps use it, every step's real
//                         file paths and stage). Read from scripts/lib/step/index.js (parsed, and the exported
//                         predicates called on every real descriptor), scripts/manifest.json, the descriptors,
//                         the shells and scripts/steps/_schema/converted.json.
//   GENERATED FROM DATA   §2–§4, §6, §7 from scripts/steps/_schema/rule-map.json; the §5 Defect Ledger line
//                         numbers from docs/reports/defect-ledger.md.
//   HAND-WRITTEN, LOCKED  the §1 prose, the §5 tables and the glossary below. Every code symbol, file path, CLI flag
//                         and fast-invariant number they name is checked on every run (`factFindings`), and the
//                         run order the §1 prose states is checked against runWithPool (`RUN_ORDER`). A fact that
//                         stops matching the code fails --write and --check (pre-commit) by name.
// Nothing is dated, so the output is reproducible.
//
// Usage:
//   node scripts/generate-step-handbook.mjs --write   # regenerate the handbook
//   node scripts/generate-step-handbook.mjs --check   # exit 1 if the committed handbook is stale or a fact drifted
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { HANDBOOK_REL, IN_FORCE, HISTORY_SECTION, loadRuleMap, readDefectLines, unenforcedSummary, enforcementCounts, readCheckCorpus } from './analysis/gates/rule-map.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUTPUT = path.join(ROOT, HANDBOOK_REL);
export const RUNNER_REL = 'scripts/lib/step/index.js';
const MANIFEST_REL = 'scripts/manifest.json';
const CONVERTED_REL = 'scripts/steps/_schema/converted.json';
const PROGRAMME_REL = 'scripts/steps/_schema/programme-items.json';

// ---------------------------------------------------------------------------
// Hand-written, locked: where each named code symbol lives. Every camelCase or CONSTANT_CASE identifier written in
// backticks in the §1 prose, the §5 tables or the glossary must be listed here, and must occur in its file.
// ---------------------------------------------------------------------------
export const SYMBOL_HOME = {
  runWithPool: RUNNER_REL,
  checkId: RUNNER_REL,
  validateDescriptor: 'scripts/lib/step/validate.js',
  assertDatabaseTarget: RUNNER_REL,
  openLedgerRow: 'scripts/lib/step/ledger.js',
  resolveConfig: 'scripts/lib/step/config.js',
  hoisted_above_gate: RUNNER_REL,
  STEP_CTX_KEYS: RUNNER_REL,
  measureInputGuards: RUNNER_REL,
  measureProducerPins: RUNNER_REL,
  isIngestStep: RUNNER_REL,
  isMultiPrimary: RUNNER_REL,
  assertRequirements: RUNNER_REL,
  probeRequirement: RUNNER_REL,
  assertWritePrivileges: 'scripts/lib/step/write.js',
  runWritePlan: RUNNER_REL,
  write_plan: RUNNER_REL,
  report_check: RUNNER_REL,
  records_meta: RUNNER_REL,
  buildAuditTable: 'scripts/lib/step/verdict.js',
  deriveVerdict: 'scripts/lib/step/verdict.js',
  checks_failed: RUNNER_REL,
  finalizeLedgerRow: 'scripts/lib/step/ledger.js',
  emitSummary: 'scripts/lib/pipeline.js',
  withAdvisoryLock: 'scripts/lib/pipeline.js',
  advisory_lock_held_elsewhere: RUNNER_REL,
  selectMode: 'scripts/lib/step/staleness.js',
  ledgerGatedSkip: 'scripts/lib/step/staleness.js',
  preAcquisitionDecision: 'scripts/lib/step/staleness.js',
  ingestPrimaries: RUNNER_REL,
  aggregatePrimaries: RUNNER_REL,
  runIngestPhase: RUNNER_REL,
  runEnrichPhase: RUNNER_REL,
  seamOwned: RUNNER_REL,
  targetIsEmpty: 'scripts/lib/step/staleness.js',
  resolveOverrides: 'scripts/lib/step/staleness.js',
  notLookedReasons: 'src/tests/helpers/step-validate-run.ts',
  detectInterruptedRetraction: 'scripts/lib/step/staleness.js',
  standardSignals: 'scripts/analysis/step-validate.mjs',
  standardFailures: 'scripts/analysis/gates/compute-literals.mjs',
  tableDataRows: 'scripts/analysis/gates/markdown-table.mjs',
  ledgerTableRows: 'scripts/analysis/gates/markdown-table.mjs',
  stageAwaitsCaptures: 'scripts/analysis/step-validate.mjs',
  rowBlocks: 'scripts/analysis/step-validate.mjs',
  checkPreservedInComputeHasWhy: 'scripts/analysis/step-validate.mjs',
  undeclaredPinItems: 'scripts/analysis/gates/witness.mjs',
  installBeforeImageSandbox: 'src/tests/setup.ts',
  writeBeforeImage: 'scripts/lib/step/write.js',
  joinUpdate: RUNNER_REL,
  buildMatchSql: RUNNER_REL,
  pre_acquisition: 'scripts/lib/step/staleness.js',
  logic_variables: 'scripts/lib/step/config.js',
  pipeline_runs: 'scripts/lib/step/ledger.js',
};

// Hand-written, locked: the script each named CLI flag belongs to. The flag must occur in that script.
export const FLAG_HOME = {
  '--write': 'scripts/generate-step-handbook.mjs',
  '--check': 'scripts/generate-step-handbook.mjs',
  '--step': 'scripts/analysis/step-validate.mjs',
  '--fast': 'scripts/analysis/step-validate.mjs',
  '--all': 'scripts/analysis/step-validate.mjs',
  '--staged': 'scripts/analysis/step-validate.mjs',
  '--replay-all': 'scripts/analysis/capture-step-golden.js',
  '--replay': 'scripts/analysis/capture-step-golden.js',
};

// ---------------------------------------------------------------------------
// §1 prose (hand-written, locked). `{{SHAPES}}` is filled from the parsed dispatch.
// ---------------------------------------------------------------------------
const SECTION_1 = `## 1. How a step is built, run, read and written

This section is the map for diagnosis. Tables 1a and 1b are generated from the runner code and the real descriptors on every commit; the prose is hand-written, and every symbol, path, flag and invariant number in it is checked against the code by the generator.

**Where a step lives.** A step's slug is its key in \`scripts/manifest.json\` \`scripts\` and its descriptor's \`identity.name\`. The manifest entry's \`file\` is the shell. File names are hyphenated and need not equal the slug (slug \`parcels\` is \`scripts/load-parcels.js\`). The descriptor sits beside the shell with \`.js\` replaced by \`.descriptor.json\`: data only, answering all 20 categories of \`scripts/steps/_schema/step.schema.json\`. The compute module is \`scripts/lib/compute/<shell file name>\` and holds the domain logic. The shell only requires the two and exports \`pipeline.step(descriptor, compute)\`. The quality ASSERT and RECORDER steps live in \`scripts/quality/\` and require \`../lib/compute/\`. Golden captures use the slug: \`docs/reports/golden/<slug>/\` (\`pre/\`, \`post/\`, \`recapture.json\`, \`explained-diffs.json\`). Table 1b lists every step's real paths.

**How a run goes.** Everything below is in \`scripts/lib/step/index.js\` unless another file is named.

1. \`pipeline.step(descriptor, compute)\` validates the descriptor (\`validateDescriptor\`) and returns a runnable whose \`run()\` calls \`runWithPool\`.
2. \`runWithPool\` checks the database target (\`assertDatabaseTarget\`) and, when standalone, opens the \`pipeline_runs\` row (\`openLedgerRow\`); inside a chain, \`run-chain.js\` owns that row.
3. Config is resolved by \`resolveConfig\` (\`scripts/lib/step/config.js\`). It runs above the lock when the descriptor sets \`config.hoisted_above_gate\`, otherwise inside it. A missing \`logic_variables\` row throws, and the run fails.
4. It takes the transaction-scoped advisory lock on \`identity.lock\` (\`withAdvisoryLock\`). If another process holds it, the run self-skips with reason \`advisory_lock_held_elsewhere\`.
5. It builds the compute context. Its keys are a closed list (\`STEP_CTX_KEYS\`); a test harness may set only those keys.
6. It measures the input guards and producer pins (\`measureInputGuards\`, \`measureProducerPins\`). A halt runs no phase and no compute; its errored FAIL row makes the verdict FAIL.
7. It dispatches on \`execution.shape\`: the first predicate in table 1a that matches picks the phase. The shapes are {{SHAPES}}. The archetype (\`identity.archetype\`) decides which descriptor fields are required or forbidden; it does not pick the phase. With no shape, \`isIngestStep\` infers an INGESTOR when the descriptor writes, has a \`pre_acquisition\` trigger and names an external with a URL. Any other step without a shape gets no phase.
8. The phase owns the I/O. It probes \`guards.requires\` (\`assertRequirements\`; the ingest phases do not call it), checks write privileges (\`assertWritePrivileges\` in \`scripts/lib/step/write.js\`), decides its own mode or skip (table 1a, column "Mode / skip"), reads, calls the compute module's named hooks (table 1a, column "Reads off the compute module"), writes (\`scripts/lib/step/write.js\`) and writes before-images (\`writeBeforeImage\` in \`scripts/lib/step/write.js\`; \`scripts/lib/step/reset.js\` reuses it on the \`recovery.reset\` path). It hands what it acquired and wrote back into the context.
9. Then, for every step that did not halt (with a phase or without one), the runner calls the compute module's main function once: \`compute(ctx)\`. This is where checks are measured. Compute reports each check value with \`ctx.report(checkId, value)\`; an id the descriptor does not declare throws. A returned \`observations\` object is ignored; the return value carries only \`records_meta\`, counters and an optional \`write_plan\`.
10. \`runWritePlan\` executes a returned \`write_plan\` (R-CD), one autocommit statement per row, and reports the outcome to the plan's \`report_check\`.
11. \`buildAuditTable\` (\`scripts/lib/step/verdict.js\`) turns the reported values into audit rows: FAIL rows go to \`errors[]\`, WARN rows to \`warnings[]\`, and \`deriveVerdict\` gives the verdict. \`checks_failed\` is the length of \`errors[]\`. The run status follows the verdict, the summary is emitted (\`emitSummary\`) and the run row is closed (\`finalizeLedgerRow\`).

**Compute purity.** Compute receives the context and returns data. It never opens a transaction, writes, reads the environment, takes a lock, logs to a side channel or decides the verdict. An ASSERT may read \`ctx.pool\` read-only over declared relations (R-CA (i)). Gate E (\`scripts/analysis/gates/compute-purity.mjs\`, purity codes PURITY-G0…PURITY-G13) and the ast-grep rules in \`scripts/ast-grep-rules/compute-shape.yml\` check this.

**Where to find a step's reads and writes.**

| What | Declared in the descriptor | Witnessed by |
|---|---|---|
| Acquisition reads (tables and sources compute works from) | \`inputs.reads\` | #44 (a) in \`step-validate\` |
| Measurement reads (check SQL, emits) | \`checks[].reads\` | #44 (a) |
| Write targets, columns, discipline | \`outputs.writes[]\` (\`write_discipline\` per target) | #44, the golden captures |
| Statement counts per mode | \`outputs.write_inventory.by_mode\` | #44 (c) |
| Version pins on producers | \`staleness.pins\` | #44 (h) |
| What a write invalidates downstream | \`outputs.invalidates[]\` | #44 (i) |
| Required extensions, triggers, RLS posture | \`guards.requires\` | runtime probe (\`probeRequirement\`, \`assertWritePrivileges\`) |
| Logic variables | \`config\` | \`logic_variables\` rows; the admin Control Panel |

Run \`node scripts/analysis/step-validate.mjs --step=<slug> --fast\` to see the scorecard, the #44 WITNESS rows (declared vs traced) and the V3 label. The admin pipeline page shows the same step's registry, table map, telemetry and variable badges, all derived from the descriptor. The step's owner spec (from \`docs/specs/00-architecture/00_system_map.md\`) lists its Target Files.
`;

// Hand-written, locked: the order §1 states, as anchors that must occur in runWithPool in this order.
export const RUN_ORDER = [
  ['assertDatabaseTarget(pool, descriptor)', 'step 2: database target'],
  ['openLedgerRow(pool, slug)', 'step 2: run row'],
  ['pipeline.withAdvisoryLock(pool, descriptor.identity.lock', 'step 4: advisory lock on identity.lock'],
  ['measureInputGuards(pool, descriptor)', 'step 6: input guards'],
  ['measureProducerPins(pool, descriptor', 'step 6: producer pins'],
  ['if (inputGuard.halt) {', 'step 6: a halt dispatches nothing'],
  ['} else if (is', 'step 7: shape dispatch'],
  ['inputGuard.halt ? null : await runnable.compute(stepCtx)', 'step 9: compute called once after the phase, skipped on a halt'],
  ['await runWritePlan(pool, computeResult', 'step 10: write plan after compute'],
  ['buildAuditTable(descriptor', 'step 11: audit table'],
  ['checks_failed: built.errors.length', 'step 11: checks_failed is the FAIL count'],
];

// ---------------------------------------------------------------------------
// §5 (hand-written, locked). Symptom → where to look. Each row cites the rule(s) and a real Defect Ledger id
// (docs/reports/defect-ledger.md; an id on rule-map meta.pending_integration.defects is allowed before its branch
// lands). A code pointer that exists only on the pending branch is marked † in the text.
// ---------------------------------------------------------------------------
const DIAGNOSIS = [
  ['Every counter and check value reads 0 on a multi-primary INGESTOR', 'The compute reads the flat `runIngestPhase` ctx. Read `acquired.primaries[id]` and `written.by_target.<table>` (`ingestPrimaries`, `aggregatePrimaries` in `scripts/lib/step/index.js`); build the lock\'s ctx through the real dispatch.', ['R-EW', 'R-DX'], ['COA-D13']],
  ['The rerun proof refuses the capture: `zero_writes` false, N rows rewritten', 'A `written:"seen"` column touches every fed key. Declare `idempotent_rerun: "declared_drift"`; `scripts/analysis/capture-rerun-proof.js` mode `seen_drift`.', ['R-EX', 'R-DZ'], ['COA-D14']],
  ['Writes succeed only as a role that bypasses RLS; another role writes 0 rows', 'The target table has RLS on and no policy. Declare `guards.requires: rls_bypass_or_policy`; `assertWritePrivileges` (`scripts/lib/step/write.js`) measures it, and the requirement\'s `on_missing` decides whether it refuses (`fail`) or only warns while the 0-row write proceeds.', ['R-CT'], ['LR-D7', 'LM-D12']],
  ['`written.e1.updated` is double the real row count', 'Both the seam and the pass report the same rows; counters belong to whoever wrote them (`seamOwned` in `runEnrichPhase`).', ['R-AT'], ['RV-D4']],
  ['`checks_failed > 0` but there are no FAIL rows', 'FAIL and WARN must feed separate arrays: `buildAuditTable` (`scripts/lib/step/verdict.js`) pushes FAIL to `errors[]` and WARN to `warnings[]`, and `checks_failed` is the length of `errors[]` (`runWithPool`). A regression at either site brings back LPA-D6, which is fixed.', ['R-Q'], ['LPA-D6']],
  ['A run skipped (`skipped_content_hash`) and left an empty table empty', 'The skip did not probe the target (`targetIsEmpty`).', ['R-DD'], ['LBMA-D7']],
  ['A skipped or deferred run shows no reason in its audit table', 'No `when:"pre"` check, or no `deferred_to_full` terminal.', ['R-P', 'R-BU'], ['LPA-D4', 'EP-D19']],
  ['A check reports clean but never looked (its value is `undefined`)', 'The value is never populated in ctx (`resolveOverrides`). In tests, a live run must prove the child completed (`notLookedReasons` in `src/tests/helpers/step-validate-run.ts`).', ['R-CP'], ['LM-D14']],
  ['A declared variable silently runs on its seed default', '`resolveConfig` (`scripts/lib/step/config.js`) throws on a missing `logic_variables` row, so a step that runs on a seed default is not on the library path: check its shell.', ['R-G'], ['LM-D15']],
  ['ENRICHER `last_heartbeat_at` stays NULL; no `lock_timeout` is set', 'Interval keys hard-coded to another step\'s slug; intervals come from the descriptor\'s `execution.*_from_config` variables.', ['R-AK'], ['ER-D1']],
  ['After a killed FULL run the table is half-retracted and the next run says "unchanged"', 'Crash posture: `detectInterruptedRetraction` must be reachable in your phase; declare `recovery.interrupted`.', ['Rule-12', 'R-B'], ['LW-D20']],
  ['A FAIL is reported after rows were already written', 'Phase order: the owner spec\'s "before X" has no `pre_write` check with an `order_guarantee`.', ['Rule-11'], ['LR-D9']],
  ['`data_hash` differs between machines', 'A zone-less timestamp parsed in the process time zone.', ['R-EV', 'R-CE'], ['COA-D11']],
  ['A producer contract reads an old run', 'Status filter (baselines accept completed/completed_with_warnings; seam reads accept every finished status) or a bare-slug vs chain-prefixed ledger name.', ['R-CB', 'R-BG'], ['EC-D10']],
  ['Gate E reads zero, yet a config value still decides the output', 'A local alias of `ctx.config` inside a check body (PURITY-G7, a Gate E code, not scorecard G7).', ['R-DC'], ['LCN-D5']],
  ['Rule 4 / G-2 flags `preserved-in-compute` Intent Ledger rows', 'Each such row must name where its rule is written (a check `why`, a `checks[]` citation or `notes.json`); `checkPreservedInComputeHasWhy` in `scripts/analysis/step-validate.mjs`.', ['Rule-4'], ['LW-D21', 'CC-D4']],
  ['A tunable cap, bind-limit formula or cadence is a literal in the step', 'Make it a logic variable; derive batch from the 65,535-parameter limit.', ['Rule-3', 'R-CU'], ['CCS-D3', 'CCCE-D2']],
];

// Validator messages that point straight at a rule (no single defect behind them).
const MESSAGES = [
  ['`standard=V2 (fails: …)`', 'The numbered R-EY conditions in the message. `standardSignals` in `scripts/analysis/step-validate.mjs` builds them; `standardFailures` in `scripts/analysis/gates/compute-literals.mjs` answers condition (1); `scripts/analysis/gates/v3-label.mjs` holds the label.', ['R-EY']],
  ['A G3 point lost on a plain table header, or G-2 reading a header as a row', '`tableDataRows` / `ledgerTableRows` in `scripts/analysis/gates/markdown-table.mjs`. No Defect Ledger id was filed for this; evidence is in the R-FA and R-FB rows.', ['R-FA', 'R-FB']],
  ['`#44 (h) h:undeclared`, or `OWED`', 'An acquisition read of another step\'s `run_at` column with no pin (`undeclaredPinItems` in `scripts/analysis/gates/witness.mjs`); OWED while the producer still awaits captures.', ['R-DI', 'R-ES']],
  ['`i:unresolved:pin` / `i:fill-once`', 'A `by:"pin"` invalidator with no reader pin; a write-once column with no invalidator (`scripts/analysis/gates/witness.mjs`).', ['R-DO', 'R-ER']],
  ['Gate F scores a pending step below floor', 'Does its declared stage await captures (`stageAwaitsCaptures` in `scripts/analysis/step-validate.mjs`)?', ['R-EF']],
  ['`#38` RED: no `recapture.json` entry', 'Add the capture\'s entry to `docs/reports/golden/<slug>/recapture.json` (`via` plain, env or bracket, every bracket flag named). `node scripts/analysis/capture-step-golden.js --replay-all` then prints the exact retake; it reads existing entries and cannot create one. An orphan or malformed entry is RED too (`scripts/analysis/gates/captures.mjs`).', ['R-CZ']],
  ['G8 diff unexplained', 'Explain it only in `docs/reports/golden/<slug>/explained-diffs.json`, citing a Defect Ledger id.', ['R-DA']],
  ['Pre-commit refuses an early ① with no descriptor', '`rowBlocks` (`scripts/analysis/step-validate.mjs`) exempts a pending row whose descriptor file is absent; if it still blocks, the descriptor exists, the row is not pending, or the row sets `blocking`.', ['R-DU']],
  ['`bind message has N parameter formats`', 'Batch × bound columns exceeds 65,535.', ['R-CU']],
  ['Before-image files appear under `docs/reports/golden/*/before-image/` after tests', 'The test sandbox `installBeforeImageSandbox` in `src/tests/setup.ts`.', ['R-CO']],
];

// ---------------------------------------------------------------------------
// Glossary (hand-written, locked like the prose).
// ---------------------------------------------------------------------------
const GLOSSARY = [
  ['slug', 'A step\'s name: its `scripts/manifest.json` key and `identity.name`. Not its file name (table 1b).'],
  ['archetype vs shape', '`identity.archetype` (INGESTOR, LINK, MATCHER, ENRICHER, MATERIALIZER, BACKFILL, ASSERT, RECORDER) is what the step is; it selects required and forbidden descriptor fields and is checked against the census. `execution.shape` is which runner phase executes it (table 1a). A MATCHER has shape `cascade`; a RECORDER may have no shape.'],
  ['phase', 'One of the runner functions in table 1a that owns a step\'s reads, writes and transactions.'],
  ['compute hook', 'A named function or value on the compute module that a phase calls or reads (for example `compute.buildMatchSql`); the main function is called once after the phase.'],
  ['PH-0 … PH-8', 'Spec 121 §3 assessment phases used in Spec 123: PH-0 is the boundary freeze (it reads every write and derives the archetype), PH-4 the risk class. Not the programme stages P0–P3.'],
  ['① ② ③', 'The three conversion commits: ① red suite + descriptor, ② compute + runner (the shell swap), ③ cutover into `converted[]` (`scripts/steps/_schema/converted.json`).'],
  ['stage', 'A pending step\'s declared progress in `converted.json` `pending[]` (`red_suite` … `shape_clean`); it decides which gates cannot yet be answered.'],
  ['RE-FREEZE #N', 'A numbered, reviewed revision of the frozen step vocabulary (`scripts/steps/_schema/step.schema.json`, `template-freeze.json`). A field is added or deleted only by one.'],
  ['#NN', 'A `step-validate` fast invariant, by number (for example #44 the read/write witness, #54 swap order). Every number cited in the hand-written parts exists in `scripts/analysis/step-validate.mjs` or its gates.'],
  ['Gate A … K, V', 'Lettered R-BA gates (A…K, plus V for the five words), implemented in `scripts/analysis/gates/` or in `scripts/analysis/step-validate.mjs` (gates H, K and V live there). Gate E is compute purity, Gate F the score floor. Not the scorecard.'],
  ['PURITY-G0 … PURITY-G13', 'Gate E compute-purity finding codes. Not rule ids; never the scorecard gates.'],
  ['SCORECARD-G0 … SCORECARD-G9', 'Spec 123 scorecard gates G0–G9 (G7 test adequacy, G8 differential); rule ids `G0`…`G9` carry these aliases.'],
  ['V3 (standard) vs V3 (vocabulary)', '`standard=V3` is the McDonald\'s Airtight V3 label (R-EY). The rule id `V3` (alias SPEC122A-V3) is the Spec 122a `guards.schema_drift` vocabulary row.'],
  ['SPEC121-M1 … SPEC121-M14', 'Spec 121 cadence items, retired as a set. `M14` also names an unrelated spec-move id in Spec 124; the alias SPEC121-M14 means the Spec 121 item.'],
  ['five words', 'R-BA gate V (in `scripts/analysis/step-validate.mjs`): STANDARDIZED, OBSERVABLE, SCALABLE, UNDERSTANDABLE, ACCURATE, each PASS or FAIL from the mapped gates.'],
  ['bracket', 'A capture taken inside a perturbation (a forced cohort, delete-and-reinsert or derived-status), so a guarded write path writes something; replayed only through the same bracket (#38).'],
  ['OWED', 'Printed by #44 (h) when a reader\'s pin is due but its producer still awaits captures (R-ES); not a failure until the producer swaps.'],
  ['class-A', 'Spec 123 risk class A (PH-4): the highest test intensity; its behaviours need a both-directions lock.'],
  ['LDG-10, EP-PIN-D17', 'Programme items in `scripts/steps/_schema/programme-items.json` (cutover prerequisites).'],
  ['W4A-Rn', 'Wave-4 assessment rulings drafted outside the register; their register rows are owed (rule-map `meta.register_rows_owed`).'],
  ['lock / lock-db / check / hook', 'Enforcement kinds in the rule map. A lock is a test under `src/tests/` run by `npm test` that names the rule id (or a declared alias) and asserts it; a lock-db is the same but a `*.db.test.ts` run only by `npm run test:db`; a check is a `step-validate` invariant or gate token; a hook is a `.husky` hook.'],
  ['Intent Ledger', 'The table in a step\'s assessment report listing each behaviour of the legacy step and its disposition (kept, fixed, retired, preserved-in-compute). Scored by scorecard G3; G-2 reads it.'],
  ['G-2', 'Spec 124 GAP G-2 (Rule 4): every preserved-in-compute Intent Ledger row names where its rule is written (`checkPreservedInComputeHasWhy`). Not scorecard G2.'],
  ['§R Reflection', 'The closing section of a step\'s assessment report recording what the conversion taught; scorecard G9 checks it exists.'],
  ['seam', 'A declared hand-off between steps or between compute and the runner: cross-step seams are producer → consumer edges (`inputs.reads.steps`); the ENRICHER write seam is `ctx.exec` / `ctx.joinUpdate`, where the runner, not compute, issues the DML.'],
  ['sources chain', 'The `sources` chain in `scripts/manifest.json` `chains`: the ordered ingest-and-derive steps run by `run-chain.js`; other chains (for example `coa`) are listed beside it.'],
  ['P0 … P3', 'Programme stages of the step-optimisation programme (Spec 122/123). Not the assessment phases PH-0 … PH-8.'],
  ['†', 'An id or code pointer that lands with another branch (rule-map `meta.pending_integration`).'],
];

// ---------------------------------------------------------------------------
// Generated from code: the dispatch.
// ---------------------------------------------------------------------------
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

function functionBody(src, name) {
  const re = new RegExp(`^(?:async )?function ${name}\\(`, 'm');
  const m = re.exec(src);
  if (!m) return null;
  const rest = src.slice(m.index + 1);
  const next = /^(?:async )?function |^module\.exports/m.exec(rest);
  return src.slice(m.index, next ? m.index + 1 + next.index : src.length);
}

const MODE_DECIDERS = [
  ['resolveLinkGate', 'resolveLinkGate → staleness.selectMode'],
  ['staleness.ledgerGatedSkip', 'staleness.ledgerGatedSkip'],
  ['staleness.preAcquisitionDecision', 'staleness.preAcquisitionDecision'],
  ['staleness.allPrimariesDecision', 'staleness.allPrimariesDecision'],
  ['resolveRunMode', 'resolveRunMode'],
];

/** Parse runWithPool's dispatch from the runner source. Throws by name if the run order §1 states is not the code's. */
export function readDispatch(root = ROOT, srcOverride = null) {
  const src = srcOverride ?? fs.readFileSync(path.join(root, RUNNER_REL), 'utf8');
  const shapeOf = {};
  for (const m of src.matchAll(/^function (is[A-Za-z]+Step)\(descriptor\) \{/gm)) {
    const body = functionBody(src, m[1]);
    const s = /shape === '([a-z_]+)'/.exec(body);
    if (!s) throw new Error(`[step-handbook] ${RUNNER_REL} ${m[1]} names no execution.shape`);
    const simple = /^function [A-Za-z]+\(descriptor\) \{\s*return Boolean\(descriptor\.execution && descriptor\.execution\.shape === '[a-z_]+'\);\s*\}\s*$/.test(stripComments(body).trim());
    shapeOf[m[1]] = { shape: s[1], infers: /return descriptor\.outputs !== 'none'/.test(body), simple };
  }
  const pool = functionBody(src, 'runWithPool');
  if (!pool) throw new Error(`[step-handbook] ${RUNNER_REL} has no runWithPool`);
  let at = -1;
  for (const [anchor, what] of RUN_ORDER) {
    const i = pool.indexOf(anchor, at + 1);
    if (i < 0) throw new Error(`[step-handbook] §1 run order drifted: "${what}" (anchor \`${anchor}\`) not found in runWithPool after the previous step`);
    at = i;
  }
  if (!/report\(checkId, observation\) \{\s*if \(!declared\.has\(checkId\)\)/.test(pool)) throw new Error('[step-handbook] §1 step 9 drifted: ctx.report no longer refuses an undeclared check id');
  const order = [];
  const code = stripComments(pool);
  for (const m of code.matchAll(/else if \((is[A-Za-z]+Step)\(descriptor\)\) \{/g)) {
    const win = code.slice(m.index, m.index + 900);
    const multi = /await \(isMultiPrimary\(descriptor\) \? ([A-Za-z]+) : ([A-Za-z]+)\)\(/.exec(win);
    const single = /= await (run[A-Za-z]+Phase)\(/.exec(win);
    const phases = multi ? [multi[2], multi[1]] : single ? [single[1]] : null;
    if (!phases) throw new Error(`[step-handbook] dispatch branch ${m[1]} calls no phase`);
    if (!shapeOf[m[1]]) throw new Error(`[step-handbook] dispatch branch ${m[1]} has no shape predicate`);
    order.push({ predicate: m[1], ...shapeOf[m[1]], phases });
  }
  if (!order.length) throw new Error('[step-handbook] no dispatch branches found in runWithPool');
  // A hook a phase reaches through a helper counts too: follow calls into every other top-level function of the
  // runner whose signature takes `compute`, transitively (verify-12b E28: materializeRowsArm, runBackfillFullRecompute,
  // primaryMatchBinds, makePreWriteGate …). Phase functions are not followed into each other.
  const phaseNames = new Set(order.flatMap((x) => x.phases));
  const helpers = [...src.matchAll(/^(?:async )?function ([A-Za-z_][A-Za-z0-9_]*)\(([^)]*)\)/gm)]
    .filter((m) => /\bcompute\b/.test(m[2]) && !phaseNames.has(m[1]) && m[1] !== 'runWithPool' && m[1] !== 'step')
    .map((m) => m[1]);
  const reach = (start) => {
    const seen = new Set();
    const todo = [start];
    let code = '';
    while (todo.length) {
      const f = todo.pop();
      const c = stripComments(functionBody(src, f) || '');
      code += `\n${c}`;
      for (const h of helpers) if (!seen.has(h) && h !== start && new RegExp(`\\b${h}\\(`).test(c)) { seen.add(h); todo.push(h); }
    }
    return { code, via: [...seen].sort() };
  };
  const hooksIn = (c) => [...new Set([...c.matchAll(/\bcompute\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((x) => x[1]))].sort();
  const phases = {};
  for (const o of order) for (const p of o.phases) {
    if (!functionBody(src, p)) throw new Error(`[step-handbook] phase ${p} not found in ${RUNNER_REL}`);
    const own = stripComments(functionBody(src, p));
    const { code, via } = reach(p);
    const deciders = MODE_DECIDERS.filter(([tok]) => own.includes(`${tok}(`)).map(([, label]) => label);
    const calls = [...phaseNames].filter((q) => q !== p && own.includes(`await ${q}(`));
    phases[p] = { hooks: hooksIn(code), deciders, calls, via };
  }
  // Runner level (any shape): what runWithPool itself, and the compute-taking helpers it calls, read off the module.
  const rw = reach('runWithPool');
  const runner = { hooks: hooksIn(rw.code), via: rw.via };
  return { order, phases, runner };
}

/** Every manifest step that has a descriptor, classified by the runner's own exported predicates. */
export function readSteps(root = ROOT, dispatch = readDispatch(root)) {
  const req = createRequire(pathToFileURL(path.join(root, 'package.json')).href);
  const runner = req(path.join(root, RUNNER_REL));
  // An exported predicate is called as-is; an unexported one is used only when its body is exactly
  // `return Boolean(descriptor.execution && descriptor.execution.shape === '<shape>')` (checked in readDispatch).
  const pred = {};
  for (const o of dispatch.order) {
    if (typeof runner[o.predicate] === 'function') pred[o.predicate] = runner[o.predicate];
    else if (o.simple) pred[o.predicate] = (d) => Boolean(d.execution && d.execution.shape === o.shape);
    else throw new Error(`[step-handbook] ${o.predicate} is neither exported by ${RUNNER_REL} nor a plain shape test`);
  }
  for (const o of dispatch.order) {
    const probe = { execution: { shape: o.shape }, outputs: 'none', inputs: { reads: {} }, staleness: {} };
    if (pred[o.predicate](probe) !== true) throw new Error(`[step-handbook] ${o.predicate} does not accept shape "${o.shape}" (parsed vs executed disagree)`);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(root, MANIFEST_REL), 'utf8'));
  const conv = JSON.parse(fs.readFileSync(path.join(root, CONVERTED_REL), 'utf8'));
  const pending = new Map((conv.pending || []).map((p) => [p.file, p.stage]));
  const converted = new Set(conv.converted || []);
  const out = [];
  for (const [slug, e] of Object.entries(manifest.scripts || {})) {
    if (!e || typeof e.file !== 'string' || !e.file.endsWith('.js')) continue;
    const descRel = e.file.replace(/\.js$/, '.descriptor.json');
    if (!fs.existsSync(path.join(root, descRel))) continue;
    const d = JSON.parse(fs.readFileSync(path.join(root, descRel), 'utf8'));
    const shell = fs.readFileSync(path.join(root, e.file), 'utf8');
    const cm = /require\('(\.{1,2}\/lib\/compute\/[^']+)'\)/.exec(shell);
    const wired = /pipeline\.step\(descriptor, compute\)/.test(shell);
    const guess = `scripts/lib/compute/${path.posix.basename(e.file)}`;
    const computeRel = cm ? path.posix.join(path.posix.dirname(e.file), cm[1]) + (cm[1].endsWith('.js') ? '' : '.js') : (fs.existsSync(path.join(root, guess)) ? guess : null);
    if (wired && (!computeRel || !fs.existsSync(path.join(root, computeRel)))) throw new Error(`[step-handbook] ${e.file} calls pipeline.step but requires no compute module under lib/compute/`);
    if (d.identity.name !== slug) throw new Error(`[step-handbook] ${descRel} identity.name "${d.identity.name}" is not its manifest slug "${slug}"`);
    const hit = dispatch.order.find((o) => pred[o.predicate](d));
    let phase = 'no phase';
    if (hit) phase = hit.phases.length > 1 && runner.isMultiPrimary(d) ? hit.phases[1] : hit.phases[0];
    const declared = d.execution && d.execution.shape;
    const stage = converted.has(e.file) ? 'converted' : pending.has(e.file) ? `pending: ${pending.get(e.file)}` : 'not registered';
    out.push({ slug, archetype: d.identity.archetype, shape: declared || (hit ? `none (inferred ${hit.shape})` : 'none'), phase, wired, shell: e.file, descriptor: descRel, compute: computeRel, stage });
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

// ---------------------------------------------------------------------------
// Fact locks for the hand-written parts.
// ---------------------------------------------------------------------------
const PLACEHOLDER = /[<*{…]/;
function backticked(text) {
  return [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}

/** Findings for every symbol, path, flag and invariant number the hand-written text names. Empty = all hold. */
export function factFindings(texts, root = ROOT, opts = {}) {
  const out = [];
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
  const exists = (rel) => fs.existsSync(path.join(root, rel));
  const symbolHome = opts.symbolHome || SYMBOL_HOME;
  const flagHome = opts.flagHome || FLAG_HOME;
  const corpus = opts.checkCorpus || readCheckCorpus(root);
  const codeOf = (rel) => (/\.(c|m)?[jt]s$/.test(rel) ? stripComments(read(rel)) : read(rel));
  const flagRe = (flag) => new RegExp(`(?<![A-Za-z0-9-])${flag.replace(/-/g, '\\-')}(?![A-Za-z0-9-])`);
  for (const t of texts) {
    for (const tok of backticked(t)) {
      if (/^--[a-z]/.test(tok)) {
        const flag = tok.split('=')[0];
        const home = flagHome[flag];
        if (!home) out.push(`flag ${flag} has no FLAG_HOME entry`);
        else if (!exists(home) || !flagRe(flag).test(read(home))) out.push(`flag ${flag} does not occur in ${home}`);
        continue;
      }
      if (/^(scripts|src|docs|\.husky)\//.test(tok)) {
        if (!PLACEHOLDER.test(tok) && !/\s/.test(tok) && !exists(tok)) out.push(`path ${tok} does not exist`);
        continue;
      }
      for (const m of tok.matchAll(/--[a-z][a-z-]*/g)) {
        const home = flagHome[m[0]];
        if (!home) out.push(`flag ${m[0]} has no FLAG_HOME entry`);
        else if (!exists(home) || !flagRe(m[0]).test(read(home))) out.push(`flag ${m[0]} does not occur in ${home}`);
      }
      for (const id of tok.replace(/--[a-z][a-z-]*/g, ' ').split(/[^A-Za-z0-9_]+/)) {
        if (!(/^[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*$/.test(id) || /^[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+$/.test(id))) continue;
        const home = symbolHome[id];
        if (!home) { if (/[A-Z]/.test(id)) out.push(`symbol ${id} has no SYMBOL_HOME entry`); continue; }
        if (!exists(home) || !new RegExp(`(?<![A-Za-z0-9_$])${id}(?![A-Za-z0-9_$])`).test(codeOf(home))) out.push(`symbol ${id} does not occur outside comments in ${home}`);
      }
    }
    for (const m of t.matchAll(/#(\d{2})\b/g)) {
      if (!corpus.includes(`#${m[1]}`) && !new RegExp(`\\bid: ${m[1]}\\b`).test(corpus)) out.push(`fast invariant #${m[1]} is not in step-validate or its gates`);
    }
  }
  const prog = exists(PROGRAMME_REL) ? read(PROGRAMME_REL) : '';
  for (const id of ['LDG-10', 'EP-PIN-D17']) if (!prog.includes(`"id": "${id}"`)) out.push(`programme item ${id} is not in ${PROGRAMME_REL}`);
  return [...new Set(out)];
}

/** The hand-written texts the fact lock reads (exported for the lock test). */
export function handWrittenTexts(shapes = '') {
  return [
    SECTION_1.replace('{{SHAPES}}', shapes),
    ...GLOSSARY.map(([t, d]) => `${t} ${d}`),
    ...DIAGNOSIS.map((r) => `${r[0]} ${r[1]}`),
    ...MESSAGES.map((r) => `${r[0]} ${r[1]}`),
  ];
}

// ---------------------------------------------------------------------------
// Rendering.
// ---------------------------------------------------------------------------
function tagId(map, r) {
  const pending = new Set(map.meta.pending_integration.rules);
  const alias = (r.aliases || []).length ? ` (${r.aliases.join(', ')})` : '';
  return `\`${r.id}\`${pending.has(r.id) ? '†' : ''}${alias}`;
}

function renderIds(map, lineId) {
  const rs = map.rules.filter((r) => r.handbook_line === lineId);
  const live = rs.filter((r) => IN_FORCE.includes(r.status)).map((r) => tagId(map, r));
  const old = rs.filter((r) => !IN_FORCE.includes(r.status)).map((r) => tagId(map, r));
  return [live.length ? live.join(' ') : '', old.length ? `history: ${old.join(' ')}` : ''].filter(Boolean).join(' · ');
}

function renderLine(map, l) {
  return `- **${l.id}** ${l.text}\n  *Why:* ${l.why}\n  Rules: ${renderIds(map, l.id)}\n`;
}

function renderSection(map, s, level) {
  const out = [`${'#'.repeat(level)} ${s.title}`, '', `${s.intro}`, ''];
  for (const l of map.lines.filter((x) => x.section === s.id)) out.push(renderLine(map, l));
  return out.join('\n');
}

function assertResolves(map, defectLines) {
  const ruleIds = new Set(map.rules.map((r) => r.id));
  const pendingDefects = new Set(map.meta.pending_integration.defects);
  for (const [symptom, , rules, defects] of DIAGNOSIS) {
    for (const id of rules) if (!ruleIds.has(id)) throw new Error(`diagnosis "${symptom}": rule ${id} is not in rule-map.json`);
    if (!defects.length) throw new Error(`diagnosis "${symptom}": no Defect Ledger id`);
    for (const d of defects) if (!defectLines.has(d) && !pendingDefects.has(d)) throw new Error(`diagnosis "${symptom}": defect ${d} is not in docs/reports/defect-ledger.md`);
  }
  for (const [msg, , rules] of MESSAGES) for (const id of rules) if (!ruleIds.has(id)) throw new Error(`message "${msg}": rule ${id} is not in rule-map.json`);
}

function shapeTable(dispatch, steps) {
  const rows = ['| # | Predicate | `execution.shape` | Phase | Mode / skip | Reads off the compute module | Steps |', '|---|---|---|---|---|---|---|'];
  const fmt = (xs) => (xs.length ? xs.map((x) => `\`${x}\``).join(', ') : '—');
  dispatch.order.forEach((o, i) => {
    o.phases.forEach((p, j) => {
      const ph = dispatch.phases[p];
      const users = steps.filter((s) => s.phase === p).map((s) => (s.wired ? s.slug : `${s.slug} (legacy shell)`));
      const multi = o.phases.length > 1 ? (j === 0 ? ', one primary' : ', several primaries (`isMultiPrimary`)') : '';
      const shapeCell = `\`${o.shape}\`${o.infers ? ' (or no shape: inferred)' : ''}${multi}`;
      const via = ph.calls.length ? ` (runs ${ph.calls.map((c) => `\`${c}\``).join(', ')} per primary)` : '';
      const helpersCell = ph.via.length ? ` via ${ph.via.map((h) => `\`${h}\``).join(', ')}` : '';
      rows.push(`| ${j === 0 ? i + 1 : ''} | ${j === 0 ? `\`${o.predicate}\`` : ''} | ${shapeCell} | \`${p}\`${via}${helpersCell} | ${fmt(ph.deciders)} | ${fmt(ph.hooks)} | ${users.length ? users.join(', ') : '—'} |`);
    });
  });
  const none = steps.filter((s) => s.phase === 'no phase').map((s) => (s.wired ? s.slug : `${s.slug} (legacy shell)`));
  rows.push(`| — | none matched | none | no phase: \`compute(ctx)\` then \`runWritePlan\` | — | main function only | ${none.length ? none.join(', ') : '—'} |`);
  const rv = dispatch.runner.via.length ? ` via ${dispatch.runner.via.map((h) => `\`${h}\``).join(', ')}` : '';
  rows.push(`| — | runner, any shape | any | \`runWithPool\`${rv} | — | ${fmt(dispatch.runner.hooks)} | every step |`);
  return rows.join('\n');
}

function stepTable(steps) {
  const rows = ['| Slug | Archetype | Shape | Phase | Shell | Descriptor | Compute | Stage |', '|---|---|---|---|---|---|---|---|'];
  for (const s of steps) {
    const phase = s.phase === 'no phase' ? 'no phase' : `\`${s.phase}\``;
    const cell = s.wired ? phase : `legacy shell runs; descriptor → ${phase}`;
    rows.push(`| ${s.slug} | ${s.archetype} | ${s.shape} | ${cell} | \`${s.shell}\` | \`${s.descriptor}\` | ${s.compute ? `\`${s.compute}\`` : '—'} | ${s.stage} |`);
  }
  return rows.join('\n');
}

export function render(map, defectLines, facts = {}) {
  assertResolves(map, defectLines);
  const dispatch = facts.dispatch || readDispatch(ROOT);
  const steps = facts.steps || readSteps(ROOT, dispatch);
  const shapes = dispatch.order.map((o) => `\`${o.shape}\``).join(', ');
  const findings = factFindings(handWrittenTexts(shapes), ROOT);
  if (findings.length) throw new Error(`[step-handbook] hand-written facts no longer match the code:\n  - ${findings.join('\n  - ')}`);

  const pendingD = new Set(map.meta.pending_integration.defects);
  const sec = (id) => map.sections.find((s) => s.id === id);
  const archetypeSections = map.sections.filter((s) => s.archetype);
  const crossSections = map.sections.filter((s) => s.id.startsWith('x-'));
  const u = unenforcedSummary(map);
  const ec = enforcementCounts(map);
  const byId = new Map(map.rules.map((r) => [r.id, r]));
  const defectCell = (d) => (pendingD.has(d) ? `${d}†` : `${d} (ledger l.${defectLines.get(d)})`);
  const out = [];
  out.push('# Step standard handbook');
  out.push('');
  out.push('<!-- GENERATED by `node scripts/generate-step-handbook.mjs --write`. Do not edit by hand: `--check` runs at pre-commit. -->');
  out.push('');
  out.push(`> **Authority.** ${map.meta.authority} is the authority. This handbook is the reading surface. If this page and a register row disagree, the register wins; fix the map or the generator. Specs ${map.meta.historical_design_records.join(', ').replace(/Spec /g, '')} are historical design records. (${map.meta.decided}.)`);
  out.push('');
  out.push('**What is generated and what is hand-written.**');
  out.push('');
  out.push(`- *Generated from the code* on every commit: §1 tables 1a and 1b (the dispatch order, each shape's predicate and phase, how the phase decides its mode, what it reads off the compute module, which steps use it, and every step's real file paths and stage). Source: \`${RUNNER_REL}\` (parsed, and its exported predicates run on every real descriptor), \`${MANIFEST_REL}\`, the descriptors and shells, \`${CONVERTED_REL}\`.`);
  out.push('- *Generated from data:* §2–§4, §6 and §7 from `scripts/steps/_schema/rule-map.json` (locked by `src/tests/handbook-rule-map.logic.test.ts`: every register id has a line, and every lock names a test file that mentions the rule id or alias); the §5 Defect Ledger line numbers from `docs/reports/defect-ledger.md`.');
  out.push('- *Hand-written and locked:* the §1 prose, the §5 tables and the glossary, in `scripts/generate-step-handbook.mjs`. What the lock checks, each time the generator runs: every backticked camelCase or snake_case identifier names an entry in `SYMBOL_HOME` and occurs as a whole token outside comments in that file; every backticked repo path exists; every backticked CLI flag occurs as a whole flag in its script (`FLAG_HOME`); every #NN is a step-validate fast invariant; the §1 run order occurs in that order in `runWithPool`; `ctx.report` refuses an undeclared id. It checks that names exist and the order holds, not what each sentence says the code does; a mismatch fails `--check` at pre-commit. The line texts in §2–§4 are hand-written in the rule map and checked only for their rule ids. Whether any prose explains the code well is still a human judgement.');
  out.push('');
  out.push('**How to read it.** Each line says what a step must declare or do, then why, then the rule ids it summarises (with an alias where an id collides with another name). Ids under "history" are superseded or retired and are listed only so old citations resolve. † marks an id or pointer that lands with another branch (' + map.meta.pending_integration.branch + '). Look an id up in Spec 124 §5 or the 124a LIVE REGISTER sections for the full text. Terms are defined in the glossary at the end.');
  out.push('');
  out.push('**Contents.** 1 How a step is built, run, read and written · 2 Every step · 3 By archetype · 4 Cross-cutting · 5 Symptom → where to look · 6 Rules with no or partial machine check · 7 History · Glossary');
  out.push('');
  out.push(SECTION_1.replace('{{SHAPES}}', shapes));
  out.push('**Table 1a: dispatch (generated).** `runWithPool` tries these in order; the first match runs. "Mode / skip" lists the shared deciders the phase calls. "Reads off the compute module" lists every `compute.<name>` the phase reads, in its own body or in a runner helper that receives `compute` (named after "via"). The last row is what the runner reads for every step.');
  out.push('');
  out.push(shapeTable(dispatch, steps));
  out.push('');
  out.push(`**Table 1b: every step (generated).** ${steps.length} manifest steps with a descriptor. "Phase" is what the runner's own predicates pick for the committed descriptor. "Legacy shell runs" marks a pending step whose shell does not yet call \`pipeline.step(descriptor, compute)\`: its descriptor is graded, but the runner does not run it until the ② shell swap.`);
  out.push('');
  out.push(stepTable(steps));
  out.push('');
  out.push(`## 2. ${sec('core').title}`);
  out.push('');
  out.push(sec('core').intro);
  out.push('');
  for (const l of map.lines.filter((x) => x.section === 'core')) out.push(renderLine(map, l));
  out.push('## 3. By archetype');
  out.push('');
  out.push('The archetype comes from `identity.archetype` (see `step-archetype-census.json`); it selects the required fields, and `execution.shape` selects the phase (§1). Every line in section 2 applies too.');
  out.push('');
  for (const s of archetypeSections) out.push(renderSection(map, s, 3));
  out.push('## 4. Cross-cutting');
  out.push('');
  for (const s of crossSections) out.push(renderSection(map, s, 3));
  out.push('## 5. Symptom → where to look');
  out.push('');
  out.push('Hand-written and locked: every symbol, path and flag below is checked against the code, and every defect id resolves in the Defect Ledger (line numbers generated).');
  out.push('');
  out.push('| Symptom | Look at | Rules | Defect |');
  out.push('|---|---|---|---|');
  for (const [symptom, look, rules, defects] of DIAGNOSIS) out.push(`| ${symptom} | ${look} | ${rules.join(', ')} | ${defects.map(defectCell).join(', ')} |`);
  out.push('');
  out.push('Validator messages that name their rule directly:');
  out.push('');
  out.push('| Message | Look at | Rules |');
  out.push('|---|---|---|');
  for (const [msg, look, rules] of MESSAGES) out.push(`| ${msg} | ${look} | ${rules.join(', ')} |`);
  out.push('');
  out.push(`## 6. Rules with no or partial machine check (${u.inForce.length} in force)`);
  out.push('');
  out.push(`"A step-standard item that no machine checks is not part of the standard" (R-BA). These in-force rules are not fully machine-checked yet. The list only shrinks: \`src/tests/handbook-rule-map.logic.test.ts\` caps it, and \`step-validate --all\` prints the count. ${u.none.length} have no check and ${u.partial.length} are partial; ${u.notInForce} more entries are retired ids kept so the seed count reconciles.`);
  out.push('');
  out.push(`Enforcement across all ${map.rules.length} mapped ids: ${ec.lock} lock, ${ec['lock-db']} lock-db, ${ec.check} check, ${ec.hook} hook, ${ec.partial} partial (any kind, listed below or retired), ${ec.none} none (see the glossary).`);
  out.push('');
  out.push('| Rule | Class | Line | Reason |');
  out.push('|---|---|---|---|');
  for (const entry of map.unenforced) {
    const r = byId.get(entry.id);
    if (!r || !IN_FORCE.includes(r.status)) continue;
    out.push(`| ${entry.id} | ${entry.class} | ${r.handbook_line} | ${entry.reason.replace(/\|/g, '/')} |`);
  }
  out.push('');
  out.push('## 7. History');
  out.push('');
  out.push(`${map.meta.precedence} ${map.meta.spec121_m_items}`);
  out.push('');
  for (const l of map.lines.filter((x) => x.section === HISTORY_SECTION)) out.push(renderLine(map, l));
  out.push('**Merged families.** Each merge puts a family of amendments behind one line; the old ids stay resolvable.');
  out.push('');
  for (const g of map.merges) out.push(`- ${g.id} ${g.name} → ${[].concat(g.line).join(', ')} (${g.ids.length} ids)`);
  out.push('');
  out.push('## Glossary');
  out.push('');
  out.push(GLOSSARY.map(([t, d]) => `- **${t}**: ${d}`).join('\n'));
  out.push('');
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

function main(argv) {
  const write = argv.includes('--write');
  const check = argv.includes('--check');
  if (write === check) {
    console.error('usage: node scripts/generate-step-handbook.mjs --write | --check');
    process.exitCode = 2;
    return;
  }
  let text;
  try {
    text = render(loadRuleMap(ROOT), readDefectLines(ROOT));
  } catch (err) {
    console.error(String(err && err.message ? err.message : err));
    process.exitCode = 1;
    return;
  }
  if (check) {
    const current = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : '';
    if (current !== text) {
      console.error(`[step-handbook] ${HANDBOOK_REL} is stale — run node scripts/generate-step-handbook.mjs --write`);
      process.exitCode = 1;
      return;
    }
    console.log(`[step-handbook] ${HANDBOOK_REL} is up to date`);
    return;
  }
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, text);
  console.log(`[step-handbook] wrote ${HANDBOOK_REL} (${text.split('\n').length - 1} lines)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main(process.argv.slice(2));
