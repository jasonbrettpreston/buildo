// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-321 (each round pre-registers the rows it expects to move, BEFORE the fix)
// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §3 (the stored permission image the Layer 2 rounds move)
// Handbook: 2026-10-25-batch-g#CHAT-152.L2-USE-SCOPE; 2026-10-26-batch-m#CHAT-178..181; 2026-10-26-batch-n#CHAT-182; 2026-10-26-batch-o#CHAT-184
//
// PLAN-scope v6 F2-r: the Layer 2 half of a round's M-321 pre-registration is two-sided only if prereg-<r>.json cannot be rewritten
// after its (a) commit. For every round of layer2-rounds/order.json whose actual-<r>.json is committed:
//   - git log of prereg-<r>.json has exactly ONE commit (the (a) commit);
//   - that commit is a STRICT ancestor of the commit that adds actual-<r>.json (the (b) commit);
//   - its parent is the prereg's own base_commit.
// The named-failure twins run the same check on a throw-away repository: a (b) commit that edits the prereg, and a prereg and actual
// added in one commit.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '../..');
const LR = 'scripts/analysis/bylaw-validation/layer2-rounds';
// Every git call runs with the GIT_* variables removed: inside a hook git exports GIT_DIR / GIT_INDEX_FILE, and a git -C <tmp> call would
// then write into the CALLING repository (observed 2026-10-26 during this lane's C2a commit: the twin's commits and identity landed on the
// lane branch and in the shared config; repaired). -C <dir> alone must decide the repository.
const cleanEnv = (): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))) as NodeJS.ProcessEnv;
const git = (root: string, args: string[]): string => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env: cleanEnv() }).trim();
const lines = (s: string): string[] => s.split('\n').filter(Boolean);

/** The F2-r check over one repository: [] when every committed actual has an immutable, strictly earlier prereg. */
export function preregViolations(root: string): string[] {
  const orderFile = path.join(root, LR, 'order.json');
  if (!fs.existsSync(orderFile)) return ['order_missing'];
  const order = (JSON.parse(fs.readFileSync(orderFile, 'utf8')) as { order: string[] }).order;
  const v: string[] = [];
  for (const r of order) {
    const pre = `${LR}/prereg-${r}.json`;
    const act = `${LR}/actual-${r}.json`;
    const added = lines(git(root, ['log', '--diff-filter=A', '--format=%H', '--', act]));
    if (!added.length) continue; // the round's (b) has not landed
    const b = added[added.length - 1] as string;
    if (!fs.existsSync(path.join(root, pre))) { v.push(`prereg_missing:${r}`); continue; }
    const touched = lines(git(root, ['log', '--format=%H', '--', pre]));
    if (touched.length !== 1) { v.push(`prereg_edited_after_a:${r}`); continue; }
    const a = touched[0] as string;
    let ancestor = false;
    try { git(root, ['merge-base', '--is-ancestor', a, b]); ancestor = a !== b; } catch { ancestor = false; }
    if (!ancestor) { v.push(`prereg_not_before_actual:${r}`); continue; }
    const base = String((JSON.parse(fs.readFileSync(path.join(root, pre), 'utf8')) as { base_commit?: string }).base_commit || '');
    const parent = git(root, ['rev-parse', `${a}^`]);
    if (!base || !parent.startsWith(base)) v.push(`prereg_base_commit_mismatch:${r}`);
  }
  return v;
}

/** A throw-away repository with one round: (a) adds the prereg, (b) adds the actual; `mutate` alters (b). */
function twinRepo(mutate: 'honest' | 'edit_prereg_in_b' | 'same_commit'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f2r-'));
  const g = (...a: string[]): string => git(dir, a);
  execFileSync('git', ['init', '-q', dir], { env: cleanEnv() });
  if (!fs.existsSync(path.join(dir, '.git'))) throw new Error(`twin repository was not created in ${dir}`); // never touch another repository
  g('config', 'user.email', 'f2r@example.invalid'); g('config', 'user.name', 'f2r'); // local to the throw-away repository
  fs.mkdirSync(path.join(dir, LR), { recursive: true });
  fs.writeFileSync(path.join(dir, LR, 'order.json'), JSON.stringify({ order: ['x'] }));
  fs.writeFileSync(path.join(dir, 'seed.txt'), 'seed');
  g('add', '-A'); g('commit', '-q', '--no-verify', '-m', 'seed');
  const base = g('rev-parse', '--short=8', 'HEAD');
  fs.writeFileSync(path.join(dir, LR, 'prereg-x.json'), JSON.stringify({ base_commit: base, cells: { to: 1 } }));
  if (mutate === 'same_commit') fs.writeFileSync(path.join(dir, LR, 'actual-x.json'), JSON.stringify({ cells: 1 }));
  g('add', '-A'); g('commit', '-q', '--no-verify', '-m', 'a');
  if (mutate !== 'same_commit') {
    if (mutate === 'edit_prereg_in_b') fs.writeFileSync(path.join(dir, LR, 'prereg-x.json'), JSON.stringify({ base_commit: base, cells: { to: 2 } }));
    fs.writeFileSync(path.join(dir, LR, 'actual-x.json'), JSON.stringify({ cells: 2 }));
    g('add', '-A'); g('commit', '-q', '--no-verify', '-m', 'b');
  }
  return dir;
}

describe('F2-r: a Layer 2 round pre-registration is immutable after its (a) commit (M-321; PLAN-scope v6)', () => {
  it('every committed actual-<r>.json has exactly one earlier prereg commit, whose parent is its base_commit', () => {
    expect(preregViolations(ROOT)).toEqual([]);
  });
  it('twin: an honest (a) then (b) passes', () => {
    expect(preregViolations(twinRepo('honest'))).toEqual([]);
  });
  it('twin: a (b) commit that edits the prereg fails by name', () => {
    expect(preregViolations(twinRepo('edit_prereg_in_b'))).toEqual(['prereg_edited_after_a:x']);
  });
  it('twin: a prereg and its actual added in one commit fail by name', () => {
    expect(preregViolations(twinRepo('same_commit'))).toEqual(['prereg_not_before_actual:x']);
  });
});
