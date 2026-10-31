// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-AG (Automated Gate: the hooks must run); MB-67 incident
//            2026-10-31 (a test fixture wrote core.hooksPath into the REAL repo config and a push ran with no hooks).
//
// The backstop: the REAL repository's core.hooksPath must be `.husky` (read from the shared config of the common git dir,
// never from a temp repo). The same check runs again at the END of every vitest run (src/tests/hooks-path-guard.global.ts),
// so a full suite turns red the moment the setting drifts. CI (CI=true) has no local hook install, so unset is allowed there.
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hooksPathVerdict, readRealHooksPath } from './hooks-path-guard.global';

describe('hooks path backstop', () => {
  it('the verdict accepts only .husky (unset only under CI) and names the fix', () => {
    expect(hooksPathVerdict('.husky', false)).toBeNull();
    expect(hooksPathVerdict(null, true)).toBeNull();
    expect(hooksPathVerdict(null, false)).toMatch(/install-hooks/);
    expect(hooksPathVerdict('/var/folders/x/T/mcbylaws-nohooks-AbC', false)).toMatch(/install-hooks/);
    expect(hooksPathVerdict('/var/folders/x/T/mcbylaws-nohooks-AbC', true)).toMatch(/install-hooks/);
    expect(hooksPathVerdict('', false)).not.toBeNull();
  });

  it('the REAL repository config reads .husky (red the moment a test run leaks a hooks path into it)', () => {
    const got = readRealHooksPath(path.resolve(__dirname, '../..'));
    expect(hooksPathVerdict(got, process.env.CI === 'true')).toBeNull();
  });
});
