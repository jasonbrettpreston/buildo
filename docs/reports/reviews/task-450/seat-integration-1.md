# Seat: integration: task-450 plan (PLAN-450-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board head 9a10561ef on wf2/board. The plan says it was read at 5a26374b9. The diff 5a26374b9..HEAD touches only docs/ and backlog/ files, so the cited code is unchanged. I read the task file and FINDINGS-PLAN.md. In the code I read parcelSearchMatch.ts, semiQuestion.ts, schemas.ts, both SearchBinding.tsx files, lotMap.ts and semi-question.tsx. I also read useParcelLookup.ts, sliceConfig.ts, maxbldHelp.ts, static-page.json and its schema, surface.schema.json, screen-checks.mjs, surface-goldens.ts, the golden-capture scripts and emit-mobile-surfaces.mjs. I read the tests and fixtures the edits would move. Nothing was run, written or built, so every "would fail" below is by reading.

## Checked and clean
- Content keys and lines are as the plan says: search content :15 and :21, semi content :4 (straight apostrophe today), mobile SearchBinding :38/:47/:84/:208/:221/:254-260, web :125/:237/:245/:273-279.
- static-page.json: the new mailto part goes after :30 (address_match). The tests that read `parts[2]` (static-page.logic.test.ts:64-67, static-web-binding.ui.test.tsx:165-167) still hit address_match.
- static-page.schema.json:179-187 is the topic enum. The key pattern at :166 allows only underscores, so `help.mailto.wrong_lot` is right. The link pattern allows "-", so topic "wrong-lot" is accepted.
- lookup-flow.ts is at src/lib/parcels/lookup-flow.ts, and :42/:53/:66/:94 all send `resolution`.
- The semi `redirect` golden uses `redirect_clear` (semiQuestion.situations.json). Only the named case `redirect_no_data` (golden test :156) moves.
- No test pins `.strict()` on the lot form. The server's strict mirror is src/app/api/parcels/lookup/types.ts:135-141 and is untouched. The AC3 fixture literals `semi_half` and `doubt_multi_parcel_abut` are in the enums (schemas.ts:424-425).
- `useSettledRedirect` (useParcelPageHooks.ts:16) is unchanged. The semi page hook is disabled without a token (useParcelLookup.ts:106).
- The web page is static (maxbld-web.ts:28, idle situation only), so the web gets only the templates and the topic. Plan section 3 steps 2d, 2a and 2c correctly touch mobile only.
- search-parity.golden.test.ts needs both trees to carry `derived:min_query_len`. Steps 5 and 6 do this together.
- web_help goldens: fingerprintFiles (screen-checks.mjs:232-237) covers only descriptor, content file and form schema. A static-page.json edit moves the web_help tree but not the fingerprints of web_terms, web_privacy, web_maxbld_error or web_landing.
- S-sbind counts 426 strings in both pins. One new content key gives 427.

## in#1 HIGH: the legacy oracle test fails once the content holds `{min}`
Plan: section 3 step 4 (content becomes "at least {min} characters") and step 15 (test-side list).
Evidence: src/tests/surfaces/parcel-legacy-oracle.logic.test.ts:20 has `CONFIG = { SEARCH_MIN_QUERY_LEN: '3', ... }`. Its `fill` (:30) turns the legacy strings "Enter at least ${SEARCH_MIN_QUERY_LEN} characters to search for a lot" and "Type at least {SEARCH_MIN_QUERY_LEN} characters to search." (legacy-props.json:23, :42) into "...3 characters...". `contentForms` (:31) turns content `{min}` into `{}`. No match, so the two "is neither content nor a golden literal" problems appear and the test at :55 fails.
Fix: add the file to step 15. Delete `SEARCH_MIN_QUERY_LEN` from CONFIG, so `fill` leaves `{}` and matches the new content. Keep the RED planted case at :69, which still holds.

## in#2 HIGH: two more existing assertions pin the literal content string
Plan: step 15 and section 4 AC4.
Evidence: mobile/__tests__/parcelScreens.golden.test.ts:209-210 expects `SEARCH_SLICE.content['search.prompt']` and `['search.input.hint']` `toContain(\`at least ${SEARCH_MIN_QUERY_LEN} characters\`)`. The slice will hold "at least {min} characters", so this fails. src/tests/surfaces/search-web-binding.ui.test.tsx:79 expects `idle.includes(C['search.prompt'])`. The rendered page will hold "Type at least 3 characters", not the raw `{min}` text, so it fails. :81 `no.includes(C['search.prompt'])` turns into a check that cannot fail.
Fix: list both in step 15. Change :209-210 to assert `{min}` in the content and the filled text in the render. Change :79 and :81 to compare against the filled string.

## in#3 HIGH: Q19 breaks test helpers the plan does not name
Plan: section 4 "The tests at :82-143 move to `withResolution`" and section 3 step 15.
Evidence: parcelSearchMatch.test.ts `response()` (:40-48) and `lookup` (:389) build payloads with no `resolution`.
- `lookup` feeds buildSearchSituation at :403-419. `S.ambiguous` is built from `lookup([...cands...])` and expects text_candidates. `S.redirect` is built from `lookup([], {parcelId..., matchType:'exact'})` and expects unique. With the shim gone both read as no_match, so those rebuild tests and the truth-table `overCap` cases (:415-416) go red.
- `response()` also feeds :150-195. Those cases stay green, because they expect no_match, idle or outside_toronto.
Fix: add `lookup` (:389) to the plan's rewrite, with `resolution` set per case: text_candidates for lists, unique for a hit, no_match for the empty one. Say that the rewrite is not limited to :82-143.

## in#4 MED: two more callers of the changed functions are not listed
Plan: sections 2, 3 and 5. Neither the card's Files line nor any step names `lotMap.ts`, and the plan treats L3 and Q19 as search-page changes.
Evidence: mobile/src/lib/lotMap.ts:87-88 calls `classifyParcelSearchError` and `deriveMatchType`. semiQuestion.ts:62 calls `classifyParcelSearchError`. L3 (`retryAfterSeconds == null`) therefore also changes the lot-map and semi error blocks for RateLimitError(0). Q19 changes what the lot-map page does with a payload that has no `resolution`. The lotMap fixtures carry `resolution` (13 hits in lotMap.situations.json). lotMapScreens.golden.test.ts:227 asserts only `rateLimited` for `rate_limited_zero`. Semi's errorOf uses RateLimitError(30). So nothing breaks, but the effect is real.
Fix: add one sentence to section 3 step 2 and to the dated notes naming lotMap.ts and semiQuestion.ts as callers and saying no golden moves for them.

## in#5 MED: UNVERIFIED item settled: surface-validate will refuse projection "list" on the semi descriptor
Plan: step 11, section 5 risk 1, section 8.
Evidence: surface.schema.json:3764-3790. For a LIST with status "generated" and `render.projection` const "list", `render.list` must require `columns`. `columns` needs minItems 1, each with field, label and display (:1486-1500). The semi descriptor is archetype LIST, status generated, and its `render.list` (:168-172) has item_archetype, pagination and recycling only. It has no columns. The generated validator (src/lib/surfaces/generated/validate-descriptor.mjs) is built from the same schema.
Fix: drop the projection edit from step 11. Keep "none" and add the dated sentence, which is the plan's own fallback. Do not spend a red/green cycle on it.

## in#6 MED: UNVERIFIED item settled: web import of the mobile slice by relative path is feasible, but it makes two sentences false and needs a guard
Plan: step 6 and section 8.
Evidence for feasible:
- tsconfig.json has `resolveJsonModule: true`.
- maxbld-web.ts:6 already imports `../../../scripts/surfaces/.../mobile_parcel_search.content.json` by relative path.
- web SearchBinding.tsx:26 already imports mobile parcelSearchCore by relative path.
- mobile/src/lib/sliceConfig.ts has no imports.
I did not run a Next build. UNVERIFIED: the actual bundling.
Stale text:
- scripts/surfaces/emit-mobile-surfaces.mjs:30 says "Only the phone reads the slice; no web binding reads these keys today."
- scripts/seeds/logic_variables.json:10852 (the min_query_len row) says "no web binding reads this key today".
- src/tests/maxbld-web-pages.logic.test.ts:144 locks parcelSearchCore as import-free because "`@/` names a different tree on each platform". sliceConfig.ts has no such lock.
Fix: add to step 6 the two comment and description edits. Edit the seed description only if no seed or logic-version drift check pins it (UNVERIFIED). Add sliceConfig.ts to the import-free lock at maxbld-web-pages.logic.test.ts:144.

## in#7 MED: UNVERIFIED item settled: golden capture commands and order are not in the plan
Plan: step 13 ("regenerate ... with the generators") and section 8.
Evidence:
- Phone goldens: `node_modules/.bin/tsx --tsconfig mobile/tsconfig.json scripts/surfaces/search-golden-capture.ts --write`, and the same with `semi-question-golden-capture.ts` (headers :11-13 and :10-12). Each says to run `scripts/surfaces/emit-mobile-surfaces.mjs --write` afterwards for the mobile copy.
- Web goldens: no committed script. surface-goldens.ts:8-9 says "`npx tsx` of a one-line caller rewrites them". `buildGoldens(root)` (:95) returns a Map of path to text. Test T7 (admin-media.golden.test.ts:33-39) asserts 70 files, byte for byte. The count does not change.
Order: emit `--write` first (slice and content), then both captures, then emit `--write` again, then the buildGoldens caller. Check with `surface-validate.mjs --check`.
Files that move but are not named: mobile/__tests__/fixtures/surfaces/mobile_parcel_search.goldens.json and mobile_parcel_semi_question.goldens.json.
Fix: write this order and the caller line into step 13. Name the two goldens.json files. Whether the one-line tsx caller loads under tsx is UNVERIFIED.

## in#8 MED: `hasHouseNumber` is not a copy of the server rule
Plan: step 2d "true when the text before the first comma contains a digit. It copies the server's comma cut".
Evidence: src/lib/admin/parcel-lookup.ts:225-228 cuts at the first comma, calls `stripTrailingUnit`, then requires a digit in the first token (`/\d/.test(m[1])`). The plan's test is a digit anywhere before the comma, with no unit strip. "Highway 27" (risk 9) and "Gerrard St 2nd" have a digit the server does not read as a number. A trailing unit, as in "King St W Apt 4", is stripped on the server and counted by the plan. Nothing ties the two copies together. The mobile app cannot import src/lib.
Fix: define `hasHouseNumber` as the server test (first token has a digit after the comma cut). Or write the divergence into 8.1 and add a case table. Either way keep one test per row of the AC1 list.

## in#9 LOW: several cited lines are off
Plan: step 15 and section 1.
Evidence:
- surface-validate.logic.test.ts: the 426 pin is at :91 (plan :93).
- surface-conformance.logic.test.ts: the 426 pin is at :261 (plan :258).
- Spec 99 "Authorized amendment process" is at :783 (plan :782).
- The plan cites lookup-flow.ts without a path.
Fix: correct the cites. Anchor hunks on the string "426 strings", not the line number.

## in#10 NIT: help-page test coverage claim is loose
Plan: step 9 "The page throws on a missing key (static-web-binding.ui.test.tsx:118-119)".
Evidence: :118-119 deletes `help.intro`. It does not cover `help.mailto.wrong_lot`. The per-topic loop at :139-144 uses a hard-coded five-topic list (`TOPICS`, :112), so it will not cover the new topic either.
Fix: add "wrong-lot" to that TOPICS array in step 15, so the new link is asserted with its label and data-topic.

STATUS: 10 findings (3 HIGH, 5 MED, 1 LOW, 1 NIT); the plan is close to the real code but misses the oracle and literal-content pins and the helper rewrite, and step 11's projection edit will be refused.
