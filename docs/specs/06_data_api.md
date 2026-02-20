# Spec 06 -- Permit Data API

## 1. User Story

> As a frontend developer, I need REST API endpoints to query permits with
> filtering, pagination, full-text search, and trade-based filtering so that the
> UI can display permit lists, detail views, trade directories, and sync history.

## 2. Technical Logic

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/permits` | List permits with filtering, search, pagination, and sorting |
| `GET` | `/api/permits/[id]` | Get single permit with trades, history, and builder info |
| `GET` | `/api/trades` | List all 20 trade categories |
| `GET` | `/api/sync` | List recent sync run history (20 most recent) |
| `POST` | `/api/sync` | Trigger a new sync run |

---

### `GET /api/permits` -- List Permits

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | string | -- | Filter by permit status (exact match) |
| `permit_type` | string | -- | Filter by permit type (exact match) |
| `ward` | string | -- | Filter by ward (exact match) |
| `trade_slug` | string | -- | Filter by trade slug (joins `permit_trades` + `trades`) |
| `min_cost` | number | -- | Minimum `est_const_cost` |
| `max_cost` | number | -- | Maximum `est_const_cost` |
| `search` | string | -- | Full-text search across `description`, `street_name`, `builder_name` |
| `page` | number | 1 | Page number (1-indexed) |
| `limit` | number | 20 | Results per page (max 100, enforced via `Math.min()`) |
| `sort_by` | string | `issued_date` | Sort column (whitelist-validated) |
| `sort_order` | `asc` / `desc` | `desc` | Sort direction |

**Sort Column Whitelist** (SQL injection prevention):

```typescript
const ALLOWED_SORT = [
  'issued_date',
  'application_date',
  'est_const_cost',
  'status',
  'ward',
  'permit_num',
];
```

Any `sort_by` value not in this list falls back to `issued_date`.

**Full-Text Search Implementation:**

```sql
to_tsvector('english',
  coalesce(p.description,'') || ' ' ||
  coalesce(p.street_name,'') || ' ' ||
  coalesce(p.builder_name,'')
) @@ plainto_tsquery('english', $N)
```

- Uses PostgreSQL's built-in full-text search with the `english` dictionary.
- Searches across three fields: `description`, `street_name`, `builder_name`.
- `plainto_tsquery` handles plain text input (no special query syntax required
  from the user).
- The GIN index `idx_permits_description_fts` (on `description` only) partially
  accelerates this; a composite FTS index covering all three fields would be
  more optimal.

**Trade Filtering:**

When `trade_slug` is provided, the query adds:

```sql
INNER JOIN permit_trades pt
  ON pt.permit_num = p.permit_num AND pt.revision_num = p.revision_num
INNER JOIN trades t
  ON t.id = pt.trade_id
WHERE t.slug = $N
```

**Pagination:**

- `page` is clamped to minimum 1 via `Math.max(1, ...)`.
- `offset = (page - 1) * limit`.
- A separate `COUNT(*)` query runs with the same filters to calculate `total`.
- `total_pages = Math.ceil(total / limit)`.

**Query Construction:**

- Uses parameterized queries with `$1`, `$2`, etc. -- no string interpolation
  of user input.
- Conditions are built dynamically and joined with `AND`.
- Sort column is validated against the whitelist before interpolation into the
  SQL string.
- `NULLS LAST` ensures null values in the sort column appear at the end.

**Response Shape:**

```json
{
  "data": [Permit, ...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 237000,
    "total_pages": 11850
  }
}
```

---

### `GET /api/permits/[id]` -- Permit Detail

**ID Format**: `permitNum--revisionNum` (double-dash separator).

Example: `GET /api/permits/24%20101234--01`

**Validation:**
- Splits on `--`; returns 400 if the result does not have exactly 2 parts.
- Error message: `"Invalid permit ID format. Use: permitNum--revisionNum"`.

**Response includes 4 data sections:**

1. **`permit`**: Full permit record from `permits` table.
2. **`trades`**: Trade matches from `permit_trades` joined with `trades`,
   ordered by `lead_score DESC`. Includes `slug`, `name`, `icon`, `color`.
3. **`history`**: Last 50 change history records from `permit_history`, ordered
   by `changed_at DESC`.
4. **`builder`**: Builder record from `builders` table, matched via
   `name_normalized = UPPER(REGEXP_REPLACE(TRIM(builder_name), '\\s+', ' ', 'g'))`.
   Returns `null` if no matching builder found.

**Response Shape:**

```json
{
  "permit": Permit,
  "trades": [TradeMatch with slug, name, icon, color],
  "history": [PermitHistory],
  "builder": Builder | null
}
```

**Error Responses:**
- 400 for invalid ID format.
- 404 if no permit found with the given composite key.
- 500 for database errors.

---

### `GET /api/trades` -- Trade List

Returns the static `TRADES` array from `src/lib/classification/trades.ts`.

**Response:**

```json
{
  "trades": [
    { "id": 1, "slug": "excavation", "name": "Excavation", "icon": "Shovel", "color": "#795548", "sort_order": 1 },
    ...
  ]
}
```

No database query -- served from the in-memory constant.

---

### `GET /api/sync` -- Sync History

```sql
SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 20
```

**Response:**

```json
{
  "runs": [SyncRun, ...]
}
```

---

### `POST /api/sync` -- Trigger Sync

See Spec 04 for full details. Body: `{ file_path: string }`.

## 3. Associated Files

| File | Role |
|------|------|
| `src/app/api/permits/route.ts` | `GET /api/permits` -- list with filters, search, pagination |
| `src/app/api/permits/[id]/route.ts` | `GET /api/permits/[id]` -- detail with trades, history, builder |
| `src/app/api/trades/route.ts` | `GET /api/trades` -- static trade list |
| `src/app/api/sync/route.ts` | `GET /api/sync` (history), `POST /api/sync` (trigger) |
| `src/lib/db/client.ts` | `query<T>()` helper for parameterized SQL |
| `src/lib/permits/types.ts` | `PermitFilter` interface, `Permit`, `Trade`, `SyncRun` |
| `src/lib/classification/trades.ts` | `TRADES` constant array (20 trades) |

## 4. Constraints & Edge Cases

- **SQL injection prevention**: Sort columns are validated against a hardcoded
  whitelist. All filter values use parameterized queries (`$1`, `$2`, ...).
  No user input is ever interpolated into SQL strings.
- **Limit cap**: `Math.min(Number(params.get('limit')), 100)` prevents clients
  from requesting unbounded result sets.
- **Page minimum**: `Math.max(1, filter.page || 1)` prevents page 0 or negative pages.
- **Sort fallback**: If `sort_by` is not in the allowed list, it silently falls
  back to `issued_date` rather than returning an error.
- **Sort order**: Only `'asc'` maps to `ASC`; anything else (including missing)
  maps to `DESC`.
- **NULLS LAST**: Sort queries use `NULLS LAST` so permits with null sort values
  do not dominate the first page.
- **Full-text search scope**: The search query covers `description`, `street_name`,
  and `builder_name` concatenated. The GIN index only covers `description`, so
  large-scale search performance could be improved with a composite index.
- **Permit ID encoding**: Permit numbers can contain spaces (e.g., `"24 101234"`).
  These must be URL-encoded when used in the path parameter.
- **Builder matching**: Uses `UPPER(REGEXP_REPLACE(TRIM(builder_name), '\\s+', ' ', 'g'))`
  to normalize the name before matching against `builders.name_normalized`. This
  may not match if normalization conventions differ.
- **History limit**: The detail endpoint returns a maximum of 50 history records.
  Permits with extensive change histories will be truncated.
- **COUNT(*) performance**: The separate count query scans the same rows as the
  data query. For very large result sets with complex filters, this could be slow.
- **No authentication**: All endpoints are currently public. No auth middleware.
- **Error responses**: All endpoints return `{ error: string }` with appropriate
  HTTP status codes (400, 404, 500).

## 5. Data Schema

### PermitFilter (query parameters)

```typescript
interface PermitFilter {
  status?: string;
  permit_type?: string;
  ward?: string;
  trade_slug?: string;
  min_cost?: number;
  max_cost?: number;
  search?: string;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}
```

### List Response

```typescript
{
  data: Permit[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}
```

### Detail Response

```typescript
{
  permit: Permit;
  trades: (TradeMatch & { trade_slug: string; trade_name: string; icon: string; color: string })[];
  history: PermitHistory[];
  builder: Builder | null;
}
```

### Error Response

```typescript
{
  error: string;
  message?: string;  // additional detail on POST /api/sync failures
}
```

## 6. Integrations

| System | Direction | Detail |
|--------|-----------|--------|
| Next.js | Framework | API routes via App Router (`route.ts` files) |
| PostgreSQL | Read | Parameterized queries via `src/lib/db/client.ts` |
| `TRADES` constant | Read | In-memory trade list for `GET /api/trades` |
| Frontend | Consumer | React/Next.js pages consume these endpoints |
| Full-text search | PostgreSQL | `to_tsvector` / `plainto_tsquery` with GIN index |

## 7. Triad Test Criteria

### A. Logic Layer

| ID | Test | Assertion |
|----|------|-----------|
| L01 | Filter by `status=Issued` | Only permits with `status = 'Issued'` are returned |
| L02 | Filter by `permit_type=Building` | Only permits with `permit_type = 'Building'` are returned |
| L03 | Filter by `ward=10` | Only permits in ward 10 are returned |
| L04 | Filter by `trade_slug=plumbing` | Only permits with a plumbing trade match are returned |
| L05 | Filter by `min_cost=100000&max_cost=500000` | Only permits with `est_const_cost` in range are returned |
| L06 | Combined filters | Multiple filters are ANDed together correctly |
| L07 | Sort by `est_const_cost` ASC | First result has the lowest cost |
| L08 | Sort by invalid column falls back to `issued_date` | `sort_by=hacked_field` silently uses `issued_date` |
| L09 | Sort column whitelist blocks injection | `sort_by=1;DROP TABLE permits` is rejected (falls back to `issued_date`) |
| L10 | Pagination: page 1, limit 10 | Returns first 10 results; `total_pages` is `ceil(total/10)` |
| L11 | Pagination: page 2, limit 10 | Returns results 11-20 |
| L12 | Pagination: limit capped at 100 | `limit=500` is reduced to 100 |
| L13 | Pagination: page 0 is treated as page 1 | `Math.max(1, ...)` enforced |
| L14 | Full-text search for `"plumbing renovation"` | Returns permits whose description/street_name/builder_name matches |
| L15 | Permit ID `"24 101234--01"` is parsed correctly | `permitNum = "24 101234"`, `revisionNum = "01"` |
| L16 | Permit ID without `--` separator returns 400 | Error message explains the expected format |
| L17 | Non-existent permit returns 404 | `{ error: "Permit not found" }` |
| L18 | Detail endpoint returns trades sorted by lead_score DESC | First trade has the highest lead score |
| L19 | Detail endpoint returns up to 50 history records | History array length is at most 50 |

### B. UI Layer

N/A -- these are API endpoints only. UI tests apply to the frontend components that consume these endpoints.

### C. Infra Layer

| ID | Test | Assertion |
|----|------|-----------|
| I01 | `GET /api/permits` returns valid JSON with `data` and `pagination` keys | Response parses as JSON; both keys present |
| I02 | Full-text search returns relevant results | Search for `"concrete foundation"` returns permits with those words in description |
| I03 | Full-text search handles special characters | Search for `"it's"` does not crash (plainto_tsquery handles it) |
| I04 | Pagination metadata is correct | `total` matches `COUNT(*)`, `total_pages = ceil(total / limit)`, `page` matches requested page |
| I05 | `GET /api/trades` returns 20 trades | Response array length is 20 |
| I06 | Trade sort order is correct | Trades are ordered by `sort_order` (1-20) |
| I07 | `GET /api/sync` returns up to 20 runs | Response array length is at most 20 |
| I08 | `GET /api/permits/[id]` includes builder when matched | Builder object is non-null for permits with known builder names |
| I09 | `GET /api/permits/[id]` returns null builder when no match | Builder is `null` when `builder_name` does not match any `builders.name_normalized` |
| I10 | All endpoints return 500 with error message on DB failure | Error response shape: `{ error: string }` |
| I11 | Parameterized queries prevent SQL injection | Injecting `'; DROP TABLE permits; --` as a filter value does not execute destructive SQL |
