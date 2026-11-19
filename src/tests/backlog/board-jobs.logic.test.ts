// BL-R6 (task-305): the two board job scripts, run for real against temp repos (remote = a second temp repo). Plan v8.1 section 4.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, run, tmp } from './helpers';

const git = (cwd: string, ...a: string[]) => run('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { cwd });
const commitFile = (cwd: string, rel: string, text: string) => { fs.mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true }); fs.writeFileSync(path.join(cwd, rel), text); git(cwd, 'add', rel); git(cwd, 'commit', '-q', '-m', `add ${rel}`); };
const head = (cwd: string) => git(cwd, 'rev-parse', 'HEAD').stdout.trim();

function pair() {
  const remote = tmp('remote'), local = path.join(tmp('local'), 'board');
  git(remote, 'init', '-q', '-b', 'wf1/mb-rulings');
  commitFile(remote, 'backlog/tasks/task-1.md', 'one\n');
  git(remote, 'clone', '-q', remote, local);
  return { remote, local, status: path.join(tmp('status'), 'BOARD-STATUS-6421.txt') };
}
const job = (name: string, p: { local: string; status: string }) => run('zsh', ['-f', path.join(ROOT, 'scripts/board', name)], { env: { BOARD_ROOT: p.local, BOARD_STATUS_FILE: p.status } });

describe('board-commit.zsh', () => {
  it('commits nothing when backlog/ is unchanged, and one conforming commit when a backlog/ file changed', () => {
    const p = pair(), before = head(p.local);
    expect(job('board-commit.zsh', p).status).toBe(0);
    expect(head(p.local)).toBe(before);
    fs.writeFileSync(path.join(p.local, 'backlog/tasks/task-1.md'), 'one edited\n');
    expect(job('board-commit.zsh', p).status).toBe(0);
    expect(git(p.local, 'rev-list', '--count', `${before}..HEAD`).stdout.trim()).toBe('1');
    const msg = path.join(tmp('msg'), 'MSG'); fs.writeFileSync(msg, git(p.local, 'log', '-1', '--format=%B').stdout);
    expect(git(p.local, 'log', '-1', '--format=%s').stdout.trim()).toMatch(/^docs\(137_mcqueue\): board edits \d{4}-\d\d-\d\d \d\d:\d\d$/);
    expect(run('bash', [path.join(ROOT, 'scripts/hooks/validate-commit-msg.sh'), msg]).status).toBe(0);
  });
});

describe('board-ff.zsh', () => {
  it('fast-forwards to the remote tip and writes ff', () => {
    const p = pair();
    commitFile(p.remote, 'backlog/tasks/task-2.md', 'two\n');
    expect(job('board-ff.zsh', p).status).toBe(0);
    expect(head(p.local)).toBe(head(p.remote));
    expect(fs.readFileSync(p.status, 'utf8')).toMatch(/^6421: [0-9a-f]{7,} ff \d{4}-\d\d-\d\d/);
  });
  it('writes WARN and leaves HEAD unchanged when the local branch has its own commit', () => {
    const p = pair();
    commitFile(p.local, 'backlog/tasks/task-9.md', 'mine\n');
    commitFile(p.remote, 'backlog/tasks/task-2.md', 'two\n');
    const before = head(p.local);
    expect(job('board-ff.zsh', p).status).toBe(0);
    expect(head(p.local)).toBe(before);
    expect(fs.readFileSync(p.status, 'utf8')).toMatch(/^6421: [0-9a-f]{7,} WARN /);
  });
});
