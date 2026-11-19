# REPORT: BL-BOX (task-356, SRCH.A6 the search box reads "Enter a Toronto address")

## Four plain lines for the operator
1. The grey hint inside the search box now reads "Enter a Toronto address" on the phone and on the web (one content value, search.input.placeholder, content.json:17, read by both; the landing page step 1 already used the same words).
2. The notice "Lots are only available in Toronto." and the reports-left line with its fixed slot are unchanged: the content diff is exactly one line (git diff 349baf1c0~1..HEAD -U0 on scripts/surfaces/parcel_product shows only the placeholder line), and the generated slice moves only the placeholder line plus its own hash comment.
3. 31 files in the landing commit 079f2d733: 5 by hand (content, 2 tests, Spec 100 note, MF-35 row note), plus the task file and its review context; 1 generated slice; 22 goldens (11 .mobile.json, 11 .web.json) each moving only their fingerprint hash line; the mobile goldens copy moves 11 fingerprint lines plus its generated input_sha comment line (24 changed lines, not 12).
4. Unproven: whether the longer words clip on the narrowest phone (no device check, UNVERIFIED); the mobile jest file was not run here; T7 and search-parity were not run by the hook (see UNVERIFIED).

## Acceptance criteria
| AC | Verdict | Evidence |
|---|---|---|
| 1 node require prints new text | MET | checks.out "--- AC1": `Enter a Toronto address` |
| 2 red then green | PARTLY | test changed first and committed (349baf1c0, red.out): the pre-commit related run SKIPPED ("no staged src/ or scripts/ source files — skipping the related-tests run") because only a mobile test was staged, so no assertion red was produced by the hook; static red: the slice then held the old value (mobile/src/generated/surfaces/mobile_parcel_search.json:24 before 079f2d733). Mobile jest is not run locally. Green: not proven by a jest run (UNVERIFIED) |
| 3 git grep only oracle:25 | MET | checks.out "--- AC3": only src/tests/surfaces/parcel-legacy-oracle.logic.test.ts:25 |
| 4 emit --check, capture --check, T7, parity | PARTLY | emit "surfaces ok (4 surfaces, 30 goldens)", "search goldens ok (11)" (checks.out); the hook run of 079f2d733 ran only parcel-legacy-oracle.logic.test.ts (3 passed); T7 equivalent: buildGoldens rewrite caller reports "changed 0" after the commit; T7 and search-parity.golden.test.ts themselves not run (no direct runner allowed): UNVERIFIED |
| 5 one-line diff, goldens fingerprint only, notice and slot untouched | MET with wording | numstat: content 1/1; 23 fixtures at 1/1; goldens copy 12/12 (11 fingerprints + input_sha comment); no diff touches search.outside_toronto or search.reports_left |
| 6 close-out names v8 departure and scratch source | MET | Departs from small-pages-v8 search.html:265, :278, :318 (Spec 100 note line 146; MF-35 row note); scratch source ~/Buildo-scratch/mcfrontend/small-pages-v8/content.json:97 and search.html still draw "Enter lot address": loose end on task-343 |

## Checks (checks.out): BEFORE head b1bfaf5b5 all rc=0; AFTER-final all rc=0; S-sbind ok (17 surfaces, 425 strings); search goldens ok (11); lotmap ok (11); semi-question ok (8); typecheck rc=0.
Order note: search-golden-capture --write does not move the mobile goldens copy; emit-mobile-surfaces --write must run after it (first emit --check showed GEN-STALE for mobile_parcel_search.goldens.json until the second write). Web goldens by a one-line buildGoldens caller (box/regen-web.ts, lane dir only).

## Hook tails
red.out (349baf1c0): "pre-commit: no staged src/ or scripts/ source files — skipping the related-tests run", "GATE OK", "POLICY CHECKS OK (commit-msg): 1 file(s)". red2-typecheck-refusal.out: first landing attempt refused at typecheck (oracle test line 25: unescaped apostrophe, TS1005/TS1002), fixed. commit.out (079f2d733): "src/tests/surfaces/parcel-legacy-oracle.logic.test.ts (3 tests)", "Tests 3 passed (3)", "GATE OK", "POLICY CHECKS OK (commit-msg): 2 file(s)".

## Reviews
One output round (r1-output.txt, repo review tool, plan-review-deepseek template; no lens templates on this head), triaged in TRIAGE.md; KEPT and folded: describe title no longer cites v7.1 as authority; doc-2 and v8 mock named as loose ends. No plan review round was run before the build (brief steps place the review after the build).

## Commits (branch wf1/inc1b-box, unpushed)
349baf1c0 test pin first; 079f2d733 the value, regeneration, notes, review context; the docs commit with this report is the last commit.

## UNVERIFIED
- Clipping of "Enter a Toronto address" on the narrowest phone and on web at 320 px.
- Mobile jest (parcelScreens.golden.test.ts) not run locally; GitHub Mobile CI runs it after the next push.
- T7 (admin-media.golden.test.ts) and search-parity.golden.test.ts not run by me (hook related run did not select them); the push station suite will.
- Assertion-level red for AC2 (see AC table).
- backlog/docs/increments/doc-2 lines 31, 100 still say "Enter lot address" (not edited; owner decides).

STATUS: ready
