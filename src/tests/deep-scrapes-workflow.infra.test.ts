/**
 * chain-deep-scrapes workflow wiring — the parts that fail SILENTLY if they drift.
 *
 * SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.4
 * SPEC LINK: docs/specs/01-pipeline/44_chain_deep_scrapes.md §3
 * PLAN: .cursor/wf2_deep_scrapes_restore.md (C2, C9, rung L3)
 *
 * Every assertion here pins something that cost a real diagnostic cycle to find and
 * whose regression would be invisible until a scheduled run produced zero rows:
 *   · headed Chrome needs $DISPLAY, and the wrapper must cover the NODE parent so
 *     the variable inherits down to the python child and then to Chrome
 *   · a restored profile cache carries Singleton locks that brick Chrome forever
 *   · the schedule must stay off until the cloud retry/WAF constants are measured
 *   · run-chain.js exits 0 on a scrape-level failure BY DESIGN, so the job needs a
 *     separate verdict read or a totally failed scrape reports green
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const WORKFLOW = join(process.cwd(), '.github/workflows/chain-deep-scrapes.yml');
const yaml = readFileSync(WORKFLOW, 'utf8');

/** Lines that are actual YAML, not commentary — comments must never satisfy an assertion. */
const activeLines = yaml
  .split('\n')
  .filter((line) => !line.trim().startsWith('#'))
  .join('\n');

describe('chain-deep-scrapes workflow', () => {
  describe('headed Chrome under a display server (C9)', () => {
    it('wraps the chain in xvfb-run', () => {
      // A proxied run forces headed Chrome; headless is a first-order bot signal.
      // Without a display server Chrome dies with "cannot open display".
      expect(activeLines).toMatch(/xvfb-run\s+-a\s+node\s+scripts\/run-chain\.js\s+deep_scrapes/);
    });

    it('wraps the node parent, not the python child', () => {
      // run-chain.js spawns python3 with {...process.env}, so $DISPLAY must exist
      // on the shell that starts NODE. Wrapping the python invocation instead
      // would leave the parent without it and is a subtle, silent misconfiguration.
      expect(activeLines).not.toMatch(/xvfb-run[^\n]*python3?/);
    });

    it('installs xvfb', () => {
      expect(activeLines).toMatch(/apt-get install -y xvfb/);
    });
  });

  describe('profile cache (C2)', () => {
    it('does not restore a Chrome profile cache', () => {
      // A cache-restored SingletonLock names a dead host/PID and Chrome then
      // refuses to start. Because an honest verdict means a FAILED run never saves
      // a fresh entry, one poisoned entry is restored forever.
      expect(activeLines).not.toMatch(/actions\/cache/);
      expect(activeLines).not.toMatch(/\.buildo-scraper/);
    });
  });

  describe('schedule (F3 re-enable, 2026-08-05; cadence cut to Weekly, 2026-09-18)', () => {
    it('runs on the Spec 115 §2 row 4 cadence', () => {
      // RETIRED LOCK, deliberately: this block previously asserted NO active
      // schedule. That lock's condition — "a dispatch probe must have
      // demonstrated a non-zero row count under these constants, cited to its
      // run id" — was met by the F1 proving slice 31009693871 (2026-08-05):
      // 1,151 year_seqs attempted, 1,086 queue rows retired, anomalous miss
      // rate 3.7%, zero WAF blocks, zero outcome-write failures, budget-stop
      // at 141 min, chain completed_with_warnings with no FAIL verdict.
      // Re-disabling is a one-line comment-out; this assertion is what makes
      // an ACCIDENTAL disable visible.
      // CADENCE AMENDED 2026-09-18 (operator ruling, R2/Ask 6, Spec 124 R-AQ):
      // Weekdays(1x Daily) -> WEEKLY, one slot/week (Wed), same business-hours
      // time-of-day. Proven RED-first against the OLD literal ('0 15 * * 1-5')
      // before this edit landed, per this suite's own "an ACCIDENTAL disable/
      // drift is visible" intent — the workflow stays `disabled_manually` in
      // GitHub regardless of this literal (verified live via `gh api`, not
      // re-enabled by this WF2).
      expect(activeLines).toMatch(/^\s*schedule:/m);
      expect(activeLines).toMatch(/^\s*-\s*cron:\s*'0 15 \* \* 3'/m);
    });

    it('is still reachable on demand', () => {
      expect(activeLines).toMatch(/workflow_dispatch:/);
    });

    it('resolves the schedule path to production values, not probe values', () => {
      // The `inputs.X || 'Y'` fallbacks fire ONLY on the schedule path — a
      // workflow_dispatch always populates inputs from their declared
      // defaults, so the probe defaults ('3'/'1'/'12') stay probe-shaped for
      // humans. Before F3 the fallbacks were the probe values too, so every
      // scheduled slice would have scraped 3 permits on a 12-minute timeout.
      expect(activeLines).toMatch(/inputs\.max_permits \|\| '0'/);
      expect(activeLines).toMatch(/inputs\.max_retries \|\| '2'/);
      expect(activeLines).toMatch(/inputs\.chain_timeout_minutes \|\| '150'/);
    });
  });

  describe('job ceiling (P7 stage 2 prep, 2026-08-03)', () => {
    it('job timeout-minutes is 170 — sized from the stage-1 throughput proving run', () => {
      // Stage-1 proving run 30843114683: 100 permits / 12.6 min = 7.5s/permit,
      // miss-rate 5.0%, zero WAF blocks. A 150-min chain timeout ≈ 1,200
      // permits at that rate; 170 = 150 largest-expected chain timeout +
      // setup headroom. Slots are 3h apart, so 150 keeps a run inside its
      // slot before the concurrency guard would skip the next. The old 45
      // was probe-shaped and would kill any full-throughput stage-2 run.
      expect(activeLines).toMatch(/^\s*timeout-minutes:\s*170\s*$/m);
    });
  });

  describe('soft time-budget self-stop (F1, 2026-08-04)', () => {
    it('exports SCRAPER_TIME_BUDGET_MINUTES as the chain timeout minus the tail, shell-computed', () => {
      // Stage-2 drain run 30854595411: a healthy time-bounded drain was
      // hard-killed by the GH step timeout mid-scrape — orphaned
      // pipeline_runs rows, stuck claimed queue rows, red verdict every
      // slice. The scraper stops claiming 10 min before the hard kill and
      // finalizes clean; the step timeout-minutes stays as the backstop.
      // GH expressions have no arithmetic, so the -10 lives in the run
      // shell, fed by the same `inputs.chain_timeout_minutes || '12'`
      // expression family the step timeout uses.
      expect(activeLines).toMatch(/SCRAPER_TIME_BUDGET_MINUTES/);
      // The fallback moved 12 -> 150 with F3 (schedule path = production
      // values). FENCE AMENDED KNOWINGLY (WF3 2026-08-13): this lock defends the
      // MECHANISM (shell-computed budget from the same timeout expression) — the
      // -10 SIZING it also pinned was disproven by the 2026-08-12 step-timeout
      // kill (tail too small for the 6 post-scraper steps). The tail value is
      // now owned by the >= 25 lock below; this assertion pins mechanism only.
      expect(activeLines).toMatch(/chain_timeout_minutes \|\| '150'[^\n]*\}\}\s*-\s*\d+/);
    });
  });

  describe('failure detection', () => {
    it('reads the DB-recorded verdict separately from the process exit code', () => {
      // aic-orchestrator.py exits 0 on a scrape-level failure BY DESIGN, so a job
      // gating only on run-chain.js's exit code reports GREEN on a scrape that
      // produced nothing — the exact blindness this chain's observability exists
      // to remove.
      expect(activeLines).toMatch(/check-chain-verdict\.js\s+deep_scrapes/);
    });

    it('runs the verdict check even when the chain step failed', () => {
      expect(activeLines).toMatch(/if:\s*always\(\)/);
    });
  });

  describe('scraper soft-budget tail (WF3 2026-08-13, envelope re-budget)', () => {
    it('leaves >= 25 min between the scraper budget and the step timeout', () => {
      // The 2026-08-12 slot was axed by the STEP timeout with post-scraper steps
      // still running: BUDGET = timeout - 10 left a 10-min tail for 6 steps, while
      // the last successful run needed ~19 min. The subtrahend IS the tail. The
      // "slots are 3h apart" sizing rationale predates the 1x/weekday cadence —
      // this lock pins the re-budget so a future edit cannot silently shrink the
      // tail below what the post-scraper steps measurably need.
      // CEILING: source-level — YAML has no behavioral harness; this cannot catch
      // a tail consumed by slower future steps, only the subtrahend regressing.
      // (First draft used \S+ for the timeout expression — which contains spaces
      // (${{ ... }}), so the regex NEVER matched and the "red" was the not-found
      // branch: red-for-the-wrong-reason, caught when the fix failed to green it.
      // [^\n]* + tail-anchored capture is the correct shape.)
      const m = activeLines.match(/BUDGET=\$\(\([^\n]*-\s*(\d+)\s*\)\)/);
      expect(m, 'BUDGET=$(( <timeout expr> - N )) line not found').toBeTruthy();
      expect(Number(m![1])).toBeGreaterThanOrEqual(25);
    });
  });

  describe('chain soft time-budget — Layer 2 (WF3 F4, Spec 118 §3, 2026-08-15)', () => {
    it('sets CHAIN_TIME_BUDGET_MINUTES >= 120 — deep_scrapes was the one scheduled chain missing this layer entirely', () => {
      // Spec 118 §3's stop-mechanism hierarchy table: coa=120, permits=150 already
      // carried this layer; deep_scrapes carried NOTHING between the scraper's own
      // soft stop (Layer 1) and the platform step timeout (Layer 4). run-chain.js
      // checks this BETWEEN steps only — it is boundary-stop coverage, not a
      // substitute for F2's per-step ceiling (Layer 3), which is what actually
      // would have caught the 08-14 mid-refresh_snapshot pathology.
      const m = activeLines.match(/CHAIN_TIME_BUDGET_MINUTES:\s*'?(\d+)'?/);
      expect(m, 'CHAIN_TIME_BUDGET_MINUTES env line not found').toBeTruthy();
      expect(Number(m![1])).toBeGreaterThanOrEqual(120);
    });

    it('sits inside the "Run deep_scrapes chain" step\'s own env block, not the shared &pipeline-env anchor', () => {
      // The shared anchor also feeds the migrate --verify / PG_* derivation / guard
      // steps, none of which spawn run-chain.js — CHAIN_TIME_BUDGET_MINUTES is only
      // meaningful to the process that reads it.
      const chainStepIdx = yaml.indexOf('name: Run deep_scrapes chain');
      const budgetIdx = yaml.indexOf('CHAIN_TIME_BUDGET_MINUTES');
      const verdictStepIdx = yaml.indexOf('name: Verdict check');
      expect(chainStepIdx).toBeGreaterThan(-1);
      expect(budgetIdx).toBeGreaterThan(chainStepIdx);
      expect(budgetIdx).toBeLessThan(verdictStepIdx);
    });
  });

  /**
   * MASK BEFORE GITHUB_ENV EXPORT (measured 2026-10-03).
   *
   * The step "Derive PG_* connection vars" appends `PG_PASSWORD=...` to
   * $GITHUB_ENV; the `::add-mask::$PG_PASSWORD` call lived in the NEXT step
   * ("Mask PG_PASSWORD in logs"). GitHub prints an executed step's `env:` block
   * BEFORE running its `run:` — so `PG_PASSWORD` sat unmasked in every archived
   * log of that run, once per run, for a value GitHub's own auto-masking can
   * never cover (it only knows the whole SUPABASE_DATABASE_URL string).
   *
   * The fix shape is: mask INSIDE the same step that exports the secret, before
   * the write. These locks pin that shape at source level; they cannot prove log
   * masking (no behavioral harness for a GH runner), only that the two events
   * coexist in one step in the right order.
   */
  describe('secret masking precedes $GITHUB_ENV export (measured leak 2026-10-03)', () => {
    const SECRET_NAME = /PASSWORD|SECRET|TOKEN/i;
    const TO_GITHUB_ENV = />>\s*"?\$GITHUB_ENV"?|>>\s*"?\$\{GITHUB_ENV\}"?|appendFileSync\(\s*process\.env\.GITHUB_ENV/;

    interface Step {
      name: string;
      run: string;
    }

    /** Structurally split a workflow's `run:` values off its `steps:` list.
     *  The repo ships no YAML parser dependency, so this is a minimal
     *  indent-aware splitter using the universal workflows convention
     *  (steps at 6 spaces, keys at 8, `name:` list-item form). Sufficient for
     *  both the real file and the inline fixtures below. */
    function stepsWithRun(yml: string): Step[] {
      const lines = yml.split('\n');
      const out: { name: string; runLines: string[] | null }[] = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) continue;
        if (line.trim().startsWith('#')) continue;
        const name = line.match(/^\s+-\s+name:\s*(.+?)\s*$/) ?? line.match(/^\s+name:\s*(.+?)\s*$/);
        const nameText = name?.[1];
        if (nameText !== undefined) {
          out.push({ name: nameText, runLines: null });
          continue;
        }
        const key = line.match(/^(\s*)(run):\s*(.*)$/);
        const keyIndentText = key?.[1];
        const inlineText = key?.[3];
        if (keyIndentText === undefined || inlineText === undefined || out.length === 0) continue;
        const keyIndent = keyIndentText.length;
        const inline = inlineText.trim();
        if (inline && inline !== '>' && inline !== '|' && inline !== '|-' && inline !== '>-' && inline !== '>-') {
          const last = out[out.length - 1];
          if (last !== undefined) last.runLines = [inline];
          continue;
        }
        const body: string[] = [];
        for (let j = i + 1; j < lines.length; j++) {
          const l = lines[j];
          if (l === undefined) continue;
          const indent = l.match(/^\s*/)?.[0].length ?? 0;
          if (l.trim() !== '' && indent <= keyIndent) break;
          body.push(l);
        }
        const last = out[out.length - 1];
        if (last !== undefined) last.runLines = body;
      }
      const dedented = (ls: string[]) => {
        const indents = ls.filter((l) => l.trim() !== '').map((l) => l.match(/^\s*/)?.[0].length ?? 0);
        const min = indents.length ? Math.min(...indents) : 0;
        return ls.map((l) => l.slice(min)).join('\n');
      };
      return out
        .filter((s): s is { name: string; runLines: string[] } => s.runLines !== null)
        .map((s) => ({ name: s.name, run: dedented(s.runLines) }));
    }

    /** Rule 1: any step whose `run` writes a /PASSWORD|SECRET|TOKEN/-named value
     *  into $GITHUB_ENV must also call `::add-mask::` in that same run, and the
     *  first mask must precede the first write. */
    function maskPrecedesEnvWrite(yml: string): string[] {
      const bad: string[] = [];
      for (const step of stepsWithRun(yml)) {
        const writeIdx = step.run.search(TO_GITHUB_ENV);
        if (writeIdx === -1) continue;
        // Name and write live on different lines in a real derivation step
        // (the name is a JS string literal, the write is the appendFileSync
        // call), so this is step-scoped, not line-scoped.
        if (!SECRET_NAME.test(step.run)) continue;
        const maskIdx = step.run.indexOf('::add-mask::');
        if (maskIdx === -1) bad.push(`${step.name}: exports a secret to $GITHUB_ENV with no ::add-mask::`);
        else if (maskIdx > writeIdx) bad.push(`${step.name}: ::add-mask:: appears AFTER the $GITHUB_ENV write`);
      }
      return bad;
    }

    /** Rule 2: a step that DISPLAYS a mask is itself the leak point if that
     *  variable was exported via $GITHUB_ENV by an earlier step (the next step's
     *  `env:` block is printed before its `run:` executes). */
    function displayOnlyMaskOfEnvExportedVar(yml: string): string[] {
      const bad: string[] = [];
      const exported = new Set<string>();
      const firstLine = (s: string) => s.split('\n').map((l) => l.trim()).find((l) => l !== '') ?? '';
      for (const step of stepsWithRun(yml)) {
        const trimmed = step.run.trim();
        const maskOnly = trimmed.match(/^echo\s+"::add-mask::\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?"\s*$/);
        const maskedName = maskOnly?.[1];
        if (maskedName !== undefined && firstLine(step.run) === trimmed && exported.has(maskedName)) {
          bad.push(`${step.name}: sole purpose is masking $${maskedName}, exported via $GITHUB_ENV by an earlier step`);
        }
        for (const m of step.run.matchAll(/(?:^|\n)\s*([A-Za-z_][A-Za-z0-9_]*)=/g)) {
          const varName = m[1];
          if (varName !== undefined && /(>>\s*"?\$(\{)?GITHUB_ENV|appendFileSync\(\s*process\.env\.GITHUB_ENV)/.test(step.run)) exported.add(varName);
        }
        for (const m of step.run.matchAll(/['"]([A-Za-z_][A-Za-z0-9_]*)=/g)) {
          const varName = m[1];
          if (varName !== undefined && /appendFileSync\(\s*process\.env\.GITHUB_ENV/.test(step.run)) exported.add(varName);
        }
      }
      return bad;
    }

    it('the Derive PG_* step masks PG_PASSWORD in the SAME run, before the $GITHUB_ENV write', () => {
      // RED on the current workflow: the mask lives in the NEXT step.
      const violations = maskPrecedesEnvWrite(yaml);
      expect(violations, violations.join('\n')).toEqual([]);
    });

    it('no step exists solely to echo an ::add-mask:: for a variable an earlier step exported', () => {
      const violations = displayOnlyMaskOfEnvExportedVar(yaml);
      expect(violations, violations.join('\n')).toEqual([]);
    });

    // RED self-check fixtures — parsed by the SAME splitter, so a splitter
    // regression turns these green instead of silently passing the real file.
    describe('fixtures (RED self-check for the rules above)', () => {
      it('fires on the mask-in-next-step shape (the measured leak)', () => {
        const leaky = [
          'jobs:',
          '  build:',
          '    steps:',
          '      - name: Derive PG_*',
          '        run: |',
          "          node -e \"require('fs').appendFileSync(process.env.GITHUB_ENV, 'PG_PASSWORD=' + process.env.PW + '\\\\n')\"",
          '      - name: Mask PG_PASSWORD',
          '        run: echo "::add-mask::$PG_PASSWORD"',
          '',
        ].join('\n');
        expect(maskPrecedesEnvWrite(leaky).length).toBeGreaterThan(0);
        expect(displayOnlyMaskOfEnvExportedVar(leaky).length).toBeGreaterThan(0);
      });

      it('passes when the mask precedes the write in ONE step', () => {
        const fixed = [
          'jobs:',
          '  build:',
          '    steps:',
          '      - name: Derive PG_* and mask',
          '        run: |',
          '          echo "::add-mask::$PG_PASSWORD"',
          "          node -e \"require('fs').appendFileSync(process.env.GITHUB_ENV, 'PG_PASSWORD=' + process.env.PW + '\\\\n')\"",
          '',
        ].join('\n');
        expect(maskPrecedesEnvWrite(fixed)).toEqual([]);
        expect(displayOnlyMaskOfEnvExportedVar(fixed)).toEqual([]);
      });

      it('sanity: the splitter actually sees the real workflow steps', () => {
        const steps = stepsWithRun(yaml);
        expect(steps.some((s) => /Derive PG_/.test(s.name))).toBe(true);
        // The mask must be emitted inside the deriving step, right before the
        // GITHUB_ENV write — not in a later, display-only step.
        expect(
          steps.some(
            (s) => /Derive PG_/.test(s.name) && /::add-mask::/.test(s.run ?? ''),
          ),
        ).toBe(true);
        expect(steps.some((s) => /Mask PG_PASSWORD/.test(s.name))).toBe(false);
      });
    });
  });
});
