# Active Task: Compute-purity seam S5 — catalog / SRID probe (CP-S5)
**Status:** Planning

**Domain Mode:** Backend/Pipeline (`scripts/lib/step/`, `scripts/lib/compute/`, descriptors, `step.schema.json`).
**Workflow:** WF2 (alters existing compute and the runner library).
**68/69:** N/A (no by-law content).

## Context
* **Goal:** Close programme item CP-S5. It replaces the 8 compute-authored catalog reads that gate E still allows by ledger row (`closing_brief "CP-S5"`) with two runner-owned seams. Afterwards compute holds no `information_schema`, `pg_*` or `Find_SRID` text and no SRID throw. Then CP-S5 goes BUILT. Rows: 8 now, 0 after.
* **Target Spec:** Spec 124 R-BZ (codes G3, G8; C3 expiry), Rule 2, Rule 10; Spec 122a §A26 (code table G3/G8); Spec 124 R-CH (vocab-coverage read snapshot), R-CA(i) (an ASSERT may read through the pool, read-only, declared); Spec 122 §5 (seams), §8 (recapture).
* **Key Files:** `scripts/lib/step/index.js` (`REQUIREMENT_PROBES`, `assertRequirements`, hook ctx), new `scripts/lib/step/catalog.js`, `scripts/steps/_schema/step.schema.json` (`definitions.requirement`), `scripts/lib/compute/{enrich-heritage,enrich-ravines,assert-global-coverage,refresh-snapshot}.js`, `scripts/lib/vocab-coverage.js`, `scripts/lib/vocab-coverage-pool.js`, the 4 sibling descriptors, `scripts/steps/_schema/standard-gates-ledger.json`, `scripts/steps/_schema/programme-items.json`.
* **Execution Provider:** claude. Spec 08 §B downgrade, logged: operator directive 2026-10-14 ("get all engines moving… use these tokens"). The library and schema edits are registry-adjacent (RE-FREEZE), so they stay with Claude.

### Live findings this closes (measured 2026-10-14, `node scripts/analysis/gates/compute-purity.mjs --list`, tip 2d7b0d84)
| # | Code | Site | Relation | Ledger item |
|---|---|---|---|---|
| 1 | G3 | `scripts/lib/compute/assert-global-coverage.js:219` | `information_schema.columns` (coa_applications column count → `coa_step1_columns_present`) | `compute-catalog@d7d483e99dc2415e#1` |
| 2 | G3 | `scripts/lib/compute/assert-global-coverage.js:596` | `information_schema.columns` (permits column count → `p_step1_columns_present`) | `compute-catalog@d7d483e99dc2415e#2` |
| 3 | G3 | `scripts/lib/compute/enrich-heritage.js:56` | `find_srid` (parcels.geom) | `compute-catalog@9b97ae14cd1eaa94#1` |
| 4 | G8 | `scripts/lib/compute/enrich-heritage.js:58` | SRID ≠ 4326 throw inside `readHeritageContract` (contract_read) | `compute-halt@js:throw new Error(\`${TAG} parcels.geom SRID is …\`)#1` |
| 5 | G3 | `scripts/lib/compute/enrich-ravines.js:72` | `find_srid` (parcels.geom) | `compute-catalog@9b97ae14cd1eaa94#1` |
| 6 | G8 | `scripts/lib/compute/enrich-ravines.js:74` | SRID ≠ 4326 throw inside the contract_read hook | `compute-halt@js:…SRID…#1` |
| 7 | G3 | `scripts/lib/compute/refresh-snapshot.js:253` | `information_schema.columns` (6-table column counts → `schema_column_counts`) | `compute-catalog@5117505b38a46b65#1` |
| 8 | G3 | `scripts/lib/vocab-coverage.js:60` | `information_schema.columns` (`data_type` of the data and vocab columns) | `compute-catalog@dc2155bbf3d02d8f#1` |

Count: G3 6, G8 2, total 8. This equals the item's 2026-10-11 evidence ("G3 6, G8 2"), so no row has gone stale (measured).

## Technical Implementation
* **Seam S5-a: SRID requirement (closes rows 3–6).**
  * `definitions.requirement.kind` gains `srid`, plus an `equals` integer that is required when kind = srid. `name` is `<table>.<column>` (same pattern as `trigger`).
  * `REQUIREMENT_PROBES.srid = { sql: "SELECT 1 WHERE Find_SRID('public', $1, $2) = $3", args: (r) => [...r.name.split('.'), r.equals] }`.
  * `assertRequirements` already refuses before any hook on `on_missing: "fail"`. This replaces the compute throw with the runner's existing declared precondition (Rule 10: a declared guard, not a compute halt).
  * `measured` is keyed by `r.name`, so key it by `${r.kind}:${r.name}` for srid only. Otherwise `parcels.geom` (srid) collides with a possible `column:parcels.geom`. Measured today: neither heritage nor ravines declares `column:parcels.geom`, but enrich_parcels does. Verify the `measured` consumers before choosing the key.
  * Descriptors: enrich-heritage and enrich-ravines add `{kind:"srid", name:"parcels.geom", equals:4326, on_missing:"fail", why}`. Compute deletes the `Find_SRID` read and the throw.
* **Seam S5-b: catalog reader (closes rows 1, 2, 7, 8).**
  * New `scripts/lib/step/catalog.js` provides `makeCatalog({pool, declaredTables})`, which returns `{ columnCount(table), columnCounts(tables[]), columnType(table, column) }`.
  * Runner-owned SQL over `information_schema.columns`, `table_schema = 'public'`, read-only.
  * A table outside the step's declared read set (`inputs.reads.tables` ∪ `checks[].reads` ∪ `outputs.writes`, the same set G2 uses) is REFUSED (throws as a defect, before SQL).
  * Exposed as `ctx.catalog` on the compute ctx and the hook ctx.
  * AGC: `csSchema = { cols: await ctx.catalog.columnCount('coa_applications') }`, and the same for permits. The `parseCountRow` shape is kept, so `assert-global-coverage-fields.js` (`pop: 'csSchema.cols'`, `'pSchema.cols'`) is unchanged.
  * refresh-snapshot: the `optional[]` entry `schemaColumnCounts` becomes a call to `ctx.catalog.columnCounts([...6 tables])` inside the same optional-read try. A failure must still set `results.schemaColumnCounts = null`, so the `prevRow.schema_column_counts` fallback (`refresh-snapshot.js:383-388`) and `optional_query_failed` stay as they are. Whether `optional[]` is executed by compute or by the runner decides where this call lives; read `refresh-snapshot.js:172-339` first.
  * vocab-coverage: `resolveAndCountTripleWithClient(client, t, opts)` takes `opts.columnType(table, col)` and loses `typeOf`'s SQL. AGC passes `ctx.catalog.columnType`. The legacy wrapper `scripts/lib/vocab-coverage-pool.js` sits outside the compute closure and passes its own pool-backed reader. Amends R-CH's "never-throwing client core": a missing `opts.columnType` returns `{unresolved:'no column-type reader'}` and never throws.
* **Database Impact:** NO (no migration; catalog reads only).
* **Every change says what it replaces:** S5-a replaces 2 compute `Find_SRID` reads and 2 compute throws with 2 declared requirements. S5-b replaces 4 compute `information_schema` texts with 1 library reader.

## Standards Compliance
* **Try-Catch Boundary:** no API route. `catalog.js` throws only on an undeclared table, which is a defect. SQL errors propagate to the caller's existing boundary: the AGC branch, refresh-snapshot's optional-read catch, and vocab-coverage's own catch that returns `unresolved`.
* **Unhappy Path Tests:** SRID mismatch → refusal before any hook; SRID function error; undeclared catalog table refused; catalog read error → refresh-snapshot falls back to prevRow; vocab-coverage with no reader → `unresolved`.
* **logError Mandate:** N/A (pipeline library; it uses `log.warn` and the existing `assertRequirements` message).
* **UI Layout:** N/A.

## Proposed Spec 124 rows (texts only; the orchestrator reserves ids)
1. **A catalog fact a compute depends on is a runner-owned probe (S5).** (i) SRID: `guards.requires {kind:"srid", name:"<table>.<column>", equals:<int>, on_missing:"fail"}` is probed by `REQUIREMENT_PROBES.srid` (`Find_SRID`) before any hook. Compute holds no `Find_SRID` and no SRID throw. (ii) Column facts come from `ctx.catalog` (`scripts/lib/step/catalog.js`: `columnCount`, `columnCounts`, `columnType`). It is read-only, `public` schema only, and refuses a table outside the step's declared read set. Compute holds no `information_schema` or `pg_*` text. RE-FREEZE. | R-BZ G3/G8; Rule 10 | 122a §A26.
2. **Amends R-CH:** the vocab-coverage client core takes its column-type reader as an argument. ASSERT steps pass `ctx.catalog.columnType`; the legacy pool wrapper passes its own, outside the compute closure. A core called without a reader answers `unresolved`, never throws.

## Locks (both directions; red-first where the behaviour is new)
* **L1 srid probe (logic, stub pool):** `Find_SRID = 4326` → present (GREEN). `3857` → refused before the hook, and the hook stub is never called (RED today: no `srid` kind; `probeRequirement` refuses an unknown kind).
* **L2 schema:** `{kind:"srid"}` without `equals` is invalid. `{kind:"srid", equals:4326, name:"parcels.geom"}` is valid. `name` without a dot is invalid.
* **L3 catalog refusal:** `columnCount('not_declared')` throws before any query (the stub records 0 calls). A declared table issues exactly one parameterised query.
* **L4 gate E:** `compute-purity.mjs --list` shows 0 G3 and 0 G8 for the 5 files, and the 8 ledger rows are deleted (0 orphans). Reverse direction: re-adding a `Find_SRID` literal to a compute fixture is G3 FAIL. The existing `BAD_FIXTURE` self-test must still cover `find_srid`; assert it.
* **L5 C3 expiry:** with CP-S5 BUILT and one CP-S5 row left, `programmeExpiry` returns `item_built` (RED). With 0 rows it is green.
* **L6 output equality (H-lane, test:db / capture):** AGC `coa_step1_columns_present` and `p_step1_columns_present`, refresh-snapshot `schema_column_counts`, and the vocab-coverage `present`/`vocab_size` values equal their pre-change captures on the dev DB. The capture diff is fingerprints only.
* **L7 refresh-snapshot failure path:** a catalog reader that throws → `schema_column_counts` = prevRow's and `optional_query_failed` names `schemaColumnCounts` (the same as today's SQL-failure path).

## Capture impact (Spec 122 §8)
* `scripts/lib/step/**` changes → `lib_fingerprint` changes → every converted step's post captures go stale (gate G #39). This rides the next FLEET recapture, not a per-step one.
* The `source_fingerprint` of assert_global_coverage, enrich_heritage, enrich_ravines and refresh_snapshot changes (compute and descriptor).
* `step.schema.json` changes the requirement enum, so RE-FREEZE #34 (template-freeze `--refresh`).

## Execution Plan
- [ ] Step 1: Read `refresh-snapshot.js:172-339` (who executes `optional[]`) and every consumer of `assertRequirements`' `measured` map. Fix the S5-b call site and the S5-a key.
- [ ] Step 2: Write red locks L1, L2, L3, L5, L7 (logic) and the L4 fixture assertion.
- [ ] Step 3: Schema `srid` kind + `REQUIREMENT_PROBES.srid` + `catalog.js` + `ctx.catalog` wiring.
- [ ] Step 4: Compute rewrites (heritage, ravines, AGC ×2, refresh-snapshot, vocab-coverage + its pool wrapper) and the 2 descriptor `requires` rows.
- [ ] Step 5: Delete the 8 CP-S5 ledger rows. Set CP-S5 BUILT. Run `npm run programme-backlog`.
- [ ] Step 6: Targeted vitest (1 fork), gate E scratch measure (0 unallowed / 0 orphans), `node scripts/analysis/gates/compute-purity.mjs --self-test`.
- [ ] Step 7: H-lane owed: template-freeze `--refresh`, fleet recapture, `step-validate --all --write`, test:db (L6), full suite.
- [ ] Step 8: Panel (pipeline WF2): Gemini + DeepSeek lens set + Code Reviewer + Observability + Integration + Regression Guardian (the diff deletes compute throws).
