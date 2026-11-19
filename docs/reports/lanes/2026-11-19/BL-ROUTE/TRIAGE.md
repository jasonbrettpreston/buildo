# TRIAGE: r1-plan.txt (plan round, review mode, deepseek-reasoner), lane BL-ROUTE, task-318

Every finding adjudicated against the opened file or line. KEEP = folded into the test/plan; REJECT = reason with cite.

| # | Finding (short) | Verdict | Evidence / action |
|---|---|---|---|
| 1 | CRITICAL red defined as a REPORT sentence | KEEP (in part) | Red will be a real commit-attempt run (red.out). If the first run is green, a real one-line mutation of the routing branch is run through the same hook attempt and captured, then reverted (mutation shown by diff). |
| 2 | CRITICAL no_match pinned green for the mis-typed case | KEEP | Not asserted as desired: the mis-typed case becomes `it.todo` naming the OPERATOR item; current behaviour stays in a comment. Opened parcel-lookup.ts:286 (`resolution: 'no_match'`), SAMPLES.md row 7. |
| 3 | HIGH deriveMatchType excluded by an alias | KEEP (in part) | Opened mobile/src/lib/errors.ts: no imports. The test redirects the one specifier `@/lib/errors` to that file (an import path redirect, no behaviour mocked) so the real deriveMatchType and parcelSearchRoute run. Not a new mock layer on the detector. |
| 4 | HIGH unlinked and intersection absent | KEEP unlinked / REJECT intersection | unlinked added (SAMPLES row 10, 76R Abbott Ave). Intersection: CURRENT-SEARCH.md:239-248 B.10 'the intersection state is a message only', NOT-BUILT, task LS.11: not one of the four cases of task-318; stated out of scope in REPORT. |
| 5 | HIGH SQL-substring mock can match the wrong statement | KEEP (in part) | The test asserts the params of the exact and typeahead reads per case (`['26','KENNETH']`), and an unmatched statement throws. |
| 6 | HIGH "typeahead 0 vs 41 Derw finds" contradiction | REJECT | Opened SAMPLES.md row 7: the typeahead runs on `DERWIN%` (0 rows); the prefix `41 Derw` is a different query the sweep tried. Not contradictory. |
| 7 | HIGH ENOENT blocks in the context (doc-2 label+path) | REJECT (out of scope) | Generator defect of backlog-brief.mjs; reported to the orchestrator in REPORT, not fixed in this lane. |
| 8 | HIGH "undefined" in Storage set-up bullets | REJECT (out of scope) | Same generator, same note. |
| 9 | HIGH report meter / flash before the semi redirect | KEEP as observation, no code | Opened route.ts:161 (openReport call): a `q` hit for a parcel_tool holder calls openReport (meter) before the semi question shows; the meter is one row per new lot per month (not per open). Whether the semi question must precede the charge is a design question: OPERATOR item (no change in this lane). |
| 10 | HIGH semi page writes owner answer from a URL param (D.8) | REJECT | BUILT.md:96 D.8 "BUILT-NO-DATA ... answer carried as a route param; no column or server store"; semiQuestion.ts:7-8 "O-12: no server store". No write exists. |
| 11 | HIGH no D.8 / reopened case; readLotForm null | KEEP (in part) | Answered case already asserted (`semi=answered`); added: no lotForm block (older server / view absent, lot-form.ts 42P01 branch) never asks. |
| 12 | HIGH jest suite not run by the hook | REJECT (out of scope) | Infra freeze (memory: no new infra tasks); the limit is stated in REPORT. |
| 13 | HIGH one generic OUTPUT review, no lens | KEEP | The output review is one lens by the brief ("false routes and fixture realism"); its record path will be named in REPORT. |
| 14 | MED stale 35 s rulings in context | REJECT | Not read by this task; SUPERSEDED markers already appear in the brief. |
| 15 | MED absolute paths in context | REJECT | Generator output; the brief's own `~/` form is kept in my additions. |
| 16 | MED Dependencies (none) | REJECT | task-319 is listed in the task view as a dependent, not a dependency (backlog task view task-318). |
| 17 | MED doc-2 cut at 12 KB | REJECT | Generator cap; I read doc-2 and CURRENT-SEARCH.md in full for the rows used. |
| 18 | MED one commit mixes red test, task, context | REJECT | The brief fixes the commit set ("the test, any routing code, the context file and the task-318 file"). AC1 "committed alone" is reported honestly: the plan is pre-registered before code in the context file and the task plan, not in a separate commit. |
| 19 | MED self-audit miscount of `undefined` | REJECT | Generator text; not this lane. |
| 20 | MED duplicate ruling titles | REJECT | Generator text. |
| 21 | MED import-free / type-only invariants unguarded | REJECT | parcelSearchCore import-freeness is already locked at src/tests/maxbld-web-pages.logic.test.ts:142-147; lotForm uses `import type` (erased). |
| 22 | MED classifyRows cited at two ranges | KEEP | Corrected in the case table: :154-165 is the function, :219 and :253 are its call sites. |
| 23 | MED no generator version in context | REJECT | Generator. |
| 24 | LOW 48-bit sha prefix | REJECT | Generator. |
| 25 | LOW AC #8 N/A | KEEP | AC #8 evidence: MF-53 (.cursor/MCFRONTEND-QUEUE.md:394) and MF-84 (:597) rows exist; the lane adds no McFrontend build. |
| 26 | NIT e2e.logic filename | KEEP | Renamed src/tests/search-routing.logic.test.ts. |
| 27 | NIT "(Recommended)" in quoted words | REJECT | Generator text. |

# TRIAGE: r2-output.txt (output review, one lens: false routes and fixture realism)

| # | Finding (short) | Verdict | Evidence / action |
|---|---|---|---|
| 1 | HIGH BASE tautology / `(app)` segment | REJECT | mobile/src/lib/parcelSearchMatch.ts:226 passes the literal '/(app)/parcel-tool' to parcelSearchPath; the test mirrors that literal. |
| 2 | HIGH substring scrape of [parcelId].tsx | REJECT (known limit) | Stated in the test header; the behaviour lock is mobile/__tests__/semiQuestionPage.behaviour.test.tsx (jest, not run by the hook: UNVERIFIED here). Opened [parcelId].tsx:27-32: the guard and replace are there as asserted. |
| 3 | HIGH asksSemi is a local copy | REJECT | lotForm.ts:24-27 is `data?.lotForm?.unsure === true && semiParam !== SEMI_ANSWERED`; the copy is the same on the data; the module cannot be loaded at root (typecheck TS2307, red.out line of the first attempt). Stated in header. |
| 4 | HIGH parcelSearchRoute not loaded | REJECT | Same reason; header says only parcelSearchPath is under test. |
| 5 | HIGH candidates parcelId not asserted | KEEP | Added. |
| 6 | MED resolveLotMap canned | REJECT | Its SQL and args are pinned in parcel-lookup-resolution.logic.test.ts (header). |
| 7 | MED unlinked params / statement order | REJECT | Order matches the real SQL (NOT EXISTS read is the only one with that fragment). |
| 8 | MED JSON.stringify null vs undefined | REJECT | The params array is built by the route with `num \|\| null`; low risk. |
| 9 | MED pin source unasserted | REJECT | Outside the route decision. |
| 10 | MED parcel row keyed on any id | KEEP | Added: the report read is asserted for the matched lot id (plain case). |
| 11 | MED "older server" title | KEEP | Title renamed to the absent-view case. |
| 12 | MED different addresses counter-case | KEEP | Added (32 Acacia, two printed addresses -> candidates, no map). |
| 13 | MED metering unasserted | REJECT | withTransaction mock throws if called; a meter write would fail the 200 check. |
| 14-18 | LOW/NIT | REJECT | Cosmetic or out of scope (call-index, headers, shared NO_ROWS, monorepo path). |
