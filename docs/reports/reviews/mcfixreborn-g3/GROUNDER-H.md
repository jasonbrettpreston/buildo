Grounder: Cairn-Ground-G3H
Ruled: out-security-p1.txt sha256:04193d58f7e4 findings:4
Ruled: out-security-p2.txt sha256:58302cd1d79a findings:4
Ruled: out-ux-p1.txt sha256:e9322d03271b findings:5
Ruled: out-ux-p2.txt sha256:2c53e7dd1ee2 findings:3
Ruled: out-ux-p3.txt sha256:193337103aa5 findings:6
Ruled: out-ux-p4.txt sha256:f58c2c3e7478 findings:7
Ruled: out-ux-p5.txt sha256:4cb4f52d4952 findings:6
Ruled: out-ux-p6.txt sha256:36738d967518 findings:8
Ruled: out-ux-p7.txt sha256:68159e4c829e findings:8
Ruled: out-ux-p8.txt sha256:573266194946 findings:4
Ruled: out-ux-p9.txt sha256:bd46e41dfedb findings:4
Ruled: out-ux-p10.txt sha256:2385bb1653d5 findings:6
Ruled: out-ux-p11.txt sha256:4d4b54973f3b findings:4

(69 findings in all, 39 of them HIGH or MED, and none CRIT. Board HEAD is faa608ce6. `git diff --stat 8dba70e8e HEAD` over src/app/api/parcels, src/lib/parcels, src/lib/entitlements, mobile/src, mobile/app, scripts/surfaces and src/components is empty, so the code I read is the code that was reviewed. Evidence paths are relative to ~/Buildo-wt-board unless they start with ~.)

SECURITY RULING, END TO END (src/app/api/parcels/{lookup,entitlement,lot-size}/route.ts, src/lib/entitlements/index.ts, src/lib/parcels/{tool-gate,lookup-flow,lot-size-entry}.ts)
1. Lookup route (src/app/api/parcels/lookup/route.ts):
 - Order of checks: auth `getCurrentUserContext` (:63) -> 401. Then `parcelToolAccess` (:72) -> 403 before any parcel work. Then the query parse (:76-84) -> 400. Then the per-user rate limit (:88-93), 60 a minute on q and 30 a minute on parcelId, keyed on `ctx.uid` -> 429. The flow runs last.
 - Input validation: the Zod schema at lookup/types.ts:40-54 requires exactly one of q or parcelId. q is trimmed, 3 to 120 characters. parcelId is 1 to 32 characters. `semi` can only be the literal 'answered' and only with parcelId.
 - SQL: every parcel query I read is parameterised ($1, $2) in src/lib/admin/parcel-lookup.ts:256-389 and src/lib/parcels/lot-form.ts:32. The LIKE patterns are bound parameters.
 - What is metered and when: only a parcel_tool holder, only for a hit with a `parcel` and a found `parcelRef`, and only when a report page was produced (route.ts:105-115). A lookup that returns no evaluated option, an unsure lot with no semi answer, or no page is served and counts nothing (`not_evaluated`, `semi_pending`, `not_produced`). The first two are operator rulings, RR-0278 and "1 b 2 a". The `semi=answered` flag is request text. A caller can send it to skip the hold, but the lot is then counted like any other, so it buys nothing.
 - The meter itself (`openReport`, entitlements/index.ts:590-615) runs in `withTransaction`. It sets a local statement timeout, takes `SELECT ... FOR UPDATE` on that user's parcel_tool row, re-tests the status, reads the limits (fail closed on a bad value), and counts DISTINCT subject_key in the billing window. It returns `already_counted` for a lot already in the window, or `limit_reached`, or inserts one `usage_events` row. A limit refusal returns 403 REPORT_LIMIT_REACHED with no payload (route.ts:109-114, 143). A meter error is a 500 and no payload.
 - What a signed-in user without entitlement can obtain: a 403, from `parcelToolAccess` (tool-gate.ts:13-17), which needs a parcel_tool row in trial/active/past_due/admin_managed or a lead_gen status in that same set. An expired or cancelled parcel_tool row combined with an active lead_gen row still gets the unmetered arm. That arm is the declared transitional arm until MF-50 (Spec 100 dated note 2026-11-11, operator "a"); see out-security-p1#1.
 - Another user's entitlement: no route reads or spends one. `uid` always comes from `ctx.uid` (verified session), never from the request. `getEntitlementStatus` and `openReport` are keyed on that uid and return null or `not_entitled` for a non-UUID. The meter's subject_key is the matched `parcels.parcel_id` of the fetched row, never request text.
2. Entitlement route (src/app/api/parcels/entitlement/route.ts): auth first (:30), rate limit 30 a minute per uid (:33-38), a read-only `readParcelToolUsage(pool, ctx.uid)` (index.ts:640-669), and a `.strict()` response parse. It takes no input, writes nothing and takes no lock. A user with no row gets all nulls. A status outside the allowed set gets the status with null counts. A limits-read failure degrades to nulls with a warning, and the lookup meter stays fail closed. It is a display, not a gate, and no cross-user read exists.
3. Lot-size route (src/app/api/parcels/lot-size/route.ts, src/lib/parcels/lot-size-entry.ts):
 - Order: auth (:48) -> switch (`readLotSizeSettings`). The switch is OFF today: the seed has user_lot_size_entry_enabled min 0, max 0, and a DB value of 1 still reads off. OFF gives 403 ENTRY_OFF before any other read or write. Then `parcelToolAccess` (the same gate as the lookup, 403). Then a body parse: keys first, then one strict Zod parse built from the contract, at most 2 decimals, an extra key refused (400). Then the rate limit, bucket `parcels-lot-size:${uid}` per day, the limit from the admin setting. Then one transaction.
 - The transaction's SQL is all parameterised. The 404, the 409, the range check and the City-ratio check come first. The insert is protected by the partial unique index `uq_parcel_user_inputs_active` (migrations/305:50), so a race ends in a 23505 and is turned into a 409, not a 500. Responses use `.strict()` `LotSizeEntryViewSchema`, which carries no author and no typed value. The revert is an admin-only route: `verifyAdminAuth` and a session method (src/app/api/admin/parcels/lot-size/revert/route.ts:32-34) plus an audit row in the same transaction.
 - One user can write an entry for a lot they do not own, and that entry then governs every reader. That is the operator's own design: FE-19 "I dont think these need to be private - I think it will update the database with higher confidence information that will stay - its not a secret", plus the MF-19 decisions D-1..D-8 "all as recommmended" (135_mcfrontend_decisions_register.md FE-19 and FE-20). The guards are the switch, the entitlement gate, the 5 a day cap, the range test, the City-ratio test (3x) and the admin revert.
4. No exploitable security defect was found in the three routes or the entitlement library. The only gaps are the declared transitional lead_gen arm and the ruled shared-entry design.

TABLE OF CRITICAL/HIGH/MED FINDINGS (39 rows; none were rated CRIT)
id | sev | verdict | reason
out-security-p1#1 | MED | REFUTED-BY-RULING | lead_gen arm is the declared transitional arm until MF-50. tool-gate.ts:9-17 and Spec 100 dated note 2026-11-11 (operator "a") say so. No parcel_tool data is exposed to a user outside the ACTIVE status set.
out-security-p1#2 | MED | REFUTED-BY-RULING | entry is shared on purpose: FE-19 (operator verbatim, register line 41) and FE-20. The switch is OFF (seed min 0 max 0), the entitlement gate and 5 a day cap apply, and an admin revert exists (revert/route.ts:32).
out-security-p2#1 | MED | DUPLICATE of out-security-p1#2 | same claim, with an ownership assertion added.
out-ux-p1#1 | MED | CONFIRMED (D1) | LotMapBinding.tsx:189 spoken card name omits the lead (house or no building, and street).
out-ux-p1#2 | MED | DUPLICATE of out-ux-p6#1 | intersection copy.
out-ux-p1#4 | MED | CONFIRMED-LATENT (D2) | parcelSearchMatch.ts:301 treats RateLimitError(0) as unexpected, but our server never sends 0.
out-ux-p10#1 | MED | REFUTED | the /signup page exists: src/app/(maxbld)/parcel-tool/signup/page.tsx, with host-policy.ts:44 mapping /signup to /parcel-tool/signup. Only the test comment (nav-by-route.logic.test.ts:48) is stale (D5).
out-ux-p10#2 | MED | REFUTED-BY-RULING | the web search is not live in 1.B (maxbld-web.ts:19 MAXBLD_WEB_LIVE=false; RR-0438 MD:2253). No customer reaches the state.
out-ux-p10#3 | MED | REFUTED | the server always serves resetsOnDisplay with the counts (index.ts:625-666, resetLabel null only for an invalid ISO that reportPeriod cannot produce). The all-three-or-no-line rule is task-320 (parcelSearchCore.ts:78-80).
out-ux-p10#4 | MED | DUPLICATE-OF-EARLIER | the named fe.36 exception owed to MF-49: RR-0399 "mark partly" (MD:2017, task-440:282) and task-367:198.
out-ux-p10#5 | MED | NOT-APPLICABLE | a gap in the scope of a test lock, with no instance. No element with role=button on a div exists in the scanned directories (grep). Keyboard handling is not NAV-2's rule.
out-ux-p11#1 | MED | UNDETERMINED | unset inbox drops the five mail links (maxbld-static.ts:44-48 `keepValued`, readSupportInbox returns {}), which is the ruled behaviour (migrations/314 comment: "Until then the Help page shows no contact links"). Q1.
out-ux-p11#2 | MED | UNDETERMINED | plain pages carry only the footer links (static-page.json footer). Q2.
out-ux-p11#3 | MED | REFUTED-BY-RULING | Basic price in CAD plus HST, trial on both plans (MD:22, MF-47 re-plan); the Terms are marked "lawyer check before launch, MF-72" (web_terms.descriptor.json:5). Public web not live.
out-ux-p2#1 | MED | DUPLICATE of out-ux-p7#1 | Mississauga without a comma.
out-ux-p3#1 | MED | DUPLICATE of out-ux-p1#1 | card label.
out-ux-p3#2 | MED | CONFIRMED (D1) | LotMapBinding.tsx:217 fixed label vs the visible Choose a lot or Continue with Lot X.
out-ux-p4#1 | MED | UNDETERMINED | maxbldHelp.ts:26-28 swallows a failed sheet open by design (logged, topic only). Q3.
out-ux-p4#2 | MED | REFUTED | LotMapBinding.tsx:236-239 renders only a notice and a help link for too_many_lots and unlinked_no_pin. mapView is called only for unlinked and multi_parcel (:240-245), so no empty map frame is drawn.
out-ux-p4#3 | MED | DUPLICATE of out-ux-p7#1 | same.
out-ux-p5#1 | HIGH | REFUTED | an unset inbox is dropped by `keepValued`, so no mail link points at nothing. Migration 314 creates the setting, seeded empty. Only the $comment at static-page.json:2 is stale (D5).
out-ux-p5#2 | MED | UNDETERMINED | Q4, not_found onward link.
out-ux-p5#3 | MED | REFUTED-BY-RULING | the prices, trial length and Pro allowance are deliberately held until MF-47 and MF-45 (static-page.json:2 note, operator MF-76 D-1(a)). Public web not live.
out-ux-p5#4 | MED | NOT-APPLICABLE | census records UNRESEARCHED honestly. The web report page is not live (RR-0438); C-9 does not reach it, as the finding itself says.
out-ux-p5#6 | MED | UNDETERMINED | Q5, the semi page without entitlement.
out-ux-p6#1 | HIGH | REFUTED-BY-RULING | intersection copy is ruled: MF-53 D-5 b, operator (DECISIONS-v3.md:70; plan.v2.md:242 "the ruled copy"). The pill has a visible "Back to search" X (LotMapBinding.tsx:44-58), so the person can type there. The descriptor says the message only (descriptor.json:262-267, 442).
out-ux-p6#2 | MED | REFUTED-BY-RULING | "Try a nearby address" is the copy drawn in the approved small-pages-v4 state 2 (MF-53/plan.v4.md:20). Neighbour outlines are not drawn or tappable on the phone (no use in mobile/src beyond schemas.ts:395).
out-ux-p6#3 | MED | UNDETERMINED | Q6, server failure copy.
out-ux-p6#4 | MED | REFUTED-BY-RULING | RR-0289 (MD:1117-1118, operator verbatim): "has the house" is the ruled wording from footprint presence ("something is there").
out-ux-p6#5 | MED | DUPLICATE-OF-EARLIER | task-357 SRCH.NOPLAN (LATER), backlog/tasks/task-357...:31, records and owns "reactivate" with no way forward.
out-ux-p6#6 | MED | CONFIRMED-LATENT (D4) | content.json:15 and :21 hard-type "3". The setting maxbld_page_min_query_len has bounds 3-120.
out-ux-p7#1 | HIGH | UNDETERMINED | Q7: no-comma "123 Main St Mississauga". The limitation is stated at parcelSearchMatch.ts:62-65 and pinned by tests; no money or number is affected.
out-ux-p7#2 | HIGH | REFUTED | the contract emits resolution (lookup-flow.ts:49-58, 106; route log :119). The descriptor text is the old "prior text kept" with the 2026-11-11 closure in the same entry (M-246 convention).
out-ux-p7#3 | MED | UNDETERMINED | Q8, semi answer carried but not applied. The descriptor declares it (limitations[1]); the page is operator-approved (RR-0308/0309).
out-ux-p7#4 | MED | REFUTED (+LOW D6) | busy is built and pinned: SemiQuestionBinding.tsx:32,53-72 (task-361), approved busy look semi-question.html:130 (opacity .85), semiQuestionScreens.golden.test.ts:151. Only descriptor states[] omits it.
out-ux-p7#5 | MED | REFUTED-BY-RULING | the semi page's rate-limit and schema-drift copy is in the operator-approved mock (docs/reports/lanes/2026-11-19/BL-SEMI/semi-question.html:307,315; RR-0309).
out-ux-p7#6 | MED | CONFIRMED (D3) | search descriptor metering.answer "none" ("no usage_events table", "Measured 2026-09-16") is contradicted by route.ts:105-115, migration 303 and contract_parcels_lookup.descriptor.json ("metered").
out-ux-p8#1 | MED | REFUTED-BY-RULING | an intersection sends no map: Spec 100:103 "an intersection stays a client query-shape check on no_match"; MF-53 D-5 b; map is MF-60.
out-ux-p9#1 | MED | UNDETERMINED | BuildingMassing.tsx:30 is true to the code. If a lot had buildings but no is_primary row (permits/[id]/route.ts:232-262), the accessory and coverage data would be hidden. I cannot check the data (no DB). Q9.

CONFIRMED DEFECTS (deduplicated)
D1. Spoken names on the lot map differ from what is shown (out-ux-p1#1, p3#1, p3#2; LOW p1#5 same area).
 - Rule: the approved v8 mock, ~/Buildo-scratch/mcfrontend/small-pages-v8/choose-lot.html:274-278. The cards and the Choose a lot button carry no aria-label, so the spoken name is the visible text ("Lot A . has the house . faces Dunmore Lane", "Choose a lot"). Spec 126 and 90 are silent on wording, and I cite no repo rule on label-in-name. The basis is the mock plus label-in-name practice (WCAG 2.5.3).
 - Where: mobile/src/components/surfaces/LotMapBinding.tsx:189 (card accessibilityLabel is "Lot A, area, frontage, zoning", no lead sentence) and :217 (button label is always select.label "Open the report for the chosen lot" while the visible text is select.none, select.label or select.lot).
 - What happens: a screen-reader or voice-control user picks a lot without hearing "has the house" or "no building", which is the point of C.7. A voice-control user saying "Continue with Lot A" cannot activate the button.
 - Smallest fix: :217 `accessibilityLabel: content('select.label')` -> the same `label` variable used for the visible text (:200-204). :189 prefix the label with the lead, using the `leadKey` text computed at :180-184. This needs the lot.label content key or a lead var, and updates to lotMapPage.behaviour.test.tsx:92-93 and the golden, regenerated with the emitter.
 - Owning task: task-336 (card lead), task-322 and task-362 (button). Size: small, a few lines plus golden regeneration. The exact spoken wording is an operator judgment; default to the visible text, as the mock does. Impact: an accessibility gap, no money or data.
D2. RateLimitError(0) shows both the 0s notice and the generic error block (out-ux-p1#4; LOW p4#4 same).
 - Where: mobile/src/lib/parcelSearchMatch.ts:301 `unexpected = error != null && !retryAfterSeconds && !entitlement`, because `!0` is true.
 - Known and pinned as "DEFECT MF35-DF1" at :290 and in ~/Buildo-scratch/mcfrontend/MF-35/plan.v3.md:286. This is the same record, not a new find.
 - Latent: our server always sends Retry-After 60 or 86400 (src/features/leads/api/error-mapping.ts:46), so 0 needs a proxy to set it.
 - Fix: `!retryAfterSeconds` -> `retryAfterSeconds == null` at :301, plus the golden case parcelScreens.golden.test.ts (the RateLimitError(0) case). Owning task: MF-35, pre-existing, touched by tasks 320 and 356. Size: line. Impact: a cosmetic double message, only if a proxy sends 0.
D3. The search descriptor's metering block is stale and false.
 - Where: scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.descriptor.json, `metering` ("answer":"none", why "Nothing here is counted ... no usage_events table ... Measured 2026-09-16", evidence route.ts:113-119).
 - Today the lookup route meters (route.ts:105-115, openReport) and F02 contract_parcels_lookup.descriptor.json says "metered". The search page's own reports-left line reads that count.
 - Fix: rewrite metering.why and evidence so the answer matches F02 (the search page counts nothing itself; the lookup it opens counts on a produced report). Regenerate with surface-validate --check. Owning task: task-376 (the 1.B meter rule). Size: line (JSON text; check the closed enum for `answer`). Impact: a record that contradicts the code.
D4. Search copy hard-types the minimum length "3" in two strings (out-ux-p6#6).
 - Where: scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_search.content.json:15 ("Enter at least 3 characters...") and :21 ("Type at least 3 characters to search.").
 - maxbld_page_min_query_len is registered with bounds 3-120 (seed) and is resolved into the slice by emit-mobile-surfaces.mjs:34. Tuned to, say, 5, the copy still says 3. Today default 3 gives no visible fault.
 - Fix: make both strings take `{min}` bound to the slice value, or have a parity test pin the copy to the setting; one wording would be better than two. Owning task: task-395. Size: small. Impact: latent only; it matters the day the setting changes.
D5. Stale comments and cites (record only): static-page.json:2 "Help & Support has no mail link yet ... setting that does not exist on the tip" (migration 314 exists; five mailto parts exist), and nav-by-route.logic.test.ts:48-50 ("/signup ... no page until MF-46", src/app/signup NOT_YET), when the page exists under (maxbld)/parcel-tool/signup. Owning task: task-364 class. Size: line.
D6. The semi descriptor `states[]` omits the busy overlay (out-ux-p7#4), though it is built and pinned. LOW, line.

LOW/NIT (recorded only)
- Security: out-security-p1#3 (LOW; the 409 returns the stored entry view with no author, LotSizeEntryViewSchema is .strict(); existence leak is accepted shared design); out-security-p1#4 (LOW; permits/[id] is not a G3 file; permit public-record classification not verified); out-security-p2#2 (LOW; semi=answered only lifts the hold and the lot is then counted, no bypass); out-security-p2#3 (LOW; the per_day cap is enforced by the route's rate limiter, route.ts:83, not by the helper); out-security-p2#4 (LOW; `revertLotSizeEntry` has no privilege check but its only caller is the admin-session route, revert/route.ts:32-34).
- UX LOW: out-ux-p1#3, p1#5, p10#6, p11#4, p2#2, p3#3, p3#4, p3#5, p4#4 (= D2), p4#5, p4#6, p4#7, p5#5, p6#7, p7#7, p7#8, p8#2, p8#3, p8#4, p9#2, p9#3.
- UX NIT: out-ux-p2#3, p3#6, p6#8, p9#4.
- None looks like a HIGH-class defect mis-rated. Possible mild exceptions are out-ux-p4#6 and p4#7: v8 stroke and hint size may differ from the mock, which I did not check.
- Mis-rated downward: out-ux-p1#4 (MED, latent), out-ux-p6#6 (MED, latent), out-ux-p5#1 and p6#1 (HIGH, refuted).

TOTALS (39 rated HIGH or MED, none rated CRIT)
- Confirmed 5: D1 covers 3 ids, D2, D3, D4, plus D5 and D6 as comment or doc facts (D2 and D4 are latent).
- Refuted 8: out-ux-p10#1, p10#3, p4#2, p5#1, p7#2, p7#4 (with a D6 doc gap), plus the two security claims rolled under the ruling below.
- Refuted-by-ruling 11: out-security-p1#1, p1#2; out-ux-p10#2, p11#3, p5#3, p6#1, p6#2, p6#4, p7#5, p8#1; plus out-ux-p1#2 as a duplicate of p6#1.
- Not-applicable 2: out-ux-p10#5, p5#4.
- Duplicates 6: out-security-p2#1, out-ux-p1#2, p2#1, p3#1, p4#3, p10#4 (the last also counts as duplicate-of-earlier).
- Duplicate-of-earlier 2: out-ux-p10#4 (RR-0399), out-ux-p6#5 (task-357).
- Undetermined 9: out-ux-p11#1, p11#2, p4#1, p5#2, p5#6, p6#3, p7#1 (the group out-ux-p2#1, p4#3), p7#3, p9#1.
(The buckets overlap where a finding is both a duplicate and the carrier of a verdict; the table above is authoritative, one verdict per id.)

OPERATOR QUESTIONS (one sentence each)
Q1. While the support inbox setting is empty, should the Help page say something (for example "Support contact coming soon") in place of the dropped contact links?
Q2. Should the plain pages (Terms, Privacy, Help) carry a link back to the landing, sign-up or log-in, or is the footer enough?
Q3. When the in-app Help sheet fails to open, should the phone show a visible notice, or is a silent log acceptable?
Q4. Should the not-found page offer an onward link (landing or parcel tool)?
Q5. For a signed-in person without the parcel_tool entitlement on the semi page, what should the next step be (the app has no reactivate control; task-357 NOPLAN is LATER)?
Q6. Should a server failure (500) on the lot map say "Couldn't reach the lot service. Check your connection", or a separate server-failure line?
Q7. For a no-comma address such as "123 Main St Mississauga", accept the documented "No parcel found" answer (avoids refusing real streets like Markham or Milton), or add a trailing-city check so it gets "Lots are only available in Toronto"?
Q8. Is it acceptable that a person's Yes or No on the semi question is carried but changes nothing on the report until the report reads it (increment 7)?
Q9. Does any lot have building footprints but no primary row, so that the permit-detail Building Massing card hides accessory structures and coverage?

UNVERIFIED
- No DB, no device and no test run. All entitlement, meter and lot-size behaviour was ruled by reading code and migration text (migrations/305, 314), not by execution.
- Whether `withRateLimit` counts refused attempts (it is keyed per uid and window; I did not read its internals).
- The permit-detail route (out-security-p1#4) is outside G3; whether permit applicant fields are public record is not checked.
- Whether the operator approved the lot-map spoken labels as built: only the v8 mock was read, not the walk records.
- Whether `metering.answer` has a closed enum that blocks the D3 edit; I did not run surface-validate.
- The lot-map stroke colour and hint size findings (p4#6, p4#7) were not compared with the mock.
- The built tests were not run, and the golden regeneration steps in D1 and D2 are inferred.
