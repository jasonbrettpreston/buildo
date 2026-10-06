# Source: Ontario WSIB Contractor Registry

<requirements>
## 1. Goal & User Story
As a business analyst, I need the Ontario Workplace Safety and Insurance Board registry imported as a trusted source — so the system can verify which builders are legally insured and flag high-value leads with WSIB-matched contractors.
</requirements>

---

<architecture>
## 2. Data Source

| Property | Value |
|----------|-------|
| **Source** | Ontario WSIB CSV (Class G — Construction only) |
| **Format** | CSV |
| **Schedule** | Annual MANUAL download (wsib.ca, no stable URL). The operator drops `BusinessClassificationDetails(YYYY).csv` into `data/` of the running tree. The step's ONE input is the descriptor's filesystem external `data/BusinessClassificationDetails*.csv` (newest by name, 0fs); with no file present (the cloud — there is no `data/` dir) every run is the COMPLETED skip terminal `skipped_no_source_file`. Operator procedure: runbook §WSIB annual refresh |
| **Script** | `scripts/load-wsib.js` (frozen `pipeline.step()` shell) + `scripts/load-wsib.descriptor.json` + `scripts/lib/compute/load-wsib.js` |
| **Filter** | Class G (Construction) only, deduplicated by normalized name + address |

### Target Table: `wsib_registry`
| Column | Type | Notes |
|--------|------|-------|
| `legal_name` | TEXT | Raw legal name from the CSV; written on INSERT only — a conflict never rewrites it |
| `legal_name_normalized` | TEXT | PK part 1 — uppercased, spaces collapsed, suffixes stripped (two passes) |
| `mailing_address` | TEXT | PK part 2 |
| `trade_name` | TEXT | Operating/trade name |
| `trade_name_normalized` | TEXT | Normalized trade name (same `coerceKey` normalization) |
| `predominant_class` | TEXT | WSIB class (loader keeps Class G only) |
| `naics_code` / `naics_description` | TEXT | NAICS classification |
| `subclass` / `subclass_description` | TEXT | G1 residential · G3 foundation/exterior · G4 building equipment · G5 specialty trades · G6 non-res, etc. |
| `business_size` | TEXT | e.g. Small/Medium/Large |
| `is_gta` | BOOLEAN | Computed per-row at load; gates the Serper enrichment queue (Spec 46) |
| `last_seen_at` | TIMESTAMPTZ | The run's DB clock; written on INSERT and on a conflict only when a guarded column changed (never compared) |
| `first_seen_at` | TIMESTAMPTZ | DB default; never written by the step |

> NOTE (2026-07-29): earlier versions listed `status`/`class_code` columns — they do not exist; the table above matches `load-wsib.js`'s real loaded columns. The CSV carries **no contact fields**; `primary_phone`/`primary_email`/`website` on `wsib_registry` are populated only by Serper enrichment (Spec 46).
>
> NOTE (WS-D1, carried): `naics_description` holds the SUBCLASS text (csv-parse keeps only the LAST of the two `Description` headers) and `subclass_description` is NULL on every row. `scripts/enrich-wsib.js` whitelists those subclass strings, so the fix must move both in one commit — decision D3.

**Composite PK:** `(legal_name_normalized, mailing_address)`
**Upsert:** class-A guarded upsert `ON CONFLICT (legal_name_normalized, mailing_address) DO UPDATE … WHERE` over 9 columns `IS DISTINCT FROM` (`trade_name`, `trade_name_normalized`, `predominant_class`, `naics_code`, `naics_description`, `subclass`, `subclass_description`, `business_size`, `is_gta` — `guard_columns`); one step-scoped transaction; `retract: none` (no DELETE/TRUNCATE); `last_seen_at` is written on a changed row but never compared; columns owned by other steps are never written (`linked_entity_id`, `match_confidence`, `matched_at`, the contact columns, `first_seen_at`).

`[as-built 2026-09-30, row 3.5 ③]` CUTOVER: `scripts/load-wsib.js` is registered in `scripts/steps/_schema/converted.json` (24th converted step, INGESTOR 7/9, class A `guarded_upsert`) and its `pending[]` entry is deleted in the same commit; the census row is RETAINED with `status: converted` (Spec 124 R-K, R-AO). The ONE input is the filesystem external `data/BusinessClassificationDetails*.csv` (0fs). The PRE goldens were captured with the legacy `--file <csv>` argument, which the converted step no longer takes; they stand in for the declared invocation under Spec 124 R-BD (same chain, exactly one retired `--file` pair named by WS-D4, every PRE table hash equal to its POST). Cloud prerequisites: seed `load_wsib_unique_class_g_warn_min` and `load_wsib_no_name_skip_warn_pct` (`scripts/seeds/apply-logic-variables.js`) before the first cloud sources run (a missing row throws). The cloud has no `data/`, so every cloud run takes `skipped_no_source_file` until an operator load (runbook §5); that load also carries the `is_gta` repair (decision D4).
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Inputs
- The descriptor's ONE filesystem external `data/BusinessClassificationDetails*.csv` (newest by name, resolved by `resolveLocalSource`, 0fs); absent → the `skipped_no_source_file` skip terminal

### Core Logic
1. **Header check** — a missing required header fails the run before any write with the legacy `Schema drift: missing column "<col>"` message: `Legal name` is caught by `compute.coerceKey` while the library parses the key (it runs before shaping); `Predominant class` / `Mailing Address` by `compute.shapeRecord` on the first record.
2. **Class G filter** — a row is kept when EITHER its predominant class OR its subclass starts with `G`; otherwise it is skipped with reason `non_g`.
3. **Key** — `coerceKey` normalization (upper-case, collapse spaces, two-pass suffix strip); a null key is counted `bad_key`.
4. **Dedupe** — keeps the G-predominant row per key; the first row wins unless a later one is G-predominant and it is not.
5. **Guarded upsert** — the class-A guarded upsert into `wsib_registry` (see §2).
6. **Checks** — `wsib_unique_class_g` (floor `load_wsib_unique_class_g_warn_min`, seed 110000), `wsib_no_name_skip_rate` (`load_wsib_no_name_skip_warn_pct`, seed 1; **FAIL** since ③ — the bound `on_row_error:"skip"` cites, Spec 124 R-AX, WS-D10), `wsib_null_address_count` (WS-D6), `wsib_load_skipped` (`when: pre`), `wsib_source_file` (INFO, post — records WHICH `data/` file loaded; the legacy `source_file` row), `records_unchanged` (INFO, post — the guarded upsert's measured no-op count `written.unchanged`) and `duplicate_key_count` (INFO, post — rows the G-preference dedupe superseded). The two row-conservation rows report null when nothing was measured.

### Outputs
- `wsib_registry` table refreshed with current WSIB registrants
- `records_meta.wsib_load` block (7 keys: `duration_ms`, `total_csv_rows`, `unique_class_g`, `records_inserted`, `records_updated`, `skipped_non_g`, `skipped_no_name`) + `audit_table` (phase 11)

### Edge Cases
- Truncated file → loads fewer keys and WARNs on `wsib_unique_class_g`; it never removes rows (the step only inserts/updates — no DELETE/TRUNCATE)
- Duplicate entries with different trade names → the first row per key wins, unless a later one is G-predominant and it is not
- Non-Class-G entries → filtered out before insert (reason `non_g`)
- Absent file → `skipped_no_source_file` (COMPLETED, nothing parsed or written)
- A NULL mailing address never conflicts in `UNIQUE(legal_name_normalized, mailing_address)`, so such a row would duplicate on each reload (WS-D6)
</behavior>

---

<testing>
## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `wsib.logic.test.ts` (name normalization, class filtering, dedup)
- **Infra:** `wsib.infra.test.ts` (WSIB table schema, upsert behavior)
<!-- TEST_INJECT_END -->
- **Red suite (batch-2 row 3.5 ①, Spec 123 §7):** `src/tests/steps/load_wsib/violations.test.ts` — 13 legacy oracle pins (plain `it`, over the frozen copy `src/tests/steps/load_wsib/fixtures/legacy-load-wsib.js.txt` via `fixtures/legacy-harness.ts` and the 10-row `fixtures/wsib-sample.csv`) + 15 converted claims — flipped GREEN at ② (29/29) + the ① report marker test.
</testing>

---

<constraints>
## 5. Operating Boundaries

### Target Files
<!-- generated:target-files -->
<!-- do not hand-edit: npm run target-files regenerates this block from the census owner_specs, the capture-step-golden derivation, the cross-step ledger and consumer-registry.json -->
- `load_wsib` — INGESTOR · converted · owner specs: 52
  - `scripts/load-wsib.js`
  - `scripts/load-wsib.descriptor.json`
  - `scripts/load-wsib.notes.json`
  - `scripts/lib/compute/load-wsib.js`
  - `src/tests/steps/load_wsib/violations.test.ts`
  - data (descriptor): `wsib_registry` writes (migrations/040_wsib_registry.sql)
  - upstream: none
  - downstream: assert_data_bounds · link_wsib
  - consumers: src/app/api/admin/stats/route.ts (table wsib_registry: 1 column) · src/app/api/entities/[id]/route.ts (table wsib_registry: 5 columns) · src/components/FreshnessTimeline.tsx (records_meta audit_table) · src/features/leads/lib/get-lead-feed.ts (table wsib_registry: 5 columns) · src/lib/builders/enrichment.ts (table wsib_registry: 3 columns)
<!-- /generated:target-files -->

### Out-of-Scope Files
- `scripts/link-wsib.js` — governed by its own step spec, not this source's contract (see the note above under "Out-of-Scope").

### Cross-Spec Dependencies
- **Consumed by:** `43_chain_sources.md` (step 19), `60_shared_steps.md` (`link_wsib`), `46_wsib_enrichment.md` (`enrich_wsib_registry`, `scripts/enrich-wsib.js` — reads `wsib_registry.naics_description` per WS-D1)
- **Relies on:** `pipeline_system.md` (SDK), `122_pipeline_step_optimization.md` (0fs, §5.1)
</constraints>
