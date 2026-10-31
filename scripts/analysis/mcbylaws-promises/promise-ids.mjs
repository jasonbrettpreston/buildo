// SPEC LINK: MB-73 plan 2.2/2.3; R-KQ, R-KU, K16, R4-10 — ids are found by pattern, never typed ranges.

/**
 * @typedef {object} Row
 * @property {string} id found id (or INC-/ND-/WD- synthetic id)
 * @property {string} kind family kind, or increment/not-doing/withdrawn
 * @property {string} file path of the file the row was found in
 * @property {string} quoted_line the trimmed line, cut at 300 chars
 * @property {string|null} owner_task enclosing task id, or null
 * @property {string|null} increment earliest citing increment id, or null
 */

/** Ordered families: first match wins. */
export const FAMILIES = [
  { kind: 'rule', re: /^R-[A-Z]{1,2}$/ },
  { kind: 'ruling', re: /^M-\d{2,3}$/ },
  { kind: 'round-rule', re: /^R[34]-\d{2}$/ },
  { kind: 'guardrail-67', re: /^G6[78]-\d+$/ },
  { kind: 'guardrail', re: /^G\d{1,2}$/ },
  { kind: 'boot', re: /^BOOT-\d+$/ },
  { kind: 'task', re: /^MB-\d+[a-z]?$/ },
  { kind: 'operator', re: /^O-\d+$/ },
  { kind: 'p67', re: /^P67-\d+$/ },
  { kind: 'plan-ruling', re: /^PR-\d+-\d+$/ },
  { kind: 'card', re: /^S-\d$/ },
];

const TASK_ID = /^MB-\d+[a-z]?$/;
const MB_ANY = /MB-\d+[a-z]?/;
const TOKEN = /^(\*\*)?\s*([A-Za-z0-9-]+)/;
const SEP = /^(?:\s+and\s+|\s*\(\+|\s*,\s*|\s*\+\s*|\s+)(\*\*)?([A-Za-z0-9-]+)/i;
const at = (line) => /^## /.test(line);
/** A line that opens a task block: bullet/table/heading/bold-led, then a task id. */
const OWNER = /^\s*(?:[-*|#]+\s*)?\**\s*(MB-\d+[a-z]?)(?![A-Za-z0-9-])/;

/** Kind of an id token, or null. @param {string} id @returns {string|null} */
export function kindOf(id) {
  const f = FAMILIES.find((x) => x.re.test(id));
  return f ? f.kind : null;
}

/** Trimmed, `**`-free table cells of a row line. @param {string} line @returns {string[]} */
const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.replace(/\*\*/g, '').trim());
/** Separator row of a markdown table. @param {string} line @returns {boolean} */
const isSep = (line) => /^\s*\|[\s|:-]+\|?\s*$/.test(line);
/** `ND-` slug: the first six words, lowercased, non-alphanumerics removed, joined by `-`. */
const slugOf = (line) => line.replace(/^\s*[-*] /, '').replace(/\*\*/g, '').trim()
  .split(/\s+/).slice(0, 6).map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean)
  .join('-');

/** Line bodies of the sections whose heading starts with `prefix`, until the next `## `. */
function section(text, prefix) {
  const out = [];
  let inside = false;
  for (const line of String(text).split('\n')) {
    if (/^## /.test(line)) inside = line.startsWith(prefix);
    else if (inside) out.push(line);
  }
  return out;
}

/** The row body after a bold/bullet/table/heading marker, or null. @param {string} line @returns {string|null} */
function rowBody(line) {
  if (/^\s*\*\*/.test(line)) return line.replace(/^\s*\*\*/, '');
  const bullet = /^\s*[-*] /.exec(line);
  if (bullet) return line.slice(bullet[0].length);
  if (/^\|/.test(line)) return line.replace(/^\s*\|\s*/, '');
  const head = /^#{1,6} /.exec(line);
  return head ? line.slice(head[0].length) : null;
}

/** Ids that START a row line. @param {string} line @returns {{id:string,kind:string}[]} */
export function leadingIds(line) {
  const body = rowBody(String(line));
  if (body === null) return [];
  const first = TOKEN.exec(body);
  const kind = first && kindOf(first[2]);
  if (!kind) return [];
  const out = [{ id: first[2], kind }];
  let rest = body.slice(first[0].length);
  for (;;) {
    const m = SEP.exec(rest);
    const k = m && kindOf(m[2]);
    if (!k) break;
    out.push({ id: m[2], kind: k });
    rest = rest.slice(m[0].length);
  }
  return out;
}

/** True when `text` contains `id` as a whole token. */
const cites = (text, id) => new RegExp(`(^|[^A-Za-z0-9-])${id.replace(/-/g, '\\-')}(?![A-Za-z0-9-])`).test(text);

/** Rows found in `files`; first occurrence of an id wins. @returns {Row[]} */
export function extractRows(files, incIds = []) {
  const incs = (incIds || []).map(String);
  const seen = new Map();
  const add = (row, path, line) => {
    if (!seen.has(row.id)) seen.set(row.id, { file: path, quoted_line: String(line).trim().slice(0, 300), ...row });
  };
  const texts = new Map();
  for (const { path, text } of files || []) {
    let owner = null;
    for (const line of String(text).split('\n')) {
      if (at(line)) owner = null;
      const ids = leadingIds(line);
      const own = OWNER.exec(line);
      if (own) owner = own[1];
      for (const h of ids) add({ ...h, owner_task: owner }, path, line);
    }
    for (const line of section(text, '## Increments')) {
      if (!/^\s*\|/.test(line) || isSep(line)) continue;
      const [cell, ...rest] = cells(line);
      if (incs.includes(cell)) add({ id: `INC-${cell}`, kind: 'increment', increment: cell, owner_task: null }, path, line);
      if (!texts.has(cell)) texts.set(cell, rest.join(' '));
    }
    for (const line of section(text, '## Not doing')) {
      const slug = /^\s*[-*] /.test(line) ? slugOf(line) : '';
      if (slug) add({ id: `ND-${slug}`, kind: 'not-doing', owner_task: null }, path, line);
    }
    for (const line of section(text, '## Withdrawn')) {
      const m = /^\s*\|/.test(line) && !isSep(line) ? MB_ANY.exec(line) : null;
      if (m) add({ id: `WD-${m[0]}`, kind: 'withdrawn', owner_task: null }, path, line);
    }
  }
  const rows = [...seen.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const row of rows) {
    const idx = row.kind === 'increment' ? -1
      : incs.findIndex((c) => texts.has(c) && cites(texts.get(c), row.id));
    row.increment = idx >= 0 ? incs[idx] : null;
  }
  return /** @type {Row[]} */ (rows);
}
