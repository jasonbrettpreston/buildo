#!/usr/bin/env node
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-DF, R-BA, R-BE (operator y 2026-10-20 consolidation 1-4)
// ---------------------------------------------------------------------------
// Step-standard handbook generator → docs/handbook/step-standard.md
//
// The Spec 124 register is the authority; the handbook is the reading surface. Every line is rendered from
// scripts/steps/_schema/rule-map.json (one line per handbook entry, followed by the rule ids it summarises);
// the prose sections below (how a step is read and written, the diagnosis table) live here and cite rule ids
// and Defect Ledger ids that this generator checks resolve. Nothing is dated, so the output is reproducible.
//
// Usage:
//   node scripts/generate-step-handbook.mjs --write   # regenerate the handbook
//   node scripts/generate-step-handbook.mjs --check   # exit 1 if the committed handbook is stale (pre-commit)
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { HANDBOOK_REL, IN_FORCE, HISTORY_SECTION, loadRuleMap, readDefectIds, unenforcedSummary } from './analysis/gates/rule-map.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUTPUT = path.join(ROOT, HANDBOOK_REL);

// Symptom → where to look. Each row cites the rule(s) and a real Defect Ledger id (docs/reports/defect-ledger.md);
// an id on rule-map meta.pending_integration.defects is allowed before its branch lands.
const DIAGNOSIS = [
  ['Every counter and check value reads 0 on a multi-primary INGESTOR', 'The compute reads the flat `runIngestPhase` ctx. Read `acquired.primaries[id]` and `written.by_target.<table>` (`scripts/lib/step/index.js` `ingestPrimaries`, `aggregatePrimaries`); build the lock\'s ctx through the real dispatch.', ['R-EW', 'R-DX'], ['COA-D13']],
  ['The rerun proof refuses the capture: `zero_writes` false, N rows rewritten', 'A `written:"seen"` column touches every fed key. Declare `idempotent_rerun: "declared_drift"`; `scripts/analysis/capture-rerun-proof.js` mode `seen_drift`.', ['R-EX', 'R-DZ'], ['COA-D14']],
  ['Writes succeed only as a role that bypasses RLS; another role writes 0 rows', 'The target table has RLS on and no policy. Declare `guards.requires: rls_bypass_or_policy` (`write.js` `assertWritePrivileges`).', ['R-CT'], ['LR-D7', 'LM-D12']],
  ['`written.e1.updated` is double the real row count', 'Both the seam and the pass report the same rows; counters belong to whoever wrote them (`seamOwned`).', ['R-AT'], ['RV-D4']],
  ['`checks_failed > 0` but there are no FAIL rows', 'Severity conflation in `scripts/lib/step/verdict.js` `buildAuditTable`.', ['R-Q'], ['LPA-D6']],
  ['A run skipped (`skipped_content_hash`) and left an empty table empty', 'The skip did not probe the target (`targetIsEmpty`).', ['R-DD'], ['LBMA-D7']],
  ['A skipped or deferred run shows no reason in its audit table', 'No `when:"pre"` check, or no `deferred_to_full` terminal.', ['R-P', 'R-BU'], ['LPA-D4', 'EP-D19']],
  ['A check reports clean but never looked (its value is `undefined`)', 'The value is never populated in ctx (`resolveOverrides`). In tests, a live run must prove the child completed (`notLookedReasons`).', ['R-CP'], ['LM-D14']],
  ['A declared variable silently runs on its seed default', 'The `logic_variables` row is missing; `scripts/lib/step/config.js` must throw on absence.', ['R-G'], ['LM-D15']],
  ['ENRICHER `last_heartbeat_at` stays NULL; no `lock_timeout` is set', 'Interval keys hard-coded to another step\'s slug; intervals come from config.', ['R-AK'], ['ER-D1']],
  ['After a killed FULL run the table is half-retracted and the next run says "unchanged"', 'Crash posture: `detectInterruptedRetraction` must be reachable in your phase; declare `recovery.interrupted`.', ['Rule-12', 'R-B'], ['LW-D20']],
  ['A FAIL is reported after rows were already written', 'Phase order: the owner spec\'s "before X" has no `pre_write` check with an `order_guarantee`.', ['Rule-11'], ['LR-D9']],
  ['`data_hash` differs between machines', 'A zone-less timestamp parsed in the process time zone.', ['R-EV', 'R-CE'], ['COA-D11']],
  ['A producer contract reads an old run', 'Status filter (baselines accept completed/completed_with_warnings; seam reads accept every finished status) or a bare-slug vs chain-prefixed ledger name.', ['R-CB', 'R-BG'], ['EC-D10']],
  ['Gate E reads zero, yet a config value still decides the output', 'A local alias of `ctx.config` inside a check body (purity G7).', ['R-DC'], ['LCN-D5']],
  ['Rule 4 / G-2 flags `preserved-in-compute` Intent Ledger rows', 'Each such row must name where its rule is written (a check `why` or `notes.json`).', ['Rule-4'], ['LW-D21', 'CC-D4']],
  ['A tunable cap, bind-limit formula or cadence is a literal in the step', 'Make it a logic variable; derive batch from the 65,535-parameter limit.', ['Rule-3', 'R-CU'], ['CCS-D3', 'CCCE-D2']],
];

// Validator messages that point straight at a rule (no single defect behind them).
const MESSAGES = [
  ['`standard=V2 (fails: …)`', 'The numbered R-EY conditions in the message; `scripts/analysis/gates/v3-label.mjs`, `standardSignals` in `step-validate.mjs`.', ['R-EY']],
  ['A G3 point lost on a plain table header, or G-2 reading a header as a row', '`tableDataRows` / `ledgerTableRows` in `scripts/analysis/gates/markdown-table.mjs`. No Defect Ledger id was filed for this; evidence is in the R-FA and R-FB rows.', ['R-FA', 'R-FB']],
  ['`#44 (h) h:undeclared`, or `OWED`', 'An acquisition read of another step\'s `run_at` column with no pin; OWED while the producer still awaits captures.', ['R-DI', 'R-ES']],
  ['`i:unresolved:pin` / `i:fill-once`', 'A `by:"pin"` invalidator with no reader pin; a write-once column with no invalidator.', ['R-DO', 'R-ER']],
  ['Gate F scores a pending step below floor', 'Does its declared stage await captures (`stageAwaitsCaptures`)?', ['R-EF']],
  ['`#38` RED: no `recapture.json` entry', 'Retake with `capture-step-golden.js --replay-all`.', ['R-CZ']],
  ['G8 diff unexplained', 'Explain it only in `docs/reports/golden/<slug>/explained-diffs.json`, citing a Defect Ledger id.', ['R-DA']],
  ['Pre-commit refuses an early ① with no descriptor', '`rowBlocks` is keyed on the descriptor file.', ['R-DU']],
  ['`bind message has N parameter formats`', 'Batch × bound columns exceeds 65,535.', ['R-CU']],
  ['Before-image files appear under `docs/reports/golden/*/before-image/` after tests', 'The test sandbox in `src/tests/setup.ts`.', ['R-CO']],
];

const READ_WRITE = `## 1. How a step is read and written

**The pieces.** A step is a descriptor, a compute module and a shell. The descriptor (\`scripts/<slug>.descriptor.json\`) is data only and answers all 20 categories of \`scripts/steps/_schema/step.schema.json\`. The compute module (\`scripts/lib/compute/<name>.js\`) holds the domain logic. The shell (\`scripts/<slug>.js\`) only requires the two and exports \`pipeline.step(descriptor, compute)\`.

**The runner.** \`pipeline.step\` (\`scripts/lib/step/index.js\` \`step\`) validates the descriptor and hands both to \`runWithPool\`, which opens the run row, resolves config (\`config.js\`), selects the mode (\`staleness.js\`) and dispatches on the archetype to one phase: \`runIngestPhase\` (or \`ingestPrimaries\` for several primaries), \`runLinkPhase\` / \`runLinkKeyedPhase\` / \`runLinkColumnPhase\` / \`runCascadePhase\`, \`runEnrichPhase\`, \`runMaterializePhase\`, \`runBackfillPhase\` or \`runRecorderPhase\`. The phase probes \`guards.requires\` (\`assertRequirements\`) and does every read set-up, write (\`write.js\`), transaction and before-image (\`reset.js\`). Finally the runner builds the audit table and verdict from the check rows (\`verdict.js\`).

**Compute purity.** Compute receives \`ctx\` (config with \`$meta\`, \`clock\`, \`catalog\`, the descriptor, \`withinLimit\`, and whatever the phase acquired or wrote) and returns rows, plans and check values. It never opens a transaction, writes, reads the environment, takes a lock, logs to a side channel or decides the verdict. Gate E (\`scripts/analysis/gates/compute-purity.mjs\`, codes G0–G13) and the ast-grep shape rules check this.

**Where to find a step's reads and writes.**

| What | Declared in the descriptor | Witnessed by |
|---|---|---|
| Acquisition reads (tables and sources compute works from) | \`inputs.reads\` | #44 (a) in \`step-validate\` |
| Measurement reads (check SQL, emits) | \`checks[].reads\` | #44 (a) |
| Write targets, columns, discipline | \`outputs.writes[]\` (\`write_discipline\` per target) | #44, the golden captures |
| Statement counts per mode | \`outputs.write_inventory.by_mode\` | #44 (c) |
| Version pins on producers | \`staleness.pins\` | #44 (h) |
| What a write invalidates downstream | \`outputs.invalidates[]\` | #44 (i) |
| Required extensions, triggers, RLS posture | \`guards.requires\` | runtime probe (\`probeRequirement\`) |
| Logic variables | \`config\` | \`logic_variables\` rows; the admin Control Panel |

Run \`node scripts/analysis/step-validate.mjs --step=<slug> --fast\` to see the scorecard, the #44 WITNESS rows (declared vs traced) and the V3 label. The admin pipeline page shows the same step's registry, table map, telemetry and variable badges, all derived from the descriptor. Golden captures for converted steps live in \`docs/reports/golden/<slug>/\` (\`pre/\`, \`post/\`, \`explained-diffs.json\`). The step's owner spec (from \`docs/specs/00-architecture/00_system_map.md\`) lists its Target Files.
`;

function idsFor(map, lineId) {
  return map.rules.filter((r) => r.handbook_line === lineId);
}

function renderIds(map, lineId) {
  const pending = new Set(map.meta.pending_integration.rules);
  const rs = idsFor(map, lineId);
  const tag = (r) => `\`${r.id}\`${pending.has(r.id) ? '†' : ''}`;
  const live = rs.filter((r) => IN_FORCE.includes(r.status)).map(tag);
  const old = rs.filter((r) => !IN_FORCE.includes(r.status)).map(tag);
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

function assertResolves(map, defectIds) {
  const ruleIds = new Set(map.rules.map((r) => r.id));
  const pendingDefects = new Set(map.meta.pending_integration.defects);
  for (const [symptom, , rules, defects] of DIAGNOSIS) {
    for (const id of rules) if (!ruleIds.has(id)) throw new Error(`diagnosis "${symptom}": rule ${id} is not in rule-map.json`);
    if (!defects.length) throw new Error(`diagnosis "${symptom}": no Defect Ledger id`);
    for (const d of defects) if (!defectIds.has(d) && !pendingDefects.has(d)) throw new Error(`diagnosis "${symptom}": defect ${d} is not in docs/reports/defect-ledger.md`);
  }
  for (const [msg, , rules] of MESSAGES) for (const id of rules) if (!ruleIds.has(id)) throw new Error(`message "${msg}": rule ${id} is not in rule-map.json`);
}

export function render(map, defectIds) {
  assertResolves(map, defectIds);
  const pendingD = new Set(map.meta.pending_integration.defects);
  const sec = (id) => map.sections.find((s) => s.id === id);
  const archetypeSections = map.sections.filter((s) => s.archetype);
  const crossSections = map.sections.filter((s) => s.id.startsWith('x-'));
  const u = unenforcedSummary(map);
  const byId = new Map(map.rules.map((r) => [r.id, r]));
  const out = [];
  out.push('# Step standard handbook');
  out.push('');
  out.push('<!-- GENERATED by `node scripts/generate-step-handbook.mjs --write` from scripts/steps/_schema/rule-map.json. Do not edit by hand: `--check` runs at pre-commit. -->');
  out.push('');
  out.push(`> **Authority.** ${map.meta.authority} is the authority. This handbook is the reading surface: it is generated from \`scripts/steps/_schema/rule-map.json\` and locked by \`src/tests/handbook-rule-map.logic.test.ts\`, which fails if a register id has no line here. Specs ${map.meta.historical_design_records.join(', ').replace(/Spec /g, '')} are historical design records. If this page and a register row disagree, the register wins and the map is wrong; fix the map. (${map.meta.decided}.)`);
  out.push('');
  out.push('**How to read it.** Each line says what a step must declare or do, then why, then the rule ids it summarises. Ids under "history" are superseded or retired and are listed only so old citations resolve. † marks an id that lands with another branch (' + map.meta.pending_integration.branch + '). Look an id up in Spec 124 §5 or the 124a LIVE REGISTER sections for the full text.');
  out.push('');
  out.push('**Contents.** 1 How a step is read and written · 2 Every step · 3 By archetype · 4 Cross-cutting · 5 Symptom → where to look · 6 Rules with no or partial machine check · 7 History');
  out.push('');
  out.push(READ_WRITE);
  out.push(`## 2. ${sec('core').title}`);
  out.push('');
  out.push(sec('core').intro);
  out.push('');
  for (const l of map.lines.filter((x) => x.section === 'core')) out.push(renderLine(map, l));
  out.push('## 3. By archetype');
  out.push('');
  out.push('The archetype comes from `identity.archetype` (see `step-archetype-census.json`). Every line in section 2 applies too.');
  out.push('');
  for (const s of archetypeSections) out.push(renderSection(map, s, 3));
  out.push('## 4. Cross-cutting');
  out.push('');
  for (const s of crossSections) out.push(renderSection(map, s, 3));
  out.push('## 5. Symptom → where to look');
  out.push('');
  out.push('| Symptom | Look at | Rules | Defect |');
  out.push('|---|---|---|---|');
  for (const [symptom, look, rules, defects] of DIAGNOSIS) out.push(`| ${symptom} | ${look} | ${rules.join(', ')} | ${defects.map((d) => (pendingD.has(d) ? `${d}†` : d)).join(', ')} |`);
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
  const text = render(loadRuleMap(ROOT), readDefectIds(ROOT));
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

main(process.argv.slice(2));
