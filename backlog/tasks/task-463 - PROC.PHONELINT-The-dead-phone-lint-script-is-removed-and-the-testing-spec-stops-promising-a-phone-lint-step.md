---
id: TASK-463
title: >-
  PROC.PHONELINT The dead phone lint script is removed and the testing spec
  stops promising a phone lint step
status: BUILT
assignee:
  - '@lane-BL-PLINT'
created_date: '2026-11-24T18:43:00Z'
updated_date: '2026-11-25T18:00:00Z'
labels:
  - ProcessImprovement
milestone: m-1
dependencies: []
references:
  - docs/reports/reviews/task-463/GROUNDER-PLAN.md
  - docs/reports/reviews/task-463/TRIAGE-PLAN.md
  - docs/reports/reviews/task-463/seat-integration-1.md
  - docs/reports/reviews/task-463/seat-reality-check-1.md
  - docs/reports/reviews/task-463/seat-regression-1.md
  - compliance:mobile-90 docs/specs/03-mobile/90_mobile_engineering_protocol.md
  - compliance:mobile-98 docs/specs/03-mobile/98_mobile_testing_protocol.md
  - compliance:mobile-99 docs/specs/03-mobile/99_mobile_state_architecture.md
  - compliance:surface-136 docs/specs/02-web-admin/136_mcfrontend_handbook.md
  - compliance:eng-all docs/specs/00_engineering_standards.md
  - compliance:plan-protocol docs/specs/00-architecture/plan-protocol.md
  - compliance:inc-S backlog/docs/increments/doc-2 - Increment-S-requirements.md
  - compliance:ms-S backlog/milestones/m-1 - increment-1·b-search-[s].md
  - docs/reports/lanes/2026-11-25/BL-PLINT/GROUNDER.md
  - docs/reports/lanes/2026-11-25/BL-PLINT/TRIAGE.md
  - docs/reports/lanes/2026-11-25/BL-PLINT/REPORT.md
type: fix
ordinal: 157210
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Card opened 2026-11-24 by the orchestrator from RR-0462 (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:2392), step 5 of the approved plan. Source: Cairn-Ground-PHONECHK proposal D (~/Buildo-scratch/lanes-20261124/phonechecks/GROUNDER-PHONECHK.txt). mobile/package.json:13 holds a lint script though the phone app has no lint tool installed; the phone testing spec section 5 says CI runs it and the workflow never does. Text only: delete the script line and correct the spec line with a dated note. Not planned yet; after PROC.PHONEGATE.

Files: mobile/package.json, docs/specs/03-mobile/98_mobile_testing_protocol.md, src/tests/hooks-composition.infra.test.ts, docs/reports/generated/rule-lists-by-kind.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 mobile/package.json has no lint script and the phone testing spec section 5 says there is no phone lint step, with a dated note
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 The rule the task rests on is quoted with file:line in the task, or the task is a card for the missing rule — "Quote the rule first" (.cursor/MCBYLAWS-QUEUE.md:107)
- [x] #2 The tests were written first and proven red, then green — "Every lock is proven in BOTH directions" (docs/specs/00-architecture/08_agents.md:462)
- [x] #3 The work is committed through the real hooks, none bypassed — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [x] #4 The named test is green before the task is called done — "Never declare a task done until" (CLAUDE.md:32)
- [x] #5 Any operator ruling the task needed is recorded verbatim as a dated note or a decision-log row — "A ruling enters a row as a verbatim dated note." (docs/specs/00-architecture/137_mcqueue.md:109)
- [x] #6 The task file and its queue row are updated in the same commit as the work — "The status line changes in the same commit as the work." (docs/specs/00-architecture/137_mcqueue.md:84)
- [x] #7 DONE carries its evidence (commit sha, test, hook result) — "The work landed and the evidence exists" (docs/specs/00-architecture/137_mcqueue.md:63)
- [x] #8 Nothing was added that the card or ruling did not name — "no change adds a tool, field or rule its card or ruling did not name" (docs/specs/01-pipeline/124a_step_standard_policy_appendix.md:988)
- [x] #9 The principles the task serves are named — "Each task names the ones it serves." (.cursor/MCBYLAWS-QUEUE.md:104)
- [x] #10 The close-out reply ends with one STATUS line and at most one question — "Every reply ends with one line" (docs/specs/00-architecture/08_agents.md:505)
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Planner: Cairn-Plan-463
Plan id: PLAN-463-v1

Read at board head (wf2/board) after tasks 462, 460, 457 and 452 were pushed at 9fedd48cb. The planner wrote nothing and ran no test.

The change is small. Removing the script breaks nothing that reads it. One rule-lists page has to be regenerated, and one existing web test file has to be added to the Files line so the tests-first step is possible.

### (A) Facts

| Claim | file:line | Quote |
|---|---|---|
| The dead script | mobile/package.json:13 | `"lint": "eslint src app --ext .ts,.tsx",` |
| The phone app has no eslint | mobile/package.json | grep "eslint" finds only :13. There is no mobile/.eslintrc* or mobile/eslint.config* |
| Mobile CI never runs lint | .github/workflows/mobile-ci.yml:29-31 | `npm ci --legacy-peer-deps` / `npm run typecheck` / `npm run test:ci` |
| The pre-push phone steps have no lint | .husky/pre-push-checks.sh:12-13 | `step mobile-typecheck … run typecheck` / `step mobile-tests … run test:ci …` |
| Every other `npm run lint` hit is the web (root) lint, so none breaks; a repo-wide grep finds no caller of the phone script, only text copies (see D) | .husky/pre-commit:55; .github/workflows/test.yml:63 (no working-directory); package.json:15 `verify`; CLAUDE.md:33, :59 | `npm run lint &&` |
| A test pins the phone steps but not lint | src/tests/hooks-composition.infra.test.ts:551-552 | `'step mobile-typecheck npm --prefix mobile run typecheck &&'` |
| No test reads mobile/package.json scripts | grep of src/tests | No hit |
| The promise to remove | docs/specs/03-mobile/98_mobile_testing_protocol.md:118 | `` - `npm run lint` (ESLint) `` |
| Text that points at that list | Spec 98:121 | "EAS Build runs the above sequence natively…" (still true once the bullet is gone) |
| Spec 98 has no other lint mention | Spec 98 | grep -i lint finds only :118 |
| Form of a dated note | Spec 98:125 | `> Dated note 2026-11-24 (task-462, RR-0462, step 4 of the approved quick plan): the phone typecheck and phone tests also run before every push, …` |
| Spec 98 is a rule list | scripts/analysis/rule-lists.json:44 | `"mobile-98": { … "whole": true, "generated_by": "hand-written" }` |
| The generated page counts its characters | docs/reports/generated/rule-lists-by-kind.md:42 | `\| mobile-98 \| … \| whole file \| 11,801 \| 1 \|`, phone total line `216,323` |
| The last Spec 98 edit regenerated that page | commit 06811e273 | "The rule-lists page is regenerated (the mobile-98 list grew by the note)" |
| The pre-commit hook checks the page | .husky/pre-commit:44 | `node scripts/analysis/rule-lists.mjs page --check` |
| The 3-file cap behind RR-0429 | src/tests/backlog/rule-lists.logic.test.ts:981-989 | `toBeLessThanOrEqual(3)` for FILES_423 and the Files lines of task-419 and task-412. That is the tooling kind (08_agents, 137_mcqueue); none of these lines names mobile (count 0), so mobile-98 is not capped |
| The RR-0429 ruling | MORNING-DECISIONS.md:2203 | "dated notes are kept short. The cap is not raised." |
| The ruling behind this card | MORNING-DECISIONS.md:2390-2393 | "5 separate text-only card: delete the dead lint script and correct the spec line" |
| System map | 00_system_map.md:128 | The row for 98 has no tests and only the title, so no regeneration is needed |

### (B) Plan

1. **Test first.** Add one `it` to the `describe('task-424 — one list of pre-push checks')` block in src/tests/hooks-composition.infra.test.ts (around :529). It extends the phone gate pin that task-462 added. Use the existing `fs`, `path` and `REPO_ROOT`:
   ```ts
   it('task-463 (RR-0462) — no phone lint step: mobile/package.json has no lint script; Spec 98 §5 lists no `npm run lint` and carries the dated note', () => {
     const scripts = (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'mobile/package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;
     expect(Object.keys(scripts)).not.toContain('lint');
    expect(Object.keys(scripts)).toEqual(expect.arrayContaining(['typecheck', 'test:ci', 'safe-start']));
     const s5 = fs.readFileSync(path.join(REPO_ROOT, 'docs/specs/03-mobile/98_mobile_testing_protocol.md'), 'utf8').split('## 5. ')[1]!.split('## 6. ')[0]!;
     expect(s5).not.toContain('npm run lint');
     expect(s5.split('> Dated note 2026-11-24 (task-463, RR-0462').length - 1).toBe(1);
   });
   ```
   Run only this file, the usual single-file way, and save the output as red.out. Expected: 1 failed, because the first assertion meets `lint` (today the first, third and fourth assertions would fail; the second holds).
2. **mobile/package.json.** Delete line 13 exactly: `    "lint": "eslint src app --ext .ts,.tsx",`. Line 12 keeps its trailing comma because `safe-start` follows. mobile/package-lock.json has no lint text and does not change.
3. **Spec 98.** Delete line 118 exactly: `` - `npm run lint` (ESLint) ``. After line 125 (the task-462 note), add a blank line and then:
   `` > Dated note 2026-11-24 (task-463, RR-0462, step 5 of the approved quick plan): there is no phone lint step. The phone app has no lint tool installed, so the lint item is removed from this list and the unused `lint` script from `mobile/package.json`.
   The note must not repeat the command text: the third assertion of step 1 forbids it in section 5. ``
4. **Regenerate the page.** Run `node scripts/analysis/rule-lists.mjs page --write`, then `--check`. Only the mobile-98 row (:42) and the phone total change.
5. Run the same test file again (green), and save the output as green.out.
6. **Commit.** One work commit through the real hooks, nothing bypassed. It holds the test, both card files, the regenerated page, and the task file with status, Files line and evidence. Subject: `fix(98_mobile_testing_protocol): the dead phone lint script is removed and Spec 98 §5 stops promising it`. Trailers: `Task: task-463` and the Co-Authored-By line.
7. **Checks.** The pre-commit hook runs the page check, spec-split, step-validate, typecheck, web lint, and the related tests. Then `npm --prefix mobile run typecheck` (the script removal can't affect it). The full `npm run test` runs at pre-push or on the station (DoD #4).

### (C) Files line

`mobile/package.json, docs/specs/03-mobile/98_mobile_testing_protocol.md, src/tests/hooks-composition.infra.test.ts, docs/reports/generated/rule-lists-by-kind.md`

- **src/tests/hooks-composition.infra.test.ts:** DoD #2 needs a test to prove red then green. This file already pins the phone gate steps under the same RR-0462 plan (:551-552), and it is the composition lock named in CLAUDE.md:33. No new test file.
- **docs/reports/generated/rule-lists-by-kind.md:** a generated page. Any change to Spec 98's text changes its count, and `page --check` blocks the commit otherwise.

### (D) Risks

- Line numbers drift by one after the delete in step 3, so the builder should match the quoted text, not the line numbers.
- The note is 250 characters (counted on a copy). Nothing caps mobile-98, so RR-0429 is met by keeping it short.
- No operator ruling is needed. The two extra files follow from what the card already names: DoD #2 for the test, the pre-commit gate for the page.
- Piled, not part of this card (the Files line stays at four): the review pack .claude/review-templates/packs/mobile-core.md:241 and the three .cursor spec93 deferred cards (authstate_reset_placement :32, backup_email_persistence :34, sentry_v8_upgrade :33) still say phone lint. The pack is recut at the next handbook recut; each deferred card is fixed when it is un-deferred.

### (E) Not verified

- That `page --write` is the right command to regenerate the page. I took it from the usage line at rule-lists.mjs:13 and did not run it.
- Derived on a copy, not by running page --write: Spec 98 grows from 11,801 to 12,027 characters, so the mobile-98 row should read 12,027 and the phone total 216,549.
- That the new test is red today and green after the edits. I ran no test.
- Settled by the plan grounder: mobile/eas.json exists and holds no lint text.
- Settled: resolve takes --files (rule-lists.mjs:5), not --task, so the refusal came from the wrong flag; the task file has its Files line at :23 and it reads well. Run resolve with the Files line from the task.
- Settled by the plan grounder: a git grep over the whole repo outside backlog and reports finds no caller of the phone lint script; the text copies that remain are piled in (D).

Plan review round 1: 11 folded, 0 task, 0 ruling, 0 wontfix, 4 pile; grounder docs/reports/reviews/task-463/GROUNDER-PLAN.md; triage docs/reports/reviews/task-463/TRIAGE-PLAN.md
plan-plan-review-deepseek#1 HIGH folded a repo-wide grep fin
plan-ux#1 HIGH folded the lint item is rem
rc#1 HIGH folded the lint item is rem
plan-ux#2 MED folded there is no phone li
plan-error-paths#1 MED folded expect(s5.split('> D
plan-error-paths#2 MED folded expect.arrayContaini
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-25 taken on the board at lane launch (lane BL-PLINT, worktree /Users/brettpreston_macmini/Buildo-wt-plint, branch wf2/plint), RR-0240

2026-11-25 red: the task-463 test is added to the task-424 describe block of src/tests/hooks-composition.infra.test.ts (plan step 1); red is proven by a commit attempt with only the test and task files staged (RR-0225; the plan's 'run only this file' step is done through the pre-commit related run, not a direct runner call).

2026-11-25 build: red.out = refused commit attempt (1 failed | 54 passed; 'expected [...] to not include lint'). Edits: mobile/package.json lint line deleted; Spec 98 section 5 lint bullet deleted and the task-463 dated note added after the task-462 note; rule-lists page regenerated with page --write, page --check current (mobile-98 11,801 -> 12,027; total 216,323 -> 216,549, as the plan derived). Green = this work commit's hook tail. The launch context file docs/reports/reviews/task-463/context-r2.md is committed with the work as the brief says.

2026-11-25 push station PASSED on work commit 74b06e6be (all eight steps rc=0, including mobile-typecheck, mobile-tests and the full web suite); pass file ~/Buildo-scratch/push-station/pass/74b06e6be59e5351d24750d7e2cf72c8b178b7b1.pass; run before the output review by RR-0467 (MORNING-DECISIONS.md:2421-2425).

2026-11-25 output review round 1: one code-review lens (task-460 shape) over a6a3fcb6d..74b06e6be with context-r3.md; out-code-review.txt: 2 MED, 2 LOW DEFER, 2 REJECT, VERDICT PASS; records in docs/reports/lanes/2026-11-25/BL-PLINT/; grounder owed (the lane does not rule its own findings).

2026-11-24 (orchestrator): folded to the board at ece69a003. On the folded tip in the gate worktree: full phone run 59 suites, 908 of 908 tests, rc=0 (~/Buildo-scratch/lanes-20261124/gate-phone-ece69a003.out); STATION PASS ece69a003 (~/Buildo-scratch/push-station/pass/ece69a003e6b14e5ae49002361f3b0a7f38497f5.pass). Owed: the push (the operator's y) and the Mobile CI run after it.

2026-11-25 (orchestrator): pushed by the operator (push.log 2026-11-25T12:42:31Z, ece69a003 -> wf1/mb-rulings rc=0; origin confirmed at ece69a003). Mobile CI run 45628832250 on ece69a003: see the result line recorded with this note.

2026-11-25 (orchestrator): Mobile CI run 45628832250 concluded success on ece69a003 (gh run view).

2026-11-25 (orchestrator): pushed by the operator (push.log 2026-11-25T14:26:13Z, aca7d541d -> wf1/mb-rulings rc=0; origin confirmed at aca7d541d). Mobile CI run 45634768039 concluded success on aca7d541d (gh run view).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Landed in work commit 74b06e6be (wf2/plint, through the real hooks): mobile/package.json loses the unused lint script; Spec 98 section 5 loses the npm run lint bullet and carries the task-463 dated note (RR-0462 step 5); docs/reports/generated/rule-lists-by-kind.md regenerated (mobile-98 12,027; total 216,549; page --check current); src/tests/hooks-composition.infra.test.ts pins it. Red: refused commit attempt, 1 failed | 54 passed (red.out). Green: work commit hook tail, 55 passed, GATE OK (green.out). Push station PASS on 74b06e6be (all eight steps rc=0; pass file ~/Buildo-scratch/push-station/pass/74b06e6be59e5351d24750d7e2cf72c8b178b7b1.pass), run before the review by RR-0467. Output review: one code-review lens over a6a3fcb6d..74b06e6be, records commit 73b58586c; validating grounder Cairn-Ground-O463: 1 CONFIRMED (LOW, piled), 3 REJECTED. Acceptance #1 evidence: mobile/package.json has no lint key; Spec 98:126 dated note; test task-463 green. Rule: RR-0462 (MORNING-DECISIONS.md:2390-2393). No operator ruling was needed beyond RR-0462. Principles served: accuracy (the spec states what CI really runs), understandability and simplicity (one dead script removed, no new tool).

Review round 1: 0 fixed, 0 task, 0 ruling, 0 wontfix, 1 pile; grounder docs/reports/lanes/2026-11-25/BL-PLINT/GROUNDER.md; triage docs/reports/lanes/2026-11-25/BL-PLINT/TRIAGE.md
<!-- SECTION:FINAL_SUMMARY:END -->
