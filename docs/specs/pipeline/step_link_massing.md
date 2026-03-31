# Step: Link Massing

<requirements>
## 1. Goal & User Story
As a user evaluating construction scale, I need permits linked to 3D building footprint volumes — so the system understands the existing structures at a site and can calculate construction dimensions.
</requirements>

---

<architecture>
## 2. Implementation

| Property | Value |
|----------|-------|
| **Script** | `scripts/link-massing.js` |
| **Reads** | `parcels` (centroid_lat/lng), `building_footprints` (centroid_lat/lng, height) |
| **Writes** | `parcel_buildings` (parcel_id, source_id, distance_m) |
| **Chain** | `chain_permits` (step 11), `chain_sources` (step 8, with `--full`) |
| **Method** | Nearest-neighbour spatial match within bbox |
| **Parameter safeguard** | Flushes at 30,000 params (§9.2) |
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Core Logic
1. Process parcels in batches of 500 (keyset pagination)
2. For each parcel: find building footprints within spatial bbox
3. Associate via `parcel_buildings` junction table
4. Flush INSERT when approaching 30K parameter limit

### Edge Cases
- Dense urban areas with many footprints per parcel → parameter flush prevents PG limit breach
- No footprints near parcel → no link created
- `--full` in sources chain → full re-link against fresh massing data
</behavior>

---

<constraints>
## 4. Operating Boundaries
- **Target Files:** `scripts/link-massing.js`
- **Consumed by:** `chain_permits.md` (step 11), `chain_sources.md` (step 8)
- **Testing:** `massing.logic.test.ts`
</constraints>
