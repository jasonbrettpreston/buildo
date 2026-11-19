# REPORT: BL-LENSES (task-358 REVIEW.LENSES, Increment 1B)

## Five plain lines for the operator
1. A lane's review now runs a lens set, not one generic pass: at plan and at output, the lenses that fire for the task type run in parallel (build on a surface: compliance, code review, user experience, error paths; security only when the files touch entitlements, auth, stripe or a metered route; record-only tasks: compliance only), and the lane brief says so (pinned by a test).
2. All five lenses are DeepSeek (compliance A10, code review A3, user experience A11, error paths A2 lens 4, security A12), per your words "deepseek does the compliance seat"; Claude stays as the single grounder that adjudicates every finding (round 2) and does the Integration check, and Reality-Check stays Claude only when values are served.
3. One full five-lens set measured on the semi page commit: 64 s wall clock in parallel (30 to 64 s each), 76,711 tokens in total (input 28,177, output 48,538), 3.2 to 3.8 KB of output per lens (lens-run/*.txt, timing2.txt).
4. Real runs on 9fea46277: compliance 4 DEFER + 4 MET, PASS; code review 4 DEFER + 2 REJECT, PASS; user experience 2 BUG HIGH + 3 DEFER + 2 REJECT, FAIL; error paths 2 BUG MED + 4 DEFER + 2 REJECT, PASS; security 2 DEFER + 3 REJECT, PASS. The same four points recur across lenses (generic push runs the counted lookup; no timeout; no loading state during Continue; Try again after a failed submit only clears the banner); not triaged here (task-359 owns it).
5. Unproven: no Claude grounder has adjudicated these five outputs; the `--template` runner flag was missing and was added (the first five runs with the old `--context <lens>` form returned zero strict-format lines); my own plan had the single generic round only (the lens set did not exist yet).

## What was built (AC)
- AC1: five templates `.claude/review-templates/lens-{compliance,code-review,ux,error-paths,security}.md` (one question, NOT-responsible list naming the other lenses, "a finding with no quote is rejected", strict format, at most 8 findings, verdict line); README gains the lens to seat table, the standard (parallel DeepSeek, one Claude grounder as round 2, Reality-Check only when values are served, "verified" only with the name of what verified it) and the run commands. Pinned by src/tests/review-lens-template.infra.test.ts.
- AC2: scripts/analysis/backlog-lane.mjs `lensLine` adds one review line to every brief (plan lenses, output lenses by task type and Files line, in parallel, r1-<lens>.txt, triage as round 2). Existing plan-review-deepseek.md line kept (failure-modes lens). Pinned by 4 new cases in src/tests/backlog/backlog-lane.logic.test.ts. The scratch brief tool was not edited.
- Runner change (the flag that was missing): `scripts/deepseek-review.js review <file> --template <lens> [--context <file>]` sends the lens's own System persona and User prompt ({{PLAN}} = the file, {{SPECS}} = the context file). Evidence it was needed: lens-run/ctxform-*.txt (the `--context <lens>` form, the generic adversarial prompt wraps the lens): `grep -c "BUG severity|DEFER severity|VERDICT:"` gave 0 for all five. After the flag: 8, 6, 7, 8, 5 strict lines and a VERDICT line each. Tests: 3 new infra cases (dry-run, no network).
- Spec 08 rule 4 dated note (M-246 form, operator words and cite) records the file names.
- Red: red.out (commit attempt with the tests and task file staged: 5 failed). Green: commit.out.

## Exact command a lane runs per lens
Output review (diff in `review-input.diff`, pasted rulings/clauses/design text in `pasted-context.md`):
`DOTENV_CONFIG_PATH=$HOME/Buildo/.env node -r $HOME/Buildo/node_modules/dotenv/config scripts/deepseek-review.js review review-input.diff --template .claude/review-templates/lens-<lens>.md --context pasted-context.md > r1-<lens>.txt`
Plan review: same with `review docs/reports/reviews/<task>/context-<date>.md --template .claude/review-templates/lens-<lens>.md` (no --context needed, the context file holds the rulings). The five at once: lens-run/run-all.sh.

## Real runs (lens-run/<lens>.txt; input lens-run/review-input.diff + pasted-context.md with RR-0308, RR-0309 and the approved mock text)
| lens | secs | tokens (in/out) | bytes | strict lines | verdict |
|---|---|---|---|---|---|
| compliance | 47 | 14,853 (5,669/9,184) | 3,695 | 8 | PASS |
| code-review | 64 | 18,755 (5,616/13,139) | 3,171 | 6 | PASS |
| ux | 59 | 17,803 (5,632/12,171) | 3,843 | 7 | FAIL |
| error-paths | 49 | 14,469 (5,633/8,836) | 3,721 | 8 | PASS |
| security | 30 | 10,831 (5,623/5,208) | 3,187 | 5 | PASS |
Findings (one line each, quotes in the files): compliance: Try again after a failed submit only clears the banner (DEFER MED); generic push runs the counted lookup (LOW); heading width and 48 px not visible in the pasted diff (LOW, cannot see). code-review: push overload (MED); id unguarded on the answered fetch (MED); submitError typed unknown widens `submitError ?? error` (MED); failure not logged (LOW). ux: no visible in-flight state, Continue stays live after the tap (BUG HIGH); back chevron then the late fetch still lands on the report (BUG HIGH); Try again does not retry (MED); icon-only back chevron has no visible accessible name (LOW). error-paths: no timeout, ref latch can stick (BUG MED); no unmount guard before router.replace (BUG MED); push overload (MED); empty id (LOW); failure not logged (LOW); guard re-armed in finally (LOW). security: the semi=answered flag is client-set metering input (DEFER MED); bounded only by once-per-lot-per-month (LOW).
Lens quality seen: no lens produced the old free prose; UX and error-paths still overlap on Try again and timeout (expected overlap is dedup work for the grounder). Not triaged into tasks.

## Review of my own plan
One generic round only (plan-review-deepseek.md via review mode, deepseek-chat, 22 s, 14,629 tokens): the lens set did not exist yet. r1-plan.txt, TRIAGE.md (3 KEPT folded: severity gate worded for plan and output, per-lens anti-patterns, no em-dash inside a field; rest REJECT with reasons).

## UNVERIFIED
- No grounder adjudicated the five lens outputs (not asked; task-359 owns triage); every finding is a DeepSeek claim.
- The full pre-push suite was not run (station only).
- The plan-mode lens form (`review <context file> --template <lens>`) printed correctly in dry-run tests but was not run live; only the output form had five live runs.
- The first live plan round used --fast (deepseek-chat); the five lens runs used the default deepseek-reasoner.

gate: see final message.
STATUS: ready
