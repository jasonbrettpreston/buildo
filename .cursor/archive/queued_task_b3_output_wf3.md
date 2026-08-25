# Active Task: B3 Output-Panel Fold — WF3 remediation (A–E)
**Status:** Planning
**Domain Mode:** Backend/Pipeline (`scripts/`, `migrations/`, `docs/specs/`) — read `scripts/CLAUDE.md` + `docs/specs/00_engineering_standards.md`
**Branch:** `wf2/deep-scrapes-restore-l0` — **BRANCH-ONLY**, no cherry-pick to main (rides B7/B8 with migs 240/242/243)
**Parent:** Phase B B3 = `74653a8f`. Panel: 6 seats + 3 re-runs on grounded substrate (Spec 08 §10.2 SUBSTRATE RULE, ratified this session).

## Context
* **Goal:** close the five structural defects the B3 output panel confirmed, before the B7 proving runs. Two of them (D, E) silently disable the very gate B3 exists to provide; two (A3, B1) put a green signal on a false statement.
* **Target Specs:** `docs/specs/01-pipeline/43_chain_sources.md` · `48_pipeline_observability.md` §3.6/§3.7/§4.9 · `00-architecture/08_agents.md` §11
* **Key Files:** `scripts/link-wsib.js` · `scripts/link-parcel-addresses.js` · `scripts/compute-parcel-cost-estimates.js` · `scripts/enrich-heritage.js` · `scripts/lib/source-version.js` · `scripts/load-wsib.js` · `migrations/243_wsib_unlinked_partial_index.sql`
* **Database Impact:** NO new migration. One `COMMENT ON INDEX` correction rides a follow-up migration (see F4) — do NOT edit 243 in place; it is already applied to dev.

## Grounding status — ALL CLOSED (grounding passes, 2026-08-16)
Everything below was executed. No projected consequences remain in this plan.
* **B1 OBSERVED** — real route handler + server-rendered `FreshnessTimeline`: the skip row renders `Fresh · Just now · green` beside an un-gated sibling showing `Overdue · 1mo ago`. Last REAL cost-step run is **2026-07-08 — 39 days**. (Earlier "2026-08-07 / 9 days" was a transposition; corrected by direct query — only two runs exist, 07-07 and 07-08.)
* **B3-funnel OBSERVED, worse than asserted** — fallback renders **green "353.7"**: `matchPct` = `13965/3948` (wsib rows ÷ entities), mismatched denominators; `CircularBadge` clamps the ring, not the label, and colors ≥90 green. Same step: `11.5` red in one chain, `353.7` green in the other.
* **B5 OBSERVED + refined** — measured skip duration 274/268/320 ms (non-zero ⇒ evades the `d > 0` filter). Anomaly arms at **4 consecutive skips** (ratio 2.0) → **664.5** at seven. `chain-sources` is weekly ⇒ ~4 quiet weeks before a normal re-run is flagged, and severity GROWS the longer the gate works correctly.
* **E#1 OBSERVED** — wedge reproduced by real fault injection; persisted across 5 simulated later runs.
* **D#3** — structural (line ordering confirmed); not observable as a race. State as structural in the commit body.
* **CLOUD STATE VERIFIED** (not taken on the commit's word): `origin/main` high-water is **241**; 240/242/243 absent. 241-without-240 is safe — `migrate.js:124` sorts + skips by PK, and the objects are disjoint (240 → `parcels`/`enrich_parcels_pass3_scope`; 241 → `trg_permits_lead_id` on `permits`).

---

## Commit A — `link-wsib` gate placement (closes A1, A2, A3)
**One placement error, three bugs.** Gate returns at `:100`; `loadMarketplaceConfigs`/`validateLogicVars` at `:103-104`; `--dry-run` parsed at `:109`.

* Hoist `loadMarketplaceConfigs` + `validateLogicVars` **above** the gate — restores the pre-B3 unconditional fail-fast (~1 query).
* Parse `dryRun` before the gate; add `bypassGate = dryRun` mirroring `compute-parcel-cost-estimates.js:534`.
* Fold `wsib_fuzzy_match_threshold`'s `logic_variables.updated_at` into the skip predicate using the existing `readCostVersionSignals`/`hasRateOrIndexChanged` pattern (C1/C2 precedent, same commit).

*Red first:*
- [ ] A-R1: gate SKIP-eligible + `--dry-run` → tier simulation runs, summary is NOT `SKIPPED`. **Behavioral**, not a source-string assertion — the existing lock `src/tests/wsib.infra.test.ts:87-90` is `toContain('--dry-run')` and stayed green through the regression. Add the behavioral lock; leave the old one.
- [ ] A-R2: invalid `wsib_fuzzy_match_threshold` + SKIP-eligible gate → still throws (validation is not bypassable).
- [ ] A-R3: threshold `updated_at` moves forward → gate returns RUN.

**Fence note for the body:** `647d0935f` (`fix(35_wsib_registry)`) landed a correctness fix *inside* the branch A1 made unreachable — cite it.

## Commit B — skip-path audit rows (closes B1, B2, B3-funnel, B4, B5, `evaluatedAt`)
**The remedy pattern is already in this commit:** `enrich-heritage.js`'s `emitHeritageResults()` is shared by both the skip and recompute paths, so a heritage skip keeps its FAIL/WARN gates and a real `verdictCascade`. Apply it to the three ledger-gate callers.

* Each caller re-emits its own coverage/threshold rows on the skip path (`link_rate` ≥5% WARN · `address_points_with_no_parcel_pct` · `errors` FAIL gate · `line_coverage`/`area_confidence`/`engine_error_count`/`null_geom_basis_count`), sourced from `gate.ownLastRecordsMeta` via `buildSkipReEmitMeta`.
* Stamp `own_started` and a carried-forward `last_full_run_at` (`priorMeta.last_full_run_at ?? gate.ownCompleted` on skip; `RUN_AT` on a real run). Emit `consecutive_skips` — free from the same read.
* Replace the hardcoded `verdict: 'PASS'` with the row-derived cascade — inert today, becomes a defect the moment `consecutive_skips` gains a WARN threshold in this same commit.
* **Delete `evaluatedAt` from `runLedgerGateDecision`'s return** (`source-version.js:331`). Two seats independently ruled it should go, not gain a consumer: it is `RUN_AT ≈ now`, which `pipeline_runs.started_at` already carries.
* B5: exclude gated-skip rows from the `detectDurationAnomalies` baseline (`src/lib/quality/types.ts:421` currently filters `d > 0`, which only catches run-chain's hardcoded `0 ms` inserts).

*Red first:*
- [ ] B-R1: a skip row carries `link_rate` with its threshold — funnel `auditMetric` lookup does not fall back to `matchPct`.
- [ ] B-R2: a skip row lets an operator compute "days since last real execution" from the row alone.
- [ ] B-R3: consecutive skips increment; the Nth emits WARN and the cascade propagates it (proves the cascade fix is load-bearing).
- [ ] B-R4: a gated-skip row does not collapse the duration baseline.

**Spec 48 §3.7 note:** the `enrich_centreline` no-tripwire precedent is CONDITIONAL — it is licensed to skip because an independent coverage assertion stays green meanwhile. Re-emitting coverage rows satisfies that condition; that is why no standalone tripwire is required *once B lands*.

## Commit C — heritage skip-path guards (closes C)
* Add `assertVersionColumn` before `countStale` (`enrich-heritage.js:352`) — `enrich-ravines.js:82` added exactly this guard in `92ee03b9` *because* `countStale` moves a column read ahead of `assertPreconditions`.
* The skip path never calls `assertPreconditions` (`:361`, in-txn), so PostGIS/index/SRID go unvalidated — decide knowingly: hoist the cheap checks or document the omission.
* **Correct the commit-body claim** that the mechanism was "ported verbatim from `enrich-ravines.js`". It was not.

*Red first:*
- [ ] C-R1: version column absent → clear diagnostic, not a raw `42703`.

## Commit D — version signals fingerprint the wrong thing (closes D#2, D#3, D#4, D#5-NEW)

> ### ⛔ D#5 — NEW HIGH, BLOCKING. The cost gate reads a counter that is structurally blind.
> `enrich-parcels.js:1929` emits `records_updated: result.updated`, which is the **pass-1 (zoning) rowcount only**. The max-build, existing-structure/scenario, comparable-builds and optimal-config passes write **uncounted** — and they are the passes that write the cost step's actual inputs. `flushOptConfigBatch` (`:1364-1392`) is a blanket `UPDATE … FROM (VALUES …)` with **no `IS DISTINCT FROM` guard**, touching `opt_aor_gfa_sqm`/`opt_coa_gfa_sqm` on 450,175 parcels while reporting `records_updated=1`.
> **Executed proof:** replaying run 1407's real ledger shape through the REAL `runLedgerGateDecision` with the REAL cost slug sets returns `{"skip":true,"reason":"no_upstream_changes"}` for a run that genuinely updated 190 parcels — **skips real work, reports PASS**. 3 of 5 historical `enrich_parcels` runs have that shape.
> **Not fixable by adding slugs.** Needs an honest aggregate counter in `enrich-parcels.js` (sum all five passes) or a gate signal independent of the producer's self-report.
> **OPERATOR DECISION REQUIRED:** (i) fix the counter inside this WF3, or (ii) ship the cost caller's gate DISABLED until it is fixed. Shipping a gate that provably skips real work is worse than no gate. Do not resolve this by assumption.
> **D#6 (MED, same root):** `lot_size_sqm` is written by `load-parcels.js` (`sources:parcels`) and feeds the cost engine directly, but `sources:parcels` is absent from `UPSTREAM_SLUGS`.

- [ ] D#2: `rates_as_of` reads `MAX(updated_at)` (the column already exists), not `MAX(as_of_date)` — a business date cannot see a `cost_per_sqm` edit. All 12 rows share `as_of_date = 2026-06-30` today, so every value correction is currently invisible.
- [ ] D#3: read the index **value** and its **version** in one advisory-locked read (`:496` is currently outside the lock, `:527` inside).
- [ ] D#4: add `FORCE_FULL` escape hatches to `enrich-heritage.js`, `link-wsib.js`, `link-parcel-addresses.js` — presently 0/0/4 across the gated steps, so three of four have no operator override if a gate misfires.

*Red first:*
- [ ] D-R1: edit `cost_per_sqm` without moving `as_of_date` → gate returns RUN.
- [ ] D-R2: each new `FORCE_FULL` bypasses its gate.

## Commit E — orphan `running` row wedges the gate (closes E#1)
* `load-wsib.js:141-152` INSERTs `status='running'`; finalized only on the happy path at `:390-397`, no `try/finally`, and the UPDATE swallows its error via `.catch(() => {})`. A stranded row satisfies `COALESCE(completed_at,'infinity') > anchor` **forever** and `'running' <> 'completed'`, so link_wsib can never skip again — silently, behind a green PASS.
* Wrap in `try/finally`; stop swallowing the finalize error.
* **SCOPE CORRECTED — "latent, never happened" is REFUTED.** It has fired **19 times**. Today's count reads 0 only because a reaper erased the evidence: `src/app/api/admin/stats/route.ts:188-199` flips `running` rows older than 2h to `failed` on every admin-stats request. 19 rows carry `interrupted: stale run auto-cleaned`, incl. `load_wsib` itself and `sources:link_parcels` stranded **39 days**; 10 were reaped in one burst on 2026-07-19 — a single page load clearing four months of false state.
* **Therefore the wedge is bounded only when someone loads the dashboard, and PERMANENT when nobody does** — precisely the unattended GH Actions cron case B7 runs in.
* **Add a staleness/TTL guard inside the gate itself** (defence-in-depth; `scripts/lib/chain-concurrency.js:36` already uses a 12h TTL for exactly this class — the B3 gate has none). Do not rely on the admin reaper: it requires a human to open a page.
* **Six sites share the INSERT-`running`-without-`finally` shape** — `load-wsib.js:145/390` (the only one with a silent `.catch(() => {})`), `enrich-web-search.js:314/550`, `enrich-wsib.js:493/842`, `assert-data-bounds.js:83/991`, `assert-engine-health.js:43/287`, `assert-schema.js:269/547`. Only `load_wsib` currently intersects a B3 upstream slug set, so fix it here and **file the other five** rather than widening this commit.
* **New, worth its own followup entry:** the admin stats reaper has silently masked a real reliability problem for months. Nineteen strands is a signal nobody ever saw.

*Red first:*
- [ ] E-R1: a throw mid-run still finalizes the row to a terminal status.
- [ ] E-R2: a stranded `running` upstream row forces RUN (locks the fail-safe direction — this is correct behavior, pinned so a future "optimization" cannot quietly drop it).

## Commit F — discrete corrections
- [ ] F1: phase ordinals — Spec 41:51 says permits **7**, Spec 43:50 says sources **19**; the success path emits `5` and both paths emit `12` for sources. Reconcile code and specs, one source of truth.
- [ ] F2: `link-wsib.js:36-38` bare-slug rationale is wrong — `pipeline.run()` never writes `pipeline_runs`, so a standalone run creates no row and cannot advance any anchor. Correct the comment (the slugs are harmless).
- [ ] F3: `docs/specs/01-pipeline/43_chain_sources.md:88` says "Levenshtein fuzzy match"; the code is `pg_trgm` trigram. This commit already edited that file.
- [ ] F4: mig 243's `COMMENT ON INDEX` claims it serves "all three matching tiers + the probe" — `EXPLAIN` shows the tiers seq-scan unchanged. A durable in-DB artifact that will mislead the next person tuning link-wsib. New migration; do NOT edit 243 (applied to dev).

## Route to `review_followups.md` (not this WF3)
* `npm run lint` is `next lint` and **never lints `scripts/`** — so Husky's pre-commit lint has never covered any pipeline script. Repo-wide; needs its own decision.
* HCD `designated_date` tiebreak is `ORDER BY hd.id ASC`, arbitrary; 86 parcels overlap, 54 get a non-newest date. Pre-existing. The defect is that the rule is unstated — do not silently pick "newest".
* `validatorEqualityDecision` first-match-wins: a matching `Last-Modified` short-circuits a differing ETag, and the live `load_heritage` row shows that branch firing today.
* `source-version.js:42` docblock names a `garbage` outcome the code cannot produce; corrupt metadata is labelled `OUTCOME_LOAD_CHANGED` — a positive change signal.
* Cost-step `upd=1 → upd=77` (2026-07-08): 76 rows with no upstream signal, no cost-model commits in the window. **Grounder before B7.**
* `enrich-heritage.js:41-42` WARN/FAIL pcts are bare `z.number()`; >1 silently disables the FAIL gate.
* `compute-parcel-cost-estimates.js` `rowLimit: 0` bypasses the gate *and* processes every row (`:534` uses `!= null`, `:245` uses truthiness).

## Standards Compliance
* **Try-Catch Boundary:** E adds the only new boundary (`load-wsib.js` finalize) — must not swallow.
* **Unhappy Path Tests:** A-R2 (invalid config), C-R1 (missing column), E-R1 (throw mid-run), D-R1 (silent rate edit).
* **logError Mandate:** N/A — `scripts/` domain uses `pipeline.log.error`.
* **UI Layout:** N/A except B5 (`src/lib/quality/types.ts`, no visual change).
* **Lint caveat:** `npm run lint` does NOT cover `scripts/`. Run eslint directly on every changed script before claiming clean.

## Verification
`npx tsc --noEmit` · eslint direct on changed `scripts/` files · `npm run test` · `BUILDO_TEST_DB=1 npm run test:db`
Known pre-existing red, NOT introduced here and already filed: `parcel-lookup.db.test.ts` (`massing_enriched_at`, B2's mig 240) — must close before B7.

---
> **PLAN LOCKED. Do you authorize this WF3 remediation plan? (y/n)**
> §11 note: grouped A/B/D by shared edit rather than per-finding commits (operator-ratified deviation from the recorded WF3 cadence); per-finding traceability lives in the commit bodies.
