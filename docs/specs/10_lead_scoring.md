# Spec 10 -- Lead Scoring

## 1. Goal & User Story
Every permit-trade combination receives a lead score from 0 to 100 so the best opportunities appear first in trade-specific feeds.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | None |
| Admin | Full (backend logic, stored in permit_trades) |

## 3. Behavioral Contract
- **Inputs:** Permit record (status, est_cost, issued_date, last_updated), trade slug, classification confidence, computed construction phase
- **Core Logic:** Score formula: `CLAMP(0, 100, base + cost_boost + freshness_boost + phase_match + confidence_boost - staleness_penalty - revocation_penalty)`. **Base score (0-50):** by status -- Issued=50, Under Review=35, Application=20, Not Issued=10, Completed=5, Cancelled/Revoked=0, unknown=10. **Cost boost (0-15):** null/0=0, <$50K=3, <$250K=7, <$1M=11, >=$1M=15. **Freshness boost (0-20):** by days since issued_date -- <=30d=20, <=90d=15, <=180d=10, <=365d=5, >365d=0, null=0. **Phase match (0-15):** trade active in permit's phase=15, adjacent phase=5, else=0. **Confidence boost (0-10):** `round(confidence * 10)`. **Staleness penalty (0-20):** by days since last_updated -- <=90d=0, <=180d=5, <=365d=10, <=730d=15, >730d=20. **Revocation penalty (0-30):** Revoked=30, Cancelled=20, else=0. Max theoretical raw=110 (clamped to 100), min=-50 (clamped to 0). Scores stored as integers in `permit_trades.lead_score`. Recalculated on permit ingest/update, rule changes, and daily freshness batch. See `calculateLeadScore()` in `src/lib/classification/scoring.ts`.
- **Outputs:** Integer lead_score (0-100) per permit-trade row in `permit_trades` table
- **Edge Cases:**
  - Null est_cost gets 0 cost_boost (not penalized)
  - Null issued_date gets 0 freshness_boost; staleness uses last_updated instead
  - Unknown status defaults to base_score 10
  - Revoked permits get double suppression (base=0 AND revocation_penalty=30)
  - Cancelled penalized less than Revoked (20 vs 30) since project may restart
  - Bulk recalculation must handle 50K+ permit-trade combinations efficiently

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`scoring.logic.test.ts`): Lead Scoring
<!-- TEST_INJECT_END -->

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
