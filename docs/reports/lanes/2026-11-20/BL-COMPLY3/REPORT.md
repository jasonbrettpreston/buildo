# REPORT: BL-COMPLY3, task-369 (COMPLY.5), second handbook pass on git diff 9f04d9074..3a36e8b26

Status line (Spec 137 rule 3): BL-COMPLY3 lane, task-369, Increment 1·B: the four sources packed whole and verbatim, 105 lens runs done, FINDINGS-2.md written untriaged for the grounder (task-368); no product file changed; no push; no database.

## Five plain lines for the operator
1. Rule-bearing lines (counted by pattern, not rules) per source, and sent: Spec 126 174 of 174; Spec 127 37 of 37; Spec 128 77 of 77; Spec 135 full rows 48 of 48. All four sources went whole (1238, 364, 310 and 88 source lines), 21 pack parts, every part met all 5 diff parts.
2. Findings per source (BUG+DEFER; by severity CRIT/HIGH/MED/LOW/none): Spec 126 306 (0/68/164/69/5); Spec 127 72 (0/36/29/7/0); Spec 128 106 (1/32/49/20/4); Spec 135 101 (0/16/49/35/1); total 585, ids F-492 to F-1076. All untriaged.
3. Three most serious-looking, quoted and not judged: F-904 (the one CRIT) "the only adjudication in this diff is made by the pass that raised it and is self-declared not an operator ruling, so the 48 px token has no valid adjudicator" (scripts/surfaces/_schema/bindings.json:1); F-584 "the semi hold ... the suppression of `page`, the semi_pending re-test and the in-memory compute fallback are all cited to RR-0278, RR-0310, SRCH.METER-2/task-360, LOAD.1/task-266 and task-319, none of which is in the pasted context, so no pasted clause authorises any of them" (src/app/api/parcels/lookup/types.ts:45); F-556 "the strict projection gains a seventh, non-optional key, yet the only change to the producing file in this diff is a comment ... so no pasted line computes or sets the key and the strict parse of the six-field body is unsatisfiable" (src/app/api/parcels/entitlement/types.ts:18).
4. Could not be reviewed: the rest of the 510 changed files (src/lib/parcels, src/lib/report-projection, report page and components, scripts/analysis, all tests, 160 goldens and fixtures) were not sent to these specs (the brief named only the surface, mobile and lookup/entitlement parts); the two generated slices under mobile/src/generated/surfaces; the rulings RR-0278, RR-0307, RR-0309, RR-0310 and tasks the diff cites are not in any pack, so the lens could only say "cannot see"; 14 of 105 runs hit the 8-finding cap and may have had more.
5. Unverified: no finding is checked against the live tree beyond the mechanical "Opened" line (249 of 585 read "quoted code not there", mostly because the lens cites diff-relative line numbers; the grounder opens them); the duplicate list is a mechanical test (12 pairs, all on the two first-pass findings F-152 and F-387); the rule-bearing counts are a pattern count.

## Coverage table
| Source | Pack parts | Rule-bearing lines | Sent | Runs | BUG | DEFER | CRIT | HIGH | MED | LOW | none |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Spec 126 (126_maxbld_surface_standard.md:1-1238) | 11 | 174 | 174 | 55 | 92 | 214 | 0 | 68 | 164 | 69 | 5 |
| Spec 127 (127_surface_conversion_procedure.md:1-364) | 2 | 37 | 37 | 10 | 38 | 34 | 0 | 36 | 29 | 7 | 0 |
| Spec 128 (128_surface_standard_policy.md:1-310) | 4 | 77 | 77 | 20 | 43 | 63 | 1 | 32 | 49 | 20 | 4 |
| Spec 135 (135_mcfrontend_decisions_register.md:1-88) | 4 | 48 | 48 | 20 | 24 | 77 | 0 | 16 | 49 | 35 | 1 |
| total | 21 | 336 | 336 | 105 | 197 | 388 | 1 | 152 | 291 | 131 | 10 |

Diff parts (production only; sizes in characters): schema 31215, content-route 27095, web 22727, mobile-ui 31971, mobile-src 22948. Excluded and listed: mobile/src/generated/surfaces/mobile_parcel_disambiguation_map.json and mobile_parcel_search.json (generated slices); no test, golden or fixture file lies under the named paths.

## Pack verification (verify-packs.mjs, line by line)
```
126: 11 parts, 1238 pack lines compared one by one with the source line they claim, 1238 source lines, concatenation equals the source whole: true, mismatches: 0
127: 2 parts, 364 pack lines compared one by one with the source line they claim, 364 source lines, concatenation equals the source whole: true, mismatches: 0
128: 4 parts, 310 pack lines compared one by one with the source line they claim, 310 source lines, concatenation equals the source whole: true, mismatches: 0
135: 4 parts, 88 pack lines compared one by one with the source line they claim, 88 source lines, concatenation equals the source whole: true, mismatches: 0
VERIFY PASS
```
Deviations, stated: (a) the Spec 135 register is one heading section of 72720 characters, so it was split at table row boundaries (header repeated and labelled in parts p3 and p4; the verifier skips it); (b) no section was left out as history: none of the four sources marks a section as history. (c) Run bound: pack part under 33000 characters, diff part under 38000 (largest prompt estimate in runs/JOBS.tsv: all under 119000, no OVER line printed).

## Method notes
Same as the first pass (BL-COMPLY FINDINGS.md method section): pack in --context, diff in the file, every dollar sign doubled and the three placeholder tokens neutralised in the copies sent; one run per pack part and diff part, 8 in parallel; 105 runs, 105 verdict lines, 0 non-zero exits (runs/DONE.log). The first run (fe-135-p1 on schema) was a trial and was rerun inside the full batch.

## Files
Lane dir ~/Buildo-scratch/lanes-20261119/inc1b/comply3: FINDINGS-2.md, REPORT.md, commit.out, pass2-fe-<source>-p<n>-<diff part>.txt (105), diffs/, build/ (scripts). Repo copy: docs/reports/lanes/2026-11-20/BL-COMPLY3/. Packs: .claude/review-templates/packs/fe-126-p1..p11, fe-127-p1..p2, fe-128-p1..p4, fe-135-p1..p4.
