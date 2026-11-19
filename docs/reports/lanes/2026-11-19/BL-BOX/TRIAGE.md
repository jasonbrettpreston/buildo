# TRIAGE: BL-BOX output review round r1 (r1-output.txt, 1 round; max_fix_rounds 2)
| # | Finding | Verdict | Evidence |
|---|---|---|---|
| 1 CRITICAL | 23 goldens absent from the diff in the context | REJECT (context cut, not the commit) | I pasted a path-limited diff; the goldens moved: git diff --numstat shows 23 files at 1/1 plus the goldens copy 12/12; checks.sh after2.out: emit "surfaces ok", search goldens ok (11) |
| 2 HIGH | assertion line appears as context, not added | REJECT | the test was committed first (349baf1c0), so the working diff shows it as context; the commit holds the change |
| 3 HIGH | AC4 evidence not reported | REJECT for the context, KEEP for the report | checks in after2.out; T7 and search-parity run in the landing commit's related run (commit.out) |
| 4 HIGH | oracle test not run | KEEP (done by landing run) | oracle is a src test staged in the landing commit; its related run is in commit.out |
| 5 HIGH | doc-2 lines 31 and 100 silent | KEEP | doc-2 "Increment-S-requirements.md:31" and :100 still say "Enter lot address"; task says the lane says whether lanes edit it: not edited (an increment requirements doc, owner decides); listed as loose end on task-343 and in REPORT |
| 6 HIGH | close-out names v8 departure and scratch source | KEEP | in the Spec 100 note, the MF-35 note (search.html:265/:278/:318) and REPORT; the scratch source ~/Buildo-scratch/mcfrontend/small-pages-v8/content.json:97 still owes the change (task-343 loose end) |
| 7 MED | who writes the goldens copy | KEEP as fact | measured: search-golden-capture --write did NOT move it; emit-mobile-surfaces --write (second run after the capture) did: it copies the *.mobile.json goldens (emit-mobile-surfaces.mjs:8, :56). Order matters: capture, then emit |
| 8 MED | AC5 singular fingerprint line | KEEP as wording | goldens copy also moves its generated input_sha comment line (12 lines): reported in REPORT, not an error |
| 9 MED | clipping on narrow phone | KEEP as UNVERIFIED | device check not possible here; in REPORT line 4 |
| 10 MED | ordering with task-351 | REJECT | task-351 is already in this head (a415d8e3a, 1e376f924); one regeneration on the tip |
| 11 MED | decision-98/99 may not exist | REJECT | ls backlog/decisions: decision-98 (RR-0313), decision-99 (RR-0314) exist |
| 12 MED | describe title cites superseded v7.1 | KEEP, FIXED | title now "(RR-0313; was small pages v7.1 item 9)" |
| 13 MED | no test that the box receives the placeholder | REJECT (scope) | binding lines SearchBinding.tsx:77 / web :123 already pinned by existing binding goldens (placeholder ref {"content":"search.input.placeholder"}); a new test would be scope creep (PLAN-PROTOCOL.md:3) |
| 14 LOW | hint says "lot", placeholder says "address" | REJECT, noted | out of scope: task says search.input.hint does not move |
| 15 LOW | fingerprint churn McRecommendation | REJECT | out of scope |
| 16-18 NIT | truncation, undefined quotes, commit ids | REJECT / noted | cut was in the paste; commit ids in REPORT |

# Round 2: DeepSeek lens set on the diff (r1-compliance.txt, r1-ux.txt), grounded by BL-BOX
Lenses that ran: compliance and ux (templates read from wf2/board by git show; the worktree was NOT rebased onto wf2/board: the brief forbids history rewriting, so I did not run git rebase; this lane's diff does not touch files the board commit moves, UNVERIFIED by merge). The generic r1-output.txt round also ran earlier (landing came before the lens message reached me). Lenses ran on a path-limited diff.patch (lines cut at 700 chars) with the fixtures given as numstat only.
| Finding (both lenses) | Verdict | Evidence |
|---|---|---|
| Fixtures absent from patch (HIGH/CRITICAL) | REJECT | by design of the payload: git diff --numstat in diff-numstat.txt lists 23 fixtures; search-golden-capture --check "search goldens ok (11)", regen-web "changed 0" |
| Notes end mid-sentence / unterminated quote (MED) | REJECT | truncation from my cut -c1-700: spec line 146 ends "(loose end, task-343)." ; queue line 148 ends "Task: task-356 (Increment 1·B)." (grep) |
| old input_sha 9d3ad6a11d376ff2 pinned elsewhere (HIGH) | REJECT | git grep -l 9d3ad6a11d376ff2 finds only docs/reports/reviews/task-356/context-2026-11-19.md; emit --check ok |
| Items a and b of the operator answer not covered | REJECT | out of scope; task-356 is item c only; a and b are RR-0311 and the no-plan task (task-352 answers) |
| test asserts data against itself | REJECT | existing pattern (parcelScreens.golden.test.ts:243-248 pre-change); renders are pinned by the 22 goldens |
| no assertion for search.outside_toronto (RR-0314) | REJECT | already pinned by golden refs mobile/__tests__/fixtures/surfaces/mobile_parcel_search.goldens.json:1620 and parcelSearch.situations.json:382; a new test is scope creep (PLAN-PROTOCOL.md:3, DoD 8) |
| label and placeholder near-identical; vocabulary drift (lot/parcel/address); third rename | REJECT | operator ruled the words (RR-0313); hint is another key (task: does not move); recorded in UX note below |
| clipping on narrow phone, Dynamic Type | KEPT as UNVERIFIED | in REPORT, line 4 |
| second copy / locale variant of the content | REJECT | task grounded: one source, F06 landing has none; git grep "Enter lot address" over scripts mobile src finds only oracle:25 |
| spec/queue note should carry the full path | KEPT, FOLDED | spec line 146 now uses the full repo path; queue row 148 names the key and file by the form `mobile_parcel_search.content.json` as in the BL-GAP13 note (:144), left as is |
| oracle prose map, can\'t escape, negative grep test, $comment key, describe/comment history | REJECT | pre-existing patterns; out of scope; the first landing attempt already proved the escape needs the backslash (typecheck refusal) |
| web asserted but only mobile path patched | REJECT | web imports the same file (src/lib/surfaces/maxbld-web.ts:6, :22; task grounding); web goldens moved (11 .web.json) |
