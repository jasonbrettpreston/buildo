// SPEC LINK: MB-73 plan sections 7 and 8; K2 (the one counts vocabulary), K14 (a fabricated quote is caught), R-KK (the audit pack
// is generated, never hand-kept), R-BF (generated or witnessed, never hand-kept), F-IDEM (byte-identical output), F-AUD (audit blocks).
// Pure: no git, no fs, no clock, no environment. Judging functions return string[] (empty = pass); cannot decide -> FAIL:R:cannot-decide.
import { sha256, canon } from '../mcbylaws-loop/loop-record.mjs';

const STATES = ['done', 'red', 'not yet'];
const DEFAULT_STATE = 'red'; // an unknown state counts as red: never a silent pass

/** Counts `{done, red, notYet}` of rows `[{id, state}]`; an unknown state counts as red. PURE. */
export function countStates(rows) {
  const counts = { done: 0, red: 0, notYet: 0 };
  for (const row of Array.isArray(rows) ? rows : []) {
    const state = row && STATES.includes(row.state) ? row.state : DEFAULT_STATE;
    if (state === 'done') counts.done += 1;
    else if (state === 'red') counts.red += 1;
    else counts.notYet += 1;
  }
  return counts;
}

const n = (c, key) => (c && Number.isInteger(c[key]) ? c[key] : 0);

/** Exactly `done D, red R, not yet Y`. PURE. */
export function countsLine(counts) {
  return `done ${n(counts, 'done')}, red ${n(counts, 'red')}, not yet ${n(counts, 'notYet')}`;
}

/** Exactly `promises: D done, R red, Y not yet` (the pre-push summary line). PURE. */
export function summaryLine(counts) {
  return `promises: ${n(counts, 'done')} done, ${n(counts, 'red')} red, ${n(counts, 'notYet')} not yet`;
}

/** Evidence cell: `|` -> `/`, newlines -> space; a missing evidence is the empty string. PURE. */
function cell(value) {
  return String(typeof value === 'string' ? value : '').replace(/\|/g, '/').replace(/\r?\n/g, ' ');
}

const byId = (a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);

/** The committed status table (markdown, byte-stable, sorted by id, no date). PURE. */
export function statusTable({ commit, registerHash, rows } = {}) {
  const list = Array.isArray(rows) ? [...rows] : [];
  const body = list.sort(byId).map((r) => {
    const state = r && STATES.includes(r.state) ? r.state : DEFAULT_STATE;
    return `| ${cell(r && r.id)} | ${state} | ${cell(r && r.evidence)} |`;
  });
  return [
    '# Promises status',
    '',
    `commit: ${cell(commit)}`,
    `register: ${cell(registerHash)}`,
    '',
    countsLine(countStates(list)),
    '',
    '| id | state | evidence |',
    '|---|---|---|',
    ...body,
    '',
  ].join('\n');
}

/** The queue stage-10 status-line text the recorder pastes: `MB-73 promises: <countsLine> at <commit>`. PURE. */
export function statusLineRow(counts, commit) {
  return `MB-73 promises: ${countsLine(counts)} at ${typeof commit === 'string' ? commit : ''}`;
}

/** The value of a `key:` header line, or null when the line is missing. PURE. */
function headerValue(text, key) {
  const re = new RegExp(`^${key}:[ \\t]*(.*)$`, 'm');
  const m = re.exec(typeof text === 'string' ? text : '');
  return m ? m[1].trim() : null;
}

/** Checks a committed snapshot header; empty = fresh, else the stale / cannot-decide lines. PURE. */
export function snapshotHeaderLines(text, { commit, registerHash } = {}) {
  const gotRegister = headerValue(text, 'register');
  const gotCommit = headerValue(text, 'commit');
  if (gotRegister === null || gotCommit === null) return ['FAIL:R:cannot-decide:snapshot-header'];
  const out = [];
  if (gotRegister !== registerHash) out.push('FAIL:R:snapshot-stale:register');
  if (gotCommit !== commit) out.push('FAIL:R:snapshot-stale:commit');
  return out;
}

/** The audit pack: entries sorted by id, bound by `sha256(canon(sorted entries))`. PURE. */
export function auditPack(entries) {
  const list = (Array.isArray(entries) ? entries : [])
    .map((e) => ({ id: String(e && e.id), command: String(e && e.command), counts: String(e && e.counts) }))
    .sort(byId);
  return { schema: 'promises-audit-pack-v1', entries: list, pack_sha256: sha256(canon(list)) };
}

/** The `## <id>` blocks of an audit text: id -> block body text. PURE. */
function blocksOf(auditText) {
  const blocks = new Map();
  let id = null;
  const push = (line) => {
    if (id === null) return;
    blocks.set(id, blocks.has(id) ? `${blocks.get(id)}\n${line}` : line);
  };
  for (const line of (typeof auditText === 'string' ? auditText : '').split('\n')) {
    const m = /^## (.+?)\s*$/.exec(line);
    if (m) {
      id = m[1];
      if (!blocks.has(id)) blocks.set(id, '');
    } else push(line);
  }
  return blocks;
}

/** `FAIL:R:audit-uncovered:<id>` (sorted) for every pack entry its block does not witness exactly. PURE. */
export function auditLines({ pack, auditText } = {}) {
  const entries = pack && Array.isArray(pack.entries) ? pack.entries : [];
  if (entries.length === 0) return ['FAIL:R:cannot-decide:audit-pack'];
  const blocks = blocksOf(auditText);
  const out = [];
  for (const entry of [...entries].sort(byId)) {
    const body = blocks.get(String(entry.id));
    if (body === undefined || !body.includes(entry.command) || !body.includes(entry.counts)) {
      out.push(`FAIL:R:audit-uncovered:${entry.id}`);
    }
  }
  return out;
}
