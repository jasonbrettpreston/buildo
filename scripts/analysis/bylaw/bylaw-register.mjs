// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-260 (Spec 133, the By-law Handbook; operator y 2026-10-21,
//            `2026-10-21-chat-batch-m-43#CHAT-43`)
//
// The one reader of the by-law registers for the handbook: every `| **M-n** |` row of Spec 69a (the Spec 69 register) and
// every `| **LC-n** |` row of Spec 131, plus the dated notes under a row (a row whose first cell is empty), folded into
// the row they follow. The generator (scripts/generate-bylaw-handbook.mjs) builds the rule map and the handbook from
// these rows; the registers stay the authority and nothing here is hand-written per rule. Same register-row shape as
// scripts/analysis/decision-log.mjs (REGISTER_ROW_RE): a table row whose first cell is a register id, bold or struck.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

/** The policy registers the handbook reads, in render order. `sectionOf` maps a register heading to a handbook section. */
export const BYLAW_REGISTERS = Object.freeze([
  { kind: 'M', rel: 'docs/specs/01-pipeline/69a_mcbylaw_register.md', spec: 'Spec 69a', headings: [/^## 1\. The register/, /^## §1a\./] , sections: ['m-core', 'm-added'] },
  { kind: 'LC', rel: 'docs/specs/01-pipeline/131_lot_configuration_policy.md', spec: 'Spec 131', headings: [/^### 1\.1 /, /^### 1\.2 /, /^### 1\.3 /], sections: ['lc-1', 'lc-2', 'lc-3'] },
]);

const ID_CELL_RE = /^(~~)?\*{0,2}(M|LC)-([0-9]+)\*{0,2}(~~)?$/;
const HEADLINE_MAX = 300;
const ENFORCED_MAX = 110;

// Provision family (Spec 69a M-260): derived from the FIRST clause a row cites, never a register field. The same
// provision is ruled alike in every zone chapter (10.10 / 10.20 / 10.40 / 10.60 / 10.80), so a zone-chapter clause
// 10.<zone>.<g1>.<g2> is the family "<g1>.<g2>" (10.20.40.10 and 10.80.40.10 are both "40.10"); a 10.5 clause keeps its
// chapter (family "10.5.<g1>.<g2>"); 150.x, 800.x and 900.x take their chapter ("150", "800", "900"); a row that cites no
// clause is "general". A row citing several clauses uses the first one in its rule text.
export const GENERAL_FAMILY = 'general';
// Also two older forms the rows still use (verify-26 note 3): the pre-renumbering 5.10.<g1>.<g2> (its own family, like 10.5)
// and the zone shorthand x.<g1>.<g2> (any zone chapter; the same family as 10.<zone>.<g1>.<g2>).
const CLAUSE_RE = /(?<![0-9.A-Za-z])(10\.(?:10|20|40|60|80)\.[0-9]+\.[0-9]+|10\.5\.[0-9]+\.[0-9]+|5\.10\.[0-9]+\.[0-9]+|x\.[0-9]+\.[0-9]+|(?:150|800|900)\.[0-9]+)/;
export function familyOf(text) {
  const m = CLAUSE_RE.exec(text);
  if (!m) return { clause: null, family: GENERAL_FAMILY };
  const clause = m[1];
  const zone = /^10\.(?:10|20|40|60|80)\.([0-9]+\.[0-9]+)$/.exec(clause);
  if (zone) return { clause, family: zone[1] };
  if (clause.startsWith('10.5.') || clause.startsWith('5.10.')) return { clause, family: clause };
  if (clause.startsWith('x.')) return { clause, family: clause.slice(2) };
  return { clause, family: clause.split('.')[0] };
}

/** Split one markdown table row into trimmed cells. `\|` is a literal bar; a bar inside backticks does not split. */
export function splitRow(line) {
  const out = [];
  let cur = '';
  let tick = false;
  for (let i = 1; i < line.length; i += 1) {
    const c = line[i];
    if (c === '\\' && line[i + 1] === '|') { cur += '|'; i += 1; continue; }
    if (c === '`') tick = !tick;
    if (c === '|' && !tick) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  return out;
}

function clip(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 40))}…`;
}

/** Drop markdown emphasis and backticks so a headline reads as plain text; collapse whitespace. */
function plain(text) {
  return text.replace(/<br\s*\/?>/gi, ' ').replace(/\*\*|~~|`/g, '').replace(/\s+/g, ' ').trim();
}

/** Remove a trailing parenthetical that only records where a ruling came from (operator, chat, verify, scorecard...). */
function stripProvenance(text) {
  let t = text.trim();
  const dot = /[.;:]$/.test(t) ? t.slice(-1) : '';
  if (dot) t = t.slice(0, -1).trim();
  for (;;) {
    if (!t.endsWith(')')) break;
    let depth = 0;
    let start = -1;
    for (let i = t.length - 1; i >= 0; i -= 1) {
      if (t[i] === ')') depth += 1;
      else if (t[i] === '(') { depth -= 1; if (depth === 0) { start = i; break; } }
    }
    if (start < 0 || !/operator|chat|verif|review|scorecard|ratified|approved|spec 1\d\d/i.test(t.slice(start))) break;
    t = t.slice(0, start).trim();
  }
  return dot && !/[.;:]$/.test(t) ? `${t}${dot}` : t;
}

// A full stop after one of these does not end a sentence (verify-26 note A: m.150 ended at "e.g.").
const ABBREVIATIONS = new Set(['e.g', 'i.e', 'etc', 'vs', 'cf', 'approx', 'incl', 'no']);

/** The text up to the first full stop that ends a sentence (not an abbreviation); all of it when there is none. */
export function firstSentence(text) {
  for (const m of text.matchAll(/\.(?=\s|$)/g)) {
    const word = /([A-Za-z.]+)$/.exec(text.slice(0, m.index));
    if (word && ABBREVIATIONS.has(word[1].toLowerCase())) continue;
    return text.slice(0, m.index + 1);
  }
  return text;
}

/** The reading headline of a rule cell: its leading bold span, plus the first sentence after it when the span is a bare title. */
export function headlineOf(ruleCell) {
  const bold = /^\*\*(.+?)\*\*/.exec(ruleCell.trim());
  let head;
  if (bold) {
    head = plain(stripProvenance(bold[1]));
    if (head.length < 30) {
      const rest = plain(ruleCell.trim().slice(bold[0].length));
      head = `${head} ${firstSentence(rest)}`.trim();
    }
  } else head = plain(stripProvenance(ruleCell));
  return clip(head || plain(ruleCell), HEADLINE_MAX);
}

/** The status keyword (RATIFIED, RULED, ...) and whether the row carries an OWED marker. */
function statusOf(cell, struck) {
  const t = cell.replace(/~~[^~]*~~/g, ' ').replace(/\*\*/g, ' ');
  const m = /\b(RATIFIED|RULED|APPLIED|PROPOSED|RETIRED|SUPERSEDED|FOLDED|OWED|ACTIVE)\b/.exec(t);
  const keyword = m ? m[1] : (struck ? 'RETIRED' : 'UNKNOWN');
  const partial = keyword === 'SUPERSEDED' && /SUPERSEDED in part/i.test(t);
  const date = /\b(\d{4}-\d{2}-\d{2})\b/.exec(cell);
  return { keyword, partial, owed: /\bOWED\b/.test(cell) && keyword !== 'OWED', date: date ? date[1] : '' };
}

/**
 * Every register row, in file order: { id, kind, file, section, headline, status, keyword, date, struck, owed, history,
 * notes, enforcedBy }. `history` is a struck or retired/folded row (listed only so old citations resolve).
 */
export function readBylawRegisterRows(root = REPO_ROOT) {
  const rows = [];
  for (const reg of BYLAW_REGISTERS) {
    const lines = fs.readFileSync(path.join(root, reg.rel), 'utf8').split('\n');
    let sec = -1;
    let last = null;
    lines.forEach((line) => {
      const hit = reg.headings.findIndex((re) => re.test(line));
      if (hit >= 0) { sec = hit; last = null; } else if (/^#{2,3} /.test(line)) { sec = -1; last = null; }
      if (!line.startsWith('|') || sec < 0) return;
      const cells = splitRow(line);
      const idCell = (cells[0] || '').trim();
      if (idCell === '' && last) { last.notes += 1; return; }
      const m = ID_CELL_RE.exec(idCell);
      if (!m || m[2] !== reg.kind) { last = null; return; }
      const struck = Boolean(m[1]);
      const ruleCell = cells[1] || '';
      const statusCell = cells[cells.length - 1] || '';
      const enforcedCell = cells[cells.length - 2] || '';
      const st = statusOf(statusCell, struck);
      const history = struck || ['RETIRED', 'FOLDED'].includes(st.keyword) || (st.keyword === 'SUPERSEDED' && !st.partial);
      const row = {
        id: `${reg.kind}-${m[3]}`,
        kind: reg.kind,
        file: reg.rel,
        spec: reg.spec,
        section: reg.sections[sec],
        headline: headlineOf(ruleCell),
        ...familyOf(ruleCell),
        keyword: st.keyword,
        date: st.date,
        status: `${st.keyword}${st.date ? ` ${st.date}` : ''}${st.partial ? ' (in part)' : ''}${st.owed ? ' · OWED' : ''}`,
        struck,
        owed: st.owed || st.keyword === 'OWED',
        history,
        notes: 0,
        enforcedBy: clip(plain(enforcedCell), ENFORCED_MAX),
      };
      rows.push(row);
      last = row;
    });
  }
  return rows;
}
