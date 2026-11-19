# TRIAGE r1 (plan review, deepseek-reasoner, r1-plan.txt), lane BL-C12, task-321

| # | finding | verdict | reason (opened file:line) |
|---|---|---|---|
| 1 | CRITICAL AC steps missing / pre-register alone | REJECTED | The ACs are the generic imported ones; the brief (BRIEF.md:4, :13) fixes one feat commit with the context file and the MF row note in it; MF row exists (.cursor/MCFRONTEND-QUEUE.md:396). Close notes mark the generic ACs met or not applicable. |
| 2 | HIGH 35 s text in the generated pack | REJECTED | Not this task; generated pack text (context file), no code here. |
| 3 | HIGH link not bound to logic_variables.maxbld_support_inbox | REJECTED | Brief scope: link only, NO new setting/read (BRIEF.md:4); the Help page reads the setting (src/lib/surfaces/maxbld-support.ts:13-30). |
| 4 | HIGH two rows on multi_parcel | REJECTED as a defect, KEPT as a clarification | multi_parcel draws no notice (LotMapBinding.tsx:214-226), so row and notice link never share a state; clarification folded in the context file. |
| 5 | HIGH open_help throws on hosts that lack it | REJECTED | Existing renderer contract (SurfaceRenderer.tsx:113, pinned by the MF-35 unknown-action plant); changing it is scope creep. KEPT part: a root test checks disambiguate.tsx passes open_help. |
| 6 | HIGH Dependencies none vs pin stale | REJECTED | The orchestrator orders BL-LOTFIX and this lane (task brief); pins untouched by instruction; before/after counts reported. |
| 7 | HIGH wrong-lot is no Help topic | KEPT as a report item | Topic is ruled by v8 (choose-lot.html:279) and the brief; the Help page may not change (BRIEF.md:4). Reported as an operator item: add a wrong-lot topic to scripts/surfaces/_schema/static-page.json web_help, or use lot_match/address_match. |
| 8 | HIGH requirement text missing in pack | REJECTED | Generator defect, not this task; I read doc-2:49,:64 and CURRENT-SEARCH.md:209-215,:357-363 directly. |
| 9 | MEDIUM empty/unencoded query | REJECTED | helpUrl encodes both values (mobile/src/lib/maxbldHelp.ts:9); derived query is always a string (LotMapBinding.tsx:251 lotMapData); HelpPrefill cleans control characters (HelpPrefill.tsx:17-24). |
| 10 | MEDIUM address in fragment | REJECTED | Existing design (maxbldHelp.ts:4-6; Spec 100 s2.8), same as the report link. |
| 11-14 | MEDIUM generator noise (undefined quotes, RR-0005/0044 titles, repeated INC5 lines, doc-2 table contradictions) | REJECTED | Generated pack, outside the task. |
| 15 | MEDIUM rollback / git diff check | REJECTED | Commit is the unit; hooks and every generator --check on the tree are the check (checks.out). |
| 16 | MEDIUM counting premise | KEPT | Counting rule stated: keys, screen-checks.mjs:394 (measured 418 now, 420 after). The "whitelist unchanged" assertion is dropped from my test. |
| 17 | MEDIUM unauthorized/redirect vacuous | REJECTED, KEPT part | Those goldens exist (src/tests/fixtures/surfaces/mobile_parcel_disambiguation_map/unauthorized.mobile.json, redirect.mobile.json); KEPT: the test classifies every golden file in the folder (closed list). |
| 18 | MEDIUM B.7 report-in-no-lot-message half | REJECTED | v8 draws only the link (choose-lot-states.html:278); brief: the same link only. |
| 19 | MEDIUM resume-after-help, openURL catch | REJECTED | Existing openHelp behaviour; selection is component state of the same page; not changed here. UNVERIFIED on device. |
| 20 | MEDIUM deployed Help page may lag | KEPT as UNVERIFIED | No network/DB; carried to the report. |
| 21-27 | LOW/NIT sha prefix, paths, ids, status, cap notice, grep scope, size label, headings, title | REJECTED | Generated pack or style; no effect on the build. |
| 28 | NIT generic key name | KEPT | Keys renamed help.lot.prompt, help.address.link. Reusing S.report/S.reportText is the existing-components rule (memory build-with-existing-components); own tokens REJECTED. |

# TRIAGE r2 (output review, one lens, r2-output.txt)
| # | finding | verdict | reason (opened file:line) |
|---|---|---|---|
| 1-2 | CRITICAL slice and goldens absent from the diff | REJECTED | The review diff was filtered to code paths by me (diff.patch); the commit has them: `git show --stat 70bf820bf` lists mobile/src/generated/surfaces/mobile_parcel_disambiguation_map.json and 11 goldens; the 16 tests passed in commit.out. |
| 3 | HIGH unlinked_no_pin unclassified | REJECTED | No committed golden for that state (folder lists 11 files; the closed-list test passes); the state shares the helpLink call with `unlinked` (LotMapBinding.tsx:229). |
| 4 | HIGH open_help argument shape | REJECTED | SurfaceRenderer.tsx:123-124 calls act.open_help(String(a.topic), String(resolveValue(a.q))) = openHelp(topic, q) (maxbldHelp.ts:12); same wiring as index.tsx:103. |
| 5 | MEDIUM derived query unresolved | REJECTED | lotMapData supplies derived.query (LotMapBinding.tsx:251); golden test fixture situations carry a query. |
| 6 | MEDIUM Button link variant | REJECTED | Same props as SearchBinding.tsx:186-192 (variant link, accessibilityRole link). |
| 7 | MEDIUM no link on error states | REJECTED | v8 draws the link only on the three notices and the cards (choose-lot-states.html:267,:278,:289; choose-lot.html:279). |
| 8 | MEDIUM encoding | REJECTED | helpUrl encodes both values (maxbldHelp.ts:9), pinned by maxbldHelp.test.ts:10. |
| 9 | LOW placement | REJECTED | choose-lot.html:278-279 puts the row after the Continue button; states 267/278/289 put the link after the banner. |
| 10-12 | LOW/NIT test style, wider mailto guard, start guard | REJECTED | No effect on the lens; no defect. |
No KEPT defect: no fix commit.
