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
//   wrong           → fix ids (Spec 69 M-rows). Each fix id is SATISFIED by a keyed correction in adjudications.json
//                     citing it, or by a verified NAMED LOCK (`locks[]`: test file + exact describe / it titles as
//                     written + assert tokens + the fix ids it `satisfies`; verifyLock). Green only when every fix
//                     id is satisfied (no partial green). `fixed_by` may mix corrections and locks; `verified_by_lock`
//                     (the by-law answer is right without a correction) must lock every fix id. A lock whose file is
//                     not in this tree stays unsatisfied with its `pin` (branch@sha) and is verified once that branch
//                     integrates; a lock that does not resolve is a DANGLING problem (--check exits 1). `owed[]`
//                     records a cited reading whose work is not a by-law-table fix (to P5.13 / Layer 2 step /
//                     Layer 3): shown, never a fix id                                       → INCORPORATED, else UNFIXED
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
  resolveRegulation, ruleIds, verifyLock,
} from './maxbld-trace-lib.mjs';

export const ANSWERS_REL = 'docs/reference/envelope-answers.json';
export const DISPOSITIONS_REL = 'docs/reference/envelope-answer-dispositions.json';
export const LINEAGE_REL = 'docs/reference/maxbld-field-lineage.json';
export const MD_REL = 'docs/reports/generated/envelope-answer-tracker.md';
export const JSON_REL = 'docs/reports/generated/envelope-answer-tracker.json';
const DISPOSITIONS = new Set(['matches', 'excluded', 'fixed_by', 'verified_by_lock', 'disclosed_by', 'resolved_by', 'open']);
const EXPECTED = {
  matches: ['matches', 'resolved_by'],
  no_application: ['excluded'],
  wrong: ['fixed_by', 'verified_by_lock', 'resolved_by'],
  disclose: ['disclosed_by'],
  unsure: ['resolved_by', 'open'],
  null: ['resolved_by', 'open'],
};

export class TrackerError extends Error {}

/**
 * State of a "wrong" answer (Spec 131 LC-53: no partial green). A fix id is SATISFIED when a keyed correction for the
 * unit cites it (`applied` = [{ id, rule }]) or a VERIFIED named lock lists it in `satisfies` (`locked` = Set of ids).
 * Green only when every fix id is satisfied. `statuses` = the register status word per fix id.
 */
export function fixedByState(fixIds, applied, statuses, locked = new Set()) {
  const cites = (c, id) => new RegExp(`\\b${id}\\b`).test(c.rule);
  const unsatisfied = fixIds.filter((id) => !locked.has(id) && !applied.some((c) => cites(c, id)));
  const checks = [applied.length ? `correction ${applied.map((c) => c.id).join(', ')}` : 'no keyed correction cites the fix'];
  if (locked.size) checks.push(`verified by named lock: ${[...locked].sort(cmp).join(', ')}`);
  const any = applied.length || locked.size;
  if (any && unsatisfied.length) checks.push(`unsatisfied: ${unsatisfied.join(', ')}`);
  if (any && !unsatisfied.length) return { state: 'INCORPORATED', reason: locked.size && !applied.length ? 'verified by named lock' : 'every cited ruling applied (keyed correction or named lock)', checks };
  if (any) return { state: 'UNFIXED', reason: `partly applied: ${unsatisfied.join(', ')} not yet applied`, checks };
  if (statuses.length && statuses.every((x) => x === 'OWED')) return { state: 'UNFIXED', reason: 'fix is an OWED defect row', checks };
  if (!statuses.some((x) => x === 'RATIFIED')) return { state: 'OPEN', reason: `fix rests on rows awaiting the operator (${fixIds.join(', ')})`, checks };
  return { state: 'UNFIXED', reason: 'ruled; keyed correction not applied yet', checks };
}

/** Owed-elsewhere destinations (LC-53): a cited reading whose work is not a by-law-table fix. */
export const OWED_TO = new Set(['P5.13', 'Layer 2 step', 'Layer 3']);

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
      locks: (d && d.locks) || [], owed: (d && d.owed) || [], checks: [], state: null, reason: '',
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
      case 'verified_by_lock': {
        if (!row.fix_ids.length) problems.push(`${a.unit_id}: "wrong" with no fix id`);
        if (!row.corrected_value) problems.push(`${a.unit_id}: "wrong" with no corrected value`);
        const locks = (d.locks || []);
        if (d.disposition === 'verified_by_lock' && !locks.length) problems.push(`${a.unit_id}: verified_by_lock names no lock`);
        const locked = new Set();
        const pending = [];
        for (const lk of locks) {
          if (!lk.file || !lk.describe || !lk.it || !Array.isArray(lk.satisfies) || !lk.satisfies.length) { problems.push(`${a.unit_id}: lock without file / describe / it / satisfies`); continue; }
          for (const id of lk.satisfies) if (!row.fix_ids.includes(id)) problems.push(`${a.unit_id}: lock satisfies ${id}, which the row does not cite`);
          const lockPath = path.join(root, lk.file);
          if (!fs.existsSync(lockPath)) {
            if (!lk.pin) problems.push(`${a.unit_id}: lock file ${lk.file} not in the tree and no pin`);
            pending.push(`${lk.satisfies.join(', ')} pinned at ${lk.pin || '(none)'}`);
            continue;
          }
          const why = verifyLock(fs.readFileSync(lockPath, 'utf8'), lk, lk.satisfies);
          if (why) { problems.push(`${a.unit_id}: lock ${lk.file} — ${why}`); row.checks.push(`lock NOT verified: ${why}`); continue; }
          for (const id of lk.satisfies) locked.add(id);
        }
        if (d.disposition === 'verified_by_lock') {
          const covered = new Set(locks.flatMap((lk) => lk.satisfies || []));
          for (const id of row.fix_ids) if (!covered.has(id)) problems.push(`${a.unit_id}: verified_by_lock leaves ${id} without a lock`);
        }
        for (const o of row.owed) {
          if (!rules.has(o.id)) problems.push(`${a.unit_id}: owed ${o.id} is not a Spec 69 M-row`);
          if (!OWED_TO.has(o.to)) problems.push(`${a.unit_id}: owed ${o.id} to "${o.to}" is not one of ${[...OWED_TO].join(' / ')}`);
          if (row.fix_ids.includes(o.id)) problems.push(`${a.unit_id}: ${o.id} is both a fix id and owed`);
          if (!o.why) problems.push(`${a.unit_id}: owed ${o.id} without a why`);
        }
        const v = fixedByState(row.fix_ids, applied, statuses, locked);
        row.checks.push(...v.checks, ...pending.map((x) => `lock file absent: ${x}`), ...row.owed.map((o) => `owed ${o.id} → ${o.to}`));
        row.state = v.state;
        row.reason = v.reason + (pending.length && v.state !== 'INCORPORATED' ? `; lock ${pending.join('; ')} resolves when that branch integrates` : '') + (row.owed.length ? `; owed elsewhere: ${row.owed.map((o) => `${o.id} → ${o.to}`).join(', ')}` : '');
        break;
      }
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
  L.push('**States.** INCORPORATED — verified in the committed tree (matches: the keyed unit is agreed; disclose: the keyed unit carries a disclosure; wrong: a keyed correction cites every cited ruling, or a named lock asserts the answer; resolved by a RATIFIED ruling; or excluded). UNFIXED — ruled in the specs, not yet in the by-law table. OPEN — an operator question, or a disposition resting only on rows not yet RATIFIED.');
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
      const what = (x.question ? `Q: ${x.question}` : x.corrected_value || '—') + x.locks.map((lk) => ` Lock (${lk.satisfies.join(', ')}): \`${lk.file}\` › ${lk.describe} › ${lk.it}`).join('') + x.owed.map((o) => ` Owed: ${o.id} → ${o.to} (${o.why})`).join('');
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
