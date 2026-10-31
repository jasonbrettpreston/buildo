// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-AG (Automated Gate: the hooks must run); MB-67 incident
//            2026-10-31 (a test fixture wrote core.hooksPath into the REAL repo config and a push ran with no hooks).
//
// vitest globalSetup: the REAL repository's core.hooksPath must be `.husky` before AND after every run (teardown throws,
// which makes the whole run red). The value is READ from the shared config of the common git dir with
// `git config --file <common dir>/config --get`; nothing here ever writes. Unset is accepted only under CI=true.
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

const FIX = 'run `node scripts/hooks/install-hooks.mjs` in the main checkout (see scripts/hooks/install-hooks.mjs)';

/** `null` = fine; otherwise the sentence that makes the run red. */
export function hooksPathVerdict(value: string | null, isCi: boolean): string | null {
  if (value === '.husky') return null;
  if (value === null && isCi) return null;
  return `the REAL repository's core.hooksPath is ${value === null ? 'unset' : JSON.stringify(value)}, not ".husky": the commit and push hooks are not running. A test fixture probably leaked into the real config. Fix: ${FIX}.`;
}

/** The real repository's core.hooksPath (local scope of the common git dir), or null when unset. Never writes. */
export function readRealHooksPath(cwd: string): string | null {
  const env = {} as NodeJS.ProcessEnv;
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_') && v !== undefined) env[k] = v;
  const c = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8', env });
  if (c.status !== 0) throw new Error(`hooks-path guard: cannot find the git common dir from ${cwd}`);
  const r = spawnSync('git', ['config', '--file', path.join(path.resolve(cwd, c.stdout.trim()), 'config'), '--get', 'core.hooksPath'], { encoding: 'utf8', env });
  return r.status === 0 ? r.stdout.replace(/\n$/, '') : null;
}

function check(when: string): void {
  const verdict = hooksPathVerdict(readRealHooksPath(path.resolve(__dirname, '../..')), process.env.CI === 'true');
  if (verdict !== null) throw new Error(`HOOKS PATH DRIFT (${when} the run): ${verdict}`);
}

export default function setup(): () => void {
  check('before');
  return () => check('after');
}
