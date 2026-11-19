#!/usr/bin/env node
// G1 brief from the task (Backlog-home plan v8.1 section 3): emits the lane brief from the Backlog task file, so a brief is never hand-written
// in scratch. Prints the TKT-1 header (Spec 08 11.9, 08_agents.md:504), the quoted rules from the task's acceptance criteria and decisions,
// scope, done-condition (the AC list), max_fix_rounds, the Spec 137 rule 3 line, the Spec 08 substrate lines, the take order, the review
// command and the close step; and writes the review context file docs/reports/reviews/<task>/context-<date>.md (sha256 in the brief).
// Usage: node scripts/analysis/backlog-brief.mjs --task task-N --lane <name> [--stage N] [--root <dir>] [--date YYYY-MM-DD]
// Rules: Spec 08 TKT-1 (08_agents.md:504), Spec 08 section 7 rule 10 (a) (:341), Spec 137 rule 3 (137_mcqueue.md:84); RR-0207, RR-0212.
import fs from 'node:fs';
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
const decisions = (fs.existsSync(decDir) ? fs.readdirSync(decDir).filter((f) => f.endsWith('.md')) : []).map((f) => {
  const text = fs.readFileSync(path.join(decDir, f), 'utf8'); const { fm, body } = parseFM(text);
  const q = /verbatim, [^:]*: "([^"]+)"/.exec(body)?.[1]; const cite = /^Cite: (.*)$/m.exec(body)?.[1];
  return { title: String(fm.title), quote: q, cite };
});
const named = decisions.filter((d) => { const rr = /^(RR-\d+)/.exec(d.title)?.[1]; return rr && t.body.includes(rr); });
for (const d of named) if (d.quote) rules.push(`${d.title}: "${d.quote}" (${d.cite ?? 'cite in the decision'})`);

// The review context file (written from the task, its docs and its decisions; sha256 goes in the brief).
const ctxRel = `docs/reports/reviews/${taskId}/context-${date}.md`;
const docs = asList(t.fm.documentation);
const ctx = [
  `# Review context for ${taskId} (${label}) written ${date} by backlog-brief.mjs`, '',
  `## Task`, `${taskId} ${title}`, `status: ${t.fm.status} · milestone: ${t.fm.milestone ?? 'none'} · assignee: ${asList(t.fm.assignee).join(', ') || 'none'} · labels: ${asList(t.fm.labels).join(', ')}`, '',
  `## Description`, descriptionOf(t).trim() || '(none)', '',
  `## Acceptance criteria`, ...ac.map((c) => `- #${c.n} ${c.text}`), '',
  `## References`, ...(refs.length ? refs.map((r) => `- ${r}`) : ['- (none)']), '',
  `## Documents`, ...(docs.length ? docs.map((d) => `- ${d}`) : ['- (none)']), '',
  `## Decisions in force (titles; the ones this task names carry the operator's words)`,
  ...decisions.map((d) => `- ${d.title}${named.includes(d) && d.quote ? ` — "${d.quote}" (${d.cite})` : ''}`), '',
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
  `Review (plan or output): node scripts/deepseek-review.js plan --template <template> --specs ${ctxRel}`,
  `  Run by the tool-bearing Claude lane with provider claude: scripts/deepseek-review.js is not in exec-policy.json bash_allow, which governs only the DeepSeek execution engine (Spec 08 section 7 rule 10 (b), 08_agents.md:341). Context file ${ctxRel} sha256=${ctxSha}.`,
  `Close:`,
  `  backlog task edit ${taskId} --check-ac <n> (each criterion, with its evidence) --final-summary "<what landed, commit sha, hook result>" -s DONE|BUILT`,
  `  End the report with one line: STATUS: ready|blocked|failed|dropped`,
  `Standing rules: attach the lane standing rules file; no push, no DB, no --no-verify.`,
  '',
].join('\n');
process.stdout.write(out);
