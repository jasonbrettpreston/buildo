# task-462 plan panel, round 1: questions ruled by the plan grounder (Cairn-Ground-P462)

Authority (MD = ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md), read at the lines:
- RR-0462 (:2390-2393). Put-to (:2391): "phone typecheck and phone tests join the push gate, 2 lines in .husky/pre-push-checks.sh before the web suite; 4a same card updates the test that pins the gate list; 4b same card adds one dated line in CLAUDE.md and the phone testing spec". Operator (:2392): "Let's just move forward with the basic quick plan. Approved." Ruled (:2393): step 4 includes the phone typecheck and replaces "no station change" of 2026-11-19 (:1212) for the gate list. The same line marks, as the orchestrator's readings and not his words: "off means removing the two lines" (it was in the text under the table, not in the table he pasted). It is not used as a ruling here.
- RR-0460 (:2380-2383). Put-to (:2381): phone tests local first, then push; proof is a full local run, then the Mobile CI run after it. Operator (:2382): "Approved." Ruled (:2383).
- The 2026-11-19 ruling (:1211-1213). Operator (:1212): "Let's do 1". The words "no build, no station change" are the put-to text (:1213). RR-0462 replaces them for the gate list only. station.sh is outside the repo and is not edited.
- RR-0392 (:1975): "I don't think we need any other infastrcuture beyond this". RR-0429 (:2202): "Keep notes short." RR-0450 (:2325): "We just want to turn off or change the text etc?", ruled (:2326): switches or text changes only.
- His standing words: "yes let keep this simple - but it cant go on forever" (:1811); "It has to be simple and easy turning stuff off if at all possible ... No more mistakes or surprises" (docs/reports/reviews/task-460/QUESTIONS-RULED.md:11); "this should be simple" (:2372). I did not find the phrase "this should be straightforward" in MD (:1727 has "Simple straightforward.").
- 124a_step_standard_policy_appendix.md:992 (R-IZ): "no change adds a tool, field or rule its card or ruling did not name".

Basis: board head dde49d6c9 (wf2/board). Read with sed, grep, git and read-only node on the repo's own functions. No test run, nothing written.

## Operator questions: none
The rules settle all the matters below.

## (a) The planner's three open choices
1. Comment line beside the two steps: ruled none. The settled shape is two plain step lines (RR-0462 put-to :2391). RR-0429 (:2202) and RR-0450 (:2325) point to text changes kept short. The way to remove them is in the CLAUDE.md line, which now names the file. Comments are stripped by execLines (hooks-composition.infra.test.ts:541), so a comment would not break T2. The header comment of the list only bars a fork assignment in a comment (.husky/pre-push-checks.sh:6). Nothing needs it.
2. A planted-failure station run for AC3: ruled no. station.sh:41 is a step() that ends with return $rc. station.sh:45 runs the list in a subshell and sets rc=1 on failure. The list is && lines, so a failed phone step stops before the suite. T4 (hooks-composition.infra.test.ts:575-599, FAIL_AT per step name) pins the stop for every name. A throwaway red commit would be extra infrastructure (RR-0392). The orchestrator's AC1 station PASS run still shows both steps with rc=0 in steps.log.
3. Script form: ruled test:ci with --coverage=false and --silent. I ran the last-wins parse in memory (yargs-parser from ~/Buildo/mobile/node_modules, booleans coverage, ci, silent, arguments --coverage --ci --coverage=false --silent). Result: coverage false, ci true, silent true. test:ci is what Mobile CI runs (mobile-ci.yml:31). The root .gitignore:12 is /coverage, anchored, so mobile/coverage would be untracked and station.sh:46 would refuse the run. The flag names exactly the thing turned off.

## (b) in#1: may the CLAUDE.md line state "off = remove those two lines"?
The rules settle it, and no question goes up. MD:2393 marks that sentence as the orchestrator's reading, so a rules file must not carry it as his ruling. It was also incomplete: removing only the two lines fails T2, which pins eight lines (hooks-composition.infra.test.ts:561). The folded CLAUDE.md line states the mechanical fact only: "To remove them: two lines in .husky/pre-push-checks.sh and two entries in src/tests/hooks-composition.infra.test.ts". It does not say "off", and it claims no ruling. It serves his "simple and easy turning stuff off" (task-460 QUESTIONS-RULED.md:11), because it names both places. The card Description keeps its sentence, which already marks it "orchestrator's reading ... not the operator's words".

## (c) rg#2 and in#2: a worktree with no phone packages link
Ruled: one short clause, in two places. In the CLAUDE.md line: "a worktree without the mobile/node_modules link stops at mobile-typecheck". In plan section 4: on the hook path the stop comes after the McBylaws gate has asked and the web checks have run, while the station refuses earlier (station.sh:32). Reasons: his "No more mistakes or surprises", and the stop is real (I read ~/Buildo/node_modules: tsc exists, no expo/tsconfig.base). The clause is about 12 words, so RR-0429 holds. No link check script (RR-0392).

## (d) rg#3: docs/specs/00_claude_code_operating_model.md:305
Ruled: read and left, not added to the Files line. The row (:305) lists the steps by name and a time, and it already omits the McBylaws gate, which has been in the hook since MB-67. A Files-line addition is a change the card or ruling did not name (124a :992, DoD #8). The 2 to 3 minute figure still holds with the phone steps (2.7 to 8.5 s for the tests). The decision is written in the plan (4.4), so the omission is on record. If the operator wants the row kept exact, that is a separate text card.

## (e) The ux lens
It ran only because lensSet matches the pattern \bmobile\/ (rule-lists.mjs:189) on the path text docs/specs/03-mobile/98_mobile_testing_protocol.md; "-mobile/" counts as a word boundary. The card changes no phone screen, so no ux finding bears on a user-facing screen. Its seven findings are about developer messages at push time: the order against task-461 (moot, folded), the unlinked worktree message (folded as the clause), the command name (piled), the pass file (rejected, station.sh is not edited), the file named in the off text (folded), the note length (folded), the double run (piled). Each is ruled on its own terms. I propose no change to the lens rule here (task-460 owns output review shape; RR-0450 allows switches or text only).

## (f) Exact final text after the fold
Gate lines (.husky/pre-push-checks.sh, inserted after line 11 and before the suite line):
step mobile-typecheck npm --prefix mobile run typecheck &&
step mobile-tests npm --prefix mobile run test:ci -- --coverage=false --silent &&

Test edits (src/tests/hooks-composition.infra.test.ts):
- LIST_LINES gains the same two strings after 'step typecheck npm run typecheck &&', each ending with " &&".
- STEP_NAMES becomes ['mcbylaws-gate', 'step-validate-staged', 'step-validate-all', 'spec-split', 'typecheck', 'mobile-typecheck', 'mobile-tests', 'suite'].
- The T2 title says "the eight chain lines". The comment at :524 says "eight" twice. After "no branch" on :525 add "(task-462, RR-0462: the phone typecheck and phone tests)". The line may grow; no re-wrap.

CLAUDE.md, after line 33 (item 5), indented 3 spaces:
   Dated 2026-11-24 (task-462, RR-0462): pre-push also runs `mobile-typecheck` and `mobile-tests` (phone typecheck and phone tests, no coverage) after `typecheck` and before the web suite; a worktree without the `mobile/node_modules` link stops at `mobile-typecheck`. To remove them: two lines in `.husky/pre-push-checks.sh` and two entries in `src/tests/hooks-composition.infra.test.ts`.

Spec 98, one blank line and then this, after line 123:
> Dated note 2026-11-24 (task-462, RR-0462, step 4 of the approved quick plan): the phone typecheck and phone tests also run before every push, as steps `mobile-typecheck` and `mobile-tests` of `.husky/pre-push-checks.sh` (before the web suite, no coverage written); Mobile CI still runs after the push.

## The plan's UNVERIFIED items (section 9), settled by reading where possible
- The no-write claim: settled by reading and an in-memory run (last wins, no coverage); the lane still runs the command once and checks git status (plan R3).
- tsc --noEmit in mobile/ exiting 0: not settled by me; the orchestrator reports exit 0 at a12d535f5 in the gate worktree.
- The exit code of the no-such-test-path run, and node 20 parity: not settled; the Mobile CI run after the push is the proof (RR-0460).
- The milestone letter: not checked.

## Files outside the Files line
None needed. The operating model row (:305) is read and left (matter d). station.sh and .husky/pre-push are not edited.
