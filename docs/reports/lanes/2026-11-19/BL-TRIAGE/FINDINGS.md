# Increment 1·B output panel 1: findings as returned by the seats (untriaged)

Scope: `git diff 9f04d9074..wf2/board -- src mobile scripts` (board head at the time: after BL-SUITEFIX2's first fold). Seats: read-only Explore agents, Sonnet, one narrow question each. None of these findings has been adjudicated (Spec 08 §5.3 round 2 owed). Recorded by the orchestrator 2026-11-19 evening from the seats' reports.

## Reality check
- RC-1 HIGH: the meter never counts. route.ts:163 decides "not evaluated, not counted" from hasEvaluatedOption(body.parcel), which reads only the legacy costMenu.menu (src/lib/parcels/consumer-lookup.ts:65-68); costMenu.menu is always sent null (consumer-lookup.ts:161), so the meter is always not_evaluated; the comment at :62-63 says counting waits for MB-94. Nothing in the diff connects the served page to the meter. counted and limit_reached unreachable.
- RC-2 MED: an unsure lot before semi=answered: route.ts:164 sets semi_pending but the response still carries `page` (route.ts:134-147); only the app hides it.
- RC-3 MED: freshness ignores settings: project.ts:179-184 compares layer2 version, catalogue_sha, switchboard_sha; settings_sha is stored and shown but never compared (seed-shas.ts:23). A changed cost setting leaves old numbers `current`.
- RC-4 LOW: stale comment src/app/api/parcels/entitlement/route.ts:6 "N of 20 reports left" (seed defaults 10/10/25).
- RC sound: left cannot be negative, exceed allowance or be NaN; allowance 0 impossible; month-end and leap maths; dedup key = usage_events.subject_key (parcel_id of the fetched row) under the entitlement lock; no legacy number reaches a person; not_in_engine_population shows no number.
- RC UNVERIFIED (needs database): renewal rewriting current_period_end to a clamped date drifts the anchor; trial reset date versus trial end.

## Integration
- IN-1: report-page.ts:54 returns null while MAXBLD_WEB_LIVE is false (maxbld-web.ts:19), so the web-named switch gates the MOBILE report too: every lot shows the miss screen on the app; route.ts:165 then sets meter not_produced and openReport is never reached. (Known as task-348 D1.)
- IN-2 minor: lotFormOverride (mobile/src/lib/lotForm.ts:23, :40) is put on the report route and nothing reads it; the semi answer has no effect on the report; lotForm.ts:9 says the report applies it via lotFormEffective.
- IN-3: the web reports-left twin is dead code: no web file fetches /api/parcels/entitlement; maxbld-web.ts:27-40 situations have no entitlement key.
- IN-4: not_in_engine_population (project.ts:142, :208) almost never reaches a customer: a no-rows ungated lot is not_stored and pageForVerdict returns null (report-page.ts:44-45, D2); only a gated no-row lot shows the sentence.
- IN-5: the meter can fire for a report never opened (left mid-Continue); a `q` search hit on a clear lot meters at typeahead (route.ts:166) before the lot page opens.
- IN sound: semi flag and meter once per lot per month; footer builder and its three users; link targets exist on the maxbld.ca host.
- IN UNVERIFIED: server ReportPageViewSchema (types.ts:176) versus mobile plain schema (schemas.ts:405-422) field by field; footer links on the admin preview host.

## User experience
- UX-1 BLOCKS: zero left then pick a lot: 403 REPORT_LIMIT_REACHED (error-mapping.ts:37-38; route.ts:170) is shown as the subscription refusal "Your subscription doesn't include the parcel tool right now... reactivate" (parcelSearchMatch.ts:297); on the report screen a 403 becomes "Could not load this report. Try again." with a Retry that can only fail (report-presentation.json:89; ReportBinding.tsx:373-377). Design: report-limit.html. (Limit wall not built: on task-343.)
- UX-2 BLOCKS: after picking a lot the person lands on "No report for this lot yet." ([parcelId].tsx:34; ReportBinding.tsx:400-401): Back only, no address, no reason; an unsure semi lot is asked the question first and then reaches the same line; one-frame flash of the miss text before the semi redirect ([parcelId].tsx:28-33).
- UX-3 VISIBLE: the semi page can get stuck after a failed Continue: a 429 or 403 sets submitError and the retry action is only offered in the unexpected-error branch (SemiQuestionBinding.tsx:50-65); answer cards gone; Back only.
- UX-4 VISIBLE: Continue shows no busy state (v8 .btn.p[aria-busy], choose-lot.html:132).
- UX-5 VISIBLE: leaving the semi page mid-Continue spends a report with nothing shown.
- UX-6 VISIBLE: the help link leaves the app (maxbldHelp.ts:19 Linking.openURL); v8 draws an in-app sheet with Done (search.html:235); topics lot_match/address_match versus v8 wrong-lot.
- UX-7 MINOR: lot map help link bare in the intersection, too-many and unlinked states (LotMapBinding.tsx:225-231); the disabled-button hint "Pick a lot on the map or in the list." (choose-lot.html:278) has no content key.
- UX-8 MINOR: search page order differs from v8 (SearchBinding.tsx:231-238 versus search.html:264-267, :280-282, :305-306, :320-323); outside-Toronto text sits in a red notice below the legal line and recents.

## Compliance
- CO-1: reset date formatted on the device (RR-0310 violated by the built state): being fixed by task-351.
- CO-2: no-plan page not built (RR-0312): owed, task-355 writes the build task.
- CO-3: search box wording (RR-0313): owed, task-355 writes the build task.
- CO-S1 clause silent: web-only footer versus FE-07 parity; footer.* keys added to the mobile content file but not rendered by the mobile binding.
- CO-S2 clause silent: help links mobile only; no web lot-map binding exists.
- CO-S3: proof-slices.json lists design-fit NOT BUILT blocked by task-345 and task-67 though RR-0306 dropped that dependency (exit 3 forever); row report-opens blocked by task-123, which is now built (stale).
- CO UNVERIFIED: whether a client-asserted semi=answered flag is acceptable as a meter gate.

## Grounding and context (the orchestrator's own readings)
- GR-1: 44 px is a floor: TRUE in Spec 126:351 and 128:265; no spec or ruling says exactly 44; the decision at MORNING-DECISIONS.md:1227 is the orchestrator's, not ruled, Option B open.
- GR-2: MF-85 for task-121 and MF-48 for task-123 are readings, a loose fit to the rows' own scopes (.cursor/MCFRONTEND-QUEUE.md:619-621, :358-370); not operator-ruled.
- GR-3: "numbers only inside the tester and admin gate until MB-38" is ruled (.cursor/MCBYLAWS-QUEUE.md:785; decision-79) but does not answer task-348 (which switch gates W, when the tester view lands).
- GR-4: no rule on where a proof tool lives.
- GR-5: help topics exist; the choice is an orchestrator reading (.cursor/MCFRONTEND-QUEUE.md:412).
- GR-6: PARTLY: MORNING-DECISIONS.md:704-705 do not say "a miss in W"; the wording is in :1057 and the BL-W2 note; the cite on task-266 is loose.

## Security
- SE-1 MED (after the live switch flips): an unsure lot's `page` is served without a count when the caller never sends semi=answered; page is built at route.ts:~134 before the meter decision; fix direction: page null while semi_pending. (Same as RC-2.)
- SE-2 LOW UNVERIFIED: deep link .../parcel-tool/ID?semi=answered skips the question page (mobile/src/lib/lotForm.ts:28).
- SE sound: the flag cannot burn another user's count (uid from session, parcel ref from the fetched row, idempotent); read returns the customer response only; no IDOR; the off switch is a compile-time constant; entitlement route auth + rate limit; help link encodes into a fragment on a constant host; footer hrefs static.
- SE UNVERIFIED: bodies of openReport and readParcelToolUsage, host-policy.ts.

## Code reviewer
- CR-1 MED: semi-question.tsx:~33 mountedRef is set false in the effect cleanup and never set true in the effect body; under StrictMode or Fast Refresh the ref stays false: Continue fetches (the server counts) and never navigates. UNVERIFIED whether StrictMode is on.
- CR-2 LOW: continueToReport catch only sets submitError; non-schema errors not logged there.
- CR-3 LOW: mobile ParcelToolEntitlementSchema status is z.string() (server enum); status, reportsUsed, reportsLimitReached unread on mobile.
- CR-4 LOW: first mount can fire the entitlement fetch twice (query + focus refetch).
- CR-5 LOW: web SearchBinding footer() casts footerNode(...) `as WebNode`.
- CR-6 LOW: read-stored.ts header comment on logging true only via the route; four sequential reads with no snapshot (UNVERIFIED as a risk).
- CR-7 LOW: scripts/analysis/proof-slice.mjs checkSpec: `"suite": null` throws a TypeError instead of exit 2; timeoutMs not type-checked; unwritable --out exits 1 (collides with FAIL).

## Regression guardian
- RG-1 LOW: the web report footer's G4 copyright part is skipped by the test (report-page.ui.test.tsx:41, reason RR-0273) with no assertion that the shared copyright shows in its place.
- RG-2 MED-LOW: the server-side semi hold became a client-asserted flag (ruled RR-0278; can only make a lot count).
- RG-3, RG-4 LOW: FLIP_PENDING gained FE-39; C-9m accepts 48 px Buttons: both dated, RED cases kept or extended.
- RG sound: the projection move kept every guard line for line; tests tightened on the footer parity.
