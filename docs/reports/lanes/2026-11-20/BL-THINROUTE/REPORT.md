BL-THINROUTE REPORT (task-383, STD.ROUTE), fix round 1. Code commits on wf1/inc1b-thinroute (rebased on wf2/board, not pushed): 3ef8a95ac (build, was 74116ef30 before the rebase), 26a4a928c (fix round). Task left RUNNING; grounder owed on the new outputs.
1. For a person nothing changes: same responses, meter, log keys and buckets (the meter, openReport, refusal mapping, log line and buckets stay in the lookup route: RR-0331, decision-116, operator verbatim at MORNING-DECISIONS.md:1432 "2. y 1 a", the answer to :1431 "leave the meter where it is?"). No golden moved.
2. Fix round: (1) task Implementation Plan items 2, 4, 5 amended through the backlog CLI to the built shape (runLookupFlow, not runParcelLookup). (2) lookup-flow.ts: the q! is gone (requireQ narrows q; the schema guarantees one of q or parcelId). A discriminated input type was not used because the route would need a cast to build it; stated. (3) importer plants now run the real walk and filter on a planted tree and a control tree (compute test, read test T10); new plants for the resolver pin, the once-in-flow readLotForm pin; new locks: flow imports no logger, entitlement or meter code; flow holds no non-null assertion; new route test: a thrown gate read gives 500, no payload, nothing read or metered (parcel-lookup-gate.infra.test.ts). (4) the 10.3 deviation is recorded in the census row scripts/surfaces/_schema/census/contracts.json and its generated descriptor contract_parcels_lookup (deviations: from / why / adjudicated_by / date); the MF-50 entry's stale route.ts:66-68 cite now points at tool-gate.ts; generate-surface-registry --emit-descriptors then --check: clean. Filed under McFrontend-Task MF-45 (RR-0332) because the surface paths require it; Spec-diff N-A declared in the commit body.
3. Engine reach, owed (the gates branch is not edited): when wf1/inc1b-gates and this branch are both on the board, scripts/analysis/gates/compute-reach.mjs ALLOWED_REACHERS needs: file src/lib/parcels/lookup-flow.ts, since 2026-11-20, reason "STD.ROUTE (task-383): the lookup flow calls report-compute.ts (one hop)"; and the src/app/api/parcels/lookup/route.ts entry reworded to two hops (route -> lookup-flow -> report-compute). Same text is in a task note. src-sql-ledger --check: fresh (lookup-flow.ts and tool-gate.ts hold no SQL).
4. Lens outputs: the plan-stage outputs (plan-*) review the PRE-NARROWING plan (the meter moved into the flow); the plan was amended after them. The output set was re-run on the new whole diff (change-2026-11-20.diff, 14 files, nothing trimmed). The rebase moved the rule-list ids (eng-all replaces eng-s1/s2/s4/s10/s11/s5; new lists surface-136, surface-127, surface-135, five-words, plan-protocol, ms-S). eng-s5 is part of eng-all (the standards file whole). The first-round out files are removed and listed in SUPERSEDED.txt (name and sha). 
5. REFUSED BY lens-input for size: surface-135 ("whole file > ## Register" is 77056 characters with no deeper heading to split at). Nothing trimmed; no out-compliance-surface-135.txt exists. The close check will refuse until that is dealt with (orchestrator item).
6. UNVERIFIED: phone tests not run (not touched); the thrown-gate route test and the new plants pass through the pre-commit related run only.
RED: red2.out (the fix-round attempt with the old flow file) ends: " FAIL  src/tests/consumer-parcel-lookup.infra.test.ts > route source-shape locks (Spec 100 §3) > the flow file holds no non-null assertion (q is narrowed, never q!)  AssertionError: expected true to be false ... Tests  1 failed | 186 passed (187)  exit=1".
GREEN: commit3.out: "Test Files  7 passed (7) / Tests  222 passed (222)", "GATE OK", "POLICY CHECKS OK (commit-msg): 6 file(s)", exit=0 (commit 26a4a928c). backlog doctor: "No duplicate IDs, self-referential dependencies, or dependency cycles found."
Output table (findings = BUG or DEFER lines per out file, untriaged; 70 in all; no GROUNDER.md written by the lane):
out-code-review.txt | 5
out-compliance-airtight-122a.txt | 1
out-compliance-airtight-124a.txt | 0
out-compliance-airtight-v2-122.txt | 1
out-compliance-airtight-v3-122.txt | 0
out-compliance-eng-all.txt | 5
out-compliance-five-words.txt | 5
out-compliance-inc-S.txt | 4
out-compliance-ms-S.txt | 5
out-compliance-plan-protocol.txt | 6
out-compliance-step-132.txt | 0
out-compliance-storage-doc16.txt | 5
out-compliance-surface-126-p1.txt | 5
out-compliance-surface-126-p2.txt | 4
out-compliance-surface-126-p3.txt | 0
out-compliance-surface-126-p4.txt | 2
out-compliance-surface-126-p5.txt | 3
out-compliance-surface-126-p6.txt | 5
out-compliance-surface-127.txt | 3
out-compliance-surface-128-p1.txt | 4
out-compliance-surface-128-p2.txt | 1
out-compliance-surface-136.txt | 2
out-error-paths.txt | 4
out-ux.txt | 0
STATUS: BL-THINROUTE · task-383 · RUNNING, fix round built (26a4a928c), grounder owed; open item: surface-135 lens-input refused for size
