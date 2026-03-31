# Step: Geocode Permits

<requirements>
## 1. Goal & User Story
As a map view user, I need every permit assigned lat/lng coordinates — so projects render as pins on the map regardless of how poorly the city entered the address.
</requirements>

---

<architecture>
## 2. Implementation

| Property | Value |
|----------|-------|
| **Script** | `scripts/geocode-permits.js` |
| **Reads** | `permits` (street_num, street_name, city), `address_points` |
| **Writes** | `permits` (latitude, longitude) |
| **Chain** | `chain_permits` (step 8), `chain_sources` (step 3) |
| **Modes** | Incremental (default: only NULL coords) / Full (`--full`: all permits) |
</architecture>

---

<behavior>
## 3. Behavioral Contract

### Core Logic
1. Query permits where `latitude IS NULL`
2. For each: match against `address_points` table by street number + name
3. If no match: fall back to Google Maps Geocoding API
4. Update `permits.latitude`, `permits.longitude`

### Edge Cases
- Google API quota exhausted → permits left with NULL coords, skipped by downstream spatial linking
- Ambiguous address ("123 MAIN") → first address point match wins
- No address_points loaded yet → all geocoding falls to Google API (expensive)
</behavior>

---

<constraints>
## 4. Operating Boundaries
- **Target Files:** `scripts/geocode-permits.js`, `src/lib/permits/geocode.ts`
- **Consumed by:** `chain_permits.md` (step 8), `chain_sources.md` (step 3)
- **Testing:** `geocoding.logic.test.ts`
</constraints>
