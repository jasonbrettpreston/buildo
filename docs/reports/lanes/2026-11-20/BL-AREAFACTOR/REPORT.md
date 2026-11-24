# REPORT BL-AREAFACTOR (task-411, FIX.AREA-FACTOR), lane commit c4b2ec894

1. For a person: nothing changes on screen. The lead-detail screen still shows the floor area as "N sq ft"; the number now comes from the server already converted, and the phone no longer holds the 10.7639 factor (two typed copies removed from the phone).
2. Goldens moved: none (no golden file is in the diff; no phone golden test imports formatSqft: grep of mobile/app and mobile/src shows formatSqft only in [lead].tsx:81, leadDetailFormat.ts:16, parcelCostFormat.ts:86).
3. Stays code and why: the multiplication stays one line on the server (src/lib/leads/lead-detail-query.ts, sqmToSqftOrNull) using SQM_TO_SQFT, the pinned setting parcels_sqm_to_sqft read at src/lib/parcels/geometry.ts:6; the phone keeps only rounding and the "sq ft" word (fe.44 pre-formatted-string half stays open: the phone still picks the unit word). parcelCostFormat.formatSqft stays exported but takes square feet and has no factor, because the registry names it (see Deviation).
4. Unverified: phone tests (leadDetailFormat, parcelCostFormat, useLeadDetail) cannot run locally; phone-test green is UNVERIFIED until Mobile CI. The full suite and push were not run (station only).
5. Operator item: none. Open for the grounder: 183 finding lines (plan and output stages, one CRIT: plan-compliance-eng-s5#1 on red-before-code), untriaged (FINDINGS.md). Also still open, not in this task: permits route feet_per_metre (route.ts:267).

## Evidence
- Quotes checked on their source lines: MORNING-DECISIONS.md:1476 "Let the grounder resolve them all as long as the result is compliant"; MORNING-DECISIONS.md:241 "The conversion factor lives in content/settings, never in code".
- Route path: src/app/api/leads/detail/[id]/route.ts exists (matches the Files line). The cost block is built in src/lib/leads/lead-detail-query.ts (toCost, toCoaCost), so the Files line was extended through the backlog CLI (lead-detail-query.ts, [id]/types.ts, mobile schemas.ts, [lead].tsx, three mobile tests, two server tests); route.ts needed no edit.
- Facts from the task opened: leadDetailFormat.ts typed 10.7639 and [lead].tsx called formatSqft(cost.modeled_gfa_sqm); parcelCostFormat.ts typed it; geometry.ts:6 reads the pinned setting. All true.
- Deviation (a fact the task missed): parcelCostFormat.formatSqft is also named by the presentation registry scripts/surfaces/_schema/report-presentation.json:48 (formats.area.alt_formatter) and read by scripts/analysis/report-schema.mjs RS-4. First commit attempt (commit-attempt1-rs4.out) ended "RS-4 FAIL: formats.area: formatSqft is not exported by parcelCostFormat.ts". Smallest fix chosen: keep the export, factorless (takes sq ft, formats only). Final commit.out line: "report-schema current; RS-0 PASS ... RS-4 PASS ... RS-11 PASS". Whether to drop the registry's alt_formatter instead is a grounder or operator call; I made no ruling.
- Red: red.out (commit attempt, only tests and task file staged): "Tests  2 failed | 125 passed (127)"; AssertionError "expected undefined to be close to 1533.85575" (src/tests/leads-detail.infra.test.ts) and "... 263.71555" (src/tests/lead-detail-query.coa.infra.test.ts). red-attempt1-typecheck.out is an earlier red (typecheck TS2551 on the missing field).
- Green: commit.out ends "EXIT 0"; "Tests  127 passed | 4 skipped (131)" in the related run; commit c4b2ec894 through the real hooks, no bypass; trailer Task: task-411.
- `backlog doctor`: "No duplicate IDs, self-referential dependencies, or dependency cycles found."
- Lens set (DeepSeek, parallel): plan stage plan-plan-review, plan-ux, plan-error-paths plus plan-compliance for all 14 lists (surface-126 in parts p1-p4); output stage out-code-review, out-ux, out-error-paths plus out-compliance for all 14 lists, lens-input material = the whole diff (docs/reports/reviews/task-411/diff-2026-11-20.txt, 25725 chars, nothing trimmed; no size refusal). Output lenses ran on the final diff (round 1). Files: docs/reports/lanes/2026-11-20/BL-AREAFACTOR/ (inputs beside outputs, TASK = task-411).
- Findings: FINDINGS.md lists every id untriaged (183 lines); I give no verdicts and wrote no GROUNDER.md.
- Housekeeping: a stray file out-compliance-*.txt (shell glob created by a failed redirect) was committed in c4b2ec894 and removed in the follow-up docs commit so the close check does not read it.
- Not done by design: no push, no DB, no suite, task left RUNNING, grounder owed.

STATUS: BL-AREAFACTOR lane · task-411 (Increment 1·B, McFix A) built and committed c4b2ec894 through the real hooks, left RUNNING, grounder owed, phone tests UNVERIFIED until Mobile CI · Spec 137 rule 3.

## Addendum A (glob slip, round 1)
The follow-up docs commit of round 1 removed a stray file named literally out-compliance-*.txt with a glob and so deleted all 17 real out-compliance-*.txt files too; the next commit restored them byte for byte from the work commit (git diff --name-status showed only REPORT.md added and the stray file deleted). Cause: an unquoted glob in a git rm pathspec expands in git. No output was edited. The earlier red attempts are kept beside this file: red.out (round 1 red: 2 server tests failed), red-attempt1-typecheck.out (first red, typecheck TS2551), red-round2.out (round 2 red).

## Addendum B (fix round 2026-11-20, coordinator items 1-8)
- Deploy order: server first. A new phone on an old server, or on a cached lead-detail response from before the change, receives no cost.modeled_gfa_sqft; the schema accepts that (optional) and the screen omits the Square Footage section (the phone does not convert modeled_gfa_sqm). Rolling the server back does the same. No data is lost; the section returns when the server serves the field.
- Phone-only tests (leadDetailFormat, parcelCostFormat, useLeadDetail, leadDetailScreen.sqft.behaviour) run only in Mobile CI; green is UNVERIFIED until then.

### PASS/FAIL checklist
1. PASS: kept export renamed formatServedSqft (parcelCostFormat.ts, its test, scripts/surfaces/_schema/seed-report-v2.mjs and report-presentation.json together); report-schema --check RS-4 PASS; plan step 2 amended through the CLI.
2. PASS: web-to-phone parity assertion restored in src/tests/admin-report-preview-live.logic.test.ts (formatServedSqft of the pinned-factor product equals the web fmt('area_sqft') string); red then green.
3. PASS: modeled_gfa_sqft added to the mobile_lead_detail descriptor (cost fields), the mobile-product census and Spec 91 section 4.3; the hook --check scripts ran (see commit output).
4. PASS: modeled_gfa_sqft required on the server type (types.ts); phone zod unchanged (nullable, optional).
5. PASS (written, UNVERIFIED to run): mobile/__tests__/leadDetailScreen.sqft.behaviour.test.tsx, field present, null, absent; Mobile CI only.
6. PASS: stale comment at mobile/maestro/lead-detail.yaml corrected.
7. PASS: red.out, red-attempt1-typecheck.out, red-round2.out and this addendum copied into the repo lane dir; GROUNDER.md not copied.
8. PASS: output lens set re-run on the new whole diff (docs/reports/reviews/task-411/diff-2026-11-20.txt, base merge-base with wf2/board, 37687 chars, nothing trimmed); superseded outputs removed and listed in SUPERSEDED.txt; FINDINGS.md refreshed, untriaged.
Note: extending the Files line (descriptor, census, registry, Spec 91, maestro) attached 22 rule lists instead of 14 (data decides); output compliance now runs per those lists.

### Siblings of the same fe.44 strain (not fixed here, listed)
- src/components/.../CoaClassificationPanel.tsx:280 (client-side area conversion, to be located by the grounder; not opened in this lane: UNVERIFIED).
- permits route feet_per_metre (src/app/api/permits route.ts:267) served for client maths.
- the fe.44 pre-formatted-string half (the phone still picks the unit word): operator question, not mine.

## Addendum C (fix round 3, fingerprint restamp)
- Correction: formatServedSqft has no app caller. [lead].tsx:81 calls leadDetailFormat.formatSqft (cost.modeled_gfa_sqft). formatServedSqft is exported only because the registry names it (formats.area.alt_formatter, RS-4); its only users are its own test and the web parity test. The earlier addendum lines that implied a caller are wrong.
- The rename changed scripts/surfaces/_schema/report-presentation.json, a golden fingerprint input, so 72 report goldens went stale (goldenProblems printed 72 SV-GOLDEN "fingerprint stale: report-presentation.json"; the commit hooks do not run that check). This round states the input unit on the registry entry (formats.area.alt_formatter_input), corrects the stale notes naming formatSqft (seed-report-v2.mjs, schema-v2-proposal.json, then seed-report-v2.mjs --write and report-schema.mjs --write regenerated report-presentation.json, report-v2.decl.json and docs/reference/maxbld-report-v2-schema.md; nothing generated hand-edited), and restamps the goldens with the repo's own tools (npx tsx scripts/surfaces/report-capture.ts, then report-page-capture.ts; no DB, no server). The page goldens (33, including the landing sample) went stale for the same reason and are restamped too.
- Proof: docs/reports/red-evidence/task-411/restamp-fingerprint-only.txt: golden files changed 105 (72 report + 33 page); fingerprint-only 105; other changes: 0.
- Spec 91 section 4.3 and the response-shape line now say: served in square feet, computed by the API, null when the area is null, optional for an older or cached response (section omitted).
- Lenses not re-run this round, by instruction; the output outputs and FINDINGS.md describe the round-2 diff.
