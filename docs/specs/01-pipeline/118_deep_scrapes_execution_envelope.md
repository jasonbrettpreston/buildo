# Spec 118 — Deep-Scrapes Execution Envelope & Failure-Diagnosis Process

**Status:** ACTIVE (authored 2026-08-14 from the live incident dossier, operator-directed).
**Owns:** the timing geometry, stop-mechanism hierarchy, failure taxonomy, diagnosis protocol, and recovery procedures for the `deep_scrapes` chain's execution envelope. Chain *content* (steps, scraper behavior, data rules) stays with Spec 44; scheduling/watchdog architecture stays with Spec 115 — this spec owns how they COMPOSE and how they fail.

---

## 1. Why this spec exists — the 2026-08 incident ledger

Three consecutive daily failures (2026-08-12/13/14), **three distinct causes**, all terminating in the same symptom (GH step timeout at 150 min, chain row orphaned `running`, verdict red, watchdog red the following morning). Every cause and its proof:

| Date | Proximate cause | Root cause | Proof |
|---|---|---|---|
| 08-12 | Step timeout at 150 min; scraper used 140 of it, tail had 10 min for 6 steps | Envelope tail (−10) sized in the 3×-daily era; cadence moved to 1×/weekday (`2fa3b2e7`) and each run's queue grew — run totals crept to 145–151 min, straddling the axe. The "slots are 3h apart" comment justifying 150 was stale. | Mon/Tue green runs finished 2h25–2h26 (under by 3–4 min); Wed scraper hit its 140 budget, post-steps ran past +10 |
| 08-13 | Identical | The tail fix (`20fa17f2`, −10 → −35) reached main 68 min AFTER the 15:57Z trigger; workflow files are read at trigger time | Run started 15:57Z, fix on main 17:05Z |
| 08-14 | Step timeout again — **with the fixed 35-min tail** | `refresh_snapshot` (historical duration: **3 min**) now runs **64 min** (measured on a quiet DB, zero contention: 3,843.7s). Its stats query index-fetches **187,187 rows = 73% of permits** via `idx_permits_status`; the week's mass-UPDATE traffic (C3 clears + `last_seen_at` bumps, C6 lead_id repairs, C7, the loader's daily every-row touch, all relocating rows under the unscoped mig-115 `updated_at` trigger) **destroyed the heap's physical correlation with status order** — same plan, same cost estimate, near-sequential I/O became fully random on a 1.6 GB relation | `EXPLAIN`: Index Scan on `idx_permits_status`, rows=187,187, then Sort + Merge Join; `pg_stat_activity` during the manual run: `IO:DataFileRead`, no lock waits; `n_dead_tup` = 2,310 (bloat REFUTED — this is correlation, not dead tuples) |

**Refuted hypotheses (recorded so they are not re-litigated):** dead-tuple bloat (vacuumed, ratio 0.01) · lock zombies from prior SIGKILLs (no >45-min backends present; the lessons-`:34` class was checked first and cleared) · plan flip after the 13:12Z auto-ANALYZE (the plan is unchanged — the HEAP changed under it) · scraper misbehavior (every run's scraper telemetry was healthy: 08-14 = 447 scraped, 0 session failures, verdict PASS, budget honored at 116.0 vs 115).

**The meta-failure (owned, routed into Spec 08 §11):** the envelope was re-sized against a *historical* tail baseline during the same week the orchestrated work was invalidating that baseline. Two workstreams touching one physical resource (the permits heap) were verified independently and never cross-read. No instrument watched step-duration trends — a trend tripwire would have flagged 3→30 min on 08-12, before failures two and three.

---

## 2. Timing geometry (all times UTC; current as of 2026-08-14)

```
15:00        cron expression fires (0 15 * * 1-5)
15:49–15:57  GH actually starts the run (observed jitter)
~15:50       scraper begins; soft budget = step_timeout − 35 = 115 min
~17:45       scraper self-stops (claims halt, in-flight finishes, clean exit 0)
~17:46–18:20 tail: classify_inspection_status → assert_network_health →
             refresh_snapshot → assert_data_bounds → assert_engine_health →
             assert_staleness  (7 steps total incl. the scraper)
18:19        STEP timeout (150 min) — the axe, if the tail overruns
~18:39       JOB timeout (170 min) — the outer backstop
16:13–16:23 (next day)  pipeline-watchdog checks a 30h freshness window
```

**The two-red geometry (structural, not a defect of the day):** the watchdog fires ~25 min AFTER the day's slot *starts* but ~2h before it *completes*. Any single-day failure therefore produces TWO reds: the failure itself, and the next morning's watchdog (newest *completed* run is still ≥30h old while the recovery run is mid-flight). A recovered day reads red-then-green. **Filed fix: shift the watchdog cron to ~18:45Z** so a recovered day reads green same-day (`review_followups.md`, 2026-08-14 — the same `lessons:100` cadence-coupling class as the envelope itself).

---

## 3. The stop-mechanism hierarchy (the design rule: the platform axe is the BACKSTOP, never the mechanism — `d6eb9f31`)

| Layer | Knob | Current value | What it protects | Status |
|---|---|---|---|---|
| 1. Scraper soft budget | `SCRAPER_TIME_BUDGET_MINUTES = step_timeout − 35` (`chain-deep-scrapes.yml` run block) | 115 | The scraper stops claiming, finishes in-flight, finalizes clean (queue rows terminal, ledger written, exit 0) | LIVE; subtrahend ≥ 25 locked by `deep-scrapes-workflow.infra.test.ts` (red-first, proven both directions) |
| 2. Chain soft budget | `CHAIN_TIME_BUDGET_MINUTES` (Spec 115 §2.2; run-chain checks BEFORE each step, marks remainder `skipped-budget`, ends `completed_with_warnings`) | **NOT SET for deep_scrapes** (coa=120/permits=150 have it) | Any SLOW-but-finite tail step | **GAP — but note the limit: the check is per-step-boundary; it cannot preempt a step already running.** A 64-min `refresh_snapshot` starting at min 121 still rides to the axe. Useful, not sufficient |
| 3. Per-step ceilings | (planned — the open WF3) | none | A HUNG or pathological single step | **GAP — the missing layer this week proved necessary** |
| 4. GH step timeout | `chain_timeout_minutes` input, default 150 | 150 | Everything above failing | Backstop (comment corrected: sized by runner economics, not slot spacing) |
| 5. GH job timeout | `timeout-minutes` | 170 | Setup + step + verdict | Backstop |

**Sizing rule (binding):** any change to a layer's constant must cite `git log -L` on the line it changes and re-derive the layers BELOW it (Spec 30 §5.4.1's threshold rule, applied to time). Any cadence change re-derives ALL layers plus the watchdog windows in the same commit (`lessons:100`).

---

## 4. Failure taxonomy — what each terminal state means and what to do

| Symptom | Meaning | Response |
|---|---|---|
| Job red, chain row `completed_with_errors` | C1-class: a step's audit verdict FAILed but the chain FINISHED (all steps ran) | Data-quality signal, not an outage. Read the verdict step's output for the failing metric. Watchdog is satisfied |
| Job red, chain row orphaned `running`, "timed out after N minutes" | The axe fell mid-step | §5 diagnosis, then §6 recovery. The row must be terminalized manually (the SIGTERM handler does not survive SIGKILL — standing residual, `review_followups`) |
| Watchdog red "No completed run within 30h" | Absence detection | Check whether today's slot is in-flight (the two-red geometry, §2) before treating as new |
| Verdict red `status=running not in green allowlist` | The verdict step ran while/after the chain died — correct fail-loud behavior (Spec 115 §2.4 masking guard) | Same as the axe row above |
| Chain row `deferred_to_full` (post-B2) | A gated step's pre-transaction scope count exceeded its threshold; clean stop at a step boundary | Expected occasionally; 2 consecutive on one step ⇒ verdict reds with "supervised force-full required" (Spec 40 §3.1.2) |

---

## 5. Diagnosis protocol (the exact sequence that solved 08-14; execute in order, stop when decisive)

Grounding rules apply throughout (Spec 08 §11.1): print the host + `SELECT current_database()` before trusting any result; `SET statement_timeout='300s'` on ad-hoc pooler sessions (default is 2 min and permits scans exceed it); the pipeline's own pools run unlimited — the two environments time out differently.

1. **Which layer fired?** `gh run view <id> --log-failed | grep -E "##\[error\]|timed out"` — step vs job timeout vs verdict-only.
2. **Where did the time go?** Grep the run log for the last `PIPELINE_SUMMARY` timestamp and the `[N/7] <step> — starting...` markers. The step that STARTED but never emitted is the eater.
3. **Is the eater new?** Duration history: `SELECT started_at::date, ROUND(EXTRACT(epoch FROM completed_at-started_at)/60) AS mins, status FROM pipeline_runs WHERE pipeline='deep_scrapes:<step>' ORDER BY started_at DESC LIMIT 7`. Orphaned `running` rows here mean the axe fell IN this step on those days too.
4. **Slow or blocked?** While reproducing (or during a live run): `SELECT pid, state, wait_event_type, wait_event, query_start, LEFT(query,110) FROM pg_stat_activity WHERE state <> 'idle'`. `Lock:*` waits → lock analysis (`pg_blocking_pids()`, the `lessons:34` zombie class). `IO:DataFileRead` on an `active` query → genuinely grinding; go to 5. `idle in transaction` on the advisory-lock connection is NORMAL (xact-scoped lock holder) — do not chase it.
5. **Why is the query slow?** `EXPLAIN` (never ANALYZE on prod first) the exact statement from `pg_stat_activity`. Read the row estimate vs table size: an index scan fetching a large fraction of the table is a correlation/locality question, not an index question. Check `pg_stat_user_tables` (`n_dead_tup`, `last_autovacuum`) to rule bloat in/out — and remember vacuum reclaims tuples, never file size or row placement.
6. **What changed the physical layout?** This week's write traffic: any mass UPDATE relocates rows (the unscoped mig-115 `updated_at` trigger guarantees a rewrite per touched row). Correlate the regression's start date (from step 3) with the write-history (`git log --oneline --since=<date>` on the writers + the ops record).
7. **Establish last-known-good from DATA, not the spec** (`lessons:93`): the three ground-truth questions before any fix hypothesis.

---

## 6. Recovery procedures

**6.1 Terminalize orphaned chain rows** (required after every axe; nothing else clears them):
```sql
UPDATE pipeline_runs SET status='failed', completed_at=NOW(),
  error_message=COALESCE(error_message,'') || ' [terminalized <date>: <cause>]'
WHERE pipeline='chain_deep_scrapes' AND status='running'
  AND started_at < NOW() - INTERVAL '2 hours' RETURNING id;
```
Run read-only first without the UPDATE to see the rows. Step-level orphans (`deep_scrapes:<step>`) terminalize the same way.

**6.2 Manual `refresh_snapshot`** (recovers MV staleness after axed runs):
```
PG_HOST= node -r dotenv/config scripts/refresh-snapshot.js
```
⚠ TARGET-DB: same class as the C3 backfill gotcha (`lessons:83`; runbook §2) — a bare `node` invocation hits the LOCAL Docker DB via `createPool()`'s localhost default. The `-r dotenv/config` + empty `PG_HOST` form is the cloud invocation. Expect the CURRENT pathological duration (§1) until the query/heap fix lands — budget an hour, run it detached.

**6.3 The scraper needs no recovery** — its soft budget finalizes cleanly (queue terminal, ledger written); `stale_claims_reclaimed` handles the rare mid-flight claim. Scraped data from axed runs IS committed (the step completed before the tail died).

---

## 7. Open engineering items (the WF3 scope, dossier-complete, awaiting execution)

1. **The `refresh_snapshot` stats query** must not index-fetch 73% of permits: rewrite toward a seq-scan-friendly shape or split per-status aggregates; alternatively restore physical correlation on a maintenance window (`CLUSTER`/repack) — but the QUERY fix is durable, the heap fix decays again under write traffic.
2. **Layer 3: per-step ceilings in run-chain** (statement_timeout or spawn-timeout per step, manifest-configurable) — the missing hierarchy layer; a pathological step must die in minutes at run-chain's hands, not at the platform's.
3. **Step-duration trend tripwire** — an audit row comparing each step's duration to its trailing median; WARN at ×3, FAIL at ×10. This is the instrument whose absence cost two of the three failure days.
4. **Layer 2 for deep_scrapes**: set `CHAIN_TIME_BUDGET_MINUTES` (140) — useful boundary-stop coverage even though it cannot preempt mid-step.
5. **Watchdog cron shift** to ~18:45Z (§2, the two-red geometry).
6. **`early_abort=true` on 08-14's scraper telemetry** — fired alongside the budget stop; the abort path's connection/commit hygiene was flagged in the C2-era filings and never audited. Verify it cannot leave idle-in-transaction backends.
7. **Interim operational decision** (operator, pending as of authoring): temporarily remove `refresh_snapshot` from the deep_scrapes manifest until item 1 lands (recommended — the MV was manually refreshed 2026-08-14; staleness cost is bounded and visible) vs. a scoped planner override vs. accept daily failure.

---

## 8. Standing rules this spec binds (cross-refs)

* The platform timeout is the backstop, never the mechanism (`lessons:99`; every layer above it must exist and be sized).
* Freshness windows, watchdog crons, and every envelope layer are COUPLED to cadence — one commit moves them together (`lessons:100`).
* Concurrent workstreams that touch shared physical resources (the permits heap being the proven case) are cross-read like folds: any WF that mass-rewrites a table re-derives the duration assumptions of every reader-chain step that scans it (Spec 08 §11, the 2026-08-14 addition this incident forced).
* A count of orphaned `running` rows in `pipeline_runs` is an INCIDENT INDEX — each one is an axe that fell; they are terminalized with a cause annotation, never deleted.

## 9. The learnings, generalized — adapting this process to different issue classes

The §5 protocol is a specialization of one transferable skeleton. The skeleton, then the adaptation map:

**The skeleton (issue-agnostic):**
1. **Which layer spoke?** Identify the REPORTING mechanism before the failing one — an axe, a verdict, a watchdog, and a data gate are four different reporters with four different blind spots.
2. **Account for the resource, don't characterize the symptom.** Time, rows, bytes, locks — find where the budget actually went from timestamps/counts, never from the error message (the error names the reporter, not the cause).
3. **Is it NEW?** Trend the metric before diagnosing the instance (`pipeline_runs` durations, audit-row histories, drift counts). A step that "failed" at its historical value is a sizing problem; one at 10× is a pathology. **Two of this week's three failure-days were spent because nobody trended.**
4. **Slow vs blocked vs wrong** — three different investigations: `wait_event` distinguishes the first two in one query; predicted-vs-observed values distinguish the third.
5. **What changed the SUBSTRATE?** When behavior regresses without a code change to the failing component, something changed underneath it (data volume, physical layout, statistics, cadence, environment). Correlate the regression's start date with the WRITE/CHANGE history of everything the component reads.
6. **Last-known-good from data** (`lessons:93`): output-table timestamps and git history, never the spec's intent, decide regression-vs-never-worked.

**Adaptation map — the same skeleton, per issue class:**

| Issue class | The class's signature | Which skeleton steps carry the weight | The class-specific trap |
|---|---|---|---|
| **Timeout/envelope** (this spec's incidents) | A platform kill; the component itself healthy | 2 (time accounting) + 3 (duration trend) + 5 (substrate: cadence, queue depth, heap layout) | Fixing the CONSTANT instead of adding the missing hierarchy layer; sizing against a baseline your own work is invalidating |
| **Data drift/smear** (the C2/C3/C7 arc) | A count grows; every writer looks correct | 3 (accretion trend) + 5 (find the writer census — grep ALL of `src/`+`scripts/`, the fourth writer was outside the first grep) + 6 | Count-as-inference: a true count with a false story survives review rounds; SELECT the rows and read their other columns (`lessons:111`) |
| **Silent green / false PASS** (the C4 arc) | Nothing red, work not done | 1 (the reporter's blind spot IS the finding) + 4 (wrong, not slow) | "I could not check" rendered as PASS/0/SKIP — audit the checker's failure paths, not the checked data (Spec 30 §5.4.1 criterion 1) |
| **Lock/zombie contention** (`lessons:34`) | Intermittent, environment-scoped, disappears when observed | 4 (`wait_event`, `pg_blocking_pids`) + 2 | The client's death is not the query's death; `idle in transaction` on an advisory-lock holder is NORMAL — know the by-design holders before hunting |
| **False red / observer geometry** (the two-red watchdog) | Red with healthy underlying work | 1 + the OBSERVER's clock vs the OBSERVED's schedule | Fixing the observed when the observer's timing is the defect; every absence-checker has a window sized to some cadence — re-derive on every cadence change (`lessons:100`) |
| **Contract drift** (slug-vs-timestamp, spec-vs-code) | Two artifacts, each internally coherent, disagreeing | 6 + execute BOTH sides' claims (Spec 08 §11.1) | The freshly-written document is not more authoritative than the freshly-written code — whichever was DERIVED from the ruling wins; cite the ruling |

**The meta-learnings this week burned in (each with its incident):**
* **Fix mechanisms, not constants.** Two constant-patches failed before the hierarchy gap was named (§3 layers 2–3). If your fix is a number, ask what mechanism's absence makes the number load-bearing.
* **Instrument trends, not points.** Every gate this repo had measured VALUES against THRESHOLDS; none measured a value against its own history. The duration-trend tripwire (§7.3) is the pattern to replicate wherever a "suddenly 10×" would hurt.
* **Cross-read concurrent workstreams like folds.** Verified-independently ≠ verified-together; shared substrate (a table's physical layout, a schedule, an env var) is the coupling reviews don't see (Spec 08 §11).
* **The observer has a schedule too.** When a monitor reds, check its clock against the monitored's timeline before diagnosing the monitored.
* **Recovery is part of the design.** Orphan terminalization, manual step invocation with the correct target-DB incantation, and "which data survived" must be WRITTEN (§6) — the 08-13/14 recoveries were re-derived by hand twice before this spec.
* **Predict before you look** (`lessons:104`): the 08-14 run was watched with a pre-pinned expectation ("completes ~18:15 under the new envelope") — which is exactly why its failure was instantly recognizable as a NEW cause instead of another crank of the same wheel.

## Operating Boundaries
* **Target Files:** `.github/workflows/chain-deep-scrapes.yml` (envelope knobs) · `.github/workflows/pipeline-watchdog.yml` (windows/cron) · `scripts/run-chain.js` (layers 2–3) · `scripts/refresh-snapshot.js` (item 7.1) · `src/tests/deep-scrapes-workflow.infra.test.ts` (envelope locks).
* **Out-of-Scope Files:** `scripts/aic-scraper-nodriver.py` / `aic-orchestrator.py` internals (Spec 44 owns scraper behavior; only the budget ENV contract crosses) · `scripts/manifest.json` step content (Spec 44) · the quality-assert halting posture (Spec 30 §5.4.1).
* **Cross-Spec Dependencies:** Spec 44 (chain content, §3/§4) · Spec 115 §2.2/§2.4/§2.5 (budgets, masking guard, RAN semantics) · Spec 112 §6 (backup fallback interplay) · Spec 40 §3.1.2 (`deferred_to_full`) · Spec 30 §5.4.1 (threshold-change rule) · Spec 08 §11 (grounding + cross-workstream rule).
