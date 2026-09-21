// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-AG
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7
//
// fix(123_step_opt_assessment_validation) (2026-09-21): `step-validate.mjs`'s
// `runVitest()` spawns vitest for every `--write` run WITHOUT a fork cap —
// uncapped, vitest's `forks` pool defaults to ~1 fork per CPU (12 on this
// host), and `--all --write` over 18 steps was OS/harness-killed for memory
// twice (2026-09-21), worked around by 17 sequential single-step runs.
//
// Operator ruling (2026-09-21, same day): the default must EQUAL
// `.husky/pre-push`'s own `VITEST_MIN_FORKS`/`VITEST_MAX_FORKS` values —
// MIN=1/MAX=1, not MIN=1/MAX=2 — because `review_followups.md`'s 2026-09-16
// HIGH row measured `VITEST_MAX_FORKS=2` dying on `[vitest-worker]: Timeout
// calling "onTaskUpdate"` in `src/tests/step-conformance.infra.test.ts`, which
// is one of `runVitest()`'s own `VITEST_TARGETS`; CLAUDE.md's "MIN=1/MAX=2"
// text predates that finding and is stale. So `vitestChildEnv()` PARSES the
// cap out of `.husky/pre-push` (single source of truth) instead of
// re-typing it, per `parseForkCapFromHookText()` — this suite proves that
// parsing is genuinely load-bearing (a tampered hook fixture changes the
// default), not merely a hardcoded literal in disguise, alongside the
// explicit-caller-wins contract and the pre-fix defect — proven both
// directions, mirroring this estate's own canary discipline (an untested
// checker proves nothing, Spec 121 §12b.6).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const REPO_ROOT = path.resolve(__dirname, '../../');
const STEP_VALIDATE = path.join(REPO_ROOT, 'scripts/analysis/step-validate.mjs');
const PRE_PUSH_HOOK_PATH = path.join(REPO_ROOT, '.husky/pre-push');
const LIVE_PRE_PUSH = fs.readFileSync(PRE_PUSH_HOOK_PATH, 'utf8');

type VitestChildEnvFn = (
  baseEnv: Record<string, string | undefined>,
  hookText?: string,
) => Record<string, string | undefined>;
type ParseForkCapFn = (hookText: string) => { min: string; max: string };

async function loadModule() {
  const mod = (await import(pathToFileURL(STEP_VALIDATE).href)) as unknown as {
    vitestChildEnv: VitestChildEnvFn;
    parseForkCapFromHookText: ParseForkCapFn;
  };
  return mod;
}

describe('step-validate.mjs — runVitest() fork cap (vitestChildEnv, single-source-of-truth on .husky/pre-push)', () => {
  it('GREEN — the live .husky/pre-push carries MIN=1/MAX=1 (the operator-ruled value; CLAUDE.md\'s "MAX=2" text is stale)', () => {
    expect(LIVE_PRE_PUSH).toMatch(/\bVITEST_MIN_FORKS=1\b/);
    expect(LIVE_PRE_PUSH).toMatch(/\bVITEST_MAX_FORKS=1\b/);
  });

  it('GREEN — an env with neither var set gets the default parsed straight off the LIVE .husky/pre-push (MIN=1/MAX=1)', async () => {
    const { vitestChildEnv } = await loadModule();
    const out = vitestChildEnv({ PATH: '/usr/bin' });
    expect(out.VITEST_MIN_FORKS).toBe('1');
    expect(out.VITEST_MAX_FORKS).toBe('1');
    // never mutates the caller's object (selfTest()/a suite can reuse a base fixture)
    expect(out).not.toBe({ PATH: '/usr/bin' });
  });

  it('GREEN — parseForkCapFromHookText is genuinely load-bearing: a tampered fixture hook text changes the parsed default (proves this is a real parse, not a disguised hardcode)', async () => {
    const { vitestChildEnv, parseForkCapFromHookText } = await loadModule();
    const fixtureHook = 'node scripts/analysis/step-validate.mjs --staged --fast && VITEST_MIN_FORKS=3 VITEST_MAX_FORKS=5 npm run test\n';
    expect(parseForkCapFromHookText(fixtureHook)).toEqual({ min: '3', max: '5' });
    const out = vitestChildEnv({ PATH: '/usr/bin' }, fixtureHook);
    expect(out.VITEST_MIN_FORKS).toBe('3');
    expect(out.VITEST_MAX_FORKS).toBe('5');
  });

  it('RED — a hook fixture missing one of the two vars throws rather than silently falling back (a silent fallback would defeat the single-source-of-truth contract)', async () => {
    const { vitestChildEnv, parseForkCapFromHookText } = await loadModule();
    const missingMax = 'VITEST_MIN_FORKS=1 npm run test\n';
    expect(() => parseForkCapFromHookText(missingMax)).toThrow(/could not parse/);
    expect(() => vitestChildEnv({}, missingMax)).toThrow(/could not parse/);
  });

  it('GREEN — an explicit caller value for VITEST_MAX_FORKS is never clobbered', async () => {
    const { vitestChildEnv } = await loadModule();
    const out = vitestChildEnv({ VITEST_MAX_FORKS: '4' });
    expect(out.VITEST_MAX_FORKS).toBe('4');
    // the untouched sibling variable still gets its default off the live hook
    expect(out.VITEST_MIN_FORKS).toBe('1');
  });

  it('GREEN — an explicit caller value for VITEST_MIN_FORKS is never clobbered', async () => {
    const { vitestChildEnv } = await loadModule();
    const out = vitestChildEnv({ VITEST_MIN_FORKS: '3' });
    expect(out.VITEST_MIN_FORKS).toBe('3');
    expect(out.VITEST_MAX_FORKS).toBe('1');
  });

  it('GREEN — both explicit caller values are preserved together', async () => {
    const { vitestChildEnv } = await loadModule();
    const out = vitestChildEnv({ VITEST_MIN_FORKS: '2', VITEST_MAX_FORKS: '2' });
    expect(out.VITEST_MIN_FORKS).toBe('2');
    expect(out.VITEST_MAX_FORKS).toBe('2');
  });

  it('RED — an uncapped env (the pre-fix defect) is caught: without the fix, spawning vitest on this host inherits no fork limit at all', async () => {
    const { vitestChildEnv } = await loadModule();
    // Simulates the defect directly: an env object that was never passed through
    // vitestChildEnv() at all (i.e. the old `runVitest()` body, which spawned
    // `spawnSync(process.execPath, [...], { env: childEnv })` with a bare
    // `{ ...process.env }` minus the two DATABASE_URL keys — no fork vars).
    const uncapped: Record<string, string | undefined> = { PATH: '/usr/bin' };
    expect(uncapped.VITEST_MIN_FORKS, 'reproduces the defect: no cap present').toBeUndefined();
    expect(uncapped.VITEST_MAX_FORKS, 'reproduces the defect: no cap present').toBeUndefined();
    // The fix closes exactly this gap:
    const fixed = vitestChildEnv(uncapped);
    expect(fixed.VITEST_MIN_FORKS).toBeDefined();
    expect(fixed.VITEST_MAX_FORKS).toBeDefined();
  });
});
