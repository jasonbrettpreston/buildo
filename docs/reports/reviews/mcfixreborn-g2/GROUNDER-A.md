Grounder: Cairn-Ground-G2A
Ruled: out-compliance-agents-s5-1to3.txt sha256:21153ef187a4 findings:2
Ruled: out-compliance-agents-s7-s11.txt sha256:2a6dbc790309 findings:5
Ruled: out-compliance-bylaw-133-p1.txt sha256:37e31de360be findings:1
Ruled: out-compliance-bylaw-133-p2.txt sha256:3bc6b75e8dfb findings:4
Ruled: out-compliance-five-words-p1.txt sha256:13e748b0183a findings:6
Ruled: out-compliance-five-words-p2.txt sha256:6eaec2b82150 findings:6
Ruled: out-compliance-five-words-p3.txt sha256:7e594638a739 findings:0
Ruled: out-compliance-inc-S-p1.txt sha256:cde499e60445 findings:7
Ruled: out-compliance-inc-S-p2.txt sha256:0780588e6aa2 findings:3
Ruled: out-compliance-inc-S-p3.txt sha256:3d43504ea71d findings:3
Ruled: out-compliance-inc-S-p4.txt sha256:4a46fe21b6ff findings:4
Ruled: out-compliance-ms-S-p1.txt sha256:eeebd0e572a4 findings:3
Ruled: out-compliance-ms-S-p2.txt sha256:99667d0a8d8f findings:1
Ruled: out-compliance-ms-S-p3.txt sha256:4ed2d4880f2f findings:4
Ruled: out-compliance-orchestrator-doc17.txt sha256:c9e5c37d2e8d findings:3
Ruled: out-compliance-plan-protocol-p1.txt sha256:1c1986f8c97a findings:4
Ruled: out-compliance-plan-protocol-p2.txt sha256:8591c3e04b87 findings:4
Ruled: out-compliance-plan-protocol-p3.txt sha256:11cf3b46c4f4 findings:6
Ruled: out-compliance-queue-137.txt sha256:f4ef4391147c findings:3
Ruled: out-compliance-step-132.txt sha256:a93eca2a48a1 findings:4
Ruled: out-compliance-surface-136.txt sha256:5f9f4f991076 findings:3

Total 76 findings; 42 HIGH/MED ruled, 34 LOW/NIT recorded. Checked tree: the board worktree HEAD is 8dba70e8e (verified, `git rev-parse HEAD`). Id form below: file stem (without `out-compliance-`) plus #n. Short names: agents-s7 = agents-s7-s11, fw = five-words, inc = inc-S, ms = ms-S, pp = plan-protocol, orch = orchestrator-doc17.

## 2. HIGH/MED table
id | sev | verdict | reason
agents-s7#1 | MED | NOT-APPLICABLE | §11.1 governs "a plan or fold"; prereg-MB-44-1/2.json are forecasts the scorer checks later. The totals are byte-identical to prereg-MF-91-1.json (node compare: all three total sets equal).
agents-s7#2 | MED | NOT-APPLICABLE | "approves a SQL shape" is a reviewer-process rule. The ledger entry (src-sql-ledger.mjs:111) records the step core's own statement. Nothing here is a plan under review.
agents-s7#3 | MED | REFUTED | ~/Buildo-scratch/ids/round-197/owner and round-198/owner exist (BL-W2 and BL-LOAD1B, 2026-11-19, naming MB-44 rounds 1 and 2). The claim is shown, not asserted.
fw1#1 | HIGH | DUPLICATE of step#3 | report-compute.ts:93 running the core's batch statement from src/ is the route-side engine call, already ruled. The "phase" glossary entry is a vocabulary definition and puts no duty on a src/ module.
fw1#2 | MED | DUPLICATE of step#3 | same compute-to-src edge.
fw1#3 | MED | REFUTED | The finding says the only guard is a test "not in this chunk". src/tests/customer-report-compute.logic.test.ts:169-172 compares the two lookup statements to the descriptor's declared lookup tables and columns (`expect(stmts).toEqual(lookups)`).
fw2#1 | HIGH | REFUTED | The finding text is literally "none". It has no claim.
fw2#2 | MED | DUPLICATE of inc2#1 | no evaluator-version compare exists to lock, by ruling.
inc1#1 | MED | REFUTED-BY-RULING | parcel-lookup.ts:166-170 follows the ruled text. Spec 89 line 34 (ONE-12 a, MORNING-DECISIONS.md:738): "Label 2: the unit text the consumer route shows ('add a unit number') is ruled and stays; the strip makes the resolver ignore the unit, which is not used to narrow."
inc1#2 | MED | REFUTED | The meter lives in src/app/api/parcels/lookup/route.ts:101-111 and runs on `body.page` (counted, semi_pending, not_produced). A computed page is metered there. report-compute.ts:16 says "no meter" on purpose.
inc1#3 | MED | REFUTED | `grew:` fires for an interpolated file NOT in the closed set (src-sql-ledger.mjs:561). Adding the file to the set is the sanctioned acknowledgement. src-sql-ledger.logic.test.ts:232-239 locks the set at 30. I ran `node scripts/analysis/src-sql-ledger.mjs --check`: "fresh, 94 file(s) (62 static, 30 interpolated, 2 not_postgres), closed set holds".
inc2#1 | HIGH | REFUTED-BY-RULING | project.ts:185-187 does compare only table_version, catalogue_sha and switchboard_sha, so the code fact is true. But MORNING-DECISIONS.md:1404 says "D1 RULED (c): the freshness compare is left until stored records exist; it moves with the storage record write (ST.P1). task-380 waits on that". task-372 card Implementation Plan says "D1 stopped". task-380 (LATER) owns it.
inc2#2 | MED | DUPLICATE of inc2#1 | the settings_sha compare is the same D1 item. The sq-ft factor and lot-size window settings parts of task-372 are done (pinned-settings.ts).
inc3#1 | MED | REFUTED-BY-RULING | Spec 89:34 A.4: only "when every row prints a direction and some match the typed one, only those rows are kept". Label 1 covers a one-lot hit only. "Unchanged" for two other-side lots is the ruled text (parcel-lookup.ts:203-210).
inc4#1 | MED | NOT-APPLICABLE | This is about how the review was paired (RR-0439), not a defect in a G2 file.
inc4#2 | MED | DUPLICATE of inc2#1 | no settings_sha compare exists to test.
inc4#3 | MED | REFUTED-BY-RULING | MORNING-DECISIONS.md:83 is operator-verbatim "approved - Showing heritage, ravine, corner and confidence ... needs a small code change ..."; :82 is the question: a new yes/no page rule, reusing the existing formatter pattern.
ms1#1 | MED | DUPLICATE of inc2#1 | same D1 item.
ms1#2 | MED | REFUTED | The semi case is not a resolver outcome. It is `lotForm.unsure`, set by the lookup route (route.ts:106, meter semi_pending) and read by the report mount. The question page is task-319 (search-routing.logic.test.ts header, line 17).
ms3#1 | MED | REFUTED | The real `needsSemiQuestion` (mobile/src/lib/lotForm.ts:27) is executed in mobile/__tests__/lotForm.test.ts. search-routing.logic.test.ts says openly (lines 7-10) that it does not load it and is UNVERIFIED there. The test-local copy at :68 is a weak spot, but no clause breaks (see observation O2).
ms3#2 | MED | NOT-APPLICABLE | The "project objectives" line is not a rule. src-sql-ledger.logic.test.ts:346 accurately pins today's catalog state; the `--check` output above shows the same two uncatalogued names. The comment at :344 documents the precedent.
orch#1 | MED | REFUTED | prereg-1 quotes :789, which sits under the heading "RULED: read module now". The words are operator-verbatim and the entry carries "Ruling (1)". It is not a reading of the register.
orch#2 | MED | REFUTED | :1061 is operator-verbatim "1. once -approved 2. y"; :1063 "Ruling 2 (task-325, LOAD.1 vs ST.P1): Option A adopted ... LOAD.1 carries the compute half". :1160 is operator-verbatim "task 341 approved". Both are visible in the register.
pp1#1 | MED | NOT-APPLICABLE | The plan-protocol list governs plans and increments, not finished code. The finding itself says no clause reaches the 13 files.
pp1#2 | MED | NOT-APPLICABLE | Acceptance-criteria text not being pasted is a harness matter, not a defect in a file.
pp1#3 | MED | REFUTED-BY-RULING | logic_variables.json:9780 area: MORNING-DECISIONS.md:1526 is headed "Operator CONFIRMS the pre-commit hook budget at 33.2 seconds". :1504 is the earlier 32.1 s approval. Commit b341e374b records the attribution.
pp2#1 | HIGH | REFUTED | The quote exists. MORNING-DECISIONS.md:1910 reads "...interface between the frontend and databse" (RR-0385 item (b)4). :1922 item 6 repeats it ("the interface between the front end and the database"). The §0 task-source rule is also a task-creation rule, so not applicable.
pp2#2 | MED | NOT-APPLICABLE | Scope of the review set (task-442 in files.txt). Not a defect in the code.
pp2#3 | MED | NOT-APPLICABLE | §3 is a plan count rule. The comment at control-panel.logic.test.ts:268 is stale for another reason (see K1).
pp3#1 | HIGH | NOT-APPLICABLE | §1 "(9) measured check on the page" is a plan clause and no plan is under review. The substring lock is a known, declared limit (test lines 7-10). The real helper is locked in mobile jest.
pp3#2 | MED | DUPLICATE of ms3#1 | same test-local copy.
pp3#3 | MED | DUPLICATE of inc4#3 | same K2 authority claim, ruled at MORNING-DECISIONS.md:83.
pp3#4 | MED | NOT-APPLICABLE | "Rulings: only when a search of the record finds none" governs plans. The file is a locked test of a built task.
pp3#5 | MED | NOT-APPLICABLE | The "count must not grow" rule governs the plan's task count. A golden row count is not a task count.
pp3#6 | MED | REFUTED | scripts/steps/_schema/src-sql-ledger.json exists (82,926 bytes). The `--check` run above is fresh with the closed set holding. The header at src-sql-ledger.logic.test.ts:8-11 is stale wording only (LOW, O3).
queue#1 | HIGH | REFUTED | `git show --stat` of 7134366c2 (prereg-2) and 1ee2c3964 (prereg-1) shows each commit carries `Task: task-266` / `Task: task-123` AND the task file in the same diff (3 files each). G3 (`scripts/hooks/check-backlog-task.mjs`) is satisfied. My first `--stat` was path-limited and misleading; the full stat settles it.
queue#2 | MED | DUPLICATE of agents-s7#3 | the round claims exist.
step#1 | HIGH | REFUTED | assert.2 checks variables declared by step descriptors (`scripts/lib/declared-logic-variables.js`). The two lot-size variables are read only by src/lib/report-projection/project.ts through pinnedSetting. No step descriptor names them (grep: none), so the chain-start check cannot go red on them. The "owed migration" text is stale (see K1).
step#2 | MED | NOT-APPLICABLE | core.8 names "a step, gate, admin surface or tool". report-compute.ts:93's `[lot.id - 1, 1]` is the keyset bind for the one picked lot, not a tunable. If the operator wants core.8 read over all server code, it needs a decision (O1).
step#3 | MED | REFUTED-BY-RULING | core.9 governs step compute. MORNING-DECISIONS.md:1307 records this exact conflict (C1: engine called from a route with its own context). :1337 verdict "HOLDS WITH A REPAIR: ... Engineering matter, no operator question". RR-0271 (:1063) rules LOAD.1 as the compute half.
surface#1 | HIGH | REFUTED | fe.06 is about the honest display. The producer omits a value for a null or unknown confidence and the page shows the ruled null dash (project.ts:150 and :244). The omission is deliberate fail-closed, not a hidden badge. The `none` word belongs to the report-tree node contract (fe.29), which this producer does not emit. The mobile dash rendering was not executed (section 6).
surface#2 | MED | REFUTED | No bound name is legacy. I printed the 18 field names in report-page.json: none matches newbuild, coa_gfa or `^max_`. The decl file does not contain max_newbuild_coa_gfa_sqm. The FACT_COLUMNS allow-list (test :19, :25-27) blocks any other parcels column. fe.18 is met at 8dba70e8e. The regex gap is a hardening note (O4).

## 3. CONFIRMED DEFECTS
None. No HIGH or MED compliance finding survived re-execution as a breach of a rule that governs these files.

Already-known items seen while ruling, none new and none from the findings as worded:
K1. logic_variables.json:8197 and :8207 and control-panel.logic.test.ts:268 still say the DB mirror migration is owed. The task-372 card (Implementation Notes, MD:1476 grounder resolution) says none is owed: the seed loader inserts at the next `npm run migrate`. The same notes say task-367 or task-343 will correct the text. The text is still stale at 8dba70e8e. This is a comment-only fix owned by task-372 files via the task-367/343 follow-up, pin-size, no decision needed.
K2. The freshness compare omits settings_sha and evaluator_version. This is ruled D1 (c), MD:1404, owned by task-380 (LATER).
K3. The seed lines at logic_variables.json:8197 and :8207 cite MD:738 for the 50 / 5,000 words, which the task-372 retro says is wrong (decision-37, RR-0167). This is known and open. Pin-size comment fix, I did not re-verify the retro's claim.

## 4. LOW / NIT recorded (34)
LOW: agents-s5-1to3#1, agents-s7#4, bylaw-133-p2#1, #2, #3, #4, fw-p1#4, #5, fw-p2#3, #4, #5, inc-p1#4, #5, #6, inc-p2#3, inc-p3#2, #3, inc-p4#4, ms-p1#3, ms-p2#1, orch#3, pp1#4, pp2#4, queue#3, step#4, surface#3.
NIT: agents-s5-1to3#2, agents-s7#5, bylaw-133-p1#1, fw-p1#6, fw-p2#6, inc-p1#7, ms-p3#3 (this is LOW in file) , ms-p3#4.
Recorded, no ruling. Mis-rating flags: none is HIGH-class on its face.
Notes: ms-p3#3 is LOW and ms-p3#4 is NIT (the first list above puts ms-p3#3 under NIT in error: read it as LOW).
Facts seen while reading these, not rulings:
- agents-s5-1to3#1: the ledger header lines 76-80 already say "29 interpolated ... LOAD.1 adds the 30th", so the "72 files" figure is the dated historic measure.
- bylaw-133-p1#1: wrong on its face. The prereg's "no file under scripts/analysis/bylaw" names a different directory from scripts/analysis/bylaw-validation, and `git diff --stat` over scripts/analysis/bylaw, scripts/seeds/bylaw and docs/reference/bylaw is empty.
- inc-p1#4: Label 1 of Spec 89:34 rules the one-row downgrade.
- inc-p3#2: Spec 89:34 A.5 says "only while a house number and a street remain".

Observations, not rule breaches:
- O1: core.8 scope over customer-path server code (the literal 1 at report-compute.ts:93).
- O2: search-routing.logic.test.ts:68 keeps a test-local copy of needsSemiQuestion and :147 greps the mount source.
- O3: src-sql-ledger.logic.test.ts:8-11 header says the live tests are "red on a fresh worktree by design"; the ledger now exists.
- O4: engine-inputs-bind LEGACY regex (:20) omits `max_newbuild_`, which fe.38 names.

## 5. Totals
Of the 42 HIGH/MED: confirmed 0 / refuted 21 (ten of them by an operator ruling or a recorded ruling: inc1#1, inc2#1, inc3#1, inc4#3, orch#1 is a reading refutation, pp1#3, step#3, and the rest by reading code or git) / not-applicable 12 / duplicate 9 / undetermined 0.
Plain answer: yes, the option-B reading (each list reads only its own files) still produced noise from the process lists on the prereg and ledger files. Of the process-list findings (agents-s5, agents-s7, orchestrator, queue, plan-protocol, bylaw-133 and the five-words and inc-S findings about preregs), 0 of the HIGH/MED were real defects; the only real things in that area were already-known (K1 stale migration text, K2 deferred freshness compare), and the preregs and ledger file were judged against plan, commit and ID-ledger rules that either did not govern finished code or were met (round claims exist, trailers and task files present, closed set holds).

## 6. UNVERIFIED
- The mobile page's rendering of an omitted confidence key as a dash (surface#1) was read in comments only.
- The scorer and floors, not run, so the prereg totals are only compared to prereg-MF-91-1.json (equal), not to a live scorer result.
- Whether the "context parity" lock named in MD:1337 (core closure never reads run_at or descriptor) exists in src/tests. I did not look.
- The task-372 retro claim in K3 about MD:738.
- mobile/__tests__/lotForm.test.ts was found to reference needsSemiQuestion but not run.
- No test suite was run; I used only `node` print scripts and `src-sql-ledger.mjs --check`.
