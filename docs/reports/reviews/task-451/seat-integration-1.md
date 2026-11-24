# Seat: integration: task-451 plan (PLAN-451-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board branch wf2/board, head b1e4012f5 (docs only after the plan's 0841db559). Read the whole task-451 file and task-450's final plan section (as it stands uncommitted in the tree). Read docs/reports/reviews/task-451/FINDINGS-PLAN.md first. Also read the code the plan cites:
- Phone: LotMapBinding.tsx, lotMap.ts, maxbldHelp.ts, SurfaceRenderer.tsx:70-130.
- Map surface: the map content, descriptor and fixtures, plus its tests lotMapScreens.golden, lotMapPage.behaviour, lot-map-help-link and search-follow-ups.
- Server: consumer-lookup.ts, display-rules.ts, project.ts and pinned-settings.ts.
- Static pages: StaticBinding.tsx, maxbld-static.ts, static-page.json and its schema, static-page.logic, static-web-binding and site-footer tests, and the (static) mounts.
- Tooling: host-policy.ts:43,50, manifest.json chains, lot-map-data-check.mjs, generate-surface-registry.mjs, the surface-validate and surface-conformance pins.
No test, generator, database or write.

## Checked and clean
- The faces variants the plan's AC4 relies on exist today. The content file has lot.lead.house_faces and lot.lead.no_building_faces (content :7-8), chosen at LotMapBinding.tsx:179-181. Rewording only lot.lead.house and lot.lead.no_building to end "at the back" therefore changes only the no-street lots. This refutes ux#1 and deepseek#1 as written, so the plan needs no edit.
- The multi_parcel_2 and multi_parcel_3plus fixtures match the plan's expected text:
  - 3plus lot A is hasFootprint true with no street, so it reads "has the house · at the back".
  - multi_parcel_2 lot B has no footprint and no street.
  - Lot A of multi_parcel_2 keeps "faces Dunmore Lane".
- The error-state testIDs already exist. errorNotices (LotMapBinding.tsx:63-86) emits parcel-lotmap-ratelimit, parcel-lotmap-entitlement and parcel-lotmap-error, and parcel-lotmap-retry with no retry on schema drift. This refutes deepseek#4.
- X1's "red today" claim holds. The smoke test passes error null with data undefined. buildLotMapSituation (lotMap.ts:98-104) then returns the redirect state.
- Nested `{text, vars}` templates resolve (SurfaceRenderer.tsx:89-92). `onPress` is generic through ACTION_PROPS (:148). `Text` is in COMPONENTS (:29). `open_help` takes `(topic, q)` and `helpUrl` accepts any topic string (maxbldHelp.ts:15,26). So the label `{lead, area}` and the nested link both resolve.
- The Continue middle branch (LotMapBinding.tsx:204-208) is unreachable. route is non-null only when selectedParcelId is non-null (lotMap.ts:127). selectedLetter is then `letterOf(i)`, a string (:76,114).
- `select.label` has no other user on the map surface. The `pageTable.logic.test.ts:33` hit belongs to the semi page. The unused-key test is at lotMapScreens.golden.test.ts:102.
- Content string net 0 for the map is right (delete select.label, add unlinked.report). No nav.* key exists in the four static content files (grep count 0 each), so +8 and 427 to 435 hold. The landing keys are at web_landing.content.json:24,27.
- ST3 and import safety:
  - `LOT_SIZE_PLAUSIBLE_M2` is `{min, max}` from pinnedWindow and is 50 to 5000 (report-projection-settings.logic.test.ts:58).
  - project.ts imports only JSON, format, pinned-settings and seed-shas, so there is no cycle with parcels.
  - Only the lookup route and tests import consumer-lookup.
  - The source-scan tests on consumer-lookup (infra :134, :145-146, report-fields :161) are not tripped by an added import line. :145 does forbid the word "select" in any comment, so keep the new comment free of it.
- L2: `compCount` is `z.number().nullable()` on the phone (mobile/src/lib/schemas.ts:336), so null is a safe shape. The admin copy of num (admin/parcel-lookup.ts) is separate and untouched.
- The descriptor chain re-index is correct against the sources chain in scripts/manifest.json: index 2 is address_points, 4 parcels, 8 link_parcel_addresses, 15 link_massing. The descriptor lines :112, :135, :151 and :165 read as the plan says.
- Static header path, schema and page-table checks:
  - A title-less hero is schema-valid: hero requires only kind, id and parts, and wordmark and nav are hero roles (schema :359-397).
  - The href pattern (:170) accepts "/" and "/login".
  - Both are public host-table rows: host-policy.ts:43 gives /login a public row with internal /parcel-tool/login, and :50 gives "/" a public row with internal /parcel-tool/home. This closes the plan's §9 item on /login. The /parcel-tool/login directory exists; I did not read its page file.
  - staticTitle (maxbld-static.ts:36-38) finds the title by role across all sections, and keepValued only drops parts that carry a `value`. Neither is hurt by a header section placed first.
  - site-footer T4 and static-web-binding (a) look up the footer and the h1 by testID or role, not by index.
  - Only the sections[0]/[1] indices in static-page.logic.test.ts and static-web-binding.ui.test.tsx shift. No src/app code indexes sections.
- web_maxbld_error has `error` and `miss` states, served by error.tsx and not-found.tsx (and refused/page.tsx via notFound). Putting the header on `miss` only is mechanically possible.
- Ownership against 450: static-page.json hunks (450 after :30, 451 at the new first section and $comment) are far apart. 450 step 4 (web_help.content) and 451 step 6 touch different keys. The 426 to 427 to 435 chain is consistent with 450's own text. The descriptor :57 hand-off is stated both ways in §6.
- RR-0446 holds in code: LotMapBinding.tsx has no "neighbour" reference, so descriptor :447's "no neighbours are drawn" is true.

## in#1 MED: step 9 names the wrong tool and wrong path for the census, and the census is hand-kept
Plan: §3 step 9 "the census (scripts/surfaces/_schema/census/mobile-product.json, OUTSIDE FILES LINE) with generate-surface-registry.mjs"; §9 "that generate-surface-registry.mjs has a --write flag".
Evidence:
- The generator is scripts/violations/generate-surface-registry.mjs. It is not under scripts/surfaces, and `ls scripts/surfaces/generate-surface-registry.mjs` fails.
- Its usage block (:27-29) offers only no flag, `--check` and `--self-test`. There is no --write.
- It "renders docs/reports/generated/127-surface-registry.md" from the census (header comment). It does not write the census.
- census/mobile-product.json:6629 carries its own copy of the map descriptor's purpose text, including "listed as cards (area, frontage, zoning)", and the "Try a nearby address" line also appears in that file. These sentences go stale when step 7 and step 2 change the card and the unlinked body.
- search-reports-left.logic.test.ts:137 calls a census copy a "hand-kept mirror, kept in step", so some census mirrors are pinned. I did not find the test that pins this particular entry (UNVERIFIED).
Fix: in step 9 replace the census line with: hand-edit the census purpose and data_story text to match the step 7 descriptor text, run `node scripts/violations/generate-surface-registry.mjs` and then `--check`, and add docs/reports/generated/127-surface-registry.md to the outside-files line. Drop the --write item from §9.

## in#2 LOW: the new nested link node has no `key`, which the map's own golden rule flags
Plan: §3 step 3 "a nested `Text` (testID parcel-lotmap-report, accessibilityRole 'link', onPress ..., child content('unlinked.report'))".
Evidence: lotMapScreens.golden.test.ts:60-67 `lotMapProblems` pushes "a child node without a key" for any non-root node whose props.key is undefined, and it runs on every golden (:109). Every node in LotMapBinding.tsx sets `key`.
Fix: add `key: 'unlinked-report'` to the node's props in step 3.

## in#3 NIT: cites that are off by a few lines or a count (all the text is otherwise as the plan says)
Plan and Evidence:
- §3 step 3 "The six calls change: :115, :234, :236, :238, :240". That lists five, and the file has five helpLink calls (plus the :97 definition).
- §3 step 1 ":81 (L2)". The `if (v == null)` line is consumer-lookup.ts:80. The 79-83 range is right.
- §4 AC3 "The :207 pin becomes the new body". The unlinked.body pin is lotMapScreens.golden.test.ts:204.
- §3 step 10 "assertion :148-150". The "at the back is not used" assertion is search-follow-ups.logic.test.ts:149-151, and the LEADS block is :142-148.
- §3 step 8 ":33". parseArgs starts at lot-map-data-check.mjs:28 and the --parcels line is :33.
- §4 "static-page.logic.test.ts:55-67". The sections[0] uses run to :68 ('a topic on a paragraph').
- §3 step 9 "mobile/generated/...map.json". The path is mobile/src/generated/surfaces/mobile_parcel_disambiguation_map.json, which the Files line already has.
- lotMapPage.behaviour.test.tsx:93 (Lot B's label, "frontage 6.1 m, zoning —") also changes. The plan's "each label contains no frontage or zoning" covers it but does not name it.
Fix: correct the cites. When rewriting the descriptor :447 sentence, also reword its quoted "Try a nearby address." line to the new "or report it" ending.

STATUS: 3 findings (0 CRITICAL, 0 HIGH, 1 MED, 1 LOW, 1 NIT); the plan matches the real code, and the only wiring error is that the census and registry step names the wrong tool and path.
