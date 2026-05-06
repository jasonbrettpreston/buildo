# App Health Dashboard

<requirements>
## 1. Goal & User Story

**Goal:** give admins a single triage surface inside the admin app to answer "is the mobile app healthy in production right now?" without leaving for Sentry/PostHog SaaS UIs.

**User Story:** as an admin investigating "users report the app is slow / crashing / not converting", I want to see crash rate, auth conversion ratios, lead-save funnel rate, and paywall conversion in one place — with a deep-link out to the SaaS tools when I need to drill into specific events. Currently this knowledge is ambient: events fire (per Spec 99 §7.5–§7.7) but no in-repo surface visualizes them, and the SaaS dashboard configuration is undocumented.

**What this spec is NOT:** a replacement for Sentry/PostHog. The SaaS tools remain the source of truth for deep analysis (event timelines, session replays, cohort funnels). This spec defines the **triage layer** + **the canonical setup guide** for the SaaS-side configuration so the dashboards aren't tribal knowledge that disappears when the operator who set them up leaves.
</requirements>

---

<architecture>
## 2. Technical Architecture

### 2.1 Phased Rollout

**Phase A (this spec, in scope):** in-repo triage page + minimal aggregator + setup guide for SaaS dashboards. Closes the "no admin can see frontend health without leaving the repo" gap.

**Phase B (deferred to future spec amendment):** richer in-repo charts, historical trend overlays, automated alert promotion to email/PagerDuty. Phase A is sufficient for the current visibility goal; Phase B is gated on usage-driven need.

### 2.2 API Endpoint

**`GET /api/admin/app-health`** — admin-only aggregator. Pulls from Sentry REST + PostHog Query API server-side, caches 60s (matching Spec 26's polling cadence), returns a fixed-shape JSON envelope so the UI can render without per-tile failure isolation.

```typescript
interface AppHealthResponse {
  data: {
    /** ISO 8601 of when this snapshot was assembled. */
    snapshot_at: string;
    /** Each tile evaluates independently; one tile failing does not poison the others. */
    tiles: {
      crash_rate_24h: TileResult<{
        rate_per_user: number;          // crashes ÷ DAU
        affected_users: number;
        sentry_link: string;            // deep-link into Sentry SaaS
      }>;
      auth_conversion_7d: TileResult<{
        per_method: Array<{
          method: 'apple' | 'google' | 'email' | 'phone';
          attempted: number;
          succeeded: number;
          ratio: number;                // succeeded ÷ attempted
        }>;
        posthog_link: string;
      }>;
      lead_save_funnel_7d: TileResult<{
        viewed: number;                 // lead_detail_viewed count
        saved: number;                  // lead_saved count
        ratio: number;                  // saved ÷ viewed
        posthog_link: string;
      }>;
      paywall_conversion_7d: TileResult<{
        shown: number;                  // paywall_shown count
        clicked: number;                // subscribe_button_clicked count
        ratio: number;                  // clicked ÷ shown
        posthog_link: string;
      }>;
      cache_invalidation_24h: TileResult<{
        breadcrumb_count: number;       // Sentry breadcrumb category='query' count
        sentry_link: string;
      }>;
    };
  };
  error: null;
  meta: null;
}

type TileResult<T> =
  | { status: 'ok'; payload: T }
  | { status: 'unavailable'; reason: string };  // SaaS API down, missing env var, etc.
```

**Auth:** admin session cookie OR `X-Admin-Key` (mirrors Spec 76 §2.6). Same middleware as `/admin/*` routes.

**Caching:** in-memory 60s TTL keyed on `snapshot_at` minute boundary. Sentry/PostHog rate limits matter; the page polls at 60s intervals (matches Spec 26 §3.2 cadence). NOT persisted to DB — this is read-side aggregation, not pipeline state.

### 2.3 UI

**`src/app/admin/app-health/page.tsx`** — server-component shell + client-side polling tile grid. 5 tiles in a responsive grid (full-width on mobile-admin, 2-col desktop). Each tile is a `<HealthTile>` component:
- title + 24h/7d window label
- primary metric (crash rate %, ratio, count)
- secondary metric (drill: e.g., "12 affected users", "Apple 92% / Google 87%")
- "View in Sentry/PostHog →" deep-link button
- `unavailable` state renders a muted "—" with the reason (e.g., "PostHog API key not configured")

**Top-bar deep-link tile** added to the existing `/admin` page navigation hub (Spec 26 §3.1) so the App Health surface is discoverable from the standard admin landing.

### 2.4 Implementation Files

| File | Purpose |
|---|---|
| `src/app/admin/app-health/page.tsx` | Server-component shell + initial fetch. |
| `src/components/admin/HealthTile.tsx` | Per-tile renderer. Loading / ok / unavailable states. |
| `src/app/api/admin/app-health/route.ts` | Aggregator endpoint. Calls helper modules below; assembles envelope. |
| `src/lib/admin/sentry-client.ts` | Thin wrapper around Sentry REST API: crash rate, breadcrumb count. Lazy-init on first call. |
| `src/lib/admin/posthog-client.ts` | Thin wrapper around PostHog Query API: funnel/event counts. Lazy-init on first call. |
| `src/lib/admin/healthSchema.ts` | Zod schema for `AppHealthResponse` — boundary validation for the admin endpoint (closes the audit's Zod-on-admin-endpoint gap from `26_admin_dashboard` + `76_lead_feed_health_dashboard` review). |

### 2.5 Database Impact

None. This is read-side aggregation against external APIs.

### 2.6 Observability of the observability layer

The aggregator endpoint itself MUST log Sentry breadcrumbs on each tile evaluation (`category: 'app_health', message: 'tile_evaluated', data: { tile, status, duration_ms }`) so when a tile renders `unavailable`, the operator can find the cause in Sentry. Failure to obtain Sentry/PostHog data from external APIs MUST NOT throw — each tile fails independently to `{ status: 'unavailable', reason }` so the page renders a partial result rather than a 500.
</architecture>

---

<security>
## 3. Auth Matrix

| Role | Access |
|------|--------|
| Anonymous | None |
| Authenticated user | None |
| Admin | Read-only |

PII boundary: this endpoint surfaces aggregate counts only — no per-user crash details, no event payloads beyond the whitelisted properties enumerated in Spec 99 §7.6. Drill-down into per-user / per-event detail happens in the SaaS tools (Sentry/PostHog) which already enforce their own auth. The deep-link buttons assume the admin is already authenticated to those SaaS tools (org SSO).
</security>

---

<behavior>
## 4. Behavioral Contract

- **Inputs:** Admin navigates to `/admin/app-health`. Page fetches `GET /api/admin/app-health` on mount + every 60s.
- **Core Logic:**
  1. Aggregator endpoint fans out to Sentry REST + PostHog Query API in parallel.
  2. Each tile's data fetch has independent error isolation — one SaaS API failure does not poison the others.
  3. Cache hit (60s window): return previous envelope unchanged.
  4. Cache miss: fetch all tiles, assemble envelope, write cache, return.
- **Outputs:** `AppHealthResponse` JSON envelope. Page renders 5 tiles + drill-down links.
- **Edge Cases:**
  - Missing env vars (`SENTRY_API_TOKEN`, `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID`): each affected tile returns `{ status: 'unavailable', reason: 'env_missing' }`. Page shows muted state per tile, NOT a full-page error.
  - SaaS API rate-limit: 429 response from Sentry/PostHog → tile renders `unavailable` with `reason: 'rate_limited'`. Cache TTL extended to 5 min for that tile to back off.
  - SaaS API down: 5xx → `reason: 'upstream_unavailable'`. Tile renders muted; aggregator does not retry within the cache window.
  - No events in window (e.g., zero `paywall_shown` events in last 7d for a low-traffic environment): tile renders `0 / 0 (—%)` with a "no data in window" caption. Distinct from `unavailable`.
  - Mobile event drift (e.g., Spec 99 §7.5 `Sentry.setUser` regression): the §8.5 mandates-lint test in `mobile/__tests__/spec99.mandates.lint.test.ts` is the upstream guard. The admin page does NOT detect the drift directly — it just renders zero/low values. Spec 99 §8 enforcement is the canonical safety net.
</behavior>

---

<setup_guide>
## 4a. Operator Setup Guide (the canonical SaaS-config doc)

This section is the **canonical home for the SaaS dashboard configuration that previously lived in tribal knowledge**. New operators reading this section MUST be able to fully configure Sentry + PostHog from scratch without asking anyone.

### 4a.1 Sentry

**Project setup:**
- Mobile project: `buildo-mobile` (Expo / React Native).
- Backend project: `buildo-backend` (Next.js).
- Combined alert rules + saved searches live on the mobile project.

**Required alert rules:**
1. **Crash rate > 0.5% of DAU (rolling 24h)** → email + Slack notify ops channel.
2. **New issue with > 100 events in 1h** → Slack notify (catches sudden regressions).
3. **`LeadDetailSchemaError` / `FlightJobDetailSchemaError` / `LeadFeedSchemaError` event** → email immediately (signals server contract drift).

**Required saved searches** (for the deep-link buttons in the admin UI):
- `category:app_health` — surfaces aggregator endpoint health (Spec 30 §2.6 self-observability).
- `category:query` — cache invalidation breadcrumbs (Spec 99 §7.2).
- `is:unresolved level:fatal user.id:*` — crash rate query (Spec 99 §7.5).

**API token:** create a Sentry internal-integration token with `event:read` + `project:read` scopes. Store as `SENTRY_API_TOKEN` env var on the admin server.

### 4a.2 PostHog

**Project setup:** single Buildo project. Mobile app emits via `mobile/src/lib/analytics.ts` (PII-stripped per `ALLOWED_KEYS`).

**Required funnels** (the names below are the canonical names referenced by `src/lib/admin/posthog-client.ts`):
1. **`auth_funnel_apple`** — `auth_method_attempted method=apple` → `auth_method_succeeded method=apple`. 7-day window.
2. **`auth_funnel_google`** — same shape, `method=google`.
3. **`auth_funnel_email`** — same shape, `method=email`.
4. **`auth_funnel_phone`** — same shape, `method=phone`.
5. **`lead_save_funnel`** — `lead_detail_viewed` → `lead_saved`. 7-day window.
6. **`paywall_conversion_funnel`** — `paywall_shown` → `subscribe_button_clicked`. 7-day window.

Each funnel MUST be created exactly once — the admin page queries by funnel name. Renaming a funnel without updating `posthog-client.ts` breaks the corresponding tile.

**API key:** PostHog personal API key with `query` + `feature_flag:read` scopes. Store as `POSTHOG_API_KEY` + `POSTHOG_PROJECT_ID`.

### 4a.3 Env var reference

| Var | Required for | Default behavior if missing |
|---|---|---|
| `SENTRY_API_TOKEN` | crash_rate_24h, cache_invalidation_24h tiles | tile renders `unavailable` |
| `POSTHOG_API_KEY` | auth_conversion_7d, lead_save_funnel_7d, paywall_conversion_7d tiles | tile renders `unavailable` |
| `POSTHOG_PROJECT_ID` | same | tile renders `unavailable` |
</setup_guide>

---

<failure_modes>
## 4b. Known Failure Modes

(Empty until first CRITICAL/HIGH bug fix per `docs/specs/00-architecture/05_knowledge_operating_model.md` §4.)
</failure_modes>

---

<testing>
## 5. Testing Mandate
<!-- TEST_INJECT_START -->
- **Logic:** `src/tests/admin-app-health.logic.test.ts` — TileResult discriminated union; cache TTL boundary; `unavailable` reason propagation; partial-failure tile isolation (one tile's error doesn't poison others).
- **UI:** `src/tests/admin-app-health.ui.test.tsx` — `<HealthTile>` renders all three states (loading, ok, unavailable). Deep-link buttons present and target correct SaaS URL. Polling-cadence test (timer-based).
- **Infra:** `src/tests/admin-app-health.infra.test.ts` — `/api/admin/app-health` route handler with mocked Sentry/PostHog clients. Asserts envelope shape via `healthSchema.ts` Zod parse. Auth-gate enforcement (admin vs non-admin → 401/403). Rate-limit handling (mocked 429 → tile `unavailable` with `reason: 'rate_limited'`).
<!-- TEST_INJECT_END -->
</testing>

---

<constraints>
## 6. Operating Boundaries

### Target Files
- `src/app/admin/app-health/page.tsx`
- `src/components/admin/HealthTile.tsx`
- `src/app/api/admin/app-health/route.ts`
- `src/lib/admin/sentry-client.ts`
- `src/lib/admin/posthog-client.ts`
- `src/lib/admin/healthSchema.ts`
- `src/tests/admin-app-health.{logic,ui,infra}.test.ts(x)`

### Out-of-Scope Files
- `mobile/` — telemetry emission is owned by Spec 99 §7. This spec only consumes those events.
- `src/app/admin/{control-panel,data-quality,lead-feed,market-metrics}/` — orthogonal admin surfaces; this spec adds a sibling, doesn't modify them.
- `src/app/api/webhooks/` — webhook handlers are not part of the health surface.
- `sentry.client.config.ts`, `mobile/src/lib/analytics.ts` — telemetry SDK init owned by Spec 90 §11 and Spec 99 §7. Don't touch.

### Cross-Spec Dependencies
- **Relies on:**
  - **Spec 99 §7.5** — `Sentry.setUser({id})` for crash rate per user. Without this, the crash_rate_24h tile cannot compute "rate per user" — it would only show absolute crash count.
  - **Spec 99 §7.6** — product funnel events (`lead_detail_viewed`, `lead_saved`, `paywall_shown`, `subscribe_button_clicked`). The funnel tiles directly query these event names from PostHog.
  - **Spec 99 §7.7** — auth method ratio invariants (`auth_method_attempted`, `auth_method_succeeded`, `auth_method_failed`). The auth tile directly queries these.
  - **Spec 99 §7.2** — cache invalidation Sentry breadcrumbs (`category: 'query'`). The cache_invalidation tile counts these.
  - **Spec 99 §8.5 + §8.7 + §8.8** — mandates-lint tests are the upstream guards; this spec consumes their work but doesn't replace them.
  - **Spec 26 §3.1** — admin tile pattern. The new `/admin/app-health` link slots into the existing `/admin` navigation hub.
  - **Spec 76 §2.6** — admin auth pattern (session cookie / `X-Admin-Key`). Reused verbatim.
- **Consumed by:** none initially. Future Spec 30 Phase B (in-repo alert promotion) would build on top.

### Architectural Decision Worth Calling Out

**Why hybrid (in-repo aggregator + external deep-link)?** Three options were considered:
1. **External-only with link surface** — `/admin/app-health` is just a page of links to Sentry/PostHog. Lowest effort but no in-repo health signal; SaaS-tool outage = no admin visibility at all.
2. **Full in-repo widgets** — render historical charts inside the admin page. Highest effort; duplicates SaaS-tool capability poorly.
3. **Hybrid (chosen)** — show point-in-time aggregates in-repo so an admin gets immediate triage at a glance, drill into SaaS for analysis. The aggregator endpoint MUST cache aggressively (60s) to respect SaaS rate limits. SaaS-tool outage degrades gracefully (per-tile `unavailable`).

The hybrid wins on **graceful degradation** + **operator efficiency for triage**. Future Phase B can promote the aggregator into a richer in-repo dashboard once usage shapes the requirements.

### Out of Scope for Spec 30 (deferred to future cycles)

These are explicitly NOT this spec's surface:
- **Flight Center Tool** (admin acts as a user, tracks permits) — separate Spec 76 §3.4 amendment cycle. Different concern, different stakeholders.
- **Web-admin engineering protocol** (Spec 90 mobile equivalent) — separate cycle.
- **Web-admin testing protocol** (Spec 98 mobile equivalent) — separate cycle.
- **Web-admin state architecture** (Spec 99 mobile equivalent) — separate cycle.
- **Backend telemetry** (server-side query latency, webhook latency) — separate spec. The mobile-side telemetry baseline is what this spec surfaces; backend telemetry has its own observability surface (Spec 48 pipeline observability for pipeline scripts; no equivalent yet for API routes).
- **Phase B in-repo richer charts / alert promotion** — gated on usage-driven need.
</constraints>
