# Spec 06 -- Permit Data API

## 1. Goal & User Story
Provide REST API endpoints to query permits with filtering, pagination, full-text search, and trade-based filtering so that the UI can display permit lists, detail views, trade directories, and sync history.

## 2. Auth Matrix
| Role | Access |
|------|--------|
| Anonymous | Read |
| Authenticated | Read |
| Admin | Read |

## 3. Behavioral Contract
- **Inputs:** HTTP requests to five endpoints: `GET /api/permits` (list), `GET /api/permits/[id]` (detail), `GET /api/trades` (trade list), `GET /api/sync` (sync history), `POST /api/sync` (trigger sync).
- **Core Logic:** **List endpoint** accepts query params for filtering (`status`, `permit_type`, `ward`, `trade_slug`, `min_cost`, `max_cost`), full-text search (`search` -- uses PostgreSQL `to_tsvector`/`plainto_tsquery` across description, street_name, builder_name), pagination (`page` clamped to min 1, `limit` capped at 100), and sorting (`sort_by` validated against a whitelist of 6 allowed columns with fallback to `issued_date`, `sort_order` defaults to DESC, `NULLS LAST`). All filter values use parameterized queries for SQL injection prevention. A separate `COUNT(*)` query calculates total for pagination metadata. **Detail endpoint** parses the composite ID format `permitNum--revisionNum` (400 if malformed), returns the permit record, trade matches sorted by `lead_score DESC` with trade metadata, last 50 history records, builder info via `entity_projects` junction (null if no match), parcel data with lot dimensions (null if unlinked), neighbourhood profile (null if unlinked), building massing with coverage calculation (null if unlinked), linked permits sharing the same base number, CoA applications linked to the permit, and inspection stages scraped from the AIC portal (empty array if none). CoA-prefixed IDs (`COA-...`) route to `coa_applications` table instead. Returns 404 if permit not found. **Trades endpoint** returns the static `TRADES` array from `src/lib/classification/trades.ts` (no DB query). **Sync endpoints** per Spec 04. See `PermitFilter` in `src/lib/permits/types.ts`.
- **Outputs:** List returns `{ data: Permit[], pagination: { page, limit, total, total_pages } }`. Detail returns `{ permit, trades, history, builder, parcel, neighbourhood, linkedPermits, massing, coaApplications, inspections }`. Trades returns `{ trades: Trade[] }`. Sync history returns `{ runs: SyncRun[] }`. All errors return `{ error: string }` with appropriate HTTP status codes.
- **Edge Cases:** Sort column not in whitelist silently falls back to `issued_date`; sort order anything other than `"asc"` defaults to DESC; permit numbers with spaces must be URL-encoded; builder matching may fail if normalization conventions differ; history capped at 50 records; `COUNT(*)` may be slow with complex filters; GIN index only covers `description` (composite FTS index would improve search performance).

## 4. Testing Mandate
<!-- TEST_INJECT_START -->
- **Infra** (`api.infra.test.ts`): API Permit Filter Validation; Permit ID Parsing; Parameterized Query Builder; Geo Bounding Box Validation; Permit Detail Parcel Query; Permit Detail Neighbourhood Query; Street View URL Validation; Database Schema Constraints; API Route Exports; Middleware Route Protection; Pre-Permit API Integration; API Error Handling Hardening; Centralized Error Logging; Performance Index Coverage
<!-- TEST_INJECT_END -->

## 5. Operating Boundaries

### Target Files (Modify / Create)
- `src/app/api/permits/route.ts`
- `src/app/api/permits/[id]/route.ts`
- `src/app/api/permits/geo/route.ts`
- `src/app/api/trades/route.ts`
- `src/app/api/sync/route.ts`
- `src/tests/api.infra.test.ts`

### Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/`**: Governed by Spec 08. Do not modify classification engine.
- **`src/lib/sync/ingest.ts`**: Governed by Spec 02. Do not modify stream parser.
- **`migrations/`**: Governed by Spec 01. Raise a query if schema must change.

### Cross-Spec Dependencies
- Relies on **Spec 01 (Database Schema)**: Queries all table schemas.
- Relies on **Spec 07 (Trade Taxonomy)**: Returns trade data from `trades` table.
- Consumed by **Specs 15-20**: All dashboard and UI pages consume these API endpoints (read-only).
