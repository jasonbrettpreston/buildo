#!/usr/bin/env node
// G3 commit names its task (Backlog-home plan v8.1 section 3): a commit that changes CODE (src/, scripts/, mobile/, migrations/) must carry a
// `Task: task-N` trailer (or `Task: draft-N`) and that task or draft file must be in the same diff (a new file counts). Docs, spec, queue-row,
// backlog-only and merge commits are exempt; a no-op while backlog/tasks/ is absent. Known limit, accepted: it checks that a task is named,
// not that the right one is. Wired as one line in .husky/commit-msg; argv[2] is the commit message file, cwd is the repo.
// Rules: Spec 137 section 4 rule 3 (137_mcqueue.md:84), the same-commit half of the section 6 deferred check (:155); RR-0207, RR-0212.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const git = (a) => spawnSync('git', a, { encoding: 'utf8' });
const fail = (m) => { process.stderr.write(`check-backlog-task: ${m}\n`); return 1; };

function check(msgFile) {
  if (!msgFile) return fail('usage: check-backlog-task.mjs <commit-msg-file>');
  const top = git(['rev-parse', '--show-toplevel']).stdout.trim() || process.cwd();
  const mergeHead = git(['rev-parse', '--git-path', 'MERGE_HEAD']).stdout.trim();
  if (mergeHead && fs.existsSync(path.resolve(mergeHead))) return 0;
  if (!fs.existsSync(path.join(top, 'backlog/tasks'))) return 0;

  const staged = git(['diff', '--cached', '--name-only', '--no-renames']).stdout.split('\n').filter(Boolean);
  const code = staged.filter((f) => /^(src|scripts|mobile|migrations)\//.test(f));
  if (code.length === 0) return 0;

  const m = /^Task:\s*((?:task|draft)-\d+)\s*$/im.exec(fs.readFileSync(msgFile, 'utf8'));
  if (!m) return fail(`this commit changes code (${code.slice(0, 3).join(', ')}${code.length > 3 ? ', ...' : ''}) but its message has no trailer. Add a line "Task: task-N" naming the Backlog task (Spec 137 rule 3), and stage that task file in the same commit.`);
  const id = m[1].toLowerCase();
  const dir = id.startsWith('task') ? 'backlog/tasks/' : 'backlog/drafts/';
  if (!staged.some((f) => f.toLowerCase().startsWith(`${dir}${id} -`) || f.toLowerCase() === `${dir}${id}.md`)) {
    return fail(`${id} is named in the trailer but its file (${dir}${id} - ....md) is not in the same diff. Update the task (status, notes, final summary) and stage it in this commit (Spec 137 rule 3).`);
  }
  return 0;
}
process.exitCode = check(process.argv[2]);
