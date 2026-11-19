# REPORT: BL-R10 (task-316, Increment 1·B validation pass, milestone m-1)

Status line (Spec 137 rule 3): BL-R10 lane · task-316 (R10) · Increment 1·B validation pass, record-only: one docs commit d849925a6 through the real hooks in ~/Buildo-wt-r10 (branch wf2/inc1b-r10); no code, no push, no DB, no test run (docs-only change; nothing to run).

## 0. Bottom line
- 1·B holds 7 live tasks plus 1 dropped (LOAD.3), but the plan has 12 group S items: five were DRAFTS, not board tasks (LOAD.4, SRCH.A6, SRCH.C12, SRCH.ROUTE, SRCH.SEMI). Promoted into m-1 as task-317 to task-321 (commit d849925a6: "5 R" renames in the diff). RR-0179 "Add it as a task" and RR-0182 name them.
- One real gap by grep: no task or queue row carries the Daylight restyle of the built search pages (doc-2 says all old dark): created task-322 SRCH.DAYLIGHT.
- Dependencies fixed: task-68 (dropped task-65 removed), task-268 (six content tasks added), task-209 (7.25 now follows task-319). task-319 now depends on task-318; task-321 on task-15 (LS.6).
- Semi placeholder = task-319 SRCH.SEMI (RR-0182, RR-0184 place the semi question page on the search flow). Its scope is split across three homes: raised as OPERATOR task-323 with Grounded and Recommendation.
- Three OPERATOR tasks: task-323 (semi scope), task-324 (E.2 web footer), task-325 (LOAD.1 waits for ST.P1 at push 12).
- Review round r1: 29 findings, triaged in TRIAGE.md (KEPT items folded; 5 generator defects went into one draft).

## 1. Tasks: outcome, dependencies before and after
| task | plan id | outcome | deps before | deps after | cite |
|---|---|---|---|---|---|
| task-12 | GAP.13 | KEPT, scope note | none | none | search-1b-adj/REPORT.md section 4 (parts a to g); RR-0172; MORNING-DECISIONS.md:774 |
| task-266 | LOAD.1 | KEPT | 123, 265 | 123, 265 | storage-policy planNote "dependsOn 1.3,ST.P1"; task-265 "landingPush: push 12" -> OPERATOR task-325 |
| task-267 | LOAD.2 | KEPT | 266 | 266 | label dep-dropped; RR-0176 (decision-43) |
| task-13 | LOAD.3 | KEPT, DROPPED | none | none | decision-43; grep TASK-13: no dependents |
| task-68 | PROOF.TOOL | dependency fixed | 62, 65, 66, 67 | 62, 66, 67 | task-65 DROPPED (decision-69); 66 BUILT; 67 LATER |
| task-268 | PROOF.S | dependency fixed | 12, 69, 267, 68 | 12, 69, 267, 68, 317, 318, 319, 320, 321, 322 | AUDIT.md:159 |
| task-69 | 1.4 | KEPT | 62 | 62 | src/lib/parcels/address.ts:39; fe-built/BUILT.md:55; RR-0166 |
| task-14 | LS.11 | KEPT, ref #L453 added | none | none | queue :453 "MF-53 now landed"; RR-0170, RR-0180 |
| task-317 | LOAD.4 | promoted | DRAFT dep task-267 | 267 | RR-0179 |
| task-318 | SRCH.ROUTE | promoted | none | none | RR-0182 |
| task-319 | SRCH.SEMI | promoted (placeholder) | DRAFT-3 | 318 | RR-0182, RR-0184 |
| task-320 | SRCH.A6 | promoted | 71 | 71 | RR-0182 |
| task-321 | SRCH.C12 | promoted | none | 15 | RR-0182; LS.6 supplies the support inbox |
| task-322 | SRCH.DAYLIGHT | created (gap) | - | none | open-questions.md:1098, :1100 |
| task-209 | 7.25 (m-9) | dependency fixed | 160, 97, 122, 137, 138, 208, 123 | + 319 | its plan text "MF-89 input and the answer storage + report link move to SRCH.SEMI" |
| task-323, 324, 325 | OPERATOR | created | - | none | see section 4 |
`backlog doctor`: "No duplicate IDs, self-referential dependencies, or dependency cycles found." after the edits.

Dependency chain verified: to the report increment: 267 -> 266 -> 123 (1.3 W, m-3) -> 122 (6c.8a) -> 62 (push 6, m-7) and 266 -> 265 (ST.P1, m-13). To 1·A: 68 -> 66 (CHK.5 BUILT, m-0), 67 (CHK.6 LATER, m-0).

## 2. McFrontend field map (doc-2 Elements, 65 rows)
Every id has a task, a DONE or built MF row with no work owed, or is listed. Gaps: E.2 (task-324), B.3 removed by the design (no work), and the load-failure page has no element id in doc-2 (task-317).
| id | element | built | deliverers in doc-2 | task / row |
|---|---|---|---|---|
| A.1 | A Search page · Brand block: MaxBLD wordmark with the taglin | BUILT | GAP.13 | task-12 |
| A.2 | A Search page · Search box: one pill, placeholder Enter lot  | BUILT | - | none needed (B.3 removed by the design) |
| A.3 | A Search page · Typeahead resolution of the typed text (stre | BUILT | - | none needed (B.3 removed by the design) |
| A.4 | A Search page · Typed street direction (E/W/N/S) kept in the | NOT BUILT | 1.4 | task-69 |
| A.5 | A Search page · Unit number typed after the address | NOT BUILT | 1.4 | task-69 |
| A.6 | A Search page · Reports-left line under the box: 6 of 10 rep | NOT BUILT | SRCH.A6 LS.12 LS.3 | task-320 SRCH.A6; task-287 (m-2); task-271 (m-2) |
| A.7 | A Search page · Recent searches: up to 3 chips under the box | BUILT | - | none needed (B.3 removed by the design) |
| A.8 | A Search page · Searching state: query in the box, the word  | BUILT | - | none needed (B.3 removed by the design) |
| A.9 | A Search page · Outside Toronto state: Lots are only availab | BUILT | - | none needed (B.3 removed by the design) |
| A.10 | A Search page · Legal line: This is an estimate, not 100% ac | BUILT | LS.6 | task-15 (m-2) |
| A.11 | A Search page · Clear (x) button inside the box | NOT BUILT | GAP.13 | task-12 |
| A.12 | A Search page · Bottom tab bar: Lookup, Tracked Lots, Accoun | BUILT | MF-49 | row MF-49 (task-313) |
| A.13 | A Search page · In-bar Account button (MF-35 builds it amber | BUILT | - | none needed (B.3 removed by the design) |
| B.1 | B Address confusion · Candidate list (text_candidates): radi | BUILT | - | none needed (B.3 removed by the design) |
| B.2 | B Address confusion · Select button after the pick (Select,  | BUILT | - | none needed (B.3 removed by the design) |
| B.3 | B Address confusion · Candidate row area line (locality, e.g | NOT BUILT | - | none needed (B.3 removed by the design) |
| B.4 | B Address confusion · Needs-more-info notice: That looks lik | BUILT | - | none needed (B.3 removed by the design) |
| B.5 | B Address confusion · Needs-more-info notice: Many lots at t | BUILT | - | none needed (B.3 removed by the design) |
| B.6 | B Address confusion · Gentle error: No lot linked yet. We fo | BUILT | - | none needed (B.3 removed by the design) |
| B.7 | B Address confusion · Link: Get help with an address (to /he | BUILT-NO-DATA | SRCH.C12 LS.12 LS.6 | task-321 SRCH.C12; task-287 (m-2); task-15 (m-2) |
| B.8 | B Address confusion · Faint tappable neighbour outlines on t | BUILT | - | none needed (B.3 removed by the design) |
| B.9 | B Address confusion · No-match state: No parcel found for th | BUILT | - | none needed (B.3 removed by the design) |
| B.10 | B Address confusion · Intersection on the map (corner lots a | NOT BUILT | LS.11 | task-14 |
| C.1 | C Lot confusion (lot map) · Heading: This address covers 2 l | NOT BUILT | GAP.13 | task-12 |
| C.2 | C Lot confusion (lot map) · Search pill on top (clear return | BUILT | MF-53 | row MF-53 DONE |
| C.3 | C Lot confusion (lot map) · Map: each matched lot outlined ( | BUILT | - | none needed (B.3 removed by the design) |
| C.4 | C Lot confusion (lot map) · Lettered lot markers (A, B) at t | BUILT | - | none needed (B.3 removed by the design) |
| C.5 | C Lot confusion (lot map) · Building footprint on each lot ( | NOT BUILT | GAP.13 | task-12 |
| C.6 | C Lot confusion (lot map) · Address pin and the street name  | BUILT | GAP.13 | task-12 |
| C.7 | C Lot confusion (lot map) · Lot card line: Lot A · has the h | NOT BUILT | GAP.13 | task-12 |
| C.8 | C Lot confusion (lot map) · Lot card size line: 1,614 sq ft  | BUILT | - | none needed (B.3 removed by the design) |
| C.9 | C Lot confusion (lot map) · Lot card frontage and zoning str | BUILT | - | none needed (B.3 removed by the design) |
| C.10 | C Lot confusion (lot map) · Selection shared by map tap and  | BUILT | GAP.13 | task-12 |
| C.11 | C Lot confusion (lot map) · Button: Choose a lot (disabled)  | BUILT | - | none needed (B.3 removed by the design) |
| C.12 | C Lot confusion (lot map) · Link: Not sure which lot? Get he | NOT BUILT | SRCH.C12 LS.12 LS.6 | task-321 SRCH.C12; task-287 (m-2); task-15 (m-2) |
| C.13 | C Lot confusion (lot map) · Loading, error, rate-limit, enti | BUILT | - | none needed (B.3 removed by the design) |
| C.14 | C Lot confusion (lot map) · Routing: one printed address ove | BUILT | - | none needed (B.3 removed by the design) |
| D.1 | D Semi question page · Page shown only when the lot is unsur | BUILT | - | none needed (B.3 removed by the design) |
| D.2 | D Semi question page · Lot form on the lookup hit (detected, | BUILT | - | none needed (B.3 removed by the design) |
| D.3 | D Semi question page · Question: Is this house one half of a | BUILT | - | none needed (B.3 removed by the design) |
| D.4 | D Semi question page · Three answers: Yes, it is one half of | BUILT | - | none needed (B.3 removed by the design) |
| D.5 | D Semi question page · Continue button (Choose an answer whe | BUILT | - | none needed (B.3 removed by the design) |
| D.6 | D Semi question page · Back to search link | BUILT | - | none needed (B.3 removed by the design) |
| D.7 | D Semi question page · Question-page states: loading, error, | BUILT | - | none needed (B.3 removed by the design) |
| D.8 | D Semi question page · Owner answer stored (a reopened lot d | BUILT-NO-DATA | GAP.12 | task-213 (m-9) |
| D.9 | D Semi question page · Input: distance from your wall to the | NOT BUILT | SRCH.SEMI MF-89 7.25 GAP.12 | task-319 SRCH.SEMI; row MF-89 WAITS (SRCH.SEMI, task-209); task-209 (m-9); task-213 (m-9) |
| D.10 | D Semi question page · Semi override applied in the report | NOT BUILT | SRCH.SEMI 7.25 | task-319 SRCH.SEMI; task-209 (m-9) |
| D.11 | D Semi question page · Evidence columns linked_parcel_count, | BUILT-NO-DATA | - | none needed (B.3 removed by the design) |
| E.1 | E Web search pages · W4 web search page: the same parts unde | BUILT-NO-DATA | LS.12 1.3 | task-287 (m-2); task-123 (m-3) |
| E.2 | E Web search pages · Web footer: legal line, Terms of Servic | NOT BUILT | MF-44 MF-46 | row MF-44 DONE; row MF-46 DONE |
| E.3 | E Web search pages · W5 choose your parcel on the web, addre | NOT BUILT | LS.12 | task-287 (m-2) |
| E.4 | E Web search pages · W5 on the web for several lots, no lot  | NOT BUILT | LS.11 | task-14 |
| E.5 | E Web search pages · W6 web report route /parcel-tool/{lot} | BUILT-NO-DATA | LS.12 1.3 MB-44 | task-287 (m-2); task-123 (m-3); task-123 (1.3 = MB-44 W, m-3) |
| E.6 | E Web search pages · Recent-search chips on the web frame | NOT BUILT | LS.11 | task-14 |
| F.1 | F Landing (search entry and sample) · Hero call to action: S | BUILT | MF-76 | row MF-76 DONE |
| F.2 | F Landing (search entry and sample) · How it works step 1: E | BUILT | MF-76 | row MF-76 DONE |
| F.3 | F Landing (search entry and sample) · Sample frame: the proc | BUILT | LS.7 | task-16 (m-2) |
| F.4 | F Landing (search entry and sample) · Landing legal line | BUILT | LS.6 | task-15 (m-2) |
| F.5 | F Landing (search entry and sample) · After login the user l | BUILT | - | none needed (B.3 removed by the design) |
| G.1 | G Hand-off to the report · Unique match goes straight to the | BUILT | - | none needed (B.3 removed by the design) |
| G.2 | G Hand-off to the report · Processing screen after the lot i | BUILT-NO-DATA | 1.3 MF-62 | task-123 (m-3); row MF-62 DONE (follow-up via LOAD.2) |
| G.3 | G Hand-off to the report · Ready line: The Building Possibil | BUILT | MF-62 | row MF-62 DONE (follow-up via LOAD.2) |
| G.4 | G Hand-off to the report · Skip control during the animation | BUILT | MF-62 | row MF-62 DONE (follow-up via LOAD.2) |
| G.5 | G Hand-off to the report · Report page for the lot on a hit | BUILT-NO-DATA | MB-44 1.3 | task-123 (1.3 = MB-44 W, m-3); task-123 (m-3) |
| G.6 | G Hand-off to the report · Report meter: a hit counts one re | BUILT | LS.12 | task-287 (m-2) |

## 3. McFrontend page tasks and rows (AC3)
Rows are linked by id (RR-0205 "queue rows stay"), not copied; MF-35 (:133), MF-44 (:310), MF-46 (:319), MF-53 (:394), MF-58 (:438), MF-60 (:453), MF-62 (:467), MF-76 (:496), MF-84 (:597), MF-89 (:649), MF-90 (:654) were read: MF-35, MF-44, MF-46, MF-53, MF-58, MF-62, MF-76 are DONE; MF-60, MF-89, MF-90 WAITS; MF-84 WAITS (BUILT, awaiting DB job and push). The board mirrors only MF-08, MF-22 and MF-49 as queue-row tasks; the other rows are referenced from the tasks: task-12 (:133 :394), task-14 (:453 :310 :394), task-267 (:467), task-317 (:467), task-318 (:394 :597), task-319 (:597 :649 :654), task-320 (:133), task-321 (:394 :438), task-322 (:133 :394). Follow-up rows after DONE rows (GAP.13 A and B, LOAD.2, SRCH.DAYLIGHT) are claimed by the build lane in ~/Buildo-scratch/ids (last MF claim MF-90; queue line 5 "Next free id: MF-91"); this pass claimed no id.

## 4. Gaps and OPERATOR tasks
| item | where | outcome |
|---|---|---|
| Daylight restyle of search pages, removals A.13 B.8 C.9 | no task, no row (greps in task-322 description) | task-322 created |
| five S drafts | draft-2, 3, 4, 5, 16 | promoted task-317 to 321 |
| Semi placeholder | RR-0182, RR-0184 place the page on the search flow | task-319 is the placeholder; scope split -> OPERATOR task-323 (store in three homes: task-319 parts 2 and 3, task-213 GAP.12 m-9, MCBYLAWS-QUEUE.md:94 row 6c with operator "5, yes they are - can you add to increment?"); recommendation: page, mock and link only in 1·B (UNVERIFIED) |
| E.2 web footer | doc-2 NOT BUILT, "NO TASK" | OPERATOR task-324, recommendation: gap row on LS.12 (m-2) (UNVERIFIED) |
| LOAD.1 waits for ST.P1 (push 12) | task-265 "landingPush: push 12" | OPERATOR task-325; dependency kept |
| RR-0145 background refresh of tracked lots | grep background / stamp moves / TRK-1 in backlog/tasks: no hit | draft TRK.1 (draft-33, m-13) |
| RR-0144 purge 90 days | task-291 ST.P4 (m-13) | owned, no gap |
| context pack defects (ENOENT, undefined, blank sections) | docs/reports/reviews/task-316/context-2026-11-19.md:164,123,170,177 | draft-34 (backlog-brief.mjs) |
| Decisions section on every milestone | AC6 | draft-32 (the form only; only m-1 populated) |
Owed, not gaps (plan status "panel + build pass owed", readiness records): LOAD.1, LOAD.2, 1.4, LS.11, PROOF.TOOL, PROOF.S and the five promoted tasks. Panels ran 2026-11-17 on GAP.13 (search-1b, search-1b-adj, search-1b-bp p1 and p2); build-pass p2 seats ran on halves after truncation (search-1b-bp/run2.log), UNVERIFIED completeness of those seat rows.
Stale text found, left as found: doc-16 section 5 row S and the m-1 Storage set-up still name LOAD.3 and a 35 s screen (RR-0176 supersedes).

## 5. Records linked (AC4), matching key
Key: the record names the task's plan id (grep -l of the plan id over ~/Buildo-scratch/lanes-20261117/*/REPORT.md and *.md). Common to every m-1 task: inc-briefs/BRIEFS.md, search-delta/CURRENT-SEARCH.md, holistic-audit/AUDIT.md, readiness/READINESS.md. Specific: task-12: search-1b/p1/SEATS.md, search-1b-adj/REPORT.md, search-1b-bp/q.md, q2.md, p1/SEATS.md, avail-search/SEARCH-AVAILABILITY.md; task-13, 267: search-1b-adj/REPORT.md; task-266, 267: storage-policy/McSTORAGE-POLICY-v2.md, REVIEW.md; task-68, 268: build-approach/REPORT.md; task-69: fe-built/BUILT.md#L55; task-317 to 322: fe-built/BUILT.md.

## 6. m-1 milestone file (AC6)
Sections added, all existing lines kept (diff: 0 removed lines): Problems, Project objectives (five lines with cites), Increment objectives, Rulings (13 lines, RR-0176 marked as superseding RR-0174), Compliance codes in use ("none named": no comp: label on any 1·B task), Decisions (28 lines `- decision-N: <title>`, matched on the "Groups:" and "Tasks named:" lines of backlog/decisions). Existing Objectives, Deliverable, Specs, Storage set-up, Register rulings and Documents sections unchanged. Draft for all milestones: draft-32 (m-0).

## 7. Review round r1
r1-review.txt (29 findings), TRIAGE.md with the opened line for each. KEPT and folded: field map into the context file, Rulings and Problems wording, SRCH.DAYLIGHT acceptance lines, OPERATOR task-325, draft TRK.1, draft backlog-brief.mjs. REJECTED with a cite: severing the ST.P1 dependency, false-DONE rows MF-44/46, promote rollback, count, self-review, ledger contention, PROOF.S split.

## 8. UNVERIFIED
- Recommendations on task-322, 323, 324, 325 and drafts 32, 33, 34: r1 reviewed the plan rows, not the task texts.
- Whether ST.P1 truly needs L.6 (task-325).
- E.2 deliverer attribution to MF-44 and MF-46 (the web code was not opened).
- Task ids task-317 to 325 and draft numbers were taken from this worktree; another lane creating tasks in parallel could collide at merge.
- Completeness of the search-1b-bp p2 seat rows (truncation re-runs).


## 9. Gate
GATE PASS (BL-R10): outputs exist (REPORT.md, r1-review.txt, TRIAGE.md, commit.out), scope clean, snapshot START.snapshot.json (run with --allow-ref-move).

STATUS: ready
