# 26 - Admin Panel

**Status:** Planned
**Last Updated:** 2026-02-14
**Depends On:** `01_database_schema.md`, `02_data_ingestion.md`, `07_trade_taxonomy.md`, `08_trade_classification.md`, `11_builder_enrichment.md`, `13_auth.md`
**Blocks:** None

---

## 1. User Story

> "As an admin, I want to monitor sync health, manage trade classification rules, view enrichment queues, and see system metrics."

**Acceptance Criteria:**
- Admin routes are protected by role-based access control (only users with `role: 'admin'` can access)
- Dashboard contains 6 sections: Sync Dashboard, Trade Rule Editor, Builder Enrichment Queue, System Metrics, User Management, Data Quality
- Sync Dashboard shows the last 20 sync runs with stats and supports triggering manual syncs
- Trade Rule Editor provides full CRUD for classification rules with live testing against sample permits
- Enrichment Queue shows pending/completed/failed enrichments with retry and manual entry capabilities
- System Metrics display key counts and trends at a glance
- User Management lists all users with plan info and usage statistics

---

## 2. Technical Logic

### Admin Role Check

```typescript
// Firestore /users/{uid} includes role field
interface AdminUser {
  uid: string;
  email: string;
  role: 'user' | 'admin';
}

// Middleware for admin routes
async function requireAdmin(req: Request): Promise<void> {
  const user = await getAuthenticatedUser(req);
  if (!user || user.role !== 'admin') {
    throw new ForbiddenError('Admin access required');
  }
}

// Client-side route protection
function AdminLayout({ children }) {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <Redirect to="/" />;
  return <AdminShell>{children}</AdminShell>;
}
```

### Section 1: Sync Dashboard

```
Data source: sync_runs table (PostgreSQL)

Display:
  - Table of last 20 sync runs, columns:
    id, started_at, completed_at, duration, status, permits_new, permits_updated,
    permits_unchanged, errors_count
  - Status badges: 'completed' (green), 'running' (blue), 'failed' (red)
  - Duration formatted as "Xm Ys"
  - Expandable error log per run (stores first 100 error messages)

Actions:
  - "Trigger Sync" button: POST /api/sync with admin authorization
  - "View Errors" expand: shows error details for a specific run
  - Auto-refresh: polls /api/admin/sync-runs every 30s while a sync is running

Queries:
  SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 20;

  -- Sync health summary
  SELECT
    COUNT(*) FILTER (WHERE status = 'completed' AND started_at > NOW() - INTERVAL '7 days') AS successful_7d,
    COUNT(*) FILTER (WHERE status = 'failed' AND started_at > NOW() - INTERVAL '7 days') AS failed_7d,
    AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (WHERE status = 'completed') AS avg_duration_sec
  FROM sync_runs;
```

### Section 2: Trade Rule Editor

```
Data source: trade_mapping_rules table (PostgreSQL)

Display:
  - Table of all rules, columns:
    id, trade_slug, rule_type ('keyword'|'regex'|'work_type'), pattern, priority,
    is_active, match_count, created_at
  - Sort by priority DESC (highest priority first)
  - Active/inactive toggle per rule

CRUD Operations:
  CREATE: Form with fields: trade_slug (dropdown from taxonomy), rule_type, pattern, priority
  READ:   Table with all rules, filterable by trade and rule_type
  UPDATE: Inline edit or modal form for existing rules
  DELETE: Soft delete (set is_active = false) with hard delete option for unused rules

Rule Testing:
  - "Test Rule" panel: paste a permit description, run all active rules against it
  - Shows which rules matched, in priority order, and the resulting trade classification
  - Useful for debugging why a permit was classified a certain way

Queries:
  SELECT tmr.*, t.name as trade_name,
         (SELECT COUNT(*) FROM permit_trades pt WHERE pt.rule_id = tmr.id) as match_count
  FROM trade_mapping_rules tmr
  JOIN trades t ON t.slug = tmr.trade_slug
  ORDER BY tmr.priority DESC;
```

### Section 3: Builder Enrichment Queue

```
Data source: builders table + builder_contacts table (PostgreSQL)

Display:
  - Three tabs: Pending | Completed | Failed
  - Pending: builders with enrichment_status = 'pending', ordered by created_at ASC
  - Completed: builders with enrichment_status = 'completed', showing enriched fields
  - Failed: builders with enrichment_status = 'failed', showing error message and retry count
  - Columns: builder_name, permit_count, enrichment_status, last_attempted, error_message

Actions:
  - "Retry" button on failed items: resets status to 'pending', increments retry_count
  - "Retry All Failed" bulk action: resets all failed items
  - "Manual Entry" form: directly enter builder contact info (phone, email, website)
    skipping the enrichment pipeline
  - "Skip" button: marks a builder as 'skipped' (will not be retried)

Queries:
  SELECT b.*,
         COUNT(DISTINCT p.id) as permit_count,
         bc.phone, bc.email, bc.website
  FROM builders b
  LEFT JOIN permits p ON p.applicant = b.name
  LEFT JOIN builder_contacts bc ON bc.builder_id = b.id
  WHERE b.enrichment_status = $status
  GROUP BY b.id, bc.phone, bc.email, bc.website
  ORDER BY b.created_at ASC
  LIMIT 50 OFFSET $offset;
```

### Section 4: System Metrics

```
Metrics displayed as stat cards with sparkline trends:

  1. Total Permits:        SELECT COUNT(*) FROM permits
  2. Classified Permits:   SELECT COUNT(DISTINCT permit_id) FROM permit_trades
  3. Unclassified Permits: Total - Classified
  4. Classification Rate:  Classified / Total * 100 (%)
  5. Total Users:          Firestore /users collection count
  6. Pro Subscribers:      Firestore query: plan == 'pro'
  7. Enterprise Subs:      Firestore query: plan == 'enterprise'
  8. Active Rules:         SELECT COUNT(*) FROM trade_mapping_rules WHERE is_active = true
  9. Builders Enriched:    SELECT COUNT(*) FROM builders WHERE enrichment_status = 'completed'
  10. API Requests (24h):  Redis counter or Cloud Monitoring metric

Layout: 2-row grid of metric cards, each showing:
  - Metric name
  - Current value (large number)
  - Change vs previous period (e.g., "+234 this week")
  - Mini sparkline chart (last 30 days)
```

### Section 5: User Management

```
Data source: Firestore /users collection

Display:
  - Paginated table, 25 users per page
  - Columns: email, display_name, plan, team_name, saved_permits_count,
    last_login, created_at
  - Search by email or name
  - Filter by plan (free/pro/enterprise)
  - Sort by any column

Actions:
  - View user detail: expanded panel showing full profile, usage stats,
    notification preferences
  - No edit/delete actions (user management changes happen through
    Firebase Auth console or Stripe dashboard for safety)

Queries (Firestore):
  collection('users')
    .where('plan', '==', filterPlan)     // optional filter
    .orderBy(sortField, sortDirection)
    .limit(25)
    .startAfter(lastDoc)                 // pagination cursor
```

### API Endpoints

```
GET  /api/admin/sync-runs              - List last 20 sync runs
POST /api/admin/sync-runs/trigger      - Trigger manual sync
GET  /api/admin/sync-runs/{id}/errors  - Get errors for a sync run

GET    /api/admin/rules                - List all trade mapping rules
POST   /api/admin/rules                - Create a new rule
PUT    /api/admin/rules/{id}           - Update a rule
DELETE /api/admin/rules/{id}           - Delete/deactivate a rule
POST   /api/admin/rules/test           - Test rules against a sample permit

GET  /api/admin/enrichment             - List enrichment queue (with status filter)
POST /api/admin/enrichment/{id}/retry  - Retry a failed enrichment
POST /api/admin/enrichment/retry-all   - Retry all failed enrichments
POST /api/admin/enrichment/{id}/manual - Manual entry for builder contact

GET  /api/admin/metrics                - System metrics summary
GET  /api/admin/users                  - Paginated user list
GET  /api/admin/users/{uid}            - User detail

GET  /api/quality                      - Data quality snapshot + 30-day trends (Spec 28)
POST /api/quality/refresh              - Trigger manual data quality snapshot (Spec 28)
```

---

## 3. Associated Files

| File | Purpose | Status |
|------|---------|--------|
| `src/app/admin/layout.tsx` | Admin layout with sidebar navigation and role check | Planned |
| `src/app/admin/page.tsx` | Admin dashboard home with Data Quality nav link | In Progress |
| `src/app/admin/data-quality/page.tsx` | Data Quality Dashboard (Spec 28) | Implemented |
| `src/app/admin/sync/page.tsx` | Sync Dashboard page | Planned |
| `src/app/admin/rules/page.tsx` | Trade Rule Editor page | Planned |
| `src/app/admin/enrichment/page.tsx` | Builder Enrichment Queue page | Planned |
| `src/app/admin/metrics/page.tsx` | System Metrics page | Planned |
| `src/app/admin/users/page.tsx` | User Management page | Planned |
| `src/components/admin/SyncRunsTable.tsx` | Sync runs table with expandable errors | Planned |
| `src/components/admin/RuleEditorForm.tsx` | CRUD form for trade mapping rules | Planned |
| `src/components/admin/RuleTester.tsx` | Rule testing panel | Planned |
| `src/components/admin/EnrichmentQueue.tsx` | Tabbed enrichment queue display | Planned |
| `src/components/admin/MetricCard.tsx` | Stat card with sparkline | Planned |
| `src/components/admin/UserTable.tsx` | Paginated user list table | Planned |
| `src/app/api/admin/[...path]/route.ts` | Admin API route handlers | Planned |
| `src/lib/admin/middleware.ts` | Admin role verification middleware | Planned |

---

## 4. Constraints & Edge Cases

- **Admin role assignment:** Admin roles are assigned manually in Firestore or via Firebase Admin SDK. There is no self-service admin promotion. Initial admin is the project creator.
- **Concurrent sync trigger:** If a sync is already running, the "Trigger Sync" button should be disabled and show "Sync in progress." Attempting to trigger via API while a sync is running returns 409 Conflict.
- **Rule priority conflicts:** Two rules with the same priority and conflicting trades are resolved by the rule with the lower ID (created first). The admin UI should warn about priority conflicts.
- **Rule deletion safety:** Deleting a rule that has matched permits (match_count > 0) requires confirmation. The matches are not undone retroactively; re-classification requires a manual "reclassify all" action.
- **Enrichment retry limits:** Failed enrichments have a maximum retry count of 3. After 3 retries, the item is marked as 'permanently_failed' and requires manual resolution or skip.
- **Metrics query performance:** Counting 237K permits is fast with COUNT(*), but joining for classification rate may be slower. Use approximate counts from `pg_stat_user_tables` for real-time display, with exact counts refreshed every 5 minutes.
- **User management read-only:** Admins can view user data but cannot modify plans, reset passwords, or delete users through the admin panel. These actions require direct access to Stripe dashboard or Firebase console, respectively, for audit trail purposes.
- **Error log storage:** Sync error logs can be verbose. Store only the first 100 errors per sync run. Full error logs are available in Cloud Logging.
- **Admin audit trail:** All admin actions (trigger sync, CRUD rules, retry enrichment) are logged with admin UID, action, timestamp, and affected resource ID. Stored in Firestore `/admin_audit_log/{logId}`.

---

## 5. Data Schema

### Existing Tables (Referenced)

The admin panel reads from these existing tables (defined in their respective specs):

```
sync_runs       - Spec 04: id, started_at, completed_at, status, permits_new,
                  permits_updated, permits_unchanged, errors_count, error_log
trade_mapping_rules - Spec 08: id, trade_slug, rule_type, pattern, priority,
                      is_active, created_at, updated_at
builders        - Spec 11: id, name, enrichment_status, last_attempted,
                  retry_count, error_message
builder_contacts - Spec 11: id, builder_id, phone, email, website
permits         - Spec 01: all columns
permit_trades   - Spec 08: permit_id, trade_id, rule_id
```

### Firestore: `/admin_audit_log/{logId}`

```typescript
interface AdminAuditEntry {
  id: string;
  admin_uid: string;
  admin_email: string;
  action: 'trigger_sync' | 'create_rule' | 'update_rule' | 'delete_rule' |
          'test_rule' | 'retry_enrichment' | 'retry_all_enrichment' |
          'manual_enrichment' | 'skip_enrichment';
  resource_type: 'sync_run' | 'trade_mapping_rule' | 'builder';
  resource_id: string | number;
  details: Record<string, any>;      // action-specific metadata
  created_at: Timestamp;
}
```

### TypeScript Interfaces

```typescript
interface SyncRunSummary {
  id: number;
  startedAt: Date;
  completedAt: Date | null;
  durationSeconds: number | null;
  status: 'running' | 'completed' | 'failed';
  permitsNew: number;
  permitsUpdated: number;
  permitsUnchanged: number;
  errorsCount: number;
}

interface SyncHealthSummary {
  successful7d: number;
  failed7d: number;
  avgDurationSec: number;
  lastSyncAt: Date;
  lastSyncStatus: string;
}

interface RuleTestResult {
  input: string;                     // permit description tested
  matchedRules: {
    ruleId: number;
    tradeSlug: string;
    tradeName: string;
    ruleType: string;
    pattern: string;
    priority: number;
  }[];
  finalClassification: string[];    // trade slugs after priority resolution
}

interface SystemMetrics {
  totalPermits: number;
  classifiedPermits: number;
  classificationRate: number;
  totalUsers: number;
  proSubscribers: number;
  enterpriseSubscribers: number;
  activeRules: number;
  buildersEnriched: number;
  apiRequests24h: number;
}
```

---

## 6. Integrations

| System | Direction | Purpose |
|--------|-----------|---------|
| Database Schema (`01`) | Upstream | Permits and permit_trades tables for metrics |
| Data Ingestion (`02`) | Upstream | Sync pipeline triggered and monitored |
| Sync Scheduler (`04`) | Upstream | sync_runs table for sync history |
| Trade Taxonomy (`07`) | Reference | Trade names and slugs for rule editor dropdowns |
| Classification Engine (`08`) | Upstream | trade_mapping_rules CRUD, classification testing |
| Builder Enrichment (`11`) | Upstream | Enrichment queue monitoring and retry |
| Authentication (`13`) | Reference | Admin role verification, user data for user management |
| Subscription (`25`) | Reference | Plan data displayed in user management |
| Firebase Auth | External | Admin role stored in Firestore user document |
| Cloud Logging | External | Full sync error logs beyond the first 100 |

---

## 7. Triad Test Criteria

### A. Logic Layer

| Test Case | Input | Expected Output |
|-----------|-------|-----------------|
| Admin role check - admin | User with role='admin' accesses /admin | Access granted |
| Admin role check - user | User with role='user' accesses /admin | 403 Forbidden |
| Admin role check - unauth | No auth token accesses /admin | 401 Unauthorized |
| Sync trigger while idle | No sync running, admin triggers sync | Sync starts, returns run ID |
| Sync trigger while running | Sync already in progress | 409 Conflict, sync not triggered |
| Rule creation validation | Valid rule: trade='plumbing', type='keyword', pattern='pipe' | Rule created, ID returned |
| Rule creation invalid trade | Rule with trade_slug='nonexistent' | 400: invalid trade slug |
| Rule priority conflict warn | Two rules same priority, different trades | Warning returned (not error) |
| Rule test - single match | Description "install copper pipe", keyword rule 'pipe' -> plumbing | Match: plumbing |
| Rule test - multi match | Description "pipe and wire", rules for plumbing + electrical | Both trades returned |
| Rule test - no match | Description "general renovation", no matching rules | Empty classification |
| Rule deletion with matches | Rule has match_count=50, delete requested | Requires confirmation flag |
| Enrichment retry | Failed builder, retry_count=1 | Status reset to 'pending', retry_count=2 |
| Enrichment retry limit | Failed builder, retry_count=3 | Error: max retries exceeded, mark permanently_failed |
| Manual enrichment entry | Builder ID + phone + email | builder_contacts record created, status='completed' |
| Audit log creation | Admin triggers sync | Audit entry created with admin UID, action, timestamp |

### B. UI Layer

| Test Case | Verification |
|-----------|-------------|
| Admin sidebar navigation | 6 sections visible: Sync, Rules, Enrichment, Metrics, Users, Data Quality |
| Sync runs table | Last 20 runs displayed with all stats columns |
| Sync status badges | Green for completed, blue for running, red for failed |
| Sync duration format | Duration shows as "2m 34s" not raw seconds |
| Error log expansion | Clicking a row expands to show error details |
| Trigger sync button | Button visible, disabled while sync is running |
| Rule editor table | All rules listed with trade name, type, pattern, priority |
| Rule create form | Form validates required fields before submission |
| Rule active toggle | Toggle switch immediately enables/disables a rule |
| Rule test panel | Text area for description, "Test" button, results display |
| Enrichment tabs | Three tabs (Pending/Completed/Failed) with correct counts |
| Retry button | Retry button on failed items resets status and refreshes list |
| Manual entry form | Form with phone, email, website fields for direct builder entry |
| Metric cards | 10 metric cards with current value and change indicator |
| User table | Paginated table with search, plan filter, and sort |
| Non-admin redirect | Non-admin user navigated to /admin sees redirect to home |

### C. Infra Layer

| Test Case | Verification |
|-----------|-------------|
| Admin middleware | All /api/admin/* routes reject non-admin requests with 403 |
| Sync runs query | Query returns last 20 runs ordered by started_at DESC within 500ms |
| Trade mapping rules CRUD | CREATE, READ, UPDATE, DELETE operations work against PostgreSQL |
| Rule test execution | Test endpoint runs all active rules against input within 1 second |
| Enrichment query | Queue query with joins returns within 500ms for up to 1000 builders |
| Metrics aggregation | System metrics endpoint returns all 10 metrics within 2 seconds |
| User list Firestore query | Paginated user query returns 25 users within 1 second |
| Admin audit write | Audit entries written to Firestore within 500ms of admin action |
| API rate limiting | Admin endpoints rate limited to 60 requests per minute |
| CORS protection | Admin API endpoints only accept requests from app.buildo.ca origin |
| Error handling | All admin endpoints return structured error JSON, never stack traces |
