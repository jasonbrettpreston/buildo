#!/usr/bin/env node
// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-10 (the generator lives in the spec; lock
//            src/tests/surfaces/handbook-rule-map.logic.test.ts), FE-14 (reuse the back-end machinery, no parallel
//            infra), FE-08 / FE-16 (136 = the generated handbook, in docs/specs/02-web-admin);
//            docs/specs/01-pipeline/124_step_standard_policy.md §5 R-GU (the form), R-GV (standard + policy pairs),
//            R-GW (role banner); 124a R-IY (the tooling, keyed by spec id); .cursor/MCFRONTEND-QUEUE.md MF-18
// ---------------------------------------------------------------------------
// McFrontend handbook generator → docs/specs/02-web-admin/136_mcfrontend_handbook.md, Spec 136 — McFrontend Handbook.
// The Spec 133 form (scripts/generate-bylaw-handbook.mjs) over the Spec 135 FE rows: a generated reading spec with a
// Status line, a role banner (generated handbook), an authority sentence and the citation form `Spec 136 §<line id> (FE-nn)`.
// The rule map (scripts/surfaces/_schema/surface-rule-map.json) is itself GENERATED from the register, never hand-written:
// one line per FE row (line id fe.<n>), each citing its row. Rulings, reasons and dated notes stay in Spec 135; a new
// ruling is a new register row, never an edit here.
//
// Reuse, not copy (R-27): the CLI shell (runHandbookCli) and the HANDBOOKS entry are in scripts/analysis/gates/rule-map.mjs;
// mapFindings / renderLine / lineIdOf come from the Spec 133 generator; headlineOf / splitRow from the by-law reader and
// parseRegisterRows from the gate's own reader (cite-parse.mjs), so this page can never disagree with what gate arm C sees.
// Nothing under scripts/analysis/bylaw/ or scripts/seeds/bylaw/ is edited (that would move table_version).
//
// Usage:
//   node scripts/surfaces/generate-surface-handbook.mjs --write   # regenerate the rule map and the handbook
//   node scripts/surfaces/generate-surface-handbook.mjs --check   # exit 1 if either is stale; exit 2 on bad usage
// Deterministic: no clock, no DB, no network.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { HANDBOOKS, runHandbookCli } from '../analysis/gates/rule-map.mjs';
import { headlineOf, splitRow } from '../analysis/bylaw/bylaw-register.mjs';
import { parseRegisterRows } from '../analysis/mcbylaws/cite-parse.mjs';
import { mapFindings, renderLine, lineIdOf } from '../generate-bylaw-handbook.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
export const REGISTER_REL = 'docs/specs/02-web-admin/135_mcfrontend_decisions_register.md';
const SPEC = HANDBOOKS['136'];
const RULES = 'rules';
const HISTORY = 'history';
const FE_ID = /^FE-\d+$/;
const ROW_COLUMNS = 6;
const STATUS_TO_MAP = Object.freeze({ RULED: 'active', OWED: 'owed', RETIRED: HISTORY });
const DATE = /\d{4}-\d{2}-\d{2}/;
const DATED_NOTE = /Dated note \d{4}-\d{2}-\d{2}/g;
const CLOSED_WORD = /^(RULED|OWED|RETIRED|SUPERSEDED|WITHDRAWN|PROPOSED)/;
const NEXT_FREE = /\*\*Next free id:\*\*\s*`FE-(\d+)`/;

/**
 * The FE rows of the register text, in file order: { id, headline, status, date, locks, notes }. The id set is the
 * gate's own (parseRegisterRows); a row whose id cell is struck or bold, a row with the wrong cell count, a PROPOSED row, a
 * gap in the numbering or a "Next free id" that does not follow the last row all throw, so no row can vanish silently.
 */
export function readFeRows(text) {
  const gate = parseRegisterRows(text);
  const gateIds = [...gate.keys()].filter((id) => FE_ID.test(id));
  const lines = new Map();
  for (const line of String(text).split('\n')) {
    if (!line.startsWith('| ')) continue;
    const cells = splitRow(line);
    const bare = /^(?:~~)?(?:\*\*)?(FE-\d+)(?:\*\*)?(?:~~)?$/.exec(cells[0] || '');
    if (!bare) continue;
    if (cells[0] !== bare[1]) throw new Error(`[surface-handbook] ${bare[1]}: the id cell is not plain (${cells[0]}); write the row id as plain text`);
    if (cells.length !== ROW_COLUMNS) throw new Error(`[surface-handbook] ${bare[1]}: ${cells.length} cells, expected ${ROW_COLUMNS}`);
    if (lines.has(bare[1])) throw new Error(`[surface-handbook] ${bare[1]} is a register row twice`);
    lines.set(bare[1], cells);
  }
  const missing = gateIds.filter((id) => !lines.has(id));
  if (missing.length || lines.size !== gateIds.length) throw new Error(`[surface-handbook] the gate reader and this reader disagree on the FE rows (${missing.join(', ') || 'count'})`);
  const nums = [...lines.keys()].map((id) => Number(id.slice(3)));
  nums.forEach((n, i) => {
    if (n !== i + 1) throw new Error(`[surface-handbook] FE ids must run FE-01.. with no gap or reorder; found FE-${String(n).padStart(2, '0')} at position ${i + 1}`);
  });
  const next = NEXT_FREE.exec(text);
  if (!next || Number(next[1]) !== nums.length + 1) throw new Error(`[surface-handbook] "Next free id" is not FE-${nums.length + 1}`);
  return [...lines].map(([id, cells]) => {
    const g = gate.get(id);
    const statusCell = cells[ROW_COLUMNS - 1];
    if (!CLOSED_WORD.test(statusCell.replace(/[~*`\s]/g, '').toUpperCase())) throw new Error(`[surface-handbook] ${id}: the status cell does not start with a closed word (RULED, OWED, RETIRED, SUPERSEDED, WITHDRAWN, PROPOSED)`);
    if (!STATUS_TO_MAP[g.status]) throw new Error(`[surface-handbook] ${id}: status ${g.status} is not RULED, OWED or RETIRED`);
    const date = DATE.exec(statusCell);
    return {
      id,
      headline: headlineOf(cells[1]),
      status: g.status,
      date: date ? date[0] : '',
      locks: g.locks,
      notes: (statusCell.match(DATED_NOTE) || []).length,
    };
  });
}

const sectionIdOf = (row) => (STATUS_TO_MAP[row.status] === HISTORY ? HISTORY : RULES);

/** The rule map, built from the FE rows. Structure only: line text is read from the register at render time. */
export function buildRuleMap(rows) {
  return {
    $comment: [
      'Spec 136 (McFrontend Handbook) rule map. GENERATED by `node scripts/surfaces/generate-surface-handbook.mjs --write` from the Spec 135 FE rows (MF-18; FE-10). Do not hand-edit: the lock src/tests/surfaces/handbook-rule-map.logic.test.ts and `--check` fail on a stale file.',
      'One line per register row, one rule per line. A rule is the row id; a dated note belongs to the row it follows. Status lives in the register row; here it only places the line (active, owed or history).',
    ],
    contract_version: 1,
    meta: {
      decided: 'operator 2026-11-09 "Wf-18 proceed if compliant and meets the 5 principle standard" (MF-18 plan D-1..D-5)',
      authority: 'Spec 135 FE rows (policy register) + Spec 126 (contract) and Spec 127 (procedure)',
      reading_surface: `Spec 136 — McFrontend Handbook, ${SPEC.handbookRel} (generated from this file and the register)`,
      pairs: [{ family: 'McFrontend surfaces', standard: 'Spec 126 (contract), Spec 127 (procedure)', policy: 'Spec 135 (FE rows), Spec 128 (policy)' }],
      generated_from: [REGISTER_REL],
    },
    sections: [{ id: RULES }, { id: HISTORY }],
    lines: rows.map((r) => ({ id: lineIdOf(r.id), section: sectionIdOf(r) })),
    rules: rows.map((r) => ({
      id: r.id,
      kind: 'fe-row',
      status: STATUS_TO_MAP[r.status],
      handbook_line: lineIdOf(r.id),
      source: { register: true, file: REGISTER_REL, anchor: r.id },
    })),
  };
}

/** The line a reader sees: honest about enforcement (a lock that is owed is never shown as enforcing). */
const lineRow = (r) => {
  const state = r.status === 'OWED' ? 'OWED' : `${r.status}${r.date ? ` ${r.date}` : ''}`;
  const owed = r.status === 'OWED' && r.locks.length ? ` · lock owed: ${r.locks.join(', ')}` : '';
  return { id: r.id, headline: r.headline, status: `${state}${owed}`, enforcedBy: r.status === 'RULED' ? r.locks.join(', ') : '', notes: r.notes };
};

// Paths the static header names; each must exist (the generator's one fact lock, like Spec 133's).
export const NAMED_PATHS = Object.freeze([
  SPEC.generator,
  'scripts/analysis/gates/rule-map.mjs',
  'scripts/analysis/mcbylaws/cite-parse.mjs',
  'src/tests/surfaces/handbook-rule-map.logic.test.ts',
  REGISTER_REL,
  'docs/specs/02-web-admin/126_maxbld_surface_standard.md',
  'docs/specs/02-web-admin/127_surface_conversion_procedure.md',
  'docs/specs/02-web-admin/128_surface_standard_policy.md',
]);

/** Spec 136 text. `root` is where the named paths and the RULED locks are looked up (the repo in production). */
export function render(map, rows, root = ROOT) {
  const exists = (rel) => fs.existsSync(path.join(root, rel));
  const problems = mapFindings(map, rows, (rel) => fs.readFileSync(path.join(root, rel), 'utf8'));
  if (problems.length) throw new Error(`[surface-handbook] the rule map does not match the register:\n  - ${problems.join('\n  - ')}`);
  const missing = NAMED_PATHS.filter((p) => !exists(p));
  if (missing.length) throw new Error(`[surface-handbook] a path the handbook names does not exist: ${missing.join(', ')}`);
  const noLock = rows.filter((r) => r.status === 'RULED').flatMap((r) => r.locks.filter((p) => !exists(p)).map((p) => `${r.id}: ${p}`));
  if (noLock.length) throw new Error(`[surface-handbook] a RULED row names a lock that does not exist: ${noLock.join(', ')}`);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const rowOfLine = (l) => byId.get(map.rules.find((x) => x.handbook_line === l.id).id);
  const example = rows[0];
  const inForce = rows.filter((r) => r.status !== 'RETIRED');
  const out = [];
  out.push('# SPEC 136 — McFrontend Handbook');
  out.push('');
  out.push('**Status:** GENERATED');
  out.push('');
  out.push(`> **Role: generated handbook.** Authority: ${map.meta.authority}; this spec is GENERATED from surface-rule-map.json — do not hand-edit. It is the reading surface of the McFrontend pair (Spec 124 R-GV). If this page and a register row disagree, the register row governs on policy and Spec 126 or Spec 127 on the contract and the procedure; fix the register or the generator, never this page. A new ruling is a new row in Spec 135, never a line here.`);
  out.push('>');
  out.push(`> **Citation form.** \`Spec 136 §<line id> (FE-nn)\`, e.g. \`Spec 136 §${lineIdOf(example.id)} (${example.id})\`. The line id is the bold id that starts each line (fe.<n> for a Spec 135 FE-row); the rule id is the register row it summarises.`);
  out.push('');
  out.push(`<!-- GENERATED by \`node ${SPEC.generator} --write\`. Do not edit by hand: \`--check\` and \`src/tests/surfaces/handbook-rule-map.logic.test.ts\` fail on a stale file. -->`);
  out.push('');
  out.push(`v1 covers the ${rows.length} FE rulings of Spec 135. The policy rows R-01..R-34 are in Spec 128 §5 until MF-31.`);
  out.push('');
  out.push('**"Comply with Spec 136"** means: for McFrontend work, read the lines that cover what you touch, then follow the register row each cites. Every line cites its binding rule id; the row in `docs/specs/02-web-admin/135_mcfrontend_decisions_register.md` is the authority, with its reasons, evidence and dated notes.');
  out.push('');
  out.push('## 1. Standard and policy pairs');
  out.push('');
  out.push('| Role | Spec | Path |');
  out.push('|---|---|---|');
  out.push('| Contract (what is built) | Spec 126 | `docs/specs/02-web-admin/126_maxbld_surface_standard.md` |');
  out.push('| Procedure (how it is converted) | Spec 127 | `docs/specs/02-web-admin/127_surface_conversion_procedure.md` |');
  out.push('| Policy (what is ruled) | Spec 128 | `docs/specs/02-web-admin/128_surface_standard_policy.md` |');
  out.push('| Register (the FE rulings) | Spec 135 | `docs/specs/02-web-admin/135_mcfrontend_decisions_register.md` |');
  out.push('');
  out.push('On a policy question the register governs (Spec 128 §5 dated note 2026-11-04; Spec 124 R-GV).');
  out.push('');
  out.push(`**What is generated.** Everything below, from the Spec 135 register table by \`${SPEC.generator}\` (status and lock paths read by \`scripts/analysis/mcbylaws/cite-parse.mjs\` \`parseRegisterRows\`, the reader gate arm C uses). The rule map \`${SPEC.ruleMapRel}\` is generated from the same rows, not hand-written; \`src/tests/surfaces/handbook-rule-map.logic.test.ts\` (FE-10) locks that every register row has exactly one line and every line cites exactly one row.`);
  out.push('');
  out.push(`**Rules rendered: ${rows.length}**: ${inForce.length} in force (${inForce.filter((r) => r.status === 'OWED').length} OWED, whose lock is still to land), ${rows.length - inForce.length} history. Each line: its line id, the reading headline, the register status, the lock that enforces it (RULED rows only; an OWED row shows the lock it owes) and the number of dated notes under the row.`);
  out.push('');
  out.push('**Contents.** 1 Standard and policy pairs · 2 Rules · 3 History');
  out.push('');
  out.push('## 2. Rules');
  out.push('');
  for (const l of map.lines.filter((x) => x.section === RULES)) out.push(renderLine(lineRow(rowOfLine(l))));
  out.push('## 3. History');
  out.push('');
  out.push('Rows retired or struck. Listed only so old citations resolve. Nothing here is a rule you must follow.');
  out.push('');
  const history = map.lines.filter((x) => x.section === HISTORY);
  if (history.length === 0) out.push('None yet.', '');
  for (const l of history) out.push(renderLine(lineRow(rowOfLine(l))));
  out.push('## Operating Boundaries');
  out.push('');
  out.push('### Target Files');
  out.push(`- \`${SPEC.generator}\` (the generator; \`--write\` / \`--check\`)`);
  out.push('- `scripts/analysis/gates/rule-map.mjs` (the handbook registry keyed by spec id and the shared CLI shell)');
  out.push('- `scripts/analysis/mcbylaws/cite-parse.mjs` (the one reader of a row\'s status and lock paths)');
  out.push(`- \`${SPEC.ruleMapRel}\` (the generated rule map)`);
  out.push('- `src/tests/surfaces/handbook-rule-map.logic.test.ts` (the lock)');
  out.push('');
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

/** { map, text } for the register under `root`. A pure function of the Spec 135 text. */
export function build(root = ROOT) {
  const rows = readFeRows(fs.readFileSync(path.join(root, REGISTER_REL), 'utf8'));
  const map = buildRuleMap(rows);
  return { map, text: render(map, rows, root) };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runHandbookCli({ spec: '136', argv: process.argv.slice(2), build, root: ROOT });
}
