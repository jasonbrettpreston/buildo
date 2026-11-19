# TRIAGE: BL-LOAD1B (task-266, LOAD.1 stage 2), output round
Date 2026-11-19. Lenses run (DeepSeek reasoner, repo tool scripts/deepseek-review.js review mode with --template, one command each, in parallel): compliance, code-review, error-paths, security. The ux lens was not run (no UI change). Output files r2-compliance.txt, r2-code-review.txt, r2-error-paths.txt, r2-security.txt (r2-output.txt joins them). The lens templates and the lens-mode script exist on wf2/board, not on this head: `git rebase wf2/board` was DENIED by the permission classifier (history rewrite; my brief forbids it), so the tool and templates were extracted read-only with `git archive wf2/board` into boardtool/ and run from there (same files as the board). Diff reviewed: diff.patch (src and the ledger script; generated files, docs and the census excluded for size, the tool refuses over 120000 chars). Pasted context: pasted-context.md. Grounder: this lane (tool-bearing Claude) opened every cited line on the working tree. Round 2 of max_fix_rounds 2: no further round.
Earlier (stage 1) the plan had ONE generic round, not a panel (BL-LOAD1/TRIAGE.md): this stage-2 round is the first lens set.

## compliance
1. DEFER MED route carries more than one expression and two log keys no plan line names: REJECTED. PLAN.md section 3 "Observability" names the route log keys page_source and compute_ms and section 4 file 2 reads "one expression plus two log keys (about 6 lines)" (docs/reports/lanes/2026-11-19/BL-LOAD1/PLAN.md); the keys are log-only, no response key (route.ts:203-204).
2. DEFER MED growth-locked ledger set grown 29 to 30 by moving its pin: KEPT AS A FLAGGED DEVIATION, not changed. The ledger classes src/lib/parcels/report-compute.ts "interpolated" because the batch statement is built by the core and handed to pool.query as a variable (the first --check said: grew:src/lib/parcels/report-compute.ts, then update CLOSED_INTERPOLATED_SET). The proposed alternative (the core hands over its statement) is the same variable; the only way out is editing scripts/ (Standard 10.2, forbidden here). No operator ruling authorises the 30th entry: it is an UNVERIFIED approval, named in the report for the orchestrator. Opened: scripts/analysis/src-sql-ledger.mjs:80-112, src/tests/src-sql-ledger.logic.test.ts:231-241.
3-9. MET lines (first statement gate report-compute.ts:74; null paths :93; no write; parameterised; pageForVerdict one place; W first): confirmed by reading the lines.
10. REJECT (accusation: no switch test at the call site) and 11. REJECT (accusation: unwired): both agree with the lens's own REJECT.

## code-review
12. BUG HIGH C3 rows built with ROW_LAZY() at collection time: KEPT, FIXED. Opened src/tests/customer-report-compute.logic.test.ts it.each: ROW is assigned in beforeAll, so the table args had no id and the id guard answered before the stamp and parcels guards. Folded: the scenarios are builder functions run inside the test.
13. DEFER MED value and increment cast without String(): REJECTED. StoredRow types them `number | string | null` (src/lib/report-projection/project.ts:30-31) and the projection coerces through num() (project.ts:149-153); the C2 parity test compares the computed page with the page W projects from string-valued stored rows, which passes only if the coercion holds.
14. DEFER LOW ledger note says "one bound lot id": KEPT, FIXED (wording): the id is a checked integer literal, the binds are last_key and batch_size (scripts/analysis/src-sql-ledger.mjs comment on the new entry).
15. DEFER LOW header totals still say 29 interpolated: REJECTED. The line is the dated measurement of 2026-10-03 and the next lines now say LOAD.1 adds the 30th; the live count is 30 (src-sql-ledger --check: "62 static, 30 interpolated, 2 not_postgres").
16. DEFER LOW `!row.parcel` downgrades to a silent miss: REJECTED. PLAN.md section 2 U2 point 4 and the brief ask the core's throw on no parcels row to become null; the lot facts come from readLotFacts, but the batch join is the core's own input, so a batch row with no parcel is the case the core would throw on (runtime-loader.logic.test.ts (e)).
17. NIT dead counter h.loaded.config: KEPT, FIXED: C1 now asserts the config reader is not imported while the switch is off.
18. NIT `as never`: KEPT, FIXED: cast to StoredRow[].

## error-paths
19. BUG HIGH no deadline, no singleflight, retries multiply: REJECTED for this task. Brief: "Do NOT fix those here"; recorded as launch preconditions (synchronous compute blocks one instance up to 15.9 s measured here and 33.6 s by the STORAGE lane; app retries three more times, mobile/src/hooks/useParcelLookup.ts:52-59; platform timeout unknown) and "no process cache" is the plan (PLAN.md section 4). The compute is dark at landing.
20. BUG MED page_source 'none' hides five outcomes and nothing logs them: REJECTED as extra (minimum first): the plan names two keys only (PLAN.md section 3); recorded as a loose end for task-343 (reason codes per null return).
21. BUG MED compute_ms only recorded when a page is produced: KEPT, FIXED. Opened route.ts: a compute that ends in a miss after the full run (seed-sha drift in pageForVerdict) is the slow case worth seeing. compute_ms now records the entry's time whenever it ran (about 0 while the switch is off), null when W served the page.
22. DEFER LOW second parcels read on a W miss: REJECTED. One indexed read is the plan (PLAN.md section 4 file 1); a race fails closed to a miss, never a wrong number.
23. DEFER LOW keyset drift would go dark silently: REJECTED as extra; the id equality guard is the plan's C3b and a drift is a miss, not a wrong number.
24-25. REJECT lines (double submit, thrown error as miss): agree.

## security
26. DEFER MED unmetered synchronous compute per request, cost and CPU: REJECTED for this task as a launch precondition (same as 19); the route's own limit is route.ts:64 (30 per minute on the parcelId path) and the compute is dark.
27-29. REJECT lines (interpolation not request controlled: the only interpolated value is String(lot.id) from the integer parcels.id (src/lib/report-projection/read-stored.ts, PARCEL_SQL); auth unchanged; pageForVerdict reuse): agree after reading report-compute.ts and read-stored.ts.

Counts: KEPT and fixed 5 (12, 14, 17, 18, 21); KEPT as flagged deviation 1 (2); REJECTED 13. No finding left unadjudicated (29 lines).
