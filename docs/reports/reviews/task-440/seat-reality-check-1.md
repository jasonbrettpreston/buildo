# Seat: reality-check: task-440 plan (PLAN-440-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Basis: board head 77d54ecc7 (the plan read eb7aad381; `git diff --stat eb7aad381 HEAD` on 00_engineering_standards.md and docs/specs/02-web-admin is empty). Read: the task card and plan; 136 section 2 (all 57 Status lines); Spec 135 rows FE-08, FE-09, FE-16; 00_engineering_standards.md (headings, sections 4.4, 10, 11, 12.11, 12.12, 14); surface-rule-map.json; register-locks-resolve.infra.test.ts; spec-paths.infra.test.ts; nav-by-route.logic.test.ts; BL-COMPLY FINDINGS.md :61-79 and GROUNDER.md; BL-COMPLY3 and BL-GROUND GROUNDER-2.md; BL-RULESACC GROUNDER.md; REPORT-429 sections 1 and 3B; proof-slices.json :10-18; ReportPage.tsx; format.ts; project.ts; MORNING-DECISIONS.md :1905-1935 and :1972-1996.

Checked and TRUE: 57 lines, 36 RULED, 21 OWED, 35 `Enforced by:` paths (all 35 tracked; no UNTRACKED printed). fe.39's lock is the only tracked OWED lock. FLIP_PENDING is at register-locks-resolve.infra.test.ts:30 and the REGISTER const at :18. surface-rule-map.json `rules` has 57 entries (36 active, 21 owed). 52 `### N.M` subsections (with `grep -E`). The 6 registry rows are :462-467. Section 11 has 43 checklist items. K2 gives exactly 3 lines, all BL-RULESACC GROUNDER.md on mobile/src/lib/maxbldHelp.ts:18-19. 144 `*.db.test.ts` are tracked. The proof-slices lines :12, :15, :17, :18 are as cited. fe.18, fe.25 and fe.36 line cites and quotes are right. The group 3 list of 19 fe lines plus 5 eng rows adds up to 24. D6's "D6 of the BL-GROUND verdicts" is at report-sqft-rounding.property.test.ts:3. enforcement.logic.test.ts:2 does cite the wrong path. The task-365 table row for fe is 44 lines (35 lock, 8 OWED, 1 other).

## rc#1 HIGH: fe.08 is not "none"; its lock is named in Spec 135 as "see FE-16"
Plan: "fe.08 (136:55-56) is RULED with no check named" (E1); status rule "none: ... or RULED with no check named (fe.08)".
Evidence: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md:30 FE-08 "RULED 2026-11-04. Lock: see FE-16." FE-16 (:38) names `src/tests/surfaces/spec-paths.infra.test.ts`. spec-paths.infra.test.ts:2 reads "FE-08 (the doc set; its lock is this one, \"see FE-16\")". register-locks-resolve.infra.test.ts (the `RULED with no lock path and no "see FE-nn"` check, rule 2) enforces the pointer.
What goes wrong: the look lists as "none" a rule that has a tracked lock. The plan reads only the 136 Status line, which drops the "see FE-nn" pointer. Two readers of 136 alone and of 135 get different answers. task-367 would be sent to write a test that exists.
Fix: add to the group 1 check source "the Spec 135 row's Lock cell, including `see FE-nn`". Set fe.08 to the spec-paths lock and judge its scope (it checks that 135 and 136 exist at the ruled paths, not the whole doc-set sentence).

## rc#2 HIGH: worked example G1 (fe.36 / D7) is stale and its "partly" reason is wrong
Plan: G1 row "partly | the lock walks its DIRS only (nav-by-route header :10) | D7 F-229 HIGH ... ReportPage.tsx:251 plain <a>: open or fixed is UNVERIFIED".
Evidence: src/components/report/ReportPage.tsx (Button case) now reads `return <Link key={key} href={String(p.href)} ...`. Commits b01c90e60 "footer links are route links at 44 px (FIX.FOOTER)" and fb1bd92 touch it. nav-by-route.logic.test.ts:40-44 DIRS now includes 'src/components/report'. The header at :10 says a new file in DIRS is covered with no list edit.
What goes wrong: D7 is fixed and verifiable by one read. The scope reason does not apply to the file named. Every directory-walk lock has a stated scope, so "DIRS only" makes every such lock "partly" and the rule cannot be applied the same way by two readers. The worked example is the template the lane copies.
Related, also verifiable now and not UNVERIFIED as in plan section 12: D2 (format.ts has no 10.7639 or SQFT_PER_M2), D8 (fb1bd92), D9 (project.ts:79 pinnedWindow from the seed). Four of the seven items the plan leaves UNVERIFIED are readable as fixed.
Fix: replace G1 with a row whose reason is a quoted gap between rule text and check text, not "has a scope". Define "scope gap" as rule text that names more than the check's stated scope. Move D2, D7, D8, D9 to "fixed since" with the commit.

## rc#3 HIGH: the known-break source list stops at D1-D12 and mislabels the "Outside" list
Plan: "K1: BL-COMPLY GROUNDER.md section D, :44-106 (D1-D12; C1-C4 are conflicts)"; "Outside the three groups (D1 doc-16 P3; D5 Spec 99 B1; D10 tooling; the K2 lines ...)"; acceptance 4 "each of D1-D12 and each K2 line appears once".
Evidence: docs/reports/lanes/2026-11-20/BL-COMPLY3/GROUNDER-2.md and BL-GROUND/GROUNDER-2.md (identical, `cmp` same) add D13 (:28, docs/operator), D14 (:34, mobile/src/lib/semiQuestion.ts 60 s literal, rule Spec 126 P4 and Spec 128 Rule 3 = the tunables-are-data row, handbook fe.47), C5 (FE-39 conflict, F-1061) and extend D3 (S3 strike, +F-504 F-657 F-668 F-908). The section D rules also split as: D4, D9, D11, D12 are outside the groups (Spec 99, Spec 132 core.8, Spec 08), yet the plan names only D1, D5, D10. D3 (docs) and D4 (docs) fail the plan's own definition "CONFIRMED verdict ... on product code" but D3 cites eng section 14 :463, a group 2 row.
What goes wrong: D14 is an open-looking product break on a group 1 row (fe.47) and it is missed. Acceptance 4 cannot be met as written, because D3 and D13 are neither on a ranked row nor on the Outside list by the plan's own rule.
Fix: list GROUNDER-2.md D13, D14, C5 in K1. Say what happens to docs breaks (D3, D4, D13): rank them or put them under Outside. State the Outside list by rule (any D whose cited rule is not a row of a group), not by example.

## rc#4 MED: group 2 is about 150 checks, not 58 rows; the size and 2-3 hour estimate do not hold
Plan: "about 57-58 + 58 + 24 = about 140 rows ... fits one lane"; Q3 "a subsection with several 'Rule:' bullets is one row. It is partly when any bullet is unchecked, and the row names the unchecked bullet".
Evidence: outside section 11, 00_engineering_standards.md has 149 `^- \*\*` bullets (59 are `**Rule**`), plus 5 numbered sub-rules in 12.11; section 14 has 6 rows. The citing-file search the plan prescribes returns 110 files, about 40 of them descriptor JSON under scripts/surfaces/.
What goes wrong: to mark a subsection "enforced" or name the unchecked bullet, the lane must test each bullet against each candidate check. That is about 150 comparisons over 110 hits, not 58. The "close groups 1 and 3 first" fallback leaves group 2 (the task-441 input) the part most likely unfinished.
Fix: size group 2 by bullets (state about 150), or make the row unit the subsection and drop "names the unchecked bullet". Say descriptor JSON hits are not checks. Plan two lanes or a staged landing, group 2 first by risk.

## rc#5 MED: the subsection count command as written returns 0
Plan: "each numbered subsection `^### [0-9]+\.[0-9]+`, which gives 52 (`grep -c`)".
Evidence: `grep -c '^### [0-9]+\.[0-9]+'` prints 0; `grep -cE ...` prints 52.
What goes wrong: acceptance 1 ("Group 2 has 52 + 6 = 58 rows") and the header "each counting command and its output" would record 0 or a hand-fixed command.
Fix: write the command with `-E` (the fe commands are fine without).

## rc#6 MED: the group 3 criterion is not decidable; the list of 24 is a guess the criterion contradicts
Plan: group 3 = rows "whose text names a database table or column, a stored value, a route response or contract, or the producer"; the 19+5 list; acceptance 1 "24 ... plus or minus recorded differences".
Evidence: 136 fe.22 ("declared database keys"), fe.26 ("real writer and reader"; OWED lock is error-count.db.test.ts), fe.29 and fe.34 (report-tree and report-page contracts naming the field and source), fe.35 (server-formatted values) all fit the criterion and are not on the list. fe.40 (McTest layers) is on the list but names no table or column. Plan section 12 admits "Not every line's full text was read".
What goes wrong: two readers get different group 3 sets, and the acceptance test accepts any difference. task-442's input is whatever the lane guessed.
Fix: replace the prose criterion with a mechanical one (the row's Spec 135 lock or text cites binding-sources.json, a contract descriptor, a `.db.test.ts` or a named table), or accept the list as a seed and require the lane to print its include/exclude reason for every group 1 and 2 row.

## rc#7 LOW: the task-365 "only truly new reading" claim is half right
Plan E4: "Group 2 is therefore the only truly new reading".
Evidence: FINDINGS.md:67 covers 44 fe lines; the board has 57. fe.45-fe.57 (13 lines, all OWED with no tracked lock) were never in that table (all 13 added since).
What goes wrong: small; group 1 also has 13 unreviewed lines, so the "35/8/1" numbers cannot be copied through.
Fix: say the table covers fe.01-fe.44 only.

## rc#8 LOW: 136 headlines may be clipped, so "covers the whole rule" may not be decidable from 136 alone
Plan: row quotes are "20 words or fewer" from 136 and enforced needs "no quoted line shows the check covers less than the rule".
Evidence: REPORT-429 :11 item 3 says 16 of 44 lines end in "..." (HEADLINE_MAX = 300, scripts/analysis/bylaw/bylaw-register.mjs:38). UNVERIFIED whether task-430 fixed the clip at the board head (I did not open the generator).
Fix: tell the lane to read the Spec 135 row when a 136 line is clipped.

## rc#9 NIT: line cites off by a few lines
check-lane-close.mjs: the no-lane exemption starts at :468 (plan :466-472 holds it); the TASK-file refusal is at :504 (plan :501-503); phases at :518 (plan :517-522); the context-file refusal is :481 (plan :480). task-446 plan: the FE-token refusal is at :223 (plan says :233). G2 quote drops the backticks around `fast-check`. These do not change the outcome, but the acceptance asks "every check cell is a path at S, with a line".

Status rule decidability, per group: group 1 is decidable for RULED-with-path and OWED-without-lock, not for the "quoted scope gap" clause (rc#2) or fe.08 (rc#1). Group 2 is decidable per bullet only (rc#4). Group 3 is decidable once the Bound and Available checks are named, but see rc#6 and rg#4.
