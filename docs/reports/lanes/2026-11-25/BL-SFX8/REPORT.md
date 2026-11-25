# BL-SFX8 · task-456 SEARCHFIX.8 · REPORT (stage: work landed, STATION OWED)

Status line (Spec 137 rule 3): task-456 RUNNING · work commits landed on wf2/sfx8 · station owed (RR-0467) before the output review · output review NOT run.

## Commits (wf2/sfx8, base 8abc92777)
- 2606cb7ab plan steps 3-9: X6 NAV-1 lock reads && / || chains plus the sign-up disclosure entry (RR-0478); R5 dated notes (nav-by-route, search-follow-ups); X4 massing and slice-number property tests; N3 parcel-routes.security.test.ts; D2 src-sql-ledger.mjs --confirm returns 1 with "no recorded statements in <dir>"; D4 typed builders in factories.ts. Trailers Task: task-456, McFrontend-Task: MF-53.
- 5580aaa76 plan steps 1-2: X2 smoke renders reports_left; X5 gate row for the held unsure lot.
- f7498e8c5 plan step 10: src/tests/db/migration-309-parcel-maxbld-scenarios.db.test.ts (written, NOT run).
- 5e4d68bc1 the launch context docs/reports/reviews/task-456/context-r2.md committed, as the brief asks.

## Evidence
- red-web.out (sha256 2050294bcb23...): a commit attempt with only the tests and the task file staged, plus temporary unstaged source edits (geometry.ts cap removed and ft as Math.round; sliceConfig.ts clamp to Math.max(b.min, v); entitlement route session bypass and the uid read from ?uid). Refused by the pre-commit related run: exactly the 10 named cases failed (2 security entitlement, 3 NAV-1 chain cases, 2 massing, 1 slice-number, 2 ledger --confirm); 1101 passed. Sources restored from copies; `git diff --exit-code` on the three files exit 0 (line appended to red-web.out).
- green-web.out (sha256 598622186421...): commit 2606cb7ab hook tail: 21 files passed, 2 skipped; 1111 tests passed, 29 skipped, 0 failed.
- commit-db.out: f7498e8c5 hook tail: the new db file collected and skipped (10 skipped), no DATABASE_URL in the environment.
- D4 proof: `git show 2606cb7ab` changes no `it(` or `expect(` line in customer-report-read.logic.test.ts (grep exit 1); 39 `it(` lines remain; no removed it/expect line in src-sql-ledger.logic.test.ts.
- Migration 309: `git diff 8abc92777..HEAD -- migrations/` is empty. The only non-test source change is scripts/analysis/src-sql-ledger.mjs.
- Typecheck (root and phone) pass.

## Deviations from the plan (all named)
1. Step 7 red: deleting `if (!ctx) return unauthorized();` would not typecheck (ctx.uid on a nullable), so the red edit replaced the context with a typed fallback `{ uid: 'anonymous' }`, which has the same effect (a no-session request is served). Recorded in the task notes.
2. Commit-message format: the first green attempt was refused by validate-commit-msg (scope must be a spec id), then by the McFrontend commit gate: "FAIL:C:no-mf-task" and "FAIL:P:no-record" (nav-by-route and search-follow-ups are frontend paths in the policy). The landed commit carries `McFrontend-Task: MF-53`, following the earlier commits on these two files (task-451 04c181564, task-336 56e96eed5); docs/reports/panels/MF-53.json exists. This is an orchestrator-visible choice of trailer; flag it to the grounder.
3. Plan step 4 title: the describe title was changed to "GAP.13: fingerprints follow the content files" with the prior title kept in a dated comment (the GROUNDER-C D5 wording).

## NOT verified (UNVERIFIED)
- Phone tests (steps 1-2): red and green not run by the lane (rule 18; outside the related run). For the station: red edits are removing `...reportsLeft(s),` at mobile/src/components/surfaces/SearchBinding.tsx:238 and `!ask` to `!(ask && isFetching)` at mobile/app/(app)/parcel-tool/[parcelId].tsx:34. Whether the reports_left line text is found by getByText as one string (GROUNDER-A.md:131) is UNVERIFIED.
- Migration 309 db test: written, NOT run (no database connection by the lane). The orchestrator runs it in a throwaway container (RR-0475 item 4, MORNING-DECISIONS.md:2481) with `env -u DATABASE_URL -u BUILDO_TEST_DB_EXTERNAL npx cross-env BUILDO_TEST_DB=1 <runner> run src/tests/db/migration-309-parcel-maxbld-scenarios.db.test.ts --no-file-parallelism`. AC #4 stays open until db-green.out. The parcels seed insert (parcel_id, feature_type, geometry, geom, lot_size_sqm) follows enrich-parcels-scenarios.db.test.ts; other NOT NULL parcels columns are UNVERIFIED against the container schema.
- The full station suite (RR-0467: runs before the output review).
- The "queue row" half of DoD #6: only the task file was updated through the CLI; no queue row edit was made.

## Not done (by instruction)
- Output review lens, FINDINGS.md, GROUNDER: held until the orchestrator sends the station result (RR-0467).
- No push, no database connection, no suite run, no test runner call.

## Tree
- `git status --short`: only `?? mobile/node_modules`.

## Station and output review round 1 (2026-11-25)
- STATION PASS on 5e4d68bc1 (~/Buildo-scratch/push-station/pass/5e4d68bc1af5ea71a644e463ea8acffad67199ce.pass): 28,397 passed, 0 failed; phone tests and both typechecks rc=0, so the two new phone cases are green; their red runs remain unseen. Recorded in a task note.
- Review context context-r3.md (backlog-brief.mjs, this round). Whole diff 8abc92777..5e4d68bc1 over the Files line (12 files, 50,069 bytes), one part: in-out-code-review-p1.txt (rule-lists.mjs lens-input), out-code-review-p1.txt (deepseek-review.js, lens-code-review.md, the five sections).
- Findings (rule-lists.mjs findings): 7 = 2 MED, 4 LOW, 1 NIT; 0 CRITICAL, 0 HIGH. Listed in FINDINGS.md. Not triaged, not fixed: GROUNDER OWED (a separate grounder rules them).
- No compliance or engineering lens for this task (every list is output_off).
- The migration 309 db test is still to be run by the orchestrator in a throwaway container; AC #4 stays open.
