# Lifecycle NULL-phase root-cause trace (WF2 Phase 3)

**Date:** 2026-07-07
**Task:** Spec 84 — resolve the paradox that ~578 permits with LIVE statuses carry
`lifecycle_phase IS NULL` even though (a) the pure lib maps every one of these
statuses to a phase and (b) the dirty-select predicate already includes them.
**Verdict:** **NO CODE DEFECT.** The NULLs are a *dirty-queue drain lag*, not a
classifier bug. Every stuck row is already queued for re-classification and will
heal on the next in-chain `classify_lifecycle_phase` run (Phase 7). Investigate-first
outcome: **verify, don't build** (confirms `.cursor/active_task.md` Phase 3 line 61).

---

## 1. The evidence base (live `buildo` DB, 2026-07-07)

### 1.1 The live-status NULL population is 578, split into two clean groups
Query — live-status NULL permits (NULL phase, status non-empty and NOT in
`DEAD_STATUS_SET`), grouped by `matched_rule` and watermark state:

| group | rule | count | watermark state | in dirty set? |
|-------|------|-------|-----------------|---------------|
| **A — never-classified** | `NULL` | **544** | `lifecycle_classified_at IS NULL` | YES (`classified_at IS NULL` **and** `matched_rule IS NULL`) |
| **B — stale-reclassify** | `2` (DEAD) | **34** | `last_seen_at > lifecycle_classified_at` | YES (`last_seen_at > classified_at`) |
| C — genuine unmapped | `15` | 1 (`Notice Sent`) | dirty | null-by-design (§2.5.a row 13) |

Decisive query — count of live-status NULL permits that are **NOT** in the dirty
set (i.e. would *not* self-heal):

```
stuck_not_dirty = 0
```

**Zero.** There is no genuinely-stuck population. The dirty-select predicate
(`classify-lifecycle-phase.js:1105-1107`) —
`lifecycle_classified_at IS NULL OR last_seen_at > lifecycle_classified_at OR matched_rule IS NULL`
— already covers every one of the 578 rows.

### 1.2 Group A (544) were loaded AFTER the last classify run
```
total_never_classified          = 544
  first_seen_at > 2026-06-25 run = 544   (100%)
  MIN(first_seen_at)             = 2026-06-28 11:45:32
  MAX(first_seen_at)             = 2026-06-28 11:48:27
```
The most recent `permits:classify_lifecycle_phase` run was **id 1319,
2026-06-25 11:33:59 → 11:34:46** (status `completed`, verdict PASS). A
`load-permits` run on **2026-06-28** inserted these 544 permits *after* that
classify run, and **no `classify_lifecycle_phase` run has executed since**. The
rows are correctly NULL because the classifier has not yet run over them — this
is the documented incremental-drain behavior, not a defect.

### 1.3 Group B (34) had their status flip DEAD → LIVE after 06-25
These carry `matched_rule = 2` (the DEAD rule → `phase = NULL`), meaning that at
their last classification their status was a dead status. Their CKAN status has
since flipped to a live one (e.g. `Response Received` → `HOLD_P5_SET`,
`Under Review ` → `REVIEW_P4_SET`) and `last_seen_at` advanced past
`lifecycle_classified_at`, so they are dirty **now**. They will re-classify to
their correct live phase on the next run. Distribution: `Response Received` 19,
`Under Review ` 6, `Permit Issued` 3, `Issuance Pending` 2, `Ready for Issuance`
1, `Examiner's Notice Sent` 1, `Not Started` 1, plus a handful others.

### 1.4 The 06-25 run itself reported PASS with `unclassified_count = 1`
`pipeline_runs.id=1319` audit_table verdict = **PASS**; `unclassified_count = 1`
(only `Notice Sent`); `stalled_count = 34,465`; no FAIL/WARN/skip rows;
`sys_duration_ms = 45,938`. At run time the 544 (loaded 06-28) did not yet exist
and the 34 had not yet flipped — so the run correctly classified everything
present. The NULLs materialized *after* the run. This directly refutes the
"should have self-healed on 06-25 and didn't" framing: on 06-25 there was
nothing to heal.

### 1.5 The pure lib maps every distinct live status to a non-null phase
Direct `node -e` invocation of `classifyLifecyclePhase()` on each distinct live
status (both `is_orphan=false` and `is_orphan=true` branches), including the
trailing-space `'Under Review '`:

| status | non-orphan (rule/phase) | orphan (rule/phase) |
|--------|--------|--------|
| `Application Acceptable` | r9 / P3 | r5 / O1 |
| `Not Started` | r10 / P7d | r5 / O1 |
| `Not Started - Express` | r10 / P7d | r5 / O1 |
| `Application On Hold` | r7 / P5 | r5 / O1 |
| `Under Review ` (trailing space) | r6 / P4 | r5 / O1 |
| `Ready for Issuance` | r8 / P6 | r5 / O1 |
| `Issuance Pending` | r8 / P6 | r5 / O1 |
| `Permit Issued` | r12 / P7b | r5 / O2 |
| `Pending Parent Folder Review` | r7 / P5 | r5 / O1 |
| `Response Received` | r7 / P5 | r5 / O1 |
| `Revision Issued` | r11 / P8 | r5 / O2 |
| `Open` | r9 / P3 | r5 / O1 |
| `Inspection` | r14 / P18 | r5 / O2 |
| `Application Received` | r9 / P3 | r5 / O1 |
| `Examiner's Notice Sent` | r6 / P4 | r5 / O1 |

Every row resolves to a non-null phase. `normalizeStatus()`
(`lifecycle-phase.js:293-297`) trims the trailing-space case to `'Under Review'`
before set membership, exactly as the plan predicted. The pure lib is correct;
the defect hypothesis is refuted.

---

## 2. Root cause (precise mechanism)

**The classifier has not run since the rows became dirty.** There is no hidden
SOURCE predicate, no JOIN dropping rows, no LIMIT/batching skip, no UPDATE guard
losing rows, and no swallowed batch failure. The full trace of the run path:

1. **SOURCE SELECT** (`classify-lifecycle-phase.js:1098-1107`): a plain
   `FROM permits WHERE <dirty predicate>` with no additional filter, JOIN, or
   LIMIT. All 578 rows satisfy the predicate (verified: `stuck_not_dirty = 0`).
2. **Stream** (`pipeline.streamQuery`): back-pressured cursor; no row cap.
3. **Classify** (`classifyLifecyclePhase`): maps every live status to a phase
   (§1.5 above).
4. **UPDATE** (`PERMIT_UPDATE_SQL:409-440`): `IS DISTINCT FROM`-guarded; a
   NULL→phase change always passes the guard. `phase_started_at` is stamped
   fresh (`= RUN_AT`) on any phase change, including NULL→phase.

The 578 rows are simply *queued and not yet processed*: 544 arrived after the
last run (06-28 load vs 06-25 classify), and 34 flipped dead→live after the last
run. Both cohorts drain on the next in-chain classify run. **No fix code is
warranted** — matching the plan's line 61 directive ("the 544 never-classified
likely drain on the next in-chain run; verify, don't build"; "no whitespace fix;
no watermark-repair code").

### Why the paradox looked like a bug
The `assert_lifecycle_phase_distribution` step reports an aggregate
`unclassified_count` (all live-status NULL rows, regardless of dirty state) that
*today* reads 578, which reads as a standing gap. But `unclassified_count` cannot
distinguish "genuinely stuck / misclassified" (a real bug) from "loaded/flipped
since the last classify run" (benign drain lag). That conflation is the **audit
blind spot** Phase 3 Step 4 addresses with `live_status_null_count` (matched_rule
IS NULL breakout = 544) and `never_classified_count` (classified_at IS NULL = 544).

---

## 3. `lifecycle_stalled` interaction projection (Step 3 / G1 fold)

Baseline `lifecycle_stalled` count = **34,465** (matches
`2026-07-06-lead-serving-baseline.md` and the 06-25 run audit row exactly).

Projection when the 578 dirty NULL rows drain on the Phase 7 classify run:

| metric | value |
|--------|-------|
| total dirty live-status NULL rows | 578 |
| `Permit Issued` + no-inspection + issued > 730d (stall candidates) | **0** |
| `Permit Issued` total (max theoretical stalls via issued path) | 33 |
| `Inspection` total (stall only if last inspection > 180d) | 2 |
| currently-stalled rows that would **un-stall** (`true → false`) | **0** |

**Projected `lifecycle_stalled` flip ≤ 2, and un-stalls = 0** — far under the
5,000 STOP threshold. Draining these rows takes them NULL → phase; it does not
touch any currently-stalled row, so it cannot un-stall anything (no
expired-forecast/grace-purge wave from un-stalling).

**No past-dated forecast risk from this population.** Because old
`lifecycle_phase` was NULL for all 578 rows (Group A never classified; Group B
carried rule-2 NULL), the `PERMIT_UPDATE_SQL` `phase_started_at` CASE fires on the
NULL→phase change and stamps `phase_started_at = RUN_AT` (the run clock), NOT an
old date. The In-Memory Grace Cutoff therefore has nothing to drop here — these
become fresh, forecast-eligible leads (the intended outcome), not past-dated
forecasts.

Newly forecast-eligible: the ~544 non-terminal, non-orphan, non-stalled rows that
acquire P1–P18 phases become forecast SOURCE-eligible (`lifecycle_stalled = false`
+ non-SKIP phase). This is the *intended* lead-surfacing gain, projected and
accepted here.

---

## 4. Audit blind-spot counter values (Step 4 context, live DB)

| new counter | definition | value now | drains to (post-Phase-7) |
|-------------|------------|-----------|--------------------------|
| `live_status_null_count` | NULL phase + status∉dead + `matched_rule IS NULL` | **544** | ~0 |
| `never_classified_count` | `lifecycle_classified_at IS NULL` | **544** | ~0 |
| (existing) `unclassified_count` (permit side) | NULL phase + status∉dead | 578 | ~1 (`Notice Sent`) |

Both new counters exceed the seed default WARN threshold (50) *today* — that is
the blind-spot surfacing exactly as intended; the WARN clears once the chain
runs. Seed default 50 chosen to sit above steady-state noise (~1) but well below
a single day's typical new-permit load (~500+).

---

## 5. DS6 — CoA `lifecycle_seq` population (verify, do NOT backfill)

| scope | with seq | total | pct |
|-------|----------|-------|-----|
| active CoAs (non-terminal or NULL phase) | 2,899 | 2,899 | **100%** |
| all CoAs | 33,280 | 33,280 | **100%** |

≥ 95% satisfied. No backfill needed (confirms plan line 64 / DeepSeek §6.3).

---

## 6. Conclusion

- **Root cause:** dirty-queue drain lag — classifier not run since 06-28 load /
  status flips (last run 06-25). No code defect. `stuck_not_dirty = 0`.
- **Fix:** none in production code. Regression locks pin the proven live-status →
  phase mapping (and the no-`toLowerCase()` / dual-case `HOLD_P5_SET` fence).
- **Interaction guard:** ≤ 2 projected stalled flips, 0 un-stalls, fresh
  `phase_started_at` anchors — no forecast-wave risk. Well under the 5,000 STOP.
- **Resolution path:** the Phase 7 in-chain `classify_lifecycle_phase` run drains
  all 578 rows; the new `live_status_null_count` / `never_classified_count`
  counters make future drain-lag legible instead of masquerading as a gap.
