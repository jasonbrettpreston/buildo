# Seat: integration: task-465 plan (PLAN-465-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board wf2/board head 4c22af6e8. The plan read 320b47a02, and `git diff --name-only 320b47a02 HEAD` touches only backlog/ files, so no code moved. Read: task-465 file; FINDINGS-PLAN.md; PHONE-WALK-FINDINGS; mobile SearchBinding, SurfaceRenderer, parcelSearchMatch, parcelSearchCore, parcelSearch.ts, lotMap.ts, parcel-tool/index.tsx, useParcelLookup, recentSearchesStore, useWallState; web SearchBinding, maxbld-web.ts, SearchPageClient; bindings.json; surface-goldens.ts; generate-surface-registry.mjs; the search descriptor and the census row; the tests named in the findings. Nothing was run (no test runner, no generator).

Checked and clean:
- The cites I re-read hold: PSM isOutsideToronto :101-116 and buildSearchSituation :329-366; SurfaceRenderer ACTION_PROPS :148, action switch :111, ICONS :31; useParcelSearch key ['parcel-search', trimmed] (useParcelLookup.ts:82-92); onSubmitEditing in (onboarding)/address.tsx:174; PS:125 is the 44 px / rem 14 comment; LM:48 semiHeading.
- Existing helpers: searchQueryArg, useDebouncedValue, useGoBack, diffCandidateAddress, parcelSearchRoute.
- bindings.json is not in the golden fingerprint (surface-goldens.ts header, "never bindings.json"). Adding onSubmitEditing to non_display_keys therefore stales no golden.
- Web goldens hold refs, not text, so the content-text changes (search.miss, new keys) do not move web goldens.
- The web page is static (SearchPageClient.tsx:7, "No fetch"), so no web code reads the live situation shape.
- The recent store already de-duplicates (recentSearchesStore.ts:55-58, case-folded, moves to front). Lens finding error-paths#4 is moot.
- The mobile jest rules the plan cites hold (one min-h token per Button/Input; Text carries size, weight and colour).

## in#1 HIGH: the FE-07 search parity lock fails for the planned phone-only change
Plan: sec 4 "Unchanged: web SearchBinding.tsx"; sec 6 "web goldens fingerprint-only"; O13 rec "phone now".
Evidence: src/tests/surfaces/search-parity.golden.test.ts:5-8 requires, per state, the same refs, the same action names, the same ordered testIDs and the same situation on the web and mobile goldens. `for (const r of rm) if (!rw.includes(r)) out.push(...)` at :69-70 fails on each new phone ref (search.miss.hint, list.hint, outside title). Line :72 fails on the `submit` action. Line :74 fails on the removed rail, badge and Select blocks. The same file pins the state list at :~96 (`toEqual(['loading',...,'reports_left'])`, "all 11 states"), so the new `suggest` state fails it as well. The precedent says both targets: the open_help action was added "on both targets (FE-07 parity)" (Spec 126 line 995). RR-0445 (mobile first, also on the web) is ruled.
Fix: O13 cannot be "phone only". Either put the web SearchBinding.tsx, its goldens, search-web-binding.ui.test.tsx and the parity state list into section 4, or plan a parity exemption written as data (like WEB_FOOTER_REFS) with an operator ruling quoted. Add search-parity.golden.test.ts to the Files line either way.

## in#2 HIGH: the census row is the source of record, and the plan has the direction and scope wrong
Plan: sec 4 step 9 "census/mobile-product.json: the same text by hand (a hand-kept mirror)"; sec 9 "Which test enforces the search census mirror is byte-equal".
Evidence: generate-surface-registry.mjs:1618-1622 prints "DESCRIPTOR DRIFT ... Run `--emit-descriptors`" when a descriptor disagrees with the census, and :1596 `--emit-descriptors` writes descriptors from the census. surface-registry.infra.test.ts:277-281 asserts `clean — no drift`. A node check: census rows 7578 (search) and 7154 (semi) are JSON-identical to their descriptor files today (`JSON.stringify(r)===JSON.stringify(d)` true for both). The mirror is the whole row (states, checks, errors evidence, cites), not only the purpose text. The same --emit-descriptors run also rewrites src/lib/surfaces/generated/surface-descriptor.d.ts and validate-descriptor.mjs (TYPES_OUT, VALIDATOR_OUT). These are probably byte-unchanged, but the plan must say so.
Fix: edit the census row first (including the new `suggest` state, the checks and the re-pointed evidence), then run `generate-surface-registry.mjs --emit-descriptors`, then the default run for 127-surface-registry.md and the review queue. Add that order to step 10. Name the test: surface-registry.infra.test.ts:277 and :113 (byte-identical registry). Registry text will move beyond the state count (the "lines" figure and any note text).

## in#3 HIGH: the static-situation equality pins break when fixtures gain fields (O14 too)
Plan: sec 4 step 10 "every situation gains submitted, rows, hint, showChips and showCount"; O14 "prompt shows only after Enter".
Evidence: src/tests/surfaces/search-web-binding.ui.test.tsx:95 `expect({ ...WEB_STATIC_SITUATION, recent: [] }).toEqual({ ...(SITUATIONS.static ...), recent: [] })`. src/tests/maxbld-web-pages.logic.test.ts:134 `expect(idle).toEqual(WEB_STATIC_SITUATION)`. WEB_STATIC_SITUATION (src/lib/surfaces/maxbld-web.ts:27-30) has `showPrompt: true` and none of the new fields. parcelSearchMatch.test.ts:386 `toEqual(S.static)` rebuilds the fixture from hook values. If the shared `static` fixture changes (new fields, or showPrompt false for O14), these fail, and static.web.json stops being "fingerprint-only". search-web-binding.ui.test.tsx:90 also asserts the web idle page includes the prompt. None of these files, nor maxbld-web.ts, is in section 4 or the Files line.
Fix: either add the new fields to WEB_*_SITUATION and WebSituation (maxbld-web.ts, web SearchBinding.tsx) or make them optional and omitted from the shared fixtures. Keep `static`.showPrompt true or rule the web change. List maxbld-web.ts, search-web-binding.ui.test.tsx and maxbld-web-pages.logic.test.ts as outside files.

## in#4 MED: the Spec 136 fe.31 reading is asserted, not shown, and a Spec 126 note is owed
Plan: sec 1 quotes fe.31; sec 4 steps 3-4 add a `submit` action and onSubmitEditing, with no reading.
Evidence: fe.31 (136_mcfrontend_handbook.md:124) says "a new library, component kind or binding is an operator ruling first". `submit` adds no component (COMPONENTS, SurfaceRenderer.tsx:28, is unchanged; bindings.json modules[] and mapping.mobile.SEARCH are unchanged). That is the best reading: a new action and a prop name on an existing binding, not a new kind or binding. But the precedents recorded it each time: open_help (Spec 126 line 995 note, operator ruling, both targets) and non_display_keys gains (topic, tabIndex, pressBehavior: dated notes in the bindings.json $comment).
Fix: state the reading in sec 1 and quote RR-0483 (Enter) and RR-0487 as the authority. Add a Spec 126 §11b dated note (M-246) for the `submit` action and the non_display_keys gain, and list docs/specs/02-web-admin/126_maxbld_surface_standard.md as an outside file. If the operator should confirm the reading, make it an explicit question.

## in#5 MED: `submit` must be optional in SurfaceActions, or other hosts stop compiling
Plan: sec 4 step 3 "SurfaceActions gains `submit`. select becomes optional, as open_help is".
Evidence: SurfaceActions is built in useWallState.ts:28 (`{change_input: NOOP, set_input: NOOP, retry: NOOP, select: NOOP, back: NOOP, push...}`), reportPage.behaviour.test.tsx:202 (typed `SurfaceActions`), surfaceRenderer.smoke.test.tsx:25-26, and disambiguate.tsx:44 and semi-question.tsx:91 (`select`). A required `submit` breaks the wall host and those tests. Making `select` optional is not needed: those hosts still use it. It would also force `act.select?.(` in the switch.
Fix: write `submit?: () => void` (like open_help) with `act.submit?.()`. Leave `select` required. Then no file outside the plan changes.

## in#6 MED: the drop-down rows are not candidates, so the contract and derived refs need re-keying
Plan: sec 3(c) and sec 4 step 5 "Each row is a Button ... the existing segment Texts"; step 1 "rows {parcelId,address,route}[] (unique gives [match])".
Evidence: SearchBinding.tsx:196-198 `segmentsOf` reads `s.candidates[i]`. :162-163 and :218 use `contract('candidates.i.parcelId')` and `derived('label.i')`. :275-284 searchData builds contract.candidates, label and segments from `s.candidates`. A unique or multi_parcel row lives in `match`, not `candidates`, so those refs would resolve to nothing or the wrong lot. SV-SBIND judges contract refs against the lookup contract's field_whitelist, and the plan names `match.parcelId` and `match.address` there. The plan says `candidates` keeps its meaning but never says searchData and segmentsOf move to `rows`.
Fix: in step 5, say searchData's `label` and `segments` and the row refs are built from `rows` (push uses the literal `route`, so no contract ref is needed). Check that the DERIVED_NAMES patterns (:49) still cover them. This stays a derived-only deviation.

## in#7 LOW: the existing screen test mock cannot fire a focus callback, so T9 needs a mock change
Plan: sec 5 T9 "fire the captured focus callback".
Evidence: parcelSearchScreen.behaviour.test.tsx:~28 `useFocusEffect: (cb) => R.useEffect(cb, [cb])` captures nothing. It runs the callback on mount and again whenever the callback identity changes. A new focus effect that clears input and submitted on each run would also wipe state on any rerender that changes its deps.
Fix: say the mock must capture the callback, and that the new effect needs stable deps (no `situation` in them).

## in#8 LOW: cites in other descriptors will drift, and the plan's "check-cites catches it" does not hold
Plan: sec 6 "Line-cite drift in the descriptor evidence is caught by check-cites"; step 9 re-points only the search descriptor cites.
Evidence: mobile_parcel_search.descriptor.json:266 cites `parcel-tool/index.tsx:287`, but the file is 135 lines, so cites are already stale, which means a weak lock. Other carriers of PSM lines: shell_parcel_tool_stack.descriptor.json:66,87,178 (`parcelSearchMatch.ts:258`, now activeParcelTab at :259), contract_parcels_lookup.descriptor.json:641 (`:93`), mobile-product.json:8087/8145 (`:91`, `:98`), src/tests/search-routing.logic.test.ts:9 (`:183-186`). O5(b) adds lines inside PSM before these.
Fix: either keep isOutsideToronto edits line-neutral (new helper placed at the end of the file), or list those carriers in the Files line. Drop the "caught" claim.

## in#9 NIT: unlisted but probably untouched, to state in the plan
Evidence: daylightSearchPages.golden.test.ts:27-32 walks every fixture situation through searchProps and the class-token rules; the new classes must pass them. src/tests/ParcelCostTool.ui.test.tsx:114 and ParcelCostTool.tsx:210 hold the admin "No parcel found" copy, which is separate from search.miss.
Fix: add one line to sec 6 saying both were checked.

STATUS: 9 findings (0 CRITICAL, 3 HIGH, 3 MED, 2 LOW, 1 NIT); the web parity lock, the census-first generator order and the static-situation pins are missing from section 4, so the Files line would be refused again.
