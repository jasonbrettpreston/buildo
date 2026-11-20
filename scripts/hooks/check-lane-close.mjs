#!/usr/bin/env node
// COMPLY.2 close check (task-366; Spec 08 section 7 rule 4 and section 5.3, 08_agents.md: "every DeepSeek finding is adjudicated by a tool-having grounder"; REJECTED with reasons;
// operator 2026-11-20, see scripts/analysis/rule-lists.json $comment). A commit that carries `Task: task-N` and moves that task file (in the INDEX) to BUILT or DONE, for a task held
// by an `@lane-<name>` assignee, is refused unless docs/reports/lanes/<any date>/<name>/ (read from the index, so the lane's last commit may carry it) holds:
//   (a) per attached list (scripts/analysis/rule-lists.json resolved from the task's Files line, the same function the launch used) one compliance lens output:
//       out-compliance-<list id>.txt (a build or fix task) or plan-compliance-<list id>.txt / out-compliance-<list id>.txt (any other type), either ONE file or parts
//       -p1..-pK with no gap (never both), each carrying a `VERDICT:` line (a failed run has none);
//   (b) GROUNDER.md, needed for a build or fix task always and for any other task only when a lens output (plan-*.txt or out-*.txt, any lens) holds a finding. Its header names
//       `Grounder: <name>` and `Lane: <name>`, the two differ and neither is the task's lane, and it carries one verdict line per finding id:
//       `<finding id> CONFIRMED <file:line>` or `<finding id> REJECTED <file:line> <reason>`. A finding is a BUG or DEFER line of a lens output; its id is
//       <file stem>#<1-based ordinal among those lines of that file> (`node scripts/analysis/rule-lists.mjs findings --dir <dir>` prints them).
// Presence and form only, never judgement. Exempt: a merge commit, no backlog/tasks/, no trailer, the task file not in the diff, a status that is not moving to BUILT or DONE, no @lane-*
// assignee (an operator or orchestrator edit). A task with no Files line (not a record-only type) or a Files path no row matches is refused here as at launch.
// Known limits (stated, not hidden): a lane that deletes the highest -pN output is not detected; a re-run lens needs fresh verdicts (a missing id is refused). No date is computed:
// every docs/reports/lanes/*/<lane>/ in the index counts. Wired as one line in .husky/commit-msg after check-task-files; argv[2] is the commit message file.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { asList, parseFM } from '../analysis/backlog-lib.mjs';
import { findingsIn, milestoneLetter, readTable, resolveTask } from '../analysis/rule-lists.mjs';

const git = (a) => spawnSync('git', ['-c', 'core.quotepath=false', ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const fail = (lines) => { for (const l of lines) process.stderr.write(`check-lane-close: ${l}\n`); return 1; };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (s) => String(s).toLowerCase().replace(/^@?lane-/, '').replace(/^bl-/, '').trim();

function check(msgFile) {
  if (!msgFile) return fail(['usage: check-lane-close.mjs <commit-msg-file>']);
  const top = git(['rev-parse', '--show-toplevel']).stdout.trim() || process.cwd();
  const mergeHead = git(['rev-parse', '--git-path', 'MERGE_HEAD']).stdout.trim();
  if (mergeHead && fs.existsSync(path.resolve(mergeHead))) return 0;
  if (!fs.existsSync(path.join(top, 'backlog/tasks'))) return 0;
  const m = /^Task:\s*(task-\d+)\s*$/im.exec(fs.readFileSync(msgFile, 'utf8'));
  if (!m) return 0;
  const id = m[1].toLowerCase();
  const staged = git(['diff', '--cached', '--name-only', '--no-renames']).stdout.split('\n').filter(Boolean);
  const taskFile = staged.find((f) => f.toLowerCase().startsWith(`backlog/tasks/${id} -`) || f.toLowerCase() === `backlog/tasks/${id}.md`);
  if (!taskFile) return 0;
  const now = git(['show', `:${taskFile}`]);
  if (now.status !== 0) return 0;
  const { fm } = parseFM(now.stdout);
  const status = String(fm.status ?? '').toUpperCase();
  if (status !== 'BUILT' && status !== 'DONE') return 0;
  const was = git(['show', `HEAD:${taskFile}`]);
  if (was.status === 0 && String(parseFM(was.stdout).fm.status ?? '').toUpperCase() === status) return 0;
  const laneName = asList(fm.assignee).map((a) => /^@lane-(.+)$/.exec(a)?.[1]).find(Boolean);
  if (!laneName) return 0;
  const tableFile = path.join(top, 'scripts/analysis/rule-lists.json');
  if (!fs.existsSync(tableFile)) return 0;

  const type = String(fm.type ?? '').toLowerCase();
  const build = type === 'build' || type === 'fix';
  let r;
  try { r = resolveTask({ table: readTable(tableFile), root: top, body: now.stdout, type, letter: milestoneLetter(top, fm.milestone) }); } catch (e) { return fail([`${id}: cannot read the rule-list table or one of its path maps: ${String(e.message).split('\n')[0]}`]); }
  if (r.error) return fail([`${id}: ${r.error.replace(/^refused: /, '')}`]);

  const dirNote = `docs/reports/lanes/<date>/${laneName}/`;
  const files = git(['ls-files', '--cached', '-z', '--', 'docs/reports/lanes']).stdout.split('\0').filter(Boolean)
    .filter((f) => { const p = f.split('/'); return p.length === 6 && p[4] === laneName; })
    .map((f) => ({ name: path.basename(f), text: git(['show', `:${f}`]).stdout }));
  const textOf = (n) => files.find((f) => f.name === n)?.text;
  const errors = [];

  for (const l of r.lists) {
    const phases = build ? ['out'] : ['plan', 'out'];
    const why = [];
    let ok = false;
    for (const ph of phases) {
      const base = `${ph}-compliance-${l.id}`;
      const single = textOf(`${base}.txt`);
      const parts = files.map((f) => new RegExp(`^${esc(base)}-p(\\d+)\\.txt$`).exec(f.name)).filter(Boolean).map((x) => Number(x[1])).sort((a, b) => a - b);
      if (single !== undefined && parts.length) { why.push(`${base}.txt and ${base}-pN.txt both exist (one file, or -p1..-pK)`); continue; }
      const names = single !== undefined ? [`${base}.txt`] : parts.map((n) => `${base}-p${n}.txt`);
      if (names.length === 0) continue;
      const gap = parts.findIndex((n, i) => n !== i + 1);
      if (gap !== -1) { why.push(`${base}: parts ${parts.join(',')} have a gap, ${base}-p${gap + 1}.txt is missing`); continue; }
      const noVerdict = names.filter((n) => !/^VERDICT:/m.test(textOf(n) ?? ''));
      if (noVerdict.length) { why.push(`${noVerdict.join(', ')} has no VERDICT line (a failed run is not a lens output)`); continue; }
      ok = true;
    }
    if (!ok) errors.push(`${id}: list ${l.id} (${l.file}) has no compliance lens output in ${dirNote}: write ${phases.join(' or ')}-compliance-${l.id}.txt${why.length ? ` (${why.join('; ')})` : ''}`);
  }

  const findings = findingsIn(files);
  if (build || findings.length > 0) {
    const g = textOf('GROUNDER.md');
    if (g === undefined) errors.push(`${id}: GROUNDER.md is missing in ${dirNote}${build ? ' (a build or fix task always needs a separate grounder verdict)' : ` (a lens returned ${findings.length} finding(s))`}`);
    else {
      const head = g.split('\n').slice(0, 25).join('\n');
      const gr = /^\s*Grounder:\s*(.+?)\s*$/m.exec(head)?.[1];
      const lh = /^\s*Lane:\s*(.+?)\s*$/m.exec(head)?.[1];
      if (!gr) errors.push('GROUNDER.md has no "Grounder: <name>" header line');
      if (!lh) errors.push('GROUNDER.md has no "Lane: <name>" header line');
      if (gr && lh && norm(gr) === norm(lh)) errors.push(`GROUNDER.md: Grounder "${gr}" is the same as Lane "${lh}"; a separate agent must ground`);
      if (gr && norm(gr) === norm(laneName)) errors.push(`GROUNDER.md: Grounder "${gr}" is the lane (${laneName}); a separate agent must ground`);
      const verdicts = new Map();
      for (const raw of g.split('\n')) {
        const v = /^\s*[-*]?\s*(\S+)\s+(CONFIRMED|REJECTED)\s+(\S+:\d+\S*)\s*(.*)$/.exec(raw.replace(/[`*]/g, ''));
        if (v) verdicts.set(v[1], { word: v[2], reason: v[4].trim() });
      }
      for (const f of findings) {
        const v = verdicts.get(f.id);
        if (!v) errors.push(`GROUNDER.md: finding ${f.id} has no verdict line (form: "<id> CONFIRMED|REJECTED <file:line> [reason]"): ${f.line.slice(0, 90)}`);
        else if (v.word === 'REJECTED' && !v.reason) errors.push(`GROUNDER.md: finding ${f.id} is REJECTED with no reason after the file:line (Spec 08 5.3: rejections carry reasons)`);
      }
    }
  }
  return errors.length ? fail(errors) : 0;
}
process.exitCode = check(process.argv[2]);
