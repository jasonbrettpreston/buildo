# BL-MCFIX465 · task-465 McFixV2.1 Search box the Google way — REPORT (stage: work commits landed, station rerun owed)

Merge commit 2af96802f (wf2/board 7be07be67). Work commits: b3791a88c (station FAIL, 14 tests in 6 web files) and 0aa1b011e (station fixes; green2.out: related run 12 files / 247 tests passed, commit-msg gates OK) on wf2/mcfix465. First commit b3791a88c (through the real hooks; pre-commit related run 20 files / 354 tests passed; commit-msg gates OK).
Red: red.out (commit attempt with only the 8 test files and the task file staged, refused by tsc: search-web-binding.ui.test.tsx(133,23) TS2339 'rows').
Green: green.out (the landed commit's hook output). Mobile jest tests are not run by the hook: red and green UNVERIFIED until the station (RR-0467).

## What landed
- Enter runs the search (submit action, onSubmitEditing; web onSubmit); nothing opens while typing; a row tap opens its page; a chip tap submits.
- Drop-down under the box: rows (address, typed part bold), the several line after Enter, the refine line (task-450 timing), the miss line
  "No lot found for {query}" + hint after Enter (also a too-short Enter, RR-0495, and a one-row partial, O4), the outside-Toronto line after Enter.
- No radio cards, SELECT, list title, count badge or prompt line (both targets). Rows clear on the first delete; the box empties on the focus after a pushed page.
- Quiet page: chips 13 px at rest only, count 12/16 while the drop-down is closed, legal 11/15, report-soft.
- Semi page: "Is this a semi?", Yes / No / Not sure; heading 26/32 bold, answers 15/20 at 48 px (own keys; the wall untouched).
- Census: state partial / golden suggest (12 states); descriptors, goldens (12+12 search, 8 semi), slices, registry and rule-list pages regenerated.
- Dated notes: Specs 100 §4, 117 §6.1, 99 §3.4c, 126 §11b.3.

## Deviations for the output grounder
1. Files line, 11 off-line paths added by the backlog CLI (each with a notes line; orchestrator go each time; the plan line "a red one is added to the Files line by the backlog CLI before its commit"):
   - count pins that went red because the search page gains the golden suggest: src/tests/surfaces/admin-media.golden.test.ts (70 -> 71), src/tests/surfaces/site-footer.logic.test.ts (11 -> 12), src/tests/surfaces/search-reports-left.logic.test.ts (10 -> 11), src/tests/surfaces/surface-conformance.logic.test.ts and src/tests/surfaces/surface-validate.logic.test.ts (105 goldens, 442 strings);
   - src/tests/surfaces/contract-binding.logic.test.ts (non_display_keys 81 -> 82, + onSubmitEditing);
   - src/tests/surfaces/parcel-legacy-oracle.logic.test.ts (three ruled changes: the prompt testID and text, RR-0495; "No parcel found for that address.", card item 3);
   - src/tests/surfaces/nav-by-route.logic.test.ts (NAV-6, third addendum: entry audit 46 deleted);
   - the three generated docs pages docs/reports/generated/127-surface-registry.md, 127-surface-review-queue.md and rule-lists-by-kind.md: their --check gates require them current, and check-task-files.mjs:10 always allows only the task file, docs/reports/reviews/<task>/ and docs/reports/lanes/; QUESTIONS-RULED.md called them exempt, which was wrong (task-450 precedent carries them).
2. Plan addenda on wf2/board: ea79b4d9e (typing state partial with golden suggest; refine timing kept), 1aee693d6 (RR-0495, the prompt line dropped), 96556fb03 (NAV-6: web lot rows are real links).
3. Map-kind web row (multi_parcel): href undefined AND onClick null, not onClick push as the third-addendum note suggested: with a push action the renderer would wire a push handler (it draws a Link only for a string href) and the row could reach the disambiguate?q= path (S-7). No golden has a map-kind row, so golden action-name parity is unaffected.
4. The web prop name onSubmit was added to bindings.json non_display_keys in b3791a88c and removed in 0aa1b011e: the plan adds it only if SV-SBIND asks, and SV-SBIND does not judge its object value.
5. The WEB_SEARCH constant was removed from nav-by-route.logic.test.ts with a dated note (unused after entry 46 went; lint no-unused-vars).
6. Spec 100 note names two src test files without backticks so the system map (00_system_map.md, not on the Files line) does not move.
7. The merge of wf2/board (2af96802f, task-469 folded) was committed with git -c core.quotepath=false commit (scripts/board/board-commit.zsh:13 form; orchestrator go): check-partial-staging.sh:23-30 reads staged paths quoted, so the task-343 card (non-ASCII name, 32,726 bytes) read "size unreadable". The defect goes to the loose-ends card (orchestrator). The card conflict was resolved to the board side and this lane re-added its 10 Files-line paths and notes by the CLI.
8. The pre-commit related run did not select six web tests that failed at the first station run (b3791a88c); readiness was judged by the station (PASS on 0aa1b011e).
9. Review material: base 2fd2f6042 (launch) .. HEAD, the Files line paths, the launch exclude list plus mobile/__tests__/fixtures/surfaces/*.goldens.json (task-469, RR-0502); 41 files, 4 chunks.

## DoD items not ticked yet, and why
- #2 tests red then green: the red was proven by the commit hook only for the web side (red.out, tsc); the phone jest tests are not run by the hook, so their red is UNVERIFIED; their green is the station PASS on 0aa1b011e.
- #4, #7: green and evidence exist (station PASS 0aa1b011e) but are ticked at the close, after the output grounder.
- #10: the close-out reply comes after the grounder.
- #6 (queue row in the same commit): the task file rode in each work commit; no separate queue row was named for this card.

## Owed (after the station result)
Output code-review lens (context-rN via backlog-brief.mjs), FINDINGS, grounder, records commit, gate.

STATUS: ready for the station run (work commit b3791a88c); output review not started.

## Output review round 1 (2026-11-25)
- Material: 2fd2f6042..HEAD over the Files line, launch excludes plus mobile/__tests__/fixtures/surfaces/*.goldens.json; 41 files, 4 chunks (lens-input).
- Lens: code-review (the brief's one output lens; no compliance lens: every list is output_off). Outputs out-code-review-p1..p4.txt with inputs in-out-code-review-p1..p4.txt; FINDINGS.md.
- Counts: CRITICAL 0, HIGH 0, MED 6, LOW 15, NIT 1. Nothing ruled, fixed or folded: grounder owed (RR-0359).

## Round 1 fix and output review round 2 (2026-11-25)
- Round 1 grounder (Cairn-Ground-O465): 22 ids, 16 CONFIRMED (1 MED, 14 LOW, 1 NIT), 6 REJECTED; round-1 GROUNDER.md and TRIAGE.md kept outside the repo (lane scratch og-r1/).
- Fix: out-code-review-p4#1 MED fixed ab8c2911e (search-web-binding.ui.test.tsx :118, :120): red red2.out (commit attempt, SearchBinding.tsx:427 plant), green green3.out (landed; the first green attempt was refused FAIL:C:no-mf-task until the McFrontend-Task: MF-35 trailer was added). Station PASS on ab8c2911e (covers the merge 2af96802f).
- Round 2: same material rules on 2fd2f6042..HEAD (41 files, 4 chunks), context-r4.md; every review file re-made under the same names. Counts: CRITICAL 0, HIGH 0, MED 2, LOW 12, NIT 7. Repeats and new ids are listed in FINDINGS.md. Nothing fixed or folded: round-2 grounder owed.

## Round 2 close (2026-11-25)
- Round-2 grounder Cairn-Ground-O465b: 21 ids, 17 CONFIRMED (11 LOW, 6 NIT), 4 REJECTED; no CRITICAL, HIGH or MED stands; no fix, no third round (RR-0385).
- Round 2 counts as listed: CRITICAL 0, HIGH 0, MED 2, LOW 12, NIT 7. GROUNDER.md and TRIAGE.md (round 2) are in this folder; round 1 pair kept outside the repo and named in the Final Summary.
- Status BUILT, not DONE: the operator phone walk of the search box follows the push. The five Acceptance Criteria stay open for that walk.
