// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-KV (task trailer), R-KG (OWED means
//   blocked; BOOT-1 the one exemption), R-KH (cites a RULED rule), R-LE (RULED is a closed list);
//   plan arm C (MB-67): message parse, OWED set (Spec 133 section 3), register rows (69a/124a/131), sentinels (G67-06).
//
// PURE: no git, no fs, no env. The gate hands this module text it already read; nothing here decides a pass
// on an empty parse — the sentinels make an empty parse a failure, never "nothing owed".

const ID_RE = /\b(M-\d+|LC-\d+|R-[A-Z]{2}|INV-\d+|BOOT-1)\b/g;
const TRAILER_RE = /^McBylaws-Task:\s*(MB-\d+)\s*$/m;
const SECTION_RE = /Spec 133 (?:section|s)\s+m\.(\d+)/gi;
const OWED_HEADING = 'Rows with an OWED marker';
const OWED_ROW_RE = /^\| ((?:M|LC)-\d+) \| (?:m|lc)\.\d+ \| .*OWED \|\s*$/;
const ROW_HEAD_RE = /^\| (~~\*\*([A-Z]{1,2}-\d+|[A-Z]-[A-Z]{2})\*\*~~|\*\*([A-Z]{1,2}-\d+|[A-Z]-[A-Z]{2})\*\*|([A-Z]{1,2}-\d+|[A-Z]-[A-Z]{2})) \|/;
const STRUCK_RE = /^~~\*\*/;

/** @param {string} text @returns {{task:string|null, ids:string[], usesBoot1:boolean}} */
export function parseMessage(text) {
  const s = String(text ?? '');
  const trailer = TRAILER_RE.exec(s);
  const ids = new Set();
  for (const m of s.matchAll(ID_RE)) ids.add(m[1]);
  for (const m of s.matchAll(SECTION_RE)) ids.add(`M-${m[1]}`);
  const usesBoot1 = /\bBOOT-1\b/.test(s) || /\bO-1\b/.test(s);
  return { task: trailer ? trailer[1] : null, ids: [...ids].sort(), usesBoot1 };
}

/** @param {string} spec133Text @returns {Set<string>} */
export function parseOwedTable(spec133Text) {
  const out = new Set();
  let after = false;
  for (const line of String(spec133Text ?? '').split('\n')) {
    if (line.includes(OWED_HEADING)) { after = true; continue; }
    if (!after) continue;
    const m = OWED_ROW_RE.exec(line);
    if (m) out.add(m[1]);
  }
  return out;
}

/** Last pipe cell of a row line, without the trailing pipe. */
const lastCell = (line) => line.split(' | ').pop().replace(/\|+\s*$/, '').trim();

const TICK_RE = /`([^`]+)`/g;
const LOCK_RE = /\.test\.(?:ts|tsx|mjs)$/;
const RECORD_LOCK = 'chat-rulings-register.logic.test.ts';

/** Backticked behavioural lock paths (`.test.ts|tsx|mjs`) named in a row's last cell, record lock excluded. */
function locksOf(cell) {
  const out = [];
  for (const m of cell.matchAll(TICK_RE)) {
    const p = m[1].trim();
    if (LOCK_RE.test(p) && !p.endsWith(RECORD_LOCK) && !out.includes(p)) out.push(p);
  }
  return out;
}

function statusOf(cell) {
  const s = String(cell ?? '');
  // O67-09: the leading closed word decides first; decoration (~, *, `, whitespace) never hides it.
  const plain = s.replace(/[~*`\s]/g, '').toUpperCase();
  if (plain.startsWith('RETIRED') || plain.startsWith('SUPERSEDED') || plain.startsWith('WITHDRAWN')) {
    return 'RETIRED';
  }
  if (plain.startsWith('PROPOSED')) return 'PROPOSED';
  // O67-09: an OWED marker in any decorated form reads OWED, so the row can never be cited as RULED.
  // The closed leading word above decided first, so a later mention of owed never makes a row OWED.
  if (plain.startsWith('OWED') || /OWED\*{0,2}:/.test(s)) return 'OWED'; // 'RULED. **OWED:** ...' is RULED and OWED (Spec 131 LC-15, LC-46)
  if (s.includes('OWED ->')) return 'OWED';
  return 'RULED';
}

/**
 * @param {string} text
 * @returns {Map<string, {status:string, locks:string[]}>} status in RULED|OWED|PROPOSED|RETIRED; first wins.
 *   `locks` are the behavioural lock paths (`.test.ts|tsx|mjs`) named in the last cell; a row that names none
 *   can never use the arm C exception, and the register record lock is never a behavioural lock.
 */
export function parseRegisterRows(text) {
  const out = new Map();
  for (const line of String(text ?? '').split('\n')) {
    if (!line.startsWith('| ')) continue;
    const m = ROW_HEAD_RE.exec(line);
    if (!m) continue;
    const id = m[2] || m[3] || m[4];
    if (!id || out.has(id)) continue;
    const struck = STRUCK_RE.test(line.slice(2)) || STRUCK_RE.test(m[1]);
    const cell = lastCell(line);
    out.set(id, { status: struck ? 'RETIRED' : statusOf(cell), locks: struck ? [] : locksOf(cell) });
  }
  return out;
}

export const RULED_STATUSES = ['RULED'];

/** @param {Map<string, {status:string}>} map @param {string} id */
export function isRuled(map, id) {
  const row = map instanceof Map ? map.get(id) : undefined;
  return Boolean(row) && RULED_STATUSES.includes(row.status);
}

/**
 * G67-06: an empty parse never reads as "nothing owed".
 * @param {Set<string>} owedSet @param {Map<string, {status:string}>} rowMap
 */
export function sentinelsOk(owedSet, rowMap) {
  return Boolean(owedSet) && owedSet.has('M-361') && owedSet.has('LC-15') && isRuled(rowMap, 'M-180');
}
