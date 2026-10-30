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

function statusOf(cell) {
  const word = (cell.match(/^(?:~~)?\**([A-Z]+)/) || [])[1] || '';
  if (['RETIRED', 'SUPERSEDED', 'WITHDRAWN'].includes(word)) return 'RETIRED';
  if (word === 'PROPOSED') return 'PROPOSED';
  if (cell.includes('OWED ->') || cell.startsWith('OWED')) return 'OWED';
  return 'RULED';
}

/** @param {string} text @returns {Map<string, {status:string}>} status in RULED|OWED|PROPOSED|RETIRED; first wins */
export function parseRegisterRows(text) {
  const out = new Map();
  for (const line of String(text ?? '').split('\n')) {
    if (!line.startsWith('| ')) continue;
    const m = ROW_HEAD_RE.exec(line);
    if (!m) continue;
    const id = m[2] || m[3] || m[4];
    if (!id || out.has(id)) continue;
    const struck = STRUCK_RE.test(line.slice(2)) || STRUCK_RE.test(m[1]);
    out.set(id, { status: struck ? 'RETIRED' : statusOf(lastCell(line)) });
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
