# Pilot 7 — convert `link_parcels` to the Spec 122 step standard (LINK, 2nd member)

**Status:** Commit 1 (PH-0 boundary freeze, G0) landed. §0's seed re-confirmed against the same DB this
commit; no drift in any DATA number, several small CORRECTIONS to the plan's own bookkeeping (query-site
count, `Date.now(` count, chain-position arithmetic, `grandfathered.json` real-step count — all listed
below), and **one genuine new finding**: `permit_parcels` has consumers beyond `enrich_permits` inside the
`permits` chain that Fold A/B's R-E "sole consumer" ruling did not name.

**Governing plan:** `.cursor/active_task.md` (Pilot 7 — link_parcels, LINK 2nd member; **the authorized,
Implementation-status copy** — `.cursor/pilot7_link_parcels_active_task.md` is a superseded Planning-status
duplicate, not re-read for content this commit).
**Governing specs (owner row first, per Spec 123 §6 G0):** `docs/specs/01-pipeline/41_chain_permits.md`
(PRIMARY, §Step Breakdown row 9, `:53`) · `docs/specs/01-pipeline/55_source_parcels.md` §4 ("Consumed by:
`link-parcels` Strategy 1b/2/3") · `docs/specs/01-pipeline/54_source_address_points.md` §4 ("Consumed by:
`link-parcels` Strategy 1a") · `docs/specs/01-pipeline/65_enrich_parcels.md` — **NOT a consumer**, see §0.4
— · `docs/specs/01-pipeline/122_pipeline_step_optimization.md` (§1.4 write class F, §1.5 staleness, §1.7
sharing — `link_parcels` is the §1.7 worked example, §1.8 archetype table, §8.2 pilot order) ·
`docs/specs/01-pipeline/123_step_opt_assessment_validation.md` (§2, §3, §6, §7) ·
`docs/specs/01-pipeline/124_step_standard_policy.md` (13 rules + R-A..R-V — governs on conflict with older
Spec 122 prose).

---

## §1. PH-0 — boundary freeze (commit 1, G0)

> Re-executed 2026-08-30 (same day as §0's own planning-session seed, different session), against
> `127.0.0.1:54322/postgres` via `scripts/lib/resolve-db.js#createResolvedPool()` — the resolver logged its
> target (`postgres`, migrations=242, floor 223) before every query this commit, per `tasks/lessons.md`'s
> "verify against the DB the code will actually use" lesson. No `localhost:5432/buildo` mistake made.

### Re-confirmed this commit — DATA numbers (0 drift)

| Check | §0 seed value | Re-executed 2026-08-30 (commit 1) | Match |
|---|---|---|---|
| `current_database()` / migrations | `postgres`, 242 rows, floor `245_parcels_centroid_geom_invalidation.sql` | identical | ✓ |
| `permit_parcels` total | 241,172 | 241,172 | ✓ |
| `match_type` distribution | `exact_address` 152,975 · `address_points_exact` 48,815 · `spatial_polygon` 17,651 · `spatial` 17,504 · `name_only` 4,227 | identical, all 5 values | ✓ |
| Duplicate `(permit_num, revision_num)` pairs (Finding 3) | 989 | 989 | ✓ |
| `parcels` total / with `centroid_lat` | 486,530 / 486,530 (100%) | identical | ✓ |
| `lead_parcels` total | 270,709 | 270,709 | ✓ |
| `permits:link_parcels` runs / latest | 40 / 2026-07-17 | 40 / `2026-07-17T20:48:02.181Z` | ✓ |
| `sources:link_parcels` runs / failed / latest | 20 / 1 / 2026-07-08 | 20 / 1 / `2026-07-08T13:59:45.507Z` | ✓ |
| The 1 failed `sources:link_parcels` run | id 1049, started 2026-06-10, reaped 2026-07-19 (39d) | id 1049, `started_at` `2026-06-10T14:43:54.588Z`, `completed_at` `2026-07-19T15:36:27.028Z`, `error_message:"interrupted: stale run auto-cleaned"` | ✓ |
| Legacy (pre-chain-prefix) `link_parcels` runs | 2, both Feb/Mar 2026 | 2, latest `2026-03-03T17:18:09.709Z` | ✓ |
| Git archaeology (`git log --follow`) | 32 commits, 18 `fix(`, 56.25%, 0 footers | 32 / 18 / 0 footers, re-counted independently | ✓ |
| Commit range | 2026-02-20 → 2026-05-23 | `d398d5e7` 2026-02-20 → `03679c94` 2026-05-23 | ✓ |
| Fence `8a1c7d25` date | 2026-04-01 | `2026-04-01` (`git log -1`) | ✓ |
| Fence `7c75e92e` date | 2026-04-02 | `2026-04-02` (`git log -1`) | ✓ |
| `spatial_match_max_distance_m` / `spatial_match_confidence` | 100 / 0.65, registered | identical values; description text still reads "...a parcel centroid..." (Finding 6's stale-description claim reconfirmed) | ✓ |
| `permit_parcels` PK/UNIQUE shape | `(id)` PK, `(permit_num,revision_num,parcel_id)` UNIQUE | `permit_parcels_pkey (id)`, `permit_parcels_permit_num_revision_num_parcel_id_key UNIQUE(permit_num,revision_num,parcel_id)`, plus `fk_permit_parcels_permits`/`permit_parcels_parcel_id_fkey` — re-queried via `pg_constraint`, byte-identical to the plan's Write-discipline section | ✓ |
| `enrich_permits` consumer lines (R-E) | 88, 335, 339, 365, 543, 813 | identical, re-grepped | ✓ (see NEW FINDING below — the "sole consumer" framing itself is corrected, the line numbers are not) |
| `link_full_retraction` (class F) unimplemented in `write.js` (B-1) | schema-only, no executor | confirmed: `step.schema.json:389/408` names it; `write.js:63`'s `SET_BASED_CLASSES` set does not include it; no `executeGuardedDeleteByKey`/equivalent exists | ✓ |
| `LG-22` claimed by CC-D3 (Fold B item 3) | `executeGuardedUpdate`, `write.js` | confirmed: `write.js:916` `async function executeGuardedUpdate`, 6 `LG-22` citations, landed via `eaec4e6e`. Highest claimed `LG-*` in the codebase is `LG-22` — `LG-23` genuinely free (deliberately skipped per this pilot's own dispatch instruction, to avoid cross-document alias ambiguity, not because it's taken) | ✓ — `LG-24`/`LG-25` confirmed as this pilot's next-free pair |
| `logic_variables` total | 448 | **450** | ⚠️ +2 drift, ordinary churn class (consistent with a concurrent WF landing 2 new rows — e.g. CC-D3's own T1/T2 seed, `d9057a54`) — not investigated further, does not affect this pilot's own 2 pre-existing vars, which are byte-identical |

### Corrections to the plan's own bookkeeping (re-derived by direct read, not copied from §0)

Re-grepped `scripts/link-parcels.js` directly this commit rather than trusting §0's own hand-tally:

| Metric | §0 claimed | Re-measured (commit 1) | Correction |
|---|---|---|---|
| `pool.query`/`client.query` sites | "~24" | **13** (lines 137, 164, 172, 227, 275, 388, 411, 436, 514, 551, 568, 576, 614 — full list) | §0's "~24" over-counted; 13 is the exact call-site count. Every query TYPE §0 named is present (count query, centroid check, PostGIS check, batch CTE, polygon+centroid-fallback spatial queries, JS-fallback candidate query, batch upsert, 2 ghost-cleanup DELETEs, `parcel_linked_at` UPDATE, cumulative-rate query) — 13 sites, not ~24 |
| `Date.now(` | "1" | **2** — `:134` (`startTime`) AND `:593` (`durationMs = Date.now() - startTime`) | Both elapsed-time-only (never written to DB) — still fully R3.5-compliant, `new Date(` remains 0. §0's "1" undercounted the duration-computation site |
| `grandfathered.json` real-step entries | "4 real-step entries (link_massing, link_parcel_addresses, compute_centroids)" | **3** real-step entries (the 3 named) + 2 schema fixtures = 5 keys total | §0's own prose named exactly 3 steps but labeled the count "4" — an internal inconsistency in the plan text, corrected here to 3 |
| `manifest.json` `permits` chain position | "position 9 of 32" | index **8** (0-based) = **9th step** (1-based) of **33** total elements | The "9th step" figure is right (and matches Spec 41's own "Step 9" numbering); the chain has 33 elements, not 32 |
| `manifest.json` `sources` chain position | "position 6 of 28" | index **10** (0-based) = **11th step** (1-based) of **28** total elements | The "28 total" is right; the position "6" is wrong — `link_parcels` is the 11th element, immediately after `link_parcel_addresses` (idx 8) and `compute_centroids` (idx 9), which correctly confirms the "immediately after" adjacency claim even though the raw position number was off |

None of these corrections touch THE FIX's substance (Strategy 3 Step 2's join predicate), the write-discipline
class, or the flip-rate/idempotency rulings — they are boundary-freeze bookkeeping fixes, exactly the class of
thing G0 exists to catch (same spirit as pilot 6's own SPEC LINK provenance correction at its own commit 1/2).

### NEW FINDING (this commit) — `permit_parcels` has consumers beyond `enrich_permits` inside the `permits` chain; Fold A/B's R-E "sole consumer" ruling is corrected, not merely reconfirmed

Fold A (R-E) and Fold B (item 8, grounder) both stated *"`enrich_permits` confirmed the SOLE consumer of
`permit_parcels`"* and re-grepped only `scripts/enrich-permits.js`'s own 6 read sites both times. This
commit's boundary freeze widened the search — `grep -rln "permit_parcels" scripts/ src/ migrations/` — and
found **`enrich_permits` is not the only `permits`-chain step that reads `permit_parcels`:**

1. **`compute-cost-estimates.js` (`permits`-chain step, index 17, `compute_cost_estimates`) — a SECOND,
   INDEPENDENT dominant-parcel selection**, `:161-167`:
   ```sql
   LEFT JOIN LATERAL (
     SELECT parcel_id FROM permit_parcels
     WHERE permit_num = p.permit_num AND revision_num = p.revision_num
     ORDER BY parcel_id ASC LIMIT 1
   ) pp ON true
   LEFT JOIN parcels pp_parcel ON pp_parcel.id = pp.parcel_id
   ```
   feeding `lot_size_sqm`/`frontage_m` directly into the cost model — a product-facing derived value
   (`cost_estimates`). Its own tiebreak (`parcel_id ASC`) is **not necessarily the same row**
   `enrich-permits.js`'s dominant-parcel logic picks (Spec 66's own selection is not `parcel_id ASC` — not
   re-derived this commit, filed as an Ask below). THE FIX's ~10.6K relinks change which parcel this LATERAL
   picks for every affected `spatial`-tier permit exactly as they change `enrich_permits`'s pick.
2. **`link-neighbourhoods.js` (`permits`-chain step, index 10, immediately after `link_parcels`→
   `enrich_permits`) — a minor fallback exposure**, `:88-96` and `:203-211`: `LEFT JOIN permit_parcels pp ...
   LEFT JOIN parcels pa ...` supplies the linked parcel's `geometry` as a FALLBACK point-in-polygon source
   for neighbourhood assignment, gated `WHERE p.neighbourhood_id IS NULL AND (lat/lng not null OR
   pa.geometry not null)`. Low severity in practice — every `spatial`-tier permit already has `lat/lng`
   populated (that's how Strategy 3 fires in the first place; only the 4 `LP-D6` NULL-coordinate permits
   would ever fall through to the parcel-geometry fallback), but it is a genuine second read path, not zero.
3. **`refresh-snapshot.js`, `assert-data-bounds.js`, `assert-global-coverage.js`, `scripts/quality/audit-fk-orphans.js`** — all read `permit_parcels` for **aggregate/observability** purposes only (dashboard
   snapshot counts, orphan-FK checks, coverage-percentage rows) — no per-permit derivation, informational
   drift only after THE FIX ships, not a correctness exposure.

**Classification (deferred to commit 4, PH-6, per this pilot's own commit sequencing — flagged here at
commit 1 because it is a boundary-freeze fact, opened formally at commit 2/4):** `compute-cost-estimates.js`
is a genuine SECOND CONTRACT-class consumer whose dominant-parcel selection THE FIX will also change, using a
DIFFERENT tiebreak than whatever `enrich-permits.js` uses — this needs its own row in the PH-6 classification
table (opened as **`LP-D7`** below, §4) and a note for the commit-8/9 owner (out of this pilot's own commit
1–6 scope) that the "no phased rollout, sole product surface = `enrich_permits`" framing (Fold B item 6, R-G)
undercounts the actual blast radius by at least one more product-facing derivation.

### File surface, re-derived by direct read this commit

`wc -l scripts/link-parcels.js` → **686**. `pipeline.run('link-parcels', async (pool) => {...})` at **module
scope, line 124** — `grep -c "require.main\|module.exports"` → **0**, confirms the same unconverted-shape
citation Spec 122 `:759` already makes. Construct counts (re-derived, not copied): `pool.query`/`client.query`
**13** (corrected above) · `try`/`catch`/`finally` **1/1/0** (`:463-465`, JS-fallback `JSON.parse` guard) ·
`Date.now(`/`new Date(` **2/0** (corrected above, both elapsed-only) · `process.env` **2** direct reads
(`:181` `chainId`, `:660` phase ternary — Finding 4, disagreeing) · `process.argv` **0** · `emitSummary`/
`emitMeta` **2/2** · `ADVISORY_LOCK_ID = 90` (`:51`) — `grep -rn "ADVISORY_LOCK_ID\s*=\s*90" scripts/` → this
one file only, no collision · `console.*` **0** · `throw` **1** (`:129`, LOGIC_VARS_SCHEMA validation).

### Write-discipline surface (re-derived per Spec 122 R5 — never trust the port)

One write target, `permit_parcels`, class **F** `link_full_retraction` (Spec 122 §1.4's own frozen enum) —
**confirmed UNIMPLEMENTED in `write.js`** this commit (`step.schema.json:389,408` names the enum value;
`write.js:63`'s `SET_BASED_CLASSES` set does not contain `link_full_retraction`; no
`executeGuardedDeleteByKey` or equivalent exists yet). Key: `(permit_num, revision_num, parcel_id)` —
confirmed against `pg_constraint` this commit: `permit_parcels_permit_num_revision_num_parcel_id_key
UNIQUE(permit_num, revision_num, parcel_id)`, plus `permit_parcels_pkey (id)`,
`fk_permit_parcels_permits FOREIGN KEY (permit_num, revision_num) REFERENCES permits(...)`,
`permit_parcels_parcel_id_fkey FOREIGN KEY (parcel_id) REFERENCES parcels(id)`. Guard: `IS DISTINCT FROM` on
`(match_type, confidence)`, `:521-522`, re-read verbatim this commit — matches Fold A/B's citation exactly.
`LG-22` (`executeGuardedUpdate`) confirmed CC-D3's own, landed `eaec4e6e` — `LG-24`/`LG-25` reconfirmed as this
pilot's next-free pair (§0 above).

### G4 — risk class, full pass this commit

**Chance** = 32 commits (small-mid corpus) + 56.25% fix density (highest of any pilot to date, re-confirmed) +
2 genuinely load-bearing fences (`8a1c7d25` ghost-cleanup atomicity, `7c75e92e` PostGIS offload) ≈ 6.25% fence
density → **CLASS B/C**, same as pilot 6 (no churn×complexity instrument exists — G2 stays ⛔ ABSENT,
standing programme gap). **Impact** = **HIGH**, raised from "moderate" on the strength of this commit's own
new finding: TWO independent product-facing consumers now confirmed (`enrich-permits.js`'s zoning
propagation AND `compute-cost-estimates.js`'s lot_size_sqm/frontage_m cost-model input), not one — plus the
pre-filed HIGH followup (CC-D2/CC-D3 exposure) this pilot exists to close.

### G0 verdict

**CLOSED this commit.** Every §0 DATA number reconfirmed with zero drift (one 2-row `logic_variables` count
delta, ordinary churn). Four bookkeeping corrections made to the plan's own hand-tallies (query-site count,
`Date.now(` count, chain-position arithmetic, `grandfathered.json` real-step count) — none affect THE FIX's
substance. **One genuine new finding**, opened for formal classification at commit 4: `permit_parcels` has a
second CONTRACT-class consumer (`compute-cost-estimates.js`) beyond `enrich_permits` that Fold A/B's "sole
consumer" framing did not name — filed as `LP-D7` at §4, flagged for the commit-8/9 owner's awareness now.

---

## §2. PH-3 — Intent Ledger over the corpus (commit 2, G3)

> **18 `fix(` commits (of 32 total, `git log --follow`), all adjudicated** — re-executed via direct `git show
> <sha> -- scripts/link-parcels.js` this commit, not transcribed from the plan's own findings list. Per Spec
> 124 §4.2's discoverer≠adjudicator split, every disposition below is PROPOSED by this pass (agent,
> 2026-08-30), stands until a human operator ratifies or overturns at commit 7. Closed disposition vocabulary
> only (Rule 13): `preserved-in-runner | preserved-in-validator | preserved-in-compute |
> encoded-as-descriptor-field | encoded-as-deviation | knowingly-retired`. `INCIDENTAL` never appears as a
> disposition.

| Commit | Date | Construct | Live today? | Proposed disposition | Ground |
|---|---|---|---|---|---|
| `8287291e` | 2026-03-06 | First `PIPELINE_SUMMARY:` `console.log` line | Superseded — 0 `console.*` today, replaced by structured `pipeline.emitSummary` | **knowingly-retired** — the literal console-log form is gone; the underlying CONCEPT (a structured completion summary) survives as `pipeline.emitSummary`/commit-7's `checks`+`counters` | direct diff this commit; `grep -c console\.` on current file = 0 |
| `bd06751d` | 2026-03-07 | `records_total` redefinition: `processed` → `totalLinked` (dashboard was showing scan-pool size, not records changed) | Superseded — a LATER, out-of-scope `feat(` commit (`78518916`, not in this pilot's 18-commit `fix(` corpus) redefined `records_total` back to `processed` (today's value, confirmed at commit 1) | **knowingly-retired** — this specific redefinition did not survive verbatim; the general PRINCIPLE this fix asserted (records_total must reflect true evaluation scope, not a misleading proxy) is not violated by today's `processed` value either (processed IS the true batch-evaluation count under the CURRENT incremental-filter shape, unlike the pre-fix bug which conflated it with an unrelated scan-pool metric) — not re-litigated further, out of this pilot's own scope to resolve which of the two framings is "more correct" | direct diff this commit; `git log -p` for the reverting commit |
| `d2050cfc` | 2026-03-10 | `records_new`/`records_updated` correction: `{new:totalLinked, updated:0}` → `{new:0, updated:totalLinked}` (this step only UPDATEs, never INSERTs new rows in the counter sense) | ✓ current file: `records_updated: totalLinked` (`:646`) — byte-identical | **preserved-in-compute** — verbatim-ported to `compute.js` at commit 7 | `:644-646` current file |
| `5baaed5a` | 2026-03-26 | **Origin of ONE side of Finding 4's phase disagreement** — `phase: (process.env.PIPELINE_CHAIN === 'sources') ? 6 : 7` introduced at the real-run `audit_table` site (part of a 3-chain phase-renumbering sweep: "Permits: fix refresh_snapshot 5→14, link_coa 4→12...") | ✓ current file `:660`, byte-identical | **encoded-as-descriptor-field** — becomes `sharing.varies_by_chain.phase` at commit 7 (A-5 RULED: `permits`=7, matching THIS commit's own value) — this commit's `7` is the CORRECT side of Finding 4/`LP-D3`'s disagreement, not the defect | direct diff this commit |
| `a760e0e7` | 2026-03-27 | Cumulative link rate (denominator = ALL permits, not run-scoped); renamed `total_matched`→`run_matched` | ✓ current file `:614-621,637`, byte-identical mechanism, literal `75` threshold unchanged | **preserved-in-compute** — the cumulative-rate MECHANISM is verbatim-ported; the literal `75` becomes `T5`/`link_parcels_link_rate_warn_pct` (Finding 6) at commit 7, same default value, a Rule-3 externalization not a threshold change | `:614-621` current file |
| `369341ae` | 2026-04-01 | 4 fixes in one commit: (a) keyset cursor replacing OFFSET pagination, (b) blank-to-blank street-type exact match, (c) zero-address regex `/^0+(?=\d)/`, (d) `pointInGeoJSON` doughnut-hole (interior ring) exclusion | (a)(b)(c) ✓ current file, byte-identical (`:232`, `:329`, `:251`); (d) ✓ current file `:77-103` but JS-fallback-only | **SPLIT disposition**: (a)/(b)/(c) **preserved-in-compute** — (a) generalizes into `LG-25`'s composite-key keyset pagination at commit 7 (the SAME shape this commit pioneered, now lifted into the shared library); (b)/(c) fold into `primary_match_sql`'s `UNION ALL` verbatim. (d) **knowingly-retired** — retires WHOLE with the JS fallback (A-1 RULED); the hole-exclusion LOGIC has no PostGIS-branch analogue to preserve (`ST_Contains` already respects polygon holes natively) | direct diff this commit; current file line citations |
| `568f5787` | 2026-04-01 | Defensive `try/catch` around JS-fallback `JSON.parse(bestGeometry)` — malformed geometry no longer crashes the batch | ✓ current file `:463-465`, the file's ONLY try/catch (1/1/0, confirmed commit 1) | **knowingly-retired** — retires WITH the JS fallback (A-1 RULED); the guard's PURPOSE (never let one malformed row crash the run) has no PostGIS-branch analogue needed — `ST_Contains`/the KNN operator on a NULL/invalid `geom` is filtered by the `WHERE geom IS NOT NULL` predicate itself, not a per-row try/catch | `:463-465` current file |
| `a21b7b01` | 2026-04-01 | Timestamp-based incremental filter (`parcel_linked_at IS NULL OR parcel_linked_at < last_seen_at`, replacing a `NOT EXISTS` shape that infinite-looped on unmatchable permits) + ghost cleanup for ZERO-match permits only | Superseded 2 weeks later — `f0daba71` replaced `last_seen_at` with `geocoded_at` (today's actual predicate); the ZERO-match-only ghost-cleanup DELETE is superseded 0 days later by `8a1c7d25`'s changed-match extension (below) | **knowingly-retired** — neither the exact `last_seen_at` predicate nor the zero-match-only DELETE survives verbatim; the underlying MECHANISM this commit pioneered (timestamp-based incremental, not `NOT EXISTS`; a real DELETE for permits that fall out of match) is what carries forward through its own successors, preserved structurally not textually | direct diff this commit; successor commits below |
| **`8a1c7d25`** | **2026-04-01** | **THE load-bearing fence — Finding 3's root cause.** Wraps ghost-cleanup + `parcel_linked_at` UPDATE in ONE `withTransaction` (separate from the upsert's own transaction); ADDS the changed-match retraction DELETE (`WHERE parcel_id != $3`, a permit's OLD parcel link is deleted when it re-matches a DIFFERENT parcel) — `a21b7b01` had only handled the zero-match case | ✓ the retraction-on-relink LOGIC survives to today (`:551-561`, now UNNEST-batched by `72362c44` below); the TWO-TRANSACTION shape this commit itself introduced (ghost-cleanup+timestamp in ONE txn, separate from the upsert's txn) is what `LG-24` FURTHER consolidates at commit 7 (folds into ONE txn with the upsert, eliminating the crash window this commit's own fix left standing) | **preserved-in-compute — `LP-D1`'s own #1 Regression Guardian fence, opened this commit (below).** The retraction-on-relink BEHAVIOUR is load-bearing and must survive THE FIX unchanged; the TRANSACTION BOUNDARY this commit chose (2 txns) is superseded (not violated) by `LG-24`'s tighter 1-txn shape — a strengthening, not a regression, per Fold A B-1 | direct diff this commit; Fold A B-1 |
| `f0daba71` | 2026-04-15 | Incremental filter: `last_seen_at` → `geocoded_at` (the `last_seen_at` predicate caused a 100-min full-table re-scan every chain run; `geocoded_at` correctly captures the "address-linked, later geocoded, should re-link spatially" case) | ✓ current file `:143-161`, byte-identical including the WHY-comment | **preserved-in-compute** — verbatim-ported to `compute.js` at commit 7, this pilot's `staleness`/incremental descriptor field | `:143-161` current file |
| `030a7611` | 2026-04-16 | Externalize `spatial_match_max_distance_m`/`spatial_match_confidence` as `logic_variables` (Rule-3 origin for THIS step's two ALREADY-compliant vars) | ✓ current file `:45-48,127-131`, byte-identical | **preserved-in-compute** — these two vars are the ALREADY-compliant baseline Finding 6/the P4 tunable inventory builds on; T1–T5 externalize the FOUR confidence literals + link_rate threshold this commit did NOT touch | `:45-48` current file |
| `c1ef0b73` | 2026-04-16 | Advisory lock retrofit: `ADVISORY_LOCK_ID=90` + `pipeline.withAdvisoryLock` wrap + `RUN_AT` via a bare `pool.query('SELECT NOW()')` | Lock ID + wrap ✓ current file `:51,125`, byte-identical; `RUN_AT` sourcing superseded by an out-of-scope `refactor(` commit (`46275ef1`, not in this pilot's 18-`fix(` corpus) to `pipeline.getDbTimestamp(pool)` (today's form, `:126`) | **encoded-as-descriptor-field** — `90` becomes `identity.lock` at commit 7 (Spec 47 §A.5 registry row unchanged); the lock WRAP mechanism retires with `pipeline.run` per the frozen-shape conversion, same as every prior pilot's own advisory-lock disposition | `:51,125,126` current file |
| `44aebeb7` | 2026-04-17 | **CRITICAL** — `linked_at` NULL on first INSERT (was set only in `ON CONFLICT DO UPDATE`, never in the INSERT column list) | ✓ current file `:496-503,515-522`, byte-identical, including the inline `// §47 §6.1` citation comment | **preserved-in-compute** — verbatim-ported to `compute.js` at commit 7; this is Spec 47 §6.1 compliance, explicit in the code today | `:502` current file |
| `187f0402` | 2026-04-17 | `parseInt`/`parseFloat` → `safeParsePositiveInt`/`safeParseFloat` (B1 safe-math migration) | ✓ current file, all 7 call sites (`:168,175,254-255,452`), byte-identical | **preserved-in-compute** — verbatim-ported to `compute.js` at commit 7 | current file, safe-math import line `:43` |
| `72362c44` | 2026-04-17 | N+1 per-permit ghost-cleanup DELETE loop → single `UNNEST`-batched DELETE (`O(matched permits)` round-trips → `O(1)`) | ✓ current file `:551-560`, byte-identical UNNEST shape | **preserved-in-compute** — this EXACT UNNEST shape generalizes into `LG-24`'s `executeGuardedDeleteByKey` generated SQL at commit 7, not merely ported but LIFTED into the shared library | `:551-560` current file |
| `52ad6527` | 2026-04-18 | §11 counter-misuse fix: `records_updated` `dbUpserted`→`totalLinked` (a JOIN-table row count was inflating the primary-entity counter); `db_upserted` audit row renamed `permit_parcels_written` | ✓ current file `:640,646`, byte-identical | **preserved-in-compute** — verbatim-ported to `compute.js` at commit 7 | `:640,646` current file |
| `2577e694` | 2026-04-21 | Adds an `audit_table` to the zero-permits early-return path (was a bare `emitSummary({records_total:0,...})` with no audit row at all) — **also introduces `phase: chainId === 'sources' ? 6 : 9`, THE OTHER side of Finding 4's disagreement, a MONTH after `5baaed5a`'s own `?6:7`, using a DIFFERENT non-`sources` value (9, not 7) and a DIFFERENT read idiom (`chainId` local var vs. direct `process.env` read)** | ✓ current file `:181-194`, byte-identical | **SPLIT disposition: the audit_table-on-skip SHAPE is `preserved-in-compute`** (a genuinely good contribution — the zero-permits path deserves its own audit row, same as every other converted step's SKIP terminal) — **the specific `?6:9` VALUE is `encoded-as-deviation`**: this commit is the actual ORIGIN of Finding 4/`LP-D3`'s defect half, not a symmetric pre-existing disagreement — `5baaed5a`'s `?6:7` was already established a month earlier; this commit independently reinvented the same axis with a wrong, unreconciled value. A-5 RULED `phase=7` for `permits` corrects this commit's own `9` at commit 7 | direct diff this commit; date-ordered against `5baaed5a` above |
| `03679c94` | 2026-05-23 | Strategy 1a `address_status` filter widened to accept the literal `'None'` (Toronto's production data uses `'None'` for 100% of rows, not the assumed `CURRENT`/`RETIRED`/`PENDING`) | ✓ current file `:308`, byte-identical including the inline WF3-hotfix-#2 comment | **preserved-in-compute** — verbatim-ported to `compute.js` at commit 7, part of Strategy 1a's `UNION ALL` branch, untouched by THE FIX (Strategy 1a is out of scope — only Strategy 3 Step 2 changes) | `:308` current file |

**Approver for every disposition above:** this pilot's PH-3 pass (agent, 2026-08-30), grounded in direct `git
show`/`git log -p` re-verification this commit — per Spec 124 §4.2's discoverer≠adjudicator split, PROPOSED
here, stands until a human operator ratifies or overturns at commit 7.

### `LP-D1` — THE FIX's own defect row (opened this commit)

**Classification (Spec 123 §3, the four questions):** (1) Observed? Yes — Strategy 3 Step 2's centroid-nearest
fallback join (`:403-432`) ranks candidate parcels by `parcels.centroid_lat/centroid_lng` (materialized,
possibly-drifted per `ST_Centroid`'s own concave-polygon behaviour, Spec 59 R2.5) rather than the parcel's own
live `geom`. (2) Spec/invariant conflict? Yes — the file's own header comment (`:12-14`) states the intended
contract as "nearest parcel," not "nearest stored centroid point" — these differ whenever a centroid drifts
outside or toward a neighbour (measured: 3,626/486,530 parcels, 0.75%, land outside their own polygon per
CC-D2). (3) Load-bearing? The CURRENT (defective) behaviour is NOT load-bearing — no spec or downstream
consumer depends on centroid-proximity SPECIFICALLY as opposed to true nearest-parcel; `8a1c7d25`'s
retraction-on-relink fence (above) IS load-bearing and must survive THE FIX unchanged (a genuinely different
concern from the join predicate itself). (4) Cost of carrying vs. diverging: re-measured live this commit
(re-executing the plan's Fold A/B query, independent of the grounder's own re-execution) — see the Reality-
Check re-measurement below; the flip population is large enough (60%+ of the tier) that carrying the defect
costs real downstream correctness (`enrich_permits`'s zoning propagation AND `compute-cost-estimates.js`'s
lot-size/frontage inputs, per commit 1's `LP-D7` finding). **Status: OPEN, closes `CLOSED-MEASURED` at commit
9** once the declared FULL re-run's before/after delta is measured against the plan's own range (out of this
pilot's own commit 1–6 scope to close).

### `LP-D2` — Finding 3's 989 duplicate-row class (opened this commit)

**Classification:** (1) Observed? Yes — 989 `(permit_num, revision_num)` pairs carry 2 `permit_parcels` rows
each (re-confirmed commit 1, byte-identical to §0). (2) Spec/invariant conflict? The schema PERMITS this
(the UNIQUE constraint is `(permit_num, revision_num, parcel_id)`, not `(permit_num, revision_num)` alone) —
not a constraint violation, but violates the STEP's own intent (one permit should resolve to one dominant
parcel per the `8a1c7d25` retraction-on-relink fence). (3) Load-bearing? No — these are pre-`8a1c7d25`
historical residue, never revisited by the incremental filter (the fence only fires going forward). (4) Cost:
low to carry through this conversion (grounded closure, Fold C item 7: `enrich_permits` re-derives its
dominant-parcel choice fresh on EVERY run via `scopeWhere:'TRUE'`, so these 989 duplicates do not permanently
corrupt any cached derived state — only the current run's dominant-parcel pick, deterministically, via Spec
66 DEC-1's own tie-break). **Status: OPEN, expected to self-heal (Fold A R-F) under the declared FULL run
(commit 8, out of this pilot's own scope) — before/after count required to confirm, not merely predict.**

### `LP-D3` — Finding 4's disagreeing phase ternaries (opened this commit)

**Classification:** (1) Observed? Yes — `:186` (`chainId==='sources'?6:9`, origin `2577e694`, 2026-04-21) vs.
`:660` (`process.env.PIPELINE_CHAIN==='sources'?6:7`, origin `5baaed5a`, 2026-03-26) — **this commit's own
archaeology establishes the ORIGIN ORDER**: `5baaed5a`'s `?6:7` came FIRST (part of a deliberate 3-chain
phase-renumbering sweep); `2577e694` independently reinvented the SAME axis a month later with a DIFFERENT,
unreconciled value (`9`). (2) Spec/invariant conflict? Yes — Spec 122 §1.7 names this EXACT file as its own
worked example for "phase is an explicit map, never a ternary" (`:302`,`:505`). (3) Load-bearing? No — neither
value is defended by any downstream consumer requiring specifically `9` (the zero-permits path is rare and its
own `phase` value has no measured consumer dependency beyond the audit_table's own display). (4) Cost: A-5
RULED (Fold A, against the `link_wsib` `{permits:7, sources:19}` precedent) — `phase=7` for the `permits`
chain is correct; `2577e694`'s `9` is the value that must change at commit 7. **Status: OPEN, closes at
commit 7** when `sharing.varies_by_chain.phase` replaces both ternary sites with one declared map.

### `LP-D4` — Finding 6's five undeclared tunables (opened this commit)

**Classification:** (1) Observed? Yes — T1–T5 (four confidence literals `0.97/0.95/0.90/0.80` + the `75`
link-rate threshold), full inventory: plan's P4 tunable inventory table. (2) Spec/invariant conflict? Yes —
Spec 124 Rule 3 (tunable externalization) requires every verdict-affecting literal be a registered
`logic_variables` row; these five are bare literals in SQL/JS. (3) Load-bearing? The VALUES are load-bearing
(changing a confidence tier's number would be a real behaviour change); the LITERAL FORM is not — externalizing
to a logic variable with the SAME default is a pure Rule-3 compliance move, not a value change. (4) Cost: zero
to externalize (same default, `on_invalid:"fail"` since all five are verdict-affecting per R-G). **Status:
OPEN, closes at commit 7** when T1–T5 land as registered `logic_variables` rows + the admin "Parcel Linking"
GROUPS entry.

### `LP-D5` — class F (`link_full_retraction`) has no `write.js` executor (opened this commit, per Fold A B-1)

**Classification:** (1) Observed? Yes — re-confirmed commit 1: `step.schema.json:389,408` names the enum;
`write.js:63`'s `SET_BASED_CLASSES` set excludes it; no executor exists. (2) Spec/invariant conflict? Yes —
Spec 122 §1.4's own frozen-enum table implies class F is a real, executable write shape; it is schema-only
today. (3) Load-bearing? The step's OWN write behaviour (upsert + ghost-cleanup DELETE, `8a1c7d25`'s fence) is
absolutely load-bearing; the ABSENCE of a generic executor for it is a library gap, not a defect in THIS
step's own logic. (4) Cost: real library growth required — `LG-24` (`executeGuardedDeleteByKey`) is the first
genuine class-F executor either LINK member has shipped (Fold A B-1, renumbered Fold B item 3). **Status:
OPEN, closes only once `LG-24` ships and is exercised by a golden run** (commit 7/8, out of this pilot's own
commit 1–6 scope).

### `LP-D6` — NULL-coordinate spatial-tier permits (opened this commit, per Fold B item 2, evidence corrected at Fold C)

**Classification:** (1) Observed? Yes — 4 `spatial`-tier permits (`09 165576 HVA`, `13 260505 BLD`,
`18 258177 FSU`, `22 104242 BLD` rev `00`) carry NULL `latitude`/`longitude`/`geocoded_at` yet
`parcel_linked_at` IS set. **Independently re-verified this commit** (not transcribed from the plan): all 4
currently link to **`parcel_id 439990`** (confidence 0.65, `linked_at 2026-03-03T17:18–17:20Z`) — corrects the
plan's own "observed: parcel `id=1`" claim, itself corrected at Fold C (Ground-truth grounder, blocking item
1) before this commit landed; the LP-D6 REQUIREMENT is unaffected by the correction. (2) Spec/invariant
conflict? Yes — a NULL-coordinate permit should never resolve to ANY parcel via a distance-based join; today's
naive KNN comparison against `ST_MakePoint(NULL, NULL)` silently returns an arbitrary row instead of erroring
or excluding. (3) Load-bearing? No — no consumer depends on these 4 permits keeping their current (wrong)
link; Spec 66's `enrich_permits` re-derives fresh every run (Fold C item 7) so no stale cache depends on this
either. (4) Cost: a one-line `WHERE v.lng IS NOT NULL AND v.lat IS NOT NULL` guard, zero ambiguity. **Status:
OPEN, closes at commit 9** once the FULL run's 4-row retraction (0 relinks) is measured and the
`spatial_null_coordinate_permits` WARN check fires cleanly (out of this pilot's own commit 1–6 scope).

### `LP-D7` — second CONTRACT-class `permit_parcels` consumer beyond `enrich_permits` (opened commit 1, widened this commit per Fold C blocking item 2)

**Classification:** (1) Observed? Yes — `scripts/compute-cost-estimates.js:161-167` independently selects a
dominant parcel via its own `LATERAL ... ORDER BY parcel_id ASC LIMIT 1`, feeding `lot_size_sqm`/`frontage_m`
into the cost model; `scripts/link-neighbourhoods.js:88-96,203-211` (same `sources` chain as `link_parcels`)
reads `permit_parcels` as a fallback geometry source for neighbourhood assignment when a permit lacks its own
lat/lng (Fold C blocking item 2, widened this commit — lower severity, gated to a narrow input shape). (2)
Spec/invariant conflict? No spec asserts `enrich_permits` is the sole consumer — that framing originates in
Fold A/B's own R-E ruling, not a spec. (3) Load-bearing? Yes, for `compute-cost-estimates.js` specifically —
its own tiebreak (`parcel_id ASC`) differs from whatever `enrich-permits.js` uses, so THE FIX's ~10,616 relinks
change its cost-model INPUTS the same way they change `enrich_permits`'s zoning-propagation INPUT. (4) Cost:
zero to THIS pilot (read-only exposure, no write-path change required in either consumer) — but the commit-8/9
owner's "product exposure" statement (Fold B item 6, R-G) undercounts the blast radius by treating
`enrich_permits` as sole. **Status: OPEN, filed for commit 8/9's own owner** (out of this pilot's own commit
1–6 scope to rewrite the exposure statement) — `link-neighbourhoods.js` added to this row at Fold C's widening,
not a separate ledger row (same underlying "more than one consumer" defect class).

### G3 verdict

**CLOSED this commit.** All 18 `fix(` commits adjudicated with closed-vocabulary dispositions (0 bare
`INCIDENTAL`). Six ledger rows opened (`LP-D1`–`LP-D6` per the plan's own G6 row, plus `LP-D7` widened from
commit 1's own new finding, corrected per Fold C). `LP-D3`'s archaeology newly establishes the ORIGIN ORDER of
Finding 4's disagreement (`5baaed5a` first with the correct value 7, `2577e694` a month later with the
incorrect value 9) — not previously stated in the plan, which only noted the two sites disagree, not which
came first or which is the deviation. `LP-D6`'s evidence corrected per Fold C (parcel `439990`, not `id=1`) —
independently re-verified this commit, not merely copied from the grounder's own report.

---

## §3. PH-5 — Seam map (commit 3, G5)

> Every place `scripts/link-parcels.js` (686 lines) touches something outside pure computation — DB, clock,
> network, argv/env — re-derived by direct read this commit, not copied from the plan's preliminary G5 row.
> Resolves Ask A-5 (`sharing.varies_by_chain.phase`) — already RULED at Fold A/re-confirmed at Fold C item 8
> (`permits`=7, against the `link_wsib` precedent `{permits:7, sources:19}`), re-confirmed here as a live-file
> fact, not re-litigated. Citations mark which seams RETIRE with the JS fallback (A-1 RULED, commit 7) vs.
> which survive into `compute.js`.

### DB seam

- `pool` — supplied by `pipeline.run('link-parcels', main)` (`:124`), never a local `new Pool()`.
- `pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, ...)` (`:125`, closes `:684`) wraps the ENTIRE body —
  lock 90, single concurrent runner, kept textually (`identity.lock`, per `c1ef0b73`'s own G3 disposition).
- **13 `pool.query`/`client.query` sites** (corrected count, commit 1), all re-derived this commit:
  1. `:137` — PostGIS-extension presence check (`SELECT 1 FROM pg_extension WHERE extname='postgis'`). ⚠️ **This
     query is RETIRED, not merely its downstream branch** — A-1 RULED moves this check to the RUNNER's
     `guards.requires: postgis` precondition (asserted once, before compute runs, per the `link_massing` A-8 /
     `compute_centroids` A-1(a) precedent — now 3 precedents, per Spec 124 R-W). Compute no longer branches on
     `hasPostGIS` at all once THE FIX ships.
  2. `:164` — permits-to-process count, outside any transaction, pure read. SURVIVES.
  3. `:172` — centroid-availability check (`SELECT COUNT(*) FROM parcels WHERE centroid_lat IS NOT NULL`).
     **⚠️ Fold C item 9 (seam tension, flagged for commit 7): THE FIX's eligibility gate moves from
     `centroid_lat IS NOT NULL` to `geom IS NOT NULL` (THE FIX section, "a strictly larger eligible set... but
     removes a false dependency") — this exact query site is the one commit 7's descriptor author must rewrite
     for the seam claim to be truthful (see below).**
  4. `:227` — the batch-loop permit SELECT (composite-key keyset pagination, `(permit_num, revision_num) >
     ($2,$3)`) — SURVIVES, and this EXACT shape is what `LG-25`'s composite-key keyset pagination generalizes
     into the shared library at commit 7 (per `369341ae`'s own G3 disposition, above).
  5. `:275` — the batch CTE (Strategies 1a/1b/2, `UNION ALL`) — SURVIVES, folds into `primary_match_sql` at
     commit 7 (A-4 RULED).
  6. `:388` — Strategy 3 Step 1, `ST_Contains` polygon containment — SURVIVES UNCHANGED (already
     geometry-correct, untouched by THE FIX).
  7. `:411` — Strategy 3 Step 2, the centroid-nearest fallback (`ST_DWithin`/`ORDER BY ST_Distance` on
     `pa.centroid_lat/centroid_lng`) — **THIS is THE FIX's own target.** REWRITES at commit 7 to the
     unconstrained KNN LATERAL on `pa.geom` (THE FIX section).
  8. `:436` — the JS-fallback per-permit BBOX candidate query — **RETIRES WHOLE with the JS fallback (A-1
     RULED)**.
  9. `:514` — the batch upsert (`INSERT ... ON CONFLICT ... DO UPDATE ... WHERE IS DISTINCT FROM`), inside
     `pipeline.withTransaction` #1 (`:513-527`) — SURVIVES, becomes `LG-24`'s upsert half.
  10. `:551` — the changed-match ghost-cleanup DELETE (UNNEST-batched, `8a1c7d25`'s fence + `72362c44`'s
      batching), inside `pipeline.withTransaction` #2 (`:533-581`) — SURVIVES, becomes `LG-24`'s
      `executeGuardedDeleteByKey` DELETE half. **Fold A B-1: the SECOND, separate transaction (`:533-581`) this
      site sits inside is CONSOLIDATED into transaction #1 at commit 7 — one `executeOrderedWrites` set, not
      two `withTransaction` calls — eliminating the crash window `8a1c7d25` itself left standing.**
  11. `:568` — the zero-match ghost-cleanup DELETE, same transaction #2 — SURVIVES, same consolidation as #10.
  12. `:576` — the `parcel_linked_at` UPDATE, same transaction #2 — SURVIVES, same consolidation as #10.
  13. `:614` — the final cumulative-link-rate query, outside any transaction, pure read — SURVIVES.
- **2 explicit `pipeline.withTransaction` wraps** (`:513-527` upsert-only, `:533-581` ghost-cleanup+timestamp) —
  **becomes 1 at commit 7** (Fold A B-1/Fold B item 5 — `LG-24` folds both into one `executeOrderedWrites` set).
  `txn_scope: batch` becomes accurate only after this consolidation (today it understates a genuine
  two-transaction-per-batch reality).
- **0 session-scoped `SET`/`RESET` GUC calls** — no session-config dependency, same as every prior LINK/MATCHER
  pilot's own clean measurement on this axis.

**Fold C item 9 — seam tension flagged, resolved at commit 7 not here.** `scripts/lib/step/seam.js`'s own
header confirms seams are derived from `inputs.reads.steps[].step` (a declared producer→consumer edge), and
measured live this commit: **exactly ONE seam pair is live today** across all 6 converted descriptors —
`compute_centroids → link_massing` (`link_parcels` is not yet a converted descriptor, so it cannot be either
endpoint of a live pair today, regardless of what it reads). The plan's own G11 guarantee text ("NEW seam
becomes declarable: `compute_centroids → link_parcels`") describes a conversion BENEFIT true of the file AS IT
READS TODAY (Strategy 3 Step 2 genuinely reads `centroid_lat/centroid_lng`, `compute_centroids`'s own output,
confirmed live at `:415-417`) — but THE FIX (commit 7) DELETES that read entirely, replacing it with `geom`
(populated by the parcels SOURCE loader, Spec 55, never by `compute_centroids`). **If commit 7's descriptor
declares `inputs.reads.steps[]` naming `compute_centroids` anyway, that declaration would be stale
documentation of a dependency THE FIX itself removes — not a real one.** This pilot's own commit 3 (this
section) documents the PRE-CONVERSION seam as it genuinely exists today (query site #3 above); commit 7's own
descriptor author must declare the POST-fix reads truthfully (the eligibility-gate query at `:172` AND the
`emitMeta` reads-list at `:199` both cite `centroid_lat/centroid_lng` today — both need to drop it if THE FIX's
own `geom IS NOT NULL` eligibility change lands as designed) — flagged here, not resolved by this pilot's own
commits 1–6, which touch no compute code.

### Clock seam

- `Date.now()` — **2 sites** (`:134` `startTime`, `:593` `durationMs = Date.now() - startTime`, corrected count
  per commit 1), both elapsed-time-only, never written to the DB as a timestamp — legal per
  `tasks/lessons.md`'s explicit carve-out.
- **0 `new Date(`** anywhere.
- **1 DB-clock read** (`pipeline.getDbTimestamp(pool)`, `:126`) → `RUN_AT`, used for every `linked_at`/
  `parcel_linked_at` write (`:502,579`) — R3.5-compliant, confirmed live (the file's own G3 archaeology shows
  this replaced a bare `pool.query('SELECT NOW()')` sourced by `c1ef0b73`, itself later migrated by an
  out-of-scope `refactor(` commit).

### Network seam

- **0 `fetch(` calls** — no external network dependency, same as every converted `sources`/`permits`-chain
  step so far.

### argv/env seam

- **2 `process.env` reads**, both `PIPELINE_CHAIN`, both feeding the disagreeing phase ternaries (`LP-D3`):
  `:181` (`chainId` local var, zero-permits path, origin `2577e694`) and `:660` (direct read, real-run path,
  origin `5baaed5a`). Both retire at commit 7 — replaced by `sharing.varies_by_chain.phase`'s declared map
  (A-5 RULED: `permits`=7), read generically by the runner (`verdict.js:293`'s own `descriptor.sharing.
  varies_by_chain.phase` pattern, per `5baaed5a`'s own G3 disposition precedent from pilot 6's citation of the
  same mechanism).
- **0 `process.argv` reads** — `pipeline.isFullMode()` (`:133`) is the SDK's own argv reader, not a direct
  read in this file. `manifest.json`'s `supports_full:true`/`supports_dry_run:false` are both TRUE-to-the-code.

### Seam-map verdict (G5)

**CLOSED this commit.** No PARTIAL seams remain. DB: 13 query sites fully characterized (1 retires whole with
the JS fallback, 1 is THE FIX's own target, 2 transaction wraps consolidate to 1 at commit 7, the rest
survive verbatim or generalize into library growth). Clock: 1 DB-clock read + 2 elapsed-only `Date.now()`
sites, both R3.5-compliant. Network: absent. argv/env: 2 disagreeing `PIPELINE_CHAIN` reads (`LP-D3`), both
retiring into the declared `phase` map at commit 7 (A-5 RULED). **One seam TENSION flagged, not resolved by
this pilot's own commits 1–6 (Fold C item 9):** the plan's claimed "NEW `compute_centroids → link_parcels`
seam" benefit is true of TODAY's file, not of the POST-fix compute — commit 7's descriptor author must declare
`inputs.reads.steps[]` against what the SHIPPED compute actually reads, not the plan's original expectation.

---

## §4. PH-6 — Classification (commit 4, G6)

> Every finding from the plan's "six findings" list (§0.6) + `LP-D7` (this pilot's own commit 1 finding) +
> the Ground-truth grounder's Fold C corrections, classified per Spec 123 §3's three-way split: **CONTRACT**
> (a downstream consumer depends on it, even if ugly) / **INCIDENTAL** (nothing observes it — do not assert on
> it) / **DEFECT** (a spec or invariant asserts the opposite). `INCIDENTAL` is a legitimate G6 classification
> value (Spec 123 §3 Q1) — distinct from the G3 Intent Ledger's closed disposition vocabulary, which bans it.

| Candidate | Ledger ID | Classification | Ground |
|---|---|---|---|
| Finding 1 — Strategy 3 Step 2's centroid-nearest fallback | `LP-D1` | **DEFECT** — the file's own header comment states "nearest parcel" intent; the centroid-proximity join structurally diverges from it (§2 above) | opened commit 2; re-measured live this commit (below) |
| Finding 2 — Spec 41 §Step 9 doc-rot | *(no `LP-D*` — doc-only, fixed at commit 7/a docs commit)* | **DEFECT in the description, not the behavior** — re-confirmed live this commit: `docs/specs/01-pipeline/41_chain_permits.md:53` still reads "writes to unified `lead_parcels`... instead of legacy `permit_parcels`" and its trailing column value is `lead_parcels`, both false against the live script (`:515` `INSERT INTO permit_parcels`) | `41_chain_permits.md:53`, re-grepped this commit |
| Finding 3 — 989 duplicate-row class | `LP-D2` | **CONTRACT-adjacent** — schema-legal (composite UNIQUE permits it), but violates the step's own intent post-`8a1c7d25`; **grounded closure (Fold C item 7): `enrich_permits` re-derives fresh every run, so these do not permanently corrupt cached state, only the current dominant-parcel pick** | opened commit 2; Fold C item 7 |
| Finding 4 — disagreeing phase ternaries | `LP-D3` | **DEFECT** — Spec 122 §1.7's own worked example; origin order established this pilot (`5baaed5a` correct value 7, `2577e694` a month-later deviation, value 9) | opened commit 2 |
| Finding 5 — JS (non-PostGIS) fallback | *(no `LP-D*` — A-1 RULED, retirement is a declaration, not a defect-ledger row per the `link_massing` A-8/`compute_centroids` A-1(a) precedent)* | **CONTRACT-adjacent (dead-weight fallback), retired as a unit with its branch** | Fold A A-1 RULED; Spec 124 R-W (now landed, Fold C item 6 — see below) |
| Finding 6 — 5 undeclared tunables (T1–T5) | `LP-D4` | **DEFECT (Spec 124 Rule 3)** | opened commit 2 |
| Fold A B-1 — class F unimplemented in `write.js` | `LP-D5` | **CONTRACT-adjacent (a library gap, not a defect in this step's own logic)** | opened commit 2 |
| Fold B item 2 — NULL-coordinate spatial-tier permits | `LP-D6` | **DEFECT** — a NULL-coordinate permit should never resolve to any parcel via a distance join; evidence corrected at Fold C (parcel `439990`, not `id=1`) | opened commit 2, evidence corrected this pilot before commit 2 landed |
| Commit 1's new finding — second `permit_parcels` consumer | `LP-D7` | **CONTRACT** — `compute-cost-estimates.js`'s own dominant-parcel LATERAL is a genuine second product-facing derivation; `link-neighbourhoods.js` is a narrower CONTRACT-adjacent fallback exposure (Fold C blocking item 2, widened this commit) | opened commit 1, widened commit 2 |

### Fold C items folded into this classification (Ground-truth grounder, 2026-08-30 — full record: `.cursor/active_task.md` "Fold C" section, gitignored working file)

- **Item 6 — Spec 124 R-W is ALREADY LANDED, not a pending proposal.** Re-confirmed live this commit: Spec
  124's Register table (`:199`) carries R-W as a numbered row; `scripts/ast-grep-rules/compute-shape.yml:215`'s
  `compute-no-postgis-branch` rule is live, enforced by `check-step-shape.mjs` + `step-conformance.infra.test.ts`;
  `grep -rln "hasPostGIS|pg_extension" scripts/lib/compute/` → 0 files today. Finding 5's disposition above is
  written against the LANDED rule, not a future proposal — the plan's own Fold B item 7 "not yet folded" framing
  is stale and is NOT repeated here.
- **Item 7 — `enrich_permits` staleness after commit 8 is a GROUNDED CLOSURE, not an open gap.** Re-confirmed
  this commit: `scripts/enrich-permits.js` has no incremental filter; the production call site (`:621`) passes
  `scopeWhere:'TRUE'` explicitly; every run rebuilds the dominant-parcel derivation fresh via a live `JOIN
  permit_parcels`. Commit 8's ~10,616 relinks (out of this pilot's own commit 1–6 scope) self-heal the next
  time `enrich_permits` runs — no separate staleness mechanism needed or missing. Folded into `LP-D2`'s
  classification above (the 989-duplicate self-heal claim).

### Reality-Check — the fixed-rule sample (seed `20260830002`, N ≥ 100, stratified by flip-distance delta) — THE BEFORE HALF

**Executed live this commit** against `127.0.0.1:54322/postgres`, inside a rolled-back transaction (read-only
— no writes committed), re-deriving THE FIX's own predicate independently of both Fold A/B's prior
measurement and the grounder's own re-execution:

```sql
-- unconstrained KNN LATERAL, pa.id ASC tiebreak, geom IS NOT NULL, cap as scalar post-filter,
-- NULL-coordinate guard (LP-D6) — exact shape from "THE FIX" section of the governing plan
CROSS JOIN LATERAL (
  SELECT pa.id, pa.geom FROM parcels pa WHERE pa.geom IS NOT NULL
  ORDER BY pa.geom <-> ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326), pa.id ASC LIMIT 1
) c WHERE v.lng IS NOT NULL AND v.lat IS NOT NULL
  AND ST_Distance(c.geom::geography, point::geography) <= 100
```

**Headline: 10,616/17,500 (60.6%) flip** — 17,504 `spatial`-tier rows minus the 4 `LP-D6` NULL-coordinate
exclusions = 17,500 eligible, matching the grounder's own independent re-execution exactly (10,616, the
bottom of the plan's own claimed 10,616–10,625 range — the range reflects live-DB churn between the Fold-B
grounder's measurement and this one, not a methodology disagreement).

**Delta distribution** (`old_centroid_dist_m − new_boundary_dist_m`, flipped rows only, n=10,616):

| Bin | Count | % of flips |
|---|---:|---:|
| `neg` (new pick is farther in raw distance, but geometrically correct by boundary-distance reasoning) | 70 | 0.7% |
| `[0,1)` m | 24 | 0.2% |
| `[1,5)` m | 328 | 3.1% |
| `[5,20)` m | 3,655 | 34.4% |
| `[20,50)` m | 4,465 | 42.1% |
| `[50,∞)` m | 2,074 | 19.5% |

**Stratified sample**: `SELECT setseed(0.20260830002)`, 20 rows drawn per bin (6 bins × 20 = **120 rows**,
exceeding the N≥100 floor), `row_number() OVER (PARTITION BY bin ORDER BY random())`. For every sampled row,
measured: `old_contains` (does the permit's point fall inside the OLD/current parcel?), `new_contains` (does
it fall inside the NEW/THE-FIX parcel?), and whether the new pick is closer in absolute distance than the old
centroid.

**Plausibility result:**

| Bin | n | `old_contains=true` | `new_contains=true` | new pick closer (raw distance) |
|---|---:|---:|---:|---:|
| `neg` | 20 | 0 | 0 | 0/20 (by construction of this bin) |
| `[0,1)` | 20 | 0 | 0 | 20/20 |
| `[1,5)` | 20 | 0 | 2 | 20/20 |
| `[5,20)` | 20 | 0 | 11 | 20/20 |
| `[20,50)` | 20 | 0 | 11 | 20/20 |
| `[50,∞)` | 20 | 0 | 19 | 20/20 |
| **Overall** | **120** | **0** | **43 (35.8%)** | **100/120 (83.3%)** |

**The single strongest plausibility signal: 0/120 sampled OLD (current, centroid-proximity) picks EVER
achieve containment** — the current predicate is not merely sometimes-wrong, it is a candidate that is never
observed correct-by-containment in this sample, consistent with R-C's own structural finding (Strategy 3 Step
2 only fires when Step 1's `ST_Contains` has already failed for every candidate). **`new_contains` rate rises
monotonically with delta magnitude** (0% at the smallest-delta bin → 95% at the largest), exactly the pattern
expected if the delta metric tracks genuine correctness improvement, not noise. **Population-wide check
(not sampled — computed over the FULL 10,616-row flip population, same rolled-back transaction):
`new_contains=true` for 6,403/10,616 (60.3%)** — matches R-B's earlier containment-flip figure exactly
(6,403/17,504, the pure-containment subset of the larger KNN-boundary-distance flip population), confirming
internal consistency between this session's independent re-derivation and the plan's own prior measurement.

**The `neg` bin (70/10,616, 0.66% of flips) — the sample's weakest evidence, eyeballed individually.** All 20
sampled `neg`-bin rows show `old_centroid_dist_m` and `new_boundary_dist_m` within **0.6–6.5 m** of each other
(e.g. `15 218131 B06`: 25.69 m vs 26.43 m; `03 101811 PLB`: 91.92 m vs 98.24 m, the latter the exact p99
distance-cap boundary case) — near-ties between two plausible candidate parcels in an ambiguous gap area,
never a wildly-wrong pick. **Neither the old nor the new choice achieves containment for any of the 20 sampled
`neg`-bin rows** — this bin represents genuine ambiguity (the permit's geocoded point sits in a true gap
between parcels), not evidence against THE FIX; the delta metric correctly identifies these as the LOWEST-
confidence flips in the population, which is exactly what a plausibility-ranked metric should do.

**⚠️ Tiebreak-count discrepancy, flagged not silently resolved.** Independently re-measuring the KNN top-2
nearest-candidate distance gap over the same 17,500-row eligible population (own query, own transaction, own
session): **19 exact ties (`Δ=0`) + 40 near-ties (`0<Δ<1mm`) = 59 total under-1mm border cases** — NOT the
Fold B/Fold C-cited "19 exact + 72 near-ties (91 total)" figure. The exact-tie count (19) matches exactly; the
near-tie count does not (40 vs 72, mine measured via `LIMIT 2` + exact `ST_Distance` on the top-2 KNN
candidates per permit). Both measurements agree ties EXIST and a declared tiebreak (`pa.id ASC`) is REQUIRED —
the qualitative conclusion is unaffected — but the exact count feeding commit 6's tiebreak-determinism fixture
should be re-verified against a THIRD independent method before that fixture is written, rather than this
report silently picking one of the two disagreeing numbers. **Recommendation for commit 6:** build the fixture
around the 19 EXACT ties (100% agreement across all three measurements: plan/Fold-B, grounder, this commit) —
exact ties are the strongest, least ambiguous proof that `pa.id ASC` is load-bearing, and do not depend on
resolving the near-tie-count discrepancy.

### G6 verdict

**CLOSED this commit.** Every finding classified (`LP-D1`–`LP-D7`, 0 bare `INCIDENTAL`). Reality-Check's
fixed-rule sample executed live (seed `20260830002`, N=120 ≥ 100, stratified by flip-distance delta) — this
is **the BEFORE half of the R-O sample**; the AFTER half re-runs the identical query/sample logic post-fix at
commit 8 (out of this pilot's own commit 1–6 scope). Plausibility strongly supports THE FIX: 0/120 old picks
ever achieve containment, `new_contains` rate rises monotonically with delta magnitude, population-wide
containment-upgrade rate (60.3%) matches the plan's own prior R-B figure exactly. One discrepancy flagged
(tie count, non-blocking, qualitative conclusion unaffected) rather than silently resolved.

---

## §0. PH-0 seed — measured boundary table (2026-08-30 planning session)

### 0.1 Governing specs, read in order (Spec 124 §7 Step 0 / Spec 123 §6 G0)

1. **`docs/specs/00-architecture/00_system_map.md`** — has **no direct row** for `scripts/link-parcels.js`
   (grep over the file returns zero hits — same absence pattern as pilot 6's `compute_centroids`). The
   owning entries are the **Pipeline** section row **41** (`01-pipeline/41_chain_permits.md`, "Permits" —
   `link_parcels` is Step 9 of its own §Step Breakdown, `:53`) plus the two upstream source specs that name
   it as a consumer.
2. **Spec 55 `55_source_parcels.md` §4** — *"Consumed by: `link-parcels` Strategy 1b/2/3 (legacy
   parcels-table exact + name-only + spatial)."*
3. **Spec 54 `54_source_address_points.md` §4** — *"Consumed by: `link-parcels` Strategy 1a."*
4. **Spec 65 `65_enrich_parcels.md`** — read for the task's own stated premise ("what does `enrich_parcels`
   need from `permit_parcels`"). **Finding: the premise is FALSE.** §Operating Boundaries `:318` states
   explicitly: *"`permit_parcels` / `lead_parcels` — owned by Specs 41/42/55; WF2 only reads `parcels`."*
   `enrich_parcels` never joins `permit_parcels`. The real downstream consumer within the `permits` chain is
   **`enrich_permits`** (Spec 66, `enrich-permits.js`, chain step 10 — the step immediately AFTER
   `link_parcels`), which reads `permit_parcels` to propagate the dominant linked parcel's zoning feed onto
   `permits` (Spec 41 §Step Breakdown row 10 confirms: *"copies the dominant linked parcel's zoning by-law
   feed ... via `permit_parcels`"*).
5. **`docs/reports/defect-ledger.md`** rows `CC-D2`/`CC-D3` — both **PIN** against `compute_centroids`, both
   naming `link-parcels.js:411-426` as the downstream exposure this pilot exists to fix. Read in full,
   §0.6 finding 1.
6. **`docs/reports/review_followups.md`** "Programme backlog seeding (R-T, 2026-08-29)" — the HIGH followup
   entry: *"6,808 of 17,500 (38.9%) [spatial-tier] links would resolve to a different parcel under
   `ST_PointOnSurface`/containment vs. the current `ST_DWithin`/`ST_Distance` nearest-centroid join."*
7. **Spec 124** (§2 Rules 1–13, §3 archetype variance table, §5 Register R-A..R-V, §7 the declared-change
   ladder, §8 the standard step as built, §9 known concerns per archetype). Governs on any conflict with
   older Spec 122 prose.
8. **Spec 122** (§1.4 write_discipline — class F `link_full_retraction`, `link_parcels` named at step 10 of
   its own frozen enum; §1.5 staleness; §1.7 sharing — `link_parcels` is this section's OWN worked example,
   `:302`/`:505`, for the "two disagreeing phase ternaries" defect; §1.8 the archetype table, LINK has 3
   members — `link_parcels`(10), `link_massing`(15, converted), `link_neighbourhoods`(17, not yet
   converted); §8.2 pilot order).
9. **Spec 123** (§2 phases/gates, §3 PIN-vs-FIX, §6 gates G0–G9, §7 nine-commit procedure).
10. Pilot 6's plan (`.cursor/pilot6_compute_centroids_active_task.md`) as the template (Folds C/D structure,
    Rule-13 pre-staging list, R-F carried-items convention). Pilot 3's plan/report (`link_massing`, the
    FIRST LINK member) for `runLinkPhase`'s proven shape, the E1 `guard:"none"` Rule-9 grandfathering
    precedent, and the LM-D13 nearest-tiebreak-declared precedent (distance ASC, footprint_area DESC, id
    ASC) — cited as the model for THE FIX's own tiebreak question (see Idempotency Lens ask in the plan).
11. `docs/reports/review_followups.md`'s "[HIGH · B3 output-panel grounding]" entry — names `sources:link_parcels`
    stranded 2026-06-10, reaped 2026-07-19 (39 days) as one of 19 stranded rows the admin-stats reaper
    silently cleared — re-confirmed live this session as `pipeline_runs` id 1049 (§0.3).
12. `tasks/lessons.md`, `scripts/CLAUDE.md` (Spec 47 §R1–R12 skeleton), `docs/specs/00_engineering_standards.md`
    §11 (Plan Compliance Checklist).

### 0.2 File metrics — `scripts/link-parcels.js`, measured this session

| Metric | Value | Grounds |
|---|---|---|
| Lines | **686** | `wc -l` |
| `pipeline.run(` | **1**, at module scope, **line 124** — no `require.main === module` guard, no `module.exports` anywhere in the file | matches Spec 122 `:759`'s own citation of `link-parcels.js:124` as a live violation of the `pipeline.step()` factory-only contract, same class as every unconverted script |
| `try` / `catch` / `finally` | **1 / 1 / 0** (top-level) | the JS-fallback's per-row `JSON.parse` guard (`:463-465`) |
| `pool.query`/`client.query` | **~24 sites** across the `while(true)` batch loop | 1 count query, 1 centroid-availability check, 1 PostGIS-extension check, the batch CTE (1a/1b/2), the PostGIS spatial containment + centroid-fallback queries, the JS-fallback per-permit candidate query, the batch upsert, the ghost-cleanup DELETE ×2, the `parcel_linked_at` UPDATE, plus the final cumulative-link-rate query |
| `Date.now(` / `new Date(` | **1 / 0** | `startTime` only (elapsed-time), `:134` — `RUN_AT` is sourced via `pipeline.getDbTimestamp(pool)` (`:126`), Rule-3.5-compliant already |
| `process.env` | **1 direct read** (`process.env.PIPELINE_CHAIN` at `:660`) + **1 indirect** (`chainId` local var, sourced from `process.env.PIPELINE_CHAIN` at `:181` for the zero-permits path) — **two disagreeing sites, same axis** (Finding 4) | `grep -n "process.env"` |
| `process.argv` | **0** | `pipeline.isFullMode()` (`:133`) is the SDK's own argv reader, not a direct read in this file |
| `emitSummary` / `emitMeta` | **2 / 2** | zero-permits early-return pair (`:182-204`), real-run completion pair (`:643-683`) — no orphan emit site |
| `ADVISORY_LOCK_ID` | **90** (module const, `:51`) | Spec 47 §A.5 registry — unique, no collision (`grep -rn "ADVISORY_LOCK_ID\s*=\s*90" scripts/` → exactly this one file) |
| `console.*` | **0** | fully migrated to `pipeline.log.*` |
| `throw` | **1** (`:129`, `LOGIC_VARS_SCHEMA` validation failure) | the only thrown error in the file — malformed geometry in the JS fallback is caught and treated as no-match, never halts |
| Declared/consumed `logic_variables` | **2** (`spatial_match_max_distance_m`, `spatial_match_confidence`) — both Zod-validated via `LOGIC_VARS_SCHEMA` (`:45-48`) and consumed via `loadMarketplaceConfigs` (`:127-131`) | `SELECT variable_key FROM logic_variables WHERE variable_key ILIKE '%link_parcels%' OR ILIKE '%parcel_link%'` → 0 rows (the two registered names don't match either LIKE pattern — they're named for the mechanism, `spatial_match_*`, not the step); confirmed present via direct name lookup instead |

### 0.3 Manifest / chain wiring — measured, not the header comment trusted blind

| Field | Value | Grounds |
|---|---|---|
| `manifest.json:28` | `"link_parcels": {"file":"scripts/link-parcels.js","supports_full":true,"supports_dry_run":false,"telemetry_tables":["permit_parcels","permits"],"telemetry_null_cols":{"permits":["latitude","longitude"]}}` | live file — both `supports_*` flags TRUE-to-the-code |
| Chain membership | **TWO chains** — `permits` (`manifest.json:79`, position 9 of 32, no `chain_args`) AND `sources` (`manifest.json:105`, position 6 of 28, immediately after `link_parcel_addresses`/`compute_centroids`, no `chain_args`) | `grep -n "link_parcels" scripts/manifest.json` — genuinely shared, Spec 122 §1.7's `×2` category (`:483`) |
| `converted.json` (Spec 122 §5.1 enforcement scope) | **6 entries today**: `assert-schema.js`, `load-ravines.js`, `link-massing.js`, `link-wsib.js`, `link-parcel-addresses.js`, `compute-centroids.js`. `pending: []`. `link-parcels.js` in neither | live file, this session |
| `grandfathered.json` | 4 real-step entries (`link_massing`, `link_parcel_addresses`, `compute_centroids`) + 2 schema fixtures | live file — `link_massing`'s E1 `guard:"none"` precedent is the closest analogue for whether `link_parcels`'s own ghost-cleanup DELETEs need the same treatment (not yet determined this session) |
| `step.schema.json` LINK `allOf` profile | `invalidates` non-empty, `counters` object required (Spec 124 §3 Rule-7 row) | schema file |

### 0.4 The task's own premise, corrected

The dispatching prompt asked what Spec 65 (`enrich_parcels`) needs from `permit_parcels`. **Measured: nothing.**
`docs/specs/01-pipeline/65_enrich_parcels.md:318` states `permit_parcels`/`lead_parcels` are explicitly
out-of-scope for that step — *"WF2 only reads `parcels`."* The chain-position adjacency (`link_parcels` at
`sources`-chain index 6, `enrich_parcels` later in the SAME chain at index ~19) is coincidental array
ordering, not a data dependency — the same class of finding Spec 122 `:1024` already made about
`chain.logic.test.ts`'s false `enrich_ravines == link_parcels + 1` lock. The REAL cross-step contract this
pilot's `emitMeta` writes-list feeds is **`link_parcels` (permits step 9) → `enrich_permits` (permits step
10)**, both inside the `permits` chain, one step apart — `enrich-permits.js` reads `permit_parcels` directly
for its dominant-parcel zoning propagation (Spec 41 §Step Breakdown row 10; Spec 66).

### 0.5 THE core defect this pilot fixes — CC-D2/CC-D3, PIN against `compute_centroids`, HIGH followup filed against THIS file

Measured this session (re-confirms, does not re-derive, pilot 6's own PIN'd findings):

| Check | Query/source | Result |
|---|---|---|
| `spatial`-tier `permit_parcels` row count | `SELECT match_type, COUNT(*) FROM permit_parcels GROUP BY match_type` | **17,504** rows at `match_type='spatial'` (confidence 0.65) — vs. the followup's 17,500 measured 2026-08-29 (4-row drift, ordinary incremental churn) |
| Full match-type distribution | same query | `exact_address` 152,975 (0.95) · `address_points_exact` 48,815 (0.97) · `spatial_polygon` 17,651 (0.90) · `spatial` 17,504 (0.65) · `name_only` 4,227 (0.80). Total **241,172** |
| The followup's own measurement (not re-executed this session — cited, not re-derived, per the grounding scope) | `docs/reports/review_followups.md` "Programme backlog seeding (R-T, 2026-08-29)" | ~~6,808/17,500 (38.9%)~~ ~~**Fold A CORRECTION: 10,625/17,504 (60.7%) under THE FIX's own predicate (KNN boundary-distance + declared tiebreak), directly measured, not inherited — see "Fold A" section above**~~ **Fold B (item 8, grounder re-execution): 10,616–10,625 of 17,5xx (60.7%) — a range, not a point figure; the `spatial`-tier population itself churns row-to-row under ordinary incremental writes during a live-DB re-measurement, but the governing ratio is unchanged from Fold A — see "Fold B" section below** of the `spatial`-tier population would resolve to a DIFFERENT parcel under `ST_PointOnSurface`/containment vs. the current nearest-centroid join |
| Root cause (CC-D2, PIN against `compute_centroids` — not a defect there) | `docs/reports/defect-ledger.md` CC-D2 row | `ST_Centroid` can fall outside a concave polygon or drift toward a neighbour parcel; 3,626/486,530 (0.75%) of ALL parcels' stored centroids land outside their own polygon, 3,130 of those land inside a DIFFERENT parcel |
| The affected code | `scripts/link-parcels.js:411-426` (per `defect-ledger.md` CC-D2/CC-D3's own citation, matching this session's own read at `:403-432`, "Step 2: Centroid proximity fallback") | `ST_DWithin`/`ORDER BY ST_Distance` against `pa.centroid_lng/centroid_lat` (materialized columns), never against `pa.geom` directly |
| The UNAFFECTED sibling code | `scripts/link-parcels.js:387-401`, "Step 1: Polygon containment matches" | `ST_Contains(pa.geom, point)`, `match_type='spatial_polygon'`, confidence 0.90, **17,651 rows** — already geometry-correct, untouched by CC-D2/CC-D3, untouched by THE FIX |

### 0.6 The six findings (full text and code citations: `.cursor/pilot7_link_parcels_active_task.md` "The six findings" section)

1. **THE FIX target** — Strategy 3 Step 2's centroid-based fallback join (§0.5 above). Fix design: rewrite
   the `ST_DWithin` bound + ORDER BY predicates to operate on `pa.geom` directly (boundary distance)
   instead of the materialized centroid point — Spec 124 §7 rung (e), a declared compute change, last
   resort. ~~`ORDER BY ST_Distance(...)`~~ ~~**Fold A (Integration B-3): the literal `ST_Distance` form did
   not finish a 1,000-row batch in 180 s; THE FIX ships the KNN form `pa.geom <-> point` (LATERAL,
   GiST-accelerated, 171–196 ms/batch) plus a declared tiebreak `, pa.id ASC`.**~~ **Fold B (item 1): the
   KNN-vs-`ST_Distance` ruling stands, but keeping `ST_DWithin` co-resident with the KNN `ORDER BY` (as Fold
   A's plan text still showed) measured 97.5 s/batch — THE FIX SHIPS an unconstrained KNN LATERAL with the
   cap applied as a scalar post-filter afterward, measured 400–500 ms/batch, 24–33 s full population; tiebreak
   `, pa.id ASC` reconfirmed with new evidence (19 exact ties + 91 near-ties < 1 mm).** Full fix text: plan
   "THE FIX" section.
2. **Doc-rot** — Spec 41 §Step 9's prose claims `link-parcels.js` "writes to unified `lead_parcels` table
   ... instead of legacy `permit_parcels`." FALSE against the live script (`:515` `INSERT INTO
   permit_parcels`; `manifest.json:28` `telemetry_tables:["permit_parcels","permits"]`; both `emitMeta`
   calls declare `permit_parcels` only). The unification is `migrations/144_mirror_permit_parcels_to_lead_parcels.sql`'s
   `trg_mirror_permit_parcels_to_lead_parcels` trigger — a DB mechanism, not application code. Measured:
   `permit_parcels` = 241,172 rows; `lead_parcels` = 270,709 rows (higher — also receives direct CoA-side
   writes from `link-coa-to-parcels.js`, plus its own `tier_1a_exact` match_type absent from
   `permit_parcels`).
3. **989 duplicate (permit_num, revision_num) pairs** in `permit_parcels` — pre-dates the 2026-04-01
   retraction-on-relink fix (`8a1c7d25`), never backfilled, permanently unreachable by the incremental
   filter. Sample: permit `"08 159001 BLD"` rev `"00"` carries both `parcel_id 427985` (linked 2026-02-20)
   and `parcel_id 461960` (linked 2026-03-03). The declared FULL re-run (plan commit 8) is expected to
   self-heal these — measured before/after, not assumed.
4. **Two disagreeing `phase` ternaries** — `:186` (`chainId==='sources'?6:9`) vs `:660`
   (`PIPELINE_CHAIN==='sources'?6:7`) — same axis, different non-`sources` value. Already filed MED
   (`review_followups.md:2985`) and named as Spec 122 §1.7's own worked example (`:302`,`:505`). This
   pilot is where the `sharing.varies_by_chain.phase` map fix actually lands.
5. **JS (non-PostGIS) fallback** (`:433-478`) — a second, independent implementation of the SAME
   centroid-nearest defect, gated behind a `pg_extension` runtime check. Third occurrence of the
   `link_massing` A-8 / `compute_centroids` A-1(a) retirement shape in this programme — flagged as Ask A-1,
   not yet ruled.
6. **Rule 3 partial compliance** — `spatial_match_max_distance_m`/`spatial_match_confidence` ARE
   correctly registered logic variables; the four tier-confidence constants (0.97/0.95/0.90/0.80) and the
   `link_rate >= 75%` gate threshold are NOT — five undeclared literals, full inventory: plan's "P4 tunable
   inventory" table (T1–T5).

### 0.7 Write-discipline surface (re-derived per Spec 122 R5 — never trust the port)

One write target, `permit_parcels`, class **F** `link_full_retraction` — Spec 122 §1.4's own frozen-enum
table names `link_parcels` (step 10) alongside `link_massing` (step 15) as this class's two members; ~~no
mislabel found, exact match~~. **Fold A CORRECTS this (Integration B-1): the schema enum names class F
correctly for both steps, but class F is UNIMPLEMENTED in `write.js` — `link_massing` actually executes
`set_based_scoped` + `guarded_upsert` via its `is_primary` flag, not the enum's declared
upsert+DELETE-stale+DELETE-zero-match mechanic; `permit_parcels` has no equivalent flag column, so it cannot
reuse that path. ~~LG-22 (`executeGuardedDeleteByKey`) is the first REAL class-F executor either LINK member
has shipped.~~ **RENUMBERED at Fold B (item 3): `executeGuardedDeleteByKey` is `LG-24`, not `LG-22` — CC-D3
independently claimed `LG-22` (`executeGuardedUpdate`) before this pilot's rebase. `LG-24` is the first REAL
class-F executor either LINK member has shipped.** Key: `(permit_num, revision_num, parcel_id)` — matches the
live UNIQUE constraint (confirmed: `permit_parcels_permit_num_revision_num_parcel_id_key`), NOT `(permit_num,
revision_num)` alone, which is WHY Finding 3's 989 duplicates are schema-legal rather than
constraint-violating. Guard: `is_distinct_from` on `(match_type, confidence)` (`:521-522`).

**`writes[]` declared ORDER (Fold B item 5, NEW):** upsert the new match, THEN `LG-24`'s keyed DELETE of the
row(s) it superseded — one `executeOrderedWrites` transaction. The FULL target is a separate scoped
`retract:"all"` (`match_type='spatial'`, `retract_when: full_only`) through the existing W1 before-image path;
`LG-24`'s own before-image is ONE file per run, appended per batch.

⚠️ ~~**Open question, not resolved this session:** the batch loop runs the UPSERT inside one
`withTransaction` (`:513-527`) and the ghost-cleanup + `parcel_linked_at` UPDATE inside a SEPARATE
`withTransaction` (`:533-581`) — two transactions per batch. Whether this two-transaction shape is itself
contributing to Finding 3's duplicate class GOING FORWARD (not just as a pre-`8a1c7d25` historical
artifact) is Ask A-2 in the governing plan, unresolved pending PLAN-panel Integration review.~~ **RESOLVED
at Fold A (Integration B-1): `LG-24` (renumbered at Fold B item 3; was LG-22) folds the ghost-cleanup DELETE
into the SAME `executeOrderedWrites` set as the upsert — one batch transaction, not two; no crash window to
declare going forward.**

### 0.8 Reality-Check — ask table seed (full table + dispositions: plan "Reality-Check" sections)

Headline measured this session: **17,504** `spatial`-tier rows (consistent with the followup's 17,500,
4-row drift only); **989** duplicate-row permits; **100%** of parcels have `centroid_lat` populated
(486,530/486,530 — post-migration-245 steady state, no drift from pilot 6's own measurement one day
earlier). ~~**Fold A (2026-08-30, Reality-Check, executed): flip rate under THE FIX's OWN predicate =
10,625/17,504 (60.7%)**~~ **Fold B (item 8, grounder re-execution): 10,616–10,625 of 17,5xx (60.7%), a range
from live-DB churn during re-measurement — same governing ratio**, not the inherited 38.9%/6,808; pure
containment alone = 6,403/17,504 (36.6%), a subset; 17,500/17,504 `spatial`-tier points are not inside their
currently-linked parcel (structurally expected); `enrich_permits` confirmed sole consumer (lines
88,335,339,365,543,813, Fold B re-grepped identical); 989-row self-heal is expected, not merely predicted,
under the declared FULL run. **NEW at Fold B: 4 `spatial`-tier permits have NULL lat/lng yet are linked
(`LP-D6`, item 2) — the FULL run retracts, does not relink, these 4 (surfaced by the Cross-read Adversary
walking THE FIX's input-domain coverage, a checklist gap Fold A's own panel did not walk).** ~~Not yet
executed this session (filed as commit-4/commit-8 work in the governing plan): the R-O-style fixed-rule
sample (seed `20260830002`, N=60) against the 6,808 predicted flips;~~ **WIDENED at Fold A: N ≥ 100,
stratified by flip-distance delta, against the 10,625 predicted flips — still not yet executed, filed for
commit 4.** the before/after duplicate self-heal count; the post-fix `link_rate` re-measurement.

### Fold A (2026-08-30, PLAN panel: Integration + Reality-Check + Idempotency, executed)

Full findings, rulings, Rule 13 pre-staging list, and IDEMPOTENCY mechanics: governing plan's own **"Fold A
(2026-08-30, PLAN panel: Integration + Reality-Check + Idempotency, executed)"** section (placed after
"Panel plan"). Headline corrections that supersede figures elsewhere in this report:

* **Flip rate corrected: 10,625/17,504 (60.7%) under THE FIX's OWN predicate (KNN boundary-distance +
  declared tiebreak `, pa.id ASC`), not 38.9%/6,808** (§0.5/§0.6 finding 1/§0.8, below, superseded). Pure
  containment alone flips 6,403/17,504 (36.6%), a subset of the 10,625. 17,500/17,504 `spatial`-tier permit
  points are not inside their currently-linked parcel (structurally expected — Strategy 3 Step 2 only fires
  when Step 1's `ST_Contains` already failed). **Fold B item 8 (grounder): re-measured as a range,
  10,616–10,625/17,5xx, same 60.7% ratio.**
* **Class F (`link_full_retraction`) is UNIMPLEMENTED in `write.js`** — `link_massing` does NOT use the
  upsert+DELETE-stale+DELETE-zero-match mechanic the schema enum implies; it uses `set_based_scoped` +
  `guarded_upsert` via `is_primary`, which `permit_parcels` cannot reuse (no flag column) → ~~**LG-22**~~
  **`LG-24`** `executeGuardedDeleteByKey` (renumbered at Fold B item 3; also resolves the two-transaction
  crash window, §0.7 below, superseded).
* Composite-key keyset pagination is unsupported by `runLinkPhase` today (`permits` PK has no surrogate
  `id`) → ~~**LG-23**~~ **`LG-25`** (renumbered at Fold B item 3).
* THE FIX's literal `ORDER BY ST_Distance(pa.geom, point)` did not finish a 1,000-row batch in 180 s (2
  tries) → ~~THE FIX ships the KNN form `pa.geom <-> point` (LATERAL, GiST-accelerated), 171–196 ms/batch,
  3–5 s for all 17,504 rows~~ **AMENDED at Fold B (item 1): that 171–196 ms/batch timing was measured with
  the KNN `ORDER BY` alone, without the pre-existing `ST_DWithin` bound left co-resident — measured together,
  97.5 s/batch. THE FIX SHIPS an unconstrained KNN LATERAL with the cap as a scalar post-filter instead:
  400–500 ms/batch, 24–33 s for the full 17,504 `spatial`-tier population**, plus a declared tiebreak `, pa.id
  ASC` (LM-D13 precedent, reconfirmed at Fold B: 19 exact ties + 91 near-ties < 1 mm). The commit-8 budget's
  71-minute extrapolation (built on the non-viable form) is struck; the 171–196 ms/batch figure it was
  re-struck against is also superseded by the Fold-B-shaped timing above.
* Asks A-1 (retire JS fallback), A-2 (resolved via `LG-24`), A-3 (KNN, decided on timing; SQL shape further
  amended at Fold B item 1), A-4 (real library growth: `LG-24`+`LG-25`+`UNION ALL` tier-folding — zero-growth
  hypothesis REFUTED; fork condition amended at Fold B item 4 to unconditional), A-5 (`phase=7` for `permits`,
  `link_wsib` precedent) are all RULED, not open.
* **`enrich_permits` confirmed the sole `permit_parcels` consumer**, read sites at lines 88, 335, 339, 365,
  543, 813 (Fold B item 8: re-grepped, identical, no drift); the 989 duplicate-permit rows (out of scope,
  RC-5) are expected — not merely predicted — to self-heal under the declared FULL run.
* **IDEMPOTENCY RULED:** the FULL re-evaluation is a scoped mass retraction (`retract:"all"` scoped
  `match_type='spatial'`, verbatim in the descriptor — `write.js:291-295` refuses unscoped) then rebuild with
  the declared tiebreak; twice-run = identical set. Kill-mid-run loses ≤1 batch; R-B's generic reader
  (`staleness.js:494-504`) forces full next run. R-M's before-image (generic in `runLinkPhase` W1,
  `index.js:719-721`) extends to `LG-24` (renumbered at Fold B item 3), appended per batch into ONE per-run
  file (Fold B item 5).
* **SEQUENCING RULE WIDENED:** both this pilot's pre-conversion baseline capture AND its library work now
  start only after CC-D3 lands — data AND `index.js`/`write.js`/schema code — not merely the data dependency
  as originally reasoned in §0's "Sequencing note" (that framing is struck in the governing plan). Rebase
  before starting commit 7.

### Fold B (2026-08-30, fold-validation of Fold A — grounder CONFIRMED every number; Cross-read Adversary verdicts below)

Full findings and text: governing plan's own **"Fold B (2026-08-30, fold-validation of Fold A — grounder
CONFIRMED every number; Cross-read Adversary verdicts below)"** section (placed after Fold A). Headline:

* **Grounder (item 8) RE-EXECUTED, not re-read, every Fold-A-carried number:** composite PK, class-F
  schema-only status, fence `8a1c7d25`, `enrich_permits` consumer lines (88, 335, 339, 365, 543, 813),
  989 duplicate pairs, `phase=7` for `permits`, distance cap (**98.24 m / p99 75.19 m**, tighter precision on
  Fold A's 98.2/75.2 m, same population), and flip rate (**10,616–10,625 of 17,5xx, 60.7%** — a range, not a
  point figure, from ordinary live-DB churn during re-measurement; ratio unchanged). All CONFIRMED, no drift
  beyond the stated range.
* **Cross-read Adversary — 7 verdicts:**
  1. **SQL shape (item 1) — Fold A B-3 amended.** The co-resident `ST_DWithin`+KNN form (Fold A's plan text
     still showed the bound predicate alongside the KNN `ORDER BY`) measured 97.5 s/batch — never tested
     together at Fold A. THE FIX ships an unconstrained KNN LATERAL with the cap as a scalar post-filter:
     400–500 ms/batch, 24–33 s full population. Tiebreak `pa.id ASC` reconfirmed: 19 exact ties + 91 near-ties
     (< 1 mm).
  2. **`LP-D6` (item 2) — NEW.** 4 `spatial`-tier permits with NULL lat/lng, linked via an arbitrary parcel
     (~~`id=1`~~ **CORRECTED at Fold C, 2026-08-30, Ground-truth grounder, blocking item 1: `parcel_id 439990`
     for all 4, independently re-verified — never `id=1`; the LP-D6 requirement itself is unaffected**) under
     naive KNN. THE FIX's compute adds an explicit `WHERE v.lng IS NOT NULL AND v.lat IS NOT
     NULL` guard; a WARN check `spatial_null_coordinate_permits` counts them; the FULL run retracts, does not
     relink, these 4. Red-first NULL-coordinate lock required.
  3. **LG numbering (item 3) — CONFIRMED collision.** CC-D3 claimed `LG-22` first. `LG-22`→`LG-24`,
     `LG-23`→`LG-25` throughout the governing plan; confirm the actual next-free numbers AT REBASE against
     CC-D3's landed state, not guessed.
  4. **A-4 fork condition (item 4) — staleness found.** Fold A's ">~150 lines" fork threshold was invented,
     not part of the pilot-4 precedent it cites (`index.js:263-268`), which was unconditional both prior
     times. `runLinkKeyedPhase` forks unconditionally; `runLinkPhase` (245 lines, `index.js:636-880`) stays
     untouched.
  5. **`writes[]` order (item 5) — not previously stated.** Upsert then `LG-24`'s keyed delete, one
     transaction; FULL target is a separate scoped `retract:"all"` through the existing before-image path,
     `LG-24`'s own before-image appended per batch into that same per-run file.
  6. **Product exposure (item 6) — ratified, no collision.** Surface = `enrich_permits` dominant-parcel
     zoning propagation; no phased rollout (the write shape has no partial-migration state); commit-8's
     done-test states the ~10.6K relinks and the 4 `LP-D6` retractions as EXPECTED, not surprises.
  7. **Spec 124 addendum R-W (item 7) — new proposal, not self-authorizing.** "Compute MUST NOT branch on
     PostGIS availability (`hasPostGIS`/`pg_extension`); `guards.requires` is the only legal form" + a
     conformance grep lock over `scripts/lib/compute/**`. Filed for the Spec 122/123/124 owner's own fold,
     same status as this plan's §8.2 correction.
* No item reverses a Fold A ruling — the KNN-vs-`ST_Distance` decision, A-1/A-5 rulings, and IDEMPOTENCY
  mechanics all stand; every Fold B item narrows, extends, or corrects a genuine gap in Fold A's own coverage.

### 0.9 Proposed §8.2 line-text correction

See `.cursor/pilot7_link_parcels_active_task.md`'s "Proposed §8.2 line-text correction" block, reproduced
here verbatim for the Spec 122/123 owner to fold without cross-referencing the plan file:

> **Pilot ORDER correction (operator ruling 2026-08-30).** `7 link_parcels (LINK, 2nd member) — ruled
> 2026-08-30`, superseding the previously-tentative `refresh_snapshot` (RECORDER, forced single-member)
> placement at pilot 7. Why: pilot 6's own HIGH followup (`RT-CC3`, `defect-ledger.md` CC-D2/CC-D3, both
> PIN) measured that ~~6,808/17,500 (38.9%)~~ ~~**10,625/17,504 (60.7%), corrected at Fold A 2026-08-30 under
> THE FIX's own predicate**~~ **10,616–10,625 of 17,5xx (60.7%), re-measured as a range at Fold B 2026-08-30
> (item 8, grounder) — same ratio, tighter honesty about live-DB churn** of `link_parcels`'s Tier-3 `spatial`-tier links would resolve to a
> different parcel under a containment/`ST_PointOnSurface` join vs. the current nearest-centroid join — the
> conversion pilot delivers the fix INLINE (Spec 124 §7's declared-change ladder, rung (e)), aligned with
> Spec 55 (parcels source) and Spec 65 (whose Operating Boundaries this pilot corrects — `enrich_parcels`
> does NOT consume `permit_parcels`; the real downstream consumer is `enrich_permits`/Spec 66, the very next
> `permits`-chain step). `refresh_snapshot` (RECORDER) and `enrich_parcels` (ENRICHER) shift to pilots 8/9
> respectively — LINK's third member (`link_neighbourhoods`) remains unscheduled, same "ruled one at a time
> at each cutover" posture §8.2 already states for pilots 5–8.

---

*This report is a §0 stub only (PH-0 seed, planning-session numbers). PH-1 through PH-9 promote this
section incrementally at each commit, per the governing plan's Commit ledger — not written here, per this
pilot's plan-only scope (no code, no commits, no DB writes beyond the SELECTs already executed and cited
above).*
