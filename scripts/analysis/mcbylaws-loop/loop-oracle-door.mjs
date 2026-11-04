// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-MC (PR-79f-1, the oracle-first door; MB-79 (f), 2026-11-03-batch-aw)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-79/f/plan.v9.1.md sections 2.1 (the entry), 2.2 (the checks and codes) and 2.4 (the notes)
// PURE: checkOracleDoor(door) judges the plain `ctx.door` object the context collects when checkOracleFirst would fire.
// [] means every modified oracle path is listed line for line in a joined prereg whose rulings and history hold; the caller
// (loop-gate-eval.mjs) then drops `oracle_moved_with_code` and prints doorPassNotes(door). Nothing here reads git or throws on bad input.
import { checkAuthority, checkHistory } from './loop-door-authority.mjs';

const ELIGIBLE_EXT = new Set(['ts', 'tsx', 'mjs', 'js', 'json']);
const PER_COMMIT_BAD = ['D', 'R', 'C', 'T'];
const ID_RE = /^[MP]-[0-9]+$/;
const REF_RE = /^[A-Za-z0-9._-]+$/;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const PREREG_RE = /^scripts\/analysis\/bylaw-validation\/coa-expected\/prereg-[^/]*\.json$/;
const HEADER_KINDS = [
  ['old mode', 'old mode'],
  ['new mode', 'new mode'],
  ['similarity', 'similarity'],
  ['dissimilarity', 'similarity'],
  ['rename', 'rename'],
  ['copy', 'copy'],
  ['Binary', 'Binary'],
  ['Subproject', 'Subproject'],
];
const LINE_CUT = 80;
const ENTRY_LINE_CUT = 200;
const NOTE_BUDGET = 14;
const ENTRY_CAP = 12;
const SUMMARY_CAP = 4;
const CI_NOTE = 'oracle_door_pushed_clause_not_evaluated:ci';

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const asArray = (v) => (Array.isArray(v) ? v : []);
const isStr = (v) => typeof v === 'string';
const strOrNull = (v) => v === null || isStr(v);
const cut = (s, n) => String(s).slice(0, n);
const dedupe = (list) => [...new Set(list)];

/**
 * The changed lines of a unified diff (P-10, P-11): a STATEFUL parser. Header lines are read only before the first `@@` of each file
 * (`diff --git` starts a new file header); after `@@` every `-`/`+` line is content, `\` lines are skipped. Lines are trimmed (a
 * trailing CR goes) and blank lines are dropped. `headers` lists the flagged header kinds (mode, similarity, rename, copy, binary).
 */
export function movedLines(diff) {
  const removed = [];
  const added = [];
  const headers = [];
  let inHunk = false;
  for (const raw of String(diff === null || diff === undefined ? '' : diff).split('\n')) {
    if (raw.startsWith('diff --git ')) {
      inHunk = false;
      continue;
    }
    if (!inHunk) {
      if (raw.startsWith('@@')) {
        inHunk = true;
        continue;
      }
      for (const [prefix, kind] of HEADER_KINDS) {
        if (raw.startsWith(prefix) && !headers.includes(kind)) headers.push(kind);
      }
      continue;
    }
    if (raw.startsWith('@@')) continue;
    if (raw.startsWith('\\')) continue;
    const sign = raw[0];
    if (sign !== '-' && sign !== '+') continue;
    const text = raw.slice(1).trim();
    if (!text) continue;
    (sign === '-' ? removed : added).push(text);
  }
  return { removed, added, headers };
}

/** One entry's shape (P-12, X-10, R-11c); `null` when it is good, else the reason. Only entries with a string `path` are door entries. */
function shapeError(e) {
  if (!isObject(e)) return 'not-an-object';
  if (!isStr(e.case) || !e.case.trim()) return 'case';
  if (CONTROL_RE.test(e.case) || CONTROL_RE.test(e.path)) return 'control';
  if (!isStr(e.ruling) || !ID_RE.test(e.ruling)) return 'ruling';
  if (!isStr(e.ruling_ref) || !REF_RE.test(e.ruling_ref)) return 'ruling_ref';
  if (!strOrNull(e.old) || !strOrNull(e.new)) return 'old-new';
  if (e.old === null && e.new === null) return 'both-null';
  return null;
}

/** The joined preregs once each (by preregFile), with their door entries and their shape violations (indexes over the union). */
function collect(records) {
  const out = [];
  const seen = new Set();
  const shape = [];
  let i = 0;
  for (const r of asArray(records)) {
    if (!isObject(r) || seen.has(r.preregFile)) continue;
    seen.add(r.preregFile);
    const list = isObject(r.prereg) ? r.prereg.expected_value_changes : undefined;
    const entries = [];
    if (list !== undefined && !Array.isArray(list)) shape.push('oracle_door_entry_shape:list');
    for (const e of asArray(list)) {
      const index = i;
      i += 1;
      if (isObject(e) && !isStr(e.path)) continue; // another prereg shape (CoA moves, row transitions): not a door entry
      if (shapeError(e) !== null) {
        shape.push(`oracle_door_entry_shape:${index}`);
        continue;
      }
      entries.push({ ...e, old: e.old === undefined ? null : e.old, new: e.new === undefined ? null : e.new });
    }
    out.push({ record: r, entries });
  }
  return { preregs: out, shape };
}

/** Why a moved oracle path cannot be compared line by line (P-6, X-15), as the `<s>` of `oracle_door_path_ineligible:<s>:<path>`. */
export function ineligibleWhy(p, door) {
  const per = asArray(isObject(door.perCommitStatus) ? door.perCommitStatus[p] : undefined);
  const badPer = PER_COMMIT_BAD.find((s) => per.includes(s));
  if (badPer) return badPer;
  const net = isObject(door.net) ? door.net[p] : undefined;
  if (net !== 'M') return isStr(net) && net ? net : '<missing>';
  if (PREREG_RE.test(p)) return 'M';
  const cls = isObject(door.classes) ? door.classes[p] : undefined;
  if (cls !== 'oracle') return 'class';
  const ext = (p.split('/').pop() || '').includes('.') ? p.split('.').pop() : '';
  if (!ELIGIBLE_EXT.has(ext)) return 'ext';
  return null;
}

/** Multiset difference: the items of `have` not matched by `want`, in order. */
function unmatched(have, want) {
  const pool = new Map();
  for (const w of want) pool.set(w, (pool.get(w) || 0) + 1);
  const out = [];
  for (const h of have) {
    const n = pool.get(h) || 0;
    if (n > 0) pool.set(h, n - 1);
    else out.push(h);
  }
  return out;
}

/** The join codes (2.2 rows 1-2; F-5a, R-9): returned before any diff is read. */
function joinCodes(door) {
  const unjoined = asArray(door.unjoined).filter(isObject);
  const records = asArray(door.records).filter(isObject);
  if (!unjoined.length && records.length) return [];
  const out = ['oracle_door_prereg_missing'];
  for (const u of unjoined) {
    if (u.recordPath === door.latestRecordPath) continue;
    const codes = asArray(u.violations).filter(isStr);
    for (const c of codes.length ? codes : ['no_prereg_for_increment']) out.push(`oracle_door_join:${u.recordPath}:${c}`);
  }
  return out;
}

/** The door's verdict over `ctx.door` (plan 2.2). `[]` = green. */
export function checkOracleDoor(door) {
  if (!isObject(door)) return [];
  const join = joinCodes(door);
  if (join.length) return join;
  const { preregs, shape } = collect(door.records);
  const all = preregs.flatMap((p) => p.entries);
  if (!all.length && !shape.length) return ['oracle_door_no_list'];
  const out = [...shape];
  const moved = dedupe(asArray(door.movedPaths).filter(isStr));
  const movedSet = new Set(moved);
  const byPath = new Map();
  for (const e of all) {
    if (!byPath.has(e.path)) byPath.set(e.path, []);
    byPath.get(e.path).push(e);
  }
  for (const p of moved) {
    const why = ineligibleWhy(p, door);
    if (why !== null) {
      out.push(`oracle_door_path_ineligible:${why}:${p}`);
      continue;
    }
    const diff = isObject(door.diffs) ? door.diffs[p] : undefined;
    if (!isStr(diff)) {
      out.push(`oracle_door_diff_unreadable:${p}`);
      continue;
    }
    const lines = movedLines(diff);
    // P-11: a diff with no changed line (mode-only, blank-only) is empty; one that changes lines AND carries a mode, similarity,
    // rename, copy or binary header cannot be compared line by line. Both refuse; neither is ever compared.
    if (!lines.removed.length && !lines.added.length) {
      out.push(`oracle_door_empty_diff:${p}`);
      continue;
    }
    if (lines.headers.length) {
      out.push(`oracle_door_path_ineligible:header:${p}`);
      continue;
    }
    const listed = byPath.get(p) || [];
    const olds = listed.map((e) => e.old).filter(isStr).map((s) => s.trim()).filter(Boolean);
    const news = listed.map((e) => e.new).filter(isStr).map((s) => s.trim()).filter(Boolean);
    for (const l of unmatched(lines.removed, olds)) out.push(`oracle_door_unlisted_move:${p}:-:${cut(l, LINE_CUT)}`);
    for (const l of unmatched(lines.added, news)) out.push(`oracle_door_unlisted_move:${p}:+:${cut(l, LINE_CUT)}`);
    for (const l of unmatched(olds, lines.removed)) out.push(`oracle_door_extra_listed:${p}:old:${cut(l, LINE_CUT)}`);
    for (const l of unmatched(news, lines.added)) out.push(`oracle_door_extra_listed:${p}:new:${cut(l, LINE_CUT)}`);
  }
  for (const p of byPath.keys()) {
    if (!movedSet.has(p)) out.push(`oracle_door_listed_path_unchanged:${p}`);
  }
  for (const { record, entries } of preregs) {
    if (!entries.length) continue;
    out.push(...checkAuthority({ entries, authority: record.authority, rulingsAtRevision: door.rulingsAtRevision, mode: door.mode }));
    out.push(...checkHistory({ history: record.history, preregFile: record.preregFile, coveredPaths: dedupe(entries.map((e) => e.path)) }));
  }
  return dedupe(out);
}

const show = (v) => (v === null ? '(none)' : String(v).trim());

/**
 * The pass notes (2.4, P-4, cross-read re-check 2): one summary per ruling (at most 4, then `oracle_door_rulings_more:<n>`), one line per
 * entry (capped so the door's lines never exceed 14, then `oracle_door_entries_more:<n>`), and the ci note. Only for a green door.
 */
export function doorPassNotes(door) {
  if (!isObject(door)) return [];
  const { preregs } = collect(door.records);
  const entries = preregs.flatMap((p) => p.entries);
  const groups = new Map();
  for (const e of entries) {
    const key = `${e.ruling} #${e.ruling_ref}`;
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  const summaries = [...groups].map(([key, n]) => `oracle_door_passed:${key} ${n} entries`);
  const head = summaries.length > SUMMARY_CAP
    ? [...summaries.slice(0, SUMMARY_CAP), `oracle_door_rulings_more:${summaries.length - SUMMARY_CAP}`]
    : summaries;
  const ci = door.mode === 'ci' ? [CI_NOTE] : [];
  const room = Math.min(ENTRY_CAP, NOTE_BUDGET - head.length - ci.length);
  const fitsAll = entries.length <= room;
  const cap = fitsAll ? entries.length : Math.max(0, Math.min(ENTRY_CAP, NOTE_BUDGET - head.length - 1 - ci.length));
  const lines = entries
    .slice(0, cap)
    .map((e) => cut(`oracle_door_entry:${e.path}: ${show(e.old)} -> ${show(e.new)}  [${e.ruling} #${e.ruling_ref}]`, ENTRY_LINE_CUT));
  const more = fitsAll ? [] : [`oracle_door_entries_more:${entries.length - cap}`];
  return [...head, ...lines, ...more, ...ci];
}
