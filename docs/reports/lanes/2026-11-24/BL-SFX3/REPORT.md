# BL-SFX3 · task-451 SEARCHFIX.3 · stage 1 report

STATUS: BUILT. Output review round 1 closed by the separate grounder Cairn-Ground-O451 (GROUNDER.md, TRIAGE.md here; re-ruled at lane head 17d175f53 after the ms-S p3 re-run): 181 findings (HIGH 24, MED 72, LOW 81, NIT 2, plus 2 CRIT placeholder lines) over 52 outputs, with 4 CONFIRMED, all LOW, piled; 177 REJECTED; no fix round. Phone proof owed: the phone tests (lotMapPage.behaviour.test.tsx, lotMapScreens.golden.test.ts) have never run; they run only in the GitHub Mobile CI job after a push. DONE is held until that run is green and one device tap of report it is recorded.

## Commits (branch wf2/inc1b-sfx3, worktree /Users/brettpreston_macmini/Buildo-wt-sfx3; nothing pushed, no DB, no suite)
- 04c181564 fix: SEARCHFIX.3 lot card and plain-page header links (task-451). 45 files. Hooks GATE OK, POLICY CHECKS OK; pre-commit related run "Test Files 17 passed | 1 skipped (18) Tests 419 passed | 7 skipped (426)" (green.out). Trailers Task: task-451, McFrontend-Task: MF-53, Spec-diff: N-A (plan ruling 8.6).
- 0e491221e docs: doc-2 dated notes (C.3 no neighbour lots = AC6, C.7, C.12, B.6/B.7, C.9) via backlog doc update + regenerated rule-lists-by-kind.md (own commit: check-task-files refuses non-Files paths beside code).
- dd40a13d5 docs: task-336 dated note (ST3, V1, V3, L7), own commit.
- 182a28053 merge of wf2/board (fe88ecf71) as ordered by the orchestrator. doc-2 conflict resolved by keeping both sides (board task-449 lines first, then the task-451 block; updated_date 2026-11-24T16:58:00Z); rule-lists-by-kind.md by `rule-lists.mjs page --write` then `--check`; surface registry --check clean. Hooks: Test Files 17 passed | 3 skipped (20), Tests 822 passed | 16 skipped (838); GATE OK; POLICY CHECKS OK.
- Review records commit: 63c96df49; ms-S p3 lens re-run: 17d175f53 (records only).
- Launch commit (close-check base): 8820c4dbab43f24286ec65efa5063267ff9771f2.

## Red / green
- red.out: commit with only test and task files staged refused: "Test Files 7 failed (7) Tests 22 failed | 199 passed (221)".
- green: 04c181564. surface-validate --check: 427 strings before, 436 after.
- Mobile jest (lotMapPage.behaviour, lotMapScreens.golden): not reached by the pre-commit related run; red/green UNVERIFIED until the push station. In-memory tsx probe (probe.out) gave the expected card text and labels, the unlinked line, the four error notices, one help topic wrong-lot.

## Acceptance criteria evidence
1. ST3: area null outside LOT_SIZE_PLAUSIBLE_M2; lot.null "Not available" (infra test ST3; golden test; multi_parcel_3plus lot C golden).
2. V1: no-street leads end " · at the back" (search-follow-ups LEADS; behaviour tests).
3. V2: unlinked.body + inline Text parcel-lotmap-report (open_help wrong-lot) + stop.
4. V3: lot.label "{lead}, {area}"; Continue label = visible text.
5. X1: behaviour smoke builds errors with errorOf/schemaDrift; four error cases.
6. C.3 dated note in doc-2 (0e491221e).

## Deviations (recorded in task notes)
- mobile/__tests__/fixtures/lotMap.situations.json added to the Files line: after the change no committed golden used lot.null (surface-validate SV-SBIND orphan key); lot C of multi_parcel_3plus(_none) now has area null.
- static-web-binding (c): the error page's prose index also shifted ([0] -> [1]); the plan named web_help only.
- The inline report-it link reuses the existing class L.helpLinkText.
- doc-2 notes and rule-lists page in their own commit (check-task-files).
- Round-1 lens inputs first made before the merge were deleted unrun/uncommitted and re-made on the merged head (orchestrator order).
- Lens set per the board's table after the merge (task-453): plan-protocol is output_off; queue-137, orchestrator-doc17 and five-words no longer resolve from this Files line (rule-lists.mjs resolve). So 9 compliance lists, not the brief's 13.

## Output review round 1
- Context docs/reports/reviews/task-451/context-r3.md (backlog-brief.mjs after the merge). Diff: mkdiff.sh (brief command + the fixture path), base 8820c4dba, 209,003 bytes.
- Lenses (DeepSeek, parallel, 52 runs, all exit 0, each with a VERDICT line): code-review p1-3, ux p1-3, error-paths p1-3, security p1-3; compliance surface-136, mobile-90, mobile-98, mobile-99, step-132, agents-s5-1to3, agents-s7-s11, inc-S, ms-S (split -pN by lens-input); engineering eng-all p1-4. Outputs and inputs in docs/reports/lanes/2026-11-24/BL-SFX3/.
- 181 findings (HIGH 24, MED 72, LOW 81, NIT 2, plus 2 CRIT placeholder lines) over 52 outputs, with 4 CONFIRMED, all LOW (after the ms-S p3 re-run at 17d175f53; the first run counted 184). Lane head before the close: 17d175f53. Recurring HIGH themes: the inline "report it" Text is under 44 px / a bare text CTA (Spec 90 §9, fe.57, eng 1.3; plan risk 2 says WCAG 2.5.8 exempts inline links); mobile red not proven by a hook; doc-2 C.3 note not in the reviewed diff (it is in 0e491221e, outside the Files line); 127-surface-registry.md still shows the old purpose text "faint neighbouring lots" (prior text kept + dated note); lot C of 3plus reads "Lot C" without "at the back" (no footprint field = plain letter, by design); infra-test items from task-449's merged changes.
- Grounder owed: GROUNDER.md in that folder by a seat that is not this lane.
