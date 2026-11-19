# REPORT: BL-C12 (task-321 SRCH.C12, Increment 1·B, elements C.12 and B.7)

Status line (Spec 137 rule 3): BL-C12 lane · task-321 built: the v8 help link on the lot map (C.12) and under the three address-confusion notices (B.7), commit 70bf820bf on branch wf1/inc1b-c12 (not pushed, no DB).

## What was already built (read from the tree before planning)
- Neither element existed: grep "wrong-lot|Get help with an address|Not sure which lot" over scripts, src, mobile/src, mobile/app, docs/specs returned nothing.
- B.7: the three notices (intersection, too many lots, no lot linked) are drawn by mobile/src/components/surfaces/LotMapBinding.tsx (case 'intersection', 'too_many_lots', unlinked) with no link. What exists nearby is the older "Report incorrect address match" button on the SEARCH list (SearchBinding.tsx:184-192), a different element. doc-2 "SERVED-NOT-POPULATED" was about the inbox value (empty), not a drawn link.
- C.12: NOT BUILT, as doc-2:64 says.
- The way from the app to Help already existed: renderer action open_help -> openHelp(topic, q) -> Linking.openURL(https://maxbld.ca/help#topic=..&q=..) (mobile/src/lib/maxbldHelp.ts:12-21; SurfaceRenderer.tsx:123-124), wired by parcel-tool/index.tsx:103. The map page host (disambiguate.tsx) did not pass it.
- Web: no lot-map binding exists on the web (src/components/surfaces/web has Admin, Form, List, Search, Static; RR-0170 W5 deferred), so the change is mobile only.

## Binding table with evidence
| element | v8 string | content key | link target | component reused | surface/state | test |
|---|---|---|---|---|---|---|
| C.12 prompt | Not sure which lot? | help.lot.prompt | text | Text in a View row (parcel-lotmap-help-row) | multi_parcel_2, multi_parcel_3plus goldens, after the Continue button | src/tests/surfaces/lot-map-help-link.logic.test.ts |
| C.12 link | Get help with an address | help.address.link | open_help, topic wrong-lot, q derived query | Button variant link (as SearchBinding.tsx:186-192) | same | same |
| B.7 x3 | Get help with an address | help.address.link | same | same | intersection, too_many_lots, unlinked goldens, right after the notice | same |
Evidence: red.out ("Tests  8 failed | 8 passed (16)"); commit.out ("Tests  16 passed (16)", "GATE OK", "POLICY CHECKS OK (commit-msg): 4 file(s)"); typecheck passed (npm run typecheck, no errors). Goldens by repo scripts: `wrote 11 goldens`, `lotmap goldens ok (11)`, `wrote 7 files` (emit-mobile-surfaces). Other states (error, loading, rate_limited, schema_drift, unauthorized, redirect) carry no link, as v8 draws none (the test classifies every golden).
Files changed: LotMapBinding.tsx (helpLink, helpRow), mobile/src/constants/lotMap.ts (4 layout entries reusing the search link classes), disambiguate.tsx (open_help: openHelp), the map content file (+2 keys), its generated slice, 11 goldens plus the mobile golden file, the MF-53 queue row note (M-246, quoting RR-0299), the context file, the new test.

## Pins and counts (not moved, by instruction)
- Before my change (on this head): `node scripts/surfaces/surface-validate.mjs --check` printed two pre-existing findings (before.out): SV-SBIND multi_parcel_2 and multi_parcel_3plus: "unknown contract field contract_parcels_lookup.map.lots.N.frontageStreet" (the whitelist repair is BL-LOTFIX's). It prints no count line while failing; the count measured with sbindArm directly (scripts/surfaces/screen-checks.mjs:378-406): `S-sbind ok (17 surfaces, 418 strings)`, findings 2.
- After: `S-sbind ok (17 surfaces, 420 strings)`, findings 2 (the same two). Content keys added: help.lot.prompt, help.address.link (strings = content keys, screen-checks.mjs:394).
- The pin tests src/tests/surfaces/surface-validate.logic.test.ts:86 and surface-conformance.logic.test.ts:247 still say 414 on this head (stale before me); not touched. When the stack is ordered after BL-LOTFIX (418 pin) the pin must become 420 on both lines; the two branches touch the same two lines, the orchestrator orders the stack.
- Other generator checks (checks.out): emit-mobile-surfaces `surfaces ok (4 surfaces, 29 goldens)`; generate-surface-registry `clean - no drift`; generate-target-files exit 0; lotmap-golden-capture `lotmap goldens ok (11)`; consumer-registry --check: `scripts/steps/_schema/consumer-registry.json is STALE ... parcels.primary_frontage_street_name` (src/lib/parcels/lot-map.ts): from the lot card read, not from this change (I touched neither); not fixed.

## Reviews
r1-plan.txt + TRIAGE.md: 28 findings, KEPT items folded (one help affordance per screen clarification, closed golden classification, key names, count rule, wrong-lot report item, deployed page UNVERIFIED). r2-output.txt: one lens, all findings REJECTED with opened lines, no fix commit. Copies in docs/reports/lanes/2026-11-19/BL-C12/.

## OPERATOR items
1. Placeholder support address (RR-0299): logic_variables.maxbld_support_inbox (migrations/314) is seeded empty and I wrote nothing. Until a value is set, the Help page leaves the mail links out (src/lib/surfaces/maxbld-support.ts:13-30). Setting a placeholder is a database job for the operator.
2. Topic: v8 and the brief name topic wrong-lot, but the Help page's mail topics are general, address_match, lot_match, billing, enterprise (scripts/surfaces/_schema/static-page.json web_help), so wrong-lot selects no mail link and the page just opens. Options: add a wrong-lot topic to the Help page (out of this task's scope), or point the two links at lot_match / address_match.
3. The consumer-registry stale line above needs whoever owns the lot card read (not mine).

## UNVERIFIED
- Mobile jest suites (lotMapScreens.golden, lotMapPage.behaviour) not run (not in the hook, no runner call); goldens agree via the repo capture --check.
- On-device behaviour (link tap opens the browser, selection kept on return): not run.
- Whether the deployed Help page carries the prefill island: no network check.
- The full suite runs at the push station only.
- The task description has no `Files:` line (check-task-files WARN in commit.out); the commit message carries it.

STATUS: ready (commit 70bf820bf plus the reports commit; unpushed). Question: pin move to 420 after BL-LOTFIX, and topic choice for item 2?
