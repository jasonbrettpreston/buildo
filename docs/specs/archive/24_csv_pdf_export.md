# Spec 24 -- Data Export

---

<requirements>

## 1. Goal & User Story
As a user, I want to export my filtered permit results or saved leads as CSV or PDF for offline use or sharing with my team. Exports respect active filters (WYSIWYG), use streaming for large datasets, and are gated to Pro/Enterprise plans.

</requirements>

---

<security>

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated | Read/Export (own data) |
| Admin | Read/Export (all) |

</security>

---

<behavior>

## 3. Behavioral Contract
- **Inputs:** Export trigger from search toolbar or saved permits page; format selection (CSV or PDF); current filter state; optional map-inclusion toggle (PDF only)
- **Core Logic:**
  - CSV: streams rows from PostgreSQL cursor (500-row batches) with UTF-8 BOM for Excel compatibility, RFC 4180 quoting, CRLF line endings. See `src/lib/export/csv.ts`.
  - PDF: fetches first 500 matching permits, computes summary stats, optionally generates static map snapshot, renders server-side. See `src/lib/export/pdf.ts`.
  - File naming: `buildo-{type}-{date}-{filter_summary}.{ext}` -- includes up to 3 filter values; uses "all" if none; appends "-filtered" if >3 filters
  - Rate limiting: 10 exports per hour per user via Redis ZSET; returns 429 with Retry-After header when exceeded
  - Concurrent exports: one active export per user; second request returns 409 Conflict
  - Export query reuses the same filter logic as search/filter (Spec 19) for result parity
- **Outputs:** Streamed CSV file (Content-Type: text/csv) or generated PDF file (Content-Type: application/pdf) with Content-Disposition attachment header and descriptive filename
- **Edge Cases:**
  - Zero matching permits: CSV returns header-only file; PDF shows summary with 0 results (no error)
  - PDF capped at 500 rows with footnote indicating total count and suggesting CSV for full export
  - Mapbox Static API failure: PDF generated without map section, with unavailability note
  - Fields containing commas, quotes, or newlines are properly escaped per RFC 4180
  - Network interruption during streaming CSV: client should detect incomplete download and offer retry

</behavior>

---

<testing>

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic** (`export.logic.test.ts`): CSV_COLUMNS; formatCsvRow; generatePermitsPdf
<!-- TEST_INJECT_END -->

</testing>

---

<constraints>

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/lib/export/csv.ts`
- `src/lib/export/pdf.ts`
- `src/tests/export.logic.test.ts`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/`**: Governed by Spec 08. Do not modify classification engine.
- **`src/app/api/permits/`**: Governed by Spec 06. API is consumed, not modified.
- **`src/lib/auth/`**: Governed by Spec 13. Do not modify auth logic.

### Cross-Spec Dependencies
- Relies on **Spec 01 (Database Schema)**: Queries permit data for export.
- Relies on **Spec 06 (Data API)**: Consumes API endpoints for filtered data.
- Relies on **Spec 13 (Auth)**: Export gated to Pro/Enterprise plans.
- Relies on **Spec 19 (Search & Filter)**: Exports respect active filter criteria.

</constraints>
