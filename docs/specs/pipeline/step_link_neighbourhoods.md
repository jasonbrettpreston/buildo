# Step: Link Neighbourhoods

<requirements>
## 1. Goal & User Story
As a market analyst, I need every permit assigned to its Toronto neighbourhood — so the dashboard can render neighbourhood-level metrics, income profiles, and geographic filters.
</requirements>

---

<architecture>
## 2. Implementation

| Property | Value |
|----------|-------|
| **Script** | `scripts/link-neighbourhoods.js` |
| **Reads** | `permits` (latitude, longitude), `neighbourhoods` (geometry) |
| **Writes** | `permits` (neighbourhood_id) |
| **Chain** | `chain_permits` (step 10), `chain_sources` (step 10) |
| **Method** | Turf.js `booleanPointInPolygon` for 158 neighbourhood boundaries |
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Core Logic
1. Load all 158 neighbourhood boundaries as Turf.js polygon/multipolygon features
2. For each permit with coordinates: test against each neighbourhood polygon
3. Update `permits.neighbourhood_id` with matching neighbourhood
4. Unmatched permits get `neighbourhood_id = -1` (sentinel value)

### Edge Cases
- Permit exactly on boundary → first polygon match wins
- No coordinates → skipped (not geocoded yet)
- Sentinel `-1` for unmatched → downstream queries must handle this
- N+1 query pattern: individual UPDATE per permit (known performance issue)
</behavior>

---

<constraints>
## 4. Operating Boundaries
- **Target Files:** `scripts/link-neighbourhoods.js`
- **Consumed by:** `chain_permits.md` (step 10), `chain_sources.md` (step 10)
- **Testing:** `neighbourhood.logic.test.ts`
</constraints>
