// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md MB-67 (commit gate); plan arm Q (lines 132-140),
//            R-KK (the queue is a witness) and R-KW (the queue names a landed commit).
//
// HOW arm Q judges the queue. `.cursor/MCBYLAWS-QUEUE.md` lists one heading per task (`**MB-nn <title> - <status>**`)
// and a DONE list whose lines cite the commit each finished task landed in (`MB-nn@<sha>`). Q4 asks first whether the
// queue is even tracked at the cited rev (CI cannot see an untracked file); Q2 reads one status word per heading (a
// derived READY is never hand-written); Q3 wants an `@sha` on every DONE entry; Q1 wants that sha to exist and be an
// ancestor of the tip; Q5 wants READY only when every WAITS id is DONE. Fail closed: a read that fails, a missing tip
// or an empty text is a failure line, never a pass.

import { git, pathExistsAt, readAt } from './git-util.mjs';

/** The queue file, relative to the repo root. */
export const QUEUE_PATH = '.cursor/MCBYLAWS-QUEUE.md';

/** Status words a heading may carry. READY is recognised but never legal: it is derived, not written by hand. */
const STATUS = /\b(DONE|RUNNING|WAITS|OPERATOR|HELD|LATER|READY)\b/g;
const CANNOT = 'FAIL:Q:cannot-decide';
const HEADING = /^\*\*MB-(\d+)\b.*\*\*/;
const SHA = /MB-(\d+)@([0-9a-f]{7,40})\b/g;

const lines = (text) => (typeof text === 'string' ? text.split('\n') : null);

/** The part of a heading line after the first ` - ` or ` — ` separator (the whole line when there is none). */
function headingBody(line) {
  const cut = [line.indexOf(' - '), line.indexOf(' — ')].filter((i) => i >= 0);
  return cut.length === 0 ? line : line.slice(Math.min(...cut) + 3);
}

/**
 * PURE (Q2): one status word per heading. OPERATOR is a marker, not a status: WAITS with OPERATOR is one legal
 * status. READY is recognised but never legal (it is derived). Judged per heading, so one bad heading never hides
 * the heading after it.
 */
export function statusWordErrors(text) {
  const ls = lines(text);
  if (ls === null) return [CANNOT];
  const out = [];
  for (const line of ls) {
    const m = /^\s*\*\*MB-(\d+)\b/.exec(line);
    if (!m) continue;
    const open = line.indexOf('**'); const heading = line.slice(open + 2, line.indexOf('**', open + 2)); const cut = heading.search(/ [-—] /); const body = cut === -1 ? '' : heading.slice(cut);
    const words = [...new Set(body.match(STATUS) ?? [])].filter((w) => w !== 'OPERATOR');
    const ok = words.length <= 1 && !words.includes('READY');
    if (!ok) out.push(`FAIL:Q:status-words:MB-${m[1]}`);
  }
  return out;
}

/** PURE (Q3): every DONE entry — a `- MB-nn` list id and every DONE heading — must carry `MB-nn@<hex>`. */
export function doneWithoutCommitErrors(text) {
  const ls = lines(text);
  if (ls === null) return [CANNOT];
  const out = new Set();
  for (const line of ls) {
    const list = /^- MB-(\d+)\b(.*)$/.exec(line);
    if (list) {
      for (const id of line.match(/MB-\d+/g) ?? []) {
        const at = new RegExp(`${id}@[0-9a-f]{7,40}\\b`).test(line);
        if (!at) out.add(`FAIL:Q:done-without-commit:${id}`);
      }
      continue;
    }
    const m = HEADING.exec(line);
    if (!m || !/\bDONE\b/.test(headingBody(line))) continue;
    if (!new RegExp(`MB-${m[1]}@[0-9a-f]{7,40}\\b`).test(line)) out.add(`FAIL:Q:done-without-commit:MB-${m[1]}`);
  }
  return [...out];
}

/** (Q1): every `MB-nn@<sha>` in the text must exist as a commit and be an ancestor of `tipRev`. */
export function missingCommitErrors({ cwd, text, tipRev } = {}) {
  const ls = lines(text);
  if (ls === null || typeof tipRev !== 'string' || tipRev === '') return [CANNOT];
  const out = new Map();
  for (const line of ls) {
    for (const [, n, sha] of line.matchAll(SHA)) {
      if (out.has(n)) continue;
      const exists = git(cwd, ['cat-file', '-e', `${sha}^{commit}`]).status === 0;
      if (!exists) out.set(n, `FAIL:Q:missing-commit:MB-${n}`);
    }
  }
  return [...out.values()];
}

/** (Q4): the queue file must be tracked at `rev`. */
export function queueTrackedErrors({ cwd, rev } = {}) {
  try {
    return pathExistsAt(cwd, rev, QUEUE_PATH) === true ? [] : ['FAIL:Q:queue-untracked'];
  } catch {
    return [CANNOT];
  }
}

/** (Q5): a heading saying READY while a WAITS id is not DONE — READY is derived, so it is hand-written. */
export function readyDerivedErrors(text) {
  const ls = lines(text);
  if (ls === null) return [CANNOT];
  const done = new Set();
  const headings = [];
  for (const line of ls) {
    const m = HEADING.exec(line);
    if (!m) continue;
    const body = headingBody(line);
    headings.push({ n: m[1], body });
    if (/\bDONE\b/.test(body)) done.add(m[1]);
  }
  const out = new Set();
  for (const { n, body } of headings) {
    if (!/\bREADY\b/.test(body)) continue;
    const waits = /\bWAITS\b([^\n]*)/.exec(body);
    const ids = (waits ? waits[1].match(/MB-\d+/g) : null) ?? [];
    if (ids.some((id) => !done.has(id.slice(3)))) out.add('FAIL:Q:ready-derived');
  }
  return [...out];
}

/**
 * (Q): Q4 first (an untracked queue ends it), then Q2, Q3, Q1 (tip = rev), Q5 — concatenated.
 * The ancestry half of Q1 needs a tip the repo resolves; when `rev` is missing or unresolvable that half reports
 * `cannot-decide` instead of a pass (fail closed).
 */
export function queueCheck({ cwd, rev } = {}) {
  try {
    const tracked = queueTrackedErrors({ cwd, rev });
    if (tracked.length > 0) return tracked;
    const text = readAt(cwd, rev, QUEUE_PATH);
    if (typeof text !== 'string' || text === '') return [CANNOT];
    const missing = missingCommitErrors({ cwd, text, tipRev: rev });
    const tipUnresolved =
      missing.length === 0 && git(cwd, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]).status !== 0;
    return [
      ...statusWordErrors(text),
      ...doneWithoutCommitErrors(text),
      ...(tipUnresolved ? [CANNOT] : missing),
      ...readyDerivedErrors(text),
    ];
  } catch {
    return [CANNOT];
  }
}
