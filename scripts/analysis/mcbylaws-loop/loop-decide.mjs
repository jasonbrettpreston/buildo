// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md PR-68 / G68-03, PR-68-8, PR-68-10 (findings must be register rows; the canary is run by the gate and never stored; rounds since thresholds are computed)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md sections 2, 5, 6 (decision record, run honesty, rounds since thresholds)
// Pure functions return string[] of violation codes (empty = green); a code with a detail is `code:detail`.
// A `rulings` argument is a Map(id -> status) as parseRulings returns; authority = status RATIFIED or RULED.
export const ACCEPT = 'accept';
export const REVERT = 'revert';
export const AUTHORITY = ['RATIFIED', 'RULED'];
export const MIN_REASON = 20;
const CANARY_MARKER = 'canary';
const FINDING_ID_RE = /^M-\d+$/;

function isAuthority(status) {
  return AUTHORITY.includes(status);
}

function longEnough(value) {
  return typeof value === 'string' && value.trim().length >= MIN_REASON;
}

function isRegisterFindingId(id, rulings) {
  return typeof id === 'string' && FINDING_ID_RE.test(id) && isAuthority(rulings.get(id));
}

function isRegisterCardId(id, cardExists) {
  return typeof id === 'string' && id.length > 0 && cardExists(id) === true;
}

function checkFindings(rec, rulings, cardExists) {
  const out = [];
  const findings = Array.isArray(rec.accepted_findings) ? rec.accepted_findings : [];
  for (const item of findings) {
    const finding = item && typeof item === 'object' ? item : {};
    const hasCase = typeof finding.case === 'string' && finding.case.length > 0;
    if (!hasCase) {
      out.push('finding_case_missing');
    } else if (!longEnough(finding.reason)) {
      out.push(`finding_reason_short:${finding.case}`);
    }
    const id = finding.finding_id;
    if (!isRegisterFindingId(id, rulings) && !isRegisterCardId(id, cardExists)) {
      out.push(`finding_id_not_in_register:${hasCase ? finding.case : ''}`);
    }
  }
  return out;
}

function findingCases(rec) {
  const findings = Array.isArray(rec.accepted_findings) ? rec.accepted_findings : [];
  const out = new Set();
  for (const item of findings) {
    if (item && typeof item === 'object' && typeof item.case === 'string') out.add(item.case);
  }
  return out;
}

function checkAcceptCases(rec) {
  const out = [];
  const cases = Array.isArray(rec.cases) ? rec.cases : [];
  const backed = findingCases(rec);
  for (const entry of cases) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.status === 'fail') out.push(`accept_with_failing_case:${entry.id}`);
    if (entry.status === 'accepted' && !backed.has(entry.id)) {
      out.push(`accepted_case_without_finding:${entry.id}`);
    }
  }
  return out;
}

export function checkDecision(rec, rulings, cardExists = () => false) {
  const record = rec && typeof rec === 'object' ? rec : {};
  if (record.decision !== ACCEPT && record.decision !== REVERT) return ['decision_missing'];
  const out = [];
  if (record.decision === ACCEPT && !longEnough(record.reason)) out.push('accept_without_reason');
  out.push(...checkFindings(record, rulings, cardExists));
  if (record.decision === ACCEPT) out.push(...checkAcceptCases(record));
  return out;
}

export function checkRun({ declaredIds, cases, skipped = 0, canary }) {
  const out = [];
  const declared = Array.isArray(declaredIds) ? declaredIds : [];
  const ran = Array.isArray(cases) ? cases.filter((c) => c && typeof c === 'object') : [];
  if (declared.length === 0) out.push('empty_set');
  const ranIds = new Set(ran.map((c) => c.id));
  const missing = declared.filter((id) => !ranIds.has(id)).length;
  if (missing > 0) out.push(`ran_fewer_than_declared:${missing}`);
  const skippedCount =
    (typeof skipped === 'number' && skipped > 0 ? skipped : 0) +
    ran.filter((c) => c.status === 'skipped').length;
  if (skippedCount > 0) out.push(`cases_skipped:${skippedCount}`);
  if (!canary || canary.observed !== 'fail') out.push('canary_not_red');
  for (const c of ran) {
    if (c.status !== 'pending' && !c.got_sha) out.push(`case_without_computed_value:${c.id}`);
  }
  for (const id of declared) {
    if (!ranIds.has(id)) out.push(`case_missing:${id}`);
  }
  return out;
}

export function mutateExpected(value) {
  if (Array.isArray(value)) {
    const copy = value.slice();
    if (copy.length === 0) return [CANARY_MARKER];
    copy[0] = mutateExpected(copy[0]);
    return copy;
  }
  if (value !== null && typeof value === 'object') {
    const copy = { ...value };
    const keys = Object.keys(copy).sort();
    if (keys.length === 0) return copy;
    copy[keys[0]] = mutateExpected(copy[keys[0]]);
    return copy;
  }
  if (typeof value === 'number') return value + 1;
  if (typeof value === 'string') return `${value}~`;
  if (typeof value === 'boolean') return !value;
  return CANARY_MARKER;
}

export function runCanary(cases, compare) {
  const list = Array.isArray(cases) ? cases : [];
  const pick = list.find((c) => c && compare(c.expected, c.got) === 'pass');
  if (!pick) return { id: null, observed: 'none' };
  const observed = compare(mutateExpected(pick.expected), pick.got) === 'fail' ? 'fail' : 'pass';
  return { id: pick.id, observed };
}

export function roundsSinceThresholds(records) {
  const list = Array.isArray(records) ? records : [];
  let last = -1;
  for (let i = 0; i < list.length; i += 1) {
    const r = list[i];
    if (r && r.decision === ACCEPT && r.green === true) last = i;
  }
  return list.length - 1 - last;
}
