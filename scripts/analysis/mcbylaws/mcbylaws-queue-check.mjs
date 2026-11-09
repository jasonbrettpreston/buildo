// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md MB-67 (commit gate); plan arm Q (lines 132-140),
//            R-KK (the queue is a witness) and R-KW (the queue names a landed commit).
//
// HOW arm Q judges the queue. `.cursor/MCBYLAWS-QUEUE.md` lists one heading per task (`**MB-nn <title> - <status>**`)
// and a DONE list whose lines cite the commit each finished task landed in (`MB-nn@<sha>`). Q4 asks first whether the
// queue is even tracked at the cited rev (CI cannot see an untracked file); Q2 reads one status word per heading (a
// derived READY is never hand-written); Q3 wants an `@sha` on every DONE entry; Q1 wants that sha to exist and be an
// ancestor of the tip; Q5 wants READY only when every WAITS id is DONE. Fail closed: a read that fails, a missing tip
// or an empty text is a failure line, never a pass.
// MF-24a (docs/specs/02-web-admin/128_surface_standard_policy.md §4.11 item 7, dated note 2026-11-06; D-9 b, operator
// "yes. proceed"): every function takes an optional `{queuePath, prefix}`; the defaults are the McBylaws queue and `MB`, so
// every McBylaws call and verdict is unchanged. The McFrontend queue is `MF_QUEUE_PATH` with prefix `MF`.

import { git, pathExistsAt, readAt } from './git-util.mjs';
import { parseRegisterRows } from './cite-parse.mjs';

/** The queue file, relative to the repo root. */
export const QUEUE_PATH = '.cursor/MCBYLAWS-QUEUE.md';
/** The McFrontend queue (MF-24a). */
export const MF_QUEUE_PATH = '.cursor/MCFRONTEND-QUEUE.md';

/** The McFrontend decisions register (Spec 135). Read for `FE rows owned` (Q6) and for `feRows` in gate.mjs. */
export const FE_REGISTER = 'docs/specs/02-web-admin/135_mcfrontend_decisions_register.md';

const PREFIXES = new Set(['MB', 'MF']);
/** The id prefix of one queue; anything but MB or MF is refused (a throw, so the caller fails closed). */
const prefixOf = (opts) => {
  const p = opts?.prefix ?? 'MB';
  if (!PREFIXES.has(p)) throw new Error(`queue prefix ${String(p)}`);
  return p;
};

/** Status words a heading may carry. READY is recognised but never legal: it is derived, not written by hand. */
const STATUS = /\b(DONE|RUNNING|WAITS|OPERATOR|HELD|LATER|READY)\b/g;
const CANNOT = 'FAIL:Q:cannot-decide';

const lines = (text) => (typeof text === 'string' ? text.split('\n') : null);

/**
 * PURE (O67-15 c): the one heading reader for Q2, Q3 and Q5. `null` when the line is not a heading
 * (`**MB-nn`, leading spaces allowed); else `{n, body}`, where body is the rest of the LINE after the first
 * ` - ` or ` — ` separator, or `null` when the heading has no separator.
 */
export function headingBody(line, opts) {
  const m = new RegExp(`^\\s*\\*\\*${prefixOf(opts)}-(\\d+)\\b`).exec(line);
  if (!m) return null;
  const cut = [line.indexOf(' - '), line.indexOf(' — ')].filter((i) => i >= 0);
  return { n: m[1], body: cut.length === 0 ? null : line.slice(Math.min(...cut) + 3) };
}

/**
 * PURE (Q2): one status word per heading, read from `headingBody` (the rest of the line after the first separator).
 * A heading without a separator fails (O67-15 b). OPERATOR is a marker, not a status: WAITS with OPERATOR is one
 * legal status. READY is recognised but never legal (it is derived). Judged per heading, so one bad heading never
 * hides the heading after it.
 */
export function statusWordErrors(text, opts) {
  const ls = lines(text);
  if (ls === null) return [CANNOT];
  const px = prefixOf(opts);
  const out = [];
  for (const line of ls) {
    const h = headingBody(line, opts);
    if (!h) continue;
    const words = [...new Set((h.body ?? '').match(STATUS) ?? [])].filter((w) => w !== 'OPERATOR');
    const ok = h.body !== null && words.length <= 1 && !words.includes('READY');
    if (!ok) out.push(`FAIL:Q:status-words:${px}-${h.n}`);
  }
  return out;
}

/** PURE (Q3): every DONE entry — a `- MB-nn` list id and every DONE heading — must carry `MB-nn@<hex>`. */
export function doneWithoutCommitErrors(text, opts) {
  const ls = lines(text);
  if (ls === null) return [CANNOT];
  const px = prefixOf(opts);
  const out = new Set();
  for (const line of ls) {
    const list = new RegExp(`^- ${px}-(\\d+)\\b(.*)$`).exec(line);
    if (list) {
      for (const id of line.match(new RegExp(`${px}-\\d+`, 'g')) ?? []) {
        const at = new RegExp(`${id}@[0-9a-f]{7,40}\\b`).test(line);
        if (!at) out.add(`FAIL:Q:done-without-commit:${id}`);
      }
      continue;
    }
    const h = headingBody(line, opts);
    if (!h || !/\bDONE\b/.test(h.body ?? line)) continue;
    if (!new RegExp(`${px}-${h.n}@[0-9a-f]{7,40}\\b`).test(line)) out.add(`FAIL:Q:done-without-commit:${px}-${h.n}`);
  }
  return [...out];
}

/**
 * (Q1): every `MB-nn@<sha>` in the text must exist as a commit (missing-commit) and be an ancestor of the resolved
 * `tipRev` (not-on-branch, MB-79 (q)); a tip or an ancestry answer that cannot be decided is one cannot-decide,
 * never a pass.
 */
export function missingCommitErrors({ cwd, text, tipRev, prefix } = {}) {
  const ls = lines(text);
  if (ls === null || typeof tipRev !== 'string' || tipRev === '') return [CANNOT];
  const px = prefixOf({ prefix });
  const SHA = new RegExp(`${px}-(\\d+)@([0-9a-f]{7,40})\\b`, 'g');
  const out = new Map();
  // The tip is resolved ONCE, lazily (the first sha that exists needs it). A failed resolve is ONE cannot-decide.
  let tipSha;
  let tipAsked = false;
  let undecided = false;
  const resolveTip = () => {
    if (tipAsked) return;
    tipAsked = true;
    const r = git(cwd, ['rev-parse', '--verify', '--quiet', `${tipRev}^{commit}`]);
    const sha = typeof r.stdout === 'string' ? r.stdout.trim() : '';
    if (r.status === 0 && sha !== '') tipSha = sha;
    else undecided = true;
  };
  for (const line of ls) {
    for (const [, n, sha] of line.matchAll(SHA)) {
      if (out.has(n)) continue;
      const exists = git(cwd, ['cat-file', '-e', `${sha}^{commit}`]).status === 0;
      if (!exists) {
        out.set(n, `FAIL:Q:missing-commit:${px}-${n}`);
        continue;
      }
      resolveTip();
      if (undecided || tipSha === undefined) {
        undecided = true;
        continue;
      }
      const ancestor = git(cwd, ['merge-base', '--is-ancestor', sha, tipSha]).status;
      if (ancestor === 0) continue;
      if (ancestor === 1) out.set(n, `FAIL:Q:not-on-branch:${px}-${n}`);
      else undecided = true;
    }
  }
  const values = [...out.values()];
  return undecided ? [...values, CANNOT] : values;
}

/** (Q4): the queue file must be tracked at `rev`. */
export function queueTrackedErrors({ cwd, rev, queuePath } = {}) {
  try {
    const file = queuePath ?? QUEUE_PATH;
    // The McBylaws verdict keeps its exact text; any other queue names its file.
    const verdict = file === QUEUE_PATH ? 'FAIL:Q:queue-untracked' : `FAIL:Q:queue-untracked:${file}`;
    return pathExistsAt(cwd, rev, file) === true ? [] : [verdict];
  } catch {
    return [CANNOT];
  }
}

/** (Q5): a heading saying READY while a WAITS id is not DONE — READY is derived, so it is hand-written. */
export function readyDerivedErrors(text, opts) {
  const ls = lines(text);
  if (ls === null) return [CANNOT];
  const px = prefixOf(opts);
  const done = new Set();
  const headings = [];
  for (const line of ls) {
    const h = headingBody(line, opts);
    if (!h) continue;
    const body = h.body ?? line;
    headings.push({ n: h.n, body });
    if (/\bDONE\b/.test(body)) done.add(h.n);
  }
  const out = new Set();
  for (const { n, body } of headings) {
    if (!/\bREADY\b/.test(body)) continue;
    const waits = /\bWAITS\b([^\n]*)/.exec(body);
    const ids = (waits ? waits[1].match(new RegExp(`${px}-\\d+`, 'g')) : null) ?? [];
    if (ids.some((id) => !done.has(id.slice(px.length + 1)))) out.add('FAIL:Q:ready-derived');
  }
  return [...out];
}

const DECL = /^\s*- FE rows owned: (none|FE-\d+(, FE-\d+)*)\.?\s*$/;
const BLOCK_END = /^\s*(\*\*MF-\d+|#)/;
const num = (id) => Number(id.replace(/\D/g, ''));

/**
 * (Q6, MF prefix only; MF-34): every DONE heading's block (up to the next `**MF-nn` heading or any `#` line) holds exactly
 * one `- FE rows owned: none.` or `- FE rows owned: FE-nn, FE-mm.` line (else done-fe-undeclared). Each owned id must be
 * in Spec 135 and not OWED (done-fe-owed, done-fe-unknown). Spec 135 is read only when some DONE heading owns an id; an
 * unreadable register or one without its own FE-01 row is one cannot-decide. Sorted by task number, then row.
 */
export function doneFeOwnedErrors({ cwd, rev, text } = {}) {
  const ls = lines(text);
  if (ls === null) return [CANNOT];
  const owned = [];
  const out = [];
  ls.forEach((line, i) => {
    const h = headingBody(line, { prefix: 'MF' });
    if (!h || !/\bDONE\b/.test(h.body ?? line)) return;
    let end = i + 1;
    while (end < ls.length && !BLOCK_END.test(ls[end])) end++;
    const decls = ls.slice(i + 1, end).filter((l) => DECL.test(l));
    if (decls.length !== 1) {
      out.push({ n: num(h.n), row: 0, line: `FAIL:Q:done-fe-undeclared:MF-${h.n}` });
      return;
    }
    const ids = decls[0].match(/FE-\d+/g) ?? [];
    for (const id of ids) owned.push({ n: h.n, id });
  });
  if (owned.length > 0) {
    const reg = readAt(cwd, rev, FE_REGISTER);
    const rows = typeof reg === 'string' ? parseRegisterRows(reg) : null;
    if (rows === null || !rows.has('FE-01')) return [CANNOT];
    for (const { n, id } of owned) {
      const row = rows.get(id);
      if (!row) out.push({ n: num(n), row: num(id), line: `FAIL:Q:done-fe-unknown:MF-${n}:${id}` });
      else if (row.status === 'OWED') out.push({ n: num(n), row: num(id), line: `FAIL:Q:done-fe-owed:MF-${n}:${id}` });
    }
  }
  out.sort((a, b) => a.n - b.n || a.row - b.row);
  return [...new Set(out.map((o) => o.line))];
}

/**
 * (Q): Q4 first (an untracked queue ends it), then Q2, Q3, Q1 (tip = rev), Q5, then Q6 for the MF prefix — concatenated.
 * The ancestry half of Q1 needs a tip the repo resolves; when `rev` is missing or unresolvable that half reports
 * `cannot-decide` instead of a pass (fail closed).
 */
export function queueCheck({ cwd, rev, queuePath, prefix } = {}) {
  try {
    const opts = { prefix: prefixOf({ prefix }) };
    const file = queuePath ?? QUEUE_PATH;
    const tracked = queueTrackedErrors({ cwd, rev, queuePath: file });
    if (tracked.length > 0) return tracked;
    const text = readAt(cwd, rev, file);
    if (typeof text !== 'string' || text === '') return [CANNOT];
    const missing = missingCommitErrors({ cwd, text, tipRev: rev, prefix: opts.prefix });
    const tipUnresolved =
      missing.length === 0 && git(cwd, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]).status !== 0;
    const base = [
      ...statusWordErrors(text, opts),
      ...doneWithoutCommitErrors(text, opts),
      ...(tipUnresolved ? [CANNOT] : missing),
      ...readyDerivedErrors(text, opts),
    ];
    if (opts.prefix !== 'MF') return base;
    const fe = doneFeOwnedErrors({ cwd, rev, text });
    return [...base, ...fe.filter((l) => l !== CANNOT || !base.includes(CANNOT))];
  } catch {
    return [CANNOT];
  }
}
