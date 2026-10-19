// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-5 P5.15 (B) answer reconciliation, INV-25;
//            docs/specs/01-pipeline/131_lot_configuration_policy.md LC-42
//
// ENVELOPE ANSWER-RECONCILIATION TRACKER. Joins every operator envelope-review answer (docs/reference/envelope-answers.json,
// a committed snapshot of the review page's DB) to its disposition (docs/reference/envelope-answer-dispositions.json) and
// to the MaxBLD lineage fields its provision feeds (docs/reference/maxbld-field-lineage.json), and VERIFIES each
// disposition against the committed tree:
//   matches         → the keyed unit is an agreed unit (agree.mjs)                         → INCORPORATED
//   no_application  → excluded                                                            → INCORPORATED (excluded)
//   disclose        → a Spec 78 P5.12 code; the agreed unit carries a disclosure          → INCORPORATED, else UNFIXED
//   wrong           → fix ids (Spec 69 M-rows); a keyed correction in adjudications.json
//                     citing one of them                                                  → INCORPORATED, else UNFIXED
//   unsure / null   → OPEN with the question, unless a RATIFIED ruling resolved it        → INCORPORATED
// A disposition that rests only on rows not yet RATIFIED (FOLDED / PROPOSED / OWED) is OPEN (pending operator) or
// UNFIXED (OWED defect), never incorporated.
//
//   node scripts/analysis/bylaw/generate-answer-tracker.mjs --write   render docs/reports/generated/envelope-answer-tracker.{md,json}
//   node scripts/analysis/bylaw/generate-answer-tracker.mjs --check   exit 1 on a missing disposition, a "wrong" with no fix
//                                                                      id, a disclose with no P5.12 code, a dangling
//                                                                      reference, or report drift; 2 = structural
//
// Deterministic: no clock, no DB, sorted, LF. OPEN and UNFIXED rows are the point: they are counted and listed first.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SPEC78_REL, agreedUnitMap, cell, cmp, correctionsByUnit, disclosureCodes, provisionsIndex, readJson, readText,
  resolveRegulation, ruleIds,
} from './maxbld-trace-lib.mjs';

export const ANSWERS_REL = 'docs/reference/envelope-answers.json';
export const DISPOSITIONS_REL = 'docs/reference/envelope-answer-dispositions.json';
export const LINEAGE_REL = 'docs/reference/maxbld-field-lineage.json';
export const MD_REL = 'docs/reports/generated/envelope-answer-tracker.md';
export const JSON_REL = 'docs/reports/generated/envelope-answer-tracker.json';
const DISPOSITIONS = new Set(['matches', 'excluded', 'fixed_by', 'disclosed_by', 'resolved_by', 'open']);
const EXPECTED = {
  matches: ['matches', 'resolved_by'],
  no_application: ['excluded'],
  wrong: ['fixed_by', 'resolved_by'],
  disclose: ['disclosed_by'],
  unsure: ['resolved_by', 'open'],
  null: ['resolved_by', 'open'],
};

export class TrackerError extends Error {}

const chapterOf = (reg) => {
  const m = /^(\d+\.\d+)/.exec(reg);
  return m ? m[1] : reg;
};
const baseReg = (id) => String(id).replace(/@[^#]*$/, '').replace(/^(.*?\(\d+[A-Za-z]?\)).*$/, '$1');

export function build(root) {
  const answersFile = readJson(root, ANSWERS_REL);
  const dispFile = readJson(root, DISPOSITIONS_REL);
  const lineage = readJson(root, LINEAGE_REL);
  const specText = readText(root, SPEC78_REL);
  const codes = disclosureCodes(specText);
  const rules = ruleIds(root);
  const units = agreedUnitMap(root);
  const corr = correctionsByUnit(root);
  const prov = provisionsIndex(root);
  const fieldsByReg = new Map();
  for (const f of lineage.fields) for (const r of f.regulation_ids || []) {
    const b = baseReg(r);
    if (!fieldsByReg.has(b)) fieldsByReg.set(b, new Set());
    fieldsByReg.get(b).add(f.field);
  }
  const disp = new Map();
  const problems = [];
  for (const d of dispFile.dispositions || []) {
    if (disp.has(d.unit_id)) problems.push(`${d.unit_id}: two dispositions`);
    disp.set(d.unit_id, d);
  }
  const rows = [];
  const seen = new Set();
  for (const a of answersFile.answers) {
    const verdict = a.verdict === undefined ? null : a.verdict;
    const vkey = verdict === null ? 'null' : verdict;
    seen.add(a.unit_id);
    const d = disp.get(a.unit_id);
    const row = {
      unit_id: a.unit_id, regulation_id: a.regulation_id, chapter: chapterOf(a.regulation_id), verdict, note: a.note || '',
      source: a.source || '', disposition: d ? d.disposition : null, fix_ids: (d && d.fix_ids) || [],
      corrected_value: (d && d.corrected_value) || '', disclosure_code: (d && d.disclosure_code) || '',
      question: (d && d.question) || '', fields: [...(fieldsByReg.get(baseReg(a.regulation_id)) || [])].sort(cmp),
      checks: [], state: null, reason: '',
    };
    const regWhy = resolveRegulation(prov, a.regulation_id);
    if (regWhy) problems.push(`${a.unit_id}: regulation ${a.regulation_id} — ${regWhy}`);
    const unit = units.get(a.unit_id);
    const isRowAnswer = /#row$/.test(a.unit_id);
    if (!d) { problems.push(`${a.unit_id}: no disposition`); row.state = 'OPEN'; row.reason = 'no disposition'; rows.push(row); continue; }
    if (!DISPOSITIONS.has(d.disposition)) problems.push(`${a.unit_id}: disposition "${d.disposition}" unknown`);
    if (!(EXPECTED[vkey] || []).includes(d.disposition)) problems.push(`${a.unit_id}: verdict ${vkey} cannot take disposition ${d.disposition}`);
    for (const id of row.fix_ids) if (!rules.has(id)) problems.push(`${a.unit_id}: fix id ${id} is not a Spec 69 M-row`);
    if (row.disclosure_code && !codes.has(row.disclosure_code)) problems.push(`${a.unit_id}: disclosure code ${row.disclosure_code} is not in Spec 78 P5.12`);
    if (!unit && !isRowAnswer) problems.push(`${a.unit_id}: not an agreed keyed unit`);
    const statuses = row.fix_ids.map((id) => rules.get(id) || '');
    const ratified = statuses.some((s) => s === 'RATIFIED');
    const owedOnly = statuses.length > 0 && statuses.every((s) => s === 'OWED');
    const applied = (corr.get(a.unit_id) || []).filter((c) => row.fix_ids.some((id) => new RegExp(`\\b${id}\\b`).test(c.rule)));
    switch (d.disposition) {
      case 'matches':
        row.checks.push(unit ? 'unit agreed' : 'unit NOT agreed');
        row.state = unit ? 'INCORPORATED' : 'UNFIXED';
        row.reason = unit ? 'keyed unit agreed' : 'the matched unit is not agreed';
        break;
      case 'excluded':
        row.state = 'INCORPORATED'; row.reason = 'no application (excluded)';
        break;
      case 'disclosed_by': {
        if (!row.disclosure_code) problems.push(`${a.unit_id}: disclose without a P5.12 code`);
        const keyedDisclosure = unit && unit.disclosure && unit.disclosure !== 'none';
        row.checks.push(`P5.12 code ${row.disclosure_code || '(none)'}`, keyedDisclosure ? 'unit carries a disclosure' : 'unit carries no disclosure');
        if (keyedDisclosure || isRowAnswer) { row.state = 'INCORPORATED'; row.reason = isRowAnswer ? 'row answer; P5.12 code' : 'keyed disclosure + P5.12 code'; } else { row.state = 'UNFIXED'; row.reason = 'P5.12 code ruled; keyed unit has no disclosure yet'; }
        break;
      }
      case 'fixed_by':
        if (!row.fix_ids.length) problems.push(`${a.unit_id}: "wrong" with no fix id`);
        if (!row.corrected_value) problems.push(`${a.unit_id}: "wrong" with no corrected value`);
        row.checks.push(applied.length ? `correction ${applied.map((c) => c.id).join(', ')}` : 'no keyed correction cites the fix');
        if (applied.length) { row.state = 'INCORPORATED'; row.reason = 'keyed correction applied'; } else if (owedOnly) { row.state = 'UNFIXED'; row.reason = 'fix is an OWED defect row'; } else if (!ratified) { row.state = 'OPEN'; row.reason = `fix rests on rows awaiting the operator (${row.fix_ids.join(', ')})`; } else { row.state = 'UNFIXED'; row.reason = 'ruled; keyed correction not applied yet'; }
        break;
      case 'resolved_by':
        if (!row.fix_ids.length) problems.push(`${a.unit_id}: resolved_by with no ruling id`);
        if (ratified) { row.state = 'INCORPORATED'; row.reason = 'resolved by a RATIFIED ruling'; } else { row.state = 'OPEN'; row.reason = `resolved only by rows awaiting the operator (${row.fix_ids.join(', ')})`; }
        break;
      case 'open':
        if (!row.question) problems.push(`${a.unit_id}: open without a question`);
        row.state = 'OPEN'; row.reason = 'operator question open';
        break;
      default: row.state = 'OPEN'; row.reason = 'unknown disposition';
    }
    rows.push(row);
  }
  for (const id of disp.keys()) if (!seen.has(id)) problems.push(`${id}: disposition for an answer not in the snapshot`);
  if (answersFile.count !== answersFile.answers.length) problems.push(`answers snapshot count ${answersFile.count} ≠ ${answersFile.answers.length}`);
  const order = { OPEN: 0, UNFIXED: 1, INCORPORATED: 2 };
  rows.sort((x, y) => order[x.state] - order[y.state] || cmp(x.unit_id, y.unit_id));
  const tally = (key) => {
    const t = {};
    for (const r of rows) { const k = r[key] === null ? 'null' : r[key]; t[k] = (t[k] || 0) + 1; }
    return Object.fromEntries(Object.keys(t).sort(cmp).map((k) => [k, t[k]]));
  };
  const byChapter = {};
  for (const r of rows) {
    byChapter[r.chapter] = byChapter[r.chapter] || { total: 0, INCORPORATED: 0, UNFIXED: 0, OPEN: 0 };
    byChapter[r.chapter].total += 1;
    byChapter[r.chapter][r.state] += 1;
  }
  const counts = {
    answers: rows.length,
    by_state: tally('state'),
    by_verdict: tally('verdict'),
    by_disposition: tally('disposition'),
    by_chapter: Object.fromEntries(Object.keys(byChapter).sort(cmp).map((k) => [k, byChapter[k]])),
    feeding_a_lineage_field: rows.filter((r) => r.fields.length).length,
  };
  return { rows, counts, problems };
}

export function renderJson(r) {
  return JSON.stringify({ schema: 'envelope-answer-tracker-v1', generator: 'scripts/analysis/bylaw/generate-answer-tracker.mjs', inputs: [ANSWERS_REL, DISPOSITIONS_REL, LINEAGE_REL, SPEC78_REL], counts: r.counts, rows: r.rows }, null, 1) + '\n';
}

export function renderMd(r) {
  const c = r.counts;
  const L = [];
  L.push('# Envelope answer tracker (generated)');
  L.push('');
  L.push(`> Generated by \`scripts/analysis/bylaw/generate-answer-tracker.mjs\` from \`${ANSWERS_REL}\`, \`${DISPOSITIONS_REL}\` and \`${LINEAGE_REL}\` (Spec 78 §Phase-5 P5.15 (B); Spec 131 LC-42). Do not hand-edit: \`--write\` regenerates, \`--check\` fails on drift or a dangling disposition. JSON form: \`${JSON_REL}\`.`);
  L.push('');
  L.push('**States.** INCORPORATED — verified in the committed tree (matches: the keyed unit is agreed; disclose: the keyed unit carries a disclosure; wrong: a keyed correction cites the fix; resolved by a RATIFIED ruling; or excluded). UNFIXED — ruled in the specs, not yet in the by-law table. OPEN — an operator question, or a disposition resting only on rows not yet RATIFIED.');
  L.push('');
  L.push('## Counts');
  L.push('');
  L.push(`- Answers: **${c.answers}** — INCORPORATED **${c.by_state.INCORPORATED || 0}**, UNFIXED **${c.by_state.UNFIXED || 0}**, OPEN **${c.by_state.OPEN || 0}**.`);
  L.push(`- By verdict: ${Object.entries(c.by_verdict).map(([k, v]) => `${k} ${v}`).join(' · ')}.`);
  L.push(`- By disposition: ${Object.entries(c.by_disposition).map(([k, v]) => `${k} ${v}`).join(' · ')}.`);
  L.push(`- Answers whose provision feeds a P5.10 lineage field: ${c.feeding_a_lineage_field}.`);
  L.push('');
  L.push('| Chapter | Answers | Incorporated | Unfixed | Open |');
  L.push('|---|---|---|---|---|');
  for (const [k, v] of Object.entries(c.by_chapter)) L.push(`| ${k} | ${v.total} | ${v.INCORPORATED} | ${v.UNFIXED} | ${v.OPEN} |`);
  L.push('');
  for (const state of ['OPEN', 'UNFIXED', 'INCORPORATED']) {
    const rs = r.rows.filter((x) => x.state === state);
    L.push(`## ${state} (${rs.length})`);
    L.push('');
    L.push('| Unit | Verdict | Disposition | Fix ids / code | Corrected value or question | Why this state | Feeds fields | Operator note |');
    L.push('|---|---|---|---|---|---|---|---|');
    for (const x of rs) {
      const ids = [...x.fix_ids, x.disclosure_code ? `\`${x.disclosure_code}\`` : ''].filter(Boolean).join(', ') || '—';
      const what = x.question ? `Q: ${x.question}` : x.corrected_value || '—';
      L.push(`| \`${x.unit_id}\` | ${x.verdict === null ? 'null' : x.verdict} | ${x.disposition || '—'} | ${cell(ids)} | ${cell(what)} | ${cell(x.reason)} | ${cell(x.fields.map((f) => `\`${f}\``).join(', ') || '—')} | ${cell(x.note.slice(0, 160))} |`);
    }
    L.push('');
  }
  return L.join('\n');
}

export function run({ root, mode }) {
  const r = build(root);
  const md = renderMd(r);
  const json = renderJson(r);
  const drift = [];
  for (const [rel, text] of [[MD_REL, md], [JSON_REL, json]]) {
    const p = path.join(root, rel);
    const cur = fs.existsSync(p) ? fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n') : null;
    if (cur !== text) {
      if (mode === 'write') { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); } else drift.push(rel);
    }
  }
  return { ...r, drift };
}

function main() {
  const flags = process.argv.slice(2);
  if (flags.length !== 1 || !['--write', '--check'].includes(flags[0])) {
    console.error('usage: node scripts/analysis/bylaw/generate-answer-tracker.mjs --write | --check');
    process.exitCode = 2;
    return;
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  try {
    const r = run({ root, mode: flags[0] === '--write' ? 'write' : 'check' });
    console.log(`[answer-tracker] ${JSON.stringify({ answers: r.counts.answers, by_state: r.counts.by_state })}`);
    for (const p of r.problems) console.error(`[answer-tracker] DANGLING: ${p}`);
    if (r.drift.length) console.error(`[answer-tracker] DRIFT: ${r.drift.join(', ')} — rerun with --write`);
    if (r.problems.length || r.drift.length) process.exitCode = 1;
    else console.log(`[answer-tracker] ${flags[0] === '--write' ? 'written' : 'clean'} — every answer has a verified disposition; OPEN and UNFIXED are listed first in ${MD_REL}.`);
  } catch (err) {
    if (err instanceof TrackerError) { console.error(`[answer-tracker] refused — ${err.message}`); process.exitCode = 2; return; }
    console.error(err && err.stack ? err.stack : String(err));
    process.exitCode = 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
