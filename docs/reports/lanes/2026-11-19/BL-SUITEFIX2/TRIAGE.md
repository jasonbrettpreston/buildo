# TRIAGE r1 (BL-SUITEFIX2, task-353) — review output r1-plan.txt, one round
KEPT
- K1 [HIGH] other jest mock sites of @/hooks/useParcelLookup would break on the new export: opened grep: reportScreen.mount.behaviour.test.tsx:31, lotMapPage.behaviour.test.tsx:35, parcelSearchScreen.behaviour.test.tsx:23, semiQuestionPage.behaviour.test.tsx:31. Only the semi test renders semi-question.tsx (grep -ln semi-question mobile/__tests__/*.tsx: that one file), so no other mock needs the export. Done: nothing more to change.
- K2 [MEDIUM] frame C-9m as test-stricter-than-spec: KEPT, in REPORT (test:870 and bindings.json say 44 token; Spec 128:265 ASK-19 and Spec 126:351 say floor 44).
- K3 [MEDIUM] state the PROOF2 hedge closed: KEPT, REPORT says the added tests of BL-PROOF2 (proof-slice.logic.test.ts) and BL-W2 touch no pin of these three files; checks run, lot-map-data-check needs a DB (UNVERIFIED).
- K4 [HIGH] C-9m must be reported as an operator item with options and costs (Grounded and Recommendation): KEPT, REPORT carries it in full; the orchestrator files the OPERATOR task (lane may not edit other tasks).
REJECTED
- R1 CRITICAL ENOENT documents / duplicate sections / generator defects / undefined quotes (context file generator, lines 1-113): generator output of backlog-brief.mjs, not this task's change; scope (TKT-1, G1-task-353.md:3).
- R2 CRITICAL AC1 unsatisfiable: AC1 is the ticket's; brief says leave C-9m red and set WAITS (BRIEF.md:4). Reported, not changed.
- R3 CRITICAL FLIP_PENDING grows: register-locks-resolve.infra.test.ts:20-22 comments show FE-32/33 joined and left it (MF-37, 2026-11-09), so the list is shrink-after-flip with join on lock landing; the exactness case (:200-210) still bites. Row flip needs the operator (:21).
- R4 CRITICAL scratch evidence: red.out and the fail file are lane evidence per RR-0225; copies go to docs/reports/lanes in the last commit (rule 19).
- R5 FE-07 derive the list: the test pins the name list by design (search-parity.golden.test.ts:86); deriving would weaken it. Dated move is the brief's instruction.
- R6 mounts[] completeness: new check = scope creep (PLAN-PROTOCOL.md:3); the existing C-2 walk also catches listed mounts only by design (surface-conformance.logic.test.ts:91-117); noted as follow-up, not done.
- R7 hook-mock hides key/value: useParcelLookup.test.ts covers hooks; hook is 3 lines, same key literal as :92 useParcelLookup; the jest assertion still checks key and value via the shim.
- R8 touch_targets.web precedent MEDIUM: already weighed in the plan; leaving it to the operator is the brief's rule (do not decide), and the hard-coded RED strings at test:909-913 make it more than data.
- R9 no-gate assessment, milestone label, citation nits, 35 s text, RR-0005/0044 titles, decisions volume: outside this task.
