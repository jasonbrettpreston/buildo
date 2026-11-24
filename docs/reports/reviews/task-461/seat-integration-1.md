# Seat: integration: task-461 plan (PLAN-461-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board `wf2/board` at head 9482866fd. The plan was folded and read in the working tree.

Files read:
- the task-461 card and `GROUNDER-PLAN.md`, `QUESTIONS-RULED.md` and `seat-integration-1.md` under `docs/reports/reviews/task-461/`
- `mobile/__tests__/lotForm.test.ts:8-73` and `mobile/src/lib/schemas.ts:420-442`
- `mobile/package.json:8-14,65-96`
- `~/Buildo-scratch/lanes-20261124/phone-5af0f7be2.out` and `phone-full-0ab1aed72.out`
- `docs/specs/00-architecture/137_mcqueue.md:98`, `08_agents.md:496`, `task-450` card `:314`, `.gitignore:10-14`

UNVERIFIED: the hook's related-test reach (the plan says so itself), the queue-row file for DoD #6, and the live behaviour of `--append-notes`. I did not run any test or the backlog CLI.

## Checked and clean
- **No mobile change.** `git diff --stat 492ef72c7 HEAD -- mobile` is empty, so the plan's mobile line numbers hold.
- **The failing line.** `lotForm.test.ts:71` is `{ ...form(true), extra: 1 } }).success).toBe(false)`. Both outputs fail at `:71:115`, as the plan says.
- **Fixtures and case spans.** `base` is at :18, `form` at :19, the "parses" case at :63-67 and the "refuses" case at :68-72. The enum refusals are at :69-70.
- **The schema.** `ParcelLotFormSchema` is a plain `z.object` at schemas.ts:425-429, the dated note is at :423-424, and `lotForm: ...nullable().optional()` is at :440. The moved line will parse.
- **Doc cites.**
  - `08_agents.md:496` holds "Every lock is proven in BOTH directions".
  - `137_mcqueue.md:98` is Rule 3, the status line in the same commit.
  - task-450 `:314` holds the close-out with the hook caveat.
- **The run command.**
  - `mobile/node_modules` is a symlink to `~/Buildo/mobile/node_modules`, and `.bin/jest` resolves there.
  - `jest-expo` is the preset, and `test:ci` is `jest --coverage --ci` (package.json:11).
  - `.gitignore:12` is `/coverage` only, and `mobile/coverage` does not exist now.
  - The two named test files import only `@/lib/schemas` and `@/lib/lotForm`. The symlink target has no `@testing-library` or `tailwind-merge`, so only the other 12 suites fail to start, which matches the plan.
  - So `npx jest __tests__/lotForm.test.ts __tests__/schemas.test.ts --ci --coverage=false` from `mobile/` works for those two files.
- **The backlog CLI.** `node_modules/.bin/backlog` exists at the repo root, and 11 backlog task files already use `backlog task edit ... --append-notes`.
- **Files line against the steps.** The edits touch only `lotForm.test.ts`. The notes go through the CLI and the queue row sits in the same commit, which §7 and QUESTIONS-RULED already settle.
- **No unlisted caller or pin.**
  - The grep for `ConsumerParcelLookupResultSchema` in `mobile/__tests__` finds only the three files the plan lists.
  - The descriptors cite `lotForm.test.ts` by file name only, so no line pin moves.
  - The moved line is net-zero for line numbers.
- **Not repeated.** The ruled items (8.1 A, 8.2 B, 8.3, the coverage pin and the stale docs cites) are left alone.

## in#1 LOW: the expected full-run delta in section 4 is stale against the newer full local run
Plan: §4, "The expected full-run delta is 723 tests with 0 failed; the 13 failed suites drop to 12 ... 45 of 58 suites ran at 5af0f7be2, and the 12 that cannot start are unproven here". The same figures are carried in §5 and §6.

Evidence: `phone-full-0ab1aed72.out` ends with `Test Suites: 1 failed, 57 passed, 58 total` and `Tests: 1 failed, 865 passed, 866 total`. The only failure is `lotForm.test.ts:71:115`. `phone-5af0f7be2.out:448-449` has `13 failed, 45 passed, 58 total` and `1 failed, 722 passed, 723 total`. `0ab1aed72` is a board docs commit, and `git diff --stat 492ef72c7 0ab1aed72 -- mobile` is empty, so both runs read the same mobile code. The full run was on a checkout that has the packages. The worktree symlink target `~/Buildo/mobile/node_modules` still lacks them.

Why it matters: a lane run from this worktree will not reproduce 866, and one run elsewhere will not reproduce "13 drop to 12". The lane would compare against the wrong numbers. The newer file also settles the "unproven" worry. All 58 files run, and `lotForm.test.ts:71` is the only red. That backs AC2 by execution, not only by the section 5 reading.

Fix: in §4, replace the delta sentence with this. "The full run on a checkout with the packages (phone-full-0ab1aed72.out) is 1 failed suite (lotForm.test.ts:71), 57 passed, 866 tests. After the edit it should be 0 failed, 866 tests. A run from this worktree's symlinked node_modules still cannot start the 12 suites, so the two-file command is its proof." Add the sentence "phone-full-0ab1aed72.out shows no other red" to §5.

STATUS: 1 finding (0 CRITICAL, 0 HIGH, 0 MED, 1 LOW, 0 NIT); the edit and the two-file run command are sound, but the full-run numbers in §4 predate phone-full-0ab1aed72.out.
