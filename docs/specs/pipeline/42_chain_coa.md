# Chain: Committee of Adjustment (CoA)

<requirements>
## 1. Goal & User Story
As a lead generator, I want Committee of Adjustment variance hearings imported, linked to permits, and analyzed for pre-construction leads — so I can uncover project opportunities months before building permits are issued.
</requirements>

---

<architecture>
## 2. Chain Definition

**Trigger:** `node scripts/run-chain.js coa` or `POST /api/admin/pipelines/chain_coa`
**Schedule:** Daily
**Steps:** 9 (sequential, stop-on-failure)
**Gate:** `coa` — if `records_new = 0`, downstream enrichment steps are skipped

```
assert_schema → coa → assert_coa_freshness → link_coa →
create_pre_permits → assert_pre_permit_aging → refresh_snapshot →
assert_data_bounds → assert_engine_health
```

### Step Breakdown

| # | Slug | Script | Purpose | Writes To |
|---|------|--------|---------|-----------|
| 1 | `assert_schema` | `quality/assert-schema.js` | Validate CKAN metadata for CoA resources | pipeline_runs |
| 2 | `coa` | `load-coa.js` | Ingest CoA applications from CKAN (active + closed resources) | coa_applications |
| 3 | `assert_coa_freshness` | `quality/assert-coa-freshness.js` | Verify last CoA record is within 45-day threshold | — |
| 4 | `link_coa` | `link-coa.js` | Address matching via `street_name_normalized` columns + confidence matrix (ward as booster) | coa_applications |
| 5 | `create_pre_permits` | `create-pre-permits.js` | Generate pre-permit leads from approved unlinked CoA applications | — |
| 6 | `assert_pre_permit_aging` | `quality/assert-pre-permit-aging.js` | Warn on expired pre-permits (approved+unlinked >18 months) | — |
| 7 | `refresh_snapshot` | `refresh-snapshot.js` | Update dashboard metrics snapshot | data_quality_snapshots |
| 8 | `assert_data_bounds` | `quality/assert-data-bounds.js` | CoA-scoped: row counts, null rates, linkage integrity | pipeline_runs |
| 9 | `assert_engine_health` | `quality/assert-engine-health.js` | CoA table engine health | engine_health_snapshots |
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Inputs
- CKAN API: `ckan0.cf.opendata.inter.prod-toronto.ca`
  - Active resource: `51fd09cd...` (open applications)
  - Closed resource: `9c97254e...` (closed since 2017)
- Incremental mode (default): last 90 days via CKAN SQL endpoint
- Full mode (`--full`): all records from both resources

### Core Logic
1. **Schema validation** — checks CKAN metadata for expected CoA columns
2. **CoA ingestion** — fetches applications, maps CKAN fields:
   - `REFERENCE_FILE#` → `application_number`
   - `C_OF_A_DESCISION` → `decision` (typo is in CKAN source)
   - `WARD_NUMBER` (closed) / `WARD` (active) → `ward`
   - Address composed from: `STREET_NUM + STREET_NAME + STREET_TYPE + STREET_DIRECTION`
3. **Freshness check** — if last CoA record is >45 days old, WARN (source may be stale)
4. **Address linking** — uses pre-computed `street_name_normalized` columns (populated at ingestion by `scripts/lib/address.js`). Ward is a confidence **booster**, not a gatekeeper (80% of permits lack ward data):
   - Pre-pass: unlinks cross-ward mismatches from prior runs
   - Tier 1a: `street_num + street_name_normalized` + ward match → 0.95
   - Tier 1b: `street_num + street_name_normalized` + permit ward NULL → 0.85
   - Tier 1c: `street_num + street_name_normalized` + ward conflict → 0.10 (flagged)
   - Tier 2a: `street_name_normalized` only + ward match → 0.60
   - Tier 2b: `street_name_normalized` only + permit ward NULL → 0.50
   - Tier 3: Description full-text search → 0.10-0.50 (ward as tiebreaker)
   - Audit: `effective_match_rate_pct` measures `high_confidence_linked / (high_confidence_linked + potential_matches)` where `high_confidence_linked` = Tiers 1a/1b/2a/2b only (0.50-0.95 confidence range), and `potential_matches` = unlinked CoAs with a real (non-Pre-Permit) permit at their exact address. Tier 1c (ward conflict, 0.10) and Tier 3 (description FTS, 0.10-0.50) are EXCLUDED from the numerator for consistency — both contain low-confidence matches. Tier 3 successes are tracked separately as INFO. Thresholds: `< 50%` = FAIL, `< 80%` = WARN, else PASS. When `potential_matches = 0` the verdict is PASS (steady state — nothing to link). The legacy `match_rate_pct` is preserved as INFO only.
5. **Pre-permit generation** — approved CoA applications without linked permits become speculative leads
6. **Aging check** — approved+unlinked applications older than 18 months flagged as expired (WARN)
7. **Quality assertions** — CoA-scoped data bounds and engine health

### Outputs
- `coa_applications` table: 32,625+ records with `linked_permit_num`, `linked_confidence`
- Pre-permit pool: ~408 upcoming leads (approved, unlinked, within 18 months)
- Dashboard snapshot updated

### Edge Cases
- CKAN `WARD_NUMBER` vs `WARD` column mismatch between active/closed resources → handled by field mapper
- CoA `C_OF_A_DESCISION` typo in source → mapped as-is, not corrected
- "ST CLAIR" false stripping: `normalizeStreetName('ST CLAIR AVE')` → `'CLAIR'` (strips "ST" as street type). Both CoA and permit sides produce same result, so matching works despite semantic loss
- 0 new CoA records → gate-skip enrichment steps, quality steps still run
- Freshness >45 days → WARN but does not halt chain
</behavior>

---

<testing>
## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `coa.logic.test.ts` (linker tiers, confidence thresholds, address normalization)
- **Logic:** `chain.logic.test.ts` (coa chain definition, step count)
- **Infra:** `quality.infra.test.ts` (assert-coa-freshness exists, assert-pre-permit-aging exists)
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 5. Operating Boundaries

### Target Files
- `scripts/manifest.json` (coa chain array)
- `scripts/lib/address.js` (shared street name normalizer)
- `scripts/load-coa.js`, `scripts/link-coa.js`, `scripts/create-pre-permits.js`
- `migrations/061_street_name_normalized.sql`
- `scripts/quality/assert-coa-freshness.js`, `scripts/quality/assert-pre-permit-aging.js`

### Out-of-Scope Files
- `src/lib/coa/linker.ts` — TypeScript API path (governed by CoA linking step spec)
- `src/app/coa/page.tsx` — UI rendering

### Cross-Spec Dependencies
- **Relies on:** `pipeline_system.md` (SDK, orchestrator)
- **Relies on:** `chain_permits.md` (permits must be loaded first for linking)
- **Shared steps:** `link_coa`, `create_pre_permits`, `refresh_snapshot` also appear in `chain_permits.md`
</constraints>
