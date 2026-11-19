// Shared helpers for the Backlog-home scripts (plan v8.1 section 3: plan-to-backlog.mjs, backlog-brief.mjs, backlog-decision.mjs,
// backlog-next.mjs). Small on purpose: a front-matter reader, the pinned CLI runner and a few string helpers. No behaviour of its own.
// Rules: Spec 137 section 4 rules 2-4 (docs/specs/00-architecture/137_mcqueue.md:81-87); PLAN-PROTOCOL.md:3 keep it simple.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
export const sha12 = (text) => sha256(Buffer.from(text)).slice(0, 12);
export const die = (msg, code = 1) => { process.stderr.write(`${msg}\n`); process.exit(code); };
export const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

/** Parse `--key value` arguments into an object (a flag with no value is true). */
export function args(argv = process.argv.slice(2)) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) { (o._ ??= []).push(argv[i]); continue; }
    const k = argv[i].slice(2);
    const v = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    o[k] = v;
  }
  return o;
}

/** The pinned Backlog.md 1.55.3 binary: --backlog-bin, else $BACKLOG_BIN, else the repo's node_modules/.bin/backlog (the devDependency). */
export function backlogBin(root, given) {
  const b = given || process.env.BACKLOG_BIN || [path.join(root || REPO, 'node_modules/.bin/backlog'), path.join(REPO, 'node_modules/.bin/backlog')].find((c) => fs.existsSync(c)) || path.join(REPO, 'node_modules/.bin/backlog');
  if (!fs.existsSync(b)) die(`backlog binary not found at ${b} (pass --backlog-bin; the plan pins backlog.md@1.55.3)`);
  return b;
}
export function bl(bin, cwd, a, input) {
  const r = spawnSync(bin, a, { cwd, encoding: 'utf8', input, maxBuffer: 1 << 28 });
  return { status: r.status, stdout: r.stdout ?? '', stderr: (r.stderr ?? '') + (r.error ? String(r.error) : '') };
}

const unq = (v) => v.trim().replace(/^'(.*)'$/s, (_, x) => x.replace(/''/g, "'")).replace(/^"(.*)"$/s, '$1');
function inlineList(v) {
  const out = []; let cur = ''; let q = '';
  for (const ch of v.slice(1, -1)) {
    if (q) { cur += ch; if (ch === q) q = ''; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === ',') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map(unq);
}
/** Front matter as {key: string | string[]}; block lists and inline lists both read as arrays. */
export function parseFM(text) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) return { fm: {}, body: text };
  const fm = {}; let key = '';
  const lines = m[1].split('\n');
  // A folded scalar ("- >-" or "key: >-", which Backlog writes for lines over 80 characters): the indented lines that follow, joined by spaces.
  const folded = (i) => { const parts = []; while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1]) && !/^\s+- /.test(lines[i + 1])) parts.push(lines[++i].trim()); return [parts.join(' '), i]; };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const li = /^\s+-\s+(.*)$/.exec(line);
    if (li && key) { if (!Array.isArray(fm[key])) fm[key] = []; let v = unq(li[1]); if (/^[>|]-?$/.test(v)) [v, i] = folded(i); fm[key].push(v); continue; }
    const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    key = kv[1]; let v = kv[2].trim();
    if (/^[>|]-?$/.test(v)) { [v, i] = folded(i); fm[key] = v; continue; }
    fm[key] = v === '' ? [] : v.startsWith('[') && v.endsWith(']') ? inlineList(v) : unq(v);
  }
  return { fm, body: m[2] };
}
export const asList = (v) => (v === undefined ? [] : [].concat(v)).filter((x) => x !== '');

/** Every task (and optionally draft) file of a Backlog project: {id: 'task-N', fm, body, text, file, draft}. */
export function readItems(root, { drafts = false } = {}) {
  const out = [];
  for (const [sub, draft] of [['tasks', false], ['drafts', true]]) {
    if (draft && !drafts) continue;
    const dir = path.join(root, 'backlog', sub);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      const { fm, body } = parseFM(text);
      out.push({ id: String(fm.id ?? '').toLowerCase(), fm, body, text, file: path.join(dir, f), draft });
    }
  }
  return out;
}
export const planLabels = (t) => asList(t.fm.labels).filter((l) => l.startsWith('plan:')).map((l) => l.slice(5));
export const numOf = (id) => Number(/(\d+)$/.exec(String(id))?.[1]);

/** The description block of a task file (between the SECTION markers), else ''. */
export function descriptionOf(t) {
  const m = /<!-- SECTION:DESCRIPTION:BEGIN -->\n?([\s\S]*?)\n?<!-- SECTION:DESCRIPTION:END -->/.exec(t.body);
  return m ? m[1] : '';
}
export const today = () => new Date().toISOString().slice(0, 10);
export const home = (p) => (p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p);
