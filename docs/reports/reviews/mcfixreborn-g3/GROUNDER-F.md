Grounder: Cairn-Ground-G3F
Ruled: out-engineering-eng-shared-p1.txt sha256:3898c8903048 findings:7
Ruled: out-engineering-eng-shared-p2.txt sha256:d2ddfd8da851 findings:5
Ruled: out-engineering-eng-shared-p3.txt sha256:ad30448c2a43 findings:4
Ruled: out-engineering-eng-shared-p4.txt sha256:453085df3013 findings:4
Ruled: out-engineering-eng-shared-p5.txt sha256:b1a35430d9bb findings:4
Ruled: out-engineering-eng-shared-p6.txt sha256:b2cba74d0b08 findings:6
Ruled: out-engineering-eng-shared-p7.txt sha256:029b6d7d381f findings:8
Ruled: out-engineering-eng-shared-p8.txt sha256:dcf58a226fc0 findings:7
Ruled: out-engineering-eng-front-p1.txt sha256:c540f2aa5fcf findings:4
Ruled: out-engineering-eng-front-p2.txt sha256:0d49118e07ee findings:5
Ruled: out-engineering-eng-front-p3.txt sha256:a01457872ea9 findings:3
Ruled: out-engineering-eng-front-p4.txt sha256:46759b68e961 findings:0
Ruled: out-engineering-eng-back-p1.txt sha256:f2acf3de97e6 findings:1
Ruled: out-engineering-eng-back-p2.txt sha256:8c5a345ff649 findings:0
Ruled: out-code-review-p1.txt sha256:e918f64f0d7d findings:5
Ruled: out-code-review-p2.txt sha256:e70e7f271c22 findings:4
Ruled: out-code-review-p3.txt sha256:871f8557dc19 findings:5
Ruled: out-code-review-p4.txt sha256:eb828dfb8739 findings:6
Ruled: out-code-review-p5.txt sha256:ab8db677a664 findings:5
Ruled: out-code-review-p6.txt sha256:2366ebc57b85 findings:8
Ruled: out-code-review-p7.txt sha256:2ab1e3632c1c findings:7
Ruled: out-code-review-p8.txt sha256:3f18599d9a21 findings:6
Ruled: out-code-review-p9.txt sha256:6cf8371a19f3 findings:7
Ruled: out-code-review-p10.txt sha256:ac8450e43ef6 findings:5
Ruled: out-code-review-p11.txt sha256:65766cec1c96 findings:9
Ruled: out-code-review-p12.txt sha256:9972815ecd02 findings:0
Ruled: out-code-review-p13.txt sha256:74be10c926d3 findings:6
Ruled: out-code-review-p14.txt sha256:9855fa6bddcf findings:6

Scope: 54 CRIT/HIGH/MED (2 CRIT, 10 HIGH, 42 MED), 81 LOW/NIT. Id short forms: sh = eng-shared, fr = eng-front, bk = eng-back, cr = code-review. No G3 file changed after 8dba70e8e (the one later commit, faa608ce6, edits a queue doc). No finding touches live money, entitlement, meter or auth. The permits route is a legacy file: G3 only added line 267 (task-378, 25bc874c7); the flagged lines predate G3 (git blame).

2. TABLE (id | sev | verdict | reason)
cr-p11#2 | CRIT | none found | text is "none found", not a finding
sh-p5#1 | CRIT | none raised | text is "none identified", not a finding
cr-p11#3 | HIGH | none found | not a finding
cr-p7#1 | HIGH | CONFIRMED (doc) | mobile_parcel_search descriptor guards.entitlement.product says parcel_tool, but its notes ("ENTITLEMENT vs OD5") and programme.product_questions[0] still say lead_gen. The route gates parcel_tool first (lookup/route.ts:10-12,72).
cr-p9#1 | HIGH | CONFIRMED (legacy) | permits/[id]/route.ts:183,202,216,271,283,300,308: seven bare catches, no log. §13.3 "All catch blocks use logError".
sh-p1#1 | HIGH | CONFIRMED (low impact) | lotMapPage.behaviour.test.tsx:70 hardcodes error:null, schemaDrift:false. Same as cr-p1#1.
sh-p2#1 | HIGH | DUPLICATE-OF-EARLIER | G2 D4, typed factories (mcfixreborn-g2/GROUNDER-B.md:73). Facts hold: parcelSearchScreen.behaviour.test.tsx:48-49, reportScreen.mount.behaviour.test.tsx:50.
sh-p6#1 | HIGH | REFUTED | lookup/route.ts:62 wraps the handler in withApiEnvelope. The wrapper (with-api-envelope.ts:25-48) catches any throw before the inner try, logs it with logError and returns a sanitized 500 envelope. Same shape at entitlement:26 and lot-size.
sh-p7#1 | HIGH | CONFIRMED (legacy, narrow) | permits route :241-244 repeats computeBuildingCoverage (massing/geometry.ts:150-158), same arithmetic. The rest of the inline massing block is legacy, a decision.
sh-p7#2 | HIGH | NOT-APPLICABLE | §10.3 rule 2 governs "New API routes". The permits route is old (blame 66bfd5290, f0301d92d).
sh-p7#3 | HIGH | CONFIRMED (legacy) | permits route imports only logError (:3) and has no logInfo on success. §13.3 "API routes MUST emit at least one logInfo".
sh-p7#4 | HIGH | DUPLICATE of cr-p9#1 | same seven catches (it counts six; §6.1 cited is weaker than §13.3)
cr-p1#1 | MED | DUPLICATE of sh-p1#1 | |
cr-p10#1 | MED | CONFIRMED (latent) | consumer-lookup.ts:79-83 num('') is 0; lot-map.ts:99 returns null. Also reached at :110 for a blank string headline column and at :146 for comparables.
cr-p13#1 | MED | CONFIRMED (test gap) | nav-by-route.logic.test.ts:152-158 unparen(n) returns the && parent for `if (a && v==='b') return <jsx>`, so jsxBranch is false. No live code has that shape (grep).
cr-p14#2 | MED | CONFIRMED (test gap) | static-page.logic.test.ts:151 matches only lines that start with "import" and carry the name. A wrapped multi-line import, or a bare call, passes T5.
cr-p3#1 | MED | REFUTED | static-page.schema.json:891-895 pins the choices arg to enum ["parcelId"] and the action to const select. SurfaceRenderer.tsx:119 cannot get a missing arg from a page table.
cr-p3#2 | MED | REFUTED | lotMap.ts:98-121: lots is built from map.lots, and state multi_parcel needs a truthy map, which is kept. LotMapBinding.tsx:179 `!` holds by construction (pinned in the G2 D6 ceiling).
cr-p4#1 | MED | CONFIRMED | schemas.ts:428 .strict() on ParcelLotFormSchema. The file's own rule (:369-371, :446-447 "additive_only because an installed app does not redeploy") says plain. A server-added key on lotForm would throw ParcelLookupSchemaError on installed phones. No test pins strictness.
cr-p6#1 | MED | CONFIRMED (narrow) | The doc at emit-mobile-surfaces.mjs:44 says on_invalid "differs from the row", but seed rows have no on_invalid field (checked: none of the maxbld_page_* rows carries it). The posture is prose in the description only. The suggested fix cannot work. See D12.
cr-p6#2 | MED | CONFIRMED (minor) | emit-mobile-surfaces.mjs:128 reports GEN-STRAY, but :135-139 --write never deletes. The remedy is deleting the named file by hand.
cr-p6#4 | MED | REFUTED | choices content is a prefix, not a leaf: PageTableBinding.tsx:112 builds `${s.content}.${a}`. The generated slice has "content":"answer" and leaves answer.yes, answer.no, answer.not_sure.
cr-p6#5 | MED | REFUTED | The binding enforces price then per then tax, with tests: web-landing.logic.test.ts:94-98 ("a price is followed by its per and tax parts"). The schema comment never says the schema checks it.
cr-p7#3 | MED | REFUTED | State hit holds the golden reports_left (task-320). The goldens test (parcelScreens.golden.test.ts:93) requires reports_left as one of 11 goldens. Deleting hit would orphan it. Only the label is odd.
cr-p7#4 | MED | REFUTED | surface.schema.json limitations items require check_id. A11y has no check, so an existing id is the precedent (contract_parcels_lookup limitations[0] does the same). "Omit" is schema-illegal.
cr-p7#5 | MED | CONFIRMED (stale cites) | index.tsx is 128 lines. emits.evidence cites 1-115, emits[] cites 1-312, and the checks cite :287, :297, :304, which are past EOF. Those testIDs live in SearchBinding.tsx:214-221. The suggested widening is wrong in direction.
cr-p8#2 | MED | CONFIRMED (doc) | contract_parcels_lookup emits.why says "no ledger INSERT" and ledger_events is [], while metering says one usage_events property_view row (lib/entitlements). Metering evidence cites route.ts:124 and :132-137, but the meter is now at :108-114.
cr-p9#2 | MED | REFUTED | withApiEnvelope (route.ts:23) catches the params TypeError, logs it with logError and returns a 500. Next always passes params (comment :27).
cr-p9#3 | MED | REFUTED | SearchBinding.tsx:407-409 states the intent: a spread type for the tree's untyped values. Record<string, unknown> would check nothing more. Type-only, no runtime effect.
cr-p9#4 | MED | REFUTED | entitlements/index.ts:463-469 reads the bundled static seed JSON. A missing key fails loudly at build or test, and it cannot vary at run time. It fails closed either way. Style only.
bk-p1#1 | MED | CONFIRMED (part, legacy) | Detail read (route :113) is the permits primary key (migrations/001_permits.sql:51), so at most one row: refuted. Linked-permits read (:292-299) has no LIMIT: real, small.
fr-p1#1 | MED | REFUTED | §1.3 names Pressable and TouchableOpacity. A map Polygon is neither. The card Buttons carry min-h-[44px] (parcelSearch.ts:171,173) and lotMapProblems checks it (golden :66).
fr-p1#2 | MED | REFUTED | The semi page golden enforces Button min-h-[44px] or 48 (semiQuestionScreens.golden.test.ts:60, planted case :108). pageTable.logic.test.ts uses placeholder class names on purpose.
fr-p2#1 | MED | UNDETERMINED | Code fact is true: no withSpring and no haptics in mobile/src/components/surfaces or the parcel-tool pages. They use active: colour only. §1.3 says "Primary interactive cards and buttons must use Reanimated withSpring". See Q1.
fr-p3#1 | MED | REFUTED | SearchBinding.tsx:182-184: the card row is one flex-1 Text, which wraps, plus a check icon. There is no area or segment badge (P35-D15 b removed it).
sh-p1#2 | MED | REFUTED | The golden test compares committed goldens to its own situation() with toStrictEqual (lotMapScreens.golden.test.ts:~72). If the capture script's construction changed, regenerated goldens would fail it, so drift is caught, not hidden. Duplicated errorOf is a maintainability note (LOW).
sh-p1#3 | MED | DUPLICATE-OF-EARLIER | G2 D6, undocumented `!`. The pin test's SCOPE excludes mobile/__tests__ and src/tests.
sh-p2#2 | MED | DUPLICATE-OF-EARLIER | test-layer file naming (G2 eng-all-p1#2 REFUTED, GROUNDER-B.md:25). Mobile uses jest-expo with default matching (mobile/package.json "jest").
sh-p2#3 | MED | REFUTED | parcelScreens.golden.test.ts:134,151: a missing node makes `.props` or `.children` throw, so the test fails. No false green.
sh-p3#1 | MED | DUPLICATE-OF-EARLIER | G2 D6 (test `!`)
sh-p3#2 | MED | DUPLICATE-OF-EARLIER | G2 D4 (sliceConfig.test.ts:8)
sh-p3#3 | MED | CONFIRMED | sliceConfig.ts:15-29 sliceNumber is a bounds clamp. §12.12 "MUST have at least one fast-check property test". sliceConfig.test.ts is examples only; src/tests/property has none for it.
sh-p4#1 | MED | DUPLICATE-OF-EARLIER | G2 eng-shared-p2#2 (§13.5 PostHog flags not the ruled mechanism, GROUNDER-B.md:40). That record cites the web switch; the phone routes have no flag at all.
sh-p4#2 | MED | UNDETERMINED | §11 is a plan checklist ("Before presenting PLAN LOCKED"): not applicable to finished code. The underlying fact is real: SEARCH_CANDIDATE_LIMIT = 10 (parcelSearch.ts:22) and three `10` literals in admin/parcel-lookup.ts:275,298,359. It is in no registered setting and not in _contracts.json. See Q2.
sh-p4#3 | MED | DUPLICATE-OF-EARLIER | G2 D4 (useParcelLookup.test.ts:62)
sh-p6#2 | MED | CONFIRMED | entitlement/route.ts:38-40 has no logInfo. lookup and lot-size do log. §13.3. See D6.
sh-p6#3 | MED | REFUTED-BY-RULING | Meter and refusal selection stay in the lookup route. MD:1431-1432 "2 y: the meter stays where it is (in the lookup route...)" (RR-0331). Route comment :94.
sh-p6#4 | MED | REFUTED-BY-RULING | The edit is only the count 1083 to 1091 in programme-items.json, text "refreshed by that generator". It follows registering six settings, ordered by the operator, MD:1494 "yes follow the rules register them". §10.2 is about changing how data enters the database during the frontend phase.
sh-p7#5 | MED | UNDETERMINED | permits route :293 and the row projections return snake_case names. §10.3 rule 3 says "Avoid", a soft rule. The web pages consume them. See Q3.
sh-p7#6 | MED | DUPLICATE-OF-EARLIER | G2 D6. massing/geometry.ts is pinned in the ceiling (12).
sh-p7#7 | MED | REFUTED | same as cr-p9#2. Also §2.2 says "newly created".
sh-p8#2 | MED | REFUTED | The wire names are mapped: types.ts:108-117 (area, frontage, zoning, frontageStreet, hasFootprint). Raw names are only the internal SQL row type (lot-map.ts:29-39).
sh-p8#3 | MED | REFUTED | The route returns ok(body) (lookup/route.ts:142), which is { data, error:null, meta:null } (envelope.ts:43-53). lookup-flow builds the data part.
sh-p8#4 | MED | DUPLICATE-OF-EARLIER | G2 D6. geometry.ts 19, lot-map.ts 1 and lot-size-entry.ts 2 are pinned (non-null-assertion-comment.logic.test.ts:78-83).

3. CONFIRMED DEFECTS (deduplicated). None has an effect on money, meter, entitlement or auth.
D1. Lot map smoke test mislabels error states. Ids sh-p1#1, cr-p1#1. §5.5 "a green suite in the wrong layer is false confidence".
 - mobile/__tests__/lotMapPage.behaviour.test.tsx:68-74. The it.each names error, rate_limited, unauthorized and schema_drift, but passes error:null, schemaDrift:false. All four inputs have no data, so each renders the redirect tree.
 - Only the generic error mount (:166) is rendered. The rate-limited, entitlement and drift trees are checked as props only (golden test).
 - Fix: add errorOf (copy lotMapScreens.golden.test.ts:33-36, importing its error classes) and pass error: errorOf(i.error, k) and schemaDrift: i.error === 'schema_drift'. Size: line-size. Owner: 322, 354, 362. Impact: a render regression in three error screens would not be caught.
D2. Permits route swallows seven sub-read failures. Ids cr-p9#1, sh-p7#4. §13.3 rule 2.
 - src/app/api/permits/[id]/route.ts:183,202,216,271,283,300,308. A real DB error returns 200 with a null parcel, neighbourhood, massing or linked permits and leaves no trace.
 - The comments "tables may not exist yet" are stale; the tables exist.
 - Fix: `catch (err) { logError('[api/permits]', err, { handler: 'GET_detail_<part>' }); }` in each. Size: line-size (7 edits). Owner: legacy, not G3 (blame d398d5e7b, ed12787ad5). Needs a decision whether it is folded into a G3 fix.
D3. Same legacy route, smaller breaches.
 - (a) sh-p7#3 no logInfo: add one before :312, with the permit id and duration.
 - (b) sh-p7#1 :241-244 → `const coveragePct = computeBuildingCoverage(totalBuildingAreaSqft, lotSizeSqft);` (identical result for total>0 and lot>0). Size: line-size.
 - (c) bk-p1#1 :299 add LIMIT 50 to the linked-permits read. Size: line-size.
 - Impact: a missing trace and drifting duplicate maths. Only 14 of 69 routes emit logInfo, so §13.3 is mostly unenforced app-wide.
D4. Entitlement route has no success log. Id sh-p6#2. src/app/api/parcels/entitlement/route.ts:38-40.
 - Fix: import logInfo, record t0, and call `logInfo(TAG, 'parcel entitlement', { uid: ctx.uid, duration_ms })` before the return. Size: line-size. Owner: task-364 touched it; created under MF-45. Impact: no observability of reports-left reads.
D5. lotForm schema is strict against the file's own additive_only rule. Id cr-p4#1. mobile/src/lib/schemas.ts:428 `.strict()` → delete.
 - Impact: if the server ever adds a key to lotForm, every installed phone fails the lookup parse. Size: line-size. Owner: SEMI-B (cfb4dffee), file also touched by 320, 336, 351, 411. Real but latent.
D6. NAV-1 lock misses compound conditions. Id cr-p13#1. src/tests/surfaces/nav-by-route.logic.test.ts:154-157. Mark the discriminant when the comparison is an operand of && or || under an if or ternary with JSX. Size: line-size. Owner: 322. No live miss today.
D7. T5 public-page gate check misses wrapped imports and calls. Id cr-p14#2. src/tests/surfaces/static-page.logic.test.ts:151. Match requireParcelToolPage( or the module path over the whole comment-stripped text, not per line. Size: line-size. Owner: 390.
D8. No property test for sliceNumber. Id sh-p3#3. Add src/tests/property/slice-number.property.test.ts (fast-check is in the root package.json): for any min<=max and number v, the result is within bounds or it throws. mobile/src/lib/sliceConfig.ts has no imports, so a relative import works. Size: line-size (about 15 lines). Owner: 395.
D9. Descriptor evidence is stale. Ids cr-p7#1, cr-p7#5, cr-p8#2. JSON only, no run-time effect.
 - mobile_parcel_search.descriptor.json: the notes and product_questions[0] say lead_gen against guards.entitlement.product parcel_tool; emits ranges 1-115 and 1-312 and :287/:297/:304 against a 128-line index.tsx (re-point to SearchBinding.tsx:214-221).
 - contract_parcels_lookup.descriptor.json: emits.why and ledger_events [] against metering; cites route.ts:124 and :132-137 (now :108-114).
 - Fix: edit text and cites, regenerate the registry. Size: line-size each. Owner: 376, 378 (cite owners), 364.
D10. Generator doc overstates and --write cannot prune. Ids cr-p6#1, cr-p6#2.
 - emit-mobile-surfaces.mjs:44 "(or on_invalid differs from the row)" → "(or is not fail or clamp)". The matching claim in sliceConfig.ts:4 "copied from its seed row" is also wrong: it is copied from the descriptor entry (emit :61).
 - GEN-STRAY: the remedy is a manual delete of the named file; add an unlink step in --write only if wanted. Size: line-size. Owner: 395, 390.
 - Not decided: that a descriptor's on_invalid matches the seed's prose posture is not machine-checked (the seed has no field). Adding a field is a new mechanism.
D11. num('') returns 0. Id cr-p10#1. src/lib/parcels/consumer-lookup.ts:81 `if (v == null) return null;` → `if (v == null || v === '') return null;`.
 - Matches lot-map.ts:99. Impact: a blank comparable field or text headline area would show as 0. Needs a '' upstream, which is unverified. Size: line-size. Legacy (628654586); file touched by task-336.

4. LOW/NIT recorded only (81). None mis-rated as HIGH-class on its face. Checked cr-p10#4 (empty verified-source list, pinned by user-entry-precedence.logic.test.ts:41) and cr-p9#6 (NaN would need a NaN DB value).
 cr: p1#2-5, p10#2-5, p11#4-9, p13#2-6, p14#1,3-6, p2#1-4, p3#3-5, p4#2-6, p5#1-5, p6#3,6,7,8, p7#2,6,7, p8#1,3,4,5,6, p9#5-7.
 sh: p1#4-7, p2#4-5, p3#4, p4#4, p5#2-4, p6#5-6, p7#8, p8#5-7.
 fr: p1#3-4, p2#2-5, p3#2-3.
 Notes: cr-p9#5 is the same fact as D3(b). sh-p6#6 and sh-p8#5 repeat the not-applicable "New API routes" point. sh-p1#7, sh-p8#6 and sh-p2#5, sh-p8#7 repeat the property-test and threshold points of D8 and Q2.

5. TOTALS (54)
 - Confirmed 16 ids (11 deduplicated defects D1-D11: D1 2 ids, D2 1 id + sh-p7#4 as duplicate, D3 3 ids).
 - Refuted 18.
 - By ruling 2.
 - Not applicable 1.
 - Duplicate 2.
 - Duplicate-of-earlier 9.
 - Undetermined 3.
 - None found or raised 3.
 Questions for the operator (one sentence each):
 Q1. Does §1.3's Reanimated withSpring and haptic rule bind the surface-renderer phone parcel pages, or is the pages' active: colour press feedback accepted (fr-p2#1)?
 Q2. Is the candidate cap of 10 (mobile SEARCH_CANDIDATE_LIMIT plus three server LIMIT 10 literals) a "page size" that Spec 128 Rule 3 requires registered, or a fixed contract value (sh-p4#2)?
 Q3. Does the old permits/[id] route (a G3 file only through task-378's one line) get brought to §10.3, §13.3 and §6.1 now (snake_case names, thin handler, logging), or stay as legacy (D2, D3, sh-p7#5)?

6. UNVERIFIED
 - I did not run any test or generator, so the test-gap claims (D1, D6, D7) rest on reading the code and fixtures.
 - Whether any upstream data holds '' (D11) is unchecked; there was no DB read.
 - I did not read the rnr Button in mobile/src/components/ui to see whether it has built-in press animation (Q1). I only grepped surfaces and the parcel-tool pages for withSpring and haptics.
 - The 14-of-69 logInfo count is a grep over src/app/api route.ts files.
 - FINDINGS.tsv begins with 188 "Ruled:" header lines that match my per-file counts, so I took the counts from them and the finding ids from the out-*.txt keys.
