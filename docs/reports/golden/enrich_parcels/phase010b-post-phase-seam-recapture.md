# `enrich_parcels` golden master — recapture for batch-2 Phase 0.10b (the ENRICHER POST-PHASE seam)

**Ruling:** Spec 124 §5 R-C (the golden capture is a lockfile — a capture whose `source_fingerprint` no longer
matches the tree is stale and must be re-taken, with the CAUSE named).
**Precedent followed:** `phase010-enrich-hooks-recapture.md` (the immediately preceding row, same file pair, same
gate, same A/B/C/D vocabulary) and `wf3-phase-deadline-recapture.md`.

## Why the gate fired — measured, not assumed

`computeSourceFingerprint`'s four inputs are `scripts/enrich-parcels.descriptor.json`, `scripts/enrich-parcels.js`,
`scripts/enrich-parcels.notes.json` and `scripts/lib/compute/enrich-parcels.js`. 0.10b touches **two** of them: the
descriptor gains `execution.enrich_hooks.post_phase`, and the compute module gains the `computePostPhase` export
the runner now calls by that declared name. `node scripts/analysis/step-validate.mjs --step=enrich_parcels --fast`
read `G8 … stale-fingerprints=2 … hard-stop=true`, naming both POST captures.

**`scripts/lib/step/index.js` is NOT a fingerprint input**, so the runner half of this row does not move the
fingerprint by itself. That is load-bearing for the classification below: **no pass SQL moved.** The three
`parcels` post-check SELECTs were relocated from the runner into the compute module with **not one character of
their SQL changed**, and the 25 domain `matched` keys moved as verbatim expressions.

Proven rather than asserted, two ways:

* `git diff scripts/lib/compute/enrich-parcels.js` has **zero deletions** outside comment blocks — the change is
  purely additive.
* Every pass-4 function hashes identically before and after (`Function.prototype.toString` → sha256, first 16):
  `buildCompCandidatesSql ccb365933c046655`, `buildComparableBuildsUpdateSql 66af0b9d616a3777`,
  `buildCompCandidatesIndexSql a6bb5545fe70d9e4`, `runPass4 dcbf2130ae4b3a32`,
  `buildDecisionScopeWhere 2848d25442a642d1` — **identical in both directions.**

| | value |
|---|---|
| OLD fingerprint | `16217d3f5b1360cf61f74622c37b9b7ab4edde3700e57299434a3ae94f258638` |
| NEW fingerprint | `ad4050ccc89272c424eafa7f4dddfb3918bf011c86469198c444c142254d888d` |

## What was captured

| capture | invocation | child duration | exit | verdict |
|---|---|---|---|---|
| `post/sources_run1.json` | `--chain=sources --args=--full` | 5,220.2 s (**87.0 min**) | 0 | WARN |
| `post/none_incremental.json` | `--chain=none` (no args, incremental) | 271.9 s (**4.5 min**) | 0 | WARN |

Per-phase on the FULL: `zoning` 1,533,984 ms · `max_build` (the dominant phase) · `existing_structure` ·
`comparable_builds` · `optimal_config` 162,169 ms; `parcels` content hash 65,904 ms over 486,530 rows,
`enrich_parcels_pass3_scope` 602 ms over 0 rows.

**Capture ORDER is correct this time, unlike 0.10's.** 0.10's first `--full` completed all five phases and then
lost its artifact to a `gitHead()` throw under host memory pressure, so its `none_incremental` was taken against a
DB left fresh by a run whose capture no longer exists, and its `--full` was re-run afterwards — which is what
produced 0.10's Class D. Here the `--full` ran first and completed (10:34), and `none_incremental` was taken
**immediately after it** (10:36 → 10:42), against the DB that run had just left fresh — its documented
precondition. **Class D is therefore empty.**

### The PRE set was NOT re-taken, and must not be

`pre/{sources_run1,sources_run2,standalone}.json` are the frozen **pre-conversion** baseline from 2026-09-04
(`cd26f9ea`): `source_fingerprint: null`, `fingerprint_skipped_reason: "no_descriptor_yet"`,
`tables_source: "arg"`, and seven hand-written invariants from an `--invariants=` file in a session scratchpad
that no longer exists. `d7668b8a` left all three byte-untouched and so does this row. Re-taking them would destroy
the only record of what the step emitted before conversion, and would not even produce comparable artifacts now
that the descriptor drives the table and invariant derivation.

## Pre-flight (measured before the capture)

0 active parcel backends · 0 stranded `running` `enrich_parcels` `pipeline_runs` rows ·
`enrich_parcels_pass3_scope` 0 rows · `parcels` 486,530 · migrations 244 · `git rev-parse HEAD` healthy
(`e074df3d`). Target `postgresql://…@127.0.0.1:54322/postgres`.

**Host note, recorded because it nearly repeated 0.10's loss.** At 10:08, mid-`max_build`, the host hit memory
pressure and killed **both** background waiter loops watching this capture. The capture harness itself survived,
because it was launched **detached and bare** (`nohup node …`, no wrapper script) — precisely the operational
fence 0.10's own note paid for. Nothing else was run against the CPU or the DB while the `--full` was in flight.

---

# Diff classification — 4 on `sources_run1`, 3 on `none_incremental` (7 total, against 0.10's 23)

## Class A — structural, caused by THIS change: **NONE. Zero. Both pairs.**

That is the result this recapture exists to report, and it is the row's ship gate.

No audit row added, removed, renamed or re-indexed (the row array is index-stable — the two moved diffs are
`rows[23]` in both pairs, the same `enrich_parcels_duration_ms` row). No `config` key added, removed or changed
(all 45 identical). No threshold moved. No counter moved: `records_total`/`records_new`/`records_updated` are
`null` before and after (that is finding **b5**, filed HIGH and deliberately **not** fixed in this row precisely
because fixing it would land here as a Class-A diff). `records_meta` carries the same key set with the same
values — `zone_class_pct 96.6`, `total_parcels_scanned 486530`, `records_updated_aggregate 0`. The
`enrich_parcels_duration_ms` key is still present under exactly that name (the `<slug>_duration_ms` derivation is
byte-identical for this step). **No `before_image` key anywhere** — the class-O seam ran zero times, which is why
that key is added to `matched` only when non-empty. All four `scope_*` retirement keys are present with their
values, which is the `hasScopeLedger` gate proving inert for this step, on real data rather than on a fixture.

The five per-target write counters are unchanged — the counter-fold's own inverse arm, measured against the real
486,530-parcel DB rather than a fixture.

## Class B — data drift, NOT caused by this change: **EMPTY. Prediction SCORED, and it was CORRECT.**

**The prediction was written into the plan addendum (§0.10b.7) BEFORE the capture ran**, so it could be scored
either way rather than rationalised afterwards:

> 0.10's entire Class B was the 5-year comps window sliding one day (`buildCompCandidatesSql` filters
> `pr.issued_date >= ($N::date - (5 * interval '1 year'))` where `$N` is the RUN's own `ctx.clock.asOfDate()`):
> floor `2021-09-15` → `2021-09-16`, candidate CTE 9,511 → 9,506, matching `comp_candidate_pool` 9,282 → 9,277
> exactly, with `comparable_builds_enriched_count` +23 / `comp_zero_comps_count` −23 conserved at 430,404. The
> committed captures ran 2026-09-16 and so does this recapture, **so Class B should be EMPTY this time — and if
> it is not, the assumed mechanism was wrong and the note must say so.**

**Measured: empty.** Every comps-derived quantity is identical across the committed and recaptured artifacts:

| metric | OLD full | NEW full | OLD incr | NEW incr |
|---|---|---|---|---|
| `comp_candidate_pool` | 9,277 | **9,277** | 9,277 | **9,277** |
| `comparable_builds_enriched_count` | 344,897 | **344,897** | 0 | **0** |
| `comp_zero_comps_count` | 85,507 | **85,507** | 85,507 | **85,507** |
| `comp_fsi_p50_small_n_sample_count` | 3,292 | **3,292** | 3,292 | **3,292** |

The window did not slide because both captures fall on the same run date, exactly as the mechanism predicts. The
day-boundary explanation 0.10 offered is therefore **corroborated by a successful negative prediction**, not
merely re-asserted.

## Class C — inherent to any re-run: **4 + 3 = 7, every one with a named mechanism**

### `sources_run1` (4)

| path | old → new | mechanism |
|---|---|---|
| `summary.records_meta.audit_table.rows[23].value` | 3,832,487 → **5,201,344** | `enrich_parcels_duration_ms`, wall clock. This host was materially slower today: `zoning` alone took 25.6 min against a 14.0–19.8 min history. |
| `summary.records_meta.audit_table.rows[36].value` | 0.7365 → **0.7366** | `parcels_dead_tuple_ratio` — autovacuum timing relative to the measurement. A `--full` creates the dead tuples the row then reports. |
| `summary.records_meta.warnings[2]` | `"…: 0.7365"` → `"…: 0.7366"` | the same ratio, rendered into the warning string. One fact, two renderings. |
| `table_state[1].content_hash` | `4c6eb889…` → **`33208a49…`** | see **§ the `parcels` hash** below. |

### `none_incremental` (3)

| path | old → new | mechanism |
|---|---|---|
| `summary.records_meta.audit_table.rows[23].value` | 205,547 → **262,333** | `enrich_parcels_duration_ms`, wall clock. |
| `pipeline_runs[0].records_meta.audit_table.rows[23].value` | 205,547 → **262,333** | the SAME fact. A `--chain=none` run writes its own `pipeline_runs` row (that is the whole point of the standalone capture), so the duration is recorded twice and diffs twice. Not two findings. |
| `table_state[1].content_hash` | `91928460…` → **`e586d0f9…`** | see below. |

## Class D — capture order: **EMPTY.**

0.10's single Class D diff (`optimal_config_enriched_count` 524 → 0) was an artifact of its inverted capture
order. Here the order was correct, and `optimal_config_enriched_count` reads **0 in all four captures**.

---

# § The `parcels` content hash — measured to a conclusion, not waved through

This is the only diff in either pair that is not self-evidently a clock. It appears in **both** pairs, so it is
the one thing that could in principle have masked a real data change. It did not, and the reasoning is measured
at every step rather than inherited from 0.10's note — which attributed the same diff to *"Class B's 23 moved comp
rows plus pass 4's unguarded UPDATE, which rewrites every eligible row each run by design."* **That explanation
does not survive here**: Class B is empty, and "it rewrote the rows" cannot by itself move a hash taken over
*values*. So it was re-derived.

**1. The hash is a deterministic function of the data.** The expression is
`md5(string_agg(md5(ROW(<104 projected cols>)::text), '|' ORDER BY id))` — explicit, pk-anchored ordering, no
aggregation non-determinism. Verified by **re-running that exact query against the live DB with no pipeline run in
between**: it reproduced `e586d0f985826ea591062f9a9d4479f8` **exactly** (76,162 ms, 104 columns). So a hash that
moves means the data moved. This rules out the hypothesis that the gate itself is flaky.

**2. Every reported write count is identical across all four captures** (the Class-B table above, plus
`parcels_enriched_count`, `max_build_enriched_count`, `existing_structure_enriched_count`,
`scenario_enriched_count` and `optimal_config_enriched_count`, all **0** in all four).

**3. And yet all four hashes differ pairwise** — including `OLD full` vs `OLD incr`, a pair produced entirely by
0.10's code, before this row existed.

| capture | `parcels` content_hash |
|---|---|
| OLD full | `4c6eb889d98e613267911484122a9c20` |
| OLD incr | `91928460bdd3be0a5478c14571544781` |
| NEW full | `33208a49d2aee47d2c187050f684d140` |
| NEW incr | `e586d0f985826ea591062f9a9d4479f8` |

**4. The cleanest single-variable experiment is inside THIS recapture.** The `--full` finished at 10:34 leaving
hash `33208a49…`. The incremental ran 10:36→10:42 against that DB, reported **zero rows written by every pass**
(`comparable_builds_enriched_count: 0`), and left hash `e586d0f9…`. A run that reports writing nothing changed the
table. Since (1) rules out hash flakiness, `enrich_parcels` writes to `parcels` content that **no counter
reports**.

**Conclusion: Class C, and independent of this change** — established by (3), where the identical behaviour is
visible in a pair captured before 0.10b existed, and by the byte-identical pass-4 function hashes above. The
0.10b diff sits entirely in the post-phase region, which runs **after** every write and cannot reach `parcels`.

**Finding, filed rather than absorbed.** The mechanism is the two standing pins — `EP-PIN-B45` (*pass-4 comps
UPDATE has no `IS DISTINCT FROM`; the `comp_count IS NULL` incremental predicate never refreshes*) and
`EP-PIN-D9` (*pass-4 comps candidate selection has no deterministic tiebreak → `comparable_builds` jsonb
instability*), both `cutover_prereq`, both already on the register. What this recapture adds is the sharpened,
measured statement of their consequence: **a run that reports zero enriched rows still changes `parcels`
content**, which is a Spec 48 §3.6 silence (an unreported write) and a real limitation of the golden's own
`table_state` gate — for this step that gate cannot distinguish *"this change altered data"* from *"any run
alters data"*. It does **not** weaken the Class-A verdict, which is judged on the audit rows, the counters, the
`records_meta` keys and the config block, all of which are byte-identical. Filed to
`docs/reports/review_followups.md`.

---

# Gate

**Zero unexplained diffs.** All 7 (4 + 3) land in **Class C** with a named, measured mechanism; **Class B is
empty and that was predicted in advance**; **Class D is empty**; and **Class A — structural, caused by this
change — is EMPTY on both pairs**, which is the condition 0.10b was gated on.
