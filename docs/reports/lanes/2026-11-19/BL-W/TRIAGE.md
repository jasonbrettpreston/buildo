# TRIAGE.md: BL-W task-123, review round r1 (deepseek-reasoner, plan review; output r1-plan.txt). Each finding KEPT or REJECTED with an opened file:line. Folded into PLAN.md.
1. CRITICAL pool import in report-page.ts: REJECTED as a defect, KEPT as a test. Opened: git grep -n "lib/parcels/report-page" -- src mobile shows one non-test importer, src/app/api/parcels/lookup/route.ts:53 (server route); src/lib/parcels/lot-form.ts:9 already imports `query` from '@/lib/db/client' in the same directory (precedent). Folded: T10 (only server files import report-page.ts).
2. HIGH no rollback: KEPT. PLAN section 4a.
3. HIGH miss collapses absent table / outage: KEPT in part. Absent table stays a miss (the declared refusal pattern, stored-page.ts:64) but logs one warning; a thrown query propagates to the route catch (route.ts:200). T2 edited.
4. HIGH SQL never executed, T4 self-referential: KEPT. T4 oracle hand-written from src/tests/fixtures/report-page/**; live execution is a test-stack rehearsal owed by the orchestrator (no DB here), UNVERIFIED, section 4a.
5. HIGH cohort currency vs CURRENT_SEED_SHAS unverified: KEPT as UNVERIFIED with the four owed read-only checks (section 4a).
6. HIGH lot-size input shared across users: REJECTED for W. Opened: migrations/305_parcel_user_inputs.sql:50-51 (one active entry per lot and key, by design) and the projection marks user_input fields not evaluated (project.ts header D-46), so W reads no user input at all. Noted: sharing of an owner entry is a ST-4/6c.6 matter, not W.
7. HIGH MB-44 wait discharge uncited: REJECTED in part. RR-0178 is the operator's own words "1. it has to happen now - read the objectives" (MORNING-DECISIONS.md:789) and RR-0301 :1160; planNote holistic-r1 cites the operator answers by name. Folded: the status line cites :789 and :1160 only, not the plan-import note.
8. HIGH red test inside the "green to green" commit 2: KEPT. Fence case moved to commit 3.
9. HIGH prereg name unverified, coa-expected directory: KEPT in part. Opened scripts/analysis/mcbylaws/prereg-name.mjs:7: form prereg-(MB-n)-k.json, so prereg-MB-44-<k> is valid; k claimed by the orchestrator. Whether a CoA validator globs the directory for a moves-only file: UNVERIFIED (MB-93 prereg-MB-93-1.json already sits there, and is also a non-CoA prereg).
10. HIGH MF row unclaimed, frontend glob: KEPT (already flagged). Descriptor edit moved to commit 4; MF id claim is an orchestrator precondition (PLAN section 5).
11. HIGH unobservable in production: KEPT. Section 4a: the problem stays open; notes must not close it. D1 carries the option to bring part (f) forward.
12. MEDIUM AC #3 write_scope and AC #4 lens set: REJECTED. write_scope is declared in the brief (BRIEF.md "Write scope"); the brief's rule 12 and step list fix one review round on the plan (BRIEF.md line 10).
13. MEDIUM no-maths DIRS: REJECTED. Opened src/tests/surfaces/report-no-maths.logic.test.ts:28: DIRS = src/lib/surfaces/report, src/components/report, src/app/admin/report-preview, src/lib/surfaces/report-images; the admin lib directory was never in it, so the move removes no guard.
14. MEDIUM multi-statement read not a snapshot: KEPT as a note carried to task-272 (ST.P2), not built now (section 4a).
15. MEDIUM D2 is a code fork: KEPT. Code delta written under D2.
16. MEDIUM RR-0298 versus rule 3: KEPT as UNVERIFIED (no RR-0298 text found by grep in MORNING-DECISIONS.md and docs/reports/decisions); rule 3 applied; handover stated in section 5.
17. MEDIUM prior lane reports not cited: REJECTED. PLAN cites U1-U3 from BL-R11 REPORT section 3 and the R12 note on task-266 (read at docs/reports/lanes/2026-11-19/BL-R11/REPORT.md:11-12); Q9 re-searched in section 6.
18. MEDIUM inconsistent counts: KEPT. Counts reconciled in PLAN section 4 (4 test files edited, 13 registry rows, 7 specs).
19. MEDIUM meter counts stored-page reads: REJECTED. RR-0278 (route.ts header lines 12-17) rules "counts when a report is produced (page sent)", operator words; not changed by W.
20. LOW `current` parameter undefined: KEPT. readStoredPage(db, parcelId, current = CURRENT_SEED_SHAS), same default for both callers; verdict stays in the pure projection (project.ts:172).
21. LOW descriptor edit at commit 2: KEPT (see 10).
22. LOW T8 `values` keys: KEPT. T8 edited.
23. LOW extra parcels read per lookup: REJECTED, documented as intended (W takes only parcelRef so the signature and both mocks stay).
24. NIT Json return type: REJECTED. buildPage takes Json (report-page.ts:29,34); narrowing is a separate change.
25. NIT OUTPUT review "then": KEPT. Same commit.
26. NIT 7 -> 9 tables arithmetic: REJECTED, shown: descriptor line 6 lists parcels, address_points, parcel_address_points, coa_applications, user_profiles, entitlements, usage_events (7); W adds parcel_maxbld_scenarios and bylaw_resolution_lot_stamps (parcels already counted) = 9.
Verdict note: the reviewer wrote FAIL on structure; every KEPT item is folded or carried as UNVERIFIED. Three owner-side blockers remain for stage 2 start: MF id, prereg k, the live read-only checks.
