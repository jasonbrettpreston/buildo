Seat: Cairn-Integration-G3

Scope: read-only. Reviewed at the working-tree head 8e327a9bc; the group record was cut at 8dba70e8e. No database connection. No file written.

## 2. What I read or ran

Read, with both ends of each seam traced:
- Lookup route: src/app/api/parcels/lookup/route.ts, types.ts, and src/lib/parcels/lookup-flow.ts, consumer-lookup.ts, lot-map.ts, lot-form.ts, tool-gate.ts, report-page.ts.
- Phone parser and hooks: mobile/src/lib/schemas.ts, mobile/src/hooks/useParcelLookup.ts, lotForm.ts, semiQuestion.ts, parcelSearchMatch.ts, persistFilter.ts, and the parcel-tool mount files.
- Meter and reports-left read: src/lib/entitlements/index.ts (openReport, readParcelToolUsage, reportPeriod) and the entitlement route and types.
- Lot-size entry: src/app/api/parcels/lot-size/route.ts and types.ts, src/lib/parcels/lot-size-entry.ts, migrations 305 and 324, and the seed rows.
- Page settings chain: scripts/seeds/logic_variables.json, the search descriptor, scripts/surfaces/emit-mobile-surfaces.mjs, mobile/src/lib/sliceConfig.ts, and the generated slices.
- Records: all eight GROUNDER files (by search) and the G3 section of STATUS.md.

Ran (read-only, no --write):
- `emit-mobile-surfaces.mjs --check` printed "surfaces ok (4 surfaces, 30 goldens)".
- `surface-validate.mjs --check` printed current; S-gen, S-golden, S-parity, binding, closed-status, S-desc, S-screen, S-sbind and S-page are all ok.
- A parse of every .json file in files.txt: all parse.

## 3. FINDINGS (most serious first)

### 1. MED, latent until the meter is on. NEW. A user who has used up the monthly allowance is told to reactivate their subscription.
- Server end: route.ts:109-114 returns `reportLimitReached(...)`. That is 403 with code REPORT_LIMIT_REACHED and details {reportsLimit, resetsOn} (src/features/leads/api/error-mapping.ts:37-38).
- Phone end: mobile/src/lib/apiClient.ts:49-63 turns any 403 that is not ACCOUNT_DELETED into `new ApiError(403, 'Forbidden')`. The code and details are dropped.
- parcelSearchMatch.ts:297 sets `entitlement = error instanceof ApiError && error.status === 403`. SearchBinding.tsx:134-135 then prints content `search.entitlement`: "Your subscription doesn't include the parcel tool right now ... reactivate to search lots again." (mobile_parcel_search.content.json:13).
- Effect: a paying user at 10 of 10 gets a lapsed-subscription message on the search path. The reset date the server sends is thrown away. The report screen gets its generic error state; I did not read it.
- Today this cannot be reached, because of the "1 b 2 a" rule that makes nothing count while the cost menu is withheld (known; GROUNDER-C:143). It will appear on the day billing is switched on.
- Smallest fix: keep the error code on the phone's ApiError for 403, and give REPORT_LIMIT_REACHED its own line using the served resetsOn. This needs wording from the operator.

### 2. MED, latent. NEW (the pieces are known; the combination is not). The meter fires on a search-box pause, not only on opening a lot.
- Route end: route.ts:105-115 meters any hit with a page, on the q path as well as the parcelId path. The test at parcel-lookup-gate.infra.test.ts:339-345 pins "a q lookup ... counts once".
- Resolver end: src/lib/admin/parcel-lookup.ts:285-309 returns `resolution: 'unique'` with matchType 'typeahead' when a street-name prefix (`LIKE streetName%`) leaves one linked lot.
- Phone end: SearchBinding / index.tsx navigate straight to the lot on `unique`, after the 400 ms debounce, with no check on matchType (parcelSearchMatch.ts:202).
- Effect: once billing is on, a pause while typing "12 Elm" that happens to match one lot charges one report for a lot the person did not finish typing. The page compute also runs on the search path (several seconds).
- Spec 100 §3.2 dated note (3) says the map path is unmetered and "the chosen lot opens through the metered parcelId path". That implies metering on the lot open, not on the search call.
- Needs an operator ruling: meter only the parcelId path, or only matchType exact. Question 1 below.

### 3. MED. NEW. Six page settings sit in the Admin Control Panel as editable rows, but nothing reads the stored value.
- Seed end: maxbld_page_debounce_ms, min_query_len, continue_wait_ms, entitlement_stale_ms, lookup_retry_max and lookup_stale_ms (logic_variables.json:10837-10895) carry admin group "Parcel Lookup". src/features/admin-controls/generated/logic-variable-groups.json lists them in that group.
- Generator end: emit-mobile-surfaces.mjs:34-47 requires the descriptor value to equal the seed default (`v !== row.default`) and bakes it into the generated slice at generate time.
- Phone end: sliceNumber (sliceConfig.ts:15-27) reads only the slice. No code on the server or phone reads the database row. The only SQL reads of the page-setting names are in tests (grep over src).
- Effect: an operator who edits one of these in the panel changes nothing until someone edits the descriptor and seed and regenerates. The seed descriptions say the phone "applies it" but do not say a panel edit is inert.
- Smallest fix: take them out of the panel group (admin.hidden "internal", as user_lot_size_entry_enabled does), or say in each description that the value is baked at generate time. Question 2.

### 4. LOW. NEW. Same class as the known L1 (schemas.ts:428), but through enum values.
- The phone's enums are closed: ParcelLotFormSchema.basis and detected (schemas.ts:426-431), `resolution` (schemas.ts:442), and matchType (schemas.ts:370).
- The contract is additive_only. A new value from the server fails the phone's parse on every installed build and raises ParcelLookupSchemaError.
- Today the server views (migrations 320 and 323) emit exactly the three bases and two forms, so there is no live fault.
- Smallest fix: accept a string for these on the phone, or record that the contract is additive for fields but not for enum values.

### 5. LOW. NEW. The two massing thresholds can be set so one class vanishes.
- Seed bounds: massing_shed_threshold_sqm 1 to 200 and massing_garage_max_sqm 1 to 500 (logic_variables.json:1398-1417), with no cross-check.
- scripts/lib/compute/link-massing.js:330-337 classifies shed below the first value, then garage up to the second. With shed 150 and garage 60, no building is ever a garage.
- Defaults 20 and 60 are fine. The file is outside G3's list; only src/tests/link-massing.infra.test.ts is in the group.
- Smallest fix: refuse shed >= garage at read time, or narrow the shed maximum.

## 4. Checked and found sound

- Lookup response against the phone parser, field by field: match, candidates, warnings, parcel (costMenu, areas, neighbourhood, comparable builds, CoA projects, compStats), resolution, map (lots, centroid, outline, frontageStreet, hasFootprint, fit, pin, neighbours), page (parts, kinds, ad, drawing, layout) and lotForm. Names, nullability and enums agree. The phone is looser where intended: plain objects, optional additions, except lotForm (L1, known).
- Map presence rule: the server's refine (types.ts: map present exactly for multi_parcel and unlinked) matches what lookup-flow.ts builds.
- Entitlement response against the phone's ParcelToolEntitlementSchema: all seven fields agree. resetsOn is a Z-suffixed ISO string, which passes `.datetime()`. reportsLimit seed bounds start at 1, so `positive()` holds. The "no row" and "limits unreadable" cases send all nulls, and the phone then draws no line.
- Meter mechanics: row lock, then status re-test, then DISTINCT count in the billing window, then insert. Column list and values match migration 303: the event and subject_kind CHECKs allow property_view and parcel_ref, and the principal CHECK is met. The re-open of a counted lot returns already_counted. The window arithmetic is pure and handles late renewals. The three limit keys and the timeout key match the seed and bounds, and migration 322 inserts the pro and timeout rows.
- Semi flow: the phone sends semi only for the exact string "answered" (useParcelLookup.ts:84-86). The server accepts only that literal, and only with parcelId. The answered result is stored under the report's own query key, so the held page and the answered page never collide.
- View seam: the parcel_lot_form columns and values (migrations 320 and 323) match ConsumerLotFormSchema. A missing view degrades to no block (42P01), not a 500.
- Lot-size entry against table and index:
  - Insert columns match migrations 305 and 324. The shape CHECK is satisfied by both paths (dims: four values set and typed_value NULL; area: four NULL and typed_value set).
  - NUMERIC(8,2) and NUMERIC(12,2) hold every value the seed bounds permit.
  - The partial unique index (uq_parcel_user_inputs_active) gives 23505, which becomes 409 inside a transaction that rolls back (db/client.ts:129-150).
  - parcels.parcel_id is UNIQUE (migration 011), so the LEFT JOIN read returns one row.
  - The switch (seed bounds 0 to 0) is read first and refuses with 403 ENTRY_OFF. Nothing on the phone calls the route.
  - Settings keys equal the contract JSON, which is checked at load.
- Page-setting chain from seed to emitter to slice to reader: seed bounds, descriptor entries, generated slice, and sliceNumber agree, and the emitter's --check is clean. The descriptor and seed values match: 400, 3, 0, 3, 60000 and 60000. The server's 3 to 120 query range equals the min_query_len bounds.
- Wiring: every mount file, binding and hook in the group is reached from the parcel-tool routes or SurfaceRenderer. The web SearchBinding is mounted by src/app/(maxbld)/parcel-tool/SearchPageClient.tsx and error.tsx. Entitlement route to useParcelEntitlement to the search page is live. lot-size has two live callers, the admin revert and its hook; the user-entry route is deliberately off.
- Generated files current; the full surface-validate gate is green.

## 5. Questions for the operator

1. Should a report count when a search-box pause resolves to one lot by street prefix (typeahead), or only when a lot is opened by id, or only on an exact match? (Finding 2.)
2. Are the six maxbld_page_* settings meant to be panel-editable? If not, hide them. If so, something must read the stored value. (Finding 3.)
3. What should a person see at the monthly limit, and should the reset date show? (Finding 1.)
4. Should the semi answer yes or no change the report? lotForm.ts says the override is not applied yet (task 209). A person who answers "no, detached" is still counted once, and the report is built on the detected form.

## 6. UNVERIFIED

- Whether the report screen's generic error state is what a 403 shows there (not read in full).
- Whether parcel_lot_form.unsure can be NULL when doubt_on is NULL. This depends on cfg.doubt_on, which I did not read. A NULL would fail ConsumerLotFormSchema.parse and give a 500 for that lot.
- No database read, so no row counts. I did not check whether the six maxbld_page_* rows exist in any database, only that the seed carries them and migrate.js loads the seed.
- The 4 phone test files and 24 src tests were not run, by rule. I read only the parts that pin the meter.
- Items already ruled (V1 to V5, L1 to L8, N1 to N4, R1 to R5, the meter-off rule "1 b 2 a", the missing pro key in the contract config) are not repeated.
