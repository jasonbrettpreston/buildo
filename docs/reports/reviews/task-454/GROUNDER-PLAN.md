# Plan grounder ruling: task-454 (PLAN-454-v1), round 1
Grounder: Cairn-Ground-P454
Lane: BL-SFX6B

Separate plan grounder (Sonnet, RR-0385 item 1, MORNING-DECISIONS.md:1917, and item 3, :1919): not the planned lane, not a seat, not the orchestrator. Read-only, no test runner, no database, no dotenv. Board head read: ece69a003, then f7876ca80 (one task-463 file only changed; every cited line re-read unchanged). Every id ruled on the repo; checks run in memory with the repo's own functions: resolveTask (the Files line), outcomeErrors (all 39 outcomes, 0 errors), planHash, and every quote against its cited line.

Ruled: plan-error-paths.txt sha256:b74c1d3056dc findings:6
Ruled: plan-plan-review-deepseek.txt sha256:028c056c9e68 findings:17
Ruled: plan-security.txt sha256:d171cebed031 findings:3
Ruled: plan-ux.txt sha256:a3c098d57010 findings:4

Seat: integration docs/reports/reviews/task-454/seat-integration-1.md sha256:a7bf999d7e1e
Seat: reality-check docs/reports/reviews/task-454/seat-reality-check-1.md sha256:4599b75d8936
Seat: regression docs/reports/reviews/task-454/seat-regression-1.md sha256:e4004516ff3d

plan-error-paths#1 REJECTED src/app/api/parcels/lookup/route.ts:72 "const access = await parcelToolAccess(pool, ctx);" Wrong: the limiter's number comes from the row, and two pool reads (getCurrentUserContext :64, this :72) already precede it, so it never bounded DB work; a cache is new infrastructure (RR-0392).
plan-error-paths#2 REJECTED mobile/src/components/surfaces/SearchBinding.tsx:37 "export const SEARCH_DEBOUNCE_MS = sliceNumber(SEARCH_SLICE, 'debounce_ms');" Wrong: debounce and min length are already read at module scope this way from a generated, checked slice; no new risk.
plan-error-paths#3 CONFIRMED scripts/seeds/apply-logic-variables.js:13 "means this loader can only ever INSERT a" MED: true, DO NOTHING keeps a wrong row silently. Folded: c3 compares each row's value with the intended default and the seed bounds.
plan-error-paths#4 CONFIRMED scripts/surfaces/emit-mobile-surfaces.mjs:125 "for (const [dir, suffix] of [[SLICE_DIR, '.json']" MED: true as filed (outputs written, then unlink). Folded: rmSync with force.
plan-error-paths#5 CONFIRMED src/lib/admin/parcel-lookup.ts:430 "const first = unlinked[0]!;" MED: true; the unlinked read is a probe window (rows used at :429-431), not the cap. Folded: named constant UNLINKED_PROBE_ROWS, no new setting (RR-0392).
plan-error-paths#6 REJECTED scripts/surfaces/emit-mobile-surfaces.mjs:55 "if (entry === undefined) { problems.push(" Wrong on the default: the plan already gives 0 for the others, so v < 0 never skips and the entry stays required; one clause now says so.
plan-plan-review-deepseek#1 CONFIRMED docs/specs/00-architecture/08_agents.md:530 "Rehearse every DB job before the go." MED: HIGH overstated; r-restore already runs on dev after a STOP (dbjobs MF19-324 r-restore.zsh:13), the plan did not say so. Folded in Stage (iii).
plan-plan-review-deepseek#2 CONFIRMED src/app/api/parcels/lookup/route.ts:89 "withRateLimit(request, { key: rl.key, limit: rl.limit" MED: HIGH overstated (two DB reads precede the limiter anyway) but the missing-row window is real. Folded: fixed order, apply before push.
plan-plan-review-deepseek#3 CONFIRMED scripts/surfaces/emit-mobile-surfaces.mjs:128 "for (const f of fs.readdirSync(abs).filter((x) => x.endsWith(suffix)).sort())" MED: HIGH overstated (strays are only what checkOutputs lists) but no test showed survivors. Folded: the L8 test keeps a README, a golden copy and owned slices.
plan-plan-review-deepseek#4 CONFIRMED src/lib/parcels/lot-map.ts:83 "!Number.isInteger(v) || v < b.min || v > b.max" MED: true, a present out-of-bounds row throws on the first request. Folded: c1 refuses it.
plan-plan-review-deepseek#5 REJECTED src/lib/auth/rate-limit.ts:59 "return { allowed: count <= opts.limit" Wrong: a limit of 0 blocks every request, it does not turn the limiter off; bounds are engineering envelopes (RR-0192).
plan-plan-review-deepseek#6 CONFIRMED mobile/src/constants/parcelSearch.ts:22 "export const SEARCH_CANDIDATE_LIMIT = 10;" MED: true as to the test readers; git grep at the head run. Folded with in#4: the reader list and delete-last order.
plan-plan-review-deepseek#7 REJECTED src/lib/parcels/lot-size-entry.ts:61 "the seed is the bound authority" Wrong: every server reader takes bounds from the seed; the table has no bound columns, so row bounds are new infrastructure (RR-0392).
plan-plan-review-deepseek#8 CONFIRMED scripts/surfaces/emit-mobile-surfaces.mjs:90 "CONFIG_KEYS.filter((k) => d.config?.[k] !== undefined)" MED: true that AC#2 says emitted and only the check was proved (this line does keep a 0). Folded: a buildOutputs test with debounce_ms 0.
plan-plan-review-deepseek#9 CONFIRMED src/tests/surfaces/surface-conformance.logic.test.ts:1106 "const consts = fs.readFileSync(path.join(REPO, 'mobile/src/constants/parcelSearch.ts')" MED: true a renamed constant passes a name scan; the literal scan proposed fails on RATE_WINDOW_SEC = 60. Folded: limits stated, non-default value tests are the AC#1 lock.
plan-plan-review-deepseek#10 REJECTED docs/reports/reviews/mcfixreborn-fold/FOLD-PLAN.md:68 "The routes and the parcel-lookup.ts cap read them" Wrong: outside the card; the fold plan scopes the scan to the routes and the cap; a codebase-wide scan is another card.
plan-plan-review-deepseek#11 REJECTED mobile/src/store/recentSearchesStore.ts:55 "now.filter((r) => r.toLowerCase() !== key)].slice(0, SEARCH_RECENT_MAX)" Wrong: the write path slices at the setting, so at 0 the store keeps none; nothing accumulates.
plan-plan-review-deepseek#12 CONFIRMED src/features/admin-controls/components/GlobalConfigCard.tsx:68 "seed's declared bounds are not plumbed to the admin" MED: true, the panel checks no range (also control-panel.ts:173). A range check is new infrastructure (RR-0392). Folded: description wording and operator question 3.
plan-plan-review-deepseek#13 CONFIRMED scripts/surfaces/search-golden-capture.ts:11 "node_modules/.bin/tsx --tsconfig mobile/tsconfig.json" MED: true; command found at :11. Folded: diff against base, commit only if fingerprint-only.
plan-plan-review-deepseek#14 CONFIRMED scripts/seeds/apply-logic-variables.js:5 "Reads scripts/seeds/logic_variables.json and inserts each key" MED: true, a seed without the keys inserts nothing. Folded: pin the sha and count 6 before c2.
plan-plan-review-deepseek#15 REJECTED mobile/src/lib/sliceConfig.ts:16 "missing or not a finite number" Wrong: sliceNumber throws on a missing key and never returns undefined.
plan-plan-review-deepseek#16 REJECTED src/app/api/parcels/lookup/route.ts:137 "if (duration_ms > SLOW_QUERY_MS) {" Wrong: the warning exists today at 500 ms; the floor only matters if the operator sets 50; no plan defect.
plan-plan-review-deepseek#17 REJECTED src/tests/parcel-lookup-resolution.logic.test.ts:12 "vi.mock('@/lib/db/client', () => ({ query: (...a: unknown[]) => query(...a) }));" Met: covered by the in#3 and in#2 folds; the resolver reads nothing and the pool scripts answer the settings query.
plan-security#1 REJECTED src/app/api/parcels/lookup/route.ts:64 "const ctx = await getCurrentUserContext(request, pool);" Wrong: same claim as error-paths#1, ruled once there; auth already reads the DB before the limiter.
plan-security#2 REJECTED docs/reports/reviews/mcfixreborn-g3/GROUNDER-QUESTIONS.md:67 "The bounds are engineering envelopes (RR-0192)." Wrong: default stays 10, the max is the ruled envelope, the list is addresses only and the per-minute limit still bounds it.
plan-security#3 REJECTED src/app/api/parcels/lot-size/route.ts:45 "logInfo(TAG, 'lot size entry', { uid: ctx.uid" Wrong: L6 is the ruled fix (GROUNDER-F D4) and sibling routes log uid per call; log retention is not this card.
plan-ux#1 REJECTED scripts/hooks/check-lane-close.mjs:146 "export const lensKindOf = (line) =>" Wrong: the line says none raised, so there is no finding to rule.
plan-ux#2 CONFIRMED src/features/leads/api/error-mapping.ts:84 "return err('INTERNAL_ERROR', 'An unexpected error occurred', 500);" MED: true, a dev app shows this until the rows exist. Folded: fixed order, the push waits for the apply.
plan-ux#3 CONFIRMED src/lib/admin/control-panel.ts:358 "SELECT variable_key, variable_value, variable_value_json, description, updated_at" MED: true, the panel shows DB text. Folded: the apply edits no existing row (loader DO NOTHING; no migration, RR-0392); dev wording owed to a later card, said so.
plan-ux#4 CONFIRMED src/lib/admin/parcel-lookup.ts:410 "typeahead LIMIT 10 has no overflow probe" LOW: true and wider, the no-probe comment holds for 10 only. Folded in a few words: cap min is 10.
in#1 CONFIRMED .husky/commit-msg:6 "node scripts/hooks/check-task-files.mjs" HIGH: true. Folded: the new Files line (48 entries). Two entries stay off: red evidence goes to the lane folder, and the generator is operator question 2.
in#2 CONFIRMED src/lib/parcels/lookup-flow.ts:43 "await resolveAddress(requireQ(q), { classifyUnlinked: true, matchMistyped: true })" HIGH: true. Folded: the cap is a required opts member passed by the routes; the resolver reads nothing.
in#3 CONFIRMED src/tests/parcels-lookup-page.logic.test.ts:22 "pool: { query: (...a: unknown[]) => poolQuery(...a) }," HIGH: true, those mocks export pool only. Folded: readSearchSettings(db: Queryable), routes pass pool.
in#4 CONFIRMED src/tests/consumer-parcel-lookup.infra.test.ts:79 "expect(src).toMatch(/LOOKUP_LIMIT_PER_MIN" HIGH: true, with the other five pins named. Folded in the Step 2 list and the Files line.
in#5 CONFIRMED src/lib/admin/parcel-lookup.ts:431 "const one = new Set(unlinked.map((u) => u.address)).size === 1;" MED: true, :426 is a probe window. Folded (see error-paths#5).
in#6 CONFIRMED src/tests/surfaces/search-reports-left.logic.test.ts:140 "the census mirror of the entitlement contract equals its descriptor" MED: true, census mirrors are hand-kept. Folded: hand copy; the restamp command named.
in#7 CONFIRMED docs/specs/03-mobile/99_mobile_state_architecture.md:175 "newest first, at most" MED: true for Spec 99:175 (names a deleted constant); the rate_bucket prose states the default and stays. Folded: a dated note.
in#8 CONFIRMED src/lib/parcels/lot-map.ts:82 "const b = SEED_BOUNDS[key]!;" LOW: true, a copied bang would break the pinned count. Folded in a few words: no bang; keys appended at the end of the group.
in#9 CONFIRMED src/app/api/admin/parcels/lookup/route.ts:33 "SLOW_QUERY_MS = 500;" LOW: true. Folded: the admin route reads the same settings; its contract (answer none) is updated.
in#10 CONFIRMED mobile/src/lib/sliceConfig.ts:18 "no valid bounds (min <= max) in its slice" NIT: true. Folded in one clause.
rc#1 CONFIRMED src/lib/admin/parcel-lookup.ts:426 "ORDER BY address, ap.address_point_id LIMIT 11" MED: true, same as error-paths#5 (fold there).
rc#2 CONFIRMED mobile/src/components/surfaces/SearchBinding.tsx:32 "export const SEARCH_SLICE: { surface: string; config: Record<string, number>;" MED: true. Folded: the scan list gains SearchBinding.tsx and the admin route, with per-file contains checks.
rc#3 CONFIRMED src/lib/entitlements/index.ts:655 "if (!(err instanceof ReportLimitsMissingError)) throw err;" MED: true, the usage read degrades today; the new reader throws. Folded: the answer paragraph rewritten.
rc#4 CONFIRMED src/app/api/parcels/lookup/route.ts:83 "const { q, parcelId, semi } = parsed.data;" MED: true, the detail path also gets 500. Folded in the same paragraph and question 1.
rc#5 CONFIRMED src/lib/admin/parcel-lookup.ts:334 "const raw = await resolveAddress(q, { ...opts, matchMistyped: false }, true);" LOW: true. Folded: the cap is a parameter, so the re-entry adds no read.
rc#6 CONFIRMED scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json:777 "parcel_map_neighbour_limit" LOW: true, server on_invalid lives in contract entries. Folded: Posture column; candidate_cap stays fail.
rc#7 CONFIRMED src/tests/surfaces/surface-conformance.logic.test.ts:1103 "expect(s.config).toEqual({ debounce_ms: 400, min_query_len: 3" LOW: true. Folded in the Step 2 list.
rc#8 CONFIRMED src/tests/fix-tune.logic.test.ts:52 "semiQuestion.ts')).not.toMatch(/60_?000/)" LOW: true, name patterns match any identifier. Folded: such names banned; the 215-key listing is moot since c2 inserts six rows.
rg#1 CONFIRMED src/tests/consumer-parcel-lookup.infra.test.ts:78 "expect(src).toMatch(/SEARCH_LIMIT_PER_MIN" HIGH: true. Folded: the lock is rewritten (bucket keys kept, number regexes dropped) and the file is on the Files line.
rg#2 CONFIRMED src/tests/parcels-lot-size-route.infra.test.ts:187 "expect(vi.mocked(withRateLimit).mock.calls[0]?.[1]).toEqual({ key:" MED: true. Folded: non-default value tests (7, 8, 50, 4; 9).
rg#3 CONFIRMED docs/specs/03-mobile/100_mobile_parcel_cost_tool.md:47 "Ambiguity → 200 with" MED: true. Folded: dated notes on Spec 100:47 and Spec 99:175; the cap max stays 50.
rg#4 CONFIRMED src/tests/search-routing.logic.test.ts:190 "expect(sql).toContain('LIMIT 10');" LOW: true. Folded: text assertions become parameter checks.
rg#5 CONFIRMED scripts/seeds/logic_variables.json:9769 "tooling_precommit_budget_docs_only_s" LOW: true, wf1/inc1b-gates (76fab5e70, unmerged) edits the seed. Folded: rebase and rerun.

Counts: 53 ids ruled (30 lens, 23 seat); 39 CONFIRMED (0 CRITICAL, 5 HIGH, 24 MED, 9 LOW, 1 NIT), 14 REJECTED, 0 CONFLICT. Every CONFIRMED CRITICAL, HIGH and MED is folded (29 ids); the 10 LOW and NIT are folded in a few words. Expected round line: Plan review round 1: 39 folded, 0 task, 0 ruling, 0 wontfix, 0 pile.

Plan: task-454 sha256:270b81041129
