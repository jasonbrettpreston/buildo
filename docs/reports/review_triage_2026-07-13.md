# Review Queue Triage — 2026-07-13

_Automated weekly triage of `docs/reports/review_followups.md`. Source file: 1,655 lines,
~233 open DEFER rows. No prior triage report found (first run). HEAD: `1e6e5d9`._

---

## Stale Items

Items where the named function/symbol/file no longer matches the deferred description.

### RESOLVED — `classify-lifecycle-phase.js` missing `lifecycle_status_history` writes (Phase E.2 item #110)

Deferred 2026-05-14 as CRIT: "classify-lifecycle-phase.js does not write to lifecycle_status_history
table per Spec 42 §6.7". Verification:

```
grep -n 'INSERT INTO lifecycle_status_history' scripts/classify-lifecycle-phase.js
→ line 994:  INSERT INTO lifecycle_status_history   (permit-side Phase I.1)
→ line 1259: INSERT INTO lifecycle_status_history   (CoA-side Phase I.1)
```

Phase I.1 implemented the writes; audit metrics at lines 1663-1664 track `lifecycle_status_history_inserted`
and `lifecycle_status_history_errors`. **Remove from active queue.**

Evidence: `git log --all -S 'lifecycle_status_history' --oneline -5 -- scripts/classify-lifecycle-phase.js`
returns commit `58a0b8f` (Phase D close-out).

---

### STILL PRESENT (not stale) — 3 dead-code symbols in `scripts/load-massing.js`

Deferred LOW from WF2 #C (2026-05-09). All three confirmed present:

```
grep -n 'shoelaceArea|SQM_TO_SQFT|isProjected' scripts/load-massing.js
→ line  26: const SQM_TO_SQFT = 10.7639;       (no usage site — dead)
→ line  36: function shoelaceArea(ring) {        (no call site — dead)
→ line 339: const isProjected = ring[0] && ...  (runtime-sanity-log only)
```

These are LOW cleanup items — confirmed deferred, not stale.

---

## Top 5 This Week

Ranked: (a) severity → (b) unblock count → (c) recent file activity.
Note: no commits in the past 14 days. Severity decay rule applies — all HIGH items >14 days
without progress should have been demoted or escalated. The items below are the strongest
remaining case for each grouping.

---

### #1 — cost-model-shared.js falsy-`0` bug cluster (HIGH × 2 + MED × 1)

**File:** `src/features/leads/lib/cost-model-shared.js`
**Source:** Gemini WF2 #3 review (2026-05-08) — 65 days dormant past the HIGH decay threshold

Three bugs share the same root cause (`||` instead of `??`) in the single source-of-truth
cost formula:

| Line | Current code | Bug | Fix |
|------|-------------|-----|-----|
| 193 | `row.storeys \|\| 1` | 0-storey permit inflated to 1 → GFA overstated | `row.storeys ?? 1` |
| 234 | `pct !== undefined && pct > 0` | `pct === 0` falls to full-GFA fallback | `if (pct !== undefined)` |
| 293 | `rateRow.structure_complexity_factor \|\| 1.0` | operator-set 0 overridden to 1.0 | `?? 1.0` |

**Rationale for #1:** Affects `cost_estimates` for every affected permit type, directly
inflating the lead score shown in the mobile feed. All three fixes are one-liners in one
file. Unblocks: accurate `opportunity_score` → lead ranking → realtor feed quality.

---

### #2 — Spec 93 WF3 queue: 3 filed tasks with planning docs on disk

**Files:** `.cursor/deferred_task_spec93_backup_email_persistence.md`,
`.cursor/deferred_task_spec93_authstate_reset_placement.md`,
`.cursor/deferred_task_spec93_sentry_v8_upgrade.md`
**Source:** WF2 Spec 93 RNFirebase migration round 2 (2026-04-30 / filed 2026-05-15)

All three have fully-specified planning notes; `WF3` invocation drops straight into the
plan. No investigation needed before execution.

- **WF3-A** — Backup-email persistence bridge missing (data-loss: email not persisted across
  re-auth).
- **WF3-B** — Auth-state reset placement leaks PII on forced sign-out (PIPEDA concern).
- **WF3-C** — `@sentry/react-native` v7→v8 upgrade required for RN 0.81 + New Architecture.

**Rationale for #2:** Lowest friction path to closing 3 named tasks. WF3-B is a potential
PIPEDA compliance gap (auth-state cleanup leaks data to subsequent user on a shared device).

---

### #3 — `PaywallScreen` hardening bundle (HIGH × 3 + MED × 1)

**File:** `mobile/src/screens/PaywallScreen.tsx` (or current location)
**Source:** WF3 telemetry deferrals 2026-05-06 — 67 days dormant

Four bugs, one screen, one WF3 cycle per the original filing:

| Severity | Bug |
|----------|-----|
| HIGH | `handlePrimary`: `await openCheckout()` has no try/catch → unhandled rejection leaves checkout in indeterminate state |
| HIGH | `successNotification()` haptic fires on `openCheckout=true` (WebBrowser opened), not on `subscription_status='expired'→'active'` — premature per Spec 91 §4.4 |
| HIGH | `accessibilityLabel` reads "Continue subscription…" even when `CTA_NEUTRAL` flag flips copy to "Learn more →" — screen-reader contradiction |
| MED | `handleRefresh`: `queryClient.invalidateQueries` throwing leaves `isRefreshing` stuck |

**Rationale for #3:** All four target the same revenue-critical screen. The HIGH haptic bug
creates a false "payment succeeded" signal for users who close the browser without paying.
Together these degrade the subscription funnel that currently has near-zero PostHog
instrumentation (Spec 96 Subscription funnel item — separately HIGH in Active Open Items).

---

### #4 — `get-lead-feed.ts` NaN on undefined inputs + wsib INNER JOIN regression (HIGH × 3)

**File:** `src/features/leads/lib/get-lead-feed.ts`
**Source:** DeepSeek WF3 2026-05-08 — 65 days dormant

Three bugs in one file:

```
line 985: const clampedKm    = Math.min(input.radius_km, MAX_RADIUS_KM);
          // → NaN if input.radius_km undefined: Math.min(undefined, x) = NaN
          //   ST_DWithin with NaN meters silently returns false → empty feed

line 986: const clampedLimit = Math.min(Math.max(1, input.limit), MAX_FEED_LIMIT);
          // → NaN if input.limit undefined: Math.max(1, undefined) = NaN
          //   LIMIT $5::int with NaN errors at Postgres → breaks entire feed

line ~440: builder_candidates LEFT JOIN wsib_per_entity w
           WHERE w.business_size IS NOT NULL
          // → effectively INNER JOIN; drops 30–50% of builder leads
          //   (new contractors + GTA-condition failures have no wsib row)
```

_Caveat:_ Zod validation at the route handler may already prevent undefined inputs from
reaching lines 985-986. Verify at plan-lock before coding; if route handler guarantees
non-undefined, promote items to low-priority doc clarification only.

**Rationale for #4:** NaN-guard is a potential feed-outage on malformed deep-links or
future API call sites. wsib regression actively drops builder leads from the mobile feed.

---

### #5 — `lead_views` missing partial index for admin inspector (HIGH)

**File:** New migration (no existing file)
**Source:** Worktree + Gemini WF2 #4 (2026-05-08) — 65 days dormant

Migrations 069, 079, 082 created `lead_views` indexes on `(user_id, viewed)`,
`(lead_key, trade_slug, viewed)`, and `saved_at`. None cover the admin inspector's
diagnostic queries:

- `lv_count` LATERAL: filters on `lead_key` + `saved = true`
- `saved_by_admin` EXISTS: filters on `lead_key` + `saved = true` + `user_id`

Proposed migration:

```sql
CREATE INDEX CONCURRENTLY idx_lead_views_lead_key_saved
  ON lead_views (lead_key)
  INCLUDE (user_id)
  WHERE saved = true;
```

**Rationale for #5:** Simple one-migration WF3. Perf degrades silently as `lead_views` grows;
the admin inspector is a single-permit diagnostic path but could visibly slow under heavy
admin use.

---

## Proposed Sweep WFs (1–3 grouped fixes)

### Sweep A — "cost-model falsy-0" (WF3, ~1 hr)

**Scope:** `src/features/leads/lib/cost-model-shared.js` only
**Items:** 3 (lines 193, 234, 293) + LOW proportional-rounding JSDoc (line ~393)
**Estimated item count:** 4

Steps: swap `||` → `??` at lines 193 and 293; change `pct > 0` → `pct !== undefined` at
line 234; add JSDoc note on proportional rounding remainder. Run `npx vitest related
src/features/leads/lib/cost-model-shared.js --run`.

---

### Sweep B — "PaywallScreen hardening" (WF3, ~2 hr)

**Scope:** `mobile/src/screens/PaywallScreen.tsx` + Spec 96 amendments
**Items:** 4 (handlePrimary try/catch, haptic timing, accessibilityLabel, handleRefresh catch)
**Estimated item count:** 4–5 (one Spec 96 amendment row)

---

### Sweep C — "get-lead-feed correctness" (WF3, ~2–3 hr, bundled with lead_views migration)

**Scope:** `src/features/leads/lib/get-lead-feed.ts` + new migration `???_lead_views_inspector_index.sql`
**Items:** 4 (NaN limit, NaN radius, wsib INNER JOIN, lead_views index)
**Estimated item count:** 4

Pre-work: confirm route handler Zod schema prevents undefined `limit`/`radius_km`. If
confirmed, drop the NaN items from scope; the sweep becomes wsib fix + migration only.

---

## Queue Health

| Metric | Value |
|--------|-------|
| Source file size | 1,655 lines |
| Approximate open DEFER rows | ~233 |
| HIGH / CRIT items estimated | ~50 |
| MED items estimated | ~90 |
| LOW / NIT items estimated | ~90 |
| Age of oldest open item | ~74 days (WF3 Spec 93, 2026-04-30) |
| Age of newest open item | ~55 days (WF3 Spec 79 / Phase E.3, 2026-05-19) |
| Commits in last 14 days | **0** — queue idle since ≥ 2026-06-29 |
| Prior triage report | None (first run) |
| Stale items confirmed resolved | 1 (Phase E.2 item #110 — lifecycle_status_history) |

**Hygiene note:** Per §Hygiene item 3, HIGH items dormant >2 weeks should be demoted or
escalated. Every item in the queue is >50 days old with no referencing commit. The
queue is structurally healthy (items are well-documented) but execution velocity has
stalled. Recommend picking up Sweep A (cost-model) as the lowest-risk re-entry point.
Spec 93 WF3 tasks (item #2 above) have planning docs and are ready to execute immediately.

**Items not filling Top 5:** The queue is substantive — 5 actionable items were found without
padding. Dozens of additional HIGH items exist (classify-permits.js Tier 1-only
architecture, `extractPermitCode` regex, `ACTIVE_STATUSES` drift in backfill scripts,
subscription funnel PostHog gap, Spec 30 route-file interface exports, backup-db.js never
run in production). These were not selected because they either require a WF1-level
architectural decision or are lower severity per the ranking rubric.
