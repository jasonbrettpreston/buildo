// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-EY (the V3 label: nine conditions, fail
//            closed; enforcement E1 ratchet, E2 cutover gate, E3 hard gate); amends R-DT; R-DF (EXTERNALIZED,
//            closed grandfather lists); R-CV (pinned gate variable form)
//
// THE V3 LABEL'S ENFORCEMENT AND ITS NINTH CONDITION (McDonald's Airtight V3, operator y 2026-10-20: "the label
// V3 should only apply if all the standards are met, compute purity, gates standardized, cross step, registry";
// "the label should reflect and enforce the approach" -> "y" to enforcement gates 1-3; "y on 2 and 4"; "y to
// all"). Conditions (1)-(8) are decided by compute-literals.mjs `standardFailures` from step-validate's
// `standardSignals`; this module owns:
//
//   (9) CITED EXCEPTIONS — every per-step exception entry naming the step cites a register rule id that
//       resolves in Spec 124 §5 or a 124a LIVE REGISTER section (spec-split-check's one register reader):
//         grandfathered.json steps[<slug>]; the descriptor's deviations[]; a defect-ledger row naming the step
//         whose status is a declared deviation; staleness-disposition.json spec_version.not_executed[<slug>];
//         execution-budget-disposition.json step_timeout.pending (the step listed, judged by pending_why).
//   E1  RATCHET — V3_RATCHET_REL lists every step that has read V3. A listed step that reads V2 is RED. The
//       list only grows, and only through `--write` here (fed by `step-validate --all --fast --v3-json`).
//   E2  CUTOVER GATE — `converted_baseline` freezes the converted[] slugs at R-EY (2026-10-20). A converted
//       step outside it (a ③ cutover after R-EY) that reads V2 is RED. The baseline never grows.
//   E3  HARD GATE — every converted step reads V3, behind the pinned gate variable HARD_GATE_VARIABLE
//       (0 = off, the default; the operator turns it on by a reviewed seed + migration commit). A closed
//       exception list, HARD_GATE_EXCEPTIONS, holds exactly refresh_snapshot (D-P1); it expires when its
//       `expires_when_converted` slug reaches ③ — from then a still-listed exception is RED, on or off.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractRegisterRulingIds } from '../spec-split-check.mjs';
import { tableDataRows } from './markdown-table.mjs';
import { gateVariable } from './variables.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

export const V3_RATCHET_REL = 'scripts/steps/_schema/v3-label-high-water-mark.json';
export const HARD_GATE_VARIABLE = 'gate_v3_hard_gate_enabled';
const SPEC_124_REL = 'docs/specs/01-pipeline/124_step_standard_policy.md';
const SPEC_124A_REL = 'docs/specs/01-pipeline/124a_step_standard_policy_appendix.md';
const GRANDFATHERED_REL = 'scripts/steps/_schema/grandfathered.json';
const STALENESS_REL = 'scripts/steps/_schema/staleness-disposition.json';
const BUDGET_REL = 'scripts/steps/_schema/execution-budget-disposition.json';
const DEFECT_LEDGER_REL = 'docs/reports/defect-ledger.md';

/**
 * E3's CLOSED exception list (R-EY; operator y 2026-10-20 "(b) a closed exception for refresh_snapshot in the
 * hard gate"). Exactly one entry; a lock asserts the list verbatim, so adding one is a ruling, never an edit.
 */
export const HARD_GATE_EXCEPTIONS = Object.freeze([
  Object.freeze({
    slug: 'refresh_snapshot',
    expires_when_converted: 'permits',
    cites: 'D-P1 (operator ruling 2026-10-17, docs/reports/2026-10-17-batch4-p1-1-permits-assessment.md §6.2 lines 125-144; defect-ledger PM-D5); operator y 2026-10-20 on timing (R-EY)',
  }),
]);

const RULE_ID_RE = /\bR-[A-Z]{1,2}(?:[.-][0-9]+)?(?![A-Za-z0-9])/g;

/** The register ids an exception text cites that RESOLVE (a full id, or its base without an amendment suffix). PURE. */
export function resolvingRuleIds(text, registerIds) {
  const out = new Set();
  for (const m of String(text || '').matchAll(RULE_ID_RE)) {
    const id = m[0];
    const base = id.replace(/[.-][0-9]+$/, '');
    if (registerIds.has(id)) out.add(id);
    else if (registerIds.has(base)) out.add(base);
  }
  return [...out];
}

const textOf = (v) => (typeof v === 'string' ? v : JSON.stringify(v ?? ''));

/**
 * Every per-step exception entry naming `slug` (condition 9's population). PURE over loaded sources.
 * @returns {Array<{source: string, key: string, text: string}>}
 */
export function exceptionEntries(slug, { descriptor = null, grandfathered = {}, staleness = {}, budget = {}, defectRows = [] } = {}) {
  const out = [];
  const gf = grandfathered?.steps?.[slug];
  if (gf) out.push({ source: 'grandfathered', key: slug, text: textOf(gf) });
  const devs = Array.isArray(descriptor?.deviations) ? descriptor.deviations : [];
  for (const d of devs) out.push({ source: 'deviation', key: String(d?.from || ''), text: `${textOf(d?.adjudicated_by)} ${textOf(d?.why)}` });
  for (const r of defectRows) {
    if (r.step === slug && /declared deviation/i.test(r.status)) out.push({ source: 'ledger', key: r.id, text: r.text });
  }
  const sv = staleness?.spec_version?.not_executed?.[slug];
  if (sv) out.push({ source: 'spec_version', key: 'not_executed', text: textOf(sv) });
  const st = budget?.declarations?.step_timeout;
  if (st && Array.isArray(st.pending) && st.pending.includes(slug)) out.push({ source: 'step_timeout', key: 'pending', text: textOf(st.pending_why) });
  return out;
}

/**
 * Condition (9): the entries that cite no resolving register rule id, as compact failure details for the label
 * (`grandfathered:<slug> no rule id`, `deviations[] 3/5 no rule id`, `ledger LC-D6,LC-D7 no rule id`, …). PURE.
 * @returns {{fails: string[], uncited: Array<{source:string,key:string}>, total: number}}
 */
export function exceptionCitationFailures(entries, registerIds) {
  const uncited = entries.filter((e) => resolvingRuleIds(e.text, registerIds).length === 0);
  const fails = [];
  const by = (s) => uncited.filter((e) => e.source === s);
  const total = (s) => entries.filter((e) => e.source === s).length;
  if (by('grandfathered').length) fails.push(`grandfathered:${by('grandfathered')[0].key} no rule id`);
  if (by('deviation').length) fails.push(`deviations[] ${by('deviation').length}/${total('deviation')} no rule id`);
  if (by('ledger').length) fails.push(`ledger ${by('ledger').map((e) => e.key).join(',')} no rule id`);
  if (by('spec_version').length) fails.push('spec_version:not_executed no rule id');
  if (by('step_timeout').length) fails.push('step_timeout:pending no rule id');
  return { fails, uncited: uncited.map(({ source, key }) => ({ source, key })), total: entries.length };
}

/**
 * Spec 124 R-IH stage 1 (amends R-EY (9); operator approved 2026-10-20, `2026-10-20-chat-batch-d-rulings#CHAT-25`):
 * a deviation's authorizing citation is the one in `adjudicated_by`; a register id only in `why` is a rule the
 * deviation mentions. Stage 1 only REPORTS such entries (an advisory line in step-validate); condition (9) above
 * still reads `adjudicated_by` + `why` together, so no verdict moves until stage 3. PURE.
 * @returns {Array<{index: number, key: string, ids: string[]}>}
 */
export function whyOnlyDeviations(descriptor, registerIds) {
  const devs = Array.isArray(descriptor?.deviations) ? descriptor.deviations : [];
  const out = [];
  devs.forEach((d, index) => {
    if (resolvingRuleIds(textOf(d?.adjudicated_by), registerIds).length) return;
    const ids = resolvingRuleIds(textOf(d?.why), registerIds);
    if (ids.length) out.push({ index, key: String(d?.from || ''), ids });
  });
  return out;
}

/** R-IH stage 1: the advisory line for one step (null when nothing is why-only). PURE. */
export function whyOnlyAdvisoryLine(slug, found) {
  if (!found.length) return null;
  const list = found.map((f) => `deviations[${f.index}] "${f.key}" (${f.ids.join(', ')})`).join(' | ');
  return `[step-validate] R-EY (9) why-only ${slug} (advisory, Spec 124 R-IH stage 1; verdict unchanged): ${found.length} deviation${found.length === 1 ? ' cites' : 's cite'} a register id only in why: ${list}`;
}

/** R-IH stage 1 for one step over the disk sources. */
export function whyOnlySignal(descriptor, repoRoot = REPO_ROOT) {
  return whyOnlyDeviations(descriptor, loadExceptionSources(repoRoot).registerIds);
}

/** The defect-ledger rows (id, step, status, raw text), read through the one table-row reader (R-FA). PURE. */
export function parseDefectRows(text) {
  const rows = [];
  for (const { text: line } of tableDataRows(text)) {
    const cells = line.split(/(?<!\\)\|/).map((c) => c.trim());
    if (!/^[A-Z][A-Z0-9-]*-D[0-9]+/.test(cells[1] || '')) continue;
    rows.push({ id: cells[1], step: cells[2] || '', status: cells[5] || '', text: line });
  }
  return rows;
}

/** R-GR: a status naming a declared deviation (the R-EY (9) population, plus the wave-4 "DEVIATION at" spelling). */
const DECLARED_DEVIATION_RE = /declared deviation|\bDEVIATION at\b/i;
/** R-GR form 1: accepted and ruled — every cited id must resolve in the register. */
const CLOSED_FORM_RE = /^CLOSED · declared deviation \((R-[A-Z]{1,2}(?:\.[0-9]+)?(?:, R-[A-Z]{1,2}(?:\.[0-9]+)?)*)\)$/;
/** R-GR form 2: work still owed. */
const OPEN_FORM_RE = /^OPEN · \*\*PIN\*\*(?: |$)/;

/**
 * Spec 124 R-GR (operator y 2026-10-20): every defect-ledger row whose status names a declared deviation takes
 * one of two forms — `CLOSED · declared deviation (<rule id>[, …])`, each id resolving in the register, or
 * `OPEN · **PIN** <pin>`. Any third form is a finding. PURE.
 * @returns {Array<{id: string, why: string}>}
 */
export function ledgerStatusFormFindings(rows, registerIds) {
  const out = [];
  for (const r of rows || []) {
    const status = String(r.status || '');
    if (!DECLARED_DEVIATION_RE.test(status) || OPEN_FORM_RE.test(status)) continue;
    const m = CLOSED_FORM_RE.exec(status);
    if (!m) { out.push({ id: r.id, why: `status "${status}" is a third form — use "CLOSED · declared deviation (<rule id>)" or "OPEN · **PIN** <pin>" (R-GR)` }); continue; }
    const unresolved = m[1].split(', ').filter((id) => !registerIds.has(id));
    if (unresolved.length) out.push({ id: r.id, why: `cites ${unresolved.join(', ')}, not a register rule id (R-GR)` });
  }
  return out;
}

let cachedSources = null;
/** Disk sources for condition (9), read once per process. */
export function loadExceptionSources(repoRoot = REPO_ROOT) {
  if (cachedSources && cachedSources.repoRoot === repoRoot) return cachedSources;
  const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
  cachedSources = {
    repoRoot,
    registerIds: extractRegisterRulingIds(read(SPEC_124_REL), read(SPEC_124A_REL)),
    grandfathered: JSON.parse(read(GRANDFATHERED_REL)),
    staleness: JSON.parse(read(STALENESS_REL)),
    budget: JSON.parse(read(BUDGET_REL)),
    defectRows: parseDefectRows(read(DEFECT_LEDGER_REL)),
  };
  return cachedSources;
}

/** Condition (9) for one step over the disk sources: the failure details (`[]` = holds). */
export function exceptionsSignal(slug, descriptor, repoRoot = REPO_ROOT) {
  const src = loadExceptionSources(repoRoot);
  return exceptionCitationFailures(exceptionEntries(slug, { descriptor, ...src }), src.registerIds);
}

// ---------------------------------------------------------------------------
// E1 / E2 / E3
// ---------------------------------------------------------------------------

/** The ratchet file, or a fail-closed empty shape when missing (a missing file is itself reported by E1). */
export function loadRatchet(repoRoot = REPO_ROOT) {
  const p = path.join(repoRoot, V3_RATCHET_REL);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * E1: a listed step that reads V2 (evaluated this run) is RED. A missing ratchet file is RED. PURE.
 * @param {Map<string,string>} labels slug -> 'V3'|'V2' for the steps evaluated this run
 */
export function ratchetFindings(labels, ratchet) {
  if (!ratchet || !Array.isArray(ratchet.v3)) return [`E1: ${V3_RATCHET_REL} is missing or has no v3[]`];
  return ratchet.v3.filter((slug) => labels.get(slug) === 'V2').map((slug) => `E1: ${slug} is on the V3 ratchet but reads V2`);
}

/**
 * E2: a converted step outside `converted_baseline` (a ③ cutover after R-EY) that reads V2 is RED. PURE.
 * @param {Array<{slug:string, stage:string}>} rows the rows evaluated this run
 */
export function cutoverFindings(rows, labels, ratchet) {
  if (!ratchet || !Array.isArray(ratchet.converted_baseline)) return [`E2: ${V3_RATCHET_REL} has no converted_baseline[]`];
  const base = new Set(ratchet.converted_baseline);
  return rows.filter((r) => r.stage === 'converted' && !base.has(r.slug) && labels.get(r.slug) !== 'V3')
    .map((r) => `E2: ${r.slug} entered converted[] after R-EY and reads ${labels.get(r.slug) || 'unevaluated'} (a cutover needs V3 under all nine conditions)`);
}

/**
 * E3: with the switch on, every converted step evaluated this run reads V3 unless it is a live closed exception.
 * Whatever the switch, an exception whose `expires_when_converted` slug is converted is RED (it auto-expires).
 * PURE. `registry` is every row (slug, stage) — expiry reads the whole registry, not only this run's targets.
 * @returns {{findings: string[], wouldFail: string[]}} `wouldFail` = the converted V2 steps (printed when off)
 */
export function hardGateFindings({ enabled, rows, labels, registry, exceptions = HARD_GATE_EXCEPTIONS }) {
  const findings = [];
  const convertedAll = new Set((registry || []).filter((r) => r.stage === 'converted').map((r) => r.slug));
  const live = new Set();
  for (const ex of exceptions) {
    if (convertedAll.has(ex.expires_when_converted)) findings.push(`E3: exception ${ex.slug} expired — ${ex.expires_when_converted} reached ③; remove it from HARD_GATE_EXCEPTIONS`);
    else live.add(ex.slug);
  }
  const wouldFail = rows.filter((r) => r.stage === 'converted' && labels.get(r.slug) !== 'V3' && !live.has(r.slug)).map((r) => r.slug);
  if (enabled) for (const slug of wouldFail) findings.push(`E3: converted step ${slug} reads V2 (hard gate on)`);
  return { findings, wouldFail };
}

/** The E3 switch, read file-only from the pinned seed (R-CV): 1 = on, 0 = off. Anything else throws. */
export function hardGateEnabled() {
  const v = gateVariable(HARD_GATE_VARIABLE);
  if (v !== 0 && v !== 1) throw new Error(`${HARD_GATE_VARIABLE} must be 0 or 1, got ${v}`);
  return v === 1;
}

export const RATCHET_COMMENT = 'Spec 124 R-EY (McDonald\'s Airtight V3, operator y 2026-10-20). E1: v3[] lists every step that has read standard=V3; a listed step that reads V2 is RED in step-validate. It only grows, and only through its generator: node scripts/analysis/step-validate.mjs --all --fast --v3-json=<f> then node scripts/analysis/gates/v3-label.mjs --write <f>. E2: converted_baseline[] freezes converted[] at R-EY; a converted step outside it must read V3. It is seeded once and never grows.';

/**
 * The E1 generator's merge: the existing v3[] UNION the steps reading V3 now (never removes — a V2 regression is
 * E1's finding, not a list edit), sorted. converted_baseline is carried unchanged; only when the file has none
 * yet (the R-EY seed) is it set from the converted steps of this run. PURE.
 * @param {Map<string,{standard:string, stage:string}>} labels
 */
export function mergeRatchet(existing, labels, today) {
  const v3 = new Set(Array.isArray(existing?.v3) ? existing.v3 : []);
  for (const [slug, l] of labels) if (l.standard === 'V3') v3.add(slug);
  const baseline = Array.isArray(existing?.converted_baseline)
    ? existing.converted_baseline
    : [...labels].filter(([, l]) => l.stage === 'converted').map(([slug]) => slug).sort();
  return { $comment: RATCHET_COMMENT, recorded_at: today, v3: [...v3].sort(), converted_baseline: baseline };
}

function main(argv) {
  const i = argv.indexOf('--write');
  if (i === -1) throw new Error('usage: --write <labels.json>  (labels.json from `step-validate --all --fast --v3-json=<path>`)');
  const labelsPath = argv[i + 1];
  const labels = new Map(Object.entries(JSON.parse(fs.readFileSync(labelsPath, 'utf8'))));
  const existing = loadRatchet();
  const next = mergeRatchet(existing, labels, new Date().toISOString().slice(0, 10));
  fs.writeFileSync(path.join(REPO_ROOT, V3_RATCHET_REL), `${JSON.stringify(next, null, 2)}\n`);
  console.log(`[v3-label] ${V3_RATCHET_REL}: v3[] = ${next.v3.length} (${next.v3.join(', ')})`);
}

const isEntry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(`[v3-label] ${err.message}`);
    process.exit(1);
  }
}
