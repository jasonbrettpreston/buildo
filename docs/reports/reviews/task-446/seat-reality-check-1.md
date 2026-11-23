# Seat: reality-check: task-446 plan (PLAN-446-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Basis: board head eb7aad381 (the plan says it read 4382d48d3; `git diff --stat 4382d48d3 eb7aad381` shows only the task-446 file changed, so no drift). Read: the task card and plan whole. Spec 135 (rows 1-79, :13, :15, :17), Spec 136 (:1-35, :160-215, headers :11, :28), Spec 128 :205, :206, :224, Spec 126 :62-66, :1236-1240. generate-surface-handbook.mjs whole, handbook-rule-map.logic.test.ts :1-481, register-locks-resolve.infra.test.ts, rule-lists-table.logic.test.ts :195-235, rule-lists.mjs (BOUND, NOMINAL, buildLensInputs), rule-lists.json, docs/reports/generated/rule-lists-by-kind.md, 00_system_map.md :100, cite-parse.mjs, MORNING-DECISIONS.md :1859, :1901-1903, :1916-1926, :1975-1976, :1990-1996, REPORT-429:234, task-439 :66-69, :104, :146 and its review files, task-430 commit d429b287d, ~/Buildo-scratch/ids (owners of FE-45, FE-58, MF-95, round-200). I ran only `git show/grep`, `sed`, `wc`, and two read-only `node` calls (rule-lists.mjs resolve; a JSON key read). No test runner, no .env, no DB.

CONFIRMED (checked and true):
- R-03 is stated by FE-49 (135:71; fe.49 at 136:178-179, "(128:205, R-03)"). R-04 is stated by FE-52 (135:74; fe.52 at 136:187-188, "(Spec 128 R-04, 128:206, ACCEPTED)"). No other Ruling cell cites 128:205, 128:206 or 128:224 (awk over every `| FE-` row: 128:205 gives FE-49 only, 128:206 gives FE-52 only, 128:224 gives none). R-22 is stated by no FE row, and `git grep -n '128:224\|R-22\b' -- src/tests scripts` returns nothing.
- Counts: `grep -c '^| FE-'` gives 57; `Status: OWED` in 136 gives 21 (136:28 reads "57 in force (21 OWED"). After the row: 58 and 22.
- Predicted reds: T1 is red at R-22 (length 0) and green for R-03 and R-04. T2 is red at `toHaveLength(1)` (0 rows hold the lock). The old C-T2 `rows.slice(-13)` would hold FE-46..FE-58 against fresh FE-45..57, so it is red. The old C-T1 `stripRows(.., rows.length - 12)` leaves FE-58 after a gap and `readFeRows` throws "no gap or reorder" (generator :130). The old :297 `[ids[12]]` strips FE-57 and leaves FE-58, so it throws and `.not.toThrow()` is red.
- The R-22 Ruling text in the plan equals 128:224 with bold removed. The lock path mobile-no-rsc.logic.test.ts does not exist.
- The headline renders as the plain cell: the cell is about 360 characters, over the 300 clip, so `wholeHeadline` returns `plainCell` (:58-64). A-T2 (headline equals plainCell) and A-T6 stay green.
- Rendered line is 385 characters including newline. Section 2 is 28,690 characters today, so about 29,075 after.
- Quotes of MORNING-DECISIONS :1859, :1901-1903, :1975-1976, :1992 ("UNVERIFIED by me"), :1993, :1994, :1995 and task-439 :66, :67, :68, :69, :146 are accurate.

FINDINGS:

rc#1 LOW. Plan cites for RR-0385 items are off by a few lines.
- Plan: "Planner: Opus, read-only (RR-0385 item 1, ... MORNING-DECISIONS.md:1916)" and "(RR-0385 item 4(ii), :1918-1919)".
- Evidence: MORNING-DECISIONS.md:1916 is "Ruled (RR-0385), each from his words above:"; item 1 is :1917; item 4 VALIDATION, whose clause (ii) is the "answer rests on a wrong fact" test, is :1920. Item 6 at :1922 is correct.
- What goes wrong: a reviewer or grounder following :1918-1919 lands on items 2 and 3 (seats, rounds), not the rule the plan relies on to justify showing him the dropped R-03 and R-04.
- Fix: item 1 at :1917; item 4(ii) at :1920.

rc#2 LOW. Spec 126 line cite is wrong, and the E pass justification is thin.
- Plan: "E pass because R-22 is about the render path of each platform (Spec 126 §0a item 6, 126:63)".
- Evidence: 126:63 reads "5. **Honest display:** ..."; item 6 "**Same everywhere:** mobile, web, admin and PDF render the same declaration" is 126:64.
- What goes wrong: the cite points at the wrong principle. E means "the same declaration renders everywhere", and R-22 says web and mobile use different mechanisms, so "pass" needs a sentence on why; the plan calls it judgement (Q3).
- Fix: cite 126:64, and either mark E n/a (as FE-48 and FE-49 do for non-render rules) or state the reasoning in Q3.

rc#3 LOW. Generator and rule-lists line cites are off.
- Plan: "The generator throws on a gap (generate-surface-handbook.mjs:123-127)"; "the build throws 'no gap or reorder' (generator :124)"; "parses readings (:77-79)"; "(task-430 plan section 3 cites rule-lists.mjs:529)".
- Evidence: the gap throw is at :128-131 (the "no gap or reorder" message is :130; :123 is the "register row twice" throw); reading parsing is :72-105 (:77-79 are READING_RE tail and NOTE_DATE); `const NOMINAL = 30000` is rule-lists.mjs:534 (BOUND = 120000 is :29).
- What goes wrong: only navigation; the claims themselves hold.
- Fix: :128-131, :79-105, rule-lists.mjs:534.

rc#4 LOW. The size reasoning misreads what 30,000 is.
- Plan: "That is still one part under the 30,000 nominal (task-430 plan section 3 cites rule-lists.mjs:529)".
- Evidence: rule-lists.mjs:534 "NOMINAL = 30000; // characters of material per review"; :29 "BOUND = 120000"; the page header says parts are "at a material of 30,000 characters (a list is split ... when list plus material pass the review tool bound)". surface-128 is 77,169 characters and is 1 part; surface-135 at 111,851 is 3 parts.
- What goes wrong: nothing breaks (29.1K is far under the roughly 80K single-part range), but the stated reason is wrong. The plan states the surface-136 size claim (about +420) slightly high (actual +385). It does not state the surface-135 growth (row plus dated note, about 2K); whether surface-135 stays 3 parts is UNVERIFIED (it is near 3 parts at 111,851). `page --write` and the pre-commit `page --check` measure it, so the risk is only a different table row.
- Fix: say "list plus 30,000 material stays under the 120,000 bound, one part"; leave the surface-135 part count to `page --write`.

rc#5 LOW. The "RSC mentions are only why strings of web admin descriptors" claim is false.
- Plan: "The only RSC mentions in scripts/surfaces are `why` strings of web admin descriptors (for example scripts/surfaces/parcel_admin/F03/surfaces/admin_export_audit.descriptor.json:146). None of them is a check."
- Evidence: scripts/surfaces/_schema/surface.schema.json:461-465 describes platform "web" as "server-side (RSC) on Vercel" and "mobile" as "a fetched projection - RN has no Server Components"; census files (admin-new.json, web-product.json:3276, mobile-product.json:1975 "(React Native has no server components)") also carry it. The :146 cite is true for the one file named.
- What goes wrong: the conclusion (stated in no handbook line, enforced by no check) still holds, since the schema text is a `description`. But the evidence sentence would not survive a grounder's grep, and R-22's substance is already stated in the schema.
- Fix: say "no check; the only statements are schema `description` text (surface.schema.json:461-465) and census `why` strings".

rc#6 LOW. The card's Definition of Done cites stale lines, and the plan reuses one of them.
- Plan: "It saves the first red in its red.out ... (08_agents.md:462, :489)".
- Evidence: "Every lock is proven in BOTH directions" is 08_agents.md:489 (DoD #2 says :462); "Red tests first, then the code" is :517 (DoD #3 says :490); "Every reply ends with one line" is :534 (DoD #10 says :505). Spec 137: the "DONE" status definition is :77 (DoD #7 says :63), Rule 3 is :98 (DoD #6 says :84), Rule 10 "A ruling enters a row as a verbatim dated note" is :125 (DoD #5 says :109).
- What goes wrong: DoD #1 requires quotes with file:line; these do not resolve. Plan's ":462" is wrong, ":489" right.
- Fix: correct the DoD cites and drop ":462".

rc#7 NIT. "Nothing is added to it" for the Ruling cell.
- Plan: Ruling cell "No Server Components on mobile. "React Native ..." (Spec 128 R-22, 128:224, ACCEPTED)" and "The quote is the 128:224 Ruling cell ... Nothing is added to it."
- Evidence: the quoted part is exact; the lead sentence "No Server Components on mobile." is the lane's own title (same form as FE-45..57, e.g. "The scope fence.").
- Fix: say "the quote is unchanged; the lead sentence is a title".

rc#8 NIT. A constraint is stated too strongly.
- Plan: "The cell must hold no 'Dated note' and no 'Current reading'."
- Evidence: the generator only counts dated notes (:146) and parses a reading when a strict-form last note or the text "Current reading:" is present (:91); a plain dated note in an OWED row's Status cell is legal (readingOf returns null).
- Fix: "must not contain the text 'Current reading:'". Harmless as written.

Not checked / UNVERIFIED: the exact post-write size and part count of surface-135; whether task-445 changes the page output.
