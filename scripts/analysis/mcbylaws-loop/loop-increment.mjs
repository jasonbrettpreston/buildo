// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md PR-68 / M-3xx (a round declares exactly one increment; the closed set 1..10 incl. 6b)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md section 5 (one increment per round, no skip-ahead, increment green)
// Pure functions return string[] of violation codes (empty = green); a code with a detail is `code:detail`.
// The only disk read is data/increments.json, resolved relative to the repo root passed in.
import fs from 'node:fs';
import path from 'node:path';

const DATA_REL = 'scripts/analysis/mcbylaws-loop/data/increments.json';
const GREEN_STATUSES = ['pass', 'accepted'];

function isIncrementId(value, ids) {
  return typeof value === 'string' && ids.includes(value);
}

function distinctIncrements(rowsTouched) {
  const seen = new Set();
  for (const row of rowsTouched) {
    if (row && row.increment !== null && row.increment !== undefined) seen.add(row.increment);
  }
  return [...seen];
}

export function loadIncrements(root) {
  const file = path.join(root, DATA_REL);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`data_missing: ${file}`);
  }
  const ids = parsed && Array.isArray(parsed.ids) ? parsed.ids : null;
  if (!ids || ids.length === 0 || ids.some((id) => typeof id !== 'string' || id.length === 0)) {
    throw new Error(`data_missing: ${file}`);
  }
  return ids;
}

export function checkOneIncrement({ prereg, record, rowsTouched = [], newCases = [], ids }) {
  const out = [];
  for (const [label, increment] of [['prereg', prereg.increment], ['record', record.increment]]) {
    if (!isIncrementId(increment, ids)) out.push(`increment_not_one_id:${label}`);
  }
  if (prereg.increment !== record.increment) out.push('increment_differs_prereg_vs_record');
  if (distinctIncrements(rowsTouched).length > 1) out.push('rows_from_two_increments');
  for (const item of newCases) {
    if (!item || item.introduced_in !== record.increment) out.push(`regression_case_wrong_increment:${item ? item.id : ''}`);
  }
  return out;
}

export function checkSkipAhead(increment, greenHistory, ids) {
  const i = ids.indexOf(increment);
  if (i < 0) return ['increment_not_one_id:skip'];
  if (i > 0 && !greenHistory.includes(ids[i - 1])) return ['increment_skips_ahead_previous_not_green'];
  return [];
}

export function greenIncrements(records) {
  const seen = new Set();
  for (const rec of records) {
    if (rec && rec.decision === 'accept' && rec.green === true) seen.add(rec.increment);
  }
  return [...seen];
}

/**
 * The current increment is green when every case in scope reaches it is green, the floors hold and the canary went red. O68-17: an
 * increment that is not exactly one known id is refused by name (an unknown id would put every group out of scope and read green).
 * PURE.
 */
export function incrementGreen({ increment, ids, groups, cases, floorsOk, canaryOk }) {
  const at = ids.indexOf(increment);
  if (!isIncrementId(increment, ids)) return { green: false, reasons: ['increment_not_one_id'] };
  const inScope = new Set();
  for (const g of groups) {
    if (g.introduced_in === 'baseline' || (at >= 0 && ids.indexOf(g.introduced_in) >= 0 && ids.indexOf(g.introduced_in) <= at)) {
      inScope.add(g.id);
    }
  }
  const reasons = [];
  const scoped = cases.filter((c) => inScope.has(c.group));
  for (const c of scoped) {
    if (!GREEN_STATUSES.includes(c.status)) reasons.push(`case_not_green:${c.id}`);
  }
  if (!floorsOk) reasons.push('floors_fell');
  if (!canaryOk) reasons.push('canary_not_red');
  if (scoped.length === 0) reasons.push('empty_set');
  return { green: reasons.length === 0, reasons };
}
