# Step: Link Parcels

<requirements>
## 1. Goal & User Story
As an analyst evaluating lot density, I need each permit spatially linked to its property lot polygon — so the system knows the exact land parcel where construction occurs and can calculate lot sizes.
</requirements>

---

<architecture>
## 2. Implementation

| Property | Value |
|----------|-------|
| **Script** | `scripts/link-parcels.js` |
| **Reads** | `permits` (latitude, longitude), `parcels` (centroid_lat, centroid_lng, geometry) |
| **Writes** | `permit_parcels` (permit_num, revision_num, parcel_id, match_type) |
| **Chain** | `chain_permits` (step 9), `chain_sources` (step 6, with `--full`) |
| **Method** | Nearest-neighbour bbox search + polygon containment upgrade |
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Core Logic
1. For each geocoded permit: find nearest parcels within 0.001° bounding box (`BBOX_OFFSET`)
2. Check polygon containment (`booleanPointInPolygon`) for precision upgrade
3. Record match type: `spatial_polygon` (inside polygon) or `spatial_centroid` (nearest centroid only)
4. Batch upsert to `permit_parcels`

### Edge Cases
- Permit outside all parcel polygons → centroid-only match (lower confidence)
- No parcels within bbox → no link created
- `--full` mode in sources chain → re-links all permits against fresh parcel data
</behavior>

---

<constraints>
## 4. Operating Boundaries
- **Target Files:** `scripts/link-parcels.js`
- **Consumed by:** `chain_permits.md` (step 9), `chain_sources.md` (step 6)
- **Testing:** `parcels.logic.test.ts`
</constraints>
