Seat: Cairn-Integration-G1

1. WHAT I READ (read-only, no database connection, nothing run)
- GROUNDER-A.md and C.md headers, STATUS.md G1 section, context.md, files.txt.
- mobile/app/(app)/[lead].tsx (all), mobile/src/hooks/useLeadDetail.ts, mobile/src/hooks/useSaveLead.ts, mobile/src/lib/leadDetailFormat.ts, mobile/src/lib/schemas.ts:185-240.
- src/app/api/leads/detail/[id]/route.ts and types.ts, src/lib/leads/lead-detail-query.ts, src/lib/leads/parse-lead-id.ts, src/lib/parcels/geometry.ts:1-22.
- src/features/leads/lib/get-lead-feed.ts:112-125, mobile/app/(app)/index.tsx:125-136, mobile/app/_layout.tsx:405-415, mobile/src/components/shared/SaveButton.tsx:50-80.
- scripts/seeds/logic_variables.json:8182, migrations 013, 086, 091, mobile/maestro/lead-detail.yaml, mobile/__tests__/leadDetailScreen.sqft.behaviour.test.tsx, src/tests/leads-detail.infra.test.ts:118-136, the F90 lead-detail descriptor.

2. FINDINGS (most serious first)

1. HIGH, NEW. The save heart on the detail page uses a different lead id from the page's own cache key, so tapping Save does not update the page.
   - The feed builds lead_id as `NUM:REV` (src/features/leads/lib/get-lead-feed.ts:121). Tapping a card pushes `/(app)/[lead]?id=${item.lead_id}` (mobile/app/(app)/index.tsx:133; map.tsx:72 does the same). The page's query key is therefore `['lead-detail', 'NUM:REV']` (useLeadDetail.ts:81 with id from [lead].tsx:45,52).
   - The detail API answers with `lead_id = NUM--REV` (lead-detail-query.ts:201, 377).
   - The page hands that `detail.lead_id` to the save mutation ([lead].tsx:70, 235-ish SaveButton at the bottom, leadId={detail.lead_id}).
   - useSaveLead writes the optimistic flag to `['lead-detail', leadId]` (useSaveLead.ts:76), rolls back to the same key (:100) and refetches the same key on settle (:115-117). With leadId = `NUM--REV`, all three miss the page's real key `NUM:REV`.
   - The feed match `item.lead_id === leadId` (:63) also misses, because feed ids use the colon form.
   - What a person sees: on a lead opened from the feed or map, they tap the heart and it does not fill. The "Track this job" text does not change. SaveButton computes `willSave = !isSaved` (SaveButton.tsx:52), so a second tap sends save=true again and the lead can never be unsaved from this page. The server does save it (the save route accepts the `--` form); only the screen is wrong, until the 60 s staleTime ends and a refetch happens. The feed list is still invalidated on settle (:112), so it corrects itself.
   - It works only for deep links that already use the `--` form, which is the form the Maestro flow and the unit tests use. That is why the tests did not catch it. A push-notification entityId may be either form (_layout.tsx:413, 472); I could not see which.
   - Smallest fix: in [lead].tsx pass the route `id` (the key) to the save mutation instead of `detail.lead_id`, or make the mutation write both forms. The save route accepts both ids (parseSaveLeadId delegates to parseLeadId, which takes `NUM:REV` and `NUM--REV`).
   - The earlier A:mobile-99-p1#2 ruling covered only whether the cache write is a state-ownership breach. It did not see this key mismatch. NEW.

2. MED, NEW. The "Target Start Date" can show the day before the real date on a phone in Toronto.
   - The query returns `predicted_start::text` from a DATE column (lead-detail-query.ts:99; migrations/086:94), for example "2026-12-01".
   - formatDateLong does `new Date(iso)` ([lead].tsx:38). A date-only string parses as UTC midnight. It then reads `getMonth()` and `getDate()` in local time ([lead].tsx:40).
   - At UTC-5 or UTC-4 that prints NOV 30 instead of DEC 1. It is wrong on every lead with a forecast, for any phone west of UTC. The unit test uses '2026-06-01' but never asserts the printed date.
   - The same pattern is in [flight-job].tsx:25, :32, and FlightCard.tsx:30 (outside G1), so the same fault is likely there.
   - Smallest fix: parse the Y-M-D parts directly, or use the UTC getters. Leave off any time-zone conversion.

3. MED (data-conditional), NEW. A permit whose stored revision is a bare '0' returns "not found" from the feed.
   - The feed pads the revision: `LPAD(p.revision_num, 2, '0')` (get-lead-feed.ts:121). The comment at :117-120 says some older rows hold a bare '0'.
   - parseLeadId passes the padded `…:00` revision through unchanged (parse-lead-id.ts:~62-76). The detail SQL then compares exactly: `p.revision_num = $2` (lead-detail-query.ts:134).
   - For a row stored as '0' the lookup gets '00' and matches nothing. The route returns 404, and the page says "This permit is no longer available" (the C:D1 wording).
   - I could not check whether any such rows exist, because I made no database connection. The Reality-check seat or the operator can count `permits WHERE revision_num = '0'`.
   - Smallest fix: in the SQL, compare `LPAD(p.revision_num, 2, '0') = LPAD($2, 2, '0')`. The same shape is already used for lead_key at lines 119 and 127.

4. LOW, NEW. The Maestro deep link cannot reach a lead.
   - mobile/maestro/lead-detail.yaml:32-ish opens `maxbld://(app)/lead?id=permit_test_123`. The id has no `--` or `:`, so parseLeadId returns null (parse-lead-id.ts:82-84). The route answers 400 and the page shows not-found.
   - The flow's own fixture note says only that the permit must exist. It does not say the id needs the form `NUM--REV`. The flow cannot pass as written. The saved=true set-up mistake in the same file is ALREADY-KNOWN (A:C9).

3. CHECKED AND FOUND SOUND (seams followed to both ends)
- FIX.AREA-FACTOR seam:
  - types.ts:14 `modeled_gfa_sqft: number | null`.
  - lead-detail-query.ts:155-157, 179, 355 set it in both the permit and CoA producers, null when the area is null.
  - schemas.ts:197 is `.nullable().optional()`.
  - [lead].tsx:81 reads `cost?.modeled_gfa_sqft`.
  - leadDetailFormat.ts:16 only formats.
  - leads-detail.infra.test.ts:124-136 pins 142.5 m² → 1533.85575.
  - The phone has no factor.
- Pinned factor: geometry.ts:6 reads `parcels_sqm_to_sqft`; logic_variables.json:8182-8186 has key, type number, and min = max = default = 10.7639. Key, type and bounds match.
- Other field-by-field shapes agree between server and phone schema: location, neighbourhood, competition_count (int from `::int`), p25/p75 (INT), opportunity_score (INTEGER, migration 091, 0-100), avg/median income (INTEGER, migration 013), is_saved (boolean from EXISTS).
- Column types and null handling: pg returns numerics as text and the mapper converts them (toNumberOrNull). estimated_cost, range_low and range_high arrive as strings and leave as numbers. The all-null cost block becomes `cost: null`.
- Route param: the screen reads `id` from `useLocalSearchParams` and every caller passes `?id=` (index.tsx:133, map.tsx:72, _layout.tsx:413, 472, the Maestro flow and the test mock). The file name `[lead]` is not read as the id.
- Route wiring: route.ts imports both SQL strings and both mappers, and all are used. The route's status matrix (400, 401, 404, 500) agrees with the hook's retry guard (useLeadDetail.ts:57-65). RateLimitError and AccountDeletedError come from the shared client, though the route has no rate limit (already a question in STATUS).
- Both `::uuid` casts and the `isUuid` guard (route.ts:66) are consistent with lead_views.user_id being UUID (migration 229).
- The `trade_forecasts` join on `tf.lead_id = 'coa:' || …` and the other CoA join columns are consistent with the CoA branch. I did not re-read the migrations for column existence on the CoA side beyond the comment's claim.
- Nothing built twice: formatSqft and the other format helpers have one definition each, and the old queryClient cache walk is gone.

4. QUESTIONS FOR THE OPERATOR
- Does a push notification's entityId use `NUM:REV` or `NUM--REV`? It decides how many entry paths hit finding 1.
- Should finding 2 be fixed together with the same pattern in [flight-job].tsx and FlightCard.tsx, even though those files are outside G1?

5. UNVERIFIED
- Whether any permits row has revision_num '0' (finding 3). I made no database connection.
- The real device time zone behaviour of finding 2. This is reading of JS date rules only. I did not run it.
- Whether the push-notification payload carries the `--` or colon form (finding 1 scope).
- I did not read SaveButton beyond lines 50-80, the descriptor's remaining 500 lines, or mobile/__tests__/useLeadDetail.test.ts, so a test covering the finding 1 key mismatch could exist. I grepped `mobile/__tests__` for `useSaveLead` and found no test file by that name.

### Critical Files for Implementation
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/app/(app)/[lead].tsx
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/src/hooks/useSaveLead.ts
- /Users/brettpreston_macmini/Buildo-wt-board/src/lib/leads/lead-detail-query.ts
- /Users/brettpreston_macmini/Buildo-wt-board/src/lib/leads/parse-lead-id.ts
- /Users/brettpreston_macmini/Buildo-wt-board/mobile/maestro/lead-detail.yaml
