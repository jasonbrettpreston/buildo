# Step: Compute Centroids

<requirements>
## 1. Goal & User Story
As a spatial fallback, this step calculates centroid coordinates for parcels missing them — so downstream spatial linking (massing, permits) always has a coordinate to work with even when full polygon analysis isn't possible.
</requirements>

---

<architecture>
## 2. Implementation

| Property | Value |
|----------|-------|
| **Script** | `scripts/compute-centroids.js` |
| **Reads** | `parcels` (geometry) |
| **Writes** | `parcels` (centroid_lat, centroid_lng) |
| **Chain** | `chain_sources` (step 5) |
| **Method** | Geometric centroid calculation from polygon coordinates |
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Core Logic
1. Query parcels where `centroid_lat IS NULL` or `centroid_lng IS NULL`
2. For each: calculate geometric centroid from polygon coordinates
3. Update `parcels.centroid_lat`, `parcels.centroid_lng`

### Edge Cases
- Complex multipolygon → centroid may fall outside polygon (valid for approximate matching)
- Individual UPDATE per parcel (known N+1 performance issue)
</behavior>

---

<constraints>
## 4. Operating Boundaries
- **Target Files:** `scripts/compute-centroids.js`
- **Consumed by:** `chain_sources.md` (step 5)
</constraints>
