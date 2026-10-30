// SPEC LINK: plan MB-67 lines 123-129, arm D (R-KO — cards and briefs)
// D1 every card block cites `file:line` (or NN:line shorthand) and its quoted text appears near the
//    cited line (line is a hint, content decides); D2 a recommendation cites a rule; D3 every brief
//    `run:` line matches an exec-policy `bash_allow` entry unless the brief names `provider: claude`
//    with a non-empty `reason:`; D4 a brief declares its `write_scope`. PURE: file reads are injected.
// Verdicts are `FAIL:<ARM>:<code>` with an optional `:<detail>` suffix.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_POLICY_REL = 'scripts/lib/exec-policy.json';
export const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

const BLOCK = /^\s*(?:[-*>]\s*)*(?:\*\*)?(Rule-text line|Rule|Recommend)/;
const RULE_TEXT_CITE = /(\S+\.md):(\d+)/;
const SHORT_CITE = /(\d+[a-z]?):(\d+)/;
const QUOTE = /"([^"]{20,})"/;
const WINDOW = 10;
const PLACEHOLDER = /^<(\w+)>(\.\.\.)?$/;

const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const firstCite = (line) => {
  const m = RULE_TEXT_CITE.exec(line) || SHORT_CITE.exec(line);
  return m ? { file: m[1], line: Number(m[2]) } : null;
};

function quoteFound(text, quote, at) {
  if (typeof text !== 'string') return false;
  const lines = text.split('\n');
  const from = Math.max(0, at - 1 - WINDOW);
  const to = Math.min(lines.length, at + WINDOW);
  return norm(lines.slice(from, to).join('\n')).includes(norm(quote));
}

/**
 * Verdicts for ONE card. `readCited(file)` returns the cited file's text or null.
 * @param {{cardText: string, readCited: (file: string) => string | null}} input
 * @returns {string[]}
 */
export function checkCard({ cardText, readCited }) {
  const verdicts = [];
  for (const line of String(cardText ?? '').split('\n')) {
    const head = BLOCK.exec(line);
    if (!head) continue;
    const kind = head[1];
    const cite = firstCite(line);
    const quoted = QUOTE.exec(line);
    if (!cite) {
      if (kind === 'Recommend') verdicts.push('FAIL:D:no-cite');
      else if (quoted) verdicts.push('FAIL:D:quote-not-found:no-cited-line');
      continue;
    }
    if (!quoted) continue;
    const text = readCited(cite.file);
    if (!quoteFound(text, quoted[1], cite.line)) verdicts.push(`FAIL:D:quote-not-found:${cite.file}:${cite.line}`);
  }
  return verdicts;
}

const isFlag = (tok) => tok.startsWith('-') && tok !== '-';

// placeholder values, so `<int>`/`<slug=…>` style flags can match concrete tokens
function flagMatches(spec, tok) {
  if (spec === tok) return true;
  if (PLACEHOLDER.test(spec)) return true;
  const eq = spec.indexOf('=');
  if (eq < 0) return false;
  const prefix = spec.slice(0, eq + 1);
  if (!tok.startsWith(prefix)) return false;
  const val = PLACEHOLDER.exec(spec.slice(eq + 1));
  return val !== null;
}

function matchEntry(entry, tokens) {
  const argv = Array.isArray(entry?.argv) ? entry.argv : [];
  const flags = Array.isArray(entry?.flags) ? entry.flags : [];
  const pathVars = argv.filter((t) => PLACEHOLDER.test(t));
  const flagVars = flags.filter((t) => PLACEHOLDER.test(t) || t.startsWith('-') === false);
  let i = 0;
  for (const spec of argv) {
    if (i >= tokens.length) return false;
    const p = PLACEHOLDER.exec(spec);
    if (p) {
      if (p[2] === '...') break; // `<path>...` swallows the remaining paths
      if (isFlag(tokens[i])) return false;
      i += 1;
      continue;
    }
    if (tokens[i] !== spec) return false;
    i += 1;
  }
  const hasPathVar = pathVars.length > 0;
  for (const tok of tokens.slice(i)) {
    if (isFlag(tok)) {
      if (!flags.some((f) => flagMatches(f, tok))) return false;
      continue;
    }
    // a bare value may fill a placeholder arg, or follow a value-taking flag (`-n 5`, `-L 1-9`)
    if (flagVars.length > 0 || hasPathVar) continue;
    return false;
  }
  return true;
}

/**
 * True when the command matches some `policy.bash_allow` entry.
 * @param {string[]} argvTokens @param {object} policy
 */
export function commandAllowed(argvTokens, policy) {
  const tokens = (argvTokens ?? []).map(String).filter((t) => t !== '');
  if (!tokens.length) return false;
  const entries = Array.isArray(policy?.bash_allow) ? policy.bash_allow : [];
  return entries.some((entry) => matchEntry(entry, tokens));
}

function frontMatter(text) {
  const lines = String(text ?? '').split('\n');
  if (lines[0].trim() !== '---') return null;
  for (let i = 1; i < lines.length; i += 1) if (lines[i].trim() === '---') return lines.slice(1, i);
  return null;
}

// a list item counts as write scope only while the enclosing top-level key is `write_scope`
function inWriteScope(fm, item) {
  for (let i = 0; i < fm.length; i += 1) {
    if (fm[i] === item) {
      for (let j = i - 1; j >= 0; j -= 1) {
        if (/^\S/.test(fm[j])) return /^write_scope:\s*$/.test(fm[j]);
      }
      return false;
    }
  }
  return false;
}

/**
 * Verdicts for ONE brief (D3, D4).
 * @param {{briefText: string, policy: object}} input
 * @returns {string[]}
 */
export function checkBrief({ briefText, policy }) {
  const verdicts = [];
  const fm = frontMatter(briefText);
  if (fm === null) verdicts.push('FAIL:D:no-write-scope:no-front-matter');
  else if (!fm.some((l) => /^\s*-\s+\S/.test(l) && inWriteScope(fm, l))) verdicts.push('FAIL:D:no-write-scope');
  const provider = fm !== null && fm.some((l) => /^provider:\s*claude\s*$/.test(l));
  const reason = fm !== null && fm.some((l) => /^reason:\s*\S/.test(l));
  const exempt = provider && reason;
  for (const raw of String(briefText ?? '').split('\n')) {
    const m = /^\s*(?:[-*>]\s*)*`?run:\s*(.+?)\s*`?\s*$/.exec(raw);
    if (!m) continue;
    const tokens = m[1].split(/\s+/).filter(Boolean);
    if (!exempt && !commandAllowed(tokens, policy)) verdicts.push(`FAIL:D:not-in-bash-allow:${tokens.join(' ')}`);
  }
  return verdicts;
}
