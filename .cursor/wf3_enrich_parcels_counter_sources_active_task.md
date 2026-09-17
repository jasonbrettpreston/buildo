# Active Task: WF3 — `enrich_parcels` declared counter sources resolve null (`compute.*` → `matched.compute.*`)
**Status:** Implementation
**Domain Mode:** Backend/Pipeline (`scripts/CLAUDE.md`, `tasks/lessons.md` read at task start)
**Workflow:** WF3 (one finding, one commit) · authorized by the operator 2026-09-16 ("I like your plan")
**Branch:** `wf2/deep-scrapes-restore-l0` · **HEAD at start:** `7da6546b` (pushed) · sole committer, hooks never bypassed, **no push**, **no cloud writes**

## Context
* **Goal:** Close the HIGH filed by batch-2 Phase 0.10b in `docs/reports/review_followups.md` (block "0.10b"):
  `scripts/enrich-parcels.descriptor.json` declares its three counters with a bare `compute.*` source, which the
  enrich branch's `counterScope` (`{matched, written}` + `records_meta`) cannot resolve, so
  `records_total`/`records_new`/`records_updated` have emitted **null** on every `enrich_parcels` run since pilot 9's
  conversion. 0.10b (`13ee7669`) landed the post-phase seam so `matched.compute.records_*_aggregate` now resolves and
  recommended remedy **(b)**: re-point the three descriptor sources at `matched.compute.*` and leave the resolver alone.
* **Target Spec:** `docs/specs/01-pipeline/65_enrich_parcels.md` (the step), with
  `docs/specs/01-pipeline/122_pipeline_step_optimization.md` §8 RE-FREEZE #10 (the `enrich_hooks.post_phase` contract that
  makes `matched.compute.*` the declared root) and `docs/specs/01-pipeline/47_pipeline_script_protocol.md` §11
  (Counter Semantic Contract) governing. Spec 48 §3.6 ("NULL is not zero") and Spec 79 C11 are the two tripwires the
  defect fires.
* **Key Files:**
  * `scripts/enrich-parcels.descriptor.json` — `counters.{records_total,records_new,records_updated}.source` (the fix)
  * `scripts/analysis/step-validate.mjs` — new fast invariant #26 (COUNTER-ROOT) + its self-test
  * `src/tests/steps/enrich_parcels/violations.test.ts` — the both-directions lock
  * `docs/reports/golden/enrich_parcels/post/{sources_run1,none_incremental}.json` — recapture (Class-A by construction)
  * `docs/reports/golden/enrich_parcels/wf3-counter-sources-recapture.md` — diff classification
  * `docs/reports/review_followups.md` — close the 0.10b HIGH row
  * `docs/reports/*-assessment.md` (×14) — `step-validate --all --write` scorecard regeneration (consequence of #26)
  * READ-ONLY context: `scripts/lib/step/index.js` (`resolveCounterSource` `:175`, `deriveCounters` `:191`,
    `resolveEnrichAggregate` `:2673`, the `counterScope` ternary `:4672`), `scripts/lib/compute/enrich-parcels.js`
    (`computePostPhase` `:1900`)

## Premise — MEASURED BEFORE ACTING (the eager-fix antibody), 2026-09-17, local Docker DB `127.0.0.1:54322`

1. **Ledger (live):** the last 8 completed `enrich_parcels` `pipeline_runs` rows (ids 1892, 1884, 1883, 1882, 1854,
   1853, 1848, 1845, back to 2026-09-08) all read `records_total = NULL`, `records_new = NULL`,
   `records_updated = NULL`, while the SAME rows' `records_meta` carries `total_parcels_scanned = 486530` and
   `records_updated_aggregate = 0`. The number exists; the declared counter never received it.
2. **Committed artifacts:** `post/sources_run1.json` and `post/none_incremental.json` both carry
   `summary.records_{total,new,updated} = null`; the frozen PRE capture `pre/sources_run1.json` carries
   `records_updated: 0` — conversion turned a real `0` into a `null`.
3. **Unit, both directions (executed, not reasoned):**
   `deriveCounters(descriptor, {}, {matched: {compute: {total_parcels_scanned: 486530, records_new_aggregate: 0,
   records_updated_aggregate: 7}}, written: {}})` → `{null, null, null}` today; the identical call with the three
   sources re-pointed at `matched.compute.*` → `{486530, 0, 7}`.
4. **Fleet root census (all 14 converted descriptors, measured):** roots in use are `matched` (compute_centroids,
   geocode_permits, link_parcel_addresses, link_wsib), `written` (link_massing, link_neighbourhoods, link_parcels,
   refresh_snapshot, load_ravines, link_parcel_addresses, link_wsib), `acquired` (load_ravines — the INGESTOR's own
   legitimate root), `records_meta` (assert_engine_health), and `compute` — **`enrich_parcels` alone**. This is why
   invariant #26 is SHAPE-AWARE rather than a flat `{matched, written, records_meta}` allowlist: a flat list would
   false-RED `load_ravines`' `acquired.feature_count`, which resolves correctly on the ingest branch.
5. **Baseline scorecard:** `--step=enrich_parcels --fast` reads **16/17 hard-stop=false**. The missing point is
   **G3 (1/2, "table rows=10 vocab-hit rows=9")** — an assessment-report PH-3 Intent-Ledger prose gate (one row
   without a disposition-vocabulary hit). **It is not the counters and this fix cannot move it.** The task brief's
   "expect 16/17 → 17/17" is therefore refuted in advance; the expected post-fix score is **16/17**, and chasing G3
   would mean editing pilot-9 prose that has nothing to do with this finding (fold-simplicity: out of scope).

## Technical Implementation
* **New/Modified Components:** none (no `src/` product code).
* **Data Hooks/Libs:** `scripts/enrich-parcels.descriptor.json` (3 `source` strings + 1 `why` text);
  `scripts/analysis/step-validate.mjs` (fast invariant #26 + self-test + header doc).
  **`scripts/lib/step/index.js` is NOT modified** — remedy (b) was ruled smaller-blast-radius than (a) (spreading
  `matched` into `counterScope` would make every `matched` key addressable as a bare root, a wider surface than
  anything declared).
* **Database Impact:** NO. No migration, no schema change, no backfill. The only DB contact is the two golden
  captures running the step against the local Docker DB, exactly as the committed artifacts were taken.

## Standards Compliance
* **Try-Catch Boundary:** N/A — no new API route, no new catch block. The invariant is pure JSON/string analysis
  inside the existing `fastInvariants()` loop, which has no try/catch of its own to widen.
* **Unhappy Path Tests:** (a) the retired bare `compute.*` form resolves `null` for all three slots (the RED
  direction, executed against the real resolver, not a mock); (b) invariant #26 REDs a fixture descriptor declaring
  a bare `compute.*` source and PASSES the same fixture with `matched.compute.*` (self-test, both arms, so a
  silently-vacuous invariant fails the checker's own `--self-test-only`); (c) the invariant's shape table is itself
  guarded against runner drift — it greps `counterScope`'s own assignment block in `scripts/lib/step/index.js` and
  FAILS if the roots the code actually assigns are not covered by the table, and FAILS if the grep matches nothing
  (a lock that matches nothing is the `tasks/lessons.md` "lock reports the promise as the breach" class).
* **logError Mandate:** N/A — `scripts/` uses `pipeline.log.*`; no new catch block is introduced.
* **UI Layout:** N/A.

## Execution Plan
- [x] Step 0: Read `scripts/CLAUDE.md` + `tasks/lessons.md`; measure the premise (items 1–5 above) BEFORE editing.
- [ ] Step 1: PLAN roster — **Integration** seat (main tree, no worktree: must see the uncommitted plan AND live code),
      verifying the fix's wiring assumptions against the real tree: that `matched.compute` is the root the runner
      actually assigns, that the recapture flag set matches what produced the committed artifacts, that the
      shape→roots table matches `counterScope`'s branches, and that nothing else consumes the three sources.
- [ ] Step 2: Edit `scripts/enrich-parcels.descriptor.json` — three `source` strings `compute.*` → `matched.compute.*`,
      plus the `records_updated.why.text` amended to name the root and cite why a bare `compute.*` does not resolve.
      Schema-valid (AJV via `step-validate`); `scoped_by` untouched; no other descriptor key moves.
- [ ] Step 3: Locks, both directions.
      (a) `src/tests/steps/enrich_parcels/violations.test.ts` — resolve the LIVE descriptor's three declared sources
          through the real `deriveCounters` against a fixture `matched.compute` and assert three FINITE numbers
          equal to the fixture's own values; plus the inverse arm asserting the retired bare `compute.*` spelling
          resolves `null` for all three (so the test proves the fix direction, not just the fixed state).
      (b) `scripts/analysis/step-validate.mjs` — fast invariant **#26 COUNTER-ROOT**: for every converted/pending
          descriptor whose `counters` is not `"none"`, each slot's `source` (when not `"none"`) must have a root
          segment in the set `counterScope` actually builds for that descriptor's shape, ∪ `records_meta`.
      (c) `--self-test-only` arms for #26: RED on a bare `compute.*` fixture, GREEN on `matched.compute.*`, GREEN on
          `load_ravines`-shaped `acquired.*`, RED on a root that resolves for no shape, plus the runner-drift grep arm.
- [ ] Step 4: Cheap gates before the long capture — `--all --fast` (expect **exactly one** RED, `enrich_parcels` #26,
      BEFORE Step 2's edit is in place is impossible since Step 2 precedes; so the RED arm is proven by
      `git stash`-free means: run #26 against the pre-fix descriptor content held in a fixture, and record the
      `--all --fast` post-fix result as **0 REDs**), `npm run typecheck`, `npm run lint`,
      `npx vitest related` on the touched test file.
- [ ] Step 5: Recapture the POST goldens — SOLO, DETACHED (bare `nohup node … &`, no wrapper), in-repo `--out`,
      FLAG PARITY with the committed artifacts (measured: `tables_source: "descriptor"`, `columns_source:
      "descriptor"`, `invariants_file: null` with 6 descriptor-derived invariants, `table_row_ceiling` default
      100000 — i.e. **no** `--table-columns` / `--table-order` / `--invariants` flags; the INT-8/INT-9 flag-parity
      lesson for `geocode_permits` does not transfer, its POST captures were taken with explicit flags and
      `enrich_parcels`' were not). FULL first (`--chain=sources --args=--full`, ~90 min), then
      `--chain=none` (~5 min) immediately after, against the DB the FULL just left fresh. **Never two at once.**
      Liveness verified by process command line, never a remembered pid; nothing else run against CPU or DB
      while a capture is in flight.
- [ ] Step 6: Classify every diff A/B/C/D in `docs/reports/golden/enrich_parcels/wf3-counter-sources-recapture.md`.
      **Stated in advance:** Class A must be EXACTLY the three counters
      (`summary.records_total` null→486530, `records_new` null→0, `records_updated` null→its aggregate) and nothing
      else — no audit row added/removed/renamed/re-indexed, no `config` key moved, no threshold moved, no
      `records_meta` key moved. **Class B is PREDICTED NON-EMPTY this time** (the committed captures ran 2026-09-16
      and this recapture runs 2026-09-17, so the 5-year comps window `pr.issued_date >= (asOfDate - 5 years)` slides
      one day, floor `2021-09-16` → `2021-09-17`; 0.10b's own note documents the mechanism and 0.10 measured it as
      `comp_candidate_pool` −5 with `comparable_builds_enriched_count`/`comp_zero_comps_count` conserved). If Class B
      is EMPTY the assumed mechanism was wrong and the note must say so. Class C = wall-clock/dead-ratio/`parcels`
      content hash (EP-PIN-B45 / EP-PIN-D9, pre-existing). Class D must be empty (capture order FULL-then-incremental).
- [ ] Step 7: `node scripts/analysis/step-validate.mjs --step=enrich_parcels --write` (expect **16/17**, G3 unchanged
      and explained), then `--all --write` to regenerate all 14 assessment scorecards (invariant #26 adds a row to
      every step's fast-invariants table, and `step-conformance.infra.test.ts`'s R-R drift lock compares the
      committed block byte-for-byte against a fresh `--fast` run), `--all --fast` (expect exit 0, hard-stop=false ×14),
      `--self-test-only`.
- [ ] Step 8: Full `npm run test` at `VITEST_MIN_FORKS=1 VITEST_MAX_FORKS=1`, AFTER the captures, nothing else running.
- [ ] Step 9: OUTPUT roster — **Regression Guardian** (intent preservation over the descriptor/validator diff +
      `git log`/`blame` on the three source lines and the `why` block), **Observability** (Spec 48 §3.6 / Spec 79 C11:
      does the run now SAY what it did; counter scoping still §11-honest; the audit table unmoved), **Integration**
      (the recaptured artifacts and the scorecard/report regeneration against the real tree). No DeepSeek/Gemini
      (operator ruling 2026-09-16).
- [ ] Step 10: Close the 0.10b HIGH row in `docs/reports/review_followups.md` with the measured result; ONE commit
      `fix(65_enrich_parcels): …` through the hooks. Spec 122/124 untouched — if a byte is needed there (122 has 7
      bytes of headroom, 124 has 10), **STOP and report** rather than trim.

## PLAN-panel adjudication — Integration seat (main tree, read-only), 2026-09-17

Verdict: the fix is **correct and correctly scoped**; remedy (b) re-verified by execution. Confirmed: `matched.compute`
is the root the runner assigns (`index.js:3796`), the three key names exist and are spelled correctly
(`compute/enrich-parcels.js:1951-1960`), all four early-return paths keep reading null AFTER the fix (no new
silent zero), no consumer anywhere reads the retired literal, the descriptor stays AJV-valid, **no freeze file pins a
counter `source` VALUE** (`template-freeze.json` has zero occurrences of `"source"`; `schema_sha256` unchanged, so no
re-freeze), `index.js` is NOT one of the four fingerprint inputs, and the recapture flag set (descriptor-derived,
no `--table-columns`/`--table-order`/`--invariants`) is the one that produced the committed artifacts — the
INT-8/INT-9 `geocode_permits` flag list genuinely does not transfer.

**Five corrections ACCEPTED and applied:**
1. **BLOCKING — invariant #26's detail embedded scope-dependent counts.** A `--step=X --fast` run rendered
   "3 … across 1 descriptor(s)" while `--all --write` would have stamped "32 … across 11" into all 14 committed
   blocks; the R-R drift lock re-runs the PER-STEP form, so all 14 would have stayed RED with no way to regenerate
   them. FIXED by scoping #26 over the whole converted registry (the #22/#25 shape). Measured after the fix:
   `--step=link_massing` and `--step=enrich_parcels` now render byte-identical `| 26 |` rows.
2. **MED — `counterShapeOf` re-implemented `isIngestStep` and dropped two conjuncts** (`outputs.writes[].length > 0`
   and `staleness.triggersAt(…, 'pre_acquisition').length > 0`). FIXED by requiring the runner's own exported
   predicate — the same "a copied predicate drifts" failure the invariant refuses for the root table.
3. **Stale prose that would assert something false once this lands.** `scripts/lib/compute/enrich-parcels.js:1949`
   named the broken `"compute.records_updated_aggregate"` literal as the source it feeds (FIXED — and done BEFORE the
   capture launched, since that file IS a fingerprint input); `scripts/lib/step/index.js`'s `resolveEnrichAggregate`
   docblock said "until that filing closes" (FIXED — comment-only, not a fingerprint input).
4. **Class-A prediction restated as 3 keys / 6 keys**, not 3 and 3 — `none_incremental` also carries the same three
   counters in `normalised.pipeline_runs[0]` (measured: 1 row on the standalone capture, 0 on the chain capture).
5. **Step 4's "post-fix `--all --fast` = 0 REDs" was false as written** — `enrich_parcels` reads 13/17 hard-stop=true
   on G8 (stale fingerprint) until the recapture lands. The clean `--all --fast` belongs AFTER Step 5/7.

**One finding ADDED to the fix beyond the filing:** `resolveEnrichAggregate`'s two arms do not agree on key NAMES —
the hook arm returns the step's own names, the DERIVED arm mints `records_scanned_aggregate`. A future ENRICHER with
no `post_phase` hook that copies `matched.compute.total_parcels_scanned` from this descriptor would resolve null.
Stated at the function's own docblock (#26 checks the ROOT; the leaf is the author's).

**Two stale-prose sites RULED LEFT IN PLACE, explicitly rather than silently:**
`scripts/steps/_schema/step.schema.json:1336` (the `enrich_hooks.post_phase` description) and
`docs/specs/01-pipeline/122_pipeline_step_optimization.md:1090` (RE-FREEZE #10) both carry the same
"has read null since conversion … until that filing closes" clause. Editing the schema is a byte-for-byte
`template-freeze.json.schema_sha256` change forcing `generate-template-freeze.mjs --refresh` + a 122a re-freeze
record, and Spec 122 has 7 bytes of headroom — both are outside this WF3's authorization, and the ADVICE both give
("declare `matched.compute.*`, never a bare `compute.*`") remains correct in every particular. Carried to the report
as an open item for the operator, not fixed here.

## Known deviations / open items (recorded up front, not discovered late)
* The scorecard cannot reach 17/17: the missing point is G3, a PH-3 prose gate. Reported, not chased.
* Invariant #26 is shape-aware, not the flat `{matched, written, records_meta}` allowlist the brief described —
  a flat list false-REDs `load_ravines`' legitimate `acquired.feature_count` (measured, item 4 above).
* Adding #26 forces a `--all --write` regeneration of 14 committed scorecard blocks. Mechanical, but it widens the
  commit's file count; it is the R-R drift lock's own requirement, not a choice.
