// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md (register rows); plan arm K (MB-67, M-381, R-KZ)
//
// Arm K: a register row must carry a "Conflict check" paragraph that names every id the register
// search returns for the row's own text, each with a verdict word. The search keys are by-law clause
// references (K5) plus a three-word building-type phrase; any one type word alone is far too broad.
// Fail closed: no paragraph, an omitted id and a missing verdict are each a `FAIL:K:*` line.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
export const DEFAULT_REGISTER = 'docs/specs/01-pipeline/69a_mcbylaw_register.md';
const CLAUSE_RE = /\b\d{1,2}(?:\.\d+){2,4}(?:\([0-9A-Za-z]+\))*/g;
const TYPE_PHRASE = ['houseplex', 'exception', 'detached'];
const PARAGRAPH_MARKER = '**Conflict check.**';
const VERDICTS = ['no conflict', 'amends', 'supersedes'];
const ROW_RE = /^\|\s*\*\*(M-\d+)\*\*\s*\|/;
const ID_RE = /\bM-\d+\b/g;

/** Clause keys (K5) and type keys for one text. Pure. */
export function searchKeys(text) {
  const s = typeof text === 'string' ? text : '';
  const clauseKeys = [...new Set(s.match(CLAUSE_RE) || [])];
  const lower = s.toLowerCase();
  const typeKeys = TYPE_PHRASE.every((w) => lower.includes(w)) ? [...TYPE_PHRASE] : [];
  return { clauseKeys, typeKeys };
}

/** Register rows whose text matches the keys, sorted by id. Empty key set -> []. */
export function conflictCandidates(registerText, keys) {
  const clauseKeys = (keys && Array.isArray(keys.clauseKeys)) ? keys.clauseKeys : [];
  const typeKeys = (keys && Array.isArray(keys.typeKeys)) ? keys.typeKeys : [];
  if (clauseKeys.length === 0 && typeKeys.length === 0) return [];
  const rows = String(registerText || '').split('\n').map((line) => [line.match(ROW_RE), line])
    .filter(([m]) => m).map(([, line]) => ({ id: line.match(ROW_RE)[1], text: line }));
  const hit = rows.filter(({ text }) => {
    const lower = text.toLowerCase();
    return clauseKeys.some((k) => text.includes(k))
      || (typeKeys.length > 0 && typeKeys.every((w) => lower.includes(String(w).toLowerCase())));
  }).map(({ id }) => id);
  return sortIds([...new Set(hit)]);
}

const sortIds = (ids) => ids.sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));

/** The paragraph after the marker, to the end of the row text; null when absent or empty. */
function paragraphOf(rowText) {
  const at = rowText.indexOf(PARAGRAPH_MARKER);
  if (at < 0) return null;
  const after = rowText.slice(at + PARAGRAPH_MARKER.length).trim();
  return after.length ? after : null;
}

/** Arm K on one register row. Returns `[]` = pass, else `FAIL:K:*` lines. */
export function checkRow({ rowText, registerText } = {}) {
  const text = typeof rowText === 'string' ? rowText : '';
  const para = paragraphOf(text);
  if (!para) return ['FAIL:K:no-conflict-check'];
  const self = text.match(ROW_RE);
  const selfId = self ? self[1] : null;
  const candidates = conflictCandidates(registerText, searchKeys(text)).filter((id) => id !== selfId);
  const fails = candidates.filter((id) => !new RegExp(`\\b${id}\\b`).test(para)).map((id) => `FAIL:K:omits:${id}`);
  if (fails.length) return fails;
  const named = [...new Set(para.match(ID_RE) || [])];
  for (let i = 0; i < named.length; i += 1) {
    const from = para.indexOf(named[i]);
    const next = i + 1 < named.length ? para.indexOf(named[i + 1], from) : -1;
    const segment = para.slice(from, next < 0 ? undefined : next).toLowerCase();
    if (!VERDICTS.some((v) => segment.includes(v))) fails.push(`FAIL:K:no-verdict:${named[i]}`);
  }
  return fails;
}

/** Arm K4 on a research card: a rule-text line with no recorded register search. */
export function checkCard(cardText) {
  const lines = String(cardText || '').split('\n');
  const hasRuleText = lines.some((l) => l.trim().startsWith('Rule-text line:'));
  const hasSearch = lines.some((l) => l.includes('Register search:'));
  return hasRuleText && !hasSearch ? ['FAIL:K:card-no-search'] : [];
}

/** CLI — `--text <file>` prints the CLI candidate list for that text, one id per line. */
function main(argv) {
  const at = argv.indexOf('--text');
  const file = at >= 0 ? argv[at + 1] : undefined;
  if (!file) {
    process.stderr.write('usage: register-conflicts.mjs --text <file>\n');
    process.exitCode = 2;
    return;
  }
  const registerText = fs.readFileSync(path.join(REPO_ROOT, DEFAULT_REGISTER), 'utf8');
  const keys = searchKeys(fs.readFileSync(file, 'utf8'));
  const ids = conflictCandidates(registerText, keys);
  process.stdout.write(ids.length ? `${ids.join('\n')}\n` : '');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
