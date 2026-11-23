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
// MF-95 commit A (task-430, RR-0384 "stop the clipping"; plan section 4, A1): the shared headlineOf clips at its HEADLINE_MAX (300,
// scripts/analysis/bylaw/bylaw-register.mjs:38, not exported) for Spec 133, whose size cap has no room to grow. Spec 136 prints each ruling
// whole: where the shared result was clipped (it ends in the ellipsis AND the plain cell is longer than the shared cap, so an authored
// ellipsis is never mistaken for a clip; and the cell has no leading bold span, where the shared rule prints the bold title, not the cell),
// the line is the plain text of the Ruling cell. Named reason for this one-line copy of the shared plain(): the shared reader is a layer23
// McBylaws path (an edit needs a McBylaws task and panel). The copy does not call stripProvenance: a long ruling keeps a trailing
// provenance bracket. Ruling Q9 (plan grounder, docs/reports/reviews/task-430/QUESTIONS-RULED.md): the shared stripProvenance also drops a
// trailing bracket that matches "spec 1nn" from a cell it does not clip; a handbook headline keeps it (its cite is the point), so a cell not led
// by a bold span whose shared headline differs from its plain text prints the plain text. Drift lock: handbook-rule-map.logic.test.ts A-T6.
const SHARED_HEADLINE_MAX = 300;
const CLIP_MARK = '…';
const plainCell = (text) => text.replace(/<br\s*\/?>/gi, ' ').replace(/\*\*|~~|`/g, '').replace(/\s+/g, ' ').trim();
function wholeHeadline(ruleCell) {
  const shared = headlineOf(ruleCell);
  const plain = plainCell(ruleCell);
  if (/^\*\*/.test(ruleCell.trim())) return shared;
  const clipped = shared.endsWith(CLIP_MARK) && plain.length > SHARED_HEADLINE_MAX;
  return clipped || shared !== plain ? plain : shared;
}

// MF-95 commit B (task-430, RR-0384 "make each line reflect its notes"; plan sections 5, 17.3, 17.4). A Current reading is ONE dated note,
// lane text that restates earlier dated notes of the same row, in this one strict form, LAST in the Status cell. The page prints it on the
// headline's line. Refusals (each throws, so --check and the lock fail): (i) a reading note that is not the last note; (ii) a cited date that
// is not the date of an earlier note of the row; (iii) more than 800 characters (chosen, not derived: keeps the page from growing; the longest
// reading is under 500); (v) a last note holding "Current reading:" that does not parse strictly (also: the row id in the frame must be the
// row); (vi) a cited date equal to the reading's own date; (vii) a bar in the reading text. (iv), the 12 pinned rows, is in the lock.
const READING_MARK = 'Current reading:';
const READING_MAX = 800;
const READING_FRAME = /^Dated note \d{4}-\d{2}-\d{2} \(M-246, prior text kept; FE-\d+ · McFrontend queue · lane [A-Za-z0-9-]+; RR-0384, operator, verbatim: "Approved"; lane text restating the notes dated /;
const READING_RE = /^Dated note (\d{4}-\d{2}-\d{2}) \(M-246, prior text kept; (FE-\d+) · McFrontend queue · lane [A-Za-z0-9-]+; RR-0384, operator, verbatim: "Approved"; lane text restating the notes dated ([0-9, -]+) of this row, not an operator word and not a ruling\): Current reading: (.+) \(from notes dated \3\)\. The cell text above is kept\.$/;
const NOTE_DATE = /^Dated note (\d{4}-\d{2}-\d{2})/;

/** The note segments of a Status cell: each runs from one "Dated note <date>" to the next (the text before the first is not a note). */
function noteSegments(statusCell) {
  const starts = [...statusCell.matchAll(/Dated note \d{4}-\d{2}-\d{2}/g)].map((m) => m.index);
  return starts.map((s, i) => statusCell.slice(s, i + 1 < starts.length ? starts[i + 1] : undefined).replace(/(?:<br\s*\/?>|\s)+$/i, '').trim());
}

/** The Current reading of a row ({ text, dates }) or null; throws on any refusal above. */
function readingOf(id, statusCell) {
  const segs = noteSegments(statusCell);
  const last = segs.length ? segs[segs.length - 1] : '';
  segs.slice(0, -1).forEach((s) => {
    if (READING_FRAME.test(s) && s.includes(READING_MARK)) throw new Error(`[surface-handbook] ${id}: a dated note follows the Current reading; restate it`);
  });
  if (!statusCell.includes(READING_MARK) && !READING_FRAME.test(last)) return null;
  const m = READING_RE.exec(last);
  if (!m || m[2] !== id) throw new Error(`[surface-handbook] ${id}: the Current reading note does not parse in the strict form (plan 17.4)`);
  const [, own, , dateList, text] = m;
  const dates = dateList.split(', ');
  const earlier = new Set(segs.slice(0, -1).map((s) => NOTE_DATE.exec(s)[1]));
  for (const d of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`[surface-handbook] ${id}: the Current reading note does not parse in the strict form (plan 17.4)`);
    if (d === own) throw new Error(`[surface-handbook] ${id}: the Current reading cites its own date ${d}`);
    if (!earlier.has(d)) throw new Error(`[surface-handbook] ${id}: the Current reading cites ${d}, which is not the date of an earlier dated note of the row`);
  }
  if (text.length > READING_MAX) throw new Error(`[surface-handbook] ${id}: the Current reading is ${text.length} characters (at most ${READING_MAX})`);
  if (text.includes('|')) throw new Error(`[surface-handbook] ${id}: the Current reading holds a bar`);
  return { text, dates };
}

/**
 * The FE rows of the register text, in file order: { id, headline, status, date, locks, notes, reading }. The id set is the
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
      headline: wholeHeadline(cells[1]),
      status: g.status,
      date: date ? date[0] : '',
      locks: g.locks,
      notes: (statusCell.match(DATED_NOTE) || []).length,
      reading: readingOf(id, statusCell),
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
  const reading = r.reading ? ` Current reading (lane text, notes ${r.reading.dates.join(', ')}): ${r.reading.text}` : '';
  return { id: r.id, headline: `${r.headline}${reading}`, status: `${state}${owed}`, enforcedBy: r.status === 'RULED' ? r.locks.join(', ') : '', notes: r.notes };
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
  out.push(`**Rules rendered: ${rows.length}**: ${inForce.length} in force (${inForce.filter((r) => r.status === 'OWED').length} OWED, whose lock is still to land), ${rows.length - inForce.length} history. Each line: its line id, the reading headline (then, where the row has one, its Current reading: lane text restating the row's dated notes, never a ruling), the register status, the lock that enforces it (RULED rows only; an OWED row shows the lock it owes) and the number of dated notes under the row.`);
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
