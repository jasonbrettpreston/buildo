#!/usr/bin/env node
// backlog-next: what to take next, read from the task files (Backlog-home plan v8.1 section 3, "Also kept").
// Backlog's own `task list --ready` excludes only the final status and tasks with a non-DONE dependency, and `task list --json` carries no
// dependencies (FLAGS.md findings 4 and 5), so this reads the files: LATER or WAITS, not a draft, every dependency DONE (a MERGED dependency
// counts when its `merged-into: task-N` target is DONE; FROZEN and everything else blocks), every `when: <ids> DONE` id DONE. Due and overdue
// tasks are listed in their own sections. Usage: node scripts/analysis/backlog-next.mjs [--root <dir>] [--today YYYY-MM-DD]
// Rules: Spec 137 section 4 rule 7 (137_mcqueue.md:98) and rule 12 (:115); RR-0205, RR-0212.
import path from 'node:path';
import { args, asList, descriptionOf, planLabels, readItems, REPO, today } from './backlog-lib.mjs';

const a = args();
const root = path.resolve(a.root || REPO);
const now = a.today && a.today !== true ? a.today : today();
const items = readItems(root, { drafts: true });
const byId = new Map(items.map((t) => [t.id, t]));
const byPlan = new Map(items.flatMap((t) => planLabels(t).map((p) => [p, t])));
const status = (t) => String(t.fm.status ?? '');
const mergedInto = (t) => /^merged-into:\s*(task-\d+)/im.exec(descriptionOf(t) || t.body)?.[1].toLowerCase();

/** DONE, or MERGED into a task that is (transitively) DONE. */
function isDone(t, hops = 0) {
  if (!t || hops > 10) return false;
  if (status(t) === 'DONE') return true;
  if (status(t) === 'MERGED') return isDone(byId.get(mergedInto(t) ?? ''), hops + 1);
  return false;
}
const ref = (token) => byId.get(token.toLowerCase()) ?? byPlan.get(token);
function whenIds(t) {
  const m = /^when:\s*(.*?)\s+DONE\s*$/im.exec(descriptionOf(t) || t.body);
  return m ? m[1].split(/[\s,]+/).filter((x) => x && x.toLowerCase() !== 'and') : [];
}
const ready = (t) => !t.draft && ['LATER', 'WAITS'].includes(status(t))
  && asList(t.fm.dependencies).every((d) => isDone(byId.get(d.toLowerCase())))
  && whenIds(t).every((w) => isDone(ref(w)));

const line = (t) => `  ${t.id}  ${String(t.fm.title)}  [${status(t)}${t.fm.due_date ? `, due ${t.fm.due_date}` : ''}]`;
const open = items.filter((t) => !t.draft && !['DONE', 'DROPPED', 'MERGED'].includes(status(t)));
const day = (s) => Date.parse(`${String(s).slice(0, 10)}T00:00:00Z`);
const overdue = open.filter((t) => t.fm.due_date && day(t.fm.due_date) < day(now));
const due = open.filter((t) => t.fm.due_date && day(t.fm.due_date) >= day(now) && day(t.fm.due_date) <= day(now) + 7 * 86400000);
const byDue = (x, y) => day(x.fm.due_date) - day(y.fm.due_date) || x.id.localeCompare(y.id, 'en', { numeric: true });
const rd = items.filter(ready);
const out = [`READY: ${rd.length}`, ...rd.map(line), `OVERDUE: ${overdue.length}`, ...overdue.sort(byDue).map(line), `DUE: ${due.length}`, ...due.sort(byDue).map(line)];
process.stdout.write(`${out.join('\n')}\n`);
