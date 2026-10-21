# CoA cutover rulings: the bundled-night patch set (steps-rulings-1, 2026-10-20)

Authority: Spec 124 R-IA…R-IF (124a §B26 appended rows; conflict checks and seven questions 124a §B31), from the
operator's chat approval of the six CoA cutover rulings (`docs/reports/decisions/2026-10-20-chat-batch-c-steps.json`,
CHAT-15…CHAT-20). REFREEZE-BUNDLE-1 (124a:457) is the night that applies them. **Nothing here is applied to the
converted step code now.** Cutover ③ stays held until the night applies these changes and the steps recapture.

## What each ruling changes, and when

| Ruling | Row | Code change | Applied |
|---|---|---|---|
| 1. enrich_coa_zoning `coa_row_count_zero` renders every run | R-IA | none (already built) | citation only: `deviations[0].adjudicated_by` += R-IA on the night (citations file ref `s1-1`) |
| 2. 16 `information_schema` probes -> `database.min_migration` | R-IB | none (already built) | citation only, `deviations[1]` (`s1-2`) |
| 3. `pipeline_runs` recency via the runner's producer reader | R-IC | none (already built) | citation only, `deviations[2]` (`s1-3`) |
| 4. link_coa_to_parcels `tier_1a_type_confirmed` / `tier_1a_type_tolerant` restored | R-ID | **yes**: `docs/reports/2026-10-20-steps-rulings-1-coa-cutover.patch` | on the night (library + compute + descriptor; one fleet recapture) |
| 5. coa COA-D3, DATE columns | R-IE | none (already built) | citation only, coa `deviations[4]` (`g5-4`) |
| 6. coa `avg_latency_ms` / `api_errors` rows and `records_meta.api_health` | R-IF | none: **drop** (zero readers), and the converted step already does not emit them | citation only, coa `deviations[5]` (`g5-5`, cites R-IF and R-HR) |

The citation for every row is listed in `docs/reports/2026-10-20-v3-condition9-backfill-citations.json`
(`apply: "bundled-night"`, `append_text` to append to `deviations[deviation_index].adjudicated_by`). The descriptors
are not edited now: each has POST captures, and a descriptor byte moves `source_fingerprint` (G8 hard stop until
recaptured).

## Ruling 6: the consumer search

Search 2026-10-20 at `028c9b28`: `git grep -n -I` for `avg_latency_ms`, `api_errors`, `api_health`,
`avg_req_latency_ms` and `max_req_latency_ms` over `src/`, `scripts/`, `mobile/`, `migrations/`, `supabase/` and
`docs/` (dashboards, admin surfaces, reports).

- **Readers of coa's values: zero.** No file under `src/` (the app, the admin pages, `src/lib/admin/funnel.ts`) or
  `mobile/` reads any of the keys; no migration, view or function selects them; no dashboard parses them.
- Producers that are not coa: `scripts/load-permits.js` (the permits step's own rows, :273, :576, :612, :661-662,
  :689-692); `scripts/quality/assert-network-health.js` (its own `avg_latency_ms` p50 row, computed from the
  `inspections` run's scraper telemetry, :114-122 — it reads no coa run).
- Pins of legacy behaviour, not consumers: `src/tests/steps/coa/fixtures/legacy-load-coa.js.txt` and
  `src/tests/steps/coa/violations.test.ts` L4/L19 (the frozen oracle), the permits and assert_network_health
  equivalents, `src/tests/quality.infra.test.ts` (a different name, `parcels_api_errors`).
- Records: golden captures (`docs/reports/golden/coa/pre/*`, `assert_schema/*`), pipeline-validation reports,
  verification notes and the citations file.

So the rows are dropped under R-HR (the operator's evidence condition: a consumer grep with zero readers). Request
latency and retries are runner acquisition telemetry, and an exhausted retry is the `failed_acquisition` terminal.

## Ruling 4: the counter restore (R-ID)

The type-confirmation bit exists only in the per-batch cascade rows (`m.type_confirmed` from the bridge SQL); it is
not persisted in `lead_parcels`, so no post-write read can count it. The restore therefore needs a per-batch counter
export from the compute to the runner. That mechanism is the bundled night's item (1), Draft B (`runLinkPhase`
`extra_counters`, PIN DRAFT-B-REFREEZE, 124a §B14). The operator withdrew the stale draft *text* (which said the
legacy shell still emits both counters; the shell is swapped). The mechanism is restated here so the operator
can confirm it before the night (PIN DRAFT-B-RESTATE):

- `runLinkPhase` (scripts/lib/step/index.js): a LINK match plan may declare `extra_counters` (distinct snake_case
  names that are not LINK or pass counters). Each starts at 0 and is summed from `classifyMatches(...).counters` per
  batch. The set is closed: an undeclared key, a collision or a non-integer count throws. With no declaration there
  are no extra keys, and every existing LINK step is unchanged.
- `scripts/lib/compute/link-coa-to-parcels.js`: the match plan declares the two names; `classifyMatches` counts a
  bridge match (`address_points_exact`) as confirmed when `type_confirmed === true`, else tolerant (legacy :407);
  two INFO check observers; two `records_meta` keys (legacy :663-664).
- `scripts/link-coa-to-parcels.descriptor.json`: two INFO checks after `tier_1a_via_bridge`, two emits, and
  `deviations[3]` drops the counters clause from `from`/`why` and cites R-ID.
- Same night, by hand on the ledger: LCTP-D11 -> `CLOSED · fixed (Spec 124 R-ID, bundled RE-FREEZE night)`.

**Red tests, prepared, not applied:** `src/tests/steps/link_coa_to_parcels/type-counters.logic.test.ts`, carried in
the patch file. Measured in a scratch worktree at `028c9b28`: **5 red / 1 green before** (T6 is the "no declaration,
no extra key" guard and is green before by design); **6 green after** the patch, with the existing
link_coa_to_parcels suites still green (4 files, 53 tests). With the patch applied, `step-validate
--step=link_coa_to_parcels --fast` reads `hard-stop=true (G8, …)` with `stale-fingerprints=3` and gate G #39 lists
92 `lib_fingerprint` mismatches across the fleet. That is why the patch rides the night's one recapture and is not
applied now.

Apply on the night: `git apply docs/reports/2026-10-20-steps-rulings-1-coa-cutover.patch` (checked with
`git apply --check` at `028c9b28`), then the descriptor citations from the citations file, then the night's one
recapture. The patch already carries citation `s1-4` (link_coa_to_parcels `deviations[3]`: its `from` drops the
counters clause and its `adjudicated_by` cites R-ID). So on the night, skip `s1-4`'s `append_text` and set its `key`
to the new `from` in the same commit. Otherwise the `v3-label-enforcement.logic` lock (a bundled-night entry names
its deviation by `from`) goes red.
