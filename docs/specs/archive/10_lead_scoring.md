# Spec 10 -- Lead Scoring

<requirements>

## 1. Goal & User Story
Every permit-trade combination receives a lead score from 0 to 100 so the best opportunities appear first in trade-specific feeds.

</requirements>

---

<security>

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | None |
| Admin | Full (backend logic, stored in permit_trades) |

</security>

---

<behavior>

## 3. Behavioral Contract
- **Inputs:** Permit record (status, est_cost, issued_date, last_updated), trade slug, classification confidence, computed construction phase
- **Core Logic:** Score formula: `CLAMP(0, 100, base + cost_boost + freshness_boost + phase_match + confidence_boost - staleness_penalty - revocation_penalty)`. **Base score (0-50):** by status -- Issued=50, Under Inspection=40, Application=30, Not Issued=20, Completed=15, Closed=10, unknown/other=25. **Cost boost (0-15):** null/0=0, >=$50K=3, >=$100K=5, >=$500K=8, >=$1M=10, >=$5M=12, >=$10M=15. **Freshness boost (0-20):** by days since issued_date -- <=30d=20, <=90d=15, <=180d=10, <=365d=5, >365d=0, null=0. **Phase match (0-15):** trade active in permit's phase=15, else=0. **Confidence boost (0-10):** `round(confidence * 10)`. **Staleness penalty (0-20):** by days since issued_date -- <=730d (2yr)=0, <=1095d (3yr)=10, >1095d=20; null issued_date=10. **Revocation penalty (0-30):** Revoked/Cancelled=30, Suspended=20, else=0. Max theoretical raw=110 (clamped to 100), min=-50 (clamped to 0). Scores stored as integers in `permit_trades.lead_score`. Recalculated on permit ingest/update, rule changes, and daily freshness batch. See `calculateLeadScore()` in `src/lib/classification/scoring.ts`.
- **Outputs:** Integer lead_score (0-100) per permit-trade row in `permit_trades` table
- **Edge Cases:**
  - Null est_cost gets 0 cost_boost (not penalized)
  - Null issued_date gets 0 freshness_boost; staleness uses last_updated instead
  - Unknown status defaults to base_score 25
  - Revoked/Cancelled permits get double suppression (low base AND revocation_penalty=30)
  - Suspended permits get revocation_penalty=20
  - Bulk recalculation must handle 50K+ permit-trade combinations efficiently

</behavior>

---

<testing>

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`scoring.logic.test.ts`): Lead Scoring
<!-- TEST_INJECT_END -->

</testing>

---

<constraints>

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/lib/classification/scoring.ts`
- `src/tests/scoring.logic.test.ts`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/classifier.ts`**: Governed by Spec 08. Do not modify classification engine.
- **`src/lib/classification/phases.ts`**: Governed by Spec 09. Do not modify phase model.
- **`src/lib/classification/trades.ts`**: Governed by Spec 07. Do not modify trade taxonomy.

### Cross-Spec Dependencies
- Relies on **Spec 07 (Trade Taxonomy)**: Uses trade data for score calculation.
- Relies on **Spec 08 (Classification)**: Uses classification confidence as a scoring input.
- Relies on **Spec 09 (Phases)**: Uses phase match as a scoring factor.
- Consumed by **Spec 15 (Dashboard)**: Dashboard sorts permits by lead score.

</constraints>
