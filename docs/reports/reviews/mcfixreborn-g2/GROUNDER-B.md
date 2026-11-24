Grounder: Cairn-Ground-G2B
Ruled: out-engineering-eng-all-p1.txt sha256:66fdc7552b91 findings:6
Ruled: out-engineering-eng-all-p2.txt sha256:ed0e6f2da5f1 findings:4
Ruled: out-engineering-eng-all-p3.txt sha256:6388634e1977 findings:5
Ruled: out-engineering-eng-back.txt sha256:a0283ffd39dc findings:1
Ruled: out-engineering-eng-shared-p1.txt sha256:b2b577129e78 findings:6
Ruled: out-engineering-eng-shared-p2.txt sha256:358d5c545c4c findings:5
Ruled: out-code-review-p1.txt sha256:7ecd006ef52a findings:6
Ruled: out-code-review-p2.txt sha256:a0d1952cfc5d findings:7
Ruled: out-code-review-p3.txt sha256:0421fa479dff findings:7
Ruled: out-error-paths-p1.txt sha256:b3df2dca8e75 findings:6
Ruled: out-error-paths-p2.txt sha256:4a646203d3a6 findings:6
Ruled: out-error-paths-p3.txt sha256:4db0e2188b24 findings:8
Ruled: out-security-p1.txt sha256:512017a78771 findings:2
Ruled: out-security-p2.txt sha256:69284b913069 findings:4
Ruled: out-ux-p1.txt sha256:e79de509e63e findings:5
(78 findings: 3 HIGH-rated, 31 MED, 44 LOW/NIT. Working tree HEAD is 8dba70e8e. Finding ids below drop ".txt", as in FINDINGS.tsv.)

NOTE ON THE BRIEF: the severity column in FINDINGS.tsv has 3 HIGH (eng-all-p2#1, eng-all-p3#1, error-paths-p3#1). out-security-p1#1 is rated MED and out-security-p1#2 is rated LOW. I ruled both anyway. MD has no line carrying the id "RR-0170"; MD:738 is the ONE-13 a lot-size ruling line. The web-switch rulings I found are cited under the security rows.

2. TABLE OF HIGH/MED
id | sev | verdict | reason
code-review-p2#1 | MED | REFUTED | The test calls a local wrapper (admin-report-preview-live.logic.test.ts:29, :101). A null from the formatter makes the test throw and fail. Only the message is less clear; nothing passes wrongly.
eng-all-p1#1 | MED | DUPLICATE of eng-all-p2#1 | §5.1 typed factories. The admin test types its stamp and rows with LotStamp/StoredRow; same rule, same ruling.
eng-all-p1#2 | MED | REFUTED | §5.5 layer. Infra tests for the lookup route exist (consumer-parcel-lookup.infra.test.ts, parcel-lookup-gate.infra.test.ts). The L3/L6 block runs in the default run either way, so it is a file-name question, not a missing proof.
eng-all-p1#3 | MED | REFUTED-BY-RULING | task-372 card lines 65-67: operator "Let the grounder resolve them all..." (MD:1476). Grounder ruling: no DB mirror migration is owed; the seed loader inserts the two keys at the next npm run migrate. The stale "owed" wording is still in the files (see D3).
eng-all-p2#1 | HIGH | CONFIRMED (conformity, not HIGH-class) | customer-report-read.logic.test.ts:77-78 builds PARCEL_ROW and STAMP as untyped literals. §5.1 text: "Never write untyped inline mocks ... MUST always import typed factories from src/tests/factories.ts". The file imports no factories. See D4.
eng-all-p2#2 | MED | REFUTED | The route is wrapped in withApiEnvelope (route.ts:62). It returns a fixed 'An unexpected error occurred' / 'A database error occurred' (with-api-envelope.ts:25,42-49). with-api-envelope.logic.test.ts:46,55,78 asserts no leak. §2.1 is also written for .infra tests.
eng-all-p2#3 | MED | DUPLICATE of eng-all-p1#2 | Same layer-naming claim.
eng-all-p3#1 | HIGH | REFUTED | Migration 309 (MB-31, c66fd6b78) is not a G2 file. The index is partial and its comment (309:52-56) states about 5 to 16 MB. §3.1 says "should ... when applicable". The repo's own gate lists large tables and excludes parcels (validate-migration.js:33, :254), so it passes. The test only pins the text of an existing migration. Caveat: parcels' production row count and whether 309 is applied in production are not checked (UNVERIFIED).
eng-all-p3#2 | MED | CONFIRMED (gap outside G2) | §12.10 says a new CHECK needs a *.db.test.ts. I checked: src/tests/db has no file naming parcel_maxbld_scenarios or gain_reasons (ls and grep). The gap is in migration 309's coverage, not in a G2 file. See D5.
eng-all-p3#3 | MED | NOT-APPLICABLE | The `!` is in a test file. The §2.3 mirror test (non-null-assertion-comment.logic.test.ts:14, SCOPE) excludes src/tests/** by design (task-441, RR-0385 item 6, MD:1921).
eng-all-p3#4 | MED | DUPLICATE of eng-all-p2#1 | src-sql-ledger.logic.test.ts:51 CATALOG, same §5.1 claim.
eng-all-p3#5 | MED | NOT-APPLICABLE | The file is a golden/loader test. The arithmetic lives in scripts/lib/compute, not in any G2 file. Repo-wide, only 3 property tests exist in src/tests/property. The G2 arithmetic (format.ts) has one: report-sqft-rounding.property.test.ts.
eng-back#1 | MED | DUPLICATE of eng-all-p1#3 | Same claim, same ruling.
eng-shared-p1#1 | MED | CONFIRMED, already known | parcel-lookup.ts has `!` at 176, 183, 185, 226, 228, 229, 266, 306, 333. The §2.3 mirror test pins an undocumented-`!` ceiling of 11 for this file (non-null-assertion-comment.logic.test.ts:67). No new `!` is allowed. See D6.
eng-shared-p1#2 | MED | NOT-APPLICABLE | §10.2 binds "Frontend WFs" during the frontend phase. Tasks 372/395/406 are shared-library and settings-registry work. The seed rows are the settings the task adds; the control-panel parity test requires them.
eng-shared-p1#3 | MED | DUPLICATE of eng-all-p1#3 | Same claim, same ruling.
eng-shared-p2#1 | MED | REFUTED | The page binds lot.size to lot_size_sqm (report-page.json:1813), so readLotFacts copies the column (read-stored.ts:51; PARCEL_SQL selects it; the load-time check at :36-39 enforces it). The flag reads that same column. Latent coupling only, and nothing is broken today.
eng-shared-p2#2 | MED | REFUTED-BY-RULING | MAXBLD_WEB_LIVE is the ruled live switch (maxbld-web.ts:11-22, "O-2 b"). MD:1245 and :1255: LOAD.1 builds "behind the existing switch only"; MD:1403: "C5 RULED (a): when the web switch flips, engine numbers go to every paying user at once, as built". RR-0438 (MD:2254): the public web report page is wired later, at launch (L.7, task-285). §13.5 PostHog flags are not the ruled mechanism here.
error-paths-p1#1 | MED | REFUTED | `switches` is JSON text written by the same core in the same process (jsonText at compute-maxbld-scenarios.js:662). It cannot be invalid. The file header says a core error is a 500, "never read as a miss".
error-paths-p1#2 | MED | REFUTED | report-compute.ts header: "No process cache: config and lookups are read per request" is deliberate. Dark while the switch is false, behind the route's rate limit. It is a load choice, not a correctness defect.
error-paths-p1#3 | MED | CONFIRMED (same defect as security-p1#2) | See D1.
error-paths-p2#1 | MED | REFUTED | The compute writes nothing (report-compute.ts header: "Nothing is written"), so a repeat lookup is a repeat read, not a duplicate write.
error-paths-p2#2 | MED | REFUTED | guardByDirection (parcel-lookup.ts:197-209) documents "Never empties a non-empty set", acts only on a proven conflict, and is plan-reviewed under task-69. The test name states the behaviour. The map shows each lot's printed address before any number is produced.
error-paths-p2#3 | MED | REFUTED | The meter counts COUNT(DISTINCT subject_key) and `already` (entitlements/index.ts:564). The same parcel is not charged twice.
error-paths-p3#1 | HIGH | CONFIRMED, re-rated LOW | See D2.
error-paths-p3#2 | MED | REFUTED | Untagged is a printed count by design (src-sql-ledger.mjs:36-38, :705-707, :813). The run is labelled PARTIAL.
error-paths-p3#3 | MED | REFUTED | The test at src-sql-ledger.logic.test.ts:320-323 requires r.fresh, which compares the built ledger with the committed one. A deleted or unreadable file makes it stale and red. The pre-commit hook also runs --check (.husky/pre-commit:23).
error-paths-p3#4 | MED | REFUTED | An empty page is the legitimate terminal keyset page, so the unit contract is right (runtime-loader.logic.test.ts:212-215). Any count-versus-records check belongs to the runner (scripts/lib/step/index.js:3456), outside G2.
security-p1#1 | MED | REFUTED-BY-RULING | The gate is the web switch alone by decision: header of report-compute.ts, MD:1245, MD:1403 (C5 RULED a), D-1 (task-348) not ruled, RR-0438 (MD:2254). Auth, entitlement, rate limit and meter stay in the route (lookup-flow.ts:7-9, RR-0331 MD:1432). The switch is a constant pinned false (maxbld-web.ts:22) and the entry returns before any read.
security-p2#1 | MED | REFUTED | There is no barrel: src/lib/admin has no index file. The substring /report-preview-live/ catches every alias and relative import path. src/app outside the admin area is fenced, and the customer lib files are fenced separately (customer-report-read test, BAD_IMPORT_IN).
security-p2#2 | MED | REFUTED | All four statements are module constants with $1 (read-stored.ts:36-46). The test at admin-report-preview-live.logic.test.ts:531 asserts static, parameterised SQL and the values array per call (:520-521).
ux-p1#1 | MED | REFUTED | An absent value key renders the ruled dash: core.ts:531 `typeof v === 'string' && v !== '' ? v : dash`.
ux-p1#2 | MED | REFUTED | Fail-closed on an unknown confidence word is deliberate and shows the dash (core.ts:531). The register's words are closed (M-481: high, medium, medium-low, low); the engine cannot emit another. Operator approved the K2 bundle (MD:79-85).
ux-p1#5 | MED | UNDETERMINED | M-481 says confidence "beside each reading"; the page sends one weakest word per option. MD:79-85 approves "confidence" parts but not the "weakest per option" form. What settles it: an operator word on per-option versus per-reading confidence. No code fault.

3. CONFIRMED DEFECTS (deduplicated)
D1. LIKE wildcards unescaped (security-p1#2 LOW, error-paths-p1#3 MED; code-review has no duplicate).
 - File and lines: src/lib/admin/parcel-lookup.ts:293 (typeahead `LIKE $1`) with bind at :299 `streetName + '%'`; the unlinked read at :323 and :330. The unlinked read is guarded by `!/[%_]/.test(streetName)` at :318. The typeahead is not.
 - What happens: the query is parameterised ($1), so there is no injection. But parseLinearName (address.ts:41-67) leaves `%` and `_` in streetName. A query like "100 %" (the route allows 3 or more characters) becomes LIKE '%%' with number 100, and returns up to 10 arbitrary parcels numbered 100 as candidates. Exposure is only address and parcel_id (same fields the exact path returns), capped at LIMIT 10, and a report is metered only when a lot is picked. Impact is a wrong candidate set, so it is LOW. The code comment at :316-317 calls the typeahead escape "a follow-up card". I found no card for it in backlog or review_followups.
 - Smallest fix: at :299 and :330 use `streetName.replace(/[\\%_]/g, '\\$&') + '%'`. Postgres LIKE uses backslash as its default escape, so no SQL text change. Add one case to search-parser-guard.logic.test.ts.
 - Owner: the typeahead is from Spec 89 (4b1712fff). The consumer route reaches it through MF-53 / task-318 SRCH.ROUTE; I could not confirm the owner from the `Task:` trailers, so treat task-318 as a best guess. Size: line-size.
D2. `--confirm` reports green on a missing trace directory (error-paths-p3#1, rated HIGH, real impact LOW).
 - File and lines: scripts/analysis/src-sql-ledger.mjs:669-675 (readdir failure returns [], documented at :665-666), and main at :805-816. A mistyped directory prints "0 confirmed, 0 dynamic, 0 untagged" and exits 0, because only `rows` drives the exit code.
 - Why re-rated: `--confirm` is a manual, labelled-PARTIAL diagnostic. The pre-commit hook runs only --check, and nothing reads the confirm exit code. The test line (src-sql-ledger.logic.test.ts:308) locks the documented reader behaviour.
 - Smallest fix: in main after :810, if `readRecordedStatements(dir).length === 0`, write "no recorded statements in <dir>" to stderr and `return 1`. Leave the reader and its test alone.
 - Owner: code from 6de9d6a09 (spec 122), before G2; the changed part of the file is task-266. Size: line-size.
D3. Stale "owed migration" text contradicts the ruling in D-refuted rows eng-all-p1#3, eng-back#1 and eng-shared-p1#3.
 - Files and lines: scripts/seeds/logic_variables.json:8197 and :8207 ("The DB mirror row (a migration, number to be claimed) is owed for admin visibility; nothing reads it."), and src/tests/control-panel.logic.test.ts:268 ("the DB mirror migration is owed"). The task-372 card (:67) says these are "corrected under task-367's fix round or task-343". Neither card names it (grep of both cards for the key names found nothing). Not yet done.
 - Smallest fix: replace the sentence with "No DB mirror row is owed: the seed loader inserts the key at the next npm run migrate (task-372, MD:1476)", and delete the comment text at control-panel:268. Regenerate whatever the seed-description change moves, with the --check generators.
 - Owner: task-372. Size: line-size, but the seed edit may move generated pins, so it needs the lane's hooks run.
D4. §5.1 typed factories (eng-all-p2#1; also eng-all-p1#1 and eng-all-p3#4).
 - Files: customer-report-read.logic.test.ts:77-78 and the row()/E/W builders; src-sql-ledger.logic.test.ts:51 CATALOG. createMockParcel exists (factories.ts:354) but fits a full Parcel, not these partial pg rows or the scripted-pool answers.
 - Wider picture: only 13 of 622 logic tests import factories. The admin test types its stamp and rows with production types.
 - Verdict: the rule's words are literally unmet in these files, but this is a conformity gap and not a defect. NEEDS A DECISION: either add typed builders for the scripted row shapes, or rule that §5.1 does not reach scripted-pool fixtures. Not line-size if builders are added. Owner: tasks 123 and 266 for the first file; the ledger file was created before the G2 tasks.
D5. §12.10 missing real-DB test for migration 309's two CHECK constraints (eng-all-p3#2).
 - Evidence: migrations/309_parcel_maxbld_scenarios.sql (CHECK value_iff_computed and one more); src/tests/db contains only enrich-parcels-scenarios.db.test.ts for scenarios. No match for parcel_maxbld in src/tests/db or scripts/tests.
 - Owner: MB-31, not a G2 task. The G2 test (runtime-loader.logic.test.ts:152) only pins text. Route to a card; needs a decision on Docker-backed tests and is more than line-size. Not found as already known in MD, the backlog or review_followups.
D6. §2.3 undocumented `!` in parcel-lookup.ts (eng-shared-p1#1).
 - Already known and pinned: non-null-assertion-comment.logic.test.ts:67 caps this file at 11. The exact current count is not run (see UNVERIFIED). Fix per pin policy: write a one-line why-comment on or above each `!`. Line-size. Owners: task-69 and task-333 for the added code, task-441 for the pin. No new fix task is needed beyond the existing ceiling.

4. LOW / NIT, recorded
code-review-p1#1,#2,#3,#4,#5,#6; code-review-p2#2,#3,#4,#5,#6,#7; code-review-p3#1,#2,#3,#4,#5,#6,#7; eng-all-p1#4,#5,#6; eng-all-p2#4; eng-shared-p1#4,#5,#6; eng-shared-p2#3,#4,#5; error-paths-p1#4,#5,#6; error-paths-p2#4,#5,#6; error-paths-p3#5,#6,#7,#8; security-p2#3,#4; ux-p1#3,#4. That is 42. Add security-p1#2, which is not recorded-only: it is the CONFIRMED defect D1. Total 44 LOW/NIT.
Notes, not mis-ratings:
 - code-review-p1#3 is the same claim as error-paths-p1#1 and is REFUTED the same way (no HIGH-class mis-rating).
 - eng-shared-p2#4 and eng-all-p1#4 (no property test on rounding): REFUTED in passing, report-sqft-rounding.property.test.ts exists (G2 file).
 - error-paths-p5 and p1#5 (no catch in report-page.ts): the route's withApiEnvelope logs and returns 500.
 - No LOW or NIT is a HIGH-class defect on its face. security-p1#2 is the only one with an effect, and it is real but LOW.

5. TOTALS (34 HIGH/MED rows)
Confirmed 5 (D1 via error-paths-p1#3, D2, D4, D5, D6; D3 is a residual raised by refuted rows and security-p1#2 is the LOW twin of D1). Refuted 20 (3 of these by ruling: eng-all-p1#3, eng-shared-p2#2, security-p1#1). Not-applicable 3. Duplicate 5. Undetermined 1.
Confirmed with real impact: D1 and D3 (both line-size). D2 is a LOW-impact line-size fix. D4 and D5 need decisions. D6 is known and pinned.

6. UNVERIFIED
 - No test was run. Every claim was settled by reading code and the standard, plus print-only greps.
 - Exact undocumented-`!` count in parcel-lookup.ts against the pin of 11: not computed.
 - Production state of migration 309 and parcels row count: not checked.
 - The owner of the typeahead LIKE for D1 (task-318) is a best guess, not read from trailers.
 - Whether task-367 or task-343 later pick up D3: not found by grep of those cards.

### Critical Files for Implementation
- /Users/brettpreston_macmini/Buildo-wt-board/src/lib/admin/parcel-lookup.ts
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/analysis/src-sql-ledger.mjs
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/seeds/logic_variables.json
- /Users/brettpreston_macmini/Buildo-wt-board/src/tests/control-panel.logic.test.ts
- /Users/brettpreston_macmini/Buildo-wt-board/src/tests/customer-report-read.logic.test.ts
