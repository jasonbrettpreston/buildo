#!/usr/bin/env node
// G2 ruling wrapper (Backlog-home plan v8.1 section 3): creates a Backlog decision only with a verbatim quote that is present at a resolving
// cite (file:line that exists AND contains the quote), refuses a duplicate, and appends the M-246 dated note to each named task.
// A spec-amending ruling passes --spec-amending <stem>#<id> and is refused unless docs/reports/decisions/<stem>.md has the entry (R-HK;
// scripts/analysis/decision-log.mjs:58 reads that folder only), so it lands in both stores or neither.
// Rules: Spec 137 section 4 rule 4 (137_mcqueue.md:87), rule 10 (:109), Process 5 (MBQ:113); RR-0207, RR-0212.
// Usage: node scripts/analysis/backlog-decision.mjs --title "RR-nnnn <topic>" --date YYYY-MM-DD --quote "<verbatim>" --cite <path>:<line>
//        --text "<what was ruled>" [--tasks task-1,task-2] [--spec-amending <stem>#<id>] [--root <dir>] [--cite-root <dir>] [--backlog-bin <bin>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { args, backlogBin, bl, die, home, norm, parseFM, readItems, REPO, today } from './backlog-lib.mjs';

/** Resolve `path:line`, `path:a-b` or `path:a,b` and return the cited text, or throw a message naming the cite. */
export function citedText(cite, citeRoot) {
  const m = /^(.*?):(\d+)(?:-(\d+))?(?:,(\d+))?$/.exec(cite);
  if (!m) throw new Error(`cite "${cite}" is not <file>:<line>`);
  const p = path.isAbsolute(home(m[1])) ? home(m[1]) : path.join(citeRoot, m[1]);
  if (!fs.existsSync(p)) throw new Error(`cite file ${m[1]} does not exist (looked at ${p})`);
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  const from = Number(m[2]); const to = Number(m[3] ?? m[4] ?? m[2]);
  if (from < 1 || to > lines.length) throw new Error(`cite ${cite} is outside the file (${lines.length} lines)`);
  return lines.slice(from - 1, to).join('\n');
}

export function main(argv) {
  const a = args(argv);
  const root = path.resolve(a.root || REPO); const citeRoot = path.resolve(a['cite-root'] || root);
  for (const k of ['title', 'date', 'cite', 'text']) if (!a[k] || a[k] === true) die(`backlog-decision: --${k} is required`);
  if (!a.quote || a.quote === true) die('backlog-decision: refused, no verbatim quote (--quote): a ruling is the operator\'s own words (Spec 137 rule 10)');
  if (!norm(a.quote)) die('backlog-decision: refused, the quote is empty after whitespace is removed (Spec 137 rule 10)');
  let cited;
  try { cited = citedText(a.cite, citeRoot); } catch (e) { die(`backlog-decision: refused, cite does not resolve: ${e.message}`); }
  if (!norm(cited).includes(norm(a.quote))) die(`backlog-decision: refused, the quote is not found at ${a.cite} (the cited line does not contain it)`);
  if (a['spec-amending']) {
    const [stem, id] = String(a['spec-amending']).split('#');
    if (!/^[\w.-]+$/.test(stem ?? '') || stem.includes('..')) die(`backlog-decision: refused, --spec-amending stem "${stem}" is not a plain decision-log file name (no path)`);
    const f = path.join(root, 'docs/reports/decisions', `${stem}.md`);
    if (!stem || !id || !fs.existsSync(f) || !new RegExp(`(^|[^\\w-])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w-]|$)`).test(fs.readFileSync(f, 'utf8'))) {
      die(`backlog-decision: refused, --spec-amending ${a['spec-amending']} has no decision-log entry in docs/reports/decisions/${stem}.md (scripts/analysis/decision-log.mjs:58); enter it there first`);
    }
  }
  const dir = path.join(root, 'backlog/decisions');
  const rrId = /^(RR-\d+)/.exec(a.title)?.[1];
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const { fm, body } = parseFM(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (String(fm.title) === a.title || (rrId && String(fm.title).startsWith(`${rrId} `)) || (norm(body).includes(norm(a.quote)) && body.includes(a.cite))) die(`backlog-decision: refused, duplicate of ${f}`);
  }
  const bin = backlogBin(root, a['backlog-bin']);
  const c = bl(bin, root, ['decision', 'create', a.title, '-s', 'accepted', '--plain']);
  const id = /(decision-\d+)/i.exec(c.stdout)?.[1];
  if (c.status !== 0 || !id) die(`backlog-decision: backlog decision create failed: ${c.stdout}${c.stderr}`);
  const file = fs.readdirSync(dir).find((f) => f.toLowerCase().startsWith(`${id.toLowerCase()} -`));
  const tasks = String(a.tasks === true ? '' : a.tasks ?? '').split(',').map((x) => x.trim()).filter(Boolean).filter((x, i, all) => all.indexOf(x) === i);
  writeDecisionBody(path.join(dir, file), { date: a.date, quote: a.quote, cite: a.cite, text: a.text, tasks, specAmending: a['spec-amending'] });
  for (const t of tasks) {
    const n = bl(bin, root, ['task', 'edit', t, '--append-notes', datedNote({ date: a.date, rr: rrId ?? a.title, task: t, quote: a.quote }), '--plain']);
    if (n.status !== 0) die(`backlog-decision: decision written, but the dated note on ${t} failed: ${n.stdout}${n.stderr}`);
  }
  process.stdout.write(`${id} ${a.title}${tasks.length ? ` (dated note on ${tasks.join(', ')})` : ''}\n`);
}

/** The M-246 dated note form (Spec 137 rule 4, 137_mcqueue.md:87). */
export const datedNote = ({ date, rr, task, quote }) => `Dated note ${date} (M-246, prior text kept; ${rr} · ${task} · Backlog; operator, verbatim: "${quote}")`;

/** Rewrite a freshly created decision file: date, source, kind in the front matter and the body sections filled (decision create takes no body). */
export function writeDecisionBody(file, { date, quote, cite, text, tasks = [], supersedes = '', groups = '', specAmending = '' }) {
  const { fm } = parseFM(fs.readFileSync(file, 'utf8'));
  const front = `---\nid: ${fm.id}\ntitle: ${JSON.stringify(String(fm.title))}\ndate: ${date}\nstatus: ${fm.status}\nsource: operator\nkind: ruling\n---\n`;
  const body = `## Context\n\n${text}\n${groups ? `\nGroups: ${groups}\n` : ''}${tasks.length ? `\nTasks named: ${tasks.join(', ')}\n` : ''}${supersedes ? `\nSupersedes: ${supersedes}\n` : ''}${specAmending ? `\nSpec-amending: ${specAmending}\n` : ''}\n## Decision\n\nOperator, verbatim, ${date}: "${quote}"\n\nCite: ${cite}\n\n## Consequences\n\nThe ruling is in force from ${date}; the dated note (M-246) is on each task it names.\n`;
  fs.writeFileSync(file, front + body);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
export { today };
