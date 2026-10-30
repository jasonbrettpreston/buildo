// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-322 (floors only rise; a fall needs a ruling), M-360 (a test never asserts a red floor), M-330 (round 0 sets lines through the door with a ruling), M-372 (OWED), PR-68-7 (OWED lines cannot worsen), M-343 (RULED / RATIFIED is authority)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-68/plan.md section 4 (a floor fall blocks the commit; floors move only through the door), G68-02 (the ruling must resolve)
// Pure functions return string[] of violation codes (empty = green); a code with a detail is `code:detail`.
// The percent checks are NOT re-implemented here: reportFloors and statsOf are imported unchanged from ../bylaw-validation/coa-round.mjs.
// No IO, no env, no exits: this module decides, the caller prints and exits.
import { reportFloors, statsOf } from '../bylaw-validation/coa-round.mjs';

const AUTHORITY = new Set(['RATIFIED', 'RULED']);
const METRICS = ['accuracy', 'answered'];
const isAuthority = (rulings, id) => Boolean(rulings) && AUTHORITY.has(rulings.get(id));
const clone = (x) => JSON.parse(JSON.stringify(x));

/**
 * Every floor line as "<line>" -> n. A count floors file ({lines: {...}}) returns a copy of its lines plus its OWED baselines as
 * "owed_baseline <line>" (O68-11: lowering or deleting a baseline needs a ruling); a percent floors file gives
 * "overall <m>", "pooled articles <m>" (when a pooled block exists) and "article <a> <m>" for every article. PURE.
 */
export function flattenFloors(floors) {
  const f = floors || {};
  if (f.lines && typeof f.lines === 'object') {
    const out = { ...f.lines };
    for (const line of Object.keys(f.owed_baseline || {})) {
      if (typeof f.owed_baseline[line] === 'number') out[`owed_baseline ${line}`] = f.owed_baseline[line];
    }
    return out;
  }
  const out = {};
  for (const m of METRICS) {
    if (f.overall && f.overall[m] != null) out[`overall ${m}`] = f.overall[m];
    if (f.pooled && f.pooled[m] != null) out[`pooled articles ${m}`] = f.pooled[m];
  }
  for (const a of Object.keys(f.articles || {}).sort()) {
    for (const m of METRICS) {
      if (f.articles[a] && f.articles[a][m] != null) out[`article ${a} ${m}`] = f.articles[a][m];
    }
  }
  return out;
}

/**
 * O68-13: a named line excuses a key only if it is the key exactly. A key minus its metric suffix ("overall" for "overall
 * accuracy") names that one key, so it counts as a known line, but it never excuses the other metric of the same line; a bare
 * prefix such as "article" names nothing at all (see checkFloorEdit's ruling_line_unknown).
 */
const namesLine = (line, key) => typeof line === 'string' && line === key;

/** O68-13: the keys one named line can point at: the key itself and the key minus its metric suffix. */
const knownLines = (line, keys) =>
  typeof line === 'string' && keys.some((key) => key === line || METRICS.some((m) => key === `${line} ${m}`));

/**
 * An edit from base to cur (base null: nothing to compare, green). The history may only grow (shorter -> rulings_history_shortened);
 * each new entry's ruling must be RATIFIED or RULED in `rulings` (else ruling_not_authority:<ruling>, and it excuses nothing: a forged
 * ruling cannot cover a fall, M-322/G68-02). Only the lines named by the authority entries may fall or disappear; a named line that is
 * not a base floor key (nor a key minus its metric suffix) is ruling_line_unknown:<line> and excuses nothing (O68-13: a bare "article"
 * names no floor). Any other base line whose value fell or vanished is floor_lowered_without_ruling:<line>. PURE.
 */
export function checkFloorEdit(base, cur, rulings) {
  if (!base) return [];
  const out = [];
  const b = base || {};
  const c = cur || {};
  const before = Array.isArray(b.rulings) ? b.rulings : [];
  const after = Array.isArray(c.rulings) ? c.rulings : [];
  if (after.length < before.length) out.push('rulings_history_shortened');
  const added = after.length < before.length ? [] : after.slice(before.length);
  const was = flattenFloors(b);
  const now = flattenFloors(c);
  const known = (line) => knownLines(line, Object.keys(was));
  const named = [];
  for (const entry of added) {
    const id = entry && entry.ruling;
    if (isAuthority(rulings, id)) {
      for (const x of (entry && Array.isArray(entry.lines) ? entry.lines : [])) {
        if (!x || typeof x.line !== 'string') continue;
        if (known(x.line)) named.push(x.line);
        else out.push(`ruling_line_unknown:${x.line}`);
      }
    } else {
      out.push(`ruling_not_authority:${id}`);
    }
  }
  for (const line of Object.keys(was)) {
    const old = was[line];
    const next = now[line];
    const fell = next == null || next < old;
    if (!fell) continue;
    if (named.some((n) => namesLine(n, line))) continue;
    out.push(`floor_lowered_without_ruling:${line}`);
  }
  return out;
}

/**
 * The coa-round floors report against a run's rows. Each FAIL item becomes floor_fell:<msg>; an OWED line (a failing line named by an
 * OWED register row, M-372) is NOT a violation but is returned so checkOwedRatchet can watch it (M-360: never counted as PASS).
 * -> { violations, owed: [{line, measured, floor}], text }. PURE.
 */
export function checkPercentFloors(floors, rows, registerText) {
  const report = reportFloors(floors, statsOf(rows), registerText);
  const violations = report.fail.map((x) => `floor_fell:${x.msg}`);
  const owed = report.owed.map((x) => ({ line: x.line, measured: x.measured, floor: x.floor }));
  return { violations, owed, text: report.text };
}

/**
 * Count floors (schema loop-floors-v1) against measured counts ({ "<line>": n }). A measured value below its floor is
 * floor_fell:<line> <measured> < <floor>; a line with no measurement is floor_fell:<line> not_measured. PURE.
 */
export function checkCountFloors(floors, counts) {
  const out = [];
  const lines = (floors && floors.lines) || {};
  const measured = counts || {};
  for (const line of Object.keys(lines)) {
    const floor = lines[line];
    const got = measured[line];
    if (typeof got !== 'number' || !Number.isFinite(got)) out.push(`floor_fell:${line} not_measured`);
    else if (got < floor) out.push(`floor_fell:${line} ${got} < ${floor}`);
  }
  return out;
}

/**
 * An OWED line may not get worse while it is owed (PR-68-7): baselineOwed = { "<line>": measured } recorded by the round-0 ruling's
 * entry. A line measured below its baseline (beyond fp noise) is owed_line_fell_further:<line>. A line with no baseline has nothing to
 * ratchet. PURE.
 */
export function checkOwedRatchet(baselineOwed, owed) {
  const out = [];
  const base = baselineOwed || {};
  for (const item of owed || []) {
    if (!item || typeof item.line !== 'string') continue;
    const was = base[item.line];
    if (typeof was !== 'number' || !Number.isFinite(was)) continue;
    if (item.measured + 1e-9 < was) out.push(`owed_line_fell_further:${item.line}`);
  }
  return out;
}

/**
 * The one door for a count floor (M-330): a ruling that is RATIFIED or RULED sets one line, on a deep copy, and the entry is appended to
 * the history ({ruling, lines: [{line, from, to}]}, from null for a new line). Anything else throws and changes nothing. PURE.
 */
export function setCountFloor(floors, line, value, ruling, rulings) {
  if (!isAuthority(rulings, ruling)) throw new Error(`ruling_not_authority:${ruling}`);
  const next = clone(floors || {});
  next.lines = next.lines || {};
  next.rulings = Array.isArray(next.rulings) ? next.rulings : [];
  const from = next.lines[line] === undefined ? null : next.lines[line];
  next.lines[line] = value;
  next.rulings.push({ ruling, lines: [{ line, from, to: value }] });
  return next;
}
