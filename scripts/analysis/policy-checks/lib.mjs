// SPEC LINK: MORNING-DECISIONS.md:725 (the eight automatic checks: McStorage writer/stamp, nothing new without a ruling); MORNING-DECISIONS.md:750 (re-use);
//            docs/specs/00-architecture/137_mcqueue.md :109 (dated-note form); docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-BA (closed gate set) and R-BG (changed by a row plus an Operator-Ruling trailer).
// Shared helpers of scripts/analysis/policy-checks.mjs. Node only, no DB, no network.
//
// THE ONE ESCAPE is the policy ledger, docs/reports/policy/policy-ledger.json: rows { rule, item, ruling, quote }.
//   rule    a rule id of a check (chk5-producer, chk3-new-component, ...)
//   item    the trimmed source line text, path or name the check reports (TEXT, not a line number, like gate E in scripts/analysis/gates/compute-literals.mjs)
//   ruling  a dated-note ruling id: MD:YYYY-MM-DD:<line> (the operator decisions log), M-<n> or D-<n>; never M-246 (that is the dated-note convention, not an approval)
//   quote   the operator's words, verbatim
// MATCHING is NOT written here: it is matchLedger from scripts/analysis/gates/ledger.mjs (one row allows exactly ONE violation: a second site is a collision, R-BZ C2). The ledger's closed gate letters
// and dispositions are the step gates' (Spec 124 R-BA) and are left alone: the policy rows reach matchLedger under their own gate word POLICY. This file exists for what ledger.mjs cannot carry:
// the ruling-id and quote validation, the Operator-Ruling trailer check, and the orphan rule for rows whose approved thing is gone.
import { matchLedger } from '../gates/ledger.mjs';

export const GATE_WORD = 'POLICY';
export const globRe = (glob) => new RegExp(`^${glob.match(/\*\*\/|\*\*|\*|\?|[^*?]+/g).map((t) => (t === '**/' ? '(?:[^/]+/)*' : t === '**' ? '.*' : t === '*' ? '[^/]*' : t === '?' ? '[^/]' : t.replace(/[.+^${}()|[\]\\]/g, (c) => `\\${c}`))).join('')}$`);
export const matchAny = (globs, p) => (globs || []).some((g) => globRe(g).test(p));
export const isTest = (p) => /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/.test(p);
export const isSource = (p) => /\.[cm]?[jt]sx?$/.test(p);

/** Removes // and block comments but keeps string contents (a name inside a comment is not code). Line breaks are kept so line numbers hold. */
export function stripComments(src) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') { out += src[i + 1] ?? ''; i += 2; continue; }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i += 1; continue; }
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i += 1; continue; }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i += 1; }
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

const trimLine = (src, line) => (src.split('\n')[line - 1] || '').trim();
/** A finding: rule id, file, line (0 = none) and `item` = the ledger text (the trimmed source line, or the file path when there is no line). */
export const finding = (rule, file, line, msg, src) => ({ rule, file, line, msg, item: src && line ? trimLine(src, line) : file });

export const RULING_RE = /^(MD:\d{4}-\d\d-\d\d:\d+|M-\d+|D-\d+)$/;
/** Problems with the ledger itself (empty = well-formed). Fail closed: the driver exits 1 on any. */
export function validateLedger(rows) {
  if (!Array.isArray(rows)) return ['ledger rows is not an array'];
  const bad = [];
  for (const r of rows) {
    const id = `${r && r.rule}@${r && r.item}`;
    if (!r || typeof r !== 'object') bad.push(`ledger row ${JSON.stringify(r)} is not an object`);
    else if (!/^chk\d-[\w-]+$/.test(r.rule || '') || typeof r.item !== 'string' || !r.item.trim()) bad.push(`ledger row ${id}: needs a rule id (chk<n>-<name>) and the item text`);
    else if (!RULING_RE.test(r.ruling || '') || r.ruling === 'M-246') bad.push(`ledger row ${id}: ruling id ${JSON.stringify(r.ruling)} is not a dated-note ruling id (MD:date:line, M-n, D-n; M-246 is the convention, not an approval)`);
    else if (typeof r.quote !== 'string' || r.quote.trim().length < 12) bad.push(`ledger row ${id}: no verbatim operator quote`);
    else { const extra = Object.keys(r).filter((k) => !['rule', 'item', 'ruling', 'quote'].includes(k)); if (extra.length) bad.push(`ledger row ${id}: unknown key ${extra.join(', ')} (closed row shape)`); }
  }
  return bad;
}

/**
 * Drops the findings a ledger row allows, through ledger.mjs matchLedger (one row, one violation; a second site with the same key is a collision and stays a finding).
 * `orphans` = rows whose violation no longer exists, reported only for `treeRules` (rules whose findings describe the whole tree) and only when `all` is true: a staged run sees only the
 * staged files, so there an unmatched row is not evidence that the violation was fixed.
 * @returns {{unallowed: object[], orphans: object[]}}
 */
export function applyLedger(findings, rows, { all = false, treeRules = [] } = {}) {
  const asViolation = (f) => ({ step: f.rule, item: f.item });
  const res = matchLedger(GATE_WORD, findings.map(asViolation), (rows || []).map((r) => ({ gate: GATE_WORD, step: r.rule, item: r.item })));
  const allowedKeys = new Set(res.allowed.map((a) => `${a.violation.step}\u0000${a.violation.item}`));
  const taken = new Set();
  const unallowed = findings.filter((f) => {
    const key = `${f.rule}\u0000${f.item}`;
    if (allowedKeys.has(key) && !taken.has(key)) { taken.add(key); return false; }
    return true;
  });
  const orphans = all ? res.orphans.filter((o) => treeRules.includes(o.step)).map((o) => (rows || []).find((r) => r.rule === o.step && r.item === o.item)) : [];
  return { unallowed, orphans };
}

/** commit-msg leg: every ledger row ADDED by this commit needs its ruling id in an `Operator-Ruling:` trailer of the same message (the trailer the repo already uses). */
export function trailerCheck(addedRows, message) {
  const trailer = message.split('\n').filter((l) => /^Operator-Ruling:/.test(l)).join(' ');
  return (addedRows || []).filter((r) => !trailer.includes(r.ruling)).map((r) => `ledger row ${r.rule}@${r.item}: ruling id ${r.ruling} is not in an Operator-Ruling: trailer of this commit`);
}
