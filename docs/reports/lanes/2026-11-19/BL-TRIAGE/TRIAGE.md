# TRIAGE.md: BL-TRIAGE, repo review round r1 (single generic round; lens set is task-358) on the verdict table and task texts. r1-review.txt: 4 CRITICAL, 8 HIGH, 7 MEDIUM, LOW/NIT. Every item opened.
CRITICAL
1. RC-1/UX-1 left ownerless (RR-0300 OPERATOR tasks): PARTLY KEPT. The brief says create no OPERATOR task (orchestrator relays), so the answer is drafts D-3 and D-4 in REPORT.md and a blocker note on task-287; ownership stays NONE until the orchestrator relays. Opened: RR-0300 in the context block.
2. FINDINGS ids not in the document: KEPT (check, not content). FINDINGS.md is copied to docs/reports/lanes/2026-11-19/BL-TRIAGE/FINDINGS.md; a script run shows 42 of 42 ids have a row (REPORT.md).
3. D-1 and D-2 missing: KEPT. Written in REPORT.md (D-1 to D-4).
4. semi param as proof gives wrong semi numbers: REJECTED. The answer has no effect on the report today (grep OVERRIDE_PARAM/lotFormOverride: no reader); semi calc is 7.25. Sentence added to task-360 and a note on task-209.
HIGH
1. T1 AC2 evaluated option gate: KEPT, AC reworded (stub carries a costMenu total; negative case stays not_evaluated).
2. post-answer navigation: PARTLY. lotForm.ts reportRouteAfterAnswer builds ?semi=answered (opened); end-to-end AC and the file added; dependency claim rejected.
3. ENOENT on doc-2/doc-16 in the context pack: REJECTED as to my cites: I opened both files (grep on doc-2:63, :94; doc-16 :32-33, :99, :102); generator defect already task-343 line 12.
4. task-287 must not flip before RC-1/UX-1 have owners: KEPT, note added on task-287.
5. ACs that allow UNVERIFIED: REJECTED as written: mobile jest is not in the hook (task-343 line 10) and the lane rule refuses the runner; the AC says so openly. Fidelity pins quoting the mock added (KEPT part).
6. T3 shared helper: KEPT, caller inventory, rejection handling and Android expectation added.
7. T5/RG-1: KEPT as a correction: site-footer.ui.test.tsx:72-73 and header :8 already assert the web report copyright; RG-1 changed to FALSE, dropped from task-364.
8. IN-5/UX-5 dedup cite: KEPT. Dedup is entitlements/index.ts:559 usageFor and :606 openReport (`if (u.already) return already_counted` before the INSERT); both findings stay NOISE because task-334 is DONE.
MEDIUM
1. NONE claim by enumeration: KEPT; done: git grep -l for hasEvaluatedOption, evaluated option, costMenu over backlog/tasks, backlog/docs, .cursor: only .cursor/MCBYLAWS-QUEUE.md.
2. verdict class time-inconsistent: KEPT, TRUE-THEN added to the legend (CO-1).
3. UX-3 and UX-1 merge: REJECTED. Retry is rendered only in the unexpected branch (SemiQuestionBinding.tsx:50-65); 429 and 403 show banners with no button, so the premise (a retry that cannot succeed) is wrong. D-1 asks the open question.
4. UX-8 classification: KEPT, legend rule added; cell reworded to NEW.
5. IN-4 wrong reason: KEPT, reworded (same state as IN-1, owner task-348).
6. T4 exit code: KEPT, header :11 update in AC; exit-3 is quoted in the header (:11 "3 no FAIL but a row is NOT BUILT").
7. T5 uncited number: KEPT, AC reworded.
8. SE-1 "60 s": KEPT, cite staleTime 60_000 at useParcelLookup.ts:89.
9. golden --check tautology: KEPT, pins quote the mock.
10. T4 blockedBy value: KEPT: exactly ["task-287"]; no test pin found by me (UNVERIFIED).
11. T1 call sites: KEPT, AC added.
12. Grounding rows graded by the author: REJECTED: the brief orders this confirmation (GR-2 etc.); stated as orchestrator readings.
LOW/NIT: counts and "opened" wording KEPT (VERDICTS status line: read, not executed); GR-3 non-disposition REJECTED (task-348 is the open question, :34); StrictMode grep KEPT as UNVERIFIED (SDK default not stated; grep mountedRef siblings not run: UNVERIFIED); stale cites KEPT into task-364; owner for the excluded UX-3 case = D-1; Dependencies empty (noted); test-file existence NITs: the files exist (git ls-files); a11y hint NIT noted for the lane; React Query version NIT noted.
