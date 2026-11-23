# Seat: integration: task-442 plan (PLAN-442-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Basis: board head 086e6bcc6. Read: .husky/pre-commit whole and .husky/commit-msg; scripts/hooks/check-partial-staging.sh; check-task-files.mjs :1-60; check-lane-close.mjs (header and grep for the evidence rules); ~/.claude/hooks/lane-guard.mjs whole (rules B1, B4, B5, B6, G1); MD:895-896 (the ruling on how a lane proves red); mcbylaws/protected-paths.json; cite-arms.mjs :150-215; src-sql-ledger.mjs header and the read-stored.ts ledger entry; eslint.config.mjs :22-26 and :99-100; tsconfig (no noUnused*); vitest.config.ts (no shuffle, no restoreMocks); customer-report-read.logic.test.ts whole; maxbld-web-pages.logic.test.ts :105-122; admin-report-preview-live.logic.test.ts :1-125, :150-240; nav-by-route.logic.test.ts :288-312, :364-393; `git diff HEAD...<branch>` over all 163 unmerged local branches for the two test files, report-page.json, report-presentation.json and src/lib/report-projection.

Verdict: the plan lands through the hooks if three things are corrected: the line T2 deletes (see rc#1 in the reality seat), the way the plant is restored (in#1), and acceptance A3 (in#4). No hook asks for another file.

## in#1 HIGH: "git checkout -- <file>" is not available to a lane; the allowed restore is the edit tool, then a read-only proof
Plan: section 8 "The lane restores it with `git checkout -- src/lib/report-projection/read-stored.ts`"; T2 "restores the line".
Evidence: lane-guard.mjs B5 (:114-120) refuses `git switch|checkout|restore` in a protected worktree and in any worktree no live `lanes.mjs` claim covers; B4 refuses reset, stash, --amend, --no-verify, push. The lane brief rule forbids any checkout. So the restore is: put the one deleted line back with the edit tool, character for character from `git show HEAD:src/lib/report-projection/read-stored.ts`, then prove it with `git diff --quiet -- src/lib/report-projection/read-stored.ts` (exit 0) or an empty `git status --short -- src/lib`. No git command that writes is needed.
How the hooks treat the plant: check-partial-staging.sh judges only files that are staged, so an unstaged-only edit of read-stored.ts passes it. Every other pre-commit check reads the working tree (typecheck, lint, the related run), so the plant is seen by the related run, which is the point. check-task-files.mjs reads the staged list only, so the plant is not a Files breach. If the lane ever stages read-stored.ts, the red commit would carry the deletion if it passed, and it also fails the Files line: never stage it.
Fix: replace the checkout sentence with the edit-tool restore and the `git diff --quiet` proof; say "never stage read-stored.ts".

## in#2 MED: A4 does not prove the plant was restored
Plan: section 8 "A4 proves it"; A4 `git diff --stat <launch>..HEAD -- src/lib src/app scripts mobile migrations .github` empty.
Evidence: `<launch>..HEAD` compares commits. An unstaged leftover edit is in the working tree, not in any commit, so A4 passes while the plant is still there. The green commit would still fail (the related run is red with the guard missing), so the damage is a refused green commit, not a landed defect, but the plan's stated proof is wrong.
Fix: add to A4 `git status --short -- src/lib` empty (or `git diff --quiet -- src/lib/report-projection/read-stored.ts`).

## in#3 MED: T1's temporary line breaks more than the designed assertion if it changes the file-level SEEDS
Plan: T1 "adds one temporary line that sets formula:units_max off in the loaded switchboard" and A1 "T1 (a) toEqual([])".
Evidence: admin test :44-52 `SEEDS` is one shared object read by every G25 case through `S.buildParcelRows(..., SEEDS, META)` (:86-87), and by ST and INV. units_max is increment 1, so an off switch makes the engine write it as not_evaluated (rows.js:402); G25 then expects `o1.row.homes` to be a string and gets undefined.
What goes wrong: red-T1.out would show the 25 G25 cases and others failing beside the designed (a). The commit is refused either way, but "each fails at its designed assertion and not earlier" would be false in the output.
Fix: say the temporary line edits a local copy inside B1's control case (for example `structuredClone(SEEDS.switchboard)`), not SEEDS.

## in#4 MED: acceptance A3 asks for the runner, which two guard rules refuse; the repo's replacement is the hook output
Plan: A3 `npx vitest run <two files>` by the orchestrator.
Evidence: lane-guard.mjs B1 refuses the runner's name written whole in any command; B6 refuses `npm run test` forms (:104-105). MD:895-896 (ruling, "Decision (compliant...)"): "no lane calls the runner directly or by a joined name"; red is a commit attempt with only the test and task files staged; green is the commit that lands, its hook tail is green.out; the push station runs the full suite.
Fix: A3 becomes: read green-T1..T3 hook tail (the related run "Tests N passed" for both files) in the lane folder, plus A7 (push station). Do not type the runner's name in any acceptance.

## in#5 LOW: T3's first-version red fails (c) as well as (a)
Plan: T3 "the lane first writes the test without the `row.unit_size_basis_value` entry"; A1 "T3 (a), naming row.unit_size_basis_value".
Evidence: case (c) asserts "exactly 4 entries and exactly 1 of kind `exception`"; the first version holds 3 and 0. Both (a) and (c) fail; the related run lists both.
Fix: A1 reads "(a) fails and names the key; (c) may fail too", or make (c) first assert against the list after (a).

## in#6 LOW: the vi.resetModules, vi.doMock and dynamic import form works in customer-report-read.logic.test.ts; two wording fixes
Evidence: the file has hoisted mocks (maxbld-web getter on `live.on`, db/client, logger, auth, rate-limit, admin parcel-lookup, report-compute wrapper, lot-form; :25-52). read-stored.ts imports only seed-shas, project and pg types (read-stored.ts:15-17), and project.ts imports JSON, format, pinned-settings, seed: none of the hoisted mocks sits in that graph, so a reset and re-import does not disturb them; the file's static imports (:54-63) stay bound to their first instances, so T1 to T10 are unaffected. The form is the precedent's (maxbld-web-pages.logic.test.ts:113-119, factory with `orig` spread). No shuffle or restoreMocks in vitest.config.ts. The (a) import rejects with the throw's own message.
Wording: "vi.doMock('@/lib/report-projection/project', orig)" is not a factory; write `async (orig) => ({ ...(await orig<typeof import(...)>()), pageBindings: () => [...] })`. The `finally` must run doUnmock then resetModules, as in the precedent.

## in#7 LOW: A5 and A6 count strings that may appear twice
A5 `grep -c "kind: 'exception'"` expects 1. If the lane writes the list with an interface like nav-by-route.logic.test.ts:288 (`kind: 'exception' | 'disclosure' ...`), that line matches too, giving 2. A6 expects one `vi.doUnmock('@/lib/report-projection/project')` in the diff but the plan names it both after (a) and in the `finally`. Make the expected counts exact to the written form, or grep a marker comment.

## in#8 LOW: red attempts never reach commit-msg
pre-commit refuses first, so check-task-files, check-backlog-task and check-lane-close do not run on the three red attempts. The Files line, trailer and lane-close evidence are first exercised by the green commit. Not a defect; the lane should expect it.

## in#9 MED: collisions with unlanded branches
- wf1/inc1b-thinroute (2 commits on src/tests/customer-report-read.logic.test.ts, 26 inserted lines): rewrites the T10 describe at the end of the file (new `os` import, `pageImporters`, a RED plant). T2's new describe goes after T10, so the two edits are adjacent hunks: a textual conflict for whichever lands second.
- wf1/inc1b-areafactor (admin test +16 -9 around the formatter parity case in describe F, adds an `SQM_TO_SQFT` import; presentation.json only the `formats` note and the area formatter name): T1 and T3 go "beside F (:101)", the same neighbourhood; the presentation change is outside `page`, so T3's scan is unaffected.
- wf1/inc1b-hb446: no diff on the two test files, report-page.json, report-presentation.json or src/lib/report-projection. No collision.
- Older branches (mf83-daylight, wf1/mf10-build, mf14, mf19-v3, mf20, mf57, mf57-follow, mf62, mf62b, mf83-g3) touch report-page.json or report-presentation.json, dated 2026-11-09 to 11-11; none is a current lane. wf2/board-move shows deletions only because of its branch point.
Fix: state the landing order (thinroute and areafactor first, or rebase task-442 after them).

## in#10 No finding: the rest of the integration claims hold
- Files line is complete. check-task-files.mjs :10 always allows the task file, docs/reports/reviews/<task>/ and docs/reports/lanes/. No hook parses a SPEC LINK in a test file (only check-spec-diff.mjs does, and only for scripts/steps, scripts/lib/compute and descriptor.json). No system-map or registry row is needed: src/tests/system-map.infra.test.ts reads specs and target files, not test SPEC LINKs.
- Not frontend or protected: protected-paths.json `frontend` is scripts/surfaces/**, src/lib/surfaces/**, src/tests/surfaces/**, src/components/report/** and so on (:17-28); neither test file, nor src/lib/report-projection, matches any line of the file. cite-arms runFrontend runs only when a changed path is frontend (:172-178 `fe.length === 0`). parseMessage reads the commit message, so a SPEC LINK that adds FE-18 and FE-27 to a file changes nothing for the arm.
- src-sql-ledger --check is per file with no line numbers (ledger entry :3059-3085): deleting :29 does not change it. eslint no-unused-vars is `warn` (eslint.config.mjs:23) and tsconfig has no noUnusedLocals, so the unused PARCEL_SELECTED after the plant does not stop typecheck or lint before the related run.
- .husky/pre-commit :23 (ledger) and :85 (related run) are the cited lines.

UNVERIFIED (not checked by this seat):
- No hook was run. The red and green behaviour above is read from the scripts, not observed.
- Whether check-lane-close.mjs asks any more of a build lane's folder than the plan lists (red-T*.out names, GROUNDER-PLAN.md): only its header and grep were read.
- The lens lists the Files line resolves to at output review.
- Whether the push station accepts this branch (A7): the pre-push script was not read.
- The `lanes.json` claim state of any worktree (B5 would allow checkout in a claimed one; the lane brief rule forbids it regardless).
