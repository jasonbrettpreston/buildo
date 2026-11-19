# REPORT, lane BL-R13, task-339 (R13, Increment 1·B, record-only)
Status line (Spec 137 rule 3): BL-R13 · task-339 · record-only; no code, no push, no DB, no status change of any existing task.

## 1. Rulings entered through G2 (backlog-decision.mjs)
- decision-85 RR-0299 (quote "C12 - is a fake email address until launch", MORNING-DECISIONS.md:1155), dated note on task-321 and task-15.
- decision-86 RR-0300 (quote "Those dependencies are not listed as operator tasks with incra 1b", :1155), dated note on tasks 339, 320, 266, 267, 317, 68, 268.
- decision-87 RR-0298 (quote "you need to run the launch script - do not change the status manually", :1146), dated note on task-339.

## 2. task-321 SRCH.C12 (RR-0299)
Dependency on task-15 removed (`backlog task edit task-321 --clear-deps`; it had only that one). Status unchanged (LATER). Note appended: "Scope now: the help link is built against the placeholder support address until launch (RR-0299); the real address is set at launch by LS.6 (task-15)" with the ground. Ground read from files: migrations/314_maxbld_support_inbox.sql:7 and :15-17 seed logic_variables.maxbld_support_inbox as EMPTY (`""` JSONB, "Seeded EMPTY"), so until a value is set the Help page shows no contact links; src/lib/surfaces/maxbld-support.ts:13 `SUPPORT_INBOX_KEY = 'maxbld_support_inbox'`; the built page reads it: scripts/surfaces/parcel_product/F06/surfaces/web_help.descriptor.json:204. Consequence stated for the build lane: a placeholder value must be set in the variable (a settings write, not a code change) for the link to show; this lane wrote none (no DB).

## 3. The three blockers (OPERATOR tasks in m-1)
### (a) A.6 reports-left line, task-340 (task-320 waits on task-71)
- Issue: the app search page line "6 of 10 reports left until 9 Dec 2026" waits on the web checkout.
- Grounded: yes. GET /api/parcels/entitlement already returns reportsLimit, reportsLeft, reportsLimitReached, resetsOn (src/app/api/parcels/entitlement/route.ts:4-7, types.ts:14-17; readParcelToolUsage src/lib/entitlements/index.ts:631-665); no page reads it (grep readParcelToolUsage|reportsLeft|resetsOn over src, mobile/src, mobile/app, scripts/surfaces: only the route, types, tests, descriptors, census, host-policy); limit setting index.ts:432-436, migrations/322_mf47_checkout_plans.sql:50-61; period end index.ts:538-548, :560; BL-METER REPORT.md:20 (no new field); v8 search.html:267. Correction to the brief: limit reached is 403 REPORT_LIMIT_REACHED (lookup route.ts:18, :169), 429 is rate limiting (:31). MF-47 adds checkout, session action, price-map entry, CSP (.cursor/MCFRONTEND-QUEUE.md:335); migration 322 and the commits are already on origin and dev (:336).
- Recommendation: build A.6 now from the existing read; drop 320's dependency on 71 once the operator approves; fixtures for Basic, Pro, trial.
- Verified by review r1 of task-339 (direction). UNVERIFIED: live database values (10, 25, migration 322 applied on dev) read from files and the queue row only.
- Pulls forward: nothing from MF-47; one front-end question (what the line shows with no entitlement row; reset date falls back to created_at, index.ts:560).

### (b) LOAD chain, task-341 (tasks 266, 267, 317 wait on 123 -> 122 -> 121)
- Issue: 1.3 W waits on two small Increment 6c tasks; the decision is priority and order.
- Grounded: yes. Dependency front matter of 266, 267, 317, 123, 122, 121; task-62 DONE (MORNING-DECISIONS.md:1150-1151); 121 plan text "READY to author after push 6 ... no ruling needed"; 121/122 = recut and commit of the staged MB-94 (c) tree, not_in_engine_population (Spec 126:809, MCBYLAWS-QUEUE.md:693, BUILD-PASS.md:15 (scratch)); git -C ~/Buildo-wt-mb94c: branch wf1/mb94c-1117 [behind 108], 5 files +79 -4 staged; task-123 planNote holistic-r1 (8.28 and L.5 removed; keeps 6c.8a); RR-0178 :789, RR-0271 :1063; Increment 6c = owner inputs and the one-lot run (MCBYLAWS-QUEUE.md:94, :1235-1237; about 37 tasks in doc-9); landingPush 121/122 push 7, 123 push 9.
- Recommendation: run 121, 122, 123 now ahead of 6c; the rest of 6c stays. Authoring earlier does not finish 1·B earlier unless they also land at the next push station (operator's timeframe call, folded from review finding K1).
- Verified by review r1 (direction and scope). UNVERIFIED: the conflict surface of the recut (not measured), U1-U3 on task-266 (build lane's), the 2-day estimate is the plan's GUESS.
- Pulls forward: 6c.5a, 6c.8a and the 1.3 W build; not owner inputs, MB-89, J6, MB-38, L.5, ST.P1.

### (c) PROOF.TOOL, task-342 (task-68 waits on task-67 CHK.6; task-268 waits on 68)
- Issue: CHK.6 needs a design-elements file no task produces; RS-12 does not exist.
- Grounded: yes. task-68 deps 62 (DONE), 66 (BUILT), 67 (LATER, m-0); task-268 deps 12, 69, 267, 68 (note: the R10 note on 268 says 317-322 were added; the file front matter shows only those four, flagged below); BL-R9 REPORT.md:13; scripts/analysis/report-schema.mjs header :25-28, gate('RS-9') :346, gate('RS-11') :360, no RS-10 and no RS-12 (grep -c RS-10 = 0); no report-design-elements file in repo or scratch (find depth 4); CHK.6 design DESIGN.md:18 (scratch); task-268 (e) allows AUTO-PASS, REVIEWED-PASS or GAP; AUDIT.md:159-163 (scratch).
- Recommendation: PROOF.TOOL runs the checks that exist and prints design fit as GAP "CHK.6 not built"; drop 68's dependency on 67 once approved; task-67 stays LATER; no new task. Alternative (not recommended): first a design task to fill the elements file.
- Verified by review r1 (direction). Pulls forward: nothing.

## 4. New task ids (check against the board before folding)
task-340, task-341, task-342 (all OPERATOR, m-1, type decision). task-339 closed BUILT in the same commit.

## 5. Held tasks: dated note naming the OPERATOR task
task-320 -> task-340; 266, 267, 317 -> task-341; 68, 268 -> task-342. Statuses and dependencies unchanged.

## 6. Review round
r1-review.txt (deepseek-reasoner, plan-review-deepseek.md); TRIAGE.md: 10 KEPT and folded, 11 REJECTED with the opened line. The round's FAIL verdict concerned the generated context (draft-34 scope), not the recommendations.

## 7. UNVERIFIED items and findings for the orchestrator
- Live-database values for A.6 (see 3a); conflict surface of the 121/122 recut (3b).
- A.6 line with no entitlement row: front-end design, operator's.
- Discrepancy, not fixed here (record-only): task-268's R10 note says it now also depends on 317, 318, 319, 320, 321, 322; its front matter lists only TASK-12, 69, 267, 68. Needs a task.
- Context generator defects re-seen (ENOENT docs, "undefined" quotes, empty Decisions naming this task): draft-34.
- backlog is not on PATH in this worktree; used node_modules/.bin/backlog (1.55.3). Status RUNNING was already set by the launch script; the re-take edit only set the assignee.
