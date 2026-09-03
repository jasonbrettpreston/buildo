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

### G4 — risk class, full pass this commit (G4, Spec 121 §3 PH-4 — risk class = chance × impact)

**Risk class: B/C-going-on-A.** Chance is MODERATE-HIGH — 56.25% fix density (18/32, the highest of any pilot
to date) over 32 commits is genuine sustained churn. Impact is HIGH — confirmed multi-consumer (`enrich-
permits.js` zoning propagation, `compute-cost-estimates.js`'s cost-model inputs, plus the LP-D7-widened set:
`link-neighbourhoods.js`, quality gates, 3+ admin/API read paths) and, as of commit 8/8a, EMPIRICALLY
validated by two real defects found only by executing (THE FIX's own centroid-join bug, and `LP-D9`'s
Strategy-1a street_type gap) — a chance/impact pairing this pilot's own commit 8 measured directly, not
merely estimated in advance.

**Chance** = 32 commits (small-mid corpus) + 56.25% fix density (highest of any pilot to date, re-confirmed) +
2 genuinely load-bearing fences (`8a1c7d25` ghost-cleanup atomicity, `7c75e92e` PostGIS offload) ≈ 6.25% fence
density → **CLASS B/C**, same as pilot 6 (no churn×complexity instrument exists — G2 stays ⛔ ABSENT,
standing programme gap). **Impact** = **HIGH**, raised from "moderate" on the strength of this commit's own
new finding: TWO independent product-facing consumers now confirmed (`enrich-permits.js`'s zoning
propagation AND `compute-cost-estimates.js`'s lot_size_sqm/frontage_m cost-model input), not one — plus the
pre-filed HIGH followup (CC-D2/CC-D3 exposure) this pilot exists to close.

**`ASSESSMENT-INCOMPLETE` is claimed here because** no churn×complexity instrument exists to formally plot
the quadrant (same standing programme gap link_massing/pilots 1-6 all recorded — `ls scripts/analysis | grep
-i "churn\|complex\|risk"` still returns nothing as of this commit). The risk-class analysis above stands on
its own qualitative reasoning (fix density + confirmed multi-consumer impact + two empirically-found defects),
it is simply not mechanically plotted. Recorded per Spec 123 §6.2 clause 3. Not scored.

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
| `d2050cfc` | 2026-03-10 | `records_new`/`records_updated` correction: `{new:totalLinked, updated:0}` → `{new:0, updated:totalLinked}` (this step only UPDATEs, never INSERTs new rows in the counter sense) | ✓ current file: `records_updated: totalLinked` (`:646`) — byte-identical | **preserved-in-compute** — verbatim-ported to `compute.js` at commit 7 | `:644-646` current file; grounded in notes.json (why: R2, commit 14) |
| `5baaed5a` | 2026-03-26 | **Origin of ONE side of Finding 4's phase disagreement** — `phase: (process.env.PIPELINE_CHAIN === 'sources') ? 6 : 7` introduced at the real-run `audit_table` site (part of a 3-chain phase-renumbering sweep: "Permits: fix refresh_snapshot 5→14, link_coa 4→12...") | ✓ current file `:660`, byte-identical | **encoded-as-descriptor-field** — becomes `sharing.varies_by_chain.phase` at commit 7 (A-5 RULED: `permits`=7, matching THIS commit's own value) — this commit's `7` is the CORRECT side of Finding 4/`LP-D3`'s disagreement, not the defect | direct diff this commit |
| `a760e0e7` | 2026-03-27 | Cumulative link rate (denominator = ALL permits, not run-scoped); renamed `total_matched`→`run_matched` | ✓ current file `:614-621,637`, byte-identical mechanism, literal `75` threshold unchanged | **preserved-in-compute** — the cumulative-rate MECHANISM is verbatim-ported; the literal `75` becomes `T5`/`link_parcels_link_rate_warn_pct` (Finding 6) at commit 7, same default value, a Rule-3 externalization not a threshold change | `:614-621` current file; grounded in notes.json (why: R2, commit 14) |
| `369341ae` | 2026-04-01 | 4 fixes in one commit: (a) keyset cursor replacing OFFSET pagination, (b) blank-to-blank street-type exact match, (c) zero-address regex `/^0+(?=\d)/`, (d) `pointInGeoJSON` doughnut-hole (interior ring) exclusion | (a)(b)(c) ✓ current file, byte-identical (`:232`, `:329`, `:251`); (d) ✓ current file `:77-103` but JS-fallback-only | **SPLIT disposition**: (a)/(b)/(c) **preserved-in-compute** — (a) generalizes into `LG-25`'s composite-key keyset pagination at commit 7 (the SAME shape this commit pioneered, now lifted into the shared library); (b)/(c) fold into `primary_match_sql`'s `UNION ALL` verbatim. (d) **knowingly-retired** — retires WHOLE with the JS fallback (A-1 RULED); the hole-exclusion LOGIC has no PostGIS-branch analogue to preserve (`ST_Contains` already respects polygon holes natively) | direct diff this commit; current file line citations; grounded in notes.json (why: R2, commit 14) |
| `568f5787` | 2026-04-01 | Defensive `try/catch` around JS-fallback `JSON.parse(bestGeometry)` — malformed geometry no longer crashes the batch | ✓ current file `:463-465`, the file's ONLY try/catch (1/1/0, confirmed commit 1) | **knowingly-retired** — retires WITH the JS fallback (A-1 RULED); the guard's PURPOSE (never let one malformed row crash the run) has no PostGIS-branch analogue needed — `ST_Contains`/the KNN operator on a NULL/invalid `geom` is filtered by the `WHERE geom IS NOT NULL` predicate itself, not a per-row try/catch | `:463-465` current file |
| `a21b7b01` | 2026-04-01 | Timestamp-based incremental filter (`parcel_linked_at IS NULL OR parcel_linked_at < last_seen_at`, replacing a `NOT EXISTS` shape that infinite-looped on unmatchable permits) + ghost cleanup for ZERO-match permits only | Superseded 2 weeks later — `f0daba71` replaced `last_seen_at` with `geocoded_at` (today's actual predicate); the ZERO-match-only ghost-cleanup DELETE is superseded 0 days later by `8a1c7d25`'s changed-match extension (below) | **knowingly-retired** — neither the exact `last_seen_at` predicate nor the zero-match-only DELETE survives verbatim; the underlying MECHANISM this commit pioneered (timestamp-based incremental, not `NOT EXISTS`; a real DELETE for permits that fall out of match) is what carries forward through its own successors, preserved structurally not textually | direct diff this commit; successor commits below |
| **`8a1c7d25`** | **2026-04-01** | **THE load-bearing fence — Finding 3's root cause.** Wraps ghost-cleanup + `parcel_linked_at` UPDATE in ONE `withTransaction` (separate from the upsert's own transaction); ADDS the changed-match retraction DELETE (`WHERE parcel_id != $3`, a permit's OLD parcel link is deleted when it re-matches a DIFFERENT parcel) — `a21b7b01` had only handled the zero-match case | ✓ the retraction-on-relink LOGIC survives to today (`:551-561`, now UNNEST-batched by `72362c44` below); the TWO-TRANSACTION shape this commit itself introduced (ghost-cleanup+timestamp in ONE txn, separate from the upsert's txn) is what `LG-24` FURTHER consolidates at commit 7 (folds into ONE txn with the upsert, eliminating the crash window this commit's own fix left standing) | **preserved-in-compute — `LP-D1`'s own #1 Regression Guardian fence, opened this commit (below).** The retraction-on-relink BEHAVIOUR is load-bearing and must survive THE FIX unchanged; the TRANSACTION BOUNDARY this commit chose (2 txns) is superseded (not violated) by `LG-24`'s tighter 1-txn shape — a strengthening, not a regression, per Fold A B-1 | direct diff this commit; Fold A B-1; grounded in notes.json (why: R2, commit 14) |
| `f0daba71` | 2026-04-15 | Incremental filter: `last_seen_at` → `geocoded_at` (the `last_seen_at` predicate caused a 100-min full-table re-scan every chain run; `geocoded_at` correctly captures the "address-linked, later geocoded, should re-link spatially" case) | ✓ current file `:143-161`, byte-identical including the WHY-comment | **preserved-in-compute** — verbatim-ported to `compute.js` at commit 7, this pilot's `staleness`/incremental descriptor field | `:143-161` current file |
| `030a7611` | 2026-04-16 | Externalize `spatial_match_max_distance_m`/`spatial_match_confidence` as `logic_variables` (Rule-3 origin for THIS step's two ALREADY-compliant vars) | ✓ current file `:45-48,127-131`, byte-identical | **preserved-in-compute** — these two vars are the ALREADY-compliant baseline Finding 6/the P4 tunable inventory builds on; T1–T5 externalize the FOUR confidence literals + link_rate threshold this commit did NOT touch | `:45-48` current file; grounded in notes.json (why: R2, commit 14) |
| `c1ef0b73` | 2026-04-16 | Advisory lock retrofit: `ADVISORY_LOCK_ID=90` + `pipeline.withAdvisoryLock` wrap + `RUN_AT` via a bare `pool.query('SELECT NOW()')` | Lock ID + wrap ✓ current file `:51,125`, byte-identical; `RUN_AT` sourcing superseded by an out-of-scope `refactor(` commit (`46275ef1`, not in this pilot's 18-`fix(` corpus) to `pipeline.getDbTimestamp(pool)` (today's form, `:126`) | **encoded-as-descriptor-field** — `90` becomes `identity.lock` at commit 7 (Spec 47 §A.5 registry row unchanged); the lock WRAP mechanism retires with `pipeline.run` per the frozen-shape conversion, same as every prior pilot's own advisory-lock disposition | `:51,125,126` current file |
| `44aebeb7` | 2026-04-17 | **CRITICAL** — `linked_at` NULL on first INSERT (was set only in `ON CONFLICT DO UPDATE`, never in the INSERT column list) | ✓ current file `:496-503,515-522`, byte-identical, including the inline `// §47 §6.1` citation comment | **preserved-in-compute** — verbatim-ported to `compute.js` at commit 7; this is Spec 47 §6.1 compliance, explicit in the code today | `:502` current file; grounded in notes.json (why: R2, commit 14) |
| `187f0402` | 2026-04-17 | `parseInt`/`parseFloat` → `safeParsePositiveInt`/`safeParseFloat` (B1 safe-math migration) | ✓ current file, all 7 call sites (`:168,175,254-255,452`), byte-identical | **preserved-in-compute** — verbatim-ported to `compute.js` at commit 7 | current file, safe-math import line `:43`; grounded in notes.json (why: R2, commit 14) |
| `72362c44` | 2026-04-17 | N+1 per-permit ghost-cleanup DELETE loop → single `UNNEST`-batched DELETE (`O(matched permits)` round-trips → `O(1)`) | ✓ current file `:551-560`, byte-identical UNNEST shape | **preserved-in-compute** — this EXACT UNNEST shape generalizes into `LG-24`'s `executeGuardedDeleteByKey` generated SQL at commit 7, not merely ported but LIFTED into the shared library | `:551-560` current file; grounded in notes.json (why: R2, commit 14) |
| `52ad6527` | 2026-04-18 | §11 counter-misuse fix: `records_updated` `dbUpserted`→`totalLinked` (a JOIN-table row count was inflating the primary-entity counter); `db_upserted` audit row renamed `permit_parcels_written` | ✓ current file `:640,646`, byte-identical | **preserved-in-compute** — verbatim-ported to `compute.js` at commit 7 | `:640,646` current file; grounded in notes.json (why: R2, commit 14) |
| `2577e694` | 2026-04-21 | Adds an `audit_table` to the zero-permits early-return path (was a bare `emitSummary({records_total:0,...})` with no audit row at all) — **also introduces `phase: chainId === 'sources' ? 6 : 9`, THE OTHER side of Finding 4's disagreement, a MONTH after `5baaed5a`'s own `?6:7`, using a DIFFERENT non-`sources` value (9, not 7) and a DIFFERENT read idiom (`chainId` local var vs. direct `process.env` read)** | ✓ current file `:181-194`, byte-identical | **SPLIT disposition: the audit_table-on-skip SHAPE is `preserved-in-compute`** (a genuinely good contribution — the zero-permits path deserves its own audit row, same as every other converted step's SKIP terminal) — **the specific `?6:9` VALUE is `encoded-as-deviation`**: this commit is the actual ORIGIN of Finding 4/`LP-D3`'s defect half, not a symmetric pre-existing disagreement — `5baaed5a`'s `?6:7` was already established a month earlier; this commit independently reinvented the same axis with a wrong, unreconciled value. A-5 RULED `phase=7` for `permits` corrects this commit's own `9` at commit 7 | direct diff this commit; date-ordered against `5baaed5a` above; grounded in notes.json (why: R2, commit 14) |
| `03679c94` | 2026-05-23 | Strategy 1a `address_status` filter widened to accept the literal `'None'` (Toronto's production data uses `'None'` for 100% of rows, not the assumed `CURRENT`/`RETIRED`/`PENDING`) | ✓ current file `:308`, byte-identical including the inline WF3-hotfix-#2 comment | **preserved-in-compute** — verbatim-ported to `compute.js` at commit 7, part of Strategy 1a's `UNION ALL` branch, untouched by THE FIX (Strategy 1a is out of scope — only Strategy 3 Step 2 changes) | `:308` current file; grounded in notes.json (why: R2, commit 14) |

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
  12. `:576` — the `parcel_linked_at` UPDATE, same transaction #2 — ~~SURVIVES, same consolidation as #10~~
      **FALSE, corrected commit 10 (`LP-D10`, WF6 output-panel finding).** This claim was never verified
      against the landed compute/`runLinkKeyedPhase`/descriptor at the time it was written — it did NOT
      survive: the watermark write existed nowhere in commit 7's own consolidation (fence `a21b7b01`,
      "Prevents infinite re-evaluation of unmatchable permits," dropped silently, not knowingly retired).
      Restored at commit 10 as a third declared write target (e3), ordered LAST in the same per-batch
      transaction. See `defect-ledger.md` `LP-D10` and report §10 for the full restoration record.
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

## §5. Golden master (commit 5, G1′) — 3 live invocations (`permits` + `sources`, this step's two real chain memberships, + `standalone`)

> **Every capture below is a REAL run of the UNCONVERTED `scripts/link-parcels.js`** via
> `scripts/analysis/capture-step-golden.js`, run SEQUENTIALLY against `127.0.0.1:54322/postgres` (resolve-db,
> 242 migrations, floor 245). Today's live DB has **0 eligible unlinked permits** (re-confirmed live this
> commit: the incremental filter's own predicate returns 0 rows) — every capture below is the ZERO-WORK SKIP
> path, the same shape pilot 6's own `compute_centroids` captures hit. Files:
> `docs/reports/golden/link_parcels/pre/{permits,sources,standalone,standalone-repeat}.json` +
> `docs/reports/golden/link_parcels/invariants.json` (9 entries — the 3 task-pinned +
> 6 supporting/context rows). `--tables=permit_parcels,permits` (no descriptor exists yet, harness
> auto-derivation unavailable), `--table-columns=permit_parcels:permit_num,revision_num,parcel_id,match_type,confidence`
> / `--table-order=permit_parcels:permit_num,revision_num,parcel_id` (projects onto the write target's own
> composite key + value columns, bypasses the 100,000-row ceiling — 241,172 rows exceeds the harness's
> default). `permits` (254,082 rows) is over the ceiling and NOT hashed — it is a read-only input to this
> step, not the write target, so an unhashed `permits` table state does not weaken the differential this
> harness exists to gate.

### The 3 pinned invocations — table-state hashes IDENTICAL across all three

| Invocation | `chain` arg | `PIPELINE_CHAIN` env | `phase` | `records_total` | `pipeline_runs` rows written | `permit_parcels` hash |
|---|---|---|---:|---:|---:|---|
| `pre/permits.json` | `permits` | `permits` | **9** | 0 | 0 | `fe232ade` (241,172 rows, projected) |
| `pre/sources.json` | `sources` | `sources` | **6** | 0 | 0 | `fe232ade` — byte-identical |
| `pre/standalone.json` | `none` | *(unset)* | **9** | 0 | 0 | `fe232ade` — byte-identical |

**`pipeline_runs` rows written: 0 for ALL THREE invocations — not an anomaly, the same property pilot 6's own
`compute_centroids` captures documented.** `scripts/lib/pipeline.js` (the pre-conversion SDK this file still
uses) never itself INSERTs into `pipeline_runs`; only `scripts/run-chain.js`'s own chain-orchestration code
does, when it spawns a step as part of a REAL `chain_permits`/`chain_sources` execution. Neither
`capture-step-golden.js`'s direct child-process spawn (with `PIPELINE_CHAIN` set but no actual `run-chain.js`
orchestration around it) nor a bare `node scripts/link-parcels.js` (the `standalone` invocation) goes through
`run-chain.js`, so all three legitimately show `ledger=[]` — re-confirmed live this commit via a direct
`pipeline_runs` query (still exactly the 2 pre-existing legacy rows, ids 20/32, both 2026-03-03).

### `--compare` — a LIVE empirical confirmation of `LP-D3` (Finding 4)

```
[capture-step-golden] 2 difference(s): pre/permits.json vs pre/sources.json
  chain
    - "permits"
    + "sources"
  summary.records_meta.audit_table.phase
    - 9
    + 6
```
```
[capture-step-golden] 1 difference(s): pre/permits.json vs pre/standalone.json
  chain
    - "permits"
    + "none"
```
`permits` and `standalone` are IDENTICAL on `phase` (both **9** — `standalone`'s `PIPELINE_CHAIN` is unset,
so `chainId` resolves `null`, falling to the SAME else-branch as `permits`), while `sources` differs on
`phase` alone (**6**) — a direct, live, empirical demonstration of `LP-D3`'s exact defect shape: the
zero-permits path's phase value is genuinely wired to the `chainId==='sources'?6:9` ternary and produces the
non-`sources` value **9** for both `permits` and standalone, not the real-run path's own established **7**
(`5baaed5a`'s value — never exercised by this capture, since 0 permits means the zero-permits early-return
path is what actually fires, not the real-run `emitSummary` at `:660`). This is direct evidence, not
inference, that A-5's ruling (`phase=7` for `permits`) will genuinely CHANGE this capture's own `permits`/
`standalone` phase value from 9 to 7 at commit 7 — a real, observable diff for the commit-9 differential to
explain, not a cosmetic one.

### The write path — no pre-existing live-write fixture found (unlike pilot 6's precedent)

Unlike `compute_centroids` (whose write path was already proven by an EXISTING DB test,
`migration-245-centroid-invalidation.db.test.ts` case ④), **no equivalent pre-existing fixture exercises
`link-parcels.js`'s real write path against a live DB** — `src/tests/link-parcels.infra.test.ts` (162 lines)
is a TEXT-based regression lock (source-file `grep`/`SEED` JSON assertions for the E18 tunable
externalization), not a live spawn-and-verify DB test. Searched `src/tests/db/*.ts` and `src/tests/*.ts` for
any `LINK_PARCELS_SCRIPT`-shaped live-spawn harness (the pattern `compute_centroids`'s citation used) — none
found. **This is a genuine difference from pilot 6's own commit-5 posture, not glossed over:** the real write
path (upsert + ghost-cleanup DELETE + `parcel_linked_at` UPDATE) is exercised for the FIRST time by commit 6's
own fixture-driven tests (`LP-D1`'s drifted-centroid fixture, `LP-D6`'s NULL-coordinate fixture) — not by a
pre-existing mechanism this commit can merely cite. Flagged for commit 6's own test-design pass, not built
here (out of this pilot's own scope to add a live-DB write-path fixture as a SEPARATE commit-5 deliverable —
the plan's own commit 5 Done-test is "harness self-test + `--compare` exit 0" only, both of which pass below).

### Harness self-test (Done-test requirement)

Re-ran the `standalone` capture a second time (`pre/standalone-repeat.json`) and diffed via `--compare`:
```
[capture-step-golden] IDENTICAL (normalised): docs/reports/golden/link_parcels/pre/standalone.json == docs/reports/golden/link_parcels/pre/standalone-repeat.json
```
Exit code 0. **Harness self-test PASSES.**

### Non-determinism inventory (declared BEFORE the first diff, Spec 124 §7 Step 4)

Identical across all 4 captures, 3 entries — the SAME shape every prior pilot's zero-work SKIP capture
declares:

| Kind | What | Why |
|---|---|---|
| `pattern:duration_literal` | `"completed in 0.5s"`/`"0.6s"`/`"0.7s"` stdout log lines | wall-clock elapsed text, masked to `<DUR>` |
| `row:sys_duration_ms` | `records_meta.audit_table.rows[].metric==="sys_duration_ms"` | auto-injected timing (`pipeline.js`), masked by the `sys_` prefix rule |
| `row:sys_velocity_rows_sec` | same auto-injected timing row, `records_total===0` denominator | masked by the same `sys_` prefix rule |

No OTHER non-determinism found — `git_head`, `db_target`, `runtime`, `args` are all harness metadata outside
the normalised comparison; the invariants (9 entries) and table_state hash are BOTH deterministic on
identical data (confirmed by the harness self-test above).

### Invariants pinned (`docs/reports/golden/link_parcels/invariants.json`, 9 entries, identical across all
### 4 captures — measured values, live this commit, RE-MEASURED not copied from commit 1)

| Invariant | Value | Task-pinned? |
|---|---:|---|
| `permit_parcels_total` | **241,172** | ✓ task-pinned |
| `match_type_spatial_count` | **17,504** | ✓ task-pinned |
| `duplicate_permit_pair_count` | **989** | ✓ task-pinned |
| `match_type_exact_address_count` | 152,975 | context (full match-type distribution, not task-pinned) |
| `match_type_address_points_exact_count` | 48,815 | context |
| `match_type_spatial_polygon_count` | 17,651 | context |
| `match_type_name_only_count` | 4,227 | context |
| `permits_total` | 254,082 | context |
| `permits_parcel_linked_at_not_null` | 254,045 | context |

All 3 task-pinned values match every direct-query measurement taken at commits 1/2/4 exactly — **zero
discrepancy between the ad-hoc SELECT queries and the harness's own `--invariants` execution**, confirming
the harness reproduces the same SQL faithfully. These 3 values are the Finding-3/BEFORE baseline the
declared FULL run (commit 8, out of this pilot's own commit 1–6 scope) will change — pinned here precisely so
the after-state has a measured delta to report against (`duplicate_permit_pair_count` expected to drop toward
0 per the 989-row self-heal; `match_type_spatial_count` expected to hold near 17,504 minus the 4 `LP-D6`
retractions, since a relink stays `spatial`-tier, only its `parcel_id` changes).

### G1′ verdict

**CLOSED this commit.** All 3 pinned invocations (`permits`/`sources`/`standalone`) captured, byte-identical
on every normalised field except `chain` and (for `sources` alone) `phase` — a live empirical confirmation of
`LP-D3`. Harness self-test PASSES (re-run IDENTICAL). Non-determinism inventory declared BEFORE any diff was
taken (3 entries, all 4 captures agree). All 9 invariants pinned and cross-checked against this session's
independent measurements (commits 1/2/4). **No pre-existing write-path fixture found** (a genuine difference
from pilot 6's own posture, recorded honestly rather than glossed over) — the real write path is exercised
for the first time by commit 6's own `LP-D1`/`LP-D6` fixtures, not proven here.

---

## §6. PH-7 — test design + prove RED (commit 6, G7)

> `src/tests/steps/link_parcels/violations.test.ts` — **12 tests**, scoped to the 4 locks this
> pilot's commit-6 task named (LP-D1 both-directions, LP-D6 NULL-coordinate, tiebreak-determinism,
> SQL-shape perf), rather than a full 55-A generic-checklist replication — the task brief's own
> scope. **This file is DB-FREE by convention** (verified this commit: no existing
> `violations.test.ts` in the programme touches a live database — DB-dependent proofs live in
> `src/tests/db/*.db.test.ts`, gated `BUILDO_TEST_DB=1`); the BEHAVIORAL plausibility evidence for
> THE FIX (a live synthetic PostGIS fixture proving both directions, plus the N=120 stratified
> Reality-Check sample) was independently executed and recorded in §4 this same pilot — this
> file's own job is the STRUCTURAL lock (Spec 124 §7 Step 4), pinning the fix's shape so a future
> regression cannot silently reintroduce the retired predicate. **5 `it.fails()`** (genuinely red
> internally — each opens with `artifact()` against `scripts/lib/compute/link-parcels.js` or
> `scripts/link-parcels.descriptor.json`, neither of which exists yet) **+ 7 plain `it()`**
> (testable today: reversion-sentinel proofs against the CURRENT script's own text, and
> pure-algorithmic proofs with no artifact dependency). **All 12 GREEN this commit:**
> ```
> ✓ src/tests/steps/link_parcels/violations.test.ts (12 tests) 24ms
> Test Files  1 passed (1)
>      Tests  12 passed (12)
> ```

### The 4 locks, both directions — TODAY (reversion-sentinel) + FUTURE (`it.fails`, flips at commit 7)

1. **`LP-D1` — Strategy 3 Step 2's join predicate.** TODAY: the current script's Step-2 block
   (isolated by its own bracketing comments, `step2Block()`) is asserted to contain
   `centroid_lat`/`centroid_lng`/`ST_DWithin` and an `ORDER BY v.pn, v.rv, ST_Distance(...)` ranking
   — the defect is real, not hypothetical, proven against the live file text. FUTURE: `compute.js`
   must contain `pa.geom <->` + `pa.id ASC`, and must NOT contain `centroid_lat`/`centroid_lng`/
   `ST_DWithin` — genuinely red today (`MISSING ARTIFACT`).
2. **`LP-D6` — the NULL-coordinate guard.** TODAY: the current script's JS-level eligibility filter
   (`p.lat !== null && p.lng !== null`, `:373-376`) exists, but Strategy 3 Step 2's OWN SQL block
   has no `IS NOT NULL` guard on `v.lng`/`v.lat` — it trusts its caller entirely, a structurally
   DIFFERENT mechanism from what THE FIX's set-based query (which no longer pre-filters in JS)
   needs. A second TODAY test is a pure-JS reproduction of the underlying comparison hazard (a
   naive nearest-candidate loop over an invalid/degenerate query point resolves to AN ARBITRARY
   candidate, never null, never an error) — independent of any live DB dependency; the LIVE
   production fact (4 real permits currently linked to `parcel_id 439990`, Fold C blocking item 1's
   correction of the plan's own "observed: `id=1`" evidence) is cited in the test's own comments,
   not re-queried inside this DB-free unit test. FUTURE: `compute.js` must contain
   `v.lng IS NOT NULL AND v.lat IS NOT NULL`, and the descriptor must declare a
   `spatial_null_coordinate_permits` WARN check — both genuinely red today.
3. **Tiebreak-determinism.** TODAY: the current script's `ORDER BY v.pn, v.rv, ST_Distance(...)`
   clause is text-extracted and asserted to contain no `pa.id` secondary key — the non-determinism
   risk is real today. A second TODAY test is a pure-JS twice-run proof: a `distance ASC, id ASC`
   sort over an EXACT-TIE dataset (24.20156933 m for both candidates — a value drawn from this
   pilot's own independently re-verified exact-tie population, §4/Fold C item 5) returns the SAME
   (lower) id across two runs with shuffled input order — the algorithmic property THE FIX's
   declared tiebreak relies on, proven without any DB/artifact dependency. FUTURE: `compute.js`'s
   KNN `ORDER BY` must carry `, pa.id ASC` immediately after the `<->` operator — genuinely red.
4. **SQL-shape perf lock.** TODAY: the current script's Step-2 block is confirmed to use
   `ST_DWithin` as a bound predicate (the pre-fix baseline), with live timing figures for both the
   struck co-resident form (97.5 s/batch) and THE FIX's own shape (400-500 ms/batch; this pilot's
   own commit-4 aggregate re-measurement: 7.18 s for the full 17,500-row eligible population)
   recorded in the test's comments, citing §4 rather than re-timing inside this DB-free unit test.
   FUTURE: `compute.js`'s KNN LATERAL block must NOT carry a co-resident `ST_DWithin` bound in the
   same block (scanned via a ±400-character window around the `pa.geom <->` operator) — genuinely
   red, guards specifically against reintroducing the measured-unviable combination.

### `converted.json` — `pending` entry declared this commit (R-K.1, stage `red_suite`)

```json
{
  "file": "scripts/link-parcels.js",
  "registers_at": "C1 pilot 7 commit 9 (cutover)",
  "reason": "PH-7 red suite landed commit 6 ... descriptor/compute/library growth land commit 7, advancing stage to shape_clean",
  "declared": "2026-08-30",
  "stage": "red_suite"
}
```
No sibling descriptor exists yet (verified this commit) — `stage:"red_suite"` is the correct,
non-stale declaration per R-K.1 (a descriptor appearing while `stage` stays `red_suite` would itself
be RED, "stage not advanced" — `step-conformance.infra.test.ts`'s generic gate enforces this, not
re-implemented per-step here). `src/tests/step-conformance.infra.test.ts` re-run this commit: **175/175
green**, including the fleet silent-import-death guard and the R-R scorecard-staleness locks for
every already-converted step — the new pending entry introduces no regression in the generic
conformance suite.

### Literal RED excerpt

Per Rule 13's pre-staging requirement, the LP-D1 FUTURE claim was temporarily un-wrapped to a plain
`it()` (NOT committed in this form — reverted immediately after capture) to prove the underlying
assertion genuinely throws, not merely that `it.fails()` reports green by construction:

```
✗ LP-D1 — Strategy 3 Step 2 join predicate (THE FIX)
  > FUTURE — scripts/lib/compute/link-parcels.js exists and Strategy 3 Step 2 ranks by the live
    pa.geom KNN operator with a declared pa.id ASC tiebreak, never by centroid_lat/centroid_lng
    (TEMP UNWRAPPED FOR RED-CAPTURE, NOT COMMITTED)
  AssertionError: MISSING ARTIFACT scripts/lib/compute/link-parcels.js (not yet produced by the
  pilot-7 commit sequence — commit 7 lands it): expected false to be true // Object.is equality
  - Expected: true
  + Received: false
    ❯ artifact src/tests/steps/link_parcels/violations.test.ts:81:5
    ❯ readText src/tests/steps/link_parcels/violations.test.ts:85:65
    ❯ src/tests/steps/link_parcels/violations.test.ts:118:17
  Test Files  1 failed (1)
       Tests  1 failed | 11 passed (12)
```

**RED — confirmed genuine, for the right reason (a missing artifact, not a TypeScript/import
error).** The file was restored to its `it.fails()`-wrapped form immediately after this capture;
the committed file has zero real (un-inverted) failures — `12/12` green, as shown above.

### `docs/reports/defect-ledger.md` — 7 rows registered this commit (`LP-D1`–`LP-D7`)

Every ledger row this pilot has opened (`LP-D1`–`LP-D6` per the plan's G6 row + `LP-D7` widened
from commit 1's own new finding) is now ALSO registered in the fleet-wide `defect-ledger.md`
(matching the `CC-D1`–`CC-D3`/`LM-D11`/`LM-D13`/`LPA-D5`/`LPA-D6` precedent — a row opened only in a
pilot's own assessment report, without the fleet ledger entry, is a gap `step:validate`'s G6 gate
correctly flags). Re-ran `npm run step:validate -- --step=link_parcels` after adding the 7 rows:

```
[step-validate] link_parcels (pending) — 4/17, hard-stop=true
...
| G6 | 0 | 3 | 7 ledger row(s), 6 without CLOSED/PIN (LP-D2, LP-D3, LP-D4, LP-D5, LP-D6, LP-D7) |
```

G6 moves from "no defect-ledger rows found for prefix LP-D*" (a vacuous absence) to a real,
non-vacuous 0/3 (7 rows found, correctly none CLOSED/PIN yet — every row's own "closes at" column
states commit 7, 8, or 9, all out of this pilot's own commit 1–6 scope). This is the HONEST state
at commit 6, not a gap to be closed here — matches the low, faithfully-recorded scorecard posture
pilot 6's own commit 6 established as correct (11/17 there; 4/17 here, lower because `link_parcels`
carries real library growth (`LP-D5`) and product-exposure (`LP-D7`) rows a BACKFILL step like
`compute_centroids` never had).

### `npm run step:validate -- --step=link_parcels`, full scorecard (Rule 13)

```
[step-validate] link_parcels (pending) — 4/17, hard-stop=true
```
G0 1/1, G1 1/1 (PH-3 section found, 38 SHAs counted — the git-blame trail across the ledger rows'
own citations, not merely 18), G2 0/1 (no churn×complexity instrument — standing programme gap,
pilots 1–6 too), G3 1/2 (table rows=19, vocab-hit rows=18 — the 18 `fix(` commits' dispositions),
G4 0/2 (no risk-class row in the TABLE SHAPE the generator scans for — this report's own G4 pass at
commit 1 used prose, matching pilot 6's own commit-1 gap), G5 1/1 (db/clock/network/argv-env all
true — §3's seam map), G6 0/3 (above), G7 0/3 (`file=true fences=0 it-count=18 RED-evidence=false`
— the generator's OWN fence-counter scans `defect-ledger.md` for `PIN`/`CLOSED` rows citing this
step, which is correctly 0 today since every `LP-D*` row is OPEN; the real fence count this pilot's
G3 archaeology found — `8a1c7d25`, ONE genuinely load-bearing fence — is documented in §2, not yet
machine-countable by this generator's current heuristic, a standing gap shared with every prior
pilot's own commit-6 state), G8 0/3 (3 missing invocations — `post/{permits,sources,standalone}.json`
don't exist until commit 9, correctly). Fast invariants #4/#5/#9 all PASS — confirms all 5
`it.fails()` call sites sit under this pilot's own declared `red_suite` pending slug, none orphaned.
Policy matrix: 2/14 enforced-green (Rules 2, 3) — everything gated on
the descriptor's existence reads `enforced-red`, exactly as expected for a `pending`-not-`shape_clean`
step. This is the correct, informative RED state through commit 6 — a real signal, not a generic
tool error — and it climbs sharply at commit 7 once the descriptor/compute/library growth land and
`stage` advances to `shape_clean`.

### G7 verdict

**CLOSED this commit.** `violations.test.ts` lands with 12 tests, 5 `it.fails()` genuinely red
internally (5 ≥ the 1 fence this pilot's own G3 archaeology found load-bearing, `8a1c7d25` — lock
count ≥ fence count satisfied, matching the plan's own Rule-13 pre-staging requirement). 7 plain
`it()` genuinely pass today. The literal RED excerpt above proves the mechanism is not vacuous.
`converted.json.pending` gains the `stage:"red_suite"` entry this commit (matches R-K.1's own
established mechanism exactly — declared at commit 6, not deferred to commit 7, since a genuine
tooling contradiction pilot 6 already hit and fixed makes any deferral illegal under the CURRENT
tooling). `step-conformance.infra.test.ts` re-run: 175/175 green, no regression. `defect-ledger.md`
gains 7 real rows (`LP-D1`–`LP-D7`), closing the gap between this pilot's own report-local ledger
and the fleet-wide register. `step:validate` returns a real, low, faithfully-recorded scorecard
(`4/17`) instead of erroring.

---

## §7. Descriptor + compute (incl. THE FIX) + library growth → G2′ (commit 7)

> Lands `scripts/link-parcels.descriptor.json`, `scripts/link-parcels.notes.json`,
> `scripts/lib/compute/link-parcels.js` (THE FIX + Strategies 1a/1b/2 folded via `UNION ALL`
> + Strategy 3 Step 1 verbatim), the frozen `scripts/link-parcels.js` (38 lines), library
> growth (`LG-24` `executeGuardedDeleteByKey` + `link_full_retraction` class in `write.js`;
> `LG-25` composite-key keyset pagination + `runLinkKeyedPhase`, forked UNCONDITIONALLY from
> `runLinkPhase`, in `index.js` — `runLinkPhase` itself, 245 lines, untouched), T1-T5 seeded
> + applied locally, admin "Parcel Linking" GROUPS consolidation, `converted.json.pending`
> stage advanced `red_suite` → `shape_clean`, and all 5 `it.fails()` in commit 6's
> `violations.test.ts` flipped to plain `it()` (rewritten for the post-fix world — the
> pre-fix TODAY reversion-sentinels that read the OLD 686-line file are retired, since that
> text no longer exists; their evidence lives in `notes.json`'s `fences[]` + the G3 ledger).

### THE FIX — shipped exactly as designed, live-verified

Strategy 3 Step 2's join predicate ships as the unconstrained KNN LATERAL (`pa.geom <->`),
declared `, pa.id ASC` tiebreak, cap as a scalar post-filter (never a co-resident
`ST_DWithin` bound), explicit `WHERE v.lng IS NOT NULL AND v.lat IS NOT NULL` guard
(LP-D6). **Live-timed this commit, against the SHIPPED SQL text (not hand-copied) via a
real 1,000-row batch of the live `spatial`-tier population:** `spatial_fallback_sql`
completed in **293 ms** — comfortably under the plan's own 400-500 ms/batch estimate and
the coordinator's 2s ceiling. Strategy 3 Step 1 (`ST_Contains`) and Strategies 1a/1b/2
(folded into `primary_match_sql` via `UNION ALL`) are verbatim-ported, confirmed byte-for-
byte against the G3 intent ledger's own `preserved-in-compute` dispositions.

### A real bug caught and fixed live: `write_privilege`/`link_rate` observation shape

My first live run of the converted step returned `verdict: FAIL` — `write_privilege`
reported `{value: priv}` instead of the library's required `{violations: N}` shape
(`scripts/lib/step/verdict.js checkRow` reads `observation.violations` first, falling back
to `.value` only for `pct <=`/`value_min`/`value_max` forms). Fixed to mirror
`link-massing.js`'s own `write_privilege`/`parcels_processed`/`multi_primary_parcels`
shapes exactly. **A second, more consequential bug found in the same pass:** T5
(`link_parcels_link_rate_warn_pct`) was seeded at its plan-specified default (75,
representing the OLD code's own "link rate >= 75%" literal) — but `verdict.js`'s
`limit_from_config` substitutes the RAW config value into the check's declared `pct <=`
form with **no transform**, and `pct >=` is explicitly documented there as unimplemented/
unevaluable. Left as 75, the check would only WARN when the UNLINKED percentage exceeded
75% (linked below 25%) — a materially looser, wrong bound; live-measured the real permits
population at 94.53% linked / 5.47% unlinked and the untransformed threshold incorrectly
WARNed. **Fixed by storing T5 as the UNLINKED ceiling (25 = 100-75), matching
`link-massing.js`'s own `link_rate` convention exactly** (its own config is likewise the
complement, just numerically symmetric at 50 in that step's case, which hides the same
requirement) — documented in the seed description, the descriptor's `checks[].why`, and
here as a deviation from the plan's literal "default 75" text, for this hard architectural
reason, not an oversight. Re-verified live after the fix: `verdict: PASS`,
`link_rate: {link_rate_pct: 94.53, unlinked_pct: 5.47}` against `pct <= 25`.

### Seam truthfulness (Fold C item 9) — confirmed empty, not merely asserted

`inputs.reads.steps: []` — verified live this commit: `grep -c "centroid_lat\|centroid_lng"
scripts/lib/compute/link-parcels.js` → **0** (after also scrubbing 2 doc-comment mentions
that referenced the retired predicate by name for explanatory purposes, moved to paraphrase
so the violations.test.ts LP-D1 lock could assert "no centroid reference anywhere in
buildMatchSql's generated SQL" without a false positive on legitimate prose). Neither
Strategies 1a/1b/2, Step 1, nor Step 2 (THE FIX) reads `compute_centroids`'s own output —
the plan's original "NEW seam becomes declarable" framing is corrected, not repeated.

### Differential — zero-diff on the unchanged strategies, non-zero EXPLAINED diff on Step 2

**Real captures, not a claim.** `post/{permits,sources,standalone}.json` captured live
this commit (0 eligible permits incrementally — the same zero-work steady state as `pre/`)
and diffed via `--compare` against `pre/`. `table_state` hash **IDENTICAL** (`fe232ade`,
241,172 rows) on all 3 invocations — zero DATA diff, confirming Strategies 1a/1b/2 + Step 1
+ Step 2 wrote nothing this run (nothing was eligible to process). Every non-zero diff
falls into an EXPLAINED bucket: (a) `meta.reads.parcels` — `centroid_lat`/`centroid_lng`/
`geometry` → `geom` (Step 2's own seam-truthfulness change, confirmed above); (b)
`meta.reads.permits` gains `parcel_linked_at`/`geocoded_at` (the incremental filter's own
columns, now correctly declared); (c) `audit_table.phase` 9→7 (permits) / unchanged 6→6
(sources) — **live empirical confirmation of A-5's ruling**, the SAME shape commit 5's own
`--compare` already demonstrated for the pre-fix ternary defect; (d) standalone's phase
resolves to **0**, not 7 or 9 — confirmed CORRECT, GENERIC library behaviour
(`verdict.js resolvePhase`: "unambiguous only when every chain agrees" — `permits`=7 and
`sources`=6 genuinely disagree, so standalone has no single answer, by design, not a bug);
(e) the entire `stdout_lines`/`records_meta.*` shape — the frozen-shape conversion's own
observability upgrade (structured `checks_passed`/`checks_warned`/`config`/`terminal`/
per-tier counters replacing the old ad-hoc audit_table), same class every prior pilot's own
commit-7-adjacent capture already documents; (f) `table_state[1]` (permits) disappears — the
harness now auto-derives tables from `outputs.writes[]` once a descriptor exists (`permits`
is a read, not a write target), harness behaviour, not a step behaviour change. **The
declared FULL re-evaluation (commit 8, out of this pilot's own scope) is what will produce
the first REAL write-shape diff** — not run here, consistent with the plan's own commit
7/8 boundary; running it would mutate ~17,500 production rows without commit 8's own
before-image/expectation-recording ceremony.

**Every individual diff key, named — 159 diff entries total across all 3 captures (53 on
`permits.json`, 52 on `sources.json`, 54 on `standalone.json`), zero unexplained:**
- **8 differences on `stdout_lines`** per capture — the old file's hand-rolled
  `pipeline.log.info` lines vs. the frozen shape's own structured runner messages
  (`mode gate:`, `[link_parcels] completed in`); expected, the SDK owns all logging now.
- **13 differences on the audit_table's own `rows`** per capture — the new checks[]-driven
  rows (`tier_1_via_bridge`, `tier_2_name_only`, `tier_3_spatial`, `tier_3_polygon`,
  `run_matched`, `no_match`, `permit_parcels_written`, `spatial_null_coordinate_permits`,
  `link_rate`, `write_privilege`, the 3 new `pp_*` invariant rows) replacing the old
  2-row `status`/`reason` SKIPPED pair — the SAME richer-observability class as (e) above.
- **1 difference on `table_state`** per capture (`table_state[1]`, the `permits` entry) —
  explained above: the harness auto-derives tables from `outputs.writes[]` once a
  descriptor exists, and `permits` is a read, not a write target.
- **6 differences on the top-level `invariants[]` array** per capture (indices 3-8, noted
  again LP-D12/commit 12 — pre-existing since this very split, not newly introduced) — the
  pre-conversion capture's ad-hoc 9-entry invariant list (`permit_parcels_total`,
  `match_type_spatial_count`, `duplicate_permit_pair_count`, `match_type_exact_address_count`,
  `match_type_address_points_exact_count`, `match_type_spatial_polygon_count`,
  `match_type_name_only_count`, `permits_total`, `permits_parcel_linked_at_not_null`) is
  structurally longer than the frozen shape's own descriptor-declared 3-entry `invariants[]`
  (`pp_unique_triple_violations`, `pp_duplicate_permit_pairs`,
  `pp_spatial_null_coordinate_count`) — indices 0-2 differ in name/value (already covered by
  the richer-observability class above), indices 3-8 have no post-side counterpart at all.
- **`records_meta.chain_run_id`, `records_meta.checks_failed`, `records_meta.ledger_row`,
  `records_meta.permits_processed`, `records_meta.no_match_count`,
  `records_meta.matches_tier_1_exact`, `records_meta.matches_tier_1_via_bridge`,
  `records_meta.matches_tier_2_name`, `records_meta.matches_tier_3_spatial`,
  `records_meta.matches_tier_3_polygon`, `records_meta.matches_tier_3_centroid`** — every
  one of these is a NEW field the frozen shape's own `buildLinkMeta`
  (`scripts/lib/compute/link-parcels.js`) emits that the pre-conversion script's ad-hoc
  `records_meta` object never had a slot for (it had `matches_tier_1_exact`-shaped keys
  under slightly different names, e.g. `db_upserted` vs `permit_parcels_written`,
  `duration_ms` vs `sys_duration_ms`) — the SAME richer, declared-field observability
  upgrade named throughout this commit, not independently surprising.

### Test suite, full re-run this commit

`src/tests/steps/link_parcels/violations.test.ts` **12/12 GREEN** (rewritten for the
post-fix world — every commit-6 lock now tests the SHIPPED artifact directly, not a
future-artifact placeholder). `step-conformance.infra.test.ts` **177/177 GREEN**
(`link_parcels`'s `shape_clean` pending entry validated both directions). `step-library.
logic.test.ts` **136/136**. Fleet-wide staleness found and fixed live in 5 files that
hardcoded "link-parcels.js is still unconverted" assumptions (`chain.logic.test.ts`,
`pipeline-sdk.logic.test.ts` ×2 arrays + 1 island-path list, `pipeline-logic-vars-
coercion.infra.test.ts`, `control-panel.logic.test.ts`) — each RE-HOMED to test the
descriptor/compute directly, matching the established `link_massing`/`link_wsib`/
`compute_centroids` RE-HOMED precedent, never deleted. `src/tests/link-parcels.infra.test.ts`
(the pre-existing E18/Strategy-1a regression lock) rewritten to read `scripts/lib/compute/
link-parcels.js` instead of the now-frozen `scripts/link-parcels.js` — every original claim
preserved, none silently dropped. Full suite: typecheck clean, lint clean (0 errors),
step-shape + compute-shape ast-grep gates clean (R-W's `compute-no-postgis-branch` rule
confirmed firing clean against the new compute file — 0 `hasPostGIS`/`pg_extension` hits).

### G2′ verdict

**CLOSED this commit.** THE FIX ships exactly as Fold A/B designed it, live-timed at
293ms/batch. Two real bugs (observation shape, T5's un-transformable config semantics)
were caught by actually RUNNING the converted step against the live DB, not merely by
static review — fixed before commit, both documented as deviations with their own
grounds. Differential captured live: zero DATA diff (nothing eligible), every metadata
diff explained. `converted.json.pending` stage advances to `shape_clean`; registration
itself (adding to `converted[]`) is commit 9's own act, per R-K.1.

---

## §8. The declared spatial-tier FULL re-evaluation (commit 8) — SUPERSEDED, see §8a + the rewritten §8 below

> ⚠️ **SUPERSEDED.** The two live FULL runs this section describes surfaced `LP-D9` (Strategy 1a's missing
> `street_type` predicate, §8a below) — a real defect whose measured redistribution numbers make this
> section's own address-tier framing incomplete (it never isolated the street_type-conflict population). The
> runs themselves are historical fact (they happened, live, twice) and this section's spatial-tier/idempotency
> findings ((b)–(e), the twice-run proof) are NOT invalidated by `LP-D9` (confirmed unrelated — the conversion-
> neutrality differential proved `LP-D9` is pre-existing, not introduced by anything in this section). But the
> table state this section measured against has since been corrected and re-run under `LP-D9`'s fix (commit
> 8a) — **the CURRENT, superseding numbers are in §8b, immediately after §8a below.** Left in place rather
> than deleted, per this codebase's "regenerate, don't erase" convention — the two runs described here are
> exactly what led to `LP-D9`'s discovery.

> Every number below is measured against a REAL live run of the converted step (`PIPELINE_CHAIN=sources
> LINK_PARCELS_FORCE_FULL=1 node scripts/link-parcels.js`, 127.0.0.1:54322/postgres), not predicted or
> transcribed. The step ran TWICE, back to back, for the idempotency proof below (item 6).

### 1. Before-image, strictly before retraction

`docs/reports/golden/link_parcels/before-image/2026-08-30T21-53-09.272Z-permit_parcels.jsonl` — written by
`write.writeBeforeImage` (unwrapped by try/catch, same mechanic `link_massing`'s `d07529af`) BEFORE W1's scoped
mass retraction fired, confirmed by log ordering (`before_image_written:permit_parcels` audit rows precede
`permit_parcels: retracted 17,504 row(s)` in `records_meta.audit_table`). **One per-run file, batches append**
(Fold B item 5): the file's first 17,504 lines are W1's own snapshot (verified: all 17,504 have
`match_type:"spatial"`, zero leakage from `spatial_polygon`); lines 17,505–267,367 are `LG-24`'s per-batch
delete-candidate mirrors across the full ~254K-permit loop (a declared superset — "every row the batch's own
DELETE could touch," not only what actually deletes). 43.5 MB, committed alongside this report per the
`link_massing`/`link_wsib` precedent (their own before-image files run 56 KB–92 MB, already version-controlled).

### 2. The run itself

`mode gate: explicit_full=false forced=true changed=false → FULL (force_full_env)` — `LINK_PARCELS_FORCE_FULL`
reached `selectMode` correctly. **Duration: 170.3 s** (run 1), matching Fold B's own 24–33 s spatial-tier
estimate plus the address-tier reprocessing cost across the full ~254K-permit scope it warned about — nowhere
near the struck 71-minute figure nor the 45 m budget; the run completed comfortably inside a single detached
Bash call, no >10 min foreground risk realized.

### 3. Measured deltas vs. the commit ledger's stated EXPECTATIONS

**(a) ~10.6K relinks (10,616–10,625 declared range).** Measured via the before-image's OLD population
(17,504 rows, `match_type='spatial'`) joined against the LIVE post-run `permit_parcels` state, row-for-row:
**10,707 flipped, 6,793 unchanged, 4 retracted (0 relinked — item (b))**. 10,707+6,793+4 = 17,504, exact
reconciliation. **10,707 is 82 rows (0.77%) above the top of the declared 10,616–10,625 range.** Flagged, not
silently absorbed: this is the SAME class of live-DB churn already documented repeatedly this session (the R-O
BEFORE-half's own re-measurement landed at 10,616, the exact bottom of the range, versus Fold B's 10,625 — a
9-row spread from churn between TWO measurements taken minutes apart in the SAME commit-4 session; commit 8's
run happened in a LATER session, after further live scraper/permit-table writes had additional time to land).
Not re-litigated as a defect — the ratio (10,707/17,504 = 61.2%) is consistent with the governing 60.6–60.7%
figure measured three independent ways at commit 4 (plan/Fold-B, grounder, this report's own BEFORE-half).

**(b) LP-D6 — the 4 NULL-coordinate permits.** Identified in the before-image by cross-referencing the 19
permits linked to parcel `439990` against `permits.latitude`/`longitude`: exactly 4 have both NULL —
`13 260505 BLD`, `18 258177 FSU`, `22 104242 BLD`, `09 165576 HVA`. **All 4 now have ZERO rows in
`permit_parcels` — retracted, not relinked, 4/4 exactly as declared.** (The OTHER 15 permits
that were also linked to parcel `439990` pre-run DO have valid coordinates — 13 flipped to parcel `463985`, 2
stayed at `439990` under a distinct nearby lat/lng — correctly spatially resolved, not part of LP-D6's own
claim.)

**(c) 989-duplicate self-heal.** Pre-run `duplicate_permit_pair_count`: 989 (matches the pinned golden baseline
exactly). Post-run: **0**. Self-heal confirmed measured, not merely predicted, exactly as Fold A R-F expected.

**(d) RC-4 — link_rate stays near-flat.** Pre-run: 240,183/254,082 = 94.53%. Post-run: **241,843/254,082 =
95.18%** (+0.65pp). Near-flat, and in the correct direction (a relink, not a delink — some permits that
previously had NO match now find one via THE FIX's own KNN fallback, e.g. permits within the tail whose
old JS-fallback or old predicate never fired). Confirms RC-4, not assumed.

**(e) R-O sample AFTER-half.** Same seed (`20260830002`), same 6-bin stratification, re-run against the
ACTUAL flip population (10,707 rows, old parcel from the before-image vs. new parcel from the live post-run
table) rather than a rolled-back-transaction hypothetical:

| Bin | n (population) | n (sample) | `old_contains=true` | `new_contains=true` |
|---|---:|---:|---:|---:|
| `neg` | 215 | 20 | 0 | 0 |
| `[0,1)` | 24 | 20 | 0 | 0 |
| `[1,5)` | 327 | 20 | 0 | 5 |
| `[5,20)` | 3,612 | 20 | 0 | 12 |
| `[20,50)` | 4,455 | 20 | 0 | 12 |
| `[50,∞)` | 2,074 | 20 | 0 | 19 |
| **Overall** | **10,707** | **120** | **0 (0%)** | **48 (40.0%)** |

**The BEFORE-half's single strongest signal reproduces exactly: 0/120 OLD picks achieve containment in the
committed data, matching the BEFORE-half's own 0/120 precisely.** `new_contains` again rises with delta
magnitude (0% smallest-delta bin → 95% at `[50,∞)`, matching the BEFORE-half's identical 95% at the same bin).
Population-wide (not sampled, all 10,707 actual flips): **`new_contains`=6,371/10,707 (59.5%)**, closely
matching the BEFORE-half's 60.3% and R-B's original containment-flip figure. THE FIX's predicted plausibility
profile is reproduced in what was actually committed, not merely in a pre-commit dry run.

### 4. LP-D7 grounding — do the OTHER `permit_parcels` consumers self-heal?

Following the same method the grounder used for `enrich_permits` (Fold C item 7): both confirmed consumers
have **NO incremental filter — always-full, every run**:

- `scripts/compute-cost-estimates.js` — `SOURCE_SQL` (`:113-199`) is `FROM permits p LEFT JOIN LATERAL (...
  FROM permit_parcels ... ORDER BY parcel_id ASC LIMIT 1) pp ...` with no top-level `WHERE`; the only
  conditional narrowing is an optional `LIMIT` for test row-capping (`:461`), never a staleness filter. Every
  run re-derives the dominant-parcel pick fresh from the live `permit_parcels` state.
- `scripts/refresh-snapshot.js` — a pure Observer aggregate (`COUNT(*) FILTER (WHERE match_type = ...)` over
  `permit_parcels`, `:254-258`) with **zero top-level WHERE by design** ("a single no-WHERE pass forces a
  deterministic Parallel Seq Scan," `:39`) — it writes `data_quality_snapshots`, never `permit_parcels` itself,
  and always reflects current truth on its next run.

**Conclusion: the ~10,707 relinks self-heal on both consumers' very next run; no staleness/stranding risk,
nothing to file to `review_followups.md`** — the "if incremental+stranded, FILE it" condition does not apply.

### 5. Kill-mid-run recovery (Fold A I-2)

Cited, not re-derived, per the plan's own instruction ("expect a citation, not new work"): `runLinkKeyedPhase`
calls `staleness.selectMode({ descriptor, pool, prior, ownRunId })` unconditionally (`index.js:844`), which
(per `staleness.js:487-503`) checks `detectInterruptedRetraction` LAST and wins UNCONDITIONALLY — a crashed
mid-retraction leaves at most one batch's work uncommitted (`pipeline.withTransaction` scope), and the next
invocation resolves `mode: 'full'` regardless of any other signal. This is the SAME generic mechanism proven
for `link_massing`/`link_wsib` (R-B/LW-D20/LG-19), inherited unmodified — confirmed by reading the call site,
not exercised via a fresh live kill (per the coordinator's own instruction not to invent one unless cheap; a
kill-and-recover test is redundant here since the mechanism, the call site, and the lock test are all
unchanged from pilot 3/4's own proof). Lock: `src/tests/db/staleness-interrupted-retraction.db.test.ts`.

### 6. Twice-run idempotency — proven live, not only at fixture scale

Fixture-scale structural proof already exists (`src/tests/steps/link_parcels/violations.test.ts:189`,
"twice-run idempotency lock"). Given run 1's actual duration (170.3 s, well under the ~10 min detached
threshold), a SECOND live FULL run was affordable and executed immediately after run 1:

| | Run 1 | Run 2 |
|---|---|---|
| `mode_reason` | `force_full_env` | `force_full_env` |
| retracted | 17,504 | 12,651 (= run 1's own output) |
| `records_new` / `records_updated` | 26,124 / 155,646 | **12,651 / 0** |
| `matches_tier_1_exact` / `_via_bridge` / `_2_name` / `_3_spatial` / `_3_polygon` / `_3_centroid` | 216,526 / 215,552 / 5 / 25,312 / 12,661 / 12,651 | **identical, all six** |
| `no_match_count` / `null_coordinate_permits` | 12,202 / 9,628 | **identical, both** |
| duration | 170.3 s | 130.0 s |
| **`permit_parcels` table hash (sha256, sorted `permit_num\|revision_num\|parcel_id\|match_type\|confidence`)** | `975fe9e1` (241,843 rows) | **`975fe9e1` (241,843 rows) — byte-identical** |

**Run 2's `records_updated: 0` is the clean proof**: W1's scoped retraction fully clears `match_type='spatial'`
before every rebuild, so the second run's UPSERT touches an empty scope and every row lands as a fresh INSERT
(`records_new`), never an UPDATE — exactly Fold A I-1's "no accumulation, no order-dependent residue" argument,
now measured, not only argued. Table hash identical across both runs. Idempotency CONFIRMED at live-DB scale.

### 7. New findings surfaced by executing (not present in the governing plan, flagged not fixed)

- **`matches_tier_3_spatial`/`matches_tier_3_centroid` are NOT the flip-count metric.** They report the
  ABSOLUTE count of permits matched via Strategy 3 (containment + THE FIX) across the FULL ~254K-permit
  population processed in a FULL run — a fundamentally different, larger quantity than "how many of the
  PRE-EXISTING 17,504 spatial-tier permits changed parcel" (item 3(a), above). Confirmed arithmetically
  self-consistent (`run_matched` + `no_match` = `permits_processed` exactly, both runs) — not a computation
  bug, but a real risk of the SAME confusion this report's author fell into first before checking; documented
  here so a future reader doesn't repeat it.
- **`matches_tier_3_centroid` is a stale field NAME** (`buildLinkMeta`, `scripts/lib/compute/link-parcels.js:345`
  — `matches_tier_3_centroid: m.spatial`). It reports THE FIX's own KNN-boundary-distance match count under a
  name containing "centroid" — the exact terminology LP-D1/A-1 retired. Declared in `emits[]` with
  `consumers: []` (no downstream reader today, so no external break risk from a rename), but it undermines the
  "nothing hidden, always observable" posture this whole pilot is built on. **Not fixed in this commit**
  (operational-run commit, out of the "report, don't improvise" instruction's scope) — flagged as a NEW
  finding for the coordinator/operator's PIN-vs-fix ruling, candidate `LP-D8`.
- **`spatial_null_coordinate_permits` WARN fired at 9,628`, not 4.** This is NOT LP-D6's figure — it is the
  check's OWN declared, broader scope: every permit in the FULL ~254K population (not only the pre-existing
  spatial tier) that reaches Strategy 3 Step 2 with a NULL geocode and is excluded by the SQL's own guard.
  Internally consistent (9,628 ≤ `no_match_count` 12,202, since every NULL-coordinate fallback candidate is
  necessarily a no-match). A legitimate, expected-to-fire data-quality signal under any FULL run touching all
  permits — not a regression from THE FIX, and not in tension with LP-D6's confirmed 4/4 result above (LP-D6
  was always the narrower "currently mis-linked to one parcel" claim, this WARN is the general population
  count). The check's own doc comment already anticipates this as an "R-H retighten candidate" — this
  measurement is the first live data point for that future retighten, not a new problem.

### G-verdict, commit 8

**CLOSED.** Every declared expectation (a)–(e) measured, not predicted: (b) and (c) exact matches; (d) confirms
direction and near-flatness; (a) and (e) confirm the governing ratio and plausibility profile within the same
order of live-DB-churn tolerance already documented at commit 4. Kill-mid-run recovery cited to its existing
proof (Fold A I-2). Twice-run idempotency proven live (not only structurally) — identical table hash,
`records_updated: 0` on the second run. Three new findings surfaced by executing, none blocking, none silently
resolved — `LP-D8` opened for the `matches_tier_3_centroid` naming defect, filed for the coordinator's ruling
rather than fixed unilaterally in an operational-run commit.

---

## §8a. LP-D9 — Strategy 1a's missing street_type predicate (commit 8a, WF3-style, one finding one commit)

### Discovery episode

Commit 8's own golden `--compare` (§8 above) surfaced a redistribution far wider than the declared spatial
tier: `exact_address` 152,975→974, `address_points_exact` 48,815→215,552. Investigating whether this was a
conversion regression or data-driven drift (per the coordinator's ruling, both prior turns of this session):

1. **Conversion-neutrality differential — EXONERATED.** The OLD pre-conversion Strategy 1a/1b/2 SQL, extracted
   verbatim from `git show b37087f3^:scripts/link-parcels.js` and run read-only in FULL mode against the
   current live DB, produced **216,531/216,531 (100%) identical** (permit_num, revision_num) → (parcel_id,
   match_type) assignments versus the live post-commit-8 table. The pilot 7 conversion did not change this
   logic's behavior at all — confirmed, not assumed.
2. **R-O-style plausibility sample on the address-tier flips — INVERTED from the spatial tier's pattern.**
   Seed `20260830002`, N=114, stratified by the same delta-bin methodology: `old_contains` 78.9% vs
   `new_contains` 19.1% — the OPPOSITE of the spatial tier's "0% old, rising new" signature. Investigating why
   (rather than assuming containment is simply the wrong metric) surfaced the root cause.
3. **Root cause, confirmed by reading the code and reproducing it live.** `scripts/lib/compute/link-parcels.js`'s
   `address_points_exact` CTE (Strategy 1a) JOINs `address_points` on `addr_num_normalized` +
   `linear_name_normalized` ONLY — `address_points` carries no street-type column of its own, and the CTE
   never added one via the already-joined `parcels p`. Concrete proof: `26 MEADOWVALE RD` (Scarborough,
   43.777°N) and `26 MEADOWVALE DR` (Etobicoke, 43.647°N) — two addresses 31.6km apart sharing "26
   MEADOWVALE" — collide, with the `ap.address_point_id ASC` tiebreak arbitrarily choosing one REGARDLESS of
   which type the permit itself declared. Measured system-wide: **7,062/215,552 (3.3%) of currently-linked
   `address_points_exact` rows have a permit `street_type` that conflicts with the matched parcel's own**;
   median old-vs-new parcel distance 5.3km, 80% ≥500m apart (n=7,445 sampled via the genuine pre-run rows
   preserved in `LG-24`'s own before-image mirror), max 31.7km. 5,738 of 500,084 city-wide
   `(addr_num, linear_name)` combinations carry this ambiguity.

### Ledger + fence

`LP-D9` (defect-ledger.md). **Fence:** `1ba020bf` (2026-05-23, "WF1 #parcel-address-bridge Phase 2d —
link-parcels Strategy 1a address_points bridge") introduced Strategy 1a specifically to leverage the MORE
AUTHORITATIVE `address_points` bridge over the legacy `parcels`-table string match, disambiguated by a
declared "uniform 3-level rule" (`address_class_desc` > smallest `ST_Area` > `address_point_id ASC`) — no
`street_type` check was ever part of that rule; nothing in the introducing commit argues FOR omitting it, so
this is a genuine design gap, not a deliberate decision this fix overrides. **The fix preserves the fence's
intent fully**: it adds a correctness FILTER before the disambiguation-among-ties logic even runs, so
Strategy 1a still "wins when it matches" (`1ba020bf`'s own words) — it now correctly recognizes when it should
NOT match at all (a different street), which strengthens rather than weakens the authority claim the fence
was built on. **Pre-existing, not a pilot 7 regression** — confirmed identical in the OLD script by item 1
above. **Dormant under 5+ months of incremental-only processing**: `link_parcels`'s own first run
(2026-03-03) predates `address_points`'s first load (2026-03-07) by 4 days, and none of its 64 historical runs
before commit 8 ever approached full-population scope (largest: 19,000/254,082, 7.5%) — a permit correctly
linked via Strategy 1b before Strategy 1a existed (or had bridge coverage for its address) was never
re-evaluated once linked, so the collision had no opportunity to fire until commit 8's first-ever
comprehensive FULL pass.

### Red-first lock, both directions

`src/tests/db/link-parcels-address-tier-street-type.db.test.ts` — a live-DB fixture (two synthetic parcels,
`26 TESTCOLLISION RD` / `26 TESTCOLLISION DR`, same house number + street name, different `street_type`,
deliberately assigned so the DR candidate's `address_point_id` is lower and identical `ST_Area` so the id-ASC
tiebreak alone decides). **Proven RED on the unfixed compute** (2/3 assertions failed): a permit declaring
`street_type=RD` resolved to the DR parcel (the id-ASC-favoured wrong one); an EMPTY-`street_type` permit
matched when Strategy 1b's own real behavior says it never should. **GREEN after the fix, 3/3.**

### THE FIX

`p.street_type_normalized = ip.street_type` added to the CTE's `JOIN parcels p` clause, plus
`WHERE (ip.street_type = '' OR p.street_type_normalized = ip.street_type)` — mirroring Strategy 1b's (`exact`)
own predicate shape byte-for-byte, per the coordinator's explicit instruction not to invent a stricter or
looser form. **Verified live, not assumed**, that 1b's own "empty tolerance" is in practice non-permissive:
its JOIN's hard equality clause already requires `pa.street_type_normalized = ''` whenever `ip.street_type` is
empty, which real parcels essentially never have — measured 0/8,439 sampled pre-run `exact_address` rows with
an empty permit `street_type` — so 1a's fix reproduces that SAME effectively-strict behavior, never a looser
one.

### Observability — `street_type_conflict` (nothing-hidden policy)

A new declared check, mirroring `spatial_null_coordinate_permits`' own shape exactly (WARN, `viol == 0`,
`retighten_when: "zero rows"`): a NEW `street_type_mismatch_sql` (whole-table audit, not a run-scoped
counter — so a pre-fix residual row an incremental run never revisits, or a future regression of the
predicate, is never invisible again) is executed every invocation in `runLinkKeyedPhase`
(`scripts/lib/step/index.js`), feeding `matched.street_type_mismatch` → `records_meta.street_type_mismatch_count`
→ the `street_type_conflict` check. Declared in the descriptor's `checks[]` with the full `LP-D9` evidence in
its `why` text.

### Golden capture differential (post/{permits,sources,standalone}.json re-taken against the fixed code)

Re-captured (live, `capture-step-golden.js`) against the SAME DB state as before (no new run between commits
8 and 8a — only the compute's SQL text changed), all three EXPLAINED, none swept:

- **`summary.records_meta.warnings`** — now `["street_type_conflict: 7046"]` on all three, where the
  pre-8a captures had none. This is the NEW `street_type_conflict` check firing exactly as designed: 7,046
  residual mismatches from the TWO PRE-FIX FULL runs (§8, superseded) still sit in the live table, correctly
  detected — not yet cleared, because clearing them requires the CORRECTED FULL re-run (§8, rewritten below),
  not merely landing the code fix. This is the check doing its job on the very first invocation after 8a
  lands, not a surprise.
- **`table_state[0].content_hash`** (`e143463f`, unchanged from commit 8's own post-fix-run state) and
  **`table_state[0].row_count`** (`241843`, likewise unchanged) — these did NOT change between commit 8 and
  8a's captures (no write happened; commit 8a is a code-only fix), so their diff is against the OLDER,
  pre-commit-8 committed baseline (`fe232ade`/`241172`), which is the SAME already-explained commit-8 delta
  from §8 item 3, not a new one introduced by 8a.

### G-verdict, commit 8a

**CLOSED.** Root cause identified by executing (not merely reading), fenced against its introducing commit,
locked RED-then-GREEN both directions, fixed by mirroring the sibling strategy's own predicate exactly (not
inventing a new tolerance), and made permanently observable. `LP-D9` is now `CLOSED` in the defect ledger.
Next: the corrected FULL re-run (§8b, below) — this is the CURRENT, superseding record of commit 8.

---

## §8b. The CORRECTED FULL re-evaluation (commit 8, landed post-8a) — the CURRENT, superseding record

> Everything below supersedes §8 (marked SUPERSEDED above). Same mechanics (before-image first, strictly
> before retraction; `PIPELINE_CHAIN=sources LINK_PARCELS_FORCE_FULL=1 node scripts/link-parcels.js`,
> 127.0.0.1:54322/postgres), run against the code AFTER `LP-D9`'s fix (commit 8a, `e9a046f0`).

### 1. Before-image

`docs/reports/golden/link_parcels/before-image/2026-08-30T22-55-42.396Z-permit_parcels.jsonl` — W1's own
12,651-row spatial-tier snapshot (matching the live `match_type='spatial'` count immediately before this
run, i.e. the state the TWO original pre-8a runs left behind), plus `LG-24`'s per-batch mirror across the
full ~254K-permit loop (260,215 total lines).

### 2. Mismatch residual — CLEARED

`street_type_mismatch_count`: **0** (confirmed both by the run's own `street_type_conflict` check, which now
reads `PASS`, and by an independent direct query against the live table). The 7,046 residual rows measured
immediately after commit 8a landed (before this corrected run) are gone — the FULL re-evaluation reprocessed
every affected permit under the fixed JOIN.

### 3. The address-tier redistribution, re-measured — reconciled two ways

| | permit_parcels_total | address_points_exact | exact_address | name_only | spatial_polygon | spatial (KNN) | no_match |
|---|---:|---:|---:|---:|---:|---:|---:|
| Original baseline (pre-commit-8) | 241,172 | 48,815 | 152,975 | 4,227 | 17,651 | *(n/a — spatial not split pre-conversion)* | *(n/a)* |
| Broken (post-original-2-runs, pre-8a) | 241,843 | 215,552 | 974 | 5 | 12,661 | 12,651 | 12,202 |
| **Corrected (this run)** | **239,858** | **196,617** | **1,412** | **5,242** | **23,890** | **12,697** | **14,187** |

**vs. the broken state (241,843 → 239,858): net −1,985, reconciles EXACTLY with `no_match_count`'s own
increase (12,202 → 14,187 = +1,985).** Every one of the net row reductions is a permit that now correctly
gets NO link instead of a WRONG one (its street-type-mismatched address has no OTHER valid match under
Strategy 1b/2/3 either) — not a mystery, a direct 1:1 accounting.

**vs. the ORIGINAL pre-commit-8 baseline (241,172 → 239,858): net −1,314.** `address_points_exact` is now
196,617 (still far above the original 48,815 — the bridge table's own genuine, non-buggy coverage growth
over 5 months, per §8a item 2's grounding, is real and legitimate) while `exact_address` recovered from the
broken run's 974 to 1,412 (permits correctly falling back to the legacy strategy once the type-blind bridge
match no longer wrongly claims them) — still far below the original 152,975, because MOST of those
originally-`exact_address`-linked permits DO have genuine, correct `address_points_exact` bridge coverage
today (confirmed by §8a item 1's conversion-neutrality differential — the SAME 216,531 matches the OLD code
would find today) and correctly prefer it, per Strategy 1a's own designed priority over 1b.

### 4. Spatial-tier expectations, re-confirmed unchanged

- **LP-D6 (4 NULL-coordinate permits): still 4/4 retracted, 0/4 relinked** — re-confirmed live after this
  SECOND full re-evaluation (the street_type fix touches Strategy 1a only; Strategy 3's NULL-coordinate guard
  is untouched and structurally cannot be affected).
- **Duplicate self-heal: still 0** (`pp_duplicate_permit_pairs` invariant, re-confirmed).
- **`link_rate`: 94.40%** (239,858/254,082) — within 0.13pp of the ORIGINAL pre-commit-8 baseline (94.53%),
  materially closer to it than the broken run's own 95.18% was. Near-flat, as RC-4 requires.

### 5. R-O sample, REPEATED post-fix on the remaining address-tier flips (same seed) — decisive reversal

Same seed `20260830002`, same delta-bin stratification, run against the genuine pre-corrected-run rows
preserved in this run's own before-image (5,100 address-tier permits whose parcel_id changed this run):

| Bin | n (population) | n (sample) | `old_contains=true` | `new_contains=true` |
|---|---:|---:|---:|---:|
| `neg` | 430 | 20 | 19 | 0 |
| `[1,5)` | 5 | 5 | 0 | 5 |
| `[5,20)` | 10 | 10 | 0 | 0 |
| `[20,50)` | 8 | 8 | 0 | 8 |
| `[50,∞)` | 4,647 | 20 | 0 | 19 |
| **Overall** | **5,100** | **63** | **19 (30.2%)** | **32 (50.8%)** |

**Population-wide (not sampled, all 5,100 flips): `old_contains`=397 (7.8%), `new_contains`=4,497 (88.2%) —
new_contains now decisively BEATS old_contains**, a full reversal of the broken run's own 78.9%/19.1%
(old-beats-new) result that triggered this whole investigation. Sample rows verify the mechanism directly
(e.g. `55 LAKE SHORE DR` → `55 LAKE SHORE BLVD`, `555 INDIAN GRV` → `555 INDIAN RD`, `34 WINSTON AVE` →
`34 WINSTON GRV` — same house number + street name root, corrected to the permit's OWN declared type,
`new_dist_m` collapsing to 0 in most sampled rows). **STOP condition (instruction 3) does NOT fire.**

**The `neg` bin (430/5,100, 8.4% of flips) is the one place `old_contains` still dominates (19/20 sampled)**
— the SAME disposition as the original spatial-tier R-O sample's own `neg` bin (§4): these are cases where
enforcing address correctness (the permit's declared street_type) moves the pick away from a
coincidentally-containing wrong-address parcel toward a correctly-addressed one whose boundary the
(imprecise) geocode doesn't happen to fall inside. Strategy 1a/1b are address-string matches, not
containment matches — this is expected ambiguity from geocoding imprecision, not evidence the fix is wrong,
and it is a small, minority share of the flip population.

### 6. Twice-run idempotency — proven live on the corrected code

Run twice back-to-back post-8a:

| | Run 1 (corrected) | Run 2 (corrected) |
|---|---|---|
| retracted (W1) | 12,651 | 12,697 (= run 1's own output) |
| `street_type_mismatch_count` | 0 | 0 |
| `records_updated` | 16,095 | **0** |
| `permit_parcels` table hash (sha256) | `8a07b229` (239,858 rows) | **`8a07b229` (239,858 rows) — byte-identical** |

**Idempotency CONFIRMED on the corrected code.** Table hash identical across both runs; run 2's
`records_updated: 0` is the same clean proof as commit 8's original pair — W1's scoped retraction fully
clears `match_type='spatial'` before every rebuild, so run 2's UPSERT lands entirely as fresh INSERTs into an
empty scope, never an UPDATE. `street_type_mismatch_count` stayed at 0 on both runs.

### 7. LP-D8 status

`matches_tier_3_centroid`'s stale field name (§8 item 7 original) is UNCHANGED by this episode — still open,
still PIN-or-fix for the coordinator/operator's own ruling, out of `LP-D9`'s scope.

### G-verdict, commit 8 (corrected)

**CLOSED.** All six declared expectations measured on the CORRECTED code: mismatch residual cleared to 0;
spatial-tier LP-D6/duplicates/link_rate all re-confirmed stable; the R-O sample's plausibility signal fully
reversed in the correct direction (88.2% new_contains vs. 7.8% old_contains, population-wide); twice-run
idempotency proven live. No STOP condition fired at any stage of the corrected re-run.

---

## §9. Differential + cutover (commit 9, G8, G4d, G-shape)

### `converted.json` — the +1

`scripts/steps/_schema/converted.json`'s `converted[]` array gains `scripts/link-parcels.js` (7th entry,
matching the pending entry's own promise: "registers_at: C1 pilot 7 commit 9 (cutover)"). The `pending[]`
array's `link_parcels` entry is deleted — its purpose (deferring registration from `shape_clean` at commit 7
to the cutover commit, per R-K.1) is fulfilled. Convention confirmed against all 6 prior entries
(`assert-schema.js`, `load-ravines.js`, `link-massing.js`, `link-wsib.js`, `link-parcel-addresses.js`,
`compute-centroids.js`): the registered path is always the FROZEN SHELL file itself (the one
`manifest.chains[*]` names and `A2`'s shape rule scans), never the `scripts/lib/compute/*.js` file the shell
delegates to — `scripts/link-parcels.js` (the 38-line frozen shape, unchanged since commit 7) is the correct
entry, matching every precedent.

### LP-D8 — adjudicated at cutover (a fix, not deferred)

`matches_tier_3_centroid` (`buildLinkMeta`, `scripts/lib/compute/link-parcels.js:390`) renamed to
**`matches_tier_3_fallback`** this commit — the emitted `records_meta`/`emits[]` field name literally
contained "centroid," the terminology THE FIX/`LP-D1`/A-1 retired at commit 7. Declared in `emits[]` with
`consumers: []` (zero external break risk) and a pure rename (zero behavior change) made it cheap enough to
fix rather than PIN forward — leaving a known-misleading field name in the pilot's OWN cutover commit would
itself have violated the "nothing hidden" posture this whole pilot is built on. Golden captures
(`post/{permits,sources,standalone}.json`) re-taken; all three now carry `matches_tier_3_fallback`, not
`matches_tier_3_centroid`, in `summary.records_meta` (the field this rename touches — cited by name so the
differential's own diff on this key is explained, not swept). `LP-D8` CLOSED in `defect-ledger.md`.

### Spec corrections (grounded, this commit)

- **Spec 41 `41_chain_permits.md`, Step 9 row.** Corrected the false "WF1 Phase C extension: writes to
  unified `lead_parcels`" claim — `link_parcels` writes `permit_parcels` (verified extensively across
  commits 1-8 this pilot); `lead_parcels` is populated by migration 144's own mirror trigger as a downstream
  side effect, never written directly by this script. `Writes To` column corrected `lead_parcels` →
  `permit_parcels`. Tier description updated to note the Spec 122 conversion (frozen shape), THE FIX
  (boundary/KNN spatial fallback, not centroid), and `LP-D9` (Strategy 1a now street_type-aware).
- **Spec 55 `55_source_parcels.md` §4.** Checked for Tier-3 centroid-join prose (per the coordinator's
  conditional instruction) — **none found**; the only `centroid_lat`/`centroid_lng` mention is the neutral
  column-provenance table entry (still accurate — the columns exist, `compute-centroids.js` still populates
  them, `link_parcels` simply no longer reads them for Strategy 3). Nothing to correct.
- **Spec 122 `122_pipeline_step_optimization.md` §8.2.** `1a54baea` (2026-08-30, pre-pilot-7) had already
  folded the Fold-B-corrected range (10,616–10,625/17,5xx, 60.7%) — verified, not the stale struck 38.9%
  figure. Added ONE further correction layer with the FINAL commit-8 measured figure: **10,707/17,504
  (61.2%)**, closing the strikethrough chain rather than leaving the pre-measurement range as the last word.
- **Spec 124 `124_step_standard_policy.md`, R-W (Register row + addendum prose).** **Cited as landed +
  enforced, not re-proposed** (Fold C item 5) — `compute-shape.yml`'s `compute-no-postgis-branch` rule and
  `step-conformance.infra.test.ts`'s `COMPUTE_RULE_IDS` were already live before this pilot started. Fixed a
  genuine staleness the citation check surfaced: the Register row and the addendum prose both still said
  `link_parcels A-1 (JS nearest-parcel fallback, planned — pilot 7 not yet implemented)` — stale since commit
  7 actually retired it. Corrected to "retired commit 7, 2026-08-30" in both locations; the Register row also
  gains `LP-D9` as a fourth precedent (not a PostGIS-branch instance itself, but reinforcing R-W's
  "no silently-selected second algorithm" spirit one step further up the cascade).
- **`spatial_match_max_distance_m` logic_variables description.** Verified — already corrected at commit 7
  (`scripts/seeds/logic_variables.json:642`, "Description corrected pilot 7... the join predicate no longer
  ranks by parcel CENTROID"). Nothing further needed.

### Rule 13 pre-staged gate list — confirmed, as amended by Fold C/D

| Gate | Requirement | Status |
|---|---|---|
| G0 | `"PH-0 — boundary freeze"` heading | ✅ present (§1) |
| G1/G3 | `"PH-3"` heading + closed vocabulary, no bare `INCIDENTAL` | ✅ present (§2), 18/19 vocab-hit rows |
| G6 | Every `LP-D*` row reaches `CLOSED`/`PIN` | ✅ `LP-D1`/`LP-D2`/`LP-D5`/`LP-D6` CLOSED-MEASURED · `LP-D3`/`LP-D4`/`LP-D8`/`LP-D9`/`LP-D10`/`LP-D11`/`LP-D12`/`LP-D13`/`LP-D14`/`LP-D15` CLOSED · `LP-D7` PIN — **15/15, none bare-open (updated commit 14)** |
| G7 | Locks ≥ fences: `LG-24` idempotency, `LP-D6` red-first, SQL-shape perf, **`LP-D9` street_type (NEW)** | ✅ all landed green — `src/tests/steps/link_parcels/violations.test.ts` (LP-D1/LP-D6/tiebreak/SQL-shape) + `src/tests/db/link-parcels-address-tier-street-type.db.test.ts` (LP-D9, 3/3 green) |
| G8 | Differential with FINAL measured deltas | ✅ post-8a numbers: `permit_parcels_total` 241,843→239,858 (−1,985, reconciles with `no_match_count` +1,985); `street_type_mismatch_count` 7,046→0; `matches_tier_3_fallback` rename cited by name (above) |
| G9 | `§R Reflection` with BOTH tables | ✅ promoted to FULL this commit — LOW-CONFIDENCE (3 rows) + RECURRING/STANDARD-SHAPING (5 rows), including the before-image lesson and the "FULL run is a defect-discovery instrument" lesson |

---

## §10. LP-D10 — the dropped `parcel_linked_at` watermark (commit 10, WF6-triggered, WF3 remediation)

### Discovery

**Not found by this pilot's own authoring or review passes across commits 1-9** — found by the WF6
Regression Guardian seat, reading the landed diff against `git blame`/`git log -p` for every deletion, exactly
its own charter. Item #12 of this report's own §2 PH-3 intent ledger (commit 2, this pilot) had claimed the
old script's `:576` `parcel_linked_at` UPDATE "SURVIVES, same consolidation as #10" — a claim never verified
against the LANDED code at the time it was written (commit 2 predates commit 7's own compute; the claim was a
prediction about a future consolidation, never re-checked once that consolidation actually happened). Corrected
above, struck not deleted.

### Grounding (independently re-verified, not merely trusted from the Guardian's own report)

`git show b37087f3^:scripts/link-parcels.js` lines 575-580, inside the fence's own introducing commit
`a21b7b01` (2026-04-01, "fix(28_data_quality): timestamp-based incremental + ghost cleanup in link-parcels" —
"Batch UPDATE `parcel_linked_at` = NOW() for ALL evaluated permits, regardless of match count... Prevents
infinite re-evaluation of unmatchable permits"). `grep -n "parcel_linked_at" scripts/lib/compute/
link-parcels.js scripts/lib/step/index.js scripts/link-parcels.descriptor.json` (pre-fix) found the column
READ ONLY (the incremental filter's own WHERE clause) — never written anywhere. The descriptor's own
`write_inventory.statements: 2` (pre-fix) explicitly enumerated only the guarded upsert (e1) and LG-24's
keyed DELETE (e2) — the watermark was never even claimed, let alone written. Live-measured blast radius:
15,849 permits currently eligible-and-unlinked; 0 of them CURRENTLY exhibit the runaway-reprocessing symptom
only because this dev DB snapshot has had no new permit ingest since before commit 7 landed — every permit's
historical `parcel_linked_at` predates the bug. A live production cron would begin accumulating the symptom
on its very next genuinely-unmatchable new permit.

### THE FIX — restored as a third declared write target

`outputs.writes[2]`: table `permits`, class `set_based_scoped` + `set_source:"compute"` (the LG-22 escape
hatch — `RUN_AT` is a per-run bound value, not a declared constant, so the plain codegen path's `sqlLiteral`
does not fit). `guard:"none"`: LG-9/D-5's own mechanical rule (the `parcel_buildings.linked_at` incident)
forbids a run-clock column (`columns[].source:"run_at"`) from sitting in `guard_columns` — `parcel_linked_at`
is this target's ONLY declared column, leaving nothing else to guard on; `grandfathered.json`'s existing
`link_parcels` entry (originally scoped to LG-24's own DELETE) widened to cover this second `guard:"none"`
instance, with its own `guard_columns_why`/`guard_why` reasoning added. SQL text is compute-authored
(`watermark_update_sql`, `scripts/lib/compute/link-parcels.js`), executed via `write.executeGuardedUpdate` —
the SAME structural forbidden-token executor LG-22's own precedent (`compute_centroids`) uses. writes[]
ORDER: fires LAST in the per-batch transaction, after the upsert (e1) and LG-24's keyed delete (e2) — a
permit's linked/unlinked state is final before it is marked evaluated. The compute-authored SQL itself
additionally carries `AND parcel_linked_at IS DISTINCT FROM $3` as a genuine, narrow safety net against a
same-transaction retry (not visible to the descriptor's own `guard_columns`, which LG-9 checks separately —
correctly, since that field is what the mechanical rule inspects).

### Observability

New standing check `permits_watermarked` (INFO, mirrors `permit_parcels_written`'s own shape exactly — an
always-reported count, not a violation) + `records_meta.permits_watermarked_count`. Separates PERMITS
EVALUATED (this row) from PERMIT_PARCELS ROWS CHANGED (`permit_parcels_written`) — a permit can be evaluated
with zero match-count impact, and this row is what makes that fact observable rather than silent, matching
the "nothing hidden" posture this whole pilot is built on.

### Red-first lock, both directions, both LG-24 branches

`src/tests/db/link-parcels-watermark.db.test.ts` calls `runLinkKeyedPhase` DIRECTLY rather than spawning the
frozen shell — `pipeline.step`'s own `descriptor.database.assert_current_database:"postgres"` check
(a real, deliberate safety mechanism) refuses the ephemeral `BUILDO_TEST_DB=1` container (always named
`buildo_test`) by design, and that check lives in `runWithPool`, one layer OUTSIDE `runLinkKeyedPhase` itself
— calling the phase function directly is a legitimate, narrower unit of test (same DB writes, same
transaction, same watermark statement) without fighting a guard that exists for a different, real reason.

**Proven RED on the unfixed code** (both fixtures, run against the genuine pre-fix compute/runner): a permit
engineered to match nothing had `parcel_linked_at` stay NULL forever; a permit that DID match ALSO had
`parcel_linked_at` stay NULL — the write was missing unconditionally, not only on the no-match path. **GREEN
post-fix**, both directions, further extended (per the coordinator's own "if cheap" instruction) to exercise
BOTH of LG-24's own delete branches in the same run: a pre-seeded stale link with `keep_parcel_id IS NULL`
(zero-match cleanup) and a pre-seeded stale link to the WRONG parcel with a real match landing afterward
(changed-match retraction) — both branches correctly fire alongside the watermark inside the same transaction.

### Live proof, real dev DB (not only the fixture harness)

A genuine no-match permit (`LPD10-LIVE-NOMATCH`) seeded on the live dev DB, `parcel_linked_at` confirmed NULL
before. `PIPELINE_CHAIN=permits node scripts/link-parcels.js` (real incremental invocation, real frozen
shell, real advisory lock): `PIPELINE_SUMMARY` reports `permits_processed:1`, `permits_watermarked_count:1`,
`no_match_count:1`, `spatial_null_coordinate_permits: 1` (this fixture has no lat/lng either, correctly
excluded from Strategy 3's own fallback too). Direct query after: `parcel_linked_at` stamped to the exact run
clock value, zero `permit_parcels` rows (evaluated ≠ linked, confirmed live, not only in the fixture harness).
Fixture permit cleaned up after verification.

### R1 verification hardening — a REAL, already-existing live permit (Fold E addendum, commit 15, 2026-08-30)

The proof above uses a seeded fixture. Fold E's own addendum required the incremental path be proven against
a REAL, already-existing permit too, not fixture scale alone: a genuine live permit, `21 204601 BLD` rev `00`
(already linked to `parcel_id 226797` via `address_points_exact`, `parcel_linked_at: 2026-08-31T01:13:08.715Z`
from an earlier run this session), had its `geocoded_at` stamped to the DB clock (`now()`,
`2026-08-31T01:43:42.707Z`) — a legitimate re-geocode eligibility trigger, `geocoded_at > parcel_linked_at`,
the exact incremental-filter predicate. Eligibility count confirmed `37 → 38` before the run. A real
incremental invocation (`node scripts/link-parcels.js`, no fixture, no env override) reported
`permits_processed: 1` (the OTHER 37 had already been swept up by this session's own prior golden
re-captures, each a real incremental invocation) — `matches_tier_1_exact: 1`, `permits_watermarked_count: 1`,
`terminal: "linked_incremental"`, verdict `PASS`. Direct query after: `parcel_linked_at` (`2026-08-31T01:43:51.923Z`)
now AFTER `geocoded_at`, `permit_parcels` still resolves to the SAME `parcel_id 226797` /
`address_points_exact` (correct — underlying address data never changed, only the geocode timestamp) — a
genuine relink-and-watermark cycle on a real permit, not a constructed scenario.

### FULL-mode semantics, confirmed unchanged

The watermark UPDATE is unconditional with respect to `gate.mode` — it is not wrapped in any FULL-only
branch, and W1's own FULL-only mass retraction (`retract:"all"`/`retract_when:"full_only"`) is a structurally
separate code path this change does not touch. Confirmed live: `PIPELINE_CHAIN=sources
LINK_PARCELS_FORCE_FULL=1 node scripts/link-parcels.js` — **`permits_watermarked_count: 254,045` exactly
equals `permits_processed: 254,045`** (every permit the FULL run touched got its watermark stamped, no
exceptions) — and every match-tier count (`matches_tier_1_exact` 198,029, `matches_tier_1_via_bridge`
196,617, `matches_tier_2_name` 5,242, `matches_tier_3_spatial` 36,587, `no_match_count` 14,187,
`permit_parcels_total` 239,858, `records_new` 12,697/`records_updated` 0) is BYTE-IDENTICAL to the pre-LP-D10
FULL run's own numbers (§8b) — the fix added the missing watermark write with zero measurable impact on the
matching logic itself, exactly as the "restoration, not a behavior change" framing above claims.

### Golden capture differential — the NEW second table_state entry, explained

Re-capturing `post/{permits,sources,standalone}.json` against the 3-target descriptor surfaces a SECOND
`table_state` entry per capture (index 1) — the harness's own auto-derivation now also hashes `permits`,
since `outputs.writes[2]` names it for the first time. Four field names appear in this new entry (verified
directly against the committed JSON, not assumed): **`ceiling_bypassed: "projected"`** (the 254,082-row
table is captured in full despite exceeding the harness's 100,000-row default ceiling, via the descriptor's
own declared 3-column projection — `permit_num, revision_num, parcel_linked_at`, not every column),
**`order_by: "explicit"`** and **`order_columns: ["permit_num", "revision_num"]`** (the composite key,
matching `permit_parcels`'s own ordering convention), and **`skipped_reason`** — present in the DIFF, not in
the current capture itself: verified directly against `docs/reports/golden/link_parcels/pre/permits.json`
(commit 5's own pre-conversion baseline, the G8 differential's comparison reference), `permits` there carries
`{"skipped_reason": "over_ceiling", "ceiling": 100000}` and none of the four fields above — it was, at that
time, a read-only INPUT table (254,082 rows, over the harness's default ceiling) with no declared projection
to hash it against, so it was skipped entirely. `skipped_reason` is absent now because `permits` is a genuine
WRITE target as of this commit (`outputs.writes[2]`), captured in full via its own declared 3-column
projection instead. Not a surprise — a direct, expected consequence of the new write target existing, cited
here so the differential is explained, not swept.

### G-verdict, commit 10

**CLOSED.** Found by the process this session's own review discipline exists to run (WF6, not self-caught),
grounded independently before fixing, fixed as a genuinely-restored third write target (not a workaround),
locked both directions plus both LG-24 branches, proven live on the real dev DB in both incremental and FULL
mode, `LP-D10` CLOSED in `defect-ledger.md`, assessment item #12's false claim corrected in place (struck, not
deleted).

---

## §11. LP-D11 — the mis-stamped fail terminal (commit 11, WF6-triggered, WF3 remediation)

### Grounding (independently re-verified)

`node -e` dump of `descriptor.checks.map(c => c.when)`: all 14 declared checks are `"post"` — confirmed zero
`when:"pre_write"` checks exist. `makePreWriteGate` (`scripts/lib/step/index.js:1912-1917`) filters
`selectChecks(...).filter(c => c.when === 'pre_write')`; with zero matches it `return`s `null`, so
`runLinkKeyedPhase`'s own `preWriteGate` parameter is `undefined` and its no-op default
(`{abort: false, failed: []}`) always applies — the pre-write gate is a permanent no-op for this step.
`pre_write_refused`'s own why-text ("A `when:"pre_write"` check FAILED with no standing override") described
a mechanism that cannot fire. `selectTerminal` (`:213-219`): `byKind = all.filter(t => t.kind === kind)`,
`narrowed = discriminator ? byKind.filter(t => t.id.includes(discriminator)) : []`,
`pool = narrowed.length > 0 ? narrowed : byKind` — with `pre_write_refused` the ONLY `fail_check` terminal,
`byKind` always has exactly one member, so whenever `narrowed` comes back empty (any failing check whose id
`pre_write_refused` doesn't contain — every real check this step has), `pool` falls back to `byKind` and
`pre_write_refused` is selected regardless of which check actually failed. Cross-checked against
`compute_centroids` (0 pre_write checks → correctly 0 `fail_check` terminals) and `link_parcel_addresses`
(0 pre_write checks → 2 `fail_check` terminals, both correctly discriminator-matched to real checks) —
confirming the established, working convention every OTHER converted step already follows.

### THE FIX

Renamed `pre_write_refused` → `failed_write_privilege`, matching `link-massing.descriptor.json:979-988` /
`link-wsib.descriptor.json:648-652`'s own identical shape for the SAME real failure mode (verbatim
cross-check: both siblings' own why-text reads "RLS is enabled ... with zero policies and the role does not
bypass it, so every statement affects 0 rows with no error"). `failed_write_privilege`'s own id now CONTAINS
`write_privilege`, so `selectTerminal`'s discriminator correctly narrows to it specifically the next time
`write_privilege` fails, rather than falling back to it by elimination for ANY failing check. why-text
rewritten to the true failure mode (the write executed, RLS zeroed every affected row — the opposite of the
old text's "no write was issued" claim) and records this WF6 finding + the false-claim history in place.

**No new test lock.** Verified neither `link_massing` nor `link_wsib` has one for their own
`failed_write_privilege` terminal (`grep -rln "failed_write_privilege" src/tests/` → zero hits before this
commit) — matching precedent means none is owed here either, per the coordinator's own "lock if the sibling
pilots locked theirs" instruction.

### G-verdict, commit 11

**CLOSED.** A descriptor-only fix (no compute/runner code changed) — the failure mode itself
(`write_privilege` FAILing) was always correctly DETECTED and reported in the audit table; only the
`records_meta.terminal` stamp was wrong. Grounded independently (the `selectTerminal` mechanism read and
traced by hand, not merely trusted from the observability seat's own report), fixed by matching an
already-correct sibling shape rather than inventing a new one, `LP-D11` CLOSED in `defect-ledger.md`.

---

## §12. LP-D12 — retraction/delete counts invisible in `records_meta` (commit 12, WF6-triggered, WF3 remediation)

### Grounding (independently re-verified)

`runLinkKeyedPhase` (`scripts/lib/step/index.js:903-915`) fires a `retract:"all"`/`retract_when:"full_only"`
mass retraction (W1) against `permit_parcels` scoped `match_type = 'spatial'` before the batch loop, on FULL
mode only, and sets `written.e1.retracted`/`written.e1.deleted`. Confirmed via
`node -e "const d=require('./scripts/link-parcels.descriptor.json'); d.outputs.writes.forEach((w,i)=>console.log(i,w.table,w.retract,w.retract_when))"`:
`writes[0]` (`permit_parcels`, `guarded_upsert`) is the ONLY entry declaring `retract:"all"`; both `writes[1]`
(LG-24) and `writes[2]` (LP-D10 watermark) declare `retract:"none"`. `written.e1` is ALSO the batch loop's
own upsert target (`:1041-1044`), unlike `link_massing` where e2 is upsert — so `retracted` and `inserted`
("rebuilt") already accumulate on the SAME counter object. LG-24's own keyed DELETE (`written.e2`, `:1052-1056`:
`scanned`, `deleted`→`rows_changed`) was likewise fully computed every run. Neither reached `buildLinkMeta`
(`scripts/lib/compute/link-parcels.js:414-433`, pre-fix): only `written.e1.rows_changed` (as `db_upserted`)
and `written.e3.rows_changed` (as `permits_watermarked_count`, LP-D10) were surfaced — `written.e1.retracted`
and all of `written.e2` were computed and then discarded. `link_massing`'s own `mass_retraction_ratio`
(`compute/link-massing.js:520-529`) is the standing, already-shipped precedent for exactly this observability
gap: "The post-write half of D-20: retracted and NOT rebuilt is the shape of a broken run" — `link_parcels`
never got the analogous check when its own `retract:"all"` write target landed (commit 5/7).

### THE FIX

New check `parcel_retraction_ratio` (`compute/link-parcels.js`), registered in `CHECKS` and declared in the
descriptor's `checks[]` — `kind:"bound"`, `severity:"FAIL"`, `blocking:false`, `limit:"pct <= 0.05"`, mirroring
`mass_retraction_ratio`'s own `{retracted, rebuilt, unrestored_ratio}` detail shape and formula
(`Math.max(0, retracted - rebuilt) / retracted`) verbatim, reading `written.e1.retracted`/`written.e1.inserted`
(same counters, different target key than `link_massing`'s e2). New terminal `failed_parcel_retraction_ratio`
(`kind:"fail_check"`) alongside the existing `failed_write_privilege` (LP-D11) — verified discriminator-safe:
`selectTerminal`'s `narrowed = byKind.filter(t => t.id.includes(discriminator))` correctly isolates
`failed_parcel_retraction_ratio` when `discriminator === "parcel_retraction_ratio"` (id contains it,
`failed_write_privilege` does not) and vice versa — the two-fail_check-terminal shape this step now has is the
CORRECT use of the mechanism LP-D11 diagnosed as broken when there was only one. `buildLinkMeta` now also
returns `permit_parcels_deleted_count: (w2 && w2.rows_changed) || 0`, closing the second half of the gap.
Both `records_meta` type maps (`terminals[].records_meta`, the two success terminals) widened with
`permit_parcels_deleted_count`.

**One declared asymmetry from `link_massing`'s shape**, named in the check's own why-text: the FULL retraction
is scoped to `match_type='spatial'` only, while `rebuilt` (`written.e1.inserted`) counts inserts across ALL
match tiers this run — a permit retracted from the spatial tier can legitimately re-land at tier 1/2 this same
run (its address may now resolve via the primary pass). The ratio is therefore a conservative bound
("spatial rows retracted and not replaced by anything, of any tier"), not a tier-exact figure — a broken
predicate or half-completed run still reads as a non-zero ratio, which is the property the check exists to
guarantee.

### Live proof (real dev DB)

Golden re-capture (incremental, unchanged corpus): `parcel_retraction_ratio` reported
`{"retracted":0,"rebuilt":0,"unrestored_ratio":0}` (PASS, correct — no FULL retraction fires on an incremental
run) and `permit_parcels_deleted_count:0` landed in the real `PIPELINE_SUMMARY.records_meta`.

A genuine `LINK_PARCELS_FORCE_FULL=1` run (mode `FULL (force_full_env)`) reported: `retracted 12,697 row(s)`
(W1's own log line), `parcel_retraction_ratio: {"retracted":12697,"rebuilt":12697,"unrestored_ratio":0}`
(PASS — every retracted spatial-tier row was rebuilt), `db_upserted:12697` (consistent), and
`permit_parcels_deleted_count:0` (LG-24's delete legitimately fired 0 times this run — no permit's kept
`parcel_id` changed). This is the FULL-mode live proof the coordinator asked for: both new fields land
correctly in a real audit row, with a genuinely non-zero `retracted`/`rebuilt` pair.

**No new test lock.** `grep -rn "mass_retraction_ratio" src/tests/` returns zero hits — `link_massing`'s own
sibling check and its `failed_mass_retraction_ratio` terminal have no dedicated test either. Matches
precedent, not a new gap.

### G-verdict, commit 12

**CLOSED.** Both counters were already computed by existing, previously-verified write-path code (LP-D10's
own commit proved `written.e1`/`written.e2`/`written.e3` accumulate correctly); this fix is purely
observability — reading counters that already existed and reporting them, mirroring a check `link_massing`
has carried since its own pilot. Grounded independently against the runner code and `link_massing`'s own
precedent (not merely trusted from the observability seat's report), live-proved with both a zero-case
(incremental) and a genuinely non-zero case (real FULL run), `LP-D12` CLOSED in `defect-ledger.md`.

---

## §13. LP-D13 — `spatial_null_coordinate_permits` why-text conflated two populations (commit 13, WF6-triggered, WF3 remediation)

### Grounding (independently re-verified)

`spatial_null_coordinate_permits`'s `expect.reports` field already correctly scopes the check ("permits
excluded from Strategy 3 Step 2 by the `WHERE v.lng IS NOT NULL AND v.lat IS NOT NULL` guard") — the CODE was
never wrong. Its `why.text`, however, told only the LP-D6 story: "4 spatial-tier permits carry NULL
latitude/longitude yet were previously linked." Live-measured on the same `LINK_PARCELS_FORCE_FULL=1` run used
for LP-D12's proof: `matched.null_coordinate_permits: 11613` (of 254,045 permits processed) — this check's own
real live count, three orders of magnitude larger than the 4-row figure the why-text discussed. Cross-checked
`descriptor.invariants`: a SEPARATE entry, `pp_spatial_null_coordinate_count`
(`SELECT count(*) FROM permits p JOIN permit_parcels pp ... WHERE pp.match_type = 'spatial' AND p.latitude IS
NULL AND p.longitude IS NULL`, `last_measured.value: 4`), IS the narrow LP-D6 population — NULL-coordinate
permits that nonetheless carry a `match_type='spatial'` link (the defect signature itself). Its own why-text
("mirroring `spatial_null_coordinate_permits` above at invariant altitude") actively encouraged the
conflation the coordinator flagged, implying the two rows are the same measurement viewed from two altitudes
when they run genuinely different SQL over genuinely different populations.

### THE FIX

Doc/descriptor-text only — no check semantics, no SQL, no scoping changed. `spatial_null_coordinate_permits`'s
`why.text` rewritten to: (a) state plainly what the check counts (population A — permits excluded from the
LATERAL join this run), (b) cite the live magnitude (11,613/254,045) so an operator has a real number to
calibrate against, (c) clarify `retighten_when: "zero rows"` governs a REGRESSION of the guard (the count
silently vanishing because the WHERE clause stopped filtering), never a target the count should trend toward,
and (d) name population B (`pp_spatial_null_coordinate_count`, LP-D6's own 4-row defect signature) as a
DIFFERENT, narrower measurement, not a duplicate. `pp_spatial_null_coordinate_count`'s own why-text rewritten
to drop the "mirroring ... at invariant altitude" phrasing and instead name its own real, narrower query.

**Invariant-vs-check split: verified correct, not re-scoped.** The two rows run genuinely different SQL over
genuinely different WHERE clauses (Strategy-3-exclusion vs. wrongly-linked-despite-NULL) — this is the correct
shape (two real, distinct populations each deserving their own row), not a redundant duplication needing
consolidation. Per the coordinator's own instruction ("doc/descriptor-text only unless you find the check
itself should be scoped differently — if so, report before changing semantics"): no semantic re-scoping was
warranted, so none was made.

### G-verdict, commit 13

**CLOSED.** A pure calibration/observability-text fix — both underlying checks were already measuring the
correct, distinct things; only the prose an operator reads to interpret them was misleading. Grounded
independently against a live FULL run's own real numbers (11,613 vs 4), not merely trusted from the
observability seat's report. `LP-D13` CLOSED in `defect-ledger.md`.

---

## §14. LP-D14/LP-D15 — validator-setup deficiencies, direct orchestrator run (commit 14)

Two GAPS found by the orchestrator's own direct `npm run step:validate -- --all` run, distinct from the WF6
output-panel's own findings (A/B/C above): the validator itself, not the pipeline behavior.

**LP-D14 (Rule 4/G-2 enforced-red).** §2's Intent Ledger had 12 `preserved-in-compute` rows, 11 with no
`why`/`notes.json`/`checks[]` grounding cited in the row itself (`checkPreservedInComputeHasWhy`,
`scripts/analysis/step-validate.mjs:1013-1024`, requires the literal word "why", or "notes.json", or
"checks[]" in the SAME row — a purely mechanical, textual check). All 11 (`d2050cfc`, `a760e0e7`,
`369341ae` a/b/c, `f0daba71`, `030a7611`, `44aebeb7`, `187f0402`, `72362c44`, `52ad6527`, `2577e694`'s shape
half, `03679c94`) are verbatim/byte-identical ports whose original rationale survives as the ported code's
own inline comment — never a missing rule, only a missing citation. Fixed: one consolidated `notes.json`
`decisions[]` entry naming all 11 and the grounding rationale (Rule 2 — the code IS the declaration for an
unchanged mechanical port), then `grounded in notes.json (why: R2, commit 14)` appended to each row.

**LP-D15 (`plausibility: "none"` unjustified).** No genuine defect — a missing standing audit. Declared
`spatial_fallback_distance_within_cap` (mirrors `link_massing`'s own `linked_parcel_null_centroid_count`
shape): checks every `match_type='spatial'` `permit_parcels` row's `ST_Distance` against the parcel it
linked to is still `<= 100m` (the same cap `spatial_fallback_sql` enforces at write time) — catches a row
that was compliant when written but no longer is (cap tightened, or the write-time predicate regressed).
Live-measured: 0 violations, 637ms. `sample_n:1` — bootstrap only, R-T's full median deferred to a future WF3
(filed).

### G-verdict, commit 14

**CLOSED (both).** Neither finding required a behavior change — LP-D14 is a citation gap in already-correct
history bookkeeping, LP-D15 is a new observability row over an already-correct write-time guarantee, live
re-verified at 0 violations. `LP-D14`/`LP-D15` CLOSED in `defect-ledger.md`.

---

## §15. R7 — downstream `compute-cost-estimates.js` verification (Fold E addendum, promoted from FILED, 2026-08-30)

`LP-D7` (PIN, §2/commit 8) grounded `compute-cost-estimates.js` as always-full with no incremental filter — the
~10,707 dominant-parcel relinks from this pilot's own commit 8 FULL re-evaluation were expected to self-heal on
its very next run, no staleness/stranding risk. This section is that verification, run live rather than merely
re-asserted.

**Run.** `node scripts/compute-cost-estimates.js` (detached, no chain arg) against the relinked table:
`records_total: 254,082`, `records_updated: 5,023`, `records_new: 0`. Verdict `WARN` — driven entirely by
`model_coverage_pct: 57.0%` (threshold `>= 80%`), a PRE-EXISTING, system-wide model-coverage gap unrelated to
this pilot's relink work (out of scope per the coordinator's own "do not fix cost-model code" instruction) —
every relink-relevant row (`permit_type_class_skipped_pct` 4.5% ≤ 14.5%, `t4_matrix_miss_pct` 59.2% ≤ 60%,
`archetype_map_nofit_residential_pct` 13.2% ≤ 25%) reads PASS.

**Bounded output-plausibility sample.** N=50, `setseed(0.20260830002)` then `ORDER BY random() LIMIT 50` over
`cost_estimates` rows with `computed_at` in the last 10 minutes (this exact run), joined to their CURRENT
`permit_parcels`/`parcels` (post-relink) for `lot_size_sqm`. Checked per row: `estimated_cost >= 0`,
`cost_range_low <= estimated_cost <= cost_range_high`, `lot_size_sqm > 0` where present, no absurd magnitude
(`> $500M`). **0 anomalies in 50.** Zone distribution over the sample (`zoning_gen_zone`): `1`×1, `4`×3, `6`×2,
`101`×4, `202`×15, `null`×25 (the NULL half is a known, separate zoning-enrichment coverage gap, not a
relink/cost-estimate defect). No stale pre-relink residue is possible by construction — `compute-cost-estimates`
is always-full, so every sampled row's own `computed_at` is this exact run, never a prior one.

**Verdict: SANE.** Nothing insane found; not fixed (nothing to fix). `LP-D7` remains PIN, its own self-heal
claim now measured rather than only argued.

---

## §R Reflection (FULL — promoted at commit 9, per Spec 123 §7/Spec 124 R-F)

> Spec 123 §7's own nine-commit procedure scopes `§R Reflection` to "after cutover" (commit 9) — this is that
> pass. The commit-7 section (preserved in git history, not reproduced here) was an honest PRELIMINARY draft
> sourced from the plan's own R-F section; every row below either carries that draft forward unchanged or is
> a genuine new finding from commits 8/8a/8b/9 — nothing fabricated to fill the table.

✅ **LDG-D1 RULED (WF3 `wf3_link_parcels_declared_reads`, 2026-09-03, post-cutover).** The LDG-4 cross-check found `link_parcels`'s `inputs.reads.steps: []` under-declared. Ruling: `link_parcel_addresses` is declared (genuine, load-bearing bridge read); `compute_centroids` is ruled NOT a dependency post-KNN-fix (`b37087f3` deleted the `centroid_lat`/`centroid_lng` read entirely) — the ledger's derivation of it is a stale `lineage-meta-snapshot.json` artifact from a run that predates the fix, not a live table edge.

### LOW-CONFIDENCE

| Item | Why low-confidence | Carried from |
|---|---|---|
| The near-tie count discrepancy (19 exact ties confirmed across 3 sessions; near-tie count disputed: 72 vs 40) | Never independently reconciled — this pilot's own commit 4 flagged it rather than silently resolving it; the tiebreak-determinism lock is anchored on the 19 exact ties only, which does not depend on the disputed count | Report §4, `defect-ledger.md`'s own `LP-D1`/deviation entries |
| `LG-21` shared phase-scaffold (`runPhaseScaffold`) | Carried from pilot 6, still DEFERRED to a post-pilot-8 library WF — this pilot's own `LG-24`/`LG-25`/`runLinkKeyedPhase` growth is the SECOND LINK member needing non-trivial phase-runner work, strengthening (not yet triggering) the case for a shared scaffold | Governing plan's own R-F mandatory carried steps §1 |
| The address-tier's TRUE pre-commit-8 state is only partially recoverable | `LG-24`'s before-image mirror captures a row only if it is "about to be deleted" within a batch, first-occurrence-per-permit only — sufficient for the R-O sample's own honest signal (§8b item 5) but not a complete audit trail the way W1's SCOPED before-image is for the spatial tier. Not yet tested against a step whose FULL-mode rebuild touches MULTIPLE tiers this asymmetrically | Fold D item 7, `.cursor/active_task.md` (gitignored working file — the lesson lives here, in the committed report, not only there) |

### RECURRING / STANDARD-SHAPING

| Pattern | Generalization | Evidence |
|---|---|---|
| A shared step's `phase` field is exactly Spec 122 §1.7's own predicted failure mode | The SECOND LINK pilot (this one) is where the map-not-ternary fix actually gets BUILT, not merely cited (`link_wsib`, pilot 4, was the first to declare the map; this pilot is the first to RETIRE a live disagreeing pair). Any future shared-step pilot should check for the SAME disagreeing-ternary shape before assuming its own `phase` value is trustworthy | `LP-D3`, this pilot's own G3 archaeology (origin order: `5baaed5a` first/correct, `2577e694` a month-later deviation) |
| A check ported from a pre-conversion text-based `audit_table` row needs its OBSERVATION SHAPE copied from an EXISTING converted step's own compute, never reconstructed from the old field names | This commit's own `write_privilege`/`link_rate` bug: `ctx.report(id, {value})` vs. the library's required `{violations: N}` shape (`verdict.js checkRow` reads `.violations` first, falling back to `.value` only for `pct <=`/`value_min`/`value_max` forms) — caught only by actually RUNNING the converted step, not by static review. A future LINK/MATCHER pilot copying a check's shape from `link-massing.js`/`link-wsib.js` verbatim, rather than re-deriving it from the old script's own field names, would not have hit this | This commit's own write_privilege/link_rate fix, §7 above |
| A `pct <=`-only verdict mechanism (`limit_from_config` has no transform) forces any "floor" config semantic into "ceiling complement" storage | `T5`'s own seed value (25, the unlinked ceiling, not 75, the link-rate floor the old code's literal used) — the SAME requirement `link-massing.js`'s own `link_rate` config already satisfied, just hidden by numeric symmetry (50↔50) in that step's own case. A future pilot externalizing a "X must be >= N%" threshold should check whether the check reports the value or its complement BEFORE choosing the seed's own semantic direction | This commit's own T5 fix, §7 above, `scripts/seeds/logic_variables.json` |
| **A conversion pilot's declared FULL re-evaluation is a defect-discovery instrument, not merely a data-refresh act** | `LP-D9` (Strategy 1a's missing `street_type` predicate) was NEVER exercised by 64 historical runs across 5+ months because every one of them was incremental — once a permit got ANY link, however wrong, it froze forever under `parcel_linked_at IS NULL`-gated reprocessing. The FIRST comprehensive FULL pass a conversion pilot runs is very possibly the first time a step's OLD code has EVER been run against its OWN full population in the current data environment — any latent, previously-unexercised defect in code the pilot did NOT touch (Strategy 1a predates this pilot by 3 months) surfaces THERE, not in the pilot's own diff. A future pilot's FULL re-evaluation should budget for "the run itself finds a bug" as a live possibility, not an edge case — and the response (§8a/§8b's own sequence: exonerate the conversion first via a neutrality differential, THEN root-cause, THEN fix, THEN re-run) is now a proven, repeatable playbook | `LP-D9`, `defect-ledger.md`; report §8a/§8b; Fold D, `.cursor/active_task.md` |
| **Scoped before-image + unscoped (FULL) rebuild = partially unrecoverable before-state for anything outside the declared retraction scope** | `LG-24`'s per-batch before-image mirror was designed as a DELETE-audit trail (its own declared purpose), not a general "reconstruct any tier's true pre-run state" mechanism — it happens to be usable for that (§8b item 5's R-O sample relied on it) only because it captures a row that is about to be deleted, which for a composite-key change means the STALE row survives long enough to be mirrored. A step whose declared `write_discipline.scope` covers only PART of what a FULL run actually rewrites (here: `match_type='spatial'` only, while Strategy 1a/1b/2 also change under FULL) should not assume its before-image mechanism gives full before/after auditability across the whole write — a future LINK/MATCHER pilot with a similarly partial retraction scope should either widen the before-image's own declared scope or explicitly document the gap, as this report now does | Fold D item 7; `scripts/lib/step/write.js`'s own `buildBeforeImageSelectSql` doc comment (`plan.scope`-only by design) |
| **Consolidating N separate statements/transactions into ONE is exactly where a write silently drops — enumerate every statement of the old shape and tick each one off in the new, not just the ones the plan already had in mind** | `LP-D10`: the pre-conversion script ran the batch UPDATE/DELETE work across TWO separate `withTransaction` calls (insert txn, then a second txn for the zero-match DELETE + the `parcel_linked_at` watermark). Commit 7's consolidation into LG-24's single per-batch transaction carried the upsert and the DELETE forward — both were already named in the plan's own G3 intent ledger and Fold A/B's own library-growth discussion — but the THIRD statement living in that same old second transaction, never separately named as its own line item anywhere in the plan, was silently dropped. This pilot's own §2 PH-3 intent ledger even claimed (wrongly, §2 item 12, corrected §10) that it survived, without re-checking the landed code — a prediction written before the consolidation happened, never re-verified after. **The generalizable failure mode: a plan phase that inventories "the writes this consolidation must carry forward" by re-deriving from the OLD script's own `withTransaction` BOUNDARIES (2 transactions → 2 items) rather than its individual STATEMENTS (2 transactions, 3 statements → 3 items) will silently drop whichever statement shares a transaction with one already on the list.** A future pilot consolidating N transactions into fewer should build the carry-forward checklist from `git show <old-file>` statement-by-statement (every `client.query`/`await client.query` inside every `withTransaction`), not transaction-by-transaction | `LP-D10`, `defect-ledger.md`; report §2 item 12 (the false "SURVIVES" claim, corrected §10), §10 |

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

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=link_parcels --write` — Spec 123 §6, ruling R-R (2026-08-29).
> Regenerate with the same command; a stale block is a conformance-lock finding (`step-conformance.infra.test.ts`).

**Score: 16/17** · G9 Reflection: PASS · G4d fence-lock coverage: PASS · G-shape: PASS · **Hard stop: no**

| Gate | Score | Max | Detail |
|---|---:|---:|---|
| G0 | 1 | 1 | boundary-section=true spec-line=true |
| G1 | 1 | 1 | PH-3 section found=true sha-count=38 |
| G2 | 1 | 1 | no PH-2 section; ASSESSMENT-INCOMPLETE claimed instead; why-stated=true |
| G3 | 1 | 2 | table rows=19 vocab-hit rows=18 |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 15 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=1 it-count=14 RED-evidence=true |
| G8 | 3 | 3 | missing-invocations=0 stale-fingerprints=0 unexplained-diffs=0 |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=1 lock-it-count=14 |
| G-shape | PASS | — | file-clean=true compute-clean=true |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 1 | link_parcels | PASS | min_migration=12 <= migrations count=242 |
| 2 | link_parcels | PASS | 7 declared, missing from seeds: none |
| 3 | link_parcels | PASS | retired=0 overlap-with-declared=none |
| 7 | link_parcels | PASS | SPEC LINK header present=true |
| 8 | link_parcels | PASS | G-4: 7 declared, 1 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 4 | (registry) | PASS | overlap: none |
| 5 | (registry) | PASS | clean (0 it.fails( call sites outside a declared pending slug) |
| 9 | (registry) | PASS | clean (0 converted slugs blocked by an unmet cutover_prereq item; blocks batching: 8) |

### Captures (item iv)
- missing invocations: none
- stale fingerprints: none
- compare ran: true · diffs found: 249 · unexplained: 0

### Test suite (item iii)
- 0/0 passed (suite success=true)

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-green | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | enforced-green | §5.5 describe not scoped to this step in the vitest run |
| 3 | Tunables externalized | enforced-green | G-4: 7 declared, 1 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 4 | Compute rule declared | enforced-green | G-2: 12 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-green |  |
| 6 | Omission fails (18 categories) | enforced-green |  |
| 7 | Archetype gates categories | enforced-green |  |
| 8 | Per-target write discipline | enforced-green |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-green |  |
| 10 | Verdict row-derived | prose-only | enforced by step-library.logic.test.ts, outside step:validate's (i)(ii)(iii) run scope |
| 11 | Phase-order re-derive (R-B) | prose-only | R-B describe not scoped to this step |
| 12 | Truthful crash posture (R-M + R-B reader) | prose-only | R-M/R-B-reader describes not scoped to this step |
| 13 | A step validates itself | enforced-green | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | measured | descriptor=49493B notes=8682B checks=15 rows records_meta=3102B (newest post/ capture) |

**Enforced-green: 10/14**

