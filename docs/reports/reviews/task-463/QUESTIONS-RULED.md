# task-463 plan panel, round 1: questions ruled by the plan grounder (Cairn-Ground-P463)

Authority (MD = ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md), read at the lines:
- RR-0462 (MD:2390-2393). Operator verbatim (:2392): "Let's just move forward with the basic quick plan. Approved." Ruled (:2393): the plan put at :2391 is approved, steps 1 to 6 as put. Step 5 of that plan is this card: a separate text-only card that deletes the dead lint script and corrects the spec line (the plan text at :2391, the proposal D of GROUNDER-PHONECHK.txt). Nothing in :2393 asks for more than the script line, the spec line and a dated note.
- RR-0429 (MD:2202-2203). Operator (:2202): "Keep notes short." Ruled (:2203): "dated notes are kept short. The cap is not raised." The cap test (src/tests/backlog/rule-lists.logic.test.ts:981-989, toBeLessThanOrEqual(3)) loops FILES_423 and the Files lines of task-419 and task-412; none names mobile, so mobile-98 is not capped. The reworded note is 250 characters; the task-462 note at Spec 98:125 is 303.
- RR-0392 (MD:1975): "I don't think we need any other infastrcuture beyond this". The card adds one test case to an existing file and no script, tool or file of its own.
- RR-0385 (MD:1915-1926): round 1 folds CRITICAL, HIGH and MED; LOW and NIT are piled unless the fold is a few words (MD:1919).

Basis: board head 9de5c2129 (wf2/board). Read with sed, grep, git grep and read-only node on the repo's own functions. No test run, nothing written.

## Operator questions: none
The rules settle every matter. The plan lists no open choices.

## (a) The planner's open choices
None listed (section D says "No operator ruling is needed"). Ruled as stated: the two files beyond the card (see matter c) follow from DoD #2 and the pre-commit gate, not from a new choice.

## (b) The planner's (E) not-verified items, settled by reading
1. page --write as the regeneration command: settled. scripts/analysis/rule-lists.mjs:13 gives "page [--write|--check]" and :862 writes the one file named by PAGE (:541, docs/reports/generated/rule-lists-by-kind.md). .husky/pre-commit:44 runs "page --check". Folded: the count is derived on a copy.
2. The page count delta: derived by applying the edits to a copy in memory. Spec 98 is 11,801 characters today (the page row at rule-lists-by-kind.md:42 says 11,801). Deleting the lint bullet and adding the reworded note after a blank line gives 12,027 (+226). The mobile-98 row should read 12,027 and the phone total (:50, now 216,323) should read 216,549. This assumes page --write counts characters as today; page --write itself was not run. Folded into (E).
3. Red today, green after: not run (no test runner by rule). Simulated in memory on copies of mobile/package.json and Spec 98 with the folded assertions. Today: the lint key is present (assertion 1 fails), the bare phrase npm run lint is in section 5 (assertion 3 fails) and the note count is 0 (assertion 4 fails); the remaining-scripts assertion holds. After the edits all four hold: keys are start, android, ios, web, test, test:ci, typecheck, safe-start; section 5 has no npm run lint; the note stem occurs once. The real red and green runs stay the builder's.
4. mobile/eas.json: settled. The file exists and git grep -i lint over it finds nothing.
5. resolve --task refusing "no Files: line": settled. rule-lists.mjs:5 shows resolve takes --files "<Files line>" and has no --task flag; the refusal text at :263 is what an empty --files gives. The task file's Files line is at line 23, not 22 (the planner and the seat's :22 both slipped), and it is well formed. I ran resolveTask on the task as it stands: it passes the Files check and stops later at the milestone-letter step, which is a launch-gate matter and not a parser fault.
6. Callers outside the grepped paths: settled by git grep over the whole repo outside backlog, docs/reports, node_modules and lock files, for mobile with lint and for run lint beside mobile. No script, workflow, hook, Makefile or root lint calls the phone script (root package.json:10 lint is next lint, no --prefix mobile). Text copies only: .claude/review-templates/packs/mobile-core.md:241, and the Green Light step "cd mobile && npx jest && npx tsc --noEmit && npm run lint -- --fix" in three .cursor spec93 deferred cards (authstate_reset_placement.md:32, backup_email_persistence.md:34, sentry_v8_upgrade.md:33; the seat found two). Piled as one line in (D), outside the card.

## (c) Files the plan marks outside the card's Description
- src/tests/hooks-composition.infra.test.ts: needed. DoD #2 (tests first, proven red then green) needs a test; this file already pins the phone gate steps (:551-552, task-462) and is the composition lock named in CLAUDE.md:33. No new test file (RR-0392). Already on the Files line.
- docs/reports/generated/rule-lists-by-kind.md: needed. Spec 98 is a rule list (rule-lists.json:44, whole file), so its count changes and .husky/pre-commit:44 runs page --check. Already on the Files line.
- Not added: .claude/review-templates/packs/mobile-core.md and the three .cursor spec93 deferred cards. They are stale copies; the pack already lacks the task-462 note (same precedent: not recut by 462). The card names no edit to them (124a_step_standard_policy_appendix.md:992, R-IZ: "no change adds a tool, field or rule its card or ruling did not name"). The Files line stays at four.

## (d) The dated note, ruled
The planned note quoted the backticked command that the plan's own third assertion forbids (confirmed by me on a copy: the assertion failed; same as rc#1 and plan-ux#1). The exact reworded text, checked in memory against all assertions of the folded step 1:
> Dated note 2026-11-24 (task-463, RR-0462, step 5 of the approved quick plan): there is no phone lint step. The phone app has no lint tool installed, so the lint item is removed from this list and the unused `lint` script from `mobile/package.json`.
It starts with the stem the test pins, names task-463 and RR-0462, holds no npm run lint, is 250 characters, and keeps the 462 form (RR-0429). It says the item is removed from this list and does not point at a line above (plan-ux#2).
