# Step: Refresh Data Quality Snapshot

<requirements>
## 1. Goal & User Story
As an admin viewing the data quality dashboard, I need the snapshot metrics refreshed after every pipeline run — so the dashboard shows current coverage rates, freshness indicators, and system health scores.
</requirements>

---

<architecture>
## 2. Implementation

| Property | Value |
|----------|-------|
| **Script** | `scripts/refresh-snapshot.js` |
| **Reads** | `permits`, `entities`, `parcels`, `neighbourhoods`, `coa_applications`, `building_footprints`, `permit_inspections` (9 parallel counting queries) |
| **Writes** | `data_quality_snapshots` (one row per day, upserted by snapshot_date) |
| **Chain** | All chains (permits, coa, sources, deep_scrapes, entities) — always runs |
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Core Logic
1. Run 9+ parallel counting queries against live DB
2. Compute coverage rates: trades, builders, parcels, neighbourhoods, geocoding, CoA linking
3. Compute Data Effectiveness Score (0-100) as weighted average
4. Compute null tracking fields (description, builder_name, est_const_cost)
5. Upsert to `data_quality_snapshots` via `ON CONFLICT (snapshot_date) DO UPDATE`
6. Include inspection coverage metrics (total, scraped, outstanding, passed)

### Weights for Effectiveness Score
| Metric | Weight |
|--------|--------|
| Trade classification | 25% |
| Builder enrichment | 20% |
| Parcel linking | 15% |
| Neighbourhood linking | 15% |
| Geocoding | 15% |
| CoA linking | 10% |

### Edge Cases
- `active_permits = 0` → division by zero guarded, returns '0.0%'
- `coa_total = 0` → guarded similarly
- Massing query fails → caught, defaults to 0 (logged via `pipeline.log.warn`)
</behavior>

---

<constraints>
## 4. Operating Boundaries
- **Target Files:** `scripts/refresh-snapshot.js`, `src/lib/quality/metrics.ts`
- **Consumed by:** All chain specs (final infrastructure step)
- **Testing:** `quality.logic.test.ts`, `quality.infra.test.ts`
</constraints>
