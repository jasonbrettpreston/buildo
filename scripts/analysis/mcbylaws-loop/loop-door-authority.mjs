// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-MC (PR-79f-1, the oracle-first door; MB-79 (f), 2026-11-03-batch-aw)
// SPEC LINK: ~/Buildo-scratch/mcbylaws/MB-79/f/plan.v9.1.md section 2.2 (ruling rows, case token, history) and 2.3 (`authority`, `history`)
// PURE: the door's authority and prereg-history checks over plain inputs that loop-door-git.mjs / loop-door-remote.mjs read from git.
// Every function returns string[] of `oracle_door_*` codes (empty = green) or a plain value; nothing here throws on bad input.

const ID_RE = /^[MP]-[0-9]+$/;
const TOKEN_CHAR = /[A-Za-z0-9._-]/;
const AUTHORITY = new Set(['RATIFIED', 'RULED']);
const CASE_TOKEN_RE = /[A-Za-z]{1,3}[0-9]{3,}/g;

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const asArray = (v) => (Array.isArray(v) ? v : []);
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The id line of `id` in the register text: `| **M-180** |` or `| ~~M-180~~ |` (universe.mjs parseRulings form). */
const idLineRe = (id) => new RegExp(`^\\|\\s*(?:\\*\\*${escapeRe(id)}\\*\\*|~~${escapeRe(id)}~~)\\s*\\|`);
const NOTE_LINE = /^\|\s*\|/;

/**
 * The row of `id` (X-5; universe.mjs:101): its id line plus every directly following line that starts `| |` (a dated-note row), up to
 * the next id row. null when the register holds no such id line.
 */
export function rowOf(register, id) {
  if (typeof register !== 'string' || typeof id !== 'string' || !id) return null;
  const lines = register.split(/\r?\n/);
  const re = idLineRe(id);
  const at = lines.findIndex((l) => re.test(l));
  if (at < 0) return null;
  const out = [lines[at]];
  // Only DIRECTLY following `| |` lines belong to the row: the next id row, a blank line or any other line ends it.
  for (let i = at + 1; i < lines.length && NOTE_LINE.test(lines[i]); i += 1) out.push(lines[i]);
  return out.join('\n');
}

/** The status word of `id`, read from its id line's LAST cell exactly as universe.mjs parseRulings reads it; null when absent. */
export function statusOf(register, id) {
  const row = rowOf(register, id);
  if (row === null) return null;
  const line = row.split('\n')[0];
  if (new RegExp(`^\\|\\s*~~${escapeRe(id)}~~`).test(line)) return 'RETIRED';
  const cells = line.split('|').map((c) => c.trim()).filter((_c, i, a) => i > 0 && i < a.length - 1);
  const status = cells[cells.length - 1] || '';
  if (/^RATIFIED\b/.test(status)) return 'RATIFIED';
  if (/^RULED\b/.test(status)) return 'RULED';
  if (/^PROPOSED\b/.test(status)) return 'PROPOSED';
  if (/^RETIRED\b/.test(status)) return 'RETIRED';
  return 'UNKNOWN';
}

/** Every index of `#<ref>` in `row` that is followed by a non-token character (or the end): the register's citation form (P-2). */
function refHits(row, ref) {
  const out = [];
  if (typeof row !== 'string' || typeof ref !== 'string' || !ref) return out;
  const needle = `#${ref}`;
  let from = 0;
  for (;;) {
    const i = row.indexOf(needle, from);
    if (i < 0) break;
    const next = row[i + needle.length];
    if (next === undefined || !TOKEN_CHAR.test(next)) out.push(i);
    from = i + 1;
  }
  return out;
}

/** Whether the row cites `<stem>#<ref>` with `ref` ending on a token boundary. */
export const refInRow = (row, ref) => refHits(row, ref).length > 0;

/** The log stem (F-2): the maximal [A-Za-z0-9._-] run immediately before the first `#<ref>` hit; null when there is none. */
export function stemOf(row, ref) {
  const hits = refHits(row, ref);
  if (!hits.length) return null;
  const i = hits[0];
  let j = i;
  while (j > 0 && TOKEN_CHAR.test(row[j - 1])) j -= 1;
  const stem = row.slice(j, i);
  return stem ? stem : null;
}

/** The decision `ref` in a decisions log (`{decisions: [...]}`), or null. */
function decisionIn(log, ref) {
  if (!isObject(log)) return null;
  const found = asArray(log.decisions).find((d) => isObject(d) && d.id === ref);
  return found || null;
}

/** The case tokens (X-1): every [A-Za-z]{1,3}[0-9]{3,} run of `case`, plus the path basename without extension when `case` holds it. */
export function caseTokens(caseText, filePath) {
  const text = typeof caseText === 'string' ? caseText : '';
  const out = [...new Set(text.match(CASE_TOKEN_RE) || [])];
  const base = typeof filePath === 'string' ? filePath.split('/').pop() || '' : '';
  const stems = [base.replace(/\.[^.]*$/, ''), base.split('.')[0] || ''].filter((s) => s && s.length >= 3);
  for (const s of stems) if (tokenIn(text, s) && !out.includes(s)) out.push(s);
  return out;
}

/** `token` occurs in `text` on its own boundary (no [A-Za-z0-9] on either side). */
function tokenIn(text, token) {
  if (typeof text !== 'string' || !token) return false;
  let from = 0;
  for (;;) {
    const i = text.indexOf(token, from);
    if (i < 0) return false;
    const before = i > 0 ? text[i - 1] : '';
    const after = text[i + token.length] || '';
    if (!/[A-Za-z0-9]/.test(before) && !/[A-Za-z0-9]/.test(after)) return true;
    from = i + 1;
  }
}

const decisionText = (d) => (isObject(d) ? [d.question, d.recommendation, d.operator_quote].filter((s) => typeof s === 'string').join('\n') : '');

/**
 * The ruling-row and case-token checks for the entries of ONE prereg (plan 2.2). `authority`:
 * `{register, decisions: {stem: log|null}, pushed: {"<id>#<ref>": [{row, decision}]} | null}` read at the prereg's parent (and at
 * every passing merge base M, O-29 YES, commit and push only; `pushed` is null in ci). `rulingsAtRevision`: `{id: status}` at the
 * round's revision (X-6). Entries are de-duplicated by (ruling, ruling_ref) for the row checks; the case token runs per entry.
 */
export function checkAuthority({ entries, authority, rulingsAtRevision, mode } = {}) {
  const out = [];
  const list = asArray(entries).filter(isObject);
  if (!list.length) return out;
  const auth = isObject(authority) ? authority : {};
  const register = typeof auth.register === 'string' ? auth.register : null;
  if (register === null) return ['oracle_door_register_unreadable'];
  const decisions = isObject(auth.decisions) ? auth.decisions : {};
  const ci = mode === 'ci';
  const pushed = ci ? null : isObject(auth.pushed) ? auth.pushed : {};
  const revision = isObject(rulingsAtRevision) ? rulingsAtRevision : {};
  const bad = new Set();
  const seen = new Set();
  for (const e of list) {
    const id = String(e.ruling);
    const ref = String(e.ruling_ref);
    const key = `${id}#${ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const status = ID_RE.test(id) ? statusOf(register, id) : null;
    if (!ID_RE.test(id) || !AUTHORITY.has(status) || !AUTHORITY.has(revision[id])) {
      out.push(`oracle_door_ruling_not_authority:${id}`);
      bad.add(key);
      continue;
    }
    const row = rowOf(register, id);
    if (!refInRow(row, ref)) {
      out.push(`oracle_door_ruling_ref_not_in_row:${id}`);
      bad.add(key);
      continue;
    }
    // A `#<ref>` with no stem run before it is a citation with no log to read: `_log_missing` (F-2).
    const stem = stemOf(row, ref);
    if (!stem || !decisionIn(decisions[stem], ref)) {
      out.push(`oracle_door_ruling_log_missing:${id}`);
      bad.add(key);
      continue;
    }
    if (pushed !== null && asArray(pushed[key]).length === 0) {
      out.push(`oracle_door_ruling_not_pushed:${id}`);
      bad.add(key);
    }
  }
  for (const e of list) {
    const id = String(e.ruling);
    const ref = String(e.ruling_ref);
    const key = `${id}#${ref}`;
    if (bad.has(key)) continue;
    // The row and the decision are read at M under O-29 YES (commit and push), at the prereg parent in ci (adversary R1-1).
    const texts = pushed !== null
      ? asArray(pushed[key]).flatMap((m) => [isObject(m) && typeof m.row === 'string' ? m.row : '', decisionText(isObject(m) ? m.decision : null)])
      : [rowOf(register, id) || '', decisionText(decisionIn(decisions[stemOf(rowOf(register, id), ref)], ref))];
    const tokens = caseTokens(e.case, e.path);
    if (!tokens.some((t) => texts.some((tx) => tokenIn(tx, t)))) out.push(`oracle_door_case_not_in_ruling:${id}:${String(e.case)}`);
  }
  return out;
}

/**
 * The prereg-history checks for ONE prereg (plan 2.2, 2.3 `history`; P-14, P-16, F-3). `history`:
 * `{commits: [{sha, blob, files}] (oldest first, the door's --full-history --topo-order walk), tipBlob, work: [{sha, paths, descends}]}`.
 * `coveredPaths`: the paths this prereg lists. The `ABSENT` blob marks a listed commit at which the file is gone (a deleted prereg).
 */
export function checkHistory({ history, preregFile, coveredPaths } = {}) {
  const h = isObject(history) ? history : null;
  const commits = h ? asArray(h.commits).filter(isObject) : [];
  if (!commits.length) return ['oracle_door_prereg_not_committed'];
  const out = [];
  const first = commits[0];
  const blobs = new Set(commits.map((c) => String(c.blob)));
  if (blobs.size > 1 || String(h.tipBlob) !== String(first.blob)) out.push('oracle_door_prereg_edited');
  const files = asArray(first.files);
  if (files.length !== 1 || files[0] !== preregFile) out.push('oracle_door_prereg_not_alone');
  const covered = new Set(asArray(coveredPaths));
  const late = asArray(h.work).some((w) => isObject(w) && asArray(w.paths).some((p) => covered.has(p)) && w.descends !== true);
  if (late) out.push('oracle_door_prereg_not_before');
  return out;
}
