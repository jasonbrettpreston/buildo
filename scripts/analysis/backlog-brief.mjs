#!/usr/bin/env node
// G1 brief from the task (Backlog-home plan v8.1 section 3): emits the lane brief from the Backlog task file, so a brief is never hand-written
// in scratch. Prints the TKT-1 header (Spec 08 11.9, 08_agents.md:504), the quoted rules from the task's acceptance criteria and decisions,
// scope, done-condition (the AC list), max_fix_rounds, the Spec 137 rule 3 line, the Spec 08 substrate lines, the take order, the review
// command and the close step; and writes the review context file docs/reports/reviews/<task>/context-<date>.md (sha256 in the brief).
// Usage: node scripts/analysis/backlog-brief.mjs --task task-N --lane <name> [--stage N] [--root <dir>] [--date YYYY-MM-DD]
// Rules: Spec 08 TKT-1 (08_agents.md:504), Spec 08 section 7 rule 10 (a) (:341), Spec 137 rule 3 (137_mcqueue.md:84); RR-0207, RR-0212.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { args, asList, descriptionOf, die, parseFM, planLabels, readItems, REPO, sha256, today } from './backlog-lib.mjs';

const a = args();
const root = path.resolve(a.root || REPO);
const date = a.date && a.date !== true ? a.date : today();
const taskId = String(a.task === true ? '' : a.task ?? '').toLowerCase();
const lane = String(a.lane === true ? '' : a.lane ?? '');
const stage = a.stage && a.stage !== true ? a.stage : '1';
if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(lane) || !/^\d{1,3}$/.test(String(stage))) die('backlog-brief: --date must be YYYY-MM-DD, --lane a plain name (letters, digits, . _ -), --stage a number');
if (!/^task-\d+$/.test(taskId) || !lane) die('backlog-brief: usage: --task task-N --lane <name> [--stage N] [--root <dir>] [--date YYYY-MM-DD]');
const t = readItems(root).find((x) => x.id === taskId);
if (!t) die(`backlog-brief: ${taskId} not found: no such task file under ${path.join(root, 'backlog/tasks')}`);

const title = String(t.fm.title);
const refs = asList(t.fm.references);
const rowId = refs.map((r) => /(?:^|\s)ROW:((?:MB|MF)-\d+[a-z]?)/.exec(r)?.[1]).find(Boolean) ?? /^((?:MB|MF)-\d+[a-z]?)\b/.exec(title)?.[1];
const planId = planLabels(t)[0];
const label = asList(t.fm.labels).includes('queue-row') && rowId ? rowId : (planId ?? rowId ?? 'no plan id');

// Acceptance criteria: the checkbox lines between the AC markers.
const acBlock = /<!-- AC:BEGIN -->([\s\S]*?)<!-- AC:END -->/.exec(t.body)?.[1] ?? '';
const ac = acBlock.split('\n').map((l) => /^- \[[ x]\] #(\d+) (.*)$/.exec(l)).filter(Boolean).map((m) => ({ n: m[1], text: m[2] }));
// Rules: every `"quote" (cite)` found in the AC lines, plus the decisions the task names.
const rules = [];
for (const c of ac) for (const m of c.text.matchAll(/"([^"]+)"\s*\(([^)]+)\)/g)) rules.push(`"${m[1]}" (${m[2]})`);
const decDir = path.join(root, 'backlog/decisions');
const decisions = (fs.existsSync(decDir) ? fs.readdirSync(decDir).filter((f) => f.endsWith('.md')).sort() : []).map((f) => {
  const text = fs.readFileSync(path.join(decDir, f), 'utf8'); const { fm, body } = parseFM(text);
  const q = /verbatim, [^:]*: "([^"]+)"/.exec(body)?.[1]; const cite = /^Cite: (.*)$/m.exec(body)?.[1];
  return { title: String(fm.title), body, quote: q, cite };
});
const named = decisions.filter((d) => { const rr = /^(RR-\d+)/.exec(d.title)?.[1]; return rr && t.body.includes(rr); });
for (const d of named) if (d.quote) rules.push(`${d.title}: "${d.quote}" (${d.cite ?? 'cite in the decision'})`);

// The review context file (written from the task, its docs and its decisions; sha256 goes in the brief).
const ctxRel = `docs/reports/reviews/${taskId}/context-${date}.md`;
const docs = asList(t.fm.documentation);
// ---- McLane context pack (task-309 R8d, RR-0235 "linked with all the relevant data"): milestone text, document sections, decisions, prior reviews, dependencies.
const CAP_TOTAL = 120 * 1024; const CAP_BLOCK = 12 * 1024; const CAP_SUMMARY = 4000;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const namesId = (text, id, flags = '') => !!id && new RegExp(`(?<![\\w.-])${esc(id)}(?![\\w-]|\\.\\d)`, flags).test(text);
const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
const rel = (p) => path.relative(root, p) || p;
const ls = (dir) => { try { return fs.readdirSync(dir); } catch { return []; } };
const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };

// (1) milestone: the file whose id or title is the task's milestone.
const msKey = String(t.fm.milestone ?? '').trim().toLowerCase();
const msDir = path.join(root, 'backlog/milestones');
const ms = msKey ? ls(msDir).filter((f) => f.endsWith('.md')).map((f) => parseFM(readText(path.join(msDir, f)) ?? '')).find((m) => [m.fm.id, m.fm.title].some((v) => String(v ?? '').trim().toLowerCase() === msKey)) : undefined;
const msSection = ms
  ? [`${ms.fm.id} ${ms.fm.title}`, '', ms.body.trim().replace(/^## /gm, '### ')]
  : [`(no milestone file for "${t.fm.milestone ?? 'none'}" under backlog/milestones)`];

// (2) documents: links from the task's documentation list and the milestone's Documents section; "path#L10-20", "path#Section title" or bare path.
const linkOf = (s) => (/\]\(([^)]+)\)/.exec(s)?.[1] ?? s).trim();
const msLinks = ms ? (/^##+ Documents[^\n]*\n([\s\S]*?)(?=\n## |(?![\s\S]))/im.exec(ms.body)?.[1] ?? '').split('\n').map((l) => /^\s*[-*]\s+(.+)$/.exec(l)?.[1]).filter(Boolean).map(linkOf) : [];
const links = [...new Set([...docs.map(linkOf), ...msLinks].filter(Boolean))];
const fence = (body) => { const n = Math.max(2, ...[...body.matchAll(/^~+/gm)].map((m) => m[0].length)) + 1; return '~'.repeat(n); };
function docBlock(link) {
  const [p0, ...fr] = link.split('#'); const p = p0.trim(); const frag = safeDecode(fr.join('#')).trim();
  if (/^https?:\/\//i.test(p)) return `### ${p}\n(not a local file; read it at ${p})`;
  const abs = p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : path.resolve(root, p.replace(/^origin:/, ''));
  const text = readText(abs);
  if (text === null) return `### ${p} (not readable: no such file or not a regular file; read it at ${p})`;
  const all = text.split('\n'); if (all.at(-1) === '') all.pop();
  let from = 1; let to = all.length; let note = '';
  const lr = /^L(\d+)(?:-L?(\d+))?$/.exec(frag);
  if (lr) { from = Number(lr[1]); to = lr[2] ? Number(lr[2]) : from; if (from > to) [from, to] = [to, from]; from = Math.max(1, from); to = Math.min(to, all.length); if (from > to) { from = 1; to = all.length; note = ` (range ${frag} is outside the file)`; } }
  else if (frag) {
    const head = (l) => /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l);
    const i = all.findIndex((l) => head(l)?.[2].toLowerCase() === frag.toLowerCase());
    if (i < 0) note = ` (section "${frag}" not found)`;
    else { const lvl = head(all[i])[1].length; let e = all.length; for (let k = i + 1; k < all.length; k++) { const h = head(all[k]); if (h && h[1].length <= lvl) { e = k; break; } } from = i + 1; to = e; }
  }
  let bytes = 0; let last = from - 1; const kept = [];
  for (let k = from; k <= to; k++) { const line = all[k - 1].slice(0, 4000); bytes += Buffer.byteLength(line) + 1; if (bytes > CAP_BLOCK && k > from) break; kept.push(line); last = k; }
  const body = kept.join('\n'); const f = fence(body);
  return `### ${p} lines ${from}-${last} of ${all.length}${note}${last < to ? ' (cut at 12 KB)' : ''}\n${f}\n${body}\n${f}\n(read the rest at ${p})`;
}
const docSection = [`Cap: 120 KB in total, 12 KB per block; a block that would pass the total is listed as omitted. Sections named in a link (#L<n>-<m> or a section title) are read; with none named, the first 12 KB.`, ''];
let used = 0;
for (const l of links) {
  const b = docBlock(l); const size = Buffer.byteLength(b) + 2;
  if (used + size > CAP_TOTAL) { docSection.push(`### ${l.split('#')[0]}\n(omitted: total cap of 120 KB reached; read it at ${l.split('#')[0]})`, ''); continue; }
  used += size; docSection.push(b, '');
}
if (!links.length) docSection.push('(no linked documents)', '');

// (3) decisions whose title or body names the task id, a plan id, the ROW id, or an RR id the task body names (today's rule); the operator quote and cite for each.
const keys = [taskId, ...planLabels(t), rowId].filter(Boolean);
const hits = decisions.map((d) => {
  const why = keys.filter((k) => namesId(`${d.title}\n${d.body}`, k, k === taskId ? 'i' : ''));
  const rr = /^(RR-\d+)/.exec(d.title)?.[1]; if (rr && t.body.includes(rr)) why.push(rr);
  return { d, why };
}).filter((h) => h.why.length);
const decSection = hits.length ? hits.map(({ d, why }) => `- ${d.title} (names ${why.join(', ')}) — ${d.quote ? `"${d.quote}" (${d.cite ?? 'cite in the decision'})` : '(no operator quote recorded)'}`) : ['- (none)'];

// (4) prior reviews and lane reports for the task and each dependency.
const depIds = asList(t.fm.dependencies).map((x) => String(x).toLowerCase());
const lanesDir = path.join(root, 'docs/reports/lanes');
const laneReports = ls(lanesDir).flatMap((a) => ls(path.join(lanesDir, a)).map((b) => path.join(lanesDir, a, b, 'REPORT.md'))).map((p) => ({ p, text: readText(p) })).filter((r) => r.text !== null);
const priorSection = [];
for (const id of [taskId, ...depIds]) {
  const rd = path.join(root, 'docs/reports/reviews', id);
  const revs = ls(rd).filter((f) => f.endsWith('.md') && !/^context-.*\.md$/.test(f)).sort();
  const reps = laneReports.filter((r) => namesId(r.text, id, 'i')).map((r) => rel(r.p)).sort();
  priorSection.push(`### ${id}${id === taskId ? ' (this task)' : ' (dependency)'}`, ...revs.map((f) => `- ${rel(path.join(rd, f))}`), ...reps.map((f) => `- ${f} (lane report naming ${id})`));
  if (!revs.length && !reps.length) priorSection.push('- (none)');
}

// (5) dependencies: id, title, status and the Final Summary.
const everyItem = readItems(root, { drafts: true });
const finalOf = (x) => (/<!-- SECTION:FINAL_SUMMARY:BEGIN -->\n?([\s\S]*?)\n?<!-- SECTION:FINAL_SUMMARY:END -->/.exec(x.body)?.[1] ?? /^##+ Final Summary\s*\n([\s\S]*?)(?=\n## |(?![\s\S]))/im.exec(x.body)?.[1] ?? '').trim();
const depSection = depIds.length ? depIds.flatMap((id) => {
  const x = everyItem.find((y) => y.id === id);
  if (!x) return [`- ${id}: (no such task or draft file)`];
  const fin = finalOf(x);
  return [`- ${id} ${x.fm.title} · status: ${x.fm.status}`, `  final summary: ${fin ? (fin.length > CAP_SUMMARY ? `${fin.slice(0, CAP_SUMMARY)} ... (cut; read the rest in ${rel(x.file)})` : fin) : '(none yet)'}`];
}) : ['- (none)'];

const ctx = [
  `# Review context for ${taskId} (${label}) written ${date} by backlog-brief.mjs`, '',
  `## Task`, `${taskId} ${title}`, `status: ${t.fm.status} · milestone: ${t.fm.milestone ?? 'none'} · assignee: ${asList(t.fm.assignee).join(', ') || 'none'} · labels: ${asList(t.fm.labels).join(', ')}`, '',
  `## Description`, descriptionOf(t).trim() || '(none)', '',
  `## Acceptance criteria`, ...ac.map((c) => `- #${c.n} ${c.text}`), '',
  `## References`, ...(refs.length ? refs.map((r) => `- ${r}`) : ['- (none)']), '',
  `## Documents`, ...(docs.length ? docs.map((d) => `- ${d}`) : ['- (none)']), '',
  `## Decisions in force (titles; the ones this task names carry the operator's words)`,
  ...decisions.map((d) => `- ${d.title}${named.includes(d) && d.quote ? ` — "${d.quote}" (${d.cite})` : ''}`), '',
  `## Milestone`, ...msSection, '',
  `## Document sections`, ...docSection,
  `## Decisions naming this task`, ...decSection, '',
  `## Prior reviews and lane reports`, ...priorSection, '',
  `## Dependencies`, ...depSection, '',
].join('\n');
fs.mkdirSync(path.dirname(path.join(root, ctxRel)), { recursive: true });
fs.writeFileSync(path.join(root, ctxRel), ctx);
const ctxSha = sha256(Buffer.from(ctx)).slice(0, 12);

const laneArg = `@lane-${lane}`;
const out = [
  `Ticket: ${taskId} (${label}) · lane ${lane} · stage ${stage}`,
  `Rule: ${rules.length ? rules.map((r) => `\n  - ${r}`).join('') : 'none quoted in the task (the task is a card for the missing rule, MBQ:107)'}`,
  `Scope: ${taskId} only: ${title}${t.fm.milestone ? ` (milestone ${t.fm.milestone})` : ''}. Wider scope is a new task, not a longer brief (TKT-1, 08_agents.md:504).`,
  `Done-condition: every acceptance criterion below is checked with evidence, and the definition of done of the config holds:`,
  ...ac.map((c) => `  #${c.n} ${c.text}`),
  `max_fix_rounds: 2`,
  '',
  `Status line (Spec 137 rule 3, docs/specs/00-architecture/137_mcqueue.md:84): "The status line changes in the same commit as the work." Every code commit carries "Task: ${taskId}" and the task file in the same diff (hook check-backlog-task.mjs).`,
  `Substrate (Spec 08 08_agents.md:334): "NEVER run one generic pass" - run the lens set in parallel, each a narrow prompt; and (08_agents.md:339): "spend tool-bearing Claude only when live tree / DB / git tools are strictly required".`,
  '',
  `Take order:`,
  `  1. backlog task edit ${taskId} -s RUNNING -a ${laneArg}`,
  `  2. backlog task edit ${taskId} --plan "<numbered steps, one per acceptance criterion>"`,
  `Review (plan or output): node scripts/deepseek-review.js review ${ctxRel} --context .claude/review-templates/plan-review-deepseek.md`,
  `  Run by the tool-bearing Claude lane with provider claude: scripts/deepseek-review.js is not in exec-policy.json bash_allow, which governs only the DeepSeek execution engine (Spec 08 section 7 rule 10 (b), 08_agents.md:341). Context file ${ctxRel} sha256=${ctxSha}.`,
  `Context pack sections: ${ctxRel} also carries Milestone, Document sections, Decisions naming this task, Prior reviews and lane reports, Dependencies (RR-0235): read it, not only the references above.`,
  `Close:`,
  `  backlog task edit ${taskId} --check-ac <n> (each criterion, with its evidence) --final-summary "<what landed, commit sha, hook result>" -s DONE|BUILT`,
  `  End the report with one line: STATUS: ready|blocked|failed|dropped`,
  `Standing rules: attach the lane standing rules file; no push, no DB, no --no-verify.`,
  '',
].join('\n');
process.stdout.write(out);
