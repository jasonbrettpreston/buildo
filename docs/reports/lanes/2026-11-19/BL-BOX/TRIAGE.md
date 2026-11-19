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
