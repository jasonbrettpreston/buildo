Grounder: Cairn-Ground-G3G
Ruled: out-error-paths-p1.txt sha256:fab59428f177 findings:8
Ruled: out-error-paths-p2.txt sha256:083868dd3e8f findings:7
Ruled: out-error-paths-p3.txt sha256:d36061b24110 findings:7
Ruled: out-error-paths-p4.txt sha256:ae36c6226578 findings:7
Ruled: out-error-paths-p5.txt sha256:58c4714a9b3b findings:6
Ruled: out-error-paths-p6.txt sha256:6a619d9acd31 findings:6
Ruled: out-error-paths-p7.txt sha256:73a47b0c5632 findings:6
Ruled: out-error-paths-p8.txt sha256:caa921e90f26 findings:6
Ruled: out-error-paths-p9.txt sha256:d80ee375dd4c findings:7
Ruled: out-error-paths-p10.txt sha256:e1bff78049ed findings:6
Ruled: out-error-paths-p11.txt sha256:67d88379b119 findings:6
Ruled: out-error-paths-p12.txt sha256:24b26df5a500 findings:5
Ruled: out-error-paths-p13.txt sha256:a60346fbdc79 findings:7
Ruled: out-error-paths-p14.txt sha256:7cf36f8e26a0 findings:7
(Each file's CRIT/HIGH/MED set: 60 findings; 0 rated CRIT; 5 HIGH; 55 MED. Note: board HEAD vs 8dba70e8e differs only by one docs file; no G3 file changed. Paths below are relative to ~/Buildo-wt-board.)

KEY FACT FOR MOST METER CLAIMS: the "count the report once" guarantee is server-side and keyed on (user, lot, billing window), not on the request. openReport takes the entitlements FOR UPDATE row lock, then usageFor reads bool_or(subject_key = $4) over the window (src/lib/entitlements/index.ts:559-613). A repeat returns already_counted with no INSERT. The real-DB test src/tests/db/parcel-tool-meter.db.test.ts:108-133 proves two concurrent new lots at limit-1 give one counted and one limit_reached, and "a re-open is free" (already_counted). So retries, Try again, double taps and timeouts cannot double-count a lot.

2. TABLE (id | severity | verdict | reason)
p1#1 | HIGH | REFUTED | busy Continue is guarded in the mount: submittingRef latch, semi-question.tsx:49-55; test "a double press ... one fetch and one replace", semiQuestionPage.behaviour.test.tsx:104. The builder only paints busy.
p1#2 | MED | REFUTED | the helper feeds a class-token lint (daylightSearchPages.golden.test.ts:29, :53); the fixture error kinds are a closed set, and the committed goldens (lotMapScreens.golden.test.ts) diff on any wrong state.
p1#3 | MED | CONFIRMED | lotMapPage.behaviour.test.tsx:62-65 passes error:null, schemaDrift:false for error, rate_limited, unauthorized and schema_drift. The branches are covered by lotMapScreens.golden.test.ts:33-38. Test gap only, no product defect. Item 1.
p1#4 | MED | DUPLICATE of p2#1, REFUTED | zero-header 429 is the pinned named state rate_limited_zero. The server always sends Retry-After 60 (error-mapping.ts:46-48); apiClient.ts:43-44 maps a missing or NaN header to 60, so 0 needs a literal "Retry-After: 0" from a proxy.
p1#5 | MED | REFUTED | the once-guard is the Spec 99 §6.5 design ("a later change of target never fires it again", useParcelPageHooks.ts:14-23). After router.replace the page is unmounted, so there is no stale page.
p1#6 | MED | REFUTED | Continue double tap may stack two report screens (papercut), but the meter is lot-keyed: second open is already_counted. No second charge.
p1#7 | MED | REFUTED | unknown flag throws by design (PageTableBinding.tsx:56-58). Flags are checked at build time by the S-page gate (screen-checks.mjs:476-495 pageProblems) against the closed list; (app)/_layout.tsx imports ErrorBoundary.
p2#1 | MED | REFUTED | classify gives rateLimited and unexpected both true for RateLimitError(0) (parcelSearchMatch.ts:295-300) and the golden rate_limited_zero pins it. Unreachable from this server (see p1#4). Both notices render (SearchBinding.tsx:130-140), harmless.
p2#2 | MED | REFUTED | the empty-id guard returns before setSubmitting (semi-question.tsx:52-54), so busy is never entered; with no id the query is disabled and the page redirects to the Lookup tab (semiQuestion.ts:76-79).
p2#3 | MED | REFUTED | openHelp catches a rejecting openBrowserAsync and warns with the topic only (maxbldHelp.ts:48-54); tested at maxbldHelp.test.ts:35.
p2#4 | MED | REFUTED | candidates are built only when outcome === 'text_candidates' (parcelSearchMatch.ts:346); outside Toronto returns early at :182 whatever data is held.
p3#1 | HIGH | REFUTED | retry and Try again re-send semi=answered, but the count is once per lot per window (meter key fact above).
p3#2 | MED | REFUTED | abandoned answered fetch may still count, but a re-send is already_counted. The lot was produced, so a charge is per RR-0278; the next Continue shows it free.
p3#3 | MED | REFUTED | area/frontage/zoning are required string-or-null in the phone schema (schemas.ts:379-381), so undefined fails the Zod parse before LotMapBinding sees it.
p3#4 | MED | REFUTED | the choices arg is a one-value closed enum "parcelId" (static-page.schema.json:893-896; the only row is static-page.json:1304).
p4#1 | HIGH | DUPLICATE of p3#1, REFUTED | same meter key fact.
p4#2 | HIGH | DUPLICATE of p3#1 and p3#2, REFUTED | timeout without abort: late first fetch is dropped, second is already_counted.
p4#3 | MED | REFUTED | server refine ties map to the resolution exactly (types.ts:197-200); the phone's .optional() is for older servers only, which also lack resolution.
p4#4 | MED | REFUTED | (app)/_layout.tsx:239-260 holds SubscriptionLoadingGuard until the profile loads, and the profile query needs accessToken (useUserProfile.ts:68). Parcel pages never mount token-less.
p4#5 | MED | REFUTED | the server widens every fit to at least 0.0003 deg (consumer-lookup.ts:187, :212-218), so a zero delta cannot arrive.
p4#6 | MED | REFUTED (unreachable) | PostGIS never emits an empty outer ring; an empty polygon has no rings and is filtered (lotMap.ts:62). How react-native-maps draws a 1-2 point ring: UNVERIFIED.
p5#1 | MED | CONFIRMED | lot-map-data-check.mjs:33: `--parcels --url x` takes "--url" as an id; a trailing `--parcels` adds nothing; the run checks only the samples. Read-only dev tool. Item 2.
p5#3 | MED | REFUTED | seconds always a number: RateLimitError(Number.isFinite(x) ? x : 60) (apiClient.ts:43-44).
p5#4 | MED | REFUTED | role "retry" is the closed role the web StaticBinding wires to action retry (StaticBinding.tsx:16, :171, :363).
p5#5 | MED | REFUTED | compute throw happens inside runLookupFlow in the route's try, before the meter code (route.ts:94-108), so 500, no count. Only prose omission in contracts.json.
p6#1 | MED | REFUTED | sliceNumber throws on a non-number and on missing bounds (sliceConfig.ts:16-18); no FIX.TUNE key is UNRESEARCHED in any converted descriptor, and no generated slice holds one.
p6#2 | MED | CONFIRMED (latent) | emit-mobile-surfaces.mjs:50-55 demands a seed entry for the number 0; surface.schema.json:2690 and :2726 say 0 means "no such setting" for debounce_ms and min_query_len. binding_mobile_list and shared_mobile_surface_binding carry 0/0 but are not in converted-surfaces.json, so nothing fails today. Item 3.
p6#3 | MED | REFUTED | the page table has exactly two buttons; the push one carries busy (static-page.json screens, semi continue). The schema cannot declare dedup; the mount latch and the lot-keyed meter do.
p6#4 | MED | REFUTED | double Continue with Lot X: meter is lot-keyed (already_counted).
p7#1 | MED | UNDETERMINED | descriptor prose "debounce protects the 60/min bucket" is arithmetically loose (400 ms allows up to 150/min). Debounce is a registered setting 400-5000 (seed). Operator question Q4.
p7#2 | MED | REFUTED | expiry outcome is built: catch sets submitError and shows the error state with Try again (semi-question.tsx:57-59, :163 test).
p7#3 | MED | DUPLICATE-OF-EARLIER | docs/reports/lanes/2026-11-19/BL-TRIAGE/TRIAGE.md:19 and REPORT.md D-1: 429 and 403 show banners with no button, the open question.
p7#4 | MED | REFUTED | reportsLeftShown hides the line unless all three fields are present (parcelSearchCore.ts:78-80); pinned search-reports-left.logic.test.ts:113-121.
p7#5 | MED | CONFIRMED | no maxLength on the search Input (SearchBinding.tsx:72-85); server max 120 (lookup/types.ts:42) so a long paste gives 400, then the generic error with a Try again that fails again. Item 4.
p7#6 | MED | REFUTED | phone schema has resolution optional (schemas.ts:435) and is not top-level strict, so an older server parses and the derived path runs. The descriptor's "strict on both sides" wording is loose, no behaviour fault.
p8#1 | MED | REFUTED | page is required-nullable in the strict schema (types.ts:193); body is the post-parse value (lookup-flow.ts:104), so undefined fails the parse before the meter.
p8#2 | MED | REFUTED | reportsLeft = Math.max(0, ...) (entitlements/index.ts:664); limits seed min 1 (logic_variables.json), so reportsLimit is positive. No 500.
p8#3 | MED | REFUTED | corrupt table alone: expected from bindings.json callers gives a finding (screen-checks.mjs:485-486). "0 of 0" needs two independent files broken together.
p8#4 | MED | REFUTED | a missing golden throws ENOENT and exits non-zero (loud, not fail-open); SV-SCREEN also reports missing goldens (screen-checks.mjs:271-272).
p8#5 | MED | REFUTED | withApiEnvelope logs via logError with method and path and returns a sanitized 500 (with-api-envelope.ts:23-31); test parcel-lookup-gate.infra.test.ts:161-170.
p9#1 | HIGH | UNDETERMINED | fence "<" is the 2026-07-18 W1 design (commit 76f36239d), pinned by stripe-webhook.infra.test.ts:254 and the resubscriber test :203; same-second watermark already known at webhooks/stripe/route.ts:213. Not a G3 change. Q3.
p9#2 | MED | CONFIRMED | permits/[id]/route.ts:183, 202, 216, 271, 308 bare `catch {}` with "tables may not exist yet" comments; any DB error becomes parcel=null/massing=null, nothing logged. Pre-G3 code (G3 touched 2 lines, 25bc874c7). Item 5.
p9#3 | MED | REFUTED | tier degradation is per-JSONB safeParse upstream (consumer-lookup.ts:117-154, warnings[]); the boundary parse only sees validated values.
p9#4 | MED | UNDETERMINED | range refusals come after withRateLimit (lot-size/route.ts:77 vs :83-93), so 5 out-of-range entries use the day's bucket. Route is OFF (switch seed 0-0). Q2.
p10#1 | MED | REFUTED (latent) | spread of Math.min/max throws RangeError near 120k args (measured here: ok at 100k, error at 130k). Needs more than 120k points; default is 30 neighbours (limit max 50, radius max 100 m), so ~85k at an outline cap. Optional loop fix.
p10#2 | MED | REFUTED | every bounded key has seed min at least 1 (user_lot_size_*); the only min-0 key is the switch (bounds 0-0, 0 = off). '' reading 0 fails the bounds.
p10#3 | MED | REFUTED | the unique index is partial: WHERE status = 'active' (migrations/305_parcel_user_inputs.sql:50-51).
p10#4 | MED | REFUTED | finite() treats null, '' and non-finite as null (display-rules.ts:17-21), so the formatters return null.
p11#1 | MED | REFUTED | already:true path is exercised by gate tests (:227-253, :358-406) and by real DB (db test :133). The window SQL text is not pinned in the mocks: residual LOW.
p11#2 | MED | REFUTED | the real-DB test runs the concurrent pair (db test :108-133).
p11#3 | MED | REFUTED (underlying) | compute reject is inside the route try, so 500 and no meter (route.ts:94-108); no route-level reject case is a LOW test gap.
p12#1 | MED | DUPLICATE of p11#1 | meter fakes hard-code already:false; already_counted proven at DB test :133 and gate tests.
p12#2 | MED | REFUTED | a 57014 inside withTransaction propagates to the route catch: 500 internalError, nothing inserted (route.ts:116-118; T10 "insert throws" class).
p12#3 | MED | UNDETERMINED | not_evaluated is tested before page (route.ts:105), so a produced page for a lot with no evaluated legacy option is free. Two operator rulings meet: "1 b 2 a" (2026-11-12) vs RR-0278 (MD:1082-1084). Owner named in the test comment (MB-94c / MB-44); no customer page is produced in 1·B. Q1.
p13#1 | MED | UNDETERMINED | nav-by-route.logic.test.ts:356-391 rescans the tree per test; default test timeout (no override in the config). Whether it passes 5 s cold cannot be measured without the runner. UNVERIFIED.
p14#1 | MED | CONFIRMED | search-web-binding.ui.test.tsx: errors asserted only at :66, :75, :85; other cases collect and drop. Test gap. Item 6.
p14#2 | MED | CONFIRMED | surface-validate.logic.test.ts:58 and :68 spawnSync without timeout. Test gap. Item 6.
p14#3 | MED | CONFIRMED | no-change hash covers only _schema/*.json and goldens (:387-389), not generator outputs (global.css, slices). Test gap. Item 6.
p14#4 | MED | CONFIRMED | static-page.logic.test.ts:160 filters .tsx only. Test gap. Item 6.
p14#5 | MED | CONFIRMED | search-web-binding.ui.test.tsx:91 declares change_input and retry, never fires them. Test gap. Item 6.

3. CONFIRMED DEFECTS (none touch money, entitlement or auth)
1. p1#3. Rule: test must exercise the branch it names. lotMapPage.behaviour.test.tsx:65. Fix: error: err(i.error) and schemaDrift: i.error === 'schema_drift' (copy errorOf from lotMapScreens.golden.test.ts:33). Owner task-322/354. Line-size. Impact: none today (goldens cover it); smoke names mislead.
2. p5#1. scripts/analysis/lot-map-data-check.mjs:33 parseArgs. Fix: if the value is missing or starts with "--", exit 2 with usage. Owner task-336. Line-size. Impact: a read-only dev check silently covers fewer lots (dry-run prints parameters, so visible).
3. p6#2. emit-mobile-surfaces.mjs:50-51. Fix: `if (typeof v !== 'number' || (v === 0 && (k === 'debounce_ms' || k === 'min_query_len'))) continue;`. Owner task-395. Line-size. Impact: latent; converting a mobile surface with 0 would fail the generator loudly.
4. p7#5. SearchBinding.tsx:72 Input has no length cap; server 400 over 120. A literal cap would breach Spec 128 Rule 3 (settings are registered), so this needs a decision on a registered max_query_len. Owner task-351/395. Impact: a pasted address over 120 characters shows the generic error; editing the text recovers.
5. p9#2. permits/[id]/route.ts:183,202,216,271,308 catches. Fix: add logError(tag, err, {handler}) in each and re-throw or swallow only code 42P01. Owner none (pre-G3, outside the G3 diff); needs a decision whether G3 adopts it. Per-site line-size. Impact: a transient DB error shows "Building footprint data not available" and leaves no log.
6. p14#1-5 (one group, test files only). Fixes: assert errors empty after (b), (c), (e); { timeout: 120000 } on the two spawnSync calls; hash mobile/global.css and mobile/src/generated/surfaces/*.json; filter .ts too; fire change_input and retry in (c). Owner task-351/338/390. Line-size each. Impact: gate tests could miss a console error, a hang, a generator that rewrites outputs, a gate-less new .ts page, a dropped handler.

4. LOW/NIT (recorded, not ruled): p1#8, p2#5, p2#6, p2#7, p3#5, p3#6, p3#7, p4#7, p5#2, p5#6, p6#5, p6#6, p8#6, p9#5, p9#6, p9#7, p10#5, p10#6, p11#4, p11#5, p11#6, p12#4, p12#5, p13#2, p13#3, p13#4, p13#5, p13#6, p13#7, p14#6, p14#7. None mis-rated: p3#7 (search select without a latch) is a double push only, meter is lot-keyed; p9#6 (accessory deref) is always sent by the route (permits/[id]/route.ts:262); p10#6 (compute without timeout) is not live (switch off).

5. TOTALS (60): confirmed 10 (p1#3, p5#1, p6#2, p7#5, p9#2, p14#1-5; 6 numbered items) / refuted 40 / by-ruling 0 / not-applicable 0 / duplicate 4 (p1#4, p4#1, p4#2, p12#1, each also refuted on its own fact; counted here, not in refuted) / duplicate-of-earlier 1 (p7#3) / undetermined 5 (p7#1, p9#1, p9#4, p12#3, p13#1). (40 + 10 + 4 + 1 + 5 = 60.)
Operator questions:
Q1. When a report page is produced for a lot whose legacy menu has no evaluated option, does it count (RR-0278) or stay free ("1 b 2 a")? Route order today is free; flip pin at parcels-lookup-page.logic.test.ts:181 with the fix.
Q2. Should out-of-range lot-size entries (OUT_OF_RANGE and siblings) count against the 5-a-day bucket, or should the bound check run before the limiter?
Q3. Is the same-second Stripe watermark ("<" not "<=") the accepted design, or should it fence on the event id?
Q4. Is a 400 ms debounce against the 60/min search bucket acceptable, or raise the registered default?
Q5. Add a registered maximum for the search input (120)?

6. UNVERIFIED
- p13#1 timing on a cold runner (runner not run per brief).
- p4#6 how react-native-maps draws a 1-2 point ring.
- No customer page is produced in 1·B (read from route header and RR-0438 context, not run against the DB).
- SQL text of the window read in usageFor is only exercised by the real-DB test, which I did not run.
- The 120k spread-argument limit measured with a print-only node script here, engine may differ on device.
