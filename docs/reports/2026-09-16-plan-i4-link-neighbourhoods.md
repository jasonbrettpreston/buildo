# Active Task: I4 — `link_neighbourhoods` conversion (batch-2 Phase 0.9, LINK 3/3, COMPRESSED R-PACE-1)

**Status:** Implementation — AUTHORIZED 2026-09-16 with all six Asks at their stated defaults (1=B FORK · 2=RETIRE BOTH · 3=retire+declare · 4=accept explained diff · 5=REUSE · 6=(i) declare rows, measure at ①)
**Domain Mode:** **Backend/Pipeline.** Read: `scripts/CLAUDE.md`. *(Corrected at the Integration plan-seat fold, 2026-09-15: the draft declared Cross-Domain on the theory that registering a logic variable touches an admin surface. Measured — `admin.group` is a FIELD inside `scripts/seeds/logic_variables.json` (e.g. `centreline_propagation_coverage_min.admin.group`), and no file under `src/app/api/admin/` or `src/components/` is touched by this conversion. The Domain Rules table maps `scripts/`, `migrations/`, `src/app/api/`, `src/lib/db/` to Backend/Pipeline; this task is entirely inside the first of those.)*
**Commit form: compressed (R-PACE-1)** — the literal marker fast invariant #24 keys on. Grounding: `template-freeze.json.archetype_profiles[LINK].proven === true` and `converted.json` already carries **2** LINK members (`scripts/link-massing.js`, `scripts/link-parcels.js`). Measured: `node scripts/analysis/step-validate.mjs --step=link_neighbourhoods --fast` returns `#24 | (registry) | FAIL | COMPRESSED-FORM-DEFAULT: 1 eligible pending slug(s) plan full-form with no stated reason: link_neighbourhoods` when the marker is absent. R-AH makes compressed the DEFAULT, not an option.

> **Target-file grounding line (batch-2 preamble, non-negotiable, run BEFORE commit ①) — ALREADY VERIFIED, 2026-09-15:**
> `link_neighbourhoods`: `scripts/link-neighbourhoods.js` appears **(a)** verbatim inside Spec 60's `### Target Files` section (`docs/specs/01-pipeline/60_shared_steps.md:250`) AND **(b)** verbatim in Spec 60's row of `docs/specs/00-architecture/00_system_map.md:60` (and also rows 41, 43, and archived 27). Owner spec(s) recorded in the Target Spec line BELOW, before 122/123/124 (G0). `npx vitest run src/tests/system-map.infra.test.ts` to re-confirm at commit ①.

---

## Context

* **Goal:** Convert `scripts/link-neighbourhoods.js` (375 L) to the Spec 122 descriptor + library architecture as the **third and last LINK member**, under the compressed 3-commit form, with **zero unexplained differential diffs** and every fence either knowingly preserved or knowingly retired with an operator ruling.
* **Target Spec:** **`docs/specs/01-pipeline/60_shared_steps.md` §"Link Neighbourhoods"** (the step's own contract — Spec 57:75 says so explicitly: *"its own contract lives in its step spec"*), then **`docs/specs/01-pipeline/41_chain_permits.md`** (permits chain, step 11) and **`docs/specs/01-pipeline/43_chain_sources.md`** (sources chain, step 18), then the architecture specs **122 / 122a / 123 / 124**, then **47** (§A.5 lock registry) and **48** (§3.6 verdict cascade).
* **Key Files:**
  * `scripts/link-neighbourhoods.js` (the shell to freeze) — **do not edit before commit ②**
  * `scripts/link-neighbourhoods.descriptor.json` — **DRAFTED, this pass**
  * `scripts/link-neighbourhoods.notes.json` — **DRAFTED, this pass** (7 entries, 7 `fences[]`)
  * `scripts/lib/compute/link-neighbourhoods.js` — new at commit ②
  * `scripts/lib/step/index.js` — see **Ask 1** (runner)
  * `src/tests/steps/link_neighbourhoods/violations.test.ts` — new at commit ①
  * `scripts/steps/_schema/converted.json` — `pending` at ①, `converted` at ③
  * `docs/reports/2026-09-1x-i4-link-neighbourhoods-assessment.md` — the compressed form's evidence home
  * `docs/reports/defect-ledger.md` — `LN-D1`…`LN-D6`

---

## §0. Measurements — every number carries the command that produced it (2026-09-15, HEAD `11040938`)

### §0.1 The file, the quadrant, the archaeology

| Measure | Value | Command |
|---|---|---|
| Lines | **375** | `wc -l scripts/link-neighbourhoods.js` |
| Churn (commits) | **25** | `git log --oneline -- scripts/link-neighbourhoods.js \| wc -l` |
| `fix(` commits | **17** → **fix density 68 %** | `git log --oneline -- scripts/link-neighbourhoods.js \| grep -ci '^[0-9a-f]* fix'` |
| Quadrant | **top-right** (commits 25 · lines_changed 725 · LOC 255 · branches 54; median split 21 / 54) | `grep link_neighbourhoods docs/reports/generated/122-churn-complexity.md` |
| Fence density | **7 declared fences** (`notes.json` `fences[]`), G4d currently `fences=7 lock-it-count=0` | `node scripts/analysis/step-validate.mjs --step=link_neighbourhoods --fast` |
| Advisory lock | **92**, "2 — Link", NO (not spec-numbered) | `docs/specs/01-pipeline/47_pipeline_script_protocol.md:1936` |
| Archetype (census) | **LINK**, batch **C4**, *"order 4 — LINK 3rd/last member"* | `scripts/steps/_schema/step-archetype-census.json` entry 32 |
| Chain positions | `permits` **11 of 33** · `sources` **18 of 28** (1-based; `sources` has `reconcile` at 1, `permits` does not) | `node -e "const m=require('./scripts/manifest.json'); console.log(m.chains.permits.length, m.chains.permits.indexOf('link_neighbourhoods')+1, m.chains.sources.length, m.chains.sources.indexOf('link_neighbourhoods')+1)"` → `33 11 28 18`. *(Corrected at the Integration fold: the draft wrote "of 32".)* |
| Manifest step entry | `supports_full: true`, `supports_dry_run: false`, `telemetry_tables: ["permits"]`, `telemetry_null_cols.permits: ["neighbourhood_id"]` | `scripts/manifest.json` `scripts.link_neighbourhoods` |
| `pipeline.BATCH_SIZE` | **1000** | `grep -n 'BATCH_SIZE' scripts/lib/pipeline.js` → `:817` |

### §0.2 Compressed-form eligibility, measured

```
node -e "const t=require('./scripts/steps/_schema/template-freeze.json'); console.log(t.archetype_profiles.find(p=>p.archetype==='LINK'))"
→ { archetype: 'LINK', shapes: ['link','link_keyed'], runners: ['runLinkPhase','runLinkKeyedPhase'],
    first_step: 'link_massing', proven: true }
node -e "console.log(require('./scripts/steps/_schema/converted.json').converted.filter(f=>/link-massing|link-parcels/.test(f)))"
→ [ 'scripts/link-massing.js', 'scripts/link-parcels.js' ]           # 2 members ≥ 2 ✔
```

### §0.3 Validator baseline — RUN, output reported verbatim

`node scripts/analysis/step-validate.mjs --step=link_neighbourhoods --fast` with the draft descriptor + notes.json in place and a temporary `pending` entry (`stage: "descriptor_only"`), then the registry edit reverted:

```
Score: 1/17 · G9 FAIL · G4d FAIL · G-shape PASS · Hard stop: YES
G0 0/1 boundary-section=false spec-line=false     G1 0/1 PH-3 section found=false
G2 1/1 quadrant=top-right window=39313d9          G3 0/2 no PH-3/Intent Ledger section
G4 0/2 risk-class row not found                   G5 0/1 no PH-5/Seam map section
G6 0/3 no defect-ledger rows for prefix LN-D*     G7 0/3 stage-gated (descriptor_only)
G8 0/3 missing-invocations=3, missing-pre=3       G9 FAIL stage-gated
G4d FAIL fences=7 lock-it-count=0                 G-shape PASS
Fast invariants:  #1 PASS (min_migration=109 ≤ 244) · #3 PASS · #7 PASS (SPEC LINK header)
                  #8 PASS (G-4: 4 declared, 4 verdict-affecting, 0 violate on_invalid:fail)
                  #20/#21 PASS (not applicable — enrich-only) · #22 PASS · #23 not applicable
                  #2  FAIL — 3 declared logic variables missing from seeds
                  #24 FAIL — COMPRESSED-FORM-DEFAULT (no assessment report yet ⇒ no marker)
Rules matrix: enforced-green 6/14 (Rules 2, 3, 4, 10, 11, 12); Rules 1/5/6/7/8/9/13 enforced-red
              because validateDescriptor itself throws (see below)
Programme: named by 2 blocking items, both BUILT — GOLD-PRE (cutover_prereq), C4-GATE (cutover_prereq)
```

`validateDescriptor` throws on **exactly one class** of error — the four `last_measured` blocks:

```
/invariants/{0,1}/last_measured/{at,cost_ms}: must be string / number
/invariants/{0,1}/last_measured/sample_n:     must be >= 1
/plausibility/{0,1}/last_measured/{at,cost_ms,sample_n}: same
```

**Everything else in the 20-category descriptor validates clean** — the LINK `x-profile` (`invalidates` non-empty, `counters` an object), the class-N write target, the `guard`/`guard_columns`/`scope`/`expected_change_ratio`/`idempotent_rerun`/`txn_scope` shape, `recovery.interrupted_why` + `before_image_why`, `terminals[]`, `sharing.varies_by_chain`, and Rule 11's `order_guarantee{guarantee, spec_ref, anchor}` (the anchor resolves literally in Spec 60 and `spec_ref` agrees with `identity.spec: "60"`).

> **⚠ FINDING, CORRECTED at the Integration plan-seat fold (see Ask 6 for the full record).** The draft read this as *"a descriptor cannot be authored without live-DB access"*. **Refuted:** `step.schema.json:1426-1440` makes the literal `"none"` legal for both `invariants` and `plausibility`, and three converted ASSERT descriptors plus three others already use it. The accurate finding is narrower: **declaring a row commits you to measuring it** — `last_measured` has no "pending" state — so a drafting worktree without `.env` can produce a complete descriptor, but the four rows this step SHOULD declare carry a commit-① measurement obligation (Q1–Q4) that only the committing orchestrator can discharge. **Re-filed as Ask 6 for `.cursor/batch2_c5_active_task.md` §0.4(d).**

### §0.4 The five queries that must run before commit ① (read-only; NOT run this pass — the assessment worktree has no `.env` and the shared Docker DB was out of bounds)

| # | Fills | Query |
|---|---|---|
| Q1 | `invariants.negative_neighbourhood_ids` + LN-D1 evidence | `SELECT count(*) FROM permits WHERE neighbourhood_id < 0` |
| Q2 | `invariants.neighbourhood_id_orphans` | `SELECT count(*) FROM permits p WHERE p.neighbourhood_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM neighbourhoods n WHERE n.id = p.neighbourhood_id)` |
| Q3 | `plausibility.linked_permit_outside_its_own_neighbourhood` — **the Reality-Check number** | `SELECT count(*) FROM permits p JOIN neighbourhoods n ON n.id = p.neighbourhood_id WHERE p.latitude IS NOT NULL AND p.longitude IS NOT NULL AND n.geom IS NOT NULL AND NOT ST_Contains(n.geom, ST_SetSRID(ST_MakePoint(p.longitude::float, p.latitude::float), 4326))` |
| Q4 | `plausibility.stamped_permits_with_null_coordinates` — **decides Ask 3** | `SELECT count(*) FROM permits WHERE neighbourhood_id IS NOT NULL AND (latitude IS NULL OR longitude IS NULL)` |
| Q5 | the two-corpus divergence (LN-D5) + the `neighbourhoods_loaded` floor | `SELECT count(*) FILTER (WHERE geometry IS NOT NULL) AS geojson, count(*) FILTER (WHERE geom IS NOT NULL) AS postgis, count(*) AS total FROM neighbourhoods` |
| **Q6** | **LN-D2's A-8-class run evidence — which branch actually ran** | see the LN-D2 section below (`pipeline_runs.records_meta->>'polygon_tests_skipped'`, the single-site JS-branch discriminator at `:272`) |

Plus three preconditions to confirm, not assume: `SELECT relrowsecurity FROM pg_class WHERE relname='permits'`; the GiST index name on `neighbourhoods.geom` (`\d neighbourhoods`); and `SELECT 1 FROM pg_constraint WHERE conname='fk_permits_neighbourhoods'`.

### §0.5 Capture pairs (R-AI, measured — the collapse is VACUOUS here)

`sharing.varies_by_chain.phase` is a genuine per-chain map (`{permits: 8, sources: 10}`, ported from `link-neighbourhoods.js:105` and `:362`), so R-AI's four-field all-`"none"` precondition is **not met** and the capture set does **not** collapse. `|C(S)| = 2`, so the expected set is **`|C(S)| + 1` = 3 pairs**: `permits` (PRE+POST), `sources` (PRE+POST), `none` / standalone (PRE+POST). The validator confirms: `missing invocations (POST): permits::, sources::, none::` and the same three for PRE. This matches `c4_batching_entry_active_task.md` row I4's "3 capture pairs" — and it is one MORE than every batch-2 C5 step, which is why I4 is C4 close-out and not a Phase-1 member.

---

## PH-0 — BOUNDARY FREEZE (G0)

### Reads

| Table | Columns | Site |
|---|---|---|
| `pg_extension` | `extname` | `:76` — the PostGIS probe (LN-D2) |
| `neighbourhoods` | `id`, `neighbourhood_id`, `name`, **`geometry`** (GeoJSON) | `:80-82`, `WHERE geometry IS NOT NULL` |
| `neighbourhoods` | **`geom`** (PostGIS) | `:138`, `WHERE n.geom IS NOT NULL` — **a different corpus filter (LN-D5)** |
| `permits` | `permit_num`, `revision_num`, `latitude`, `longitude`, `neighbourhood_id` | `:88-98` (count), `:199-215` (batch), `:331-335` (cumulative) |
| `permit_parcels` | `permit_num`, `revision_num`, `parcel_id` | `:91`, `:204` — LEFT JOIN, JS branch only |
| `parcels` | `id`, `geometry` | `:92`, `:205` — LEFT JOIN, JS branch only |

### Writes — ALL of them

| # | Statement | Site | Disposition |
|---|---|---|---|
| W1 | `UPDATE permits p SET neighbourhood_id = n.id FROM neighbourhoods n WHERE n.geom IS NOT NULL AND p.neighbourhood_id IS NULL AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL AND ST_Contains(...) RETURNING p.permit_num` | `:135-143` | **PORTED** → `outputs.writes[0]`, class **N** `set_based_join_update`. Note it carries **no** `IS DISTINCT FROM` and **no** transaction today. |
| W2 | `UPDATE permits SET neighbourhood_id = -1 WHERE neighbourhood_id IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL RETURNING permit_num` | `:148-153` | **KNOWINGLY RETIRED — LN-D1.** Cannot succeed (FK). |
| W3 | `UPDATE permits p SET neighbourhood_id = $1 FROM (SELECT unnest($2::text[]) …) v WHERE … AND p.neighbourhood_id IS DISTINCT FROM $1`, inside `pipeline.withTransaction` | `:301-314` | **RETIRED with the JS branch — LN-D2.** Its `IS DISTINCT FROM` guard (fence `7a147377`) is **PRESERVED** by moving it onto the surviving W1 target. |

**`write_inventory.statements` = 1** after conversion (was 2 on the PostGIS path, 1-per-neighbourhood-bucket-per-batch on the JS path).

### Environment / argv

| Name | Read at | Disposition |
|---|---|---|
| `PIPELINE_CHAIN` | `:104`, `:362` | → `sharing.varies_by_chain.phase` + `execution.invocation` |
| `process.argv` | **none** | `supports_full: true` in the manifest is **unused by the file** — there is no `--full` handling anywhere. `execution.invocation.sources.argv` is `[]`, matching Spec 43:48's own note (*"default/incremental mode — no `chain_args.sources` --full override"*). A new `LINK_NEIGHBOURHOODS_FORCE_FULL` env is introduced by the library's tri-state gate (`override.force_full`), which is net-new capability, not a port. |

### Tunables hard-coded in the file (Rule 3)

| Literal | Site | Externalised as | `on_invalid` |
|---|---|---|---|
| `158` | `:343` (`'== 158'`, `nhoodCount === 158`) | **`sources_neighbourhoods_floor`** (already registered, default 158, bounds 1–1000 — `docs/reference/logic-variables-registry.md:510`) | `fail` |
| `95` | `:346` | `link_neighbourhoods_link_rate_warn_pct` (**new**) | `fail` |
| `50` | `:346` | `link_neighbourhoods_link_rate_fail_pct` (**new**) | `fail` |
| — (no bound today) | `:347` | `link_neighbourhoods_no_match_warn_count` (**new**) | `clamp` |
| `pipeline.BATCH_SIZE` (1000) | `:214` | `execution.batch: 1000` (descriptor data, not a logic variable) | n/a |
| `8` / `10` | `:105`, `:362` | `sharing.varies_by_chain.phase` | n/a |
| `-1` | `:149`, `:241/250/260/291` | **retired** (LN-D1) — not externalised | n/a |
| `92` | `:23` | `identity.lock` + `why_lock` | n/a |
| `4326` | `:141` | `guards.srid` | n/a |

Validator `#2` currently FAILs on the three new names. **Two obligations, both named precisely at the Integration plan-seat fold and both measured:**

1. **Same-commit seed.** The three new variables MUST be added to **`scripts/seeds/logic_variables.json`** — one object per name carrying `default`, `type`, `description` (ending `CONSUMED by link_neighbourhoods`), `min`, `max` and **`admin.group`** (the field that satisfies Rule 3's "declared ⊆ admin GROUPS" conformance arm; it is a seed-file field, which is why this task is Backend/Pipeline and not Cross-Domain) — **in the very commit that declares them in the descriptor (①)**. `docs/reference/logic-variables-registry.md` is regenerated from it, not hand-edited.
2. **Cloud seed apply becomes a PRE-DISPATCH step, not a cutover afterthought.** `scripts/lib/step/config.js:161-170` throws when a declared name has no `logic_variables` **row**, and its message is explicit that *"a seed default exists … but a seed is BOOTSTRAP ONLY — never a runtime fallback for a converted step"* (LM-D15). So a cloud database that has the seed file but has not run the apply **still throws**. `node -r dotenv/config scripts/seeds/apply-logic-variables.js` therefore joins the Spec 123 §7.2 A5 pre-dispatch checklist for this step's cloud-acceptance run — **before** the dispatch, not at cutover. Programme item `CLOUD-PRE` (to be promoted `nice_to_have` → `cutover_prereq` by batch-2 Phase 0.7) is the registry home.

### Exit codes / stdout

Unchanged by the conversion: `pipeline.run` owns the exit code; every terminal exits 0 today (see `deviations[]` "promoting any FAIL check to `blocking: true`"). Stdout is `PIPELINE_SUMMARY` + `PIPELINE_META` + `pipeline.log.info` lines + `pipeline.progress`. The **early-exit path at `:102-125` emits a SECOND, hand-written summary+meta pair with its own duplicated phase expression** — the library derives one from the declaration, so the two can no longer drift (fence `bd9e67ab`).

---

## ⚠ PH-0 SURPRISES — the three that change the plan

### **LN-D1 — the `-1` sentinel is UNWRITEABLE, and has been for ~17 months. Two commits killed it; neither noticed.**

1. **`76dcca28`** (2026-04-17, *"B1 Batch 3 — parseInt/parseFloat → safe-math in 5 scripts"*) replaced `parseInt(dbId, 10)` with `safeParsePositiveInt(dbId, 'neighbourhood_id')` at `:311` — the *one* call site that binds the `updates[-1]` bucket. `scripts/lib/safe-math.js:31-33` **throws** on a negative. ⇒ **the JS branch's entire no-match write has been a guaranteed crash since 2026-04-17.**
   *Evidence:* `git show 76dcca28 -- scripts/link-neighbourhoods.js` → `- [parseInt(dbId, 10), permitNums, revisionNums]` / `+ [safeParsePositiveInt(dbId, 'neighbourhood_id'), permitNums, revisionNums]`.
2. **`7edb231e`** (2026-04-24, migration 109) added `fk_permits_neighbourhoods FOREIGN KEY (neighbourhood_id) REFERENCES neighbourhoods(id) ON DELETE SET NULL` **NOT VALID**, then step 4b `UPDATE permits SET neighbourhood_id = NULL WHERE … NOT EXISTS (…)` — **which NULLs every `-1` already stamped** — then step 4c `VALIDATE CONSTRAINT`. `neighbourhoods.id` is a `SERIAL` (`docs/specs/00-architecture/01_database_schema.md:764`), so no negative row exists. ⇒ **the PostGIS branch's sentinel UPDATE is a guaranteed FK violation** on any database where mig 109 is applied, whenever ≥ 1 coordinate-bearing permit fails to match.
   *Evidence:* `migrations/109_fk_hardening.sql:140-171`; `src/lib/db/generated/schema.ts:2309`; `src/tests/db/109_fk_hardening.db.test.ts:276` — *"rejects a permit pointing to a non-existent neighbourhood_id"*.

**Guardian framing.** The fence is `4699730f` (2026-03-15, *"infinite loop fix + BBOX + observability"*): the sentinel existed because a batch loop re-fetched the same unmatched rows forever. **That fence is independently defended today** by `b1102cdb` (2026-04-01)'s composite keyset cursor `(p.permit_num, p.revision_num) > ($2, $3)` with a matching ORDER BY — forward progress no longer depends on the eligible set shrinking. **The sentinel's second purpose — bounding re-work on the permanently unmatchable tail — is genuinely lost**, and is declared as the standing `no_neighbourhood_match` WARN + `retighten_when` rather than dropped silently. It is **not pinnable** (you cannot pin a write that throws), so §3.1's PIN rule does not apply; this is an A-8-class knowing retirement requiring an operator ruling → **Ask 2**.

### **LN-D2 — the JS/Turf fallback is a second algorithm behind a `pg_extension` probe, and Rule 2's R-W addendum already forbids porting it.**

`:76` `SELECT 1 FROM pg_extension WHERE extname = 'postgis'` → `hasPostGIS` → `:133` branch. That is *exactly* the shape `scripts/ast-grep-rules/compute-shape.yml`'s `compute-no-postgis-branch` rule bans inside compute, so the "wrap verbatim" commit is **structurally impossible** for this branch. Retirement is the only compliant answer, and it has four recorded precedents (link_massing A-8, compute_centroids A-1(a), link_parcels A-1, link_parcels LP-D9) — this makes **five**. Supporting evidence that the branch is fragile rather than load-bearing: three separate crash fixes landed against it alone inside 48 hours (`0c6128c6` lazy-load Turf, `89df1961` move `turfPolygons` into the else block, `eddd185c` `turfPolygons` reference crash in the summary).

#### ⚠ LN-D2 needs A-8's *run evidence*, not just its shape argument — and this step HAS a discriminator (added at the Integration plan-seat fold)

link_massing's A-8 rested on measured run evidence (U-5: **every** recorded run reported `buildings_indexed = 0` and `grid_cells = 'N/A (PostGIS)'`, i.e. no run ever took the fallback). The draft plan argued LN-D2 from the shape rule alone. **Measured this pass: the same evidence IS obtainable here.**

* **The discriminating field is `polygon_tests_skipped`.** It is incremented at **one site only** — `scripts/link-neighbourhoods.js:272`, inside the JS fallback's BBOX pre-filter — and it is emitted **both** into `records_meta.polygon_tests_skipped` (`:360`) and as an audit row (`:348`). A PostGIS run **always** reports `0`; a JS run over 158 polygons reports a number in the millions (the docblock's own claim is "~98 % of polygon tests eliminated per permit").
* **Corroborating, non-queryable signal:** the mutually exclusive log lines `:134` `Using PostGIS ST_Contains (fast path)` and `:162` `PostGIS not available — using Turf.js point-in-polygon`.
* **Stated limit of the discriminator:** `0` is *also* the value a JS run would report if every point fell inside every polygon's bbox — arithmetically possible, practically impossible across 158 disjoint polygons. So a non-zero value proves the JS branch ran; a zero value is strong but not absolute evidence it did not. The log lines resolve the residual, and they are not in `pipeline_runs`.

- [ ] **Q6 (read-only, add to §0.4, run before commit ①):**
  ```sql
  SELECT COUNT(*) AS runs,
         COUNT(*) FILTER (WHERE (records_meta->>'polygon_tests_skipped')::bigint > 0) AS js_branch_runs,
         COUNT(*) FILTER (WHERE (records_meta->>'polygon_tests_skipped')::bigint = 0) AS postgis_branch_runs,
         COUNT(*) FILTER (WHERE records_meta->>'polygon_tests_skipped' IS NULL)       AS indeterminate,
         MIN(started_at) AS window_start, MAX(started_at) AS window_end
  FROM pipeline_runs
  WHERE pipeline_name LIKE '%link_neighbourhoods%' AND status = 'completed';
  ```
  **Expected: `js_branch_runs = 0`.** Record the run count and the window in the assessment report's LN-D2 row, exactly as A-8's U-5 does.
* **If `js_branch_runs > 0`, LN-D2 is NOT an A-8-class retirement** — the branch is live somewhere and the ruling changes. Escalate before commit ②.
* **If the query is indeterminate** (the field is absent from every row, or `pipeline_runs` retention predates the dual path), say so plainly: the retirement then rests on the `pg_extension` presence **measured per environment**, and the plan must name **which environments were measured** — at minimum the local dev DB, the cloud primary, and the `BUILDO_TEST_DB` testcontainer. An unmeasured environment is not an argument; `guards.requires[extension postgis, on_missing: fail]` is what makes an unmeasured environment *halt* rather than silently answer a different question.

### **LN-D6 — retiring the JS branch also retires a CAPABILITY the PostGIS branch never had.**

The JS branch substitutes a linked parcel's Turf centroid when a permit has no coordinates (`:231-255`). The PostGIS branch does not. But `totalPermits` (`:88-98`) counts the **wider** set (`coords OR parcel geometry`) on **every** run, including PostGIS runs — so on every real run the step reports work it structurally cannot do, and those permits stay NULL and are re-counted forever. Two options, decided by **Q4**:
* Q4 reads **0** ⇒ LN-D6 is dead code; retire, declare a `limitations[]` entry (already drafted), done.
* Q4 reads **> 0** ⇒ it is a capability retirement. The strictly-better replacement is to widen W1's own SQL to `COALESCE(permit point, ST_Centroid(pa.geom))` — **but that is a FIX, and §3.1 says PIN, not fix.** It becomes its own peel/WF3 after the conversion is green. → **Ask 3.**

### Other measured findings (lower severity)

* **LN-D3** — `neighbourhoods_loaded`'s threshold is the literal `== 158`. Equality on a municipal boundary count WARNs forever the day the City publishes a 159th, which is exactly the retighten-less permanent-WARN shape Rule 10's R-H addendum forbids. Declared as a **floor** from `sources_neighbourhoods_floor`. **This is the one declared, explained differential diff** (the emitted `threshold` string changes) — ledger `LN-D3`.
* **LN-D4** — **no invalidator on `permits.neighbourhood_id`.** The incremental predicate asks whether a value EXISTS, never whether it is still RIGHT. A permit re-geocoded by `geocode_permits` after stamping keeps its old neighbourhood forever; a boundary reload corrects nothing already stamped. Same class as Spec 121 §4.3's `compute_centroids` worked example. `outputs.invalidates[]` declares the obligation; nothing in the tree meets it. Measured by Q3. **PIN, do not fix.**
* **LN-D5** — the two branches read **different polygon corpora** (`geometry IS NOT NULL` vs `geom IS NOT NULL`), so the `neighbourhoods_loaded` row can read a healthy 158 during a run that matched against fewer polygons. Measured by Q5.
* **Spec drift (commit ③ must fix, and it is an anchor hazard):** Spec 60 §"Link Neighbourhoods" states three things that are false — Turf.js as *the* method (PostGIS has been the live path since `7c75e92e`, 2026-04-02), *"No coordinates → skipped"* (they were stamped `-1`), and *"N+1 query pattern (individual UPDATE per permit — known perf issue)"* (retired by `b1102cdb`'s UNNEST batching, 2026-04-01; Spec 43:48 repeats the stale N+1 claim). **⚠ The descriptor's Rule-11 `order_guarantee.anchor` is the literal `3. Update \`permits.neighbourhood_id\` (sentinel \`-1\` for unmatched)` — amending Spec 60 ROTS that anchor and `checkOrderGuaranteesCited` REDs on a rotted citation. The spec amendment and the anchor re-point MUST land in the SAME commit (③).**

---

## Risk class (G4) — **B**, with the factors shown

| Axis | Factor | Evidence |
|---|---|---|
| **Chance** | **HIGH** | top-right quadrant · 68 % fix density (17/25) · 7 fences · a dual-path branch with 3 crash fixes in 48 h · **zero existing tests** (`src/tests/neighbourhood.logic.test.ts` covers `src/lib/neighbourhoods/summary.ts` only — nothing tests the linker) |
| **Impact** | **MEDIUM** | one column on one table, additive only, no retraction, no junction; ~20 downstream consumer files (`src/lib/leads/*`, `src/lib/market-metrics/queries.ts`, `src/app/api/admin/stats`, `NeighbourhoodProfile.tsx`) read it but only two are sentinel-aware (`stats/route.ts:88` `neighbourhood_id > 0`; `permits/[id]/route.ts:170`) and the FK already guarantees referential sanity |
| **Total** | **B** | High chance × Medium impact. Not A: the blast radius is one nullable column with an enforced FK and no destructive write anywhere in the step. |

## Seam map (G5)

| Seam | Where | Declared as |
|---|---|---|
| **DB** | `pool.query` ×5 + `pipeline.withTransaction` ×1 | `ctx.pool`, never reached from compute (Rule 2) |
| **Clock** | `Date.now()` at `:73`/`:320` — elapsed only, never written to the DB | `duration_ms` emit; no `columns[].source: "run_at"` target exists (the step writes no watermark — see LN-D1's lost second purpose) |
| **Network** | **none** | `execution.network: "none"` |
| **argv / env** | `PIPELINE_CHAIN` only; **no argv at all** | `execution.invocation` + `sharing.varies_by_chain.phase`; `override.force_full` is net-new |
| **Extension** | `pg_extension` probe at `:76` | `guards.requires[extension postgis, on_missing: fail]` — the probe itself is **retired** (LN-D2) |

---

## The 13 before/after guarantees, re-derived for THIS step from ITS three specs

*(`scripts/lib/step/index.js:678-680` — "every step of it is one of the 13 before/after guarantees re-derived from the step's own three specs BEFORE the archetype was chosen (`tasks/lessons.md`'s last line — pilot 2 silently retired Spec 59 L7/L8 by reordering)". Specs 60 / 41 / 43.)*

| # | Guarantee | Before (script) | After (library) | Preserved? |
|---|---|---|---|---|
| **G-1** | The polygon corpus is loaded **before** any stamp is written (Spec 60's numbered contract, steps 1→3) | Yes, but only **reported** at `:343`, after every write | `checks[].neighbourhoods_loaded_before_write`, `when: "pre_write"`, with `order_guarantee` | **STRENGTHENED** — a zero-corpus run now writes nothing instead of walking everything |
| **G-2** | Preconditions are checked **before** the first read | No — the PostGIS probe is the only one, and it *selects a branch* rather than refusing | `guards.requires` ×5 (extension, column, index, FK, RLS), `on_missing: fail`, before compute | **STRENGTHENED** |
| **G-3** | The mode gate reads the **last completed prior run**, before anything is written | Absent — no staleness gate at all | `staleness.mode_select: "tri_state"` + `readPriorEmit` | **NET-NEW** |
| **G-4** | A missing GiST index is refused, not absorbed | No | `guards.requires[index idx_neighbourhoods_geom]` | **NET-NEW** (index name to confirm, §0.4) |
| **G-5** | The step cannot read its own just-opened ledger row | n/a (no ledger read) | library `readPriorEmit` semantics | **NET-NEW** |
| **G-6** | RLS is preflighted — a write that would affect 0 rows is refused | No (silent 0-row UPDATE) | `guards.requires[rls_bypass_or_policy permits]` + `write_privilege` check | **NET-NEW** |
| **G-7** | The DB clock is captured once, before any write | n/a — **this step writes no timestamp column at all** | `RUN_AT` captured by the runner; no `source: "run_at"` column declared | **N/A, declared** |
| **G-8** | The pre-write gate is scored **before** `writes[0]` | No gate exists | `preWriteGate` before the first UPDATE | **NET-NEW** |
| **G-9** | `writes[]` execute **in declared order** | Order was W1 then W2 (match, then sentinel) — and **reversing it would stamp everything `-1`** | One target; the ordering hazard is retired with W2 | **RETIRED WITH LN-D1** — state it, do not silently drop it |
| **G-10** | The change guard names exactly `neighbourhood_id` and never a clock column | The JS branch guarded (`7a147377`); **the PostGIS branch did not** | `guard: is_distinct_from`, `guard_columns: ["neighbourhood_id"]` on the surviving target | **PRESERVED AND EXTENDED to the PostGIS path** |
| **G-11** | Batch progress advances on a composite keyset cursor with a matching ORDER BY | Yes, JS branch only (`b1102cdb`); the PostGIS branch is one unbatched statement | `staleness.checkpoint {cursor: "permit_num,revision_num", ordered: true}` + `execution.batch: 1000` | **PRESERVED AND EXTENDED** — see **Ask 1**, this is what forces the `link_keyed` cursor |
| **G-12** | The link rate reported is **cumulative**, never run-scoped (`e53cdcf5`) | Yes (`:331-338`) | `checks[].link_rate` / `link_rate_floor` over the post-write cumulative query | **PRESERVED** |
| **G-13** | The verdict is derived from the audit rows, never a parallel boolean (`bd1f0e61`, Spec 48 §3.6) | Yes — a local `verdictCascade` at `:27-30` | `scripts/lib/step/verdict.js` `deriveVerdict`; the local copy is deleted (Rule 10) | **PRESERVED, and centralised** |

---

## The 20 category answers

| # | Category | Answer |
|---|---|---|
| 1 | `identity` | `link_neighbourhoods` · "Neighbourhood Linking" · owner `data` · lock **92** (+ `why_lock`: not the spec number, `c1ef0b73` next-free per Spec 47 §A.5) · **spec `"60"`** · archetype **LINK** · `gate_exempt: false` |
| 2 | `inputs` | steps: `neighbourhoods` (gte), `geocode_permits` (gte) · tables: `permits`(5 cols), `neighbourhoods`(4 cols, **`geom` not `geometry`**) · externals `[]` · `expect_nonempty: true` · `on_missing: halt` |
| 3 | `outputs` | **1 write** — `permits`, key `[permit_num, revision_num]`, col `neighbourhood_id`, class **N `set_based_join_update`**, `guard: is_distinct_from`, `guard_columns: [neighbourhood_id]`, `retract: none`, `replay: idempotent_upsert`, `idempotent_rerun: zero_writes`, `txn_scope: batch` · `cascades: none` · `invalidates: [{permits, neighbourhood_id, when: lat/lng rewrite OR boundary reload}]` (LINK profile requires ≥1) · `publish: direct` · `write_inventory.statements: 1` |
| 4 | `staleness` | scope `neighbourhood_id IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL` · trigger `code_version` pre_compute · `mode_select: tri_state` · checkpoint `permit_num,revision_num` ordered · `interval: none` · `fingerprint: derived` over `scripts/lib/compute/link-neighbourhoods.js` · `logic_version: v1-postgis-containment` · `on_fingerprint_change: run` · `on_prior_run_error: fail_step` |
| 5 | `guards` | `requires`: postgis extension · `neighbourhoods.geom` · the GiST index · `fk_permits_neighbourhoods` · RLS on `permits` — **all `on_missing: fail`** · `srid: 4326` · `empty_source: neighbourhoods` · `schema_drift: pause` |
| 6 | `execution` | shape **`link_keyed`** (PROVISIONAL — **Ask 1**) · budget 20m · `txn_scope: batch` / budget 5m · chunked · `statement_timeout: none` · `step_timeout: 45m` · **batch 1000** · `partial_fill: batched` · `on_row_error: fail_fast` · `on_batch_error`/`on_check_error: fail_step` (+ `why`) · `criticality: required` · `network: none` · `invocation: {permits: {argv: [], PIPELINE_CHAIN=permits}, sources: {argv: [], PIPELINE_CHAIN=sources}}` · `maintenance: none` |
| 7 | `checks` | **9** — see the table below |
| 8 | `invariants` | **2** — `neighbourhood_id_orphans` (FAIL), `negative_neighbourhood_ids` (FAIL). `last_measured` blocked on Q1/Q2. |
| 9 | `plausibility` | **2** — `linked_permit_outside_its_own_neighbourhood` (WARN + retighten, **the Reality-Check row**), `stamped_permits_with_null_coordinates` (WARN + retighten). Blocked on Q3/Q4. |
| 10 | `override` | `force_full: LINK_NEIGHBOURHOODS_FORCE_FULL` · `force_run: none` · `dry_run: none` (manifest says `supports_dry_run: false`) |
| 11 | `emits` | `code_version`(str, self-consumed) · `duration_ms` · `permits_processed` · `permits_linked` · `no_match_count` · `neighbourhoods_loaded` |
| 12 | `deviations` | **4** — LN-D1 sentinel retirement · LN-D2 JS-branch retirement · no `blocking: true` promotion (carried precedent) · Rule 3 `on_invalid` split (3 × `fail`, 1 × `clamp`) |
| 13 | `limitations` | **5** — no invalidator (LN-D4) · the wider-counted-than-processed set (LN-D6) · the two-corpus divergence (LN-D5) · undeclared overlap tiebreak · Spec 60/43 drift |
| 14 | `interpretation` | `link-neighbourhoods.notes.json`, **7** entries (2 `read_this_way`, 1 `known_normal`, 1 `known_bad`, 2 `blind_spots`, 1 `suspicious_if`) + 2 `decisions` + **7 `fences[]`** |
| 15 | `recovery` | `reset` (re-run with FORCE_FULL; a full run cannot un-stamp — the operator must NULL the scope first) · `resume: none` · `force: LINK_NEIGHBOURHOODS_FORCE_FULL` · `rollback: none` · `verify_clean: generated` · `cascades: derived` · **`interrupted: "none"` + `interrupted_why`** (no destructive retraction exists — Rule 12's legitimate `"none"`) · **`before_image: "none"` + `before_image_why`** |
| 16 | `database` | `class: primary` · `min_migration: **109**` (the FK that enforces LN-D1) · `assert_current_database: postgres` |
| 17 | `counters` | all three from `written.e1.{scanned,inserted,updated}`, **scoped_by `[permit_num, revision_num]`** (LINK profile: scoped by `writes.key`) |
| 18 | `config` | 4 logic variables — `sources_neighbourhoods_floor`(fail, **reused**, Ask 5), `link_neighbourhoods_link_rate_warn_pct`(fail), `..._fail_pct`(fail), `..._no_match_warn_count`(clamp) · `validation: strict` · `hoisted_above_gate: true` · `retired: []` |
| 19 | `sharing` | `chains`/`shared`/`slug_forms` derived · `varies_by_chain: {checks: none, phase: {permits: 8, sources: 10}, audit_table: one, scope: none}` · `on_contention: self_skip` |
| 20 | `terminals` | **11** — `linked_incremental`, `linked_full_relink`, `linked_with_warnings`, `no_eligible_permits`, `failed_link_rate`, `failed_empty_polygon_corpus`, `failed_sentinel_residue`, `failed_write_privilege`, `failed_missing_precondition`, `failed_config_out_of_bounds`, `lock_held_elsewhere` |

### `checks[]` — 9, each with a human-readable `why`

| id | when | sev | bound | why, in one line |
|---|---|---|---|---|
| `neighbourhoods_loaded_before_write` | **pre_write** | FAIL | `sources_neighbourhoods_floor` | With an empty corpus every eligible permit is walked, matched against nothing and left NULL — pre-conversion that was only *reported*, at `:343`, after every write had been issued |
| `permits_processed` | post | INFO | — | Descriptive only; no threshold bounds how many permits arrive geocoded in a window (Rule 10 R-H's narrow INFO exception, declared) |
| `neighbourhoods_loaded` | post | FAIL | `sources_neighbourhoods_floor` | The corpus floor, ported from `:343`'s `== 158` as a **floor** (LN-D3) — an equality WARNs forever on a 159th neighbourhood |
| `run_linked` | post | INFO | — | Ported from `:344`; in steady state this is the arrival-window size, which no threshold bounds |
| `link_rate` | post | WARN | `link_neighbourhoods_link_rate_warn_pct` | **Cumulative**, never run-scoped (fence `e53cdcf5`): a run that links 3 of 3 arrivals reads 100 % while the estate sits at 40 % |
| `link_rate_floor` | post | FAIL | `link_neighbourhoods_link_rate_fail_pct` | The catastrophic-collapse arm of `:346`, declared as its own ROW because Rule 10 derives the verdict from rows — two bounds on one metric are two rows, not one row with a computed severity |
| `no_neighbourhood_match` | post | **WARN + retighten_when** | `link_neighbourhoods_no_match_warn_count` | Was INFO beside a write-once sentinel; with the sentinel retired the same permits are re-walked every run, so the counter becomes the standing cost signal — WARN with a machine-observable retighten condition, never INFO-by-taste (R-H) |
| `sentinel_residue` | post | FAIL | `viol == 0` | The lock that keeps LN-D1 retired: a negative id is unwriteable under the FK, so non-zero means the FK was dropped or a second writer exists |
| `write_privilege` | post | FAIL | `viol == 0` | Under RLS a set-based UPDATE affects 0 rows with no error — without this, "wrote nothing" and "not allowed to write" are indistinguishable |

---

## Technical Implementation

* **New/Modified Components:** `scripts/lib/compute/link-neighbourhoods.js` (new) · `scripts/link-neighbourhoods.js` (frozen onto `pipeline.step()`) · `scripts/lib/step/index.js` (**Ask 1**) · `scripts/steps/_schema/converted.json` · seeds + admin GROUPS + `docs/reference/logic-variables-registry.md`
* **Data Hooks/Libs:** `scripts/lib/step/{index,write,staleness,verdict,config}.js` — all existing; the only library change is whatever **Ask 1** rules.
* **Database Impact:** **NO migration.** No column added, no constraint changed. The step writes one existing nullable column on ~237 K+ `permits` rows via a scoped, change-guarded, batched UPDATE. `database.min_migration: 109`.

## Standards Compliance

* **Try-Catch Boundary:** N/A — no API route. The step's error boundary is `pipeline.run` + `on_row_error: fail_fast` / `on_batch_error: fail_step` / `on_check_error: fail_step`. The ONE existing `try/catch` that swallows (`:237-244`, invalid parcel-geometry JSON → silent `-1` reclassification) is **retired with the JS branch** (LN-D2) — the same silent-swallow removal link_massing's A-8 bought.
* **Unhappy Path Tests:** every one of the 11 terminals, plus the 7 fence locks below, plus both directions of each.
* **`logError` Mandate:** N/A (`scripts/` uses `pipeline.log.*`; no new catch blocks are introduced — one is removed).
* **UI Layout:** N/A — Backend/Pipeline. The 3 new variables reach the admin surface through `admin.group` in `scripts/seeds/logic_variables.json` (Rule 3's "declared ⊆ admin GROUPS" conformance arm); no component, page or API route is authored or edited.

---

## Execution Plan — COMPRESSED 3-commit form (Spec 123 §7 R-PACE-1 / Spec 124 R-AH)

> Every gate, floor and lock of the nine-commit form is unchanged (≥ 14/17, `hard-stop=false`, G0–G9, Rules 1–13, both-directions locks). What moves is **where the per-commit evidence lives** — into `docs/reports/2026-09-1x-i4-link-neighbourhoods-assessment.md`'s own sections instead of six separate commit messages.

### ① Assessment + red tests (PH-0 … PH-7)

- [ ] Run **Q1–Q5** plus the three precondition probes (§0.4). Fill every `last_measured` block; the descriptor does not schema-validate until they are real (§0.3 finding).
- [ ] Write `docs/reports/2026-09-1x-i4-link-neighbourhoods-assessment.md` carrying, as its own sections: **§0 boundary** (PH-0 above, verbatim) · **§PH-3 Intent Ledger** (all 25 commits, every construct disposed CONTRACT / INCIDENTAL / DEFECT, each DEFECT carrying an `LN-D*` id; evidence = blame output + commit subjects + test names — **an agent produces it, a human adjudicates it**, Spec 123 §7.1) · **§PH-5 seam map** · **§PH-6 classification** · **§G4 risk class B with chance and impact factors shown** · **§R Reflection** (low-confidence table + recurring/standard-shaping table). Include the literal line `**Commit form: compressed (R-PACE-1)**` (fast invariant #24) and the literal `ASSESSMENT-INCOMPLETE` **only** if the time-box actually fires.
- [ ] Open `LN-D1`…`LN-D6` in `docs/reports/defect-ledger.md`, each with status `PIN` or `CLOSED-MEASURED` (G6 reads this prefix; it currently scores 0/3 for exactly this reason).
- [ ] Add `scripts/link-neighbourhoods.descriptor.json` + `scripts/link-neighbourhoods.notes.json` (drafted this pass; re-validate after the measurements land).
- [ ] Add the **3 new logic variables to `scripts/seeds/logic_variables.json`** (each with `default`/`type`/`description`/`min`/`max`/**`admin.group`**) **in this same commit** — a declared name with no seed and no DB row throws at `scripts/lib/step/config.js:161-170` (LM-D15). Regenerate `docs/reference/logic-variables-registry.md`; amend `sources_neighbourhoods_floor`'s "CONSUMED by" line to name `link_neighbourhoods` (**Ask 5**). Re-run `--fast` until invariant **#2** is PASS.
- [ ] Run **Q6** (LN-D2's A-8-class run evidence) and record `js_branch_runs` + the window in the report's LN-D2 row. A non-zero result **stops the retirement ruling**.
- [ ] Add `src/tests/steps/link_neighbourhoods/violations.test.ts` — **7 both-directions fence locks** (G4d currently reads `fences=7 lock-it-count=0`) + the 11 terminals + the `-1`-is-unwriteable lock. **Prove RED first**, record the red evidence in the report (G7 reads `RED-evidence`).
- [ ] Register the `pending` entry in `converted.json`: `{file: "scripts/link-neighbourhoods.js", registers_at: "commit ③", reason: …, declared: <date>, stage: "red_suite"}` — **`red_suite` until the descriptor lands in the same commit, then `descriptor_only`**; a descriptor that exists while `stage` stays `red_suite` is RED.
- [ ] `node scripts/analysis/step-validate.mjs --step=link_neighbourhoods --fast` — expect G0/G1/G2/G3/G4/G5/G6/G4d green, G7/G8/G9 stage-gated.

### ② Conversion + golden differential

- [ ] **Capture the golden PRE set FIRST** — 3 pairs (`permits`, `sources`, `none`/standalone), against the pre-conversion file. Declare the **non-determinism inventory BEFORE the first diff** (candidates: polygon-overlap tiebreak, `duration_ms`, the `-1` FK throw's own error text if the tail is non-empty). `GOLD-PRE-FRESH` (#22) requires PRE captures committed and git-clean.
- [ ] `scripts/lib/compute/link-neighbourhoods.js` — domain logic only: `buildMatchSql` (eligible count, eligible batch, the ST_Contains join) + row classifiers + one observer per declared check. **No `hasPostGIS`, no `pg_extension`, no `process.env`, no `console`, no wall clock** — `compute-no-postgis-branch` and the other 8 `compute-shape.yml` rules block over `scripts/lib/compute/**`.
- [ ] Runner per **Ask 1**. If the ruling is FORK: `scripts/lib/step/index.js` gains `runLinkColumnPhase`, `step.schema.json`'s `x-frozen` `execution.shape` enum gains `link_column` **with an `x-ruling{rungs_tried, why}` node** (G-1 schema-baseline ratchet), and **this same commit carries `generate-template-freeze.mjs --refresh` (re-freeze #6) + the Spec 122 §8 amendment + the `template-freeze.infra.test.ts` pin flip** — the R-E lock hard-stops otherwise.
- [ ] Freeze the shell onto `pipeline.step()`; `pipeline.run(` must no longer appear in `scripts/link-neighbourhoods.js` (G-shape).
- [ ] Advance the `pending` entry's `stage` → `shape_clean`.
- [ ] Capture the golden POST set (3 pairs) and run the differential. **Target: exactly ONE explained diff — LN-D3's `threshold` string — pointing at its ledger id.** Every other diff is unexplained until adjudicated.
- [ ] `--fast` green; G8 `unexplained-diffs=0`.

### ③ Cutover + spec diff

- [ ] Register `scripts/link-neighbourhoods.js` in `converted.json.converted` **AND delete its `pending` entry in the SAME commit** (R-K, mutual-exclusion lock).
- [ ] **Spec diff, mandatory (Spec 124 §4.5 — present or a literal `N-A` in the body).** Amend **Spec 60** §"Link Neighbourhoods" (PostGIS is the method; the `-1` sentinel is retired and why; delete the false N+1 claim; delete *"No coordinates → skipped"*) and **Spec 43:48** (delete the repeated N+1 claim). **⚠ Re-point the descriptor's `order_guarantee.anchor` in this same commit** — the current anchor is the sentence being amended and `checkOrderGuaranteesCited` REDs on a rotted citation.
- [ ] Run `node scripts/analysis/step-validate.mjs --step=link_neighbourhoods --write` **in this commit** (R-R) and commit the generated `## Validation scorecard (generated)` block into the assessment report. **Floor: ≥ 14/17, G6–G8 full, `hard-stop=false`.**
- [ ] CLOUDPARITY as a `cutover_prereq`. **Pre-dispatch (Spec 123 §7.2 A5 order), BEFORE the run is triggered, not at cutover:** push + assert `headSha`, then `node -r dotenv/config scripts/seeds/apply-logic-variables.js` on cloud for the 3 new variables — a seed file alone does NOT satisfy LM-D15, only a `logic_variables` **row** does (`config.js:161-170`). Then one recorded cloud run carrying `link_neighbourhoods` with `status='completed'` and `records_meta->>'skipped' IS NULL` — or an `applies_when` exemption stated. Programme item `CLOUD-PRE`.
- [ ] Update Spec 122 §1.10's LINK membership (3/3 converted) and add the batch-2 row to **Spec 123 §7.2**'s as-practised table (pointer-style).

---

## Panel roster (Spec 08 §6.4 — both altitudes mandatory)

**PLAN altitude** (agents read this file + the live tree/DB, before any code):
* **Integration** (`general-purpose`, **main tree**) — standing PLAN member for Backend/Pipeline. Verify: does `runLinkKeyedPhase` genuinely refuse this step's counter vocabulary? Is the GiST index name right? Does `manifest.chains` agree with the declared `invocation` map? Does `converted.json`'s `pending` vocabulary accept the declared `stage` sequence?
* **Reality-Check** (`pipeline-reality-check`, **main tree**) — **FIRES.** `neighbourhood_id` is an enriched/derived field (Spec 08 fires by SUBJECT MATTER, not table). Plan-altitude ask: a plausibility bound for the **cumulative link rate** and for **Q3** (`linked_permit_outside_its_own_neighbourhood`), the named cross-field invariants the change must preserve (permit point ∈ its stamped polygon; no negative id; no orphan id), and an audit-row count for every cap/drop/default. **Run Q1–Q5 and report the numbers, not the reasoning.**
* **DeepSeek lens set** — 4 passes (spec / security / idempotency / error-paths), each adjudicated by a grounder.
* **Idempotency Lens** (`general-purpose`, main tree) — the step is re-runnable and the conversion changes its transaction boundary (the PostGIS path runs **outside** any transaction today; the converted target declares `txn_scope: batch`). Hunt: run-2-vs-run-1 state, what runs outside the txn, the `zero_writes` claim.
* **Regression Guardian** (`regression-guardian`, **main tree**) — **FIRES at plan altitude too**, scoped to the retirement decisions. Must state the fence for LN-D1, LN-D2, LN-D6 and G-9 (the write-order hazard) and adjudicate whether each is *knowingly* retired. **Do not let the discovering pass also retire the fence** (Spec 123 §7.1).

**OUTPUT altitude** (on the diff + the re-run values): the **5-reviewer pipeline panel** — Gemini + DeepSeek (lens set) + **Code Reviewer** (`code-reviewer-grounded`) + **Observability** (`observability-reviewer`) + **Integration** — **plus Regression Guardian** (the diff modifies and deletes existing code, so it always fires) **plus Reality-Check** on the re-run `neighbourhood_id` link rate and Q3.

**Cross-read Adversary** after every fold, paired with a grounder that RE-EXECUTES every claim in the fold.

---

## Asks — operator rulings this plan cannot make for itself (Spec 124 §4.2: the discovering pass may not adjudicate)

| # | Ask | Options, measured | **Default if unruled** |
|---|---|---|---|
| **1** | **Which runner?** Neither existing LINK runner fits, and the mismatch is **STRUCTURAL, not cosmetic** *(restated at the Integration plan-seat fold — the draft framed option (A) as a counter-vocabulary rename, which understates it)*. Cite by greppable anchor, not line number (Spec 124 §5 R-R's own lesson); line numbers below are measured in this worktree at HEAD `11040938` and drifted ~33 lines from the coordinator's citation. | **(A) Widen `runLinkKeyedPhase`** (`async function runLinkKeyedPhase`, `index.js:898`). **Three structural blockers, each measured:** ① it destructures **two** write plans unconditionally — `const upsertPlan = plans[0]` / `const deletePlan = plans[1]` (`:976-977`) — and I4 declares **one**, so `deletePlan` is `undefined` and `deleteBeforeImagePlan` dereferences `deletePlan.table` before the loop; ② it hard-codes `link_parcels`' row shaping — `const permitKeys = batch.rows.map(...)` (`:1001`) normalises `street_num`/`street_name`/`street_type`, columns I4 neither reads nor declares in `inputs.reads`; ③ it calls `compute.classifyPrimary` / `classifySpatialContainment` / `classifySpatialFallback` by name (`:1038-1043` and siblings) across a fixed **four**-strategy cascade, plus the `address_points_exact` / `exact_legacy` / `name_only` / `spatial_polygon` / `street_type_mismatch` counter block. Making it serve I4 is a rewrite of the runner's body, not a parameterisation — and every line of it is load-bearing for a **converted** step (`link_parcels`) ⇒ mandatory golden recapture + full Regression Guardian on someone else's step. **(B) FORK** `runLinkColumnPhase` + `shape: "link_column"`. Costs an `x-frozen` enum widening (`x-ruling{rungs_tried, why}` node required by the G-1 schema-baseline ratchet), re-freeze **#6**, a Spec 122 §8 amendment and the `template-freeze.infra.test.ts` pin flip — all in commit ②. `runLinkPhase` (`:715`) is not a candidate either way: it pages an integer `lastId` over a surrogate `id` column `permits` does not have. | **(B) FORK.** LG-21 is **RATIFIED fork-over-share** at the freeze (`e029c37d`, `template-freeze.json.lg21_decision`; Spec 124 `:329`), chosen four times already (pilots 4, 5, 6, 7) for exactly this reason each time. With (A) restated structurally the case is stronger, not weaker: it makes a converted step's golden captures collateral for an unconverted step's convenience — the inversion the freeze exists to prevent. |
| **2** | **Retire LN-D1 (`-1` sentinel) and LN-D2 (JS/Turf branch)?** Neither is pinnable: the sentinel throws two different ways, and the branch is selected by the exact `hasPostGIS` shape `compute-no-postgis-branch` bans. | Retire both · pin neither · pin LN-D2 only (impossible — the shape gate refuses) | **RETIRE BOTH**, as the fifth application of the R-W precedent. The `4699730f` fence is independently defended by `b1102cdb`'s keyset cursor; the lost second purpose is declared as `no_neighbourhood_match` WARN + `retighten_when`. |
| **3** | **LN-D6 — the retired parcel-centroid coordinate substitute.** Decided by **Q4**. | If Q4 = 0: retire as dead code. If Q4 > 0: it is a capability retirement — (i) retire and declare the limitation, or (ii) widen W1 to `COALESCE(point, ST_Centroid(pa.geom))` | **Retire + declare** (option i) either way. §3.1: a widening is a FIX, and a fix belongs in its own peel after the conversion is green, not inside the commit whose whole claim is that nothing changed. |
| **4** | **LN-D3 — `== 158` → a floor from `sources_neighbourhoods_floor`.** This is the **only** intentional differential diff (the emitted `threshold` string changes). | Accept the explained diff · or pin `== 158` verbatim and flip it in a later peel | **Accept the explained diff**, ledgered LN-D3. Pinning an equality that R-H already forbids means shipping a known permanent-WARN, then flipping it anyway. |
| **5** | **Reuse `sources_neighbourhoods_floor` across steps?** It is registered and seeded but its registry line reads *"CONSUMED by assert_data_bounds"*. Precedent for un-prefixed shared variables exists (`spatial_match_max_distance_m`, `spatial_match_confidence` in `link_parcels`). | Reuse + amend the "CONSUMED by" line · or mint `link_neighbourhoods_expected_neighbourhood_count` | **REUSE.** Two registry rows for one municipal boundary count is a second source of truth for the same fact — Rule 1, "one home per concern". |
| **6** | ~~**Can a drafting worktree author a descriptor at all?**~~ **PREMISE REFUTED at the Integration plan-seat fold — re-filed.** The draft claimed the schema makes a descriptor unauthorable without DB access. It does not: `step.schema.json:1426-1440` makes the literal `"none"` legal for **both** `invariants` and `plausibility`, and says so in the field's own description — *"\"none\" is legal and is every converted step's state until its own migration commit populates it"*. A worktree can always author a complete, schema-valid descriptor. **The real constraint is narrower and is an obligation, not a blocker: declaring a ROW commits you to measuring it** (`last_measured.sample_n >= 1`, `at` a string, `cost_ms` a number — there is no "pending" state for a declared row). ⚠ **Second correction, measured — the fold's own accompanying claim that "no converted descriptor uses `none` today" is also wrong:** `assert_global_coverage`, `assert_data_bounds` and `assert_schema` all declare `invariants: "none"` AND `plausibility: "none"`; `link_parcel_addresses`, `link_wsib` and `refresh_snapshot` declare `plausibility: "none"`. Both halves recorded rather than silently applied (Spec 124 §4.2). | **(i)** Declare all 4 rows now and treat Q1–Q4 as a **commit-① obligation** (the rows are the whole point — Q3 is the Reality-Check number and Q4 decides Ask 3). **(ii)** Declare `"none"` in the worktree and add the rows at commit ①. | **(i) Declare the rows; the measurement is a commit-① obligation.** `"none"` here would be a *false* declaration for a LINK that stamps a derived column — the ASSERT precedent is `outputs: "none"`, a step that writes nothing, which is not this step. Record in `.cursor/batch2_c5_active_task.md` §0.4(d) that R-AC drafting produces a descriptor complete **except** for declared-row `last_measured`, which the committing orchestrator fills — a handoff, not a blocker. |

---

## Operating Boundaries

**Target files:** `scripts/link-neighbourhoods.js` · `scripts/link-neighbourhoods.descriptor.json` · `scripts/link-neighbourhoods.notes.json` · `scripts/lib/compute/link-neighbourhoods.js` · `src/tests/steps/link_neighbourhoods/**` · `scripts/steps/_schema/converted.json` · `docs/reports/2026-09-1x-i4-link-neighbourhoods-assessment.md` · `docs/reports/defect-ledger.md` · the 3 new logic-variable seed/GROUPS/registry rows · (Ask-1-dependent) `scripts/lib/step/index.js` + `scripts/steps/_schema/step.schema.json` + `template-freeze.json`.

**Out-of-scope:** `scripts/load-neighbourhoods.js` (the `neighbourhoods` INGESTOR — batch 2 Phase 3) · `scripts/geocode-permits.js` (I5, the next step) · every `permits` consumer in `src/` (read-only; the FK and the retirement of `-1` change nothing they can observe, since `stats/route.ts:88` and `permits/[id]/route.ts:170` already filter `> 0`) · migrations (none).

**Cross-spec:** 60 (governs, `identity.spec`) · 41 · 43 · 57 (the loader's contract) · 122 / 122a / 123 / 124 (architecture + procedure + policy) · 47 §A.5 (lock 92) · 48 §3.6 (verdict cascade) · 08 §6.4 / §11 (panels + grounded verification).

---

> **PLAN LOCKED. Do you authorize this WF2-C (Backend/Pipeline) conversion plan? (y/n)**
> §11 note: `database.min_migration` is pinned to **109**, not 12 — migration 109's FK is the mechanism that enforces LN-D1's retirement, so the step must refuse to run on a database that predates it.
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.

---

## Ask 1 — RE-RULED 2026-09-16 (orchestrator, grounded at `2ba8e705`)

Commit ① removed Ask 1's stated premise (the composite keyset cursor: the batch shape is retired, the surviving write is one `UPDATE … FROM … ST_Contains`). The implementer stopped at ②a and asked whether `shape: "backfill"` could now be shared instead of forking. **Measured against `scripts/lib/step/index.js` (anchor `async function runBackfillPhase`) and `write.js`:** the backfill runner hard-codes `compute_centroids`' matched vocabulary (`parcels_processed` / `centroids_computed` / `failed_geometries` / `new_rows`), early-returns `zeroWork` on `backlogCount === 0`, dispatches through `executeBackfillUpdate` (LG-20, class E) not `executeSetBasedJoinUpdate` (LG-11, class N), and its `force_full` arm demands a second write target. Sharing it is the same converted-step-collateral inversion LG-21 forbids. **Ruling: (B) FORK stands.** Template change only: `runLinkColumnPhase` follows the backfill phase ORDER (requirements → overrides → privileges → prior emit → eligible count → pre-write gate → ONE statement via `executeSetBasedJoinUpdate` → post checks → emit) with no zero-work early return; `x-ruling.rungs_tried` records (a) widen `link_keyed` refuted, (b) share `backfill` refuted, (c) fork. Deviations 5 and 6 confirmed as §3.1 PIN-don't-fix. ②a (PRE captures as their own commit, forced by #22 GOLD-PRE-FRESH) is accepted as a standing amendment to the compressed form — file in Spec 123 §7.2 at ③.
