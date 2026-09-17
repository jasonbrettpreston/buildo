// 🔗 SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.2 (step ceilings + soft budgets)
// 🔗 SPEC LINK: docs/specs/01-pipeline/118_deep_scrapes_execution_envelope.md §3 (stop-mechanism layers)
// 🔗 SPEC LINK: docs/specs/01-pipeline/120_pipeline_step_runner.md §9.3 ①
//
// P3 (2026-08-24) — chain-sources envelope. Source locks on chain-sources.yml,
// the LAST chain workflow with a hardcoded ceiling and no budget wiring at all.
//
// THE MEASUREMENT (re-taken 2026-08-24, because the two inherited figures read
// as a contradiction and are not one — they measure different objects):
//
//   platform per-job maximum (GitHub-hosted)  360   fixed, not ours
//   job    timeout-minutes  (`:20`)           210   → 330
//   step   timeout-minutes  (`:72`)           180   → 300
//   CHAIN_TIME_BUDGET_MINUTES                 unset → 290   (run-chain self-stop; :468 reads 0 = INERT)
//   CHAIN_DURATION_BUDGET_MINUTES             unset → 300   (verdict tripwire; INERT)
//   manifest step_timeout_minutes             1 of 27 steps (refresh_snapshot: 15) — UNCHANGED
//
//   "180 of 360 used"        = step ceiling vs platform max.
//   "150 minutes of headroom" = 360 − 210, i.e. platform max vs the JOB ceiling.
//   Both are true. Neither is actionable alone: the step can never exceed the
//   job, so buying room for the chain means raising BOTH numbers.
//
// THE ARITHMETIC:
//   job 330  = 360 platform max − 30 reserved (never run to the platform wall)
//   step 300 = 330 job − 30 measured overhead (checkout + setup-node + npm ci +
//              migrate --verify + guards + verdict; today's 210 − 180 = 30, preserved)
//   budget 290 = ceiling − 10, the convention already shipped on both siblings
//   tripwire 300 = ceiling; check-chain-verdict warns past 80% → 240 min
//
//   Observed high-water mark for a run that finished: 181.9 min (2026-07-07,
//   `docs/reports/2026-08-22-sources-chain-evidence-base.md` §5b, 11 cloud runs;
//   the other completions are 97.4–147.0). 290 clears 181.9 by 108.1 min;
//   the tripwire fires 58.1 min above the worst observed run, so it warns on an
//   anomaly rather than on a normal Sunday.
//
// NOT raised: per-step `step_timeout_minutes` in scripts/manifest.json. The only
// per-step duration source is `pipeline_runs`, and the evidence base establishes
// those statistics are poisoned by the 39-day strand (link_parcels read 2,447 min
// against a 0.3-min median). A per-step axe set from poisoned data kills healthy
// steps. That waits on a clean post-P2 run.
//
// Model: chain-coa-permits-workflow.infra.test.ts (same single-source P1 pattern).
// Run: npx vitest run src/tests/chain-sources-workflow.infra.test.ts

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// ⚠️ CRLF normalization is load-bearing on a Windows checkout (core.autocrlf=true,
// no .gitattributes yet — P0b item 2). JS `.` and `$` do not match past a `\r`, so a
// `/m`-anchored regex over a CRLF file silently never matches and every lock in this
// file would pass vacuously. Found the hard way writing the sibling suite.
const yaml = readFileSync(join(process.cwd(), '.github/workflows/chain-sources.yml'), 'utf8').replace(/\r\n/g, '\n');
/** Lines that are actual YAML, not commentary — a comment must never satisfy an assertion. */
const activeLines = yaml
  .split('\n')
  .filter((line) => !line.trim().startsWith('#'))
  .join('\n');

describe('chain-sources.yml — ceilings raised into measured headroom', () => {
  it('the chain step reads a single-source job-env var (no second hardcode — Pipeline Rehab P1)', () => {
    expect(activeLines).toMatch(/SOURCES_STEP_TIMEOUT_MINUTES:\s*'300'/);
    expect(activeLines).toMatch(/timeout-minutes:\s*\$\{\{\s*fromJSON\(env\.SOURCES_STEP_TIMEOUT_MINUTES\)\s*\}\}/);
  });

  it('job timeout = 330 (360 platform max − 30 reserved), was 210', () => {
    expect(activeLines).toMatch(/^\s*timeout-minutes:\s*330\b/m);
    expect(activeLines).not.toMatch(/^\s*timeout-minutes:\s*210\b/m);
  });

  it('the old hardcoded 180-minute step ceiling is gone', () => {
    expect(activeLines).not.toMatch(/timeout-minutes:\s*180\b/);
  });

  it('job ceiling stays under the 360-minute platform maximum with a reserve', () => {
    const job = Number(activeLines.match(/^\s*timeout-minutes:\s*(\d+)\b/m)?.[1]);
    expect(job).toBeGreaterThan(0);
    expect(job).toBeLessThanOrEqual(330);
    expect(360 - job).toBeGreaterThanOrEqual(30);
  });

  it('step ceiling leaves the measured 30-minute job overhead intact', () => {
    const job = Number(activeLines.match(/^\s*timeout-minutes:\s*(\d+)\b/m)?.[1]);
    const step = Number(activeLines.match(/SOURCES_STEP_TIMEOUT_MINUTES:\s*'(\d+)'/)?.[1]);
    expect(job - step).toBeGreaterThanOrEqual(30);
  });
});

describe('chain-sources.yml — the budget env vars are no longer inert (Spec 120 §9.3 ①)', () => {
  it('the chain step computes and exports CHAIN_TIME_BUDGET_MINUTES from its own ceiling', () => {
    // Headroom without a self-stop just moves the wall. The budget is what turns
    // a hard kill into a clean stop with a recorded reason on every remaining step.
    expect(activeLines).toMatch(/fromJSON\(env\.SOURCES_STEP_TIMEOUT_MINUTES\)\s*\}\}\s*-\s*10/);
    expect(activeLines).toMatch(/export CHAIN_TIME_BUDGET_MINUTES/);
  });

  it('the budget is clamped at 0 (the deep-scrapes precedent — a negative budget must read as disabled)', () => {
    expect(activeLines).toMatch(/-lt 0/);
  });

  it('the verdict step feeds CHAIN_DURATION_BUDGET_MINUTES from the SAME ceiling (the 80% tripwire)', () => {
    // This is the warning the 2026-08-03 run never got before it died at 180.
    expect(activeLines).toMatch(/CHAIN_DURATION_BUDGET_MINUTES:\s*\$\{\{\s*env\.SOURCES_STEP_TIMEOUT_MINUTES\s*\}\}/);
  });
});

describe('chain-sources.yml — regression locks on what the ceiling change must NOT disturb', () => {
  it('the concurrency group is still derived from the workflow name and never cancels in flight', () => {
    expect(activeLines).toMatch(/group:\s*\$\{\{\s*github\.workflow\s*\}\}/);
    expect(activeLines).toMatch(/cancel-in-progress:\s*false/);
  });

  it('the verdict check still runs on always() — an exit-0 verdict FAIL must not show green', () => {
    expect(activeLines).toMatch(/check-chain-verdict\.js sources/);
    expect(activeLines).toMatch(/if:\s*always\(\)\s*&&\s*steps\.sources_guard\.outputs\.skip\s*!=\s*'true'/);
  });

  it('the env guard, migrate --verify pre-flight and data/ mkdir survive', () => {
    expect(activeLines).toMatch(/migrate\.js --verify/);
    expect(activeLines).toMatch(/mkdir -p data/);
    expect(activeLines).toMatch(/SUPABASE_CA_CERT_PATH/);
  });
});

// ---------------------------------------------------------------------------
// Spec 124 §5 R-AL (batch-2 Phase 0.8, 2026-09-15) — A CLOUD ACCEPTANCE
// DISPATCH IS PINNED AND ITS GRADED COMMIT IS NEVER INFERRED.
//
// RED BEFORE THE FIX (measured 2026-09-15, `.cursor/batch2_c5_active_task.md`
// §0.9 row 1): chain-sources.yml carried a bare `actions/checkout@v4` with no
// `ref:`, no `expected_sha` input and no headSha assertion anywhere — the whole
// file matched /headSha|expected_sha/ zero times. Runs 34964116903 and
// 34916671708 both graded `headSha 17058af7` while the local HEAD was
// `824ef357`, and EP-D13's "assert gh run view <id> --json headSha equals git
// rev-parse HEAD" existed only as prose in tasks/lessons.md. Each of the four
// assertions below fails against that pre-fix file.
//
// The inverse direction is enforced by the guard itself, not by a mock: the
// unpinned path must NOT fail the job (the scheduled cron carries no input), so
// the test below pins that the failure arms are both conditional on a non-empty
// expected_sha / a real drift, and that the unpinned case still emits a notice.
// ---------------------------------------------------------------------------
describe('chain-sources.yml — R-AL: the dispatch-pinning guard', () => {
  it('workflow_dispatch declares an `expected_sha` input (the dispatcher names the commit; the workflow cannot see a local HEAD)', () => {
    expect(activeLines).toMatch(/workflow_dispatch:/);
    expect(activeLines).toMatch(/expected_sha:/);
    expect(activeLines).toMatch(/required:\s*false/);
  });

  it('a guard step asserts the checked-out tree IS github.sha and fails loudly on drift', () => {
    expect(activeLines).toMatch(/Guard\s+—\s+dispatch is pinned \(R-AL/);
    expect(activeLines).toMatch(/CHECKED_OUT="\$\(git rev-parse HEAD\)"/);
    expect(activeLines).toMatch(/::error::checkout drift/);
  });

  it('a declared expected_sha that does not match the graded commit fails the job BEFORE the chain runs', () => {
    expect(activeLines).toMatch(/::error::pinned dispatch mismatch/);
    const guardIdx = activeLines.indexOf('Guard — dispatch is pinned');
    const chainIdx = activeLines.indexOf('node scripts/run-chain.js sources');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(chainIdx).toBeGreaterThan(-1);
    expect(guardIdx, 'the pin guard must run before the chain, never after it has written rows').toBeLessThan(chainIdx);
  });

  it('the selection announcement runs AFTER the pin guard — a drifted dispatch must die before it advertises anything', () => {
    const guardIdx = activeLines.indexOf('Guard — dispatch is pinned');
    const announceIdx = activeLines.indexOf('Announce step selection');
    const chainIdx = activeLines.indexOf('node scripts/run-chain.js sources');
    expect(announceIdx).toBeGreaterThan(guardIdx);
    expect(announceIdx).toBeLessThan(chainIdx);
  });

  it('the unpinned path is never silent — the graded commit is always echoed, and an unpinned run is warned as NOT an R-AB acceptance run', () => {
    expect(activeLines).toMatch(/::notice title=Graded commit::/);
    expect(activeLines).toMatch(/::warning title=Unpinned dispatch::/);
    expect(activeLines).toMatch(/NOT valid as an R-AB acceptance run/);
    // The unpinned arm must not be a failure arm: `exit 1` appears only under
    // the two genuine mismatch branches, never under the empty-input branch.
    expect(activeLines).toMatch(/if \[ -z "\$EXPECTED_SHA" \]; then\s*\n\s*echo "::warning/);
  });
});

// ---------------------------------------------------------------------------
// WF2 partial chain runs (2026-09-17) — THE CHAIN NO LONGER FITS IN ONE JOB.
//
// Measured: run 35140032614 (`headSha df61d453`, created 2026-09-16T19:21:08Z) reached step
// 14 of 28 — `enrich_centreline`, 59.6 min — and was killed by
// `##[error]The action 'Run sources chain' has timed out after 300 minutes.` at
// 2026-09-17T01:01:55Z, with `enrich_parcels` (position 22, ~87 min) never started. Cloud
// `pipeline_runs` rows 4996 (chain) + 4997-5010 (positions 1-14) confirm it, and two earlier
// runs died the same way. Raising the ceiling is not available: 300 is already
// 330 job − 30 measured overhead, and 330 is the platform's 360 − 30 reserve.
//
// So the tail becomes its own dispatch. These locks pin the SHAPE that makes that honest:
// the inputs exist, they reach the runner as argv VALUES (never as a GH expression
// interpolated into a shell), the selection is announced before anything runs, and the
// scheduled path is byte-identical to today's (both inputs empty ⇒ no flag at all).
// ---------------------------------------------------------------------------
describe('chain-sources.yml — WF2 partial chain runs (`from` / `only`)', () => {
  it('workflow_dispatch declares BOTH selection inputs, neither required (the cron path passes neither)', () => {
    expect(activeLines).toMatch(/^\s{6}from:$/m);
    expect(activeLines).toMatch(/^\s{6}only:$/m);
    // Three inputs now, and all three optional — a required input would break the schedule.
    const required = activeLines.match(/required:\s*(\w+)/g) || [];
    expect(required, 'expected_sha + from + only').toHaveLength(3);
    expect(required.every((r) => /false/.test(r)), 'no selection input may be required').toBe(true);
  });

  it('the inputs reach the runner through the JOB env, so the chain step keeps its *pipeline-env alias', () => {
    expect(activeLines).toMatch(/SELECT_FROM:\s*\$\{\{\s*inputs\.from\s*\}\}/);
    expect(activeLines).toMatch(/SELECT_ONLY:\s*\$\{\{\s*inputs\.only\s*\}\}/);
    expect(activeLines, 'the chain step must still use the shared env alias').toMatch(/node scripts\/run-chain\.js sources[\s\S]{0,40}env: \*pipeline-env/);
  });

  it('a dispatch input is only ever an argv VALUE — never a ${{ }} expression interpolated into the run shell', () => {
    const runShellUsesExpression = /node scripts\/run-chain\.js sources[^\n]*\$\{\{/.test(activeLines);
    expect(runShellUsesExpression, 'interpolating inputs.* directly into the command line is the script-injection shape').toBe(false);
    expect(activeLines).toMatch(/SELECT_ARGS=\("--from=\$SELECT_FROM"\)/);
    expect(activeLines).toMatch(/SELECT_ARGS=\("--only=\$SELECT_ONLY"\)/);
  });

  // WF2, Integration OUTPUT seat 2026-09-17 — THE QUOTING IS THE CONTRACT.
  // The first cut used an unquoted scalar (`SELECT_ARGS="--only=$SELECT_ONLY"` …
  // `node scripts/run-chain.js sources $SELECT_ARGS`). Measured: `-f only="a, b"` — a list
  // typed with the space a human naturally puts after a comma — word-split into
  // `['--only=a,', 'b']`, `resolveStepSelection` dropped the empty token, found one valid
  // slug, threw nothing, and ran HALF the requested set, while the announce banner still
  // claimed both. `resolveStepSelection`'s own `.trim()` tolerance was unreachable from this
  // path, so the unit test that green-locks it proved nothing about the real dispatch.
  // Pinned in BOTH directions: the array form must be present AND the scalar form absent.
  it('the argv is a QUOTED bash array — an input containing a space must not word-split into a silently shorter selection', () => {
    expect(activeLines).toMatch(/SELECT_ARGS=\(\)/);
    expect(activeLines).toMatch(/node scripts\/run-chain\.js sources "\$\{SELECT_ARGS\[@\]\}"/);
    expect(
      activeLines,
      'the unquoted scalar expansion is the defect — it must never come back',
    ).not.toMatch(/node scripts\/run-chain\.js sources \$SELECT_ARGS\b/);
    expect(activeLines, 'and neither may the scalar assignment it came from').not.toMatch(/SELECT_ARGS="--/);
  });

  it('the SCHEDULED path is unchanged — with both inputs empty, SELECT_ARGS is empty and the runner sees no flag', () => {
    // Both assignments are guarded by `-n` tests; nothing else writes SELECT_ARGS.
    // An empty array expands to ZERO words under `"${arr[@]}"`, so the runner sees bare
    // `sources` exactly as it does today on the cron path.
    expect(activeLines).toMatch(/SELECT_ARGS=\(\)/);
    expect(activeLines).toMatch(/if \[ -n "\$SELECT_FROM" \]; then SELECT_ARGS=/);
    expect(activeLines).toMatch(/if \[ -n "\$SELECT_ONLY" \]; then SELECT_ARGS=/);
  });

  it('the selection is ANNOUNCED — job summary + a notice — so a partial run can never be read as a full one', () => {
    expect(activeLines).toMatch(/name: Announce step selection \(partial vs full\)/);
    expect(activeLines).toMatch(/::notice title=Step selection::/);
    expect(activeLines).toMatch(/GITHUB_STEP_SUMMARY/);
    expect(activeLines).toMatch(/PARTIAL — from=/);
    expect(activeLines).toMatch(/FULL — every step of the sources chain/);
  });

  it('`from` + `only` together are REFUSED at the workflow too, not intersected (defence in depth with run-chain.js)', () => {
    expect(activeLines).toMatch(/mutually exclusive[\s\S]{0,140}REFUSES the combination/);
    expect(activeLines).toMatch(/if \[ -n "\$SELECT_FROM" \] && \[ -n "\$SELECT_ONLY" \]; then/);
  });

  it('the ceilings, the budget wiring and the pin guard are all untouched by the selection change', () => {
    expect(activeLines).toMatch(/SOURCES_STEP_TIMEOUT_MINUTES:\s*'300'/);
    expect(activeLines).toMatch(/export CHAIN_TIME_BUDGET_MINUTES/);
    expect(activeLines).toMatch(/::error::pinned dispatch mismatch/);
    expect(activeLines).toMatch(/check-chain-verdict\.js sources/);
  });
});
