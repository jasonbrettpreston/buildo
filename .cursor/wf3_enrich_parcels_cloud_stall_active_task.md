# Active Task: WF3 — enrich_parcels can stall silently on cloud
**Status:** Implementation (authorized 2026-09-03)

## Context
* **Goal:** ONE finding — `[22/28] enrich_parcels` can run to a platform kill on cloud with **zero output and zero DB-visible progress**, wedging `chain_sources` at `status='running'` and blocking Spec 122 §10.1's clean-run gate (`.cursor/wf3_cloud_parity_active_task.md` FIX 3.2b / FIX 4). Root cause is **UNVERIFIED**; this WF verifies the premise first, then fixes only what measurement names.
* **Target Spec:** owner specs for the step — `docs/specs/01-pipeline/58_*` (zoning enrichment, consumer protocol), Spec 65 §Max-build, Spec 78 §3A (optimal config). Governing: `docs/specs/01-pipeline/48_pipeline_observability.md` §3.6/§3.7 (row-derived audit pairs; INFO counter emitted even at 0) · `docs/specs/00-architecture/115_scheduling.md` §2.2/§3/§4 (fail-safe-loud; a platform timeout is a backstop, never the mechanism) · `docs/specs/01-pipeline/124_step_standard_policy.md` §7 (the resolution ladder) · `tasks/lessons.md`:82 (pooler drops startup params), :103 (a job only the platform can end always ends dirty).
* **Domain Mode:** Backend/Pipeline → `scripts/CLAUDE.md`. **Workflow:** WF3. **Branch:** `wf2/deep-scrapes-restore-l0`.
* **Key Files:** `scripts/enrich-parcels.js` (anchors `withAdvisoryLock(pool, ADVISORY_LOCK_ID`, `computeDeferScope`, `recordHeartbeat`, `enrichOptimalConfig`) · `scripts/lib/pipeline.js` (anchors `withPipelineStatementTimeout`, `function createPool`, `async function withAdvisoryLock`) · `.github/workflows/chain-sources.yml`.

## Premise corrections found while grounding (read before planning further)
1. **The stalled run's log shape is IDENTICAL to a SUCCESSFUL run's.** Run 32779094469 (08-24, **success**) logged `Loaded 419 logic variables` at 22:21:35 and its NEXT line at `00:08:34` — **1h47m of zero output**, then `PIPELINE_SUMMARY`. Run 33324653235 (08-30) logged the same last line at 18:43:05 and was killed at 22:14:44 — **3h31m39s**. Same silence, ~2× the duration. **The logs alone cannot distinguish a hang from a slow run.** Any plan that assumes "hang" before measuring is the eager fix.
2. **The landed heartbeat does NOT cover the silent window.** `recordHeartbeat` is called from exactly one site — `enrich-parcels.js:1593`, inside `enrichOptimalConfig` (pass 5). The 3h31m silence is `computeDeferScope` + passes 1–4, which have **no instrumentation at all**. The FIX 3.2b heartbeat would not have fired once during the 08-30 stall.
3. **H2 (advisory-lock wait) is REFUTED at plan time, by code.** `withAdvisoryLock` uses `pg_try_advisory_xact_lock` (`pipeline.js:972`) — **non-blocking**; it returns `acquired:false` and SKIPs, it never waits. A lock held by a stranded row produces a *skip*, not a hang. The surviving lock hypothesis is a **heavyweight** lock wait (H3), which is a different instrument.
4. **`statement_timeout` is not merely dropped by the pooler — we explicitly disable it.** `PIPELINE_STATEMENT_TIMEOUT_MS` is unset in `chain-sources.yml`, so `withPipelineStatementTimeout` computes `timeoutMs = 0` and issues `SET statement_timeout TO 0` on every physical client. Nothing in this step can ever self-terminate. That is a *deliberate* 2026-07-29 fence (`lessons.md`:82 — the 2-min cluster default killed `link_wsib`); it is why the stall is **unbounded**, not proof it is the cause.
5. **The successful run wrote nothing.** 32779094469's `PIPELINE_SUMMARY` reads `records_updated: 0`, `enriched 0 parcels`. ~107 minutes of pure scan/compute with zero writes — duration is dominated by full-table spatial work, not by scope size.

## Technical Implementation
* **New/Modified Components:** N/A (scripts-only).
* **Data Hooks/Libs:** `scripts/enrich-parcels.js` (heartbeat call sites + per-pass `SET LOCAL`), `scripts/lib/pipeline.js` (pool `keepAlive`), `scripts/seeds/logic_variables.json` (2 new tunables).
* **Database Impact:** **NO.** No migration, no schema change, no bulk UPDATE. Writes are (a) the existing guarded single-row `pipeline_runs.records_meta` heartbeat UPDATE and (b) ≤2 `logic_variables` rows via the existing `ON CONFLICT DO NOTHING` seed. The 237K+-row UPDATE strategy is N/A.

## Standards Compliance
* **Try-Catch Boundary:** N/A — no API routes. Every new instrumentation write reuses `recordHeartbeat`'s posture: `try/catch` → `pipeline.log.warn` → never throws (instrumentation must never crash the pass it instruments).
* **Unhappy Path Tests:** statement_timeout fires → the step FAILs loudly with a named terminal (not a silent retry); lock_timeout fires → same; a heartbeat UPDATE that throws → pass continues, WARN logged; `pg_stat_activity` capture query itself failing → WARN, no crash.
* **logError Mandate:** N/A for `scripts/` — `pipeline.log.warn/error` is the equivalent.
* **UI Layout:** N/A.

## Execution Plan

### STEP 0 — PREMISE VERIFICATION (blocking; no code until every row below is answered)
Ranked by the evidence in "Premise corrections". Each hypothesis carries the instrument that CONFIRMS or REFUTES it. **No fix lands for a hypothesis still marked UNTESTED.**

| # | Hypothesis | Prior | Instrument (run this, record the output) |
|---|---|---|---|
| **H4** | **Not a hang — the step is simply slow and variable under cloud IO, and 08-30 was killed at ~93% of a genuinely long run** (72 min elapsed at start + >208 min = 280 of 300). | **HIGHEST** — premise correction 1 makes the log shape non-discriminating; 5 cloud runs give 104/107/114 min completions vs 2 kills. | On cloud, `EXPLAIN (ANALYZE, BUFFERS, TIMING)` each of the 4 pass statements + the 5 `computeDeferScope` COUNTs, **read-only, off-chain**, one at a time. Sum the medians. If the honest sum approaches 200+ min, H4 is CONFIRMED and the fix is a bounded/deferrable step, not a deadlock hunt. |
| **H5** | **A dropped TCP connection the client never notices.** `createPool` sets no `keepAlive` (pg@8.13.1 defaults `keepAlive:false`) and no `query_timeout`; Supavisor/NLB reap an idle-looking socket mid-query and node awaits a response that will never arrive → infinite silent hang. | **HIGH** — explains "same shape, unbounded tail" and why it is intermittent; costs one line to test. | During a live re-run, once the client has been silent >20 min: `SELECT pid, state, wait_event_type, wait_event, now()-query_start AS elapsed, left(query,120) FROM pg_stat_activity WHERE application_name LIKE '%enrich%' OR query ILIKE '%parcel_zoning_enrich%'`. **DB shows no matching backend while the client still waits ⇒ H5 CONFIRMED** (server finished/died; client orphaned). |
| **H1** | **The step can never self-terminate** — `SET statement_timeout TO 0` (premise correction 4). | **CONFIRMED as a code fact; UNPROVEN as the cause.** | Already executed: `grep -n PIPELINE_STATEMENT_TIMEOUT_MS .github/` ⇒ no hits; `pipeline.js:64-71`. H1 is the *amplifier* of H3/H4/H5, and its remedy (a bounded, loud timeout) is worth landing under EVERY branch. |
| **H3** | Pass 1/2's UPDATE blocked on a heavyweight lock (autovacuum-to-prevent-wraparound, a concurrent DDL, another writer on `parcels`). | MEDIUM | Same live capture as H5, plus `SELECT * FROM pg_locks WHERE NOT granted`. **`wait_event_type='Lock'` ⇒ H3 CONFIRMED.** `wait_event_type IN ('IO','BufferPin')` or `state='active'` with no wait ⇒ H3 refuted, H4 supported. |
| **H6** | `computeDeferScope` — **5 concurrent full-table COUNTs** over ~486K `parcels`, one of them a correlated `EXISTS … ST_Intersects` over `zoning_bylaw_areas` (`buildPass1ScopeWhere`), all fired via `Promise.all` **before** any pass and inside the silent window. | MEDIUM — the least-instrumented code in the window. | The H4 EXPLAIN, run for these 5 queries specifically, and timed as a `Promise.all` group (5 concurrent connections contend). |
| **H2** | Advisory-lock wait. | **REFUTED** (premise correction 3). | No further work. Recorded so it is not re-hypothesised. |

- [x] 0.1 Run the H5/H3 live capture. **BLOCKED — no live re-run in progress.** Dispatching one is out of scope for premise-verification (owned by `wf3_cloud_parity` FIX 4). H5/H3 remain UNDETERMINED; see ruling below.
- [x] 0.2 Ran H4/H6 measurement — cloud DB is **read-only queried directly** (`pipeline_runs.records_meta` per-pass audit rows already exist in production data; no `EXPLAIN` needed — real completed-run timings supersede a synthetic EXPLAIN) + `pg_stat_statements`. Record below.
- [x] 0.3 **Ledger the ruling** (2026-09-03, this WF's premise-verification step; adjudicator = this session, discoverer-role only — a human/panel ruling is still owed before STEP 1 code lands per Spec 124 §4).

### STEP 0 RESULTS (measured 2026-09-03, cloud DB, read-only via `cloud_pool.js`)

**H4 — CONFIRMED, now HIGHEST-confidence.** `SELECT id, started_at, completed_at, status, duration_ms, records_meta FROM pipeline_runs WHERE pipeline LIKE '%enrich_parcels%' ORDER BY id DESC LIMIT 15` returns REAL per-pass durations already recorded in `records_meta.audit_table.rows` (the `enrich_parcels_passN_duration_ms` INFO rows added by a prior commit — contrary to the plan's grounding claim "never emitted": they ARE emitted and were already present in production data for runs 3485/3456):
| run | status | total | pass1 | pass2 | pass3 | pass4 | pass5 |
|---|---|---|---|---|---|---|---|
| 3485 (08-24) | completed | 107.0 min | 15.6 | 46.7 | 7.5 | 20.6 | 12.2 |
| 3456 (08-24) | completed | 126.2 min | 16.7 | 48.3 | 7.9 | 20.6 | 27.5 |
No single pass exceeds 90 min in either successful run; pass2 (max-build envelope) dominates at ~47 min. `pg_stat_statements` (captured before an unrelated reset wiped it — see caveat) corroborated pass2's `CREATE TEMP TABLE parcel_max_build` at mean 2,557,774ms/max 2,616,450ms (42.6/43.6 min) over 3 calls, and surfaced exactly one statement over 90 min anywhere in the 13-day window: a `comparable_builds` UPDATE at 88.3 min, calls=1 (likely a one-off, not the routine pass4 shape, which measures 20.6 min in both real runs). **Sum of real passes = 107–126 min on full runs — genuinely slow, well short of the 3h31m 08-30 kill, but confirms "slow full-table spatial work" is real and large.**

**H6 — REFUTED, cleanly, at the code+manifest level (no live query needed).** `scripts/manifest.json:18`: `"enrich_parcels": {..., "chain_args": { "sources": ["--full"] }}` — the `sources` chain (the one that stalled) **always** invokes `enrich-parcels.js --full`. `scripts/enrich-parcels.js:1818-1820`: `computeDeferScope` (the 5-concurrent-COUNT hypothesis) is gated `if (!full) { ... }` with the comment "Skipped entirely under --full." **H6's code path never executes on the cloud sources chain.** Corroborated: `pg_stat_statements` (pre-reset) had zero rows matching any of the 5 COUNT-query shapes despite 2 full successful completions in the 13-day window — consistent with them never running.

**H1 — CONFIRMED as fact (no change).** `scripts/lib/pipeline.js:44-79`: a plain session-level `SET statement_timeout TO 0` issued once per physical client after connect (not `SET LOCAL`), over the port-5432 **session-mode** pooler (a dedicated connection per session, so the SET is NOT dropped the way a transaction-pooler SET would be — Spec 113 §3 G7). This is a deliberate, working, unbounded-timeout config (2026-07-29, `fa9e984c`) — an amplifier for whichever hypothesis is the real cause, not itself a standalone cause.

**H5 — UNDETERMINED.** Code facts confirmed unchanged: `grep -n keepAlive scripts/lib/pipeline.js scripts/lib/resolve-db.js` → no hits (pg@8.13.1 defaults `keepAlive:false`); no `query_timeout` anywhere. `docs/specs/00-architecture/113_supabase_infrastructure.md` documents **no Supavisor/NLB idle-timeout number** — only that the session pooler drops *startup params*, not an idle-connection duration (spec gap; cannot bound "gap > idle timeout" from docs alone). The confirming/refuting instrument (`pg_stat_activity` during live silence) requires a live cloud run in progress — not executed (out of scope; see 0.1).

**H3 — UNDETERMINED.** Same live-capture blocker as H5 (`pg_stat_activity`/`pg_locks` during an active hang). Not executed.

**H2 — REFUTED (unchanged, already a code fact).**

**The 08-30 failed run (3876):** `records_meta` is **null** — zero pass markers, consistent with premise correction 1 (process killed before ever reaching `emitSummary`, which only fires after `withTransaction` resolves). Suggestive but unconfirmed: `pg_stat_statements`' `CREATE TEMP TABLE parcel_max_build` showed **3** calls (not 2) in the same 13-day window that has only 2 known successful completions — a 3rd call is consistent with 3876 having completed pass2 before hanging later (pass3/4/5), narrowing the stall's likely onset, but this is an aggregate count, not a per-run attribution, and cannot be treated as confirmed.

**Instrumentation caveat (new finding, not in the original plan):** `pg_stat_statements` on this cloud instance is **not durable for retrospective analysis** — mid-investigation, `pg_stat_statements_info.stats_reset` jumped from `2026-08-20T11:46:41Z` to `2026-09-03T17:46:06Z` (a reset that happened *during this session*, cause unknown — not triggered by this investigation's own read-only queries, which don't call `pg_stat_statements_reset()`). `pg_stat_statements.max=5000`, `dealloc=0` after the reset, so it wasn't eviction. Any future H4/H6 measurement via `pg_stat_statements` must capture and archive the data immediately — it can vanish within the same working session.

**RE-RANKED (was H4 > H5 > H1 > H6 > H3 > H2; now):**
1. **H4 (slow, not hung)** — CONFIRMED with real numbers; the dominant explanation for successful runs' long duration.
2. **H1 (unbounded timeout)** — CONFIRMED as fact; the amplifier under every other branch, not a standalone cause.
3. **H5 (dropped socket)** — UNDETERMINED, unresolved code gap (no keepAlive) + a real doc gap (no idle-timeout number); still the best explanation for *why 08-30 specifically ran 2x longer than any success and never emitted another line*.
4. **H3 (heavyweight lock)** — UNDETERMINED, same live-capture blocker, lower prior than H5 (nothing in the code points at a specific blocking writer).
5. **H6 (concurrent COUNTs)** — REFUTED at the code+manifest level; closed, no further work.
6. **H2 (advisory-lock wait)** — REFUTED; closed.

**Cheapest next measurement:** a `pg_stat_activity` + `pg_locks` snapshot (per the plan's own instrument), captured on a 1–2 min interval **during the next scheduled/dispatched `chain-sources` run**, gated to fire once `enrich_parcels`'s own log has been silent >20 min — exactly STEP 0's original 0.1, still un-run, still the cheapest way to settle H5 vs H3 vs "just very slow this time." No dedicated run should be burned for it; ride the next real dispatch.

### STEP 1 — INSTRUMENTATION (lands under EVERY branch; it is what makes STEP 0 repeatable)
Ladder placement (Spec 124 §7): `enrich_parcels` is **NOT in `scripts/steps/_schema/converted.json`** (8 entries, `enrich-parcels.js` absent) and has **no `*.descriptor.json`**. Rung **(a) descriptor is therefore UNAVAILABLE** — it is pilot 9 (the ENRICHER archetype). What lands now is rungs (b)/(c)/(d), in the legacy script.

- [x] 1.1 **(d) library — `keepAlive: true` on `createPool`'s two `new Pool(...)` sites** (`pipeline.js`). **Widened to a third site**: `resolve-db.js`'s `createResolvedPool()` also builds `new Pool(...)` (the 24-script factory Spec 122 §P0 already unified) — landed there too, same rationale, `poolOverrides` still wins so a caller can opt out. `keepAliveInitialDelayMillis: 10000` (10s) paired on all 3 sites. One fix, every step benefits; directly bounds H5 (still UNDETERMINED — this closes the code gap, not a proof). Both-directions lock: 5 unit tests (2 `createPool()` branches + 2 `createResolvedPool()` cases + the opt-out) asserting `pool.options.keepAlive === true` (RED: `expected undefined to be true`; GREEN after).
- [x] 1.2 **(c) logic variable — `enrich_parcels_pass_statement_timeout_minutes`** and **`enrich_parcels_lock_timeout_ms`**. **DEVIATION from this row's original text, per coordinator instruction post-STEP-0:** default is **75 min / 1,800,000 ms**, not 0 — STEP 0's real measurement (max real pass 48.3 min) now authorizes a bounded default (measured max x1.5, the §2.1 remedy formula) instead of the "default 0 until authorized" placeholder. Both externalized per Rule 3; added to `scripts/seeds/logic_variables.json` **and** validated in `LOGIC_VARS_SCHEMA`. Admin GROUPS entry added (`GlobalConfigCard.tsx`, "Source Ingestion" group). Commit: `c7b20ac9`.
- [x] 1.3 **(e) compute, minimally — `SET LOCAL statement_timeout` / `SET LOCAL lock_timeout` at the top of the passes-1–4 transaction.** Landed exactly as described — one `SET LOCAL` pair at the top of `pipeline.withTransaction`'s callback in `main()`, each of the 4 passes wrapped by a new `runPass(passName, fn)` helper so a `57014`/`55P03` abort dies LOUD with the pass name in the thrown error (Spec 115 §2.2). **FENCE STATED explicitly in the commit** (code comment + test): `withPipelineStatementTimeout` (`pipeline.js:44-79`) is UNCHANGED — its session-level `SET statement_timeout TO 0` still governs every other caller (pass 5's separate connection, every other pipeline script); this `SET LOCAL` only overrides it for this one transaction's lifetime, reverting to the session value at COMMIT/ROLLBACK. Both-directions lock: `runPass` unit tests prove a `57014`/`55P03` error is renamed with the pass name (RED: `ep.runPass is not a function`; GREEN: rethrows tagged); an unrelated error passes through unchanged. Commit: `c7b20ac9`.
- [ ] 1.4 **(b) declared check — extend the heartbeat to the whole step.** `recordHeartbeat` already takes `pool` (not the txn `client`), so it can write from a **second connection while the txn client is blocked**. Add a `setInterval`-driven ticker started before `computeDeferScope` and cleared in a `finally`, stamping `current_pass` ∈ `defer_scope | pass1 | pass2 | pass3 | pass4 | optimal_config` — passes 1–4 are single set-based statements with no JS loop to hook, so the ticker is the only mechanism. Reuse `enrich_parcels_heartbeat_minutes`. Both-directions lock: a fake slow pass proves ≥2 heartbeats with the right `current_pass`; the existing pass-5 lock proves no regression.
- [ ] 1.5 **(b) declared check — `pg_stat_activity` wait capture on heartbeat-silence.** When a tick finds the same `current_pass` unchanged for N ticks, run the H5/H3 query on the heartbeat's own connection and write the rows into `records_meta.stall_probe` (bounded: top 5 backends, `query` truncated to 200 chars, never the connection string). Per Spec 48 §3.6, pair it: an **INFO counter emitted even at 0** (`enrich_parcels_stall_probes`) plus a **WARN-grade gate** (`enrich_parcels_stall_probe_errors`, INFO at 0). Verdict stays row-derived via the existing `verdictCascade` — never a parallel boolean.
- [ ] 1.6 **(b) — per-pass duration audit rows.** `passDurationsMs` is already collected (`enrich-parcels.js`) and **never emitted**. Emit one INFO row per pass. This is the cheapest instrument in the task and it makes H4 answerable from the chain's own records forever after.

### STEP 2 — FIX, per confirmed hypothesis (nothing here lands before STEP 0 rules)
- [ ] 2.1 **If H4 (slow, not hung):** the fix is a **bounded terminal**, not a speed-up. Set `enrich_parcels_pass_statement_timeout_minutes` from the measured p95 × 1.5, so the step FAILs loudly inside the chain rather than at the platform wall. **Do NOT raise `SOURCES_STEP_TIMEOUT_MINUTES`** — out of scope, and blocked on the poisoned `pipeline_runs` duration statistics (`chain-sources.yml:50-53`). File the real remedy (incremental/batched passes) as the pilot-9 ENRICHER conversion's charter.
- [ ] 2.2 **If H5 (dropped socket):** 1.1's `keepAlive` is the fix; add `query_timeout` only if `keepAlive` alone does not surface the drop. Lock: an integration test that kills the backend mid-query and asserts the client rejects rather than hangs.
- [ ] 2.3 **If H3 (heavyweight lock):** `enrich_parcels_lock_timeout_ms` non-zero + a FAIL audit row naming the blocking `pid`/relation. The blocker itself (autovacuum tuning, a stranded writer) is a separate finding — file it, do not fix it here.
- [ ] 2.4 **If H6 (defer-scope COUNTs):** rung (e) is a last resort; first try rung (b) — emit the 5 timings and let the ratio audit row decide. Serializing the `Promise.all` is a compute change and needs its own ruling.
- [ ] 2.5 **Under every branch:** file the pilot-9 (ENRICHER) charter items this task can only name, not close — descriptor `execution` shape, `guards.requires`, a `terminals[]` entry for a timeout terminal, and descriptor-declared pass-duration plausibility bounds.

### KILL CRITERION
**If STEP 0 confirms H4 and refutes H3+H5+H6 — i.e. there is no hang, only an unbounded slow step — this WF3 CLOSES at STEP 1.** Ship the instrumentation and the bounded timeout, record "no defect found; the finding was unobservability, not a deadlock", and hand the duration problem to pilot 9. Do **not** keep hunting a deadlock the measurement says is not there. Equally: **if two full cloud runs pass STEP 1's instrumentation with no stall reproduced, stop.** An unreproducible intermittent gets the instrument, not a speculative fix.

## Grounding
Every executable claim above, with the command RUN on 2026-09-03 (branch `wf2/deep-scrapes-restore-l0` @ `b4ddfc24`). **No cloud DB connection was opened; the cloud facts come from GH Actions logs.**

| Claim | Command | Result |
|---|---|---|
| 08-30 run's last line, then a 3h31m silence to the kill | `gh run view 33324653235 --job <id> --log \| tail` | `18:43:05.14 … Loaded 419 logic variables` → `22:14:44.72 ##[error]The action 'Run sources chain' has timed out after 300 minutes` = **3h31m39s** |
| the step started at 72 min chain-elapsed | same log | `18:27:10.25 [22/28] enrich_parcels — starting...` (chain start `17:13:34Z`) |
| there was a 15m54s silence even BEFORE config load | same log | `18:27:10` start → `18:43:04` first `[enrich_parcels]` line |
| the chain died `running`; two orphan node procs | same log | `verdict is a FAIL (status=running …)`; `Terminate orphan process: pid (2847) (node)`, `pid (4382)` |
| **a SUCCESSFUL run has the SAME silence shape** | `gh run view 32779094469 --job <id> --log` | `22:21:35 Loaded 419 logic variables` → next line `00:08:34 PIPELINE_SUMMARY` = **1h47m silent**; `[22/28] enrich_parcels — completed (6830.0s)` |
| the successful run wrote nothing | same log | `"records_updated":0`; `enriched 0 parcels (zone_class 96.6% …)` |
| cloud run inventory | `gh run list -w chain-sources -L 12 --json …` | 7 runs; 2 success, 5 failure; only `31217446629` ran this branch |
| heartbeat covers pass 5 ONLY | `grep -n "recordHeartbeat" scripts/enrich-parcels.js` | defined `:1525`, called `:1593` (inside `enrichOptimalConfig`), exported `:2233` — **one call site** |
| passes 1–4 share ONE transaction | `sed -n '1900,1935p' scripts/enrich-parcels.js` | `pipeline.withTransaction(pool, async (client) => { … pass1…pass4 … })` |
| the advisory lock is NON-blocking | `sed -n '968,978p' scripts/lib/pipeline.js` | `SELECT pg_try_advisory_xact_lock($1)`; `!acquired ⇒ ROLLBACK` + skip emit |
| `statement_timeout` is set to 0 | `sed -n '63,72p' scripts/lib/pipeline.js` | `raw === undefined ? 0 : …`; `SET statement_timeout TO ${timeoutMs}` |
| nothing sets `PIPELINE_STATEMENT_TIMEOUT_MS` in CI | `grep -rn PIPELINE_STATEMENT_TIMEOUT_MS .github/` | no hits |
| no `keepAlive` / `query_timeout` / `lock_timeout` on the pool | `grep -n "keepAlive\|query_timeout\|lock_timeout" scripts/lib/pipeline.js` | no hits |
| pg version defaults `keepAlive:false` | `node -e "…dependencies.pg"` | `^8.13.1` |
| `SET LOCAL statement_timeout` precedent exists in-tree | `grep -rn "SET LOCAL" scripts/` | `lib/step/plausibility.js:124`, `lib/vocab-coverage.js:57` |
| `computeDeferScope` = 5 concurrent COUNTs, 1 spatial | `sed -n '1655,1682p' scripts/enrich-parcels.js` | `Promise.all([...5 counts])`; `buildPass1ScopeWhere` has `EXISTS (… ST_Intersects …)` |
| `passDurationsMs` is collected but never emitted | `grep -n "passDurationsMs" scripts/enrich-parcels.js` | assigned per pass; no `auditRows.push` consumer |
| `enrich_parcels` is NOT converted, has no descriptor | `cat scripts/steps/_schema/converted.json`; `ls scripts/*enrich*descriptor*` | 8 entries, `enrich-parcels.js` absent; `No such file or directory` |
| chain ceilings | `sed -n '20,60p;110,128p' .github/workflows/chain-sources.yml` | job `330`, step `300` (`SOURCES_STEP_TIMEOUT_MINUTES`), soft budget `290` |
| the soft budget cannot bound one long step | `.cursor/wf3_cloud_parity_active_task.md` FIX 3.2 (Fold A) | `run-chain.js` checks it **between steps only** |

## Operating Boundaries
* **Target Files:** `scripts/enrich-parcels.js` · `scripts/lib/pipeline.js` (`createPool` `keepAlive` only) · `scripts/seeds/logic_variables.json` · `src/tests/` (the new both-directions locks) · `docs/reports/review_followups.md` · `docs/runbook/README.md` (the stall-probe procedure).
* **Out-of-Scope Files:** `.github/workflows/chain-sources.yml` (**no ceiling change**) · `scripts/manifest.json` `step_timeout_minutes` · `migrations/**` · every `*.descriptor.json` and `scripts/lib/compute/*` · `scripts/lib/step/*` · `src/` app code.
* **Cross-Spec Dependencies:** 48 §3.6/§3.7 (audit pairing, INFO-at-0) · 115 §2.2/§3 (fail-safe-loud; platform timeout is the backstop) · 124 §7 (ladder) + Rule 3 (tunables externalized) · 122 §10.1 (the gate this unblocks) · 58/65/78 (the passes' own contracts).

## Not in scope
* **Raising any timeout ceiling** (300/330 min, or per-step `step_timeout_minutes`) — blocked on the poisoned `pipeline_runs` duration statistics, and it treats the symptom.
* **Making `enrich_parcels` faster** (batching, incremental passes, index work). That is the **pilot 9 ENRICHER conversion**, not this WF3.
* **Converting `enrich_parcels` to the descriptor shape** — rung (a) is unavailable here by design; this task only files what pilot 9 must declare.
* **Closing the orphan `pipeline_runs` rows** the 08-30 timeout left (`wf3_cloud_parity` FIX 3.3 owns them; blocked on operator authorization).
* **The `lifecycle_seq_band_*_max is non-finite` WARN storm** (~40 lines every step, every run) — a real observability defect, own WF3, file it LOW.
* **The PASS-on-skip conflation** and the golden-harness skip-hash defect — already filed HIGH/MED elsewhere.
* **Dispatching the acceptance cloud run** — owned by `wf3_cloud_parity` FIX 4; STEP 0 rides along with it rather than burning its own 5-hour run.

> **PLAN LOCKED. Do you authorize this WF3 plan? (y/n)**
> §11 note: Database Impact is NO (no migration; writes are one guarded single-row `records_meta` UPDATE plus ≤2 `ON CONFLICT DO NOTHING` seed rows). Ladder rung (a) is declared UNAVAILABLE, with the reason and the owning pilot named, rather than silently skipped.
