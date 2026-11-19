#!/usr/bin/env node
// CHK.1 scope check, git mode (task-3; relevancy pass 2 R9; re-use ruling MORNING-DECISIONS.md:750-751, build-in-repo :744): a code commit may change only
// the files its task declares. The task is named by the same `Task: task-N` trailer G3 reads (scripts/hooks/check-backlog-task.mjs); the declaration is a
// line at the START of a line in the task file, read from the INDEX (the task file is in the same diff, G3):
//   Files: src/a.ts, scripts/hooks/, src/tests/backlog/*.test.ts, docs/**/x.md
// One line, comma-separated entries, the FIRST such line wins. An entry with no `*` or `?` is a path prefix on a directory boundary (a file, or a directory
// with or without a trailing slash). An entry with `*` or `?` is a glob: `*` = any chars within one path segment, `**` = any chars across segments
// (`a/**/b` also matches `a/b`), `?` = one non-slash char; `[` and every other character are literal. Own matcher: package.json has no glob library and
// node:path matchesGlob is experimental. A leading `./` is stripped; empty entries are skipped; no usable entry = no declaration.
// Always allowed: the task file, docs/reports/reviews/<task>/, docs/reports/lanes/. No Files: line = one WARN line and pass (recommended, not yet a card).
// Exempt (as G3): no backlog/tasks/, a merge commit, no CODE file (src|scripts|mobile|migrations) staged, no trailer (G3 refuses that), task file not in the diff.
// Renames are not detected, so both sides count. Wired as one line in .husky/commit-msg after the G3 line; argv[2] is the commit message file.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const git = (a) => spawnSync('git', ['-c', 'core.quotepath=false', ...a], { encoding: 'utf8' });

function globToRegex(g) {
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') {
      i++;
      if (g[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

function matcher(entry) {
  const e = entry.replace(/^\.\//, '');
  if (!/[*?]/.test(e)) { const p = e.replace(/\/+$/, ''); return (f) => f === p || f.startsWith(`${p}/`); }
  const rx = globToRegex(e);
  return (f) => rx.test(f);
}

function check(msgFile) {
  if (!msgFile) { process.stderr.write('check-task-files: usage: check-task-files.mjs <commit-msg-file>\n'); return 1; }
  const top = git(['rev-parse', '--show-toplevel']).stdout.trim() || process.cwd();
  const mergeHead = git(['rev-parse', '--git-path', 'MERGE_HEAD']).stdout.trim();
  if (mergeHead && fs.existsSync(path.resolve(mergeHead))) return 0;
  if (!fs.existsSync(path.join(top, 'backlog/tasks'))) return 0;

  const staged = git(['diff', '--cached', '--name-only', '--no-renames']).stdout.split('\n').filter(Boolean);
  if (!staged.some((f) => /^(src|scripts|mobile|migrations)\//.test(f))) return 0;

  const m = /^Task:\s*((?:task|draft)-\d+)\s*$/im.exec(fs.readFileSync(msgFile, 'utf8'));
  if (!m) return 0;
  const id = m[1].toLowerCase();
  const dir = id.startsWith('task') ? 'backlog/tasks/' : 'backlog/drafts/';
  const isTask = (f) => f.toLowerCase().startsWith(`${dir}${id} -`) || f.toLowerCase() === `${dir}${id}.md`;
  const taskFiles = staged.filter(isTask);
  if (taskFiles.length === 0) return 0;
  // review r2: a rename stages both names and a deletion has no index copy; read the index copy, else the HEAD copy
  let body = { status: 1, stdout: '' };
  for (const f of taskFiles) { body = git(['show', `:${f}`]); if (body.status === 0) break; }
  if (body.status !== 0) for (const f of taskFiles) { body = git(['show', `HEAD:${f}`]); if (body.status === 0) break; }
  if (body.status !== 0) return 0;

  const line = /^Files:[ \t]*(.*)$/m.exec(body.stdout);
  const entries = line ? line[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
  if (entries.length === 0) {
    process.stderr.write(`check-task-files: WARN ${id} has no "Files:" line, so its scope is not checked. Add one line "Files: path, dir/, glob" to the task description.\n`);
    return 0;
  }
  const allowed = entries.map(matcher);
  const always = (f) => isTask(f) || f.startsWith(`docs/reports/reviews/${id}/`) || f.startsWith('docs/reports/lanes/');
  const outside = staged.filter((f) => !always(f) && !allowed.some((ok) => ok(f)));
  for (const f of outside) process.stderr.write(`check-task-files: ${f} is outside the Files: line of ${id} (Files: ${entries.join(', ')}). Declare it on the task or move it to its own task.\n`);
  return outside.length ? 1 : 0;
}
process.exitCode = check(process.argv[2]);
