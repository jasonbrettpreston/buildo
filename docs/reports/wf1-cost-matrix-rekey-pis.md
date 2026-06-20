# WF1 — `scope_intensity_matrix` Production-Vocab Re-key — PI Outputs

**Date:** 2026-05-24
**Plan version:** v3 (authorized 2026-05-24)
**Phase:** Pre-Implementation Investigation (read-only)
**Investigation script:** `scripts/analysis/wf1-cost-matrix-rekey-pis.js`

---

## HALT GATE 1 Status: **PASS** (with notes for PI-3, PI-4 to follow)

All hard gates passed. No need to re-submit plan. Proceeding to PI-3 mapping doc + PI-4 CKAN stability scan, then to G14 threshold derivation lock.

| PI | Status | Outcome |
|---|---|---|
| PI-0 | PASS | No `scripts/seeds/scope_intensity_matrix.json` and no `scripts/seed.js` → migration path correct |
| PI-1 | PASS | Top-60 combos = 83.17% nominal coverage; PI-3 filters trade-specific safe-skips |
| PI-2 | PASS | `trade_sqft_rates` vocabulary fully compatible with `trades.slug` (no re-key needed) |
| PI-3 | TODO | Build mapping doc (depends on PI-1 — next step) |
| PI-4 | TODO | CKAN vocabulary stability scan (next step) |
| PI-5 | PASS | CoA structurally independent of matrix (zero structure_type fields populated) |
| PI-6 | PASS | All columns DEFAULT collation = `C` (case-sensitive) |
| PI-7 | NOTE | 4716 leading/trailing whitespace rows in `permits` → defensive `.trim()` justified |
| PI-8 | PASS | PRIMARY KEY confirmed on `(permit_type, structure_type)` |
| PI-9 | PASS | No other vocabulary-lookup risks against DB-seeded data |
| PI-10 | TODO | Dry-run audit preview (post-implementation-draft) |

---

## PI-0 — Seed Infrastructure Existence

**Glob results:**
```
scripts/seeds/apply-logic-variables.js
scripts/seeds/universal_stream_catalog.json
scripts/seeds/universal_stream_trade_signals.json
scripts/seeds/logic_variables.json
```

No `scope_intensity_matrix.json` and no `scripts/seed.js`. Reviewer Independent Q5 finding confirmed.

**Decision:** Migration approach (G3 fold). New migration file: `migrations/NNN_scope_intensity_matrix_production_vocab.sql`.

---

## PI-1 — Top-N Construction Permit Coverage

**Query:** Top combinations of `(permit_type, structure_type)` for permits classified as `class='construction'`, with cumulative coverage.

**Top 60 inclusion (per G23 off-by-one corrected rule: `individual_pct ≥ 0.5 OR (cumulative_pct - individual_pct) < 90`, capped at 60):**

| rank | n | indiv% | cum% | permit_type | structure_type |
|---|---|---|---|---|---|
| 1 | 33,356 | 14.05 | 14.05 | Small Residential Projects | SFD - Detached |
| 2 | 18,406 | 7.75 | 21.80 | Plumbing(PS) | SFD - Detached |
| 3 | 13,473 | 5.67 | 27.47 | Mechanical(MS) | SFD - Detached |
| 4 | 9,503 | 4.00 | 31.47 | Small Residential Projects | SFD - Semi-Detached |
| 5 | 8,574 | 3.61 | 35.08 | New Houses | SFD - Detached |
| 6 | 8,411 | 3.54 | 38.63 | Drain and Site Service | SFD - Detached |
| 7 | 7,265 | 3.06 | 41.69 | Building Additions/Alterations | Office |
| 8 | 6,175 | 2.60 | 44.29 | Building Additions/Alterations | Apartment Building |
| 9 | 4,972 | 2.09 | 46.38 | Mechanical(MS) | Office |
| 10 | 4,222 | 1.78 | 48.16 | Plumbing(PS) | Apartment Building |
| ... | ... | ... | ... | ... | ... |
| 60 | 779 | 0.33 | 83.16 | Drain and Site Service | Apartment Building |

**Predicted post-fix coverage:** **83.17%** (nominal — pre-PI-3 safe-skip filtering).

**⚠️ PI-3 critical input:** Many of the top-60 rows are trade-specific permit_types (`Plumbing(PS)`, `Mechanical(MS)`, `Drain and Site Service`, `Demolition Folder (DM)`) which per Spec 83 §3.A(d) **MUST NOT** get matrix rows — they intentionally safe-skip. Counting only non-trade-specific permit_types in top-60 (rough eyeball: ~38% absolute). PI-3 produces the authoritative filtered count.

**Trade-specific permit_types observed in top-60:**
- `Plumbing(PS)` — 14 rows, ~16% combined
- `Mechanical(MS)` — 16 rows, ~16% combined
- `Drain and Site Service` — 6 rows, ~5% combined
- `Demolition Folder (DM)` — 1 row, 0.83%

**Realistic predicted coverage after PI-3 safe-skip filter: ~45-55%** (subject to PI-3 confirmation).

Full output in `tmp_pi_output.txt`.

---

## PI-2 — Per-Trade Rate Vocabulary

**Schema correction:** `permit_trades` table has `trade_id` (FK to `trades.id`), NOT `trade_slug`. The vocabulary chain is `permit_trades.trade_id → trades.slug → trade_sqft_rates.trade_slug`.

**Trades count:** 38 total
**trade_sqft_rates count:** 32 rows
**trade_sqft_rates entries NOT in trades table:** 0 ← vocabulary fully compatible
**Trades missing from trade_sqft_rates:** 6
  - `realtor` (74,928 permit_trade rows) ← **NOT a vocabulary mismatch; just a missing rate.** Separate WF3 follow-up if cost compute needs it.
  - `outdoor-patio`, `paving`, `back-yard-fences`, `windows`, `decks` (all 0 permit_trade rows) → irrelevant for current compute

**Verdict:** **PASS — no scope expansion needed.** Vocabulary is compatible; this WF1 stays a single-table re-key. The `realtor` gap is a separate concern (missing rate row, not vocabulary mismatch).

---

## PI-3 — Allocation Mapping (TODO)

To produce `docs/reports/wf1-cost-matrix-rekey-allocation-mapping.md` from PI-1 output.

**Inputs available:**
- Existing 18-row matrix (PI-1 reference output above)
- Top-60 PI-1 ranked list

**Plan:**
1. Filter top-60 to remove trade-specific permit_types (Plumbing, Mechanical, Drain, Demolition Folder)
2. Map each remaining row to existing 18-row matrix where 1:1 semantic equivalent exists
3. Flag ambiguous rows for user decision
4. Output structured mapping table

**Next step in this WF1.**

---

## PI-4 — CKAN Vocabulary Stability (TODO)

Pending: scan recent CKAN snapshots / `permit_history` for new `permit_type` / `structure_type` values over the last 12 weeks.

---

## PI-5 — CoA Empirical Impact

**`coa_applications` schema:** has `structure_type` column. NO `permit_type` column.

**`coa_applications` populated counts:**
```json
{ "total": "33119", "with_st": "0" }
```

**All 33,119 CoA applications have NULL `structure_type`.** Combined with absence of `permit_type` column, the CoA path passes empty strings to the Brain's `computeEffectiveArea`, which builds key `'::'` and always matrix-misses → safe-skips to geometric path.

**CoA `cost_estimates.cost_source` distribution (pre-migration snapshot):**
```
geometric: 25288 rows (100%)
```

**Verdict:** **PASS — CoA is structurally independent of `scope_intensity_matrix`.** F1 v2-fold premise confirmed. CoA regression test asserts post-migration cost_source distribution stays 100% `geometric` ± 2%.

---

## PI-6 — Column Collation

**Per-column collation (`permits` + `scope_intensity_matrix`):**
```
permits.permit_type            | character varying | DEFAULT
permits.structure_type         | character varying | DEFAULT
scope_intensity_matrix.permit_type    | character varying | DEFAULT
scope_intensity_matrix.structure_type | character varying | DEFAULT
```

**DB-level collation:**
```
datcollate: C
datctype:   C
```

**Verdict:** **PASS** — all columns use DEFAULT collation which is `C` (case-sensitive byte ordering). No `_ci` or `citext`. Exact-match strategy is sound at both source and target.

---

## PI-7 — Whitespace Audit

```json
{ "leading_trailing": 4716, "collapsed_spaces": 6, "non_ascii_space": 0 }
```

- **4,716** rows with leading/trailing whitespace on `permit_type` or `structure_type` (~1.9% of 248K permits)
- **6** rows with collapsed internal whitespace (negligible)
- **0** rows with non-breaking/zero-width spaces

**Verdict:** **Defensive `.trim()` is justified** per G24 conditional. Code-changes section keeps `.trim()` in the Brain/Muscle. Collapsed-space and non-ASCII cases are negligible (no normalization policy needed beyond `.trim()`).

---

## PI-8 — Primary Key

```
[p] scope_intensity_matrix_pkey -> PRIMARY KEY (permit_type, structure_type)
```

**Verdict:** **PASS** — PRIMARY KEY confirmed per migration 096 line 44. `ON CONFLICT (permit_type, structure_type)` in migration targets this existing PK. **NO new UNIQUE constraint needed** (G1 fold confirmed).

---

## PI-9 — Sibling Normalization Audit

**Grep:** `\.toLowerCase\(\)\.replace|\.toLowerCase\(\)\.trim|trim\(\)\.toLowerCase|toLocaleLowerCase|\.toUpperCase\(\)\.trim` over `scripts/` and `src/`.

**Binary decision rule applied (per Observability HIGH):** A match is a vocabulary-lookup risk iff BOTH (a) normalized string used as object/Map/SQL key, AND (b) keys come from DB seed/migration.

**Matches analyzed:**

| File:line | Pattern | Use | Risk? |
|---|---|---|---|
| `scripts/classify-inspection-status.js:119` | `.toLowerCase().replace` | Audit row metric name formatting | NO |
| `scripts/classify-scope.js:34` | `.trim().toLowerCase()` | Description text for `.includes()` | NO (substring) |
| `scripts/classify-permits.js:316-317` | `.toLowerCase().trim()` | Tier-3 regex pattern matching | NO (rule application, not key lookup) |
| `scripts/extract-builders.js:35` | `.toUpperCase().trim()` | Builder name fuzzy match | NO (fuzzy) |
| `scripts/generate-script.mjs:31` | `.trim().toLowerCase()` | Interactive CLI y/n | NO |
| `scripts/lib/coa-trade-classifier.js:85` | `.toLowerCase().replace` | Tag → in-code constant `TAG_TRADE_MATRIX` lookup | NO (matrix is hardcoded JS object, not DB-seeded) |
| `scripts/lib/lifecycle-phase.js:301` | `.trim().toLowerCase().replace` | Date string normalization for parsing | NO |
| `scripts/load-wsib.js:36` | `.toUpperCase().trim()` | WSIB name fuzzy match | NO |
| `src/features/leads/lib/cost-model-shared.js:242-243` | `.toLowerCase().trim()` | **Matrix-lookup key against DB-seeded `scope_intensity_matrix`** | **YES — THE BUG WE'RE FIXING** |
| `src/lib/builders/normalize.ts:30` | `.toUpperCase().trim()` | Builder name fuzzy match | NO |
| `src/lib/auth/verify-admin.ts:139` | `.trim().toLowerCase()` | Admin email comparison | NO (auth) |
| `src/features/leads/lib/timing.ts:225,229` | `.trim().toLowerCase()` | Status string equality | NO (constant comparison) |
| `src/lib/inspections/parser.ts:62` | `.trim().toLowerCase()` | Parser input cleaning | NO |
| `src/lib/classification/classifier.ts:36-37` | `.toLowerCase().trim()` | Tier-3 pattern matching (same as classify-permits) | NO |
| `src/lib/classification/coa-trade-classifier.ts:82` | `.toLowerCase().replace` | Tag → hardcoded matrix | NO |
| `src/lib/classification/lifecycle-phase.ts:341` | `.trim().toLowerCase().replace` | Date parsing | NO |
| `src/lib/classification/phases.ts:87` | `.toLowerCase().trim()` | Status comparison | NO |
| `src/lib/classification/scope.ts:192` | `.trim().toLowerCase()` | Substring search | NO |
| `src/lib/classification/scoring.ts:11,76` | `.toLowerCase().trim()` | Switch-case comparison | NO |
| `src/lib/leads/lead-inspect-query.ts:257` | `.toUpperCase().trim()` | Builder fuzzy match | NO |
| `src/tests/cost-estimates.infra.test.ts:188` | (test asserting current bug) | Test of old behavior — UPDATE post-fix | NO (test) |
| `src/tests/builders.logic.test.ts:10`, `src/tests/wsib.logic.test.ts:22` | (test mirrors) | Test fixtures | NO (test) |

**Verdict:** **PASS — only one site is a vocabulary-lookup risk against DB-seeded data, and that's the bug we're fixing.** No follow-up WFs needed.

**Test cleanup note:** `src/tests/cost-estimates.infra.test.ts:188` asserts the old `.toLowerCase().trim()` behavior — this test MUST be updated in the implementation phase.

---

## Notes for HALT GATE 1 Decision

- **All hard gates PASS** — no plan re-submission needed.
- PI-3 mapping doc is the next blocking item.
- PI-4 CKAN stability is a lower-priority sanity check.
- One nice-to-have follow-up surfaced: PI-2 found `realtor` is the 6th most common permit-trade with no `trade_sqft_rates` row. **Separate WF3** if cost-model coverage needs it.
- One test update surfaced: `src/tests/cost-estimates.infra.test.ts:188` asserts current bug behavior; update during implementation.
