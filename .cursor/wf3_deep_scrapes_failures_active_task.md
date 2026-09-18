# Active Task: WF3 — Deep-Scrapes Scheduled-Run Failures (11 of 20, 2026-08-19 → 2026-09-15)

## Plan-panel folds 2026-09-18

- **F1 (Integration):** `startPhaseDeadline(cancelClient, pid, timeoutMs, meta)` needs a SECOND connection distinct from the phase's own. `runRecorderPhase` now opens a dedicated `cancelClient = await pool.connect()` alongside `snapClient`, mirroring `runEnrichPhase`'s `heartbeatClient` precedent (one connect, held for the whole read phase, released in the outer `finally` alongside `snapClient`). `pid` is read via `SELECT pg_backend_pid()` on `snapClient` itself (the connection that will be cancelled), matching the enrich shape's own pattern of reading the phase client's own pid, not the cancel client's.
- **F2 (Integration):** Golden recapture — of the 10 files under `docs/reports/golden/refresh_snapshot/{pre,post}/`, only the 5 `post/*.json` files are re-captured. The `pre/*.json` set is the frozen pre-conversion baseline (`fingerprint_skipped_reason: "no_descriptor_yet"`) — per the established golden/scorecard precedent (`docs/reports/golden/enrich_parcels/phase010b-post-phase-seam-recapture.md`: "The PRE set was NOT re-taken, and must not be"), re-taking it would destroy the only record of pre-conversion behaviour and is not comparable now that the descriptor drives table/invariant derivation anyway. Diff-class prediction made BEFORE recapture (Class A/B/C/D vocabulary, same report): **Class A non-empty and EXPECTED** — this peel adds `records_meta.read_timings[]` (new key) and 2 new `config.logic_variables` entries (44→46), both genuine, intended structural changes; Class B expected empty (no live-DB count drift mechanism this peel touches); Class C expected non-empty (wall-clock duration, live counts). See the Peel 2 commit body for the measured result against this prediction.
- **F3 (Independent):** OA-5 narrowed to "re-enable the workflow" only — `CHAIN_TIME_BUDGET_MINUTES: '140'` for `deep_scrapes` is confirmed LIVE on `.github/workflows/chain-deep-scrapes.yml:274` (landed `d6d0bab0`/`cad1017a`, WF3 F4, 2026-08-15 era). Spec 118 §3's layer-2 row and §7 item 4 corrected in place (2026-09-18) to say `SET to 140` / `DONE` respectively, citing the landed commits, rather than the stale "NOT SET" claim. Verified live by reading the workflow file directly (read-only — cron/workflow files are the concurrent agent's/operator's, not touched otherwise).
- **finite-or-throw dedupe note:** `b69541b3`'s pattern (`resolveInterval` + the `phaseTimeouts` for-loop, both ENRICHER-only in `scripts/lib/step/index.js`) is confirmed an INLINE pattern at those two call sites, not a callable helper. Peel 2 adds a THIRD, separate, unexported local resolver (`resolveRecorderBoundMinutes`) scoped to `runRecorderPhase`'s own two new bounds, rather than extracting a shared helper — extracting one would touch/re-verify goldens for ENRICHER steps entirely outside this WF3's scope for zero behavioural gain. Dedupe filed: `docs/reports/review_followups.md`.

## Output-panel folds 2026-09-18

- **R1 (Independent, FAIL item 3 — closed):** the 6 OPTIONAL reads (massing, schemaColumnCounts, sla, inspections, costEst, coaFunnel) ran via plain `pool.query()` outside the pinned block, with no statement bound, no phase deadline, no timing. **Fence found (git archaeology, `c19cf224^:scripts/refresh-snapshot.js:308-503`):** this loop has run OUTSIDE the pinned REPEATABLE READ transaction since BEFORE the RECORDER conversion, itself predating `fd14dc53` (the commit that introduced the pinned-transaction main block) — every optional read is independently try/caught with its own carry-forward, while the main block is ALL-OR-NOTHING (one shared try/catch, one ROLLBACK). Moving an optional read inside the shared transaction would make ITS failure abort the successful main reads too (Postgres aborted-transaction-until-ROLLBACK semantics, no per-statement recovery without a SAVEPOINT per read) — exactly the failure-isolation guarantee "optional" exists to give up. **Fix, preserving the fence:** a dedicated autocommit `optionalClient` (+ its own `optionalCancelClient` for `pg_cancel_backend`) runs the same `statement_timeout`/phase-deadline bound (the SAME two logic variables, no new config surface) around the optional-reads loop; a bound-triggered cancel takes the EXISTING carry-forward path (`results[key] = null`), now loud (`log.warn` naming the read + cancel kind) and named in `read_timings[]` (`phase:"optional"`, `cancelled:true`, `cancel_kind`) — the pre-existing `optional_query_failed` WARN check already reports the key from `results[key] === null` regardless of cause, so no compute.js change was needed for the audit-visible marker. `read_timings[]` entries for main reads now also carry `phase:"main"`. Extended `refresh-snapshot-recorder-bound.db.test.ts` (+3 tests): RED-FIRST (temporarily disabled the new statement-timeout SET, confirmed the test fails — `optional_failed` empty instead of `['slow_optional']`, took the full 3s `pg_sleep`; restored, GREEN), the inverse (fast optional read untouched), and a non-cancellation SQL error (still carries forward, no `cancel_kind`). All 5 `post/*.json` goldens recaptured a 3rd time (same calendar day, row_count stayed 32); assessment addendum extended citing the 3 new leaf fields (`phase`, `cancelled`, `cancel_kind`); `step-validate --step=refresh_snapshot` stayed at 16/17, unexplained-diffs 0.
- **R2 (Guardian, FAIL — closed):** `template-freeze.json` carried a leaked `FIXTURE-STALE` entry in `batching_prereq_snapshot` (test-fixture leakage, not traceable to a script run directly by this implementer). Regenerated via `node scripts/steps/_schema/generate-template-freeze.mjs` (no `--refresh` needed — `frozen_at`/`schema_sha256` were already correct from the Peel-2 RE-FREEZE #11; only the fixture needed clearing). `--check` now clean; diff against HEAD is 4 lines (`frozen_at` + `schema_sha256`, the 2 legitimate new schema fields), `batching_prereq_snapshot` back to its live value (0 open items). Run LAST, alone: `template-freeze.infra.test.ts` 33/33 green in isolation.
- **R3 (Guardian — closed):** the POST-PRE delta bound in `refresh_snapshot/violations.test.ts` tightened from `<=20` to `<=5`, with a comment stating the measured growth (+1 per Peel-2 recapture, +1 confirmed again by R1's 3rd recapture — same calendar day, no further growth) and what the bound guards (a genuine multi-row-per-snapshot_date regression, not the count of past recaptures). Same-day single-count invariant (`postCounts.size === 1`) untouched. 21/21 green.
- **R4 (orchestrator — closed):** the cloud seed command in `scripts/seeds/logic_variables.json`'s two new var descriptions was WRONG (`resolve-db.js` reads `DATABASE_URL` before `SUPABASE_DATABASE_URL`, so the bare form would have seeded LOCAL). Replaced both occurrences with the exact quoted `docs/runbook/README.md` §1a form (`SUPABASE_CA_CERT_PATH=scripts/certs/supabase-ca.pem PG_HOST= DATABASE_URL=$SUPABASE_DATABASE_URL node -r dotenv/config scripts/seeds/apply-logic-variables.js`) plus the Git-Bash-not-PowerShell note. `docs/reference/logic-variables-registry.md` regenerated to match. Did not touch `docs/runbook/README.md` itself (concurrent WF's file) — only quoted it.
- **O1 (optional, taken):** removed 2 dead `eslint-disable-next-line no-await-in-loop` comments in `check-chain-verdict.js` — confirmed via `npx eslint` ("Unused eslint-disable directive... no problems were reported") that the rule isn't enabled in this project's config, so the suppressions were pure noise.
- **O2 (optional, taken):** filed 4 rows in `docs/reports/review_followups.md` per the orchestrator's exact asks: (a) LOW — `startPhaseDeadline`'s fire-and-forget cancel dispatch (pre-existing, ENRICHER-shared, no equivalent row found so a new one was filed); (b) MED — Spec 07 OP4/O5 backup-SLA waiver, Supabase Layer-1 enabled-state unverified, operator to confirm; (c) LOW — `122_split_manifest.json` M06 move record's declared 90 vs measured 94 lines, flagged for the move tool's own boundary/hash arm (not independently re-derived); (d) LOW — cloud re-seed of `pipeline_schedules` via `scripts/seed-pipeline-schedules.js` needed for the admin panel to reflect cadence changes, operator action.

## Push-rejection fold 2026-09-18 — CORRECTION: the 2 assert_schema failures were NOT pre-existing

**Retracted claim.** Earlier reports on this WF3 (this implementer's own status updates) called the two `src/tests/steps/assert_schema/violations.test.ts` failures ("RULING R-D — declared_logic_variables_present" and "R-D generator — applyToText... byte-for-byte no-op") **pre-existing and unrelated**. That was WRONG and is retracted here. The pre-push full suite proved it: `config.probe_presence` expected `Array(146)` to deeply equal `Array(148)` — the delta is EXACTLY the 2 new logic variables this WF3's own Peel 2 added (`refresh_snapshot_read_statement_timeout_minutes`, `refresh_snapshot_phase_deadline_minutes`). RULING R-D makes `assert_schema` assert at chain start that every declared logic variable across the CONVERTED fleet has a `logic_variables` row, derived by `scripts/generate-assert-schema-probe-lists.js` from the live fleet — adding vars to ANY converted step's `config.logic_variables[]` (refresh_snapshot included) requires regenerating `assert-schema.descriptor.json`'s `config.probe_presence`/`checks[].expect` arrays, which this WF3 did not do at the time. The earlier claim was never independently re-verified against a commit that predates this WF3's own logic-var additions (4c14d82d, which passed this same suite) — an eager, unverified inference, not a grounded one. **Fix:** ran `node scripts/generate-assert-schema-probe-lists.js` (146→148, alphabetically sorted, both failing tests green), recaptured the 4 `docs/reports/golden/assert_schema/post/*.json` goldens (diff-class predicted Class A/B empty — `probe_presence` is consumed only as an internal SQL scope, never rendered into any audit row/records_meta — Class C non-empty (duration/git_head/fingerprint only); measured: prediction correct, diffs matched the `65c92d7f` precedent's own shape exactly), `step-validate --step=assert_schema` back to 16/17 hard-stop=false unexplained-diffs=0 (same score as before), full harvested suite 1164/1164 (was 1161/1161 — +3 from this WF3's own earlier new tests). The `[surface-registry] 1 descriptor(s) do not validate` line seen twice in the push log is expected RED-canary self-test output from `src/tests/surface-registry.infra.test.ts`'s two known-bad-fixture tests (each spawns `generate-surface-registry.mjs` against a deliberately invalid temp census row and asserts on the captured error text) — unrelated to this WF3, not touched.

**Status:** Implementation
**Domain Mode:** Backend/Pipeline (`scripts/`, `scripts/quality/`, `scripts/lib/step/`) — `scripts/CLAUDE.md` read.
**Workflow:** WF3 (Fix). House rule "one finding per WF3" honoured by splitting into **4 ordered, separately committable peels**.

---

## Context

* **Goal:** Restore `chain-deep-scrapes.yml` to a green scheduled cadence. The operator has ruled the scraped inspection data valuable and the chain must be **fixed now, not filed**. The workflow has been disabled since ~2026-09-16.
* **Target Spec:** `docs/specs/01-pipeline/118_deep_scrapes_execution_envelope.md` (owns the timing geometry, stop-mechanism hierarchy, failure taxonomy and diagnosis protocol — **the governing spec for every failure in this task**).
  * Chain content: `docs/specs/01-pipeline/44_chain_deep_scrapes.md` (system map `:44`).
  * `refresh_snapshot` owner: `docs/specs/01-pipeline/60_shared_steps.md` §3.
  * `assert_engine_health`: no single owner — `41`/`42`/`43`/`44` all SPEC-LINK it; conversion governed by `122_pipeline_step_optimization.md` §5.1/§1.10 + `124_step_standard_policy.md` Rules 1/2/3/10.
  * Verdict/masking guard: `docs/specs/01-pipeline/115_*` §2.4 (cited by the workflow's own error text).
* **Key Files:**
  * `scripts/lib/step/index.js` (`runRecorderPhase` :2208, `startPhaseDeadline` :2478)
  * `scripts/lib/compute/refresh-snapshot.js` (`buildReads`, 14 reads)
  * `scripts/refresh-snapshot.descriptor.json` (`execution.statement_timeout: "none"`)
  * `scripts/check-chain-verdict.js` (:587-589 catch-all)
  * `scripts/quality/assert-engine-health.descriptor.json` (already-fixed severity)
  * `scripts/manifest.json` (`refresh_snapshot.step_timeout_minutes: 15`)

> **Concurrency note:** another agent is editing Specs 115/122a/124, `docs/runbook/README.md`, the workflow cron strings and `.cursor/batch2_c5_active_task.md`. **None of those files are in this task's Target Files.** Re-enabling the workflow and any cron change belong to that agent / the operator (OA-5).

---

## 1. Premise Forensics — all 20 scheduled runs, all 11 failures

**Command (executed 2026-09-18):**
```
gh run list --workflow chain-deep-scrapes.yml --limit 40 \
  --json databaseId,event,conclusion,createdAt,headSha,status
```
Window 2026-08-19 → 2026-09-15 = **20 runs, 9 success / 11 failure** — the reported ratio reproduces exactly.

Per-run logs pulled with `gh run view <id> --log` (11 files) and classified with:
```
grep -a -oE "##\[error\].*" <log> | sed 's/\x1b\[[0-9;]*m//g' | sort -u
```

### 1.1 Failure classification — grouped by confirmed root cause

| # | Cause | Runs (databaseId) | headSha | Failing step | Exact metric / error |
|---|---|---|---|---|---|
| **A** | `assert_engine_health` declared `insp_update_insert_ratio` as a **FAIL** row → chain `completed_with_errors` → verdict red | `33789863987` (09-03), `33904007558` (09-04), `34153783928` (09-07), `34262197259` (09-08), `34388141063` (09-09), `34512168624` (09-10), `34631759033` (09-11), `34888609125` (09-14) — **8 runs** | `17058af7` (all 8) | `[6/7] assert_engine_health` (step itself exits 0; the **verdict check** reds) | `update_insert_ratio = 24.16` vs threshold `< 5.0`, `status: "FAIL"` |
| **B** | `refresh_snapshot` ran unbounded and silent, killed by the 15 m step ceiling | `35009108061` (09-15) — **1 run** | `11df7cb2` | `[4/7] refresh_snapshot` — chain `failed` | `Step timeout: node .../scripts/refresh-snapshot.js exceeded 15m ceiling (killed)` after `900.5s` |
| **C** | `aic-orchestrator.py` hit the cloud pooler's 2-min session `statement_timeout` | `32270233708` (08-19) — **1 run** | `52d0bc8e` (2026-08-15) | `[1/7] inspections` — chain `failed` after 144.8 s | `psycopg2.errors.QueryCanceled: canceling statement due to statement timeout` |
| **D** | `check-chain-verdict.js` treats a transient connection loss as a verdict red (no retry) | `32867150497` (08-25) — **1 run** | `c9dc21de` | `Verdict check — deep_scrapes` (the chain itself did **not** fail) | `DB check failed for chain_deep_scrapes: Connection terminated unexpectedly` |

**8 + 1 + 1 + 1 = 11.** Every failure is accounted for; no run is unclassified.

### 1.2 Cause A — evidence and disposition

Verbatim audit row from run `34888609125` (`PIPELINE_SUMMARY` → `records_meta.audit_table`):
```json
{"phase":6,"name":"Engine Health","verdict":"FAIL","rows":[
  {"metric":"dead_tuple_pct","value":"4.89%","threshold":"< 10%","status":"PASS"},
  {"metric":"update_insert_ratio","value":24.16,"threshold":"< 5.0","status":"FAIL"}, ...]}
```
The **same summary** reports `"checks_warned": 13, "checks_failed": 0` — the step's own check counters say zero failures while the audit table says FAIL. `permit_inspections` at `24.2x` also appears in `warnings[]`, i.e. the *identical* metric was a WARN in the fleet-wide sweep and a FAIL in the per-table audit row. The fleet sweep tolerates far worse by design: `parcels` measured **1,318,286.3x** and only WARNed.

**Disposition: ALREADY FIXED on `origin/main` — verify + lock, do not re-fix.**
The batch-1 I3 conversion re-derived this check as data. On `origin/main` today:
```
git show origin/main:scripts/quality/assert-engine-health.descriptor.json | grep -A6 '"insp_update_insert_ratio"'
  "limit": "value_max 5"
  "limit_from_config": "engine_health_insp_update_insert_fail_ratio"
  "severity": "WARN"
  "blocking": false
```
The descriptor's own `why` states the intent explicitly: *"Never blocking, same reasoning as insp_dead_tuple_pct above"*, and the file's `resolved[]` records *"AEH-D3's original finding (FAIL vs WARN for the identical predicate) is therefore RESOLVED by this commit."* Latest descriptor commit on main: `b3acc6d1` (batch1 I3 commit 8).

**Why the 8 runs still failed:** all 8 carry `headSha 17058af7` — GitHub Actions checks out the sha main pointed at, and main was stranded on that 2026-08-27 commit until the 09-15 fast-forward. The fix existed on the branch, not on main, for the entire failure streak. Confirmed reachable now:
```
git merge-base --is-ancestor b3acc6d1 origin/main   → YES   (also YES: 87ca9686, b69541b3, 1cb4e308, 11df7cb2)
```
**Independent confirmation the fix works in the cloud:** `origin/main` HEAD (`4c14d82d`) records chain-sources run `35204257602` with `assert_engine_health **WARN**` — no longer FAIL.

**Residual (not a defect):** `engine_health_insp_update_insert_fail_ratio` is still seeded at **5** (`scripts/seeds/logic_variables.json:5010`; `docs/reference/logic-variables-registry.md:107`, bounds 0–10000) against a measured 24.16, so the row will WARN indefinitely. `permit_inspections` is a re-scraped table — a high cumulative update/insert ratio is its steady state, i.e. **a real data condition the check is correctly reporting.** Raising the number is a threshold change → **OA-1**, not decided here.

### 1.3 Cause B — evidence and disposition (the only genuine, still-present code defect)

**Log (run `35009108061`):**
```
20:50:53.6  [4/7] refresh_snapshot — starting...
20:50:55.1  {"tag":"[refresh_snapshot]","msg":"target: refresh_snapshot (descriptor.database) → database=postgres user=postgres migrations=244 (floor 15)"}
            ← 15 minutes of ZERO output ←
21:05:54.1  {"level":"ERROR","tag":"[run-chain]","msg":"[4/7] refresh_snapshot — FAILED (900.5s)",
             "context":{"error":"Step timeout: ... exceeded 15m ceiling (killed)"}}
```

**Cloud ledger (read-only SELECT, runbook-sanctioned invocation `SUPABASE_CA_CERT_PATH=... PG_HOST= DATABASE_URL=$SUPABASE_DATABASE_URL`, `docs/runbook/README.md:94-97`):**
```sql
SELECT id,pipeline,status,started_at,completed_at,
       ROUND(EXTRACT(EPOCH FROM (COALESCE(completed_at,NOW())-started_at))) AS secs
FROM pipeline_runs WHERE pipeline LIKE '%refresh_snapshot%' AND started_at > '2026-09-01'
ORDER BY started_at DESC LIMIT 12;
```
| id | pipeline | status | secs |
|---|---|---|---|
| 4967 | `deep_scrapes:refresh_snapshot` | **failed** | **901** |
| 4812 | `coa:refresh_snapshot` | completed | 120 |
| 4766 | `permits:refresh_snapshot` | completed | 111 |
| 4738 | `coa:refresh_snapshot` | completed | 121 |
| 4710 | `permits:refresh_snapshot` | completed | 110 |
| 4663 | `deep_scrapes:refresh_snapshot` | completed | 113 |

**Healthy runtime is 110–121 s. The 09-15 run reached the 900 s ceiling — a ≥7.5× blowout.**

**Where it can block with no output** — `runRecorderPhase` (`scripts/lib/step/index.js:2208`) executes `compute.buildReads(config)`'s 14 reads **sequentially inside one `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`**, and:
1. **No statement timeout.** `scripts/refresh-snapshot.descriptor.json` declares `"statement_timeout": "none"`. Nothing bounds an individual read.
2. **No phase deadline.** `grep -n "startPhaseDeadline" scripts/lib/step/index.js` → armed only at `:3289` and `:3538` (the enrich/cascade phase loops). `runRecorderPhase` never calls it. This is precisely the exposure filed at `docs/reports/review_followups.md:20` (LOW, 2026-09-15): *"The per-statement/per-phase confusion is very likely generic… nothing checked whether any of them issues more than one statement per bound"* — disposition **DEFER — own WF5/WF2**, audit never done. **This WF3 closes it for the RECORDER runner.**
3. **No per-read telemetry.** The read loop contains zero `log` calls (only the *optional*-read catch at :2271 logs). A single slow read is indistinguishable from a hang, and after the SIGKILL there is no record of *which* read was slow.

**Root cause of the slowness (Spec 118 §1, a documented recurrence — not a new hypothesis).** Spec 118's 2026-08-14 incident row records `refresh_snapshot` going from **3 min → 64 min (3,843.7 s) on a quiet DB with zero contention**, because its stats query index-fetches `187,187 rows = 73% of permits` via `idx_permits_status` and *"the week's mass-UPDATE traffic … destroyed the heap's physical correlation with status order — same plan, same cost estimate, near-sequential I/O became fully random on a 1.6 GB relation."* Spec 118 explicitly **refutes** dead-tuple bloat, lock zombies, and plan flips for this signature.

The 09-15 ledger shows that precondition reproducing exactly, as a **cross-chain interaction**:
```sql
SELECT id,pipeline,status,started_at,completed_at,left(coalesce(error_message,''),60)
FROM pipeline_runs WHERE started_at>'2026-09-15 18:00' AND started_at<'2026-09-15 22:00' ORDER BY started_at;
```
| id | pipeline | status | window | note |
|---|---|---|---|---|
| 4939 | `permits:enrich_permits` | completed | 18:03:57 → 19:17:28 | **74 min of mass UPDATE on the permits heap** |
| 4952 | `permits:refresh_snapshot` | skipped | 19:17:30 | `chain time budget reached (146.2m >= 140m)` |
| 4954 | `permits:assert_engine_health` | skipped | 19:17:30 | **the estate's only VACUUM/ANALYZE owner — skipped** |
| 4967 | `deep_scrapes:refresh_snapshot` | **failed** | 20:50:53 → 21:05:55 | killed at the 15 m ceiling |

So: a 74-minute mass-UPDATE decorrelated the permits heap; the permits chain then blew its own 140 m budget and **skipped 16 steps including `assert_engine_health`**, the only step that VACUUM/ANALYZEs (`review_followups.md:3567` — *"The estate's only VACUUM owner runs at the chain TAIL"*); 93 minutes later `deep_scrapes:refresh_snapshot` read that un-ANALYZEd heap with no statement timeout and no telemetry, and rode to the axe.

**Lock contention is REFUTED for this run** — the ledger shows no other `refresh_snapshot` (advisory lock 40) and no other pipeline row `running` in the 20:50–21:05 window. *Unverifiable residual:* the admin dual-path `POST /api/quality/refresh` → `captureDataQualitySnapshot()` acquires **no advisory lock at all** (`review_followups.md:110`, HIGH, still OPEN) and would not appear in `pipeline_runs`, so a human "Refresh Now" click cannot be excluded from the evidence. Named, not claimed.

**Disposition: genuine code defect, still present on `origin/main`. Peel 2 fixes it.** Note `87ca9686` (phase deadline) and `b69541b3` (finite-or-throw timeout resolution) are both on main but **cover the enrich/cascade phases only — neither reaches `runRecorderPhase`.**

### 1.4 Cause C — evidence and disposition

```
2026-08-19T15:31:46Z  psycopg2.errors.QueryCanceled: canceling statement due to statement timeout
                      [1/7] inspections — FAILED (144.8s)  (144.8 s ≈ the pooler's 2-min cap + overhead)
```
This is the class in `tasks/lessons.md:82`: *"the cloud session default `statement_timeout` is **2min** (cluster default, no role setting)… Only a session-level `SET` on the established connection sticks."*

**Disposition: ALREADY FIXED on `origin/main`, and already locked.**
`scripts/aic-orchestrator.py` now carries `_statement_timeout_ms()` (:147) and a connect-then-`SET statement_timeout` factory (:179-213, docstring cites Spec 47 §5.1). Introduced by **`1cb4e308`** *"fix(47_pipeline_script_protocol): P0 - python connection factories lift the 2min cloud statement cap"*, dated **2026-08-19** — i.e. it landed the same day but **after** the 15:28Z run, which checked out `52d0bc8e` (2026-08-15). `git merge-base --is-ancestor 1cb4e308 origin/main` → **YES**.
Regression lock already exists: `scripts/tests/test_pg_statement_timeout.py`, parametrised `BOTH = ['orchestrator','scraper']`, cases `test_L1_control_the_hostile_default_is_genuinely_in_effect`, `test_L1_L2_factory_lifts_the_hostile_cap`, `test_L4_configured_value_reaches_the_session`, `test_L8_empty_string_env_is_unset_end_to_end`. **No new code and no new test required — Peel 4 is verification-only.**

### 1.5 Cause D — evidence and disposition

The chain itself was healthy; only the verdict checker failed. `scripts/check-chain-verdict.js:587-589`:
```js
} catch (err) {
  console.error(`::error title=Chain verdict check::DB check failed for ${chainSlug}: ${err.message}`);
  process.exitCode = 1;
}
```
A single catch-all turns **any** DB-side error — including a transient `Connection terminated unexpectedly` from the Supavisor pooler — into a red build indistinguishable from a genuine verdict FAIL. There is no retry (`grep -n "retry" scripts/check-chain-verdict.js` → no hits).

**Disposition: genuine defect, small, still present. Peel 3.** Infrastructure *triggered* it, but the defect is that a read-only observability check has no resilience and mislabels infrastructure as a data verdict.

### 1.6 Signal seen but NOT peeled (recorded, not silently dropped)

Run `35009108061` also emitted:
```
##[warning] chain_deep_scrapes:classify_inspection_status duration 9.6 min is 9.6x the trailing median 0.2 min (n=6)
           — creeping: the step completed and wrote its own duration — real growth, not a timeout kill
```
Ledger confirms: row 4965, 20:41:13 → 20:50:50 = **577 s**. This did not cause any of the 11 failures and the trend tripwire is already working as designed (exactly the instrument Spec 118 §1's "meta-failure" paragraph says was missing). **Filed as OA-6, not fixed here** — fixing it inside this WF3 would violate "prefer the simplest close".

---

## 2. Technical Implementation

* **New/Modified Components:** none (no UI).
* **Data Hooks/Libs:**
  * `scripts/lib/step/index.js` — `runRecorderPhase` read loop (Peel 2)
  * `scripts/refresh-snapshot.descriptor.json` — `execution.statement_timeout` + `config.logic_variables[]` (Peel 2)
  * `scripts/seeds/logic_variables.json` + regenerated `docs/reference/logic-variables-registry.md` (Peel 2)
  * `scripts/check-chain-verdict.js` — bounded retry (Peel 3)
  * `scripts/quality/assert-engine-health.descriptor.json` — **read-only**, locked not modified (Peel 1)
* **Database Impact:** **NO.** No migration. No schema change. No backfill. All DB access in this task is read-only `SELECT` against `pipeline_runs` for evidence, plus the existing `data_quality_snapshots` upsert which is unchanged.

---

## 3. Standards Compliance

* **Try-Catch Boundary:** no API routes touched. Peel 3 narrows an existing catch-all into `classifyVerdictError(err)` → `{transient|fatal}`; the fatal arm keeps today's exact message and exit code. Peel 2's new per-read timing wrapper must not swallow — the read's own error propagates unchanged after the timing line is logged.
* **Unhappy Path Tests:** per peel — a read that exceeds the statement timeout; a deadline that fires mid-phase; a deadline that does **not** fire on a fast read; two transient connection errors then success; a genuine verdict FAIL that must still red on the first attempt (retry must not mask it); an unset/NaN logic var (finite-or-throw, per `b69541b3`'s precedent).
* **logError Mandate:** N/A for `scripts/` — Spec 47 mandates `pipeline.log.warn/error` / `ctx.log`, which every new branch here uses. No empty catches (ESLint `no-empty`), no `process.exit()`.
* **UI Layout:** N/A.

---

## 4. Execution Plan — ordered peels

> Each peel is its own commit with its own premise evidence, its own regression lock **proven red before green**, and its own Spec 05 §5 severity footer. Peels are ordered so the cheap verifications land first and the chain's re-enable risk is retired last.

### Peel 1 — Lock the already-landed `assert_engine_health` severity fix (cause A, 8 runs) · size **S**
*Premise:* §1.2. Fix is on main; **nothing to fix, everything to lock.** Without a lock, a future descriptor edit can silently re-red 8 runs' worth of cadence.
- [ ] 1.1 Re-verify on a clean `origin/main` checkout that `insp_update_insert_ratio` is `severity: "WARN"`, `blocking: false`, and that **no** check with `chains: ["deep_scrapes"]` declares `severity: "FAIL"`.
- [ ] 1.2 Extend `src/tests/steps/assert_engine_health/violations.test.ts` with a regression lock asserting both. **RED FIRST:** flip the descriptor to `"FAIL"` locally, run the test, capture the failure output in the commit body, revert.
- [ ] 1.3 Assert the second half of the contradiction too: the audit-table verdict must be **row-derived** (Spec 124 Rule 10) and must agree with `checks_failed` — a `verdict:"FAIL"` alongside `checks_failed: 0` is the exact shape observed in the 8 runs and must be unrepresentable.
- [ ] 1.4 `npx vitest related src/tests/steps/assert_engine_health/violations.test.ts --run`.
- *Severity:* **HIGH** (8 scheduled failures). *Lesson-routing:* `test` (the lock) + `spec:118` §1 incident ledger row.

### Peel 2 — `refresh_snapshot`'s RECORDER read phase is unbounded and silent (cause B, 1 run) · size **M** ← the real fix
*Premise:* §1.3. Closes `review_followups.md:20` for `runRecorderPhase`. **One finding**: "a RECORDER's read phase can block with no bound and no trace." The three changes below are that one finding's bound, its trace, and its proof.
- [ ] 2.1 **Trace.** In `runRecorderPhase`'s `reads.main` loop, log one INFO line per read: `key`, elapsed ms, row count. Carry the same data into `records_meta.read_timings[]` so the audit row survives the process. Zero behaviour change on the happy path.
- [ ] 2.2 **Bound (statement).** Replace `execution.statement_timeout: "none"` with a value sourced from a new admin logic variable (Spec 124 Rule 3 — **all tunables externalized**; never a literal). Resolution must be **finite-or-throw**, reusing `b69541b3`'s precedent so a missing var can never become `NaN`/unbounded. **The VALUE is OA-2 — do not pick it here.**
- [ ] 2.3 **Bound (phase).** Arm `startPhaseDeadline(...)` in `runRecorderPhase` with the same re-arm semantics and loud FAIL audit row `87ca9686` established for the enrich phases, so the *phase* is bounded and not merely each statement. Emit a named audit row identifying **which read** was in flight when the deadline fired.
- [ ] 2.4 **RED FIRST**, both directions, in `src/tests/steps/refresh_snapshot/violations.test.ts`: (a) a read that exceeds the bound is cancelled and produces a loud, named audit row — proven red before 2.2/2.3 land; (b) a fast read does **not** trip the deadline (a bound below real runtime turning healthy runs red is the failure mode `review_followups.md:13` warns about); (c) `read_timings[]` names every one of the 14 reads.
- [ ] 2.5 Unhappy paths: logic var unset → throws, not unbounded; logic var non-numeric → throws; deadline fires between reads; read error still propagates unchanged after the timing line.
- [ ] 2.6 Confirm no sibling regression: `refresh_snapshot` is shared by **all four** chains (`permits`/`coa`/`sources`/`deep_scrapes`) — the descriptor's `invocation` block lists all four. Run `npx vitest related` on the step's full test surface plus `src/tests/deep-scrapes-workflow.infra.test.ts`.
- [ ] 2.7 Do **not** touch `assert-engine-health.js` / `run-chain.js` VACUUM placement — explicitly out of scope per the standing operator steer recorded at `review_followups.md:3567`. Routed to OA-4.
- *Severity:* **HIGH**. *Lesson-routing:* `test` + `spec:118` §3 (layer 3 "per-step ceilings" is now genuinely armed for this runner) + `lessons` (the generalisation: *a step whose only bound is the platform axe has no bound — and a step with no per-unit telemetry cannot be diagnosed after the axe falls*).

### Peel 3 — verdict checker must not red on a transient connection loss (cause D, 1 run) · size **S**
*Premise:* §1.5. A healthy chain was reported red by its own observability step.
- [ ] 3.1 Add `classifyVerdictError(err)` distinguishing transient connection faults (`Connection terminated unexpectedly`, `ECONNRESET`, `ETIMEDOUT`) from every other error.
- [ ] 3.2 Bounded retry — 3 attempts, exponential backoff — around the **read only**. The verdict computation itself is untouched.
- [ ] 3.3 On final exhaustion, red with a message that says *transient DB connectivity*, clearly distinct from a verdict FAIL, so the taxonomy in Spec 118 §4 stays readable.
- [ ] 3.4 **RED FIRST**: stubbed pool throws twice then succeeds → must pass; throws 3× → must red with the transient message; **a genuine verdict FAIL must red on attempt 1 and never be retried** (the anti-masking lock — retry must not become a new Spec 115 §2.4 masking path).
- *Severity:* **MED**. *Lesson-routing:* `test`.

### Peel 4 — verification-only closure of the python statement-timeout cap (cause C, 1 run) · size **XS, no code**
*Premise:* §1.4. Fixed by `1cb4e308`, on main, already locked by `scripts/tests/test_pg_statement_timeout.py`.
- [ ] 4.1 Run `npm run test:py` and record that L1/L2/L4/L8 pass for `modname='orchestrator'`.
- [ ] 4.2 **No commit of its own** unless 4.1 fails. If it passes, this peel's only artifact is the evidence line in Peel 1's commit body. *Simplest close.*
- *Severity:* N/A (already fixed).

### Peel 5 — Gate: full verification before the chain is re-enabled · size **S**
- [ ] 5.1 `node scripts/ai-env-check.mjs`
- [ ] 5.2 `npm run typecheck && npm run lint`
- [ ] 5.3 `npm run test` (full, `VITEST_MIN_FORKS=1 VITEST_MAX_FORKS=2` per CLAUDE.md PD #5)
- [ ] 5.4 `BUILDO_TEST_DB=1 npm run test:db`
- [ ] 5.5 `npm run test:py`
- [ ] 5.6 `npm run system-map` if any spec/target-file set changed.

---

## 5. Operator Asks — thresholds and policy (NOT decided by this plan)

| # | Ask | Evidence | Why it is an Ask |
|---|---|---|---|
| **OA-1** | Raise `engine_health_insp_update_insert_fail_ratio` (seeded **5**) or accept a permanent WARN on `permit_inspections`? | measured `24.16`; fleet sweep tolerates `parcels` at `1,318,286x`; `permit_inspections` is a re-scraped table so a high cumulative ratio is its steady state | Threshold change. Spec 30 §5.4.1 threshold rule + Spec 118 §3 sizing rule. |
| **OA-2** | What value for `refresh_snapshot`'s new statement-timeout logic var? | healthy 110–121 s; pathological 3,844 s (Spec 118 §1); step ceiling 15 m | A ceiling below real runtime converts healthy runs into failures (`review_followups.md:13`). Must be > the honest p99 and < the 15 m axe. |
| **OA-3** | Keep `refresh_snapshot.step_timeout_minutes = 15`? | it fired correctly as a **backstop** on 09-15 | Spec 118 §3's design rule: *"the platform axe is the BACKSTOP, never the mechanism."* Peel 2 supplies the mechanism; the backstop's value is still the operator's. |
| **OA-4** | Cross-chain: the permits chain skipping `assert_engine_health` (the estate's **only** VACUUM/ANALYZE owner) under its 140 m budget leaves the permits heap un-ANALYZEd for other chains | ledger rows 4939/4952/4954 vs 4967; `review_followups.md:3567` | Policy + an explicit standing operator steer to keep this out of scope. Own WF2. |
| **OA-5** | Set `CHAIN_TIME_BUDGET_MINUTES` for `deep_scrapes`, and re-enable the workflow | Spec 118 §3 layer 2: *"**NOT SET for deep_scrapes** (coa=120/permits=150 have it)"* — an open, documented GAP | Cron/workflow files are owned by the concurrent agent; re-enabling is the operator's call. |
| **OA-6** | `classify_inspection_status` creep: 9.6 min vs 0.2 min trailing median (n=6) | §1.6, ledger row 4965 = 577 s | Not a cause of any of the 11 failures; own WF3. |

---

## 6. Review Roster (lean WF3, trimmed-roster ruling)

Per the 2026-09-16 trimmed-panel ruling and CLAUDE.md's WF3 line:

**PLAN altitude (premise-verifiers, before code):**
1. **Integration** (`general-purpose`, **main tree, no worktree**) — verify the peel plan against the live tree: that `runRecorderPhase` really is the path `refresh_snapshot` takes, that `startPhaseDeadline`'s signature supports this arming, that the 4 chains sharing `refresh_snapshot` are all covered, that `b69301`-style finite-or-throw resolution is reusable as claimed.
2. **Independent reviewer** (`code-reviewer-grounded`, worktree) — adjudicate the premise of each of the 4 causes by re-executing the commands in §1 rather than trusting them.

**OUTPUT altitude (on the diff):**
3. **Independent reviewer** (`code-reviewer-grounded`).
4. **Regression Guardian** (`regression-guardian`, **main tree** — needs full `git log`/`blame` + the uncommitted diff). Mandatory: Peels 2 and 3 both **modify existing code**. Fences to state explicitly — why `statement_timeout: "none"` was declared in the first place; why the recorder read loop was authored silent; why `check-chain-verdict.js` used one catch-all; and the `REPEATABLE READ READ ONLY` + `SET enable_indexscan = off` GUC bracket at `scripts/lib/compute/refresh-snapshot.js:203`, which is a **load-bearing WF3-F1 mitigation for this exact pathology** and must survive Peel 2 untouched.

**Reality-Check: NOT triggered.** No enriched or derived parcel/data field is added or changed — this task adds telemetry, a timeout and a retry. Per CLAUDE.md the seat fires only when a diff adds/changes an enriched/derived field.

**DeepSeek / Gemini: not run** (trimmed-roster ruling — no CLI adversaries on compressed WF3 peels).

---

## 7. Cloud Verification (orchestrator requests · **operator approves**)

After the peels land on `main`, **one** manual verification run:

```
gh workflow run chain-deep-scrapes.yml --ref <fix-commit-sha>
```

Binding conditions:
1. **Operator approval required.** The orchestrator requests; it does not dispatch. The workflow is currently disabled — re-enabling is OA-5.
2. **Pinned to the fix commit**, never to a floating `main`. The 8-run cause-A streak is the proof: a scheduled run executes whatever sha `main` points at, and a stranded `main` ran 2026-08-27 code for 12 days.
3. **Must not overlap a `chain-sources` or `coa-permits` run.** Evidence, not caution: §1.3 shows `permits:enrich_permits` decorrelating the shared permits heap and the permits chain then skipping its own VACUUM owner, which is the precondition for the `refresh_snapshot` blowout. The shared steps also skip on advisory-lock contention, which would make a green run meaningless. Check `gh run list --workflow chain-sources.yml --limit 3` and `--workflow coa-permits.yml` for in-flight runs first, and confirm the ledger is clear:
   ```sql
   SELECT id,pipeline,status,started_at FROM pipeline_runs WHERE status='running' ORDER BY started_at;
   ```
4. **Acceptance criteria:** chain row `completed` or `completed_with_warnings`; `assert_engine_health` verdict **WARN** (not FAIL) with `update_insert_ratio` present as a WARN row; `refresh_snapshot` **completed** with `records_meta.read_timings[]` populated for all 14 reads and total duration in the 110–121 s band; verdict step green.
5. **If `refresh_snapshot` trips its new bound:** that is a *successful* diagnosis, not a regression — `read_timings[]` will name the slow read for the first time. Route the value to OA-2, do not widen the bound reflexively.

---

**PLAN LOCKED. Do you authorize this WF3 (Fix) plan? (y/n)**
> §11 note: cause A and cause C are dispositioned **verify-and-lock**, not re-fix — both are already on `origin/main` and re-fixing either would be a Chesterton's-Fence violation against commits `b3acc6d1` and `1cb4e308`. All six threshold/policy decisions are routed to Operator Asks rather than chosen in-plan.
