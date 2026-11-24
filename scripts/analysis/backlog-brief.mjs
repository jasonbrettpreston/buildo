#!/usr/bin/env node
// G1 brief from the task (Backlog-home plan v8.1 section 3): emits the lane brief from the Backlog task file, so a brief is never hand-written
// in scratch. Prints the TKT-1 header (Spec 08 11.9, 08_agents.md:504), the quoted rules from the task's acceptance criteria and decisions,
// scope, done-condition (the AC list), max_fix_rounds, the Spec 137 rule 3 line, the Spec 08 substrate lines, the take order, the review
// command and the close step; and writes the review context file docs/reports/reviews/<task>/context-rN.md (sha256 in the brief).
// Usage: node scripts/analysis/backlog-brief.mjs --task task-N --lane <name> [--stage N] [--root <dir>] [--board <dir>] [--date YYYY-MM-DD]
// --board <dir>: read the decisions from that board checkout (<dir>/backlog/decisions) instead of <root>; a lane re-runs the brief each review round so the context holds the rulings as they are then (task-432, RR-0378 step 5).
// Rules: Spec 08 TKT-1 (08_agents.md:504), Spec 08 section 7 rule 10 (a) (:341), Spec 137 rule 3 (137_mcqueue.md:84); RR-0207, RR-0212.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { args, asList, descriptionOf, die, parseFM, planLabels, readItems, REPO, sha256, today } from './backlog-lib.mjs';

// task-375 A3: the committed context file is passed to the review tool with one --section per CONTEXT_SECTIONS entry
const sectionFlags = createRequire(import.meta.url)('../lib/review-template.js').CONTEXT_SECTIONS.map((x) => `--section "${x}"`).join(' ');
const a = args();
const root = path.resolve(a.root || REPO);
// task-432: --board given must be a board checkout with backlog/decisions; a bare --board or a missing directory dies, never a silent fallback to <root>
if (a.board === true || a.board === '') die('backlog-brief: --board needs a directory (the board checkout whose backlog/decisions is read)');
const boardDir = a.board === undefined ? null : path.resolve(a.board);
if (boardDir && !fs.existsSync(path.join(boardDir, 'backlog/decisions'))) die(`backlog-brief: --board ${boardDir} has no backlog/decisions directory`);
const date = a.date && a.date !== true ? a.date : today();
const taskId = String(a.task === true ? '' : a.task ?? '').toLowerCase();
const lane = String(a.lane === true ? '' : a.lane ?? '');
const stage = a.stage && a.stage !== true ? a.stage : '1';
if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(lane) || !/^\d{1,3}$/.test(String(stage))) die('backlog-brief: --date must be YYYY-MM-DD, --lane a plain name (letters, digits, . _ -), --stage a number');
if (!/^task-\d+$/.test(taskId) || !lane) die('backlog-brief: usage: --task task-N --lane <name> [--stage N] [--root <dir>] [--board <dir>] [--date YYYY-MM-DD]');
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
const decDir = path.join(boardDir ?? root, 'backlog/decisions');
const decisions = (fs.existsSync(decDir) ? fs.readdirSync(decDir).filter((f) => f.endsWith('.md')).sort() : []).map((f) => {
  const text = fs.readFileSync(path.join(decDir, f), 'utf8'); const { fm, body } = parseFM(text);
  const q = /verbatim, [^:]*: "([^"]+)"/.exec(body)?.[1]; const cite = /^Cite: (.*)$/m.exec(body)?.[1];
  return { title: String(fm.title), body, quote: q, cite };
});
const named = decisions.filter((d) => { const rr = /^(RR-\d+)/.exec(d.title)?.[1]; return rr && t.body.includes(rr); });
for (const d of named) if (d.quote) rules.push(`${d.title}: "${d.quote}" (${d.cite ?? 'cite in the decision'})`);

// The review context file (written from the task, its docs and its decisions; sha256 goes in the brief).
// task-375 A5: one context file per review round, context-rN.md, N = the context-r*.md files already there + 1; an earlier round's file is never overwritten.
const ctxDir = path.join(root, 'docs/reports/reviews', taskId);
const round = createRequire(import.meta.url)('../lib/review-template.js').contextRound(ctxDir);
const ctxRel = `docs/reports/reviews/${taskId}/context-r${round}.md`;
const docs = asList(t.fm.documentation);
// task-375 A1: the Implementation Plan and Implementation Notes fields of the task, headings inside the text demoted so they cannot end the section.
const fieldOf = (name) => (new RegExp(`<!-- SECTION:${name}:BEGIN -->\\n?([\\s\\S]*?)\\n?<!-- SECTION:${name}:END -->`).exec(t.body)?.[1] ?? '').trim().replace(/^#{1,6} /gm, '#### ') || '(none)';
// ---- McLane context pack (task-309 R8d, RR-0235 "linked with all the relevant data"): milestone text, document sections, decisions, prior reviews, dependencies.
const CAP_TOTAL = 120 * 1024; const CAP_BLOCK = 12 * 1024; const CAP_SUMMARY = 4000;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const namesId = (text, id, flags = '') => !!id && new RegExp(`(?<![\\w.-])${esc(String(id))}(?![\\w-]|\\.\\d)`, flags).test(text);
const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
const rel = (p) => path.relative(root, p) || p;
const ls = (dir) => { try { return fs.readdirSync(dir); } catch { return []; } };
const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };

// (1) milestone: the file whose id or title is the task's milestone.
const msKey = String(t.fm.milestone ?? '').trim().toLowerCase();
const msDir = path.join(root, 'backlog/milestones');
const ms = msKey ? ls(msDir).filter((f) => f.endsWith('.md')).sort().map((f) => parseFM(readText(path.join(msDir, f)) ?? '')).find((m) => [m.fm.id, m.fm.title].some((v) => String(v ?? '').trim().toLowerCase() === msKey)) : undefined;
const msSection = ms
  ? [`${ms.fm.id} ${ms.fm.title}`, '', ms.body.trim().replace(/^## /gm, '### ')]
  : [`(no milestone file for "${t.fm.milestone ?? 'none'}" under backlog/milestones)`];

// (2) documents: links from the task's documentation list and the milestone's Documents section; "path#L10-20", "path#Section title" or bare path.
const linkOf = (s) => (/\]\(([^)]+)\)/.exec(String(s))?.[1] ?? String(s)).trim();
const msLinks = ms ? (/^##+ Documents[^\n]*\n([\s\S]*?)(?=\n## |(?![\s\S]))/im.exec(ms.body)?.[1] ?? '').split('\n').map((l) => /^\s*[-*]\s+(.+)$/.exec(l)?.[1]).filter(Boolean).map(linkOf) : [];
const links = [...new Set([...docs.map(linkOf), ...msLinks].filter(Boolean))];
const fence = (body) => { const n = Math.max(2, ...[...body.matchAll(/^~+/gm)].map((m) => m[0].length)) + 1; return '~'.repeat(n); };
function docBlock(link) {
  const [p0, ...fr] = link.split('#'); const p = p0.trim(); const frag = safeDecode(fr.join('#')).trim();
  if (/^https?:\/\//i.test(p)) return `### ${p}\n(not a local file; read it at ${p})`;
  const abs = p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : path.resolve(root, p.replace(/^origin:/, ''));
  let text; try { text = fs.readFileSync(abs, 'utf8'); } catch (e) { return `### ${p} (not readable: ${e.code ?? e.message}; read it at ${p})`; }
  const all = text.split('\n'); if (all.at(-1) === '') all.pop();
  if (!all.length) return `### ${p} (empty file)`;
  let from = 1; let to = all.length; let note = '';
  const lr = /^L(\d+)(?:-L?(\d+))?$/.exec(frag);
  if (lr) { from = Number(lr[1]); to = lr[2] ? Number(lr[2]) : from; if (from > to) [from, to] = [to, from]; from = Math.max(1, from); to = Math.min(to, all.length); if (from > to) { from = 1; to = all.length; note = ` (range ${frag} is outside the file)`; } else if (Number(lr[2] ?? lr[1]) > all.length) note = ` (range ${frag} runs past the end of the file)`; }
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
const docSection = [`Cap: 120 KB in total, 12 KB per block (document blocks below; an omitted block costs its notice against the total); a block that would pass the total is listed as omitted. Sections named in a link (#L<n>-<m> or a section title) are read; with none named, the first 12 KB.`, ''];
let used = 0;
for (const l of links) {
  const b = docBlock(l); const size = Buffer.byteLength(b) + 2;
  if (used + size > CAP_TOTAL) { const o = `### ${l.split('#')[0]}\n(omitted: total cap of 120 KB reached; read it at ${l.split('#')[0]})`; used += Buffer.byteLength(o) + 2; docSection.push(o, ''); continue; }
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
const depAll = asList(t.fm.dependencies).map((x) => String(x).toLowerCase());
const depIds = depAll.filter((x) => /^task-\d+(\.\d+)*$/.test(x));
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
}).concat(depAll.filter((x) => !depIds.includes(x)).map((x) => `- ${JSON.stringify(x)}: (not a task id; skipped)`)) : ['- (none)'];

const ctx = [
  `# Review context for ${taskId} (${label}) written ${date} by backlog-brief.mjs (round ${round})`, '',
  `## Task`, `${taskId} ${title}`, `status: ${t.fm.status} · milestone: ${t.fm.milestone ?? 'none'} · assignee: ${asList(t.fm.assignee).join(', ') || 'none'} · labels: ${asList(t.fm.labels).join(', ')}`, '',
  `## Description`, descriptionOf(t).trim() || '(none)', '',
  `## Acceptance criteria`, ...ac.map((c) => `- #${c.n} ${c.text}`), '',
  `## Implementation Plan`, fieldOf('PLAN'), '',
  `## Implementation Notes`, fieldOf('NOTES'), '',
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
  ...(ac.length ? ac.map((c) => `  #${c.n} ${c.text}`) : [`  (none found in ${t.file})`]), // T8 (task-453): an empty AC block is said, not left blank
  `max_fix_rounds: 2`,
  '',
  // T1 (task-453): a lane build or fix task closes in two commits (Spec 137 Rule 3 as amended, 137_mcqueue.md:98); another type keeps the line as it was
  ['build', 'fix'].includes(String(t.fm.type ?? '').toLowerCase())
    ? `Status line (Spec 137 rule 3 as amended by its note of 2026-11-20, 137_mcqueue.md:98): the work lands first; the closing commit carries only the lane report dir, the review context dir, the task file and the decision record. Every code commit carries "Task: ${taskId}" and the task file in the same diff (hook check-backlog-task.mjs).`
    : `Status line (Spec 137 rule 3, docs/specs/00-architecture/137_mcqueue.md:84): "The status line changes in the same commit as the work." Every code commit carries "Task: ${taskId}" and the task file in the same diff (hook check-backlog-task.mjs).`,
  `Substrate (Spec 08 08_agents.md:334): "NEVER run one generic pass" - run the lens set in parallel, each a narrow prompt; and (08_agents.md:339): "spend tool-bearing Claude only when live tree / DB / git tools are strictly required".`,
  '',
  `Take order:`,
  `  1. backlog task edit ${taskId} -s RUNNING -a ${laneArg}`,
  `  2. If the task's Implementation Plan field already holds a plan (reviewed, ruled and checked before launch), build that plan and do NOT run --plan; only a task with no plan runs: backlog task edit ${taskId} --plan "<numbered steps, one per acceptance criterion>"`,
  `  The plan is the task text at launch, checked before launch (plan evidence folder, grounder file and seat reports on the board; the launch gate refuses otherwise): do not re-plan, do not edit the Description, Acceptance or Plan, record deviations in Implementation Notes; plan findings were ruled once, at the plan: the lane runs no plan lens and its GROUNDER.md rules the output findings only.`,
  `Review (output only): the output lens set and its commands are in the lens line of this brief; no plan lens is run (plan findings were ruled once, at the plan).`,
  `  Run by the tool-bearing Claude lane with provider claude: scripts/deepseek-review.js is not in exec-policy.json bash_allow, which governs only the DeepSeek execution engine (Spec 08 section 7 rule 10 (b), 08_agents.md:341). Context file ${ctxRel} sha256=${ctxSha}.`,
  `Context pack sections: ${ctxRel} also carries Milestone, Document sections, Decisions naming this task, Prior reviews and lane reports, Dependencies (RR-0235): read it, not only the references above.`,
  `Close:`,
  `  backlog task edit ${taskId} --check-ac <n> (each criterion, with its evidence) --final-summary "<what landed, commit sha, hook result>" --append-final-summary "<the outcome block the close check prints: Review round N line and one line per CRITICAL, HIGH or MED finding>" -s BUILT (round 1 only; from round 2 on use only --append-final-summary so the earlier round lines stay on the page; one command; every CONFIRMED or CONFLICT finding of GROUNDER.md has an outcome line in TRIAGE.md first: node scripts/hooks/check-lane-close.mjs --outcomes <lane dir>)`,
  `  End the report with one line: STATUS: ready|blocked|failed|dropped`,
  `Standing rules: attach the lane standing rules file; no push, no DB, no --no-verify.`,
  '',
].join('\n');
process.stdout.write(out);
