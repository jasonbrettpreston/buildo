# Review Queue Triage — 2026-11-02

_First triage run. No prior baseline exists — deltas will appear on the next run._

---

## 1. Stale Items (resolved since filing)

These items name specific files/functions that have since been addressed. Each is confirmed by grep evidence and should be marked CLOSED on the next pass through `review_followups.md`.

| Filed | Severity | Item | Resolution evidence |
|-------|----------|------|---------------------|
| 2026-09-15 | HIGH | **11 admin routes missing `verifyAdminAuth`** (Spec 126 §A) | All 11 now import + call `verifyAdminAuth` on first line. Grep confirms: `stats`, `rules`, `sync`, `builders`, `control-panel/configs`, `market-metrics`, `pipelines/runs`, `pipelines/status`, `pipelines/history`, `pipelines/schedules`. All verified this triage. |
| 2026-09-15 | HIGH | **Public routes serving full parcel/entity rows** (`/api/permits/[id]`, `/api/builders/[id]`) | Both routes now carry inline comment `// §4.3 explicit allow-list, never SELECT *`. Stale. |
| 2026-09-15 | MED | **`admin/stats` GET-that-writes** (`reapStaleRunningRows`) | Reaper call removed; route comment (line 15-24) documents move to scheduled job. Stale. |
| 2026-09-15 | HIGH | **`leads/watchlist` POST/DELETE no audit log** | `src/app/api/admin/leads/watchlist/route.ts:368,451` both commit `admin_audit_log` row in same txn. Stale. |
| 2026-09-15 | HIGH | **`control-panel/resync` POST no audit log** | Route references `admin_audit_log.admin_uid` at line 60. Stale. |
| 2026-09-28 (filed 2026-08-29) | HIGH | **LM-D6/LM-D11 WARN conversion not delivered** | Ruled CLOSED by Validator v2 commit `9019c3d3`; `link-massing.descriptor.json:502-526` now declares `WARN + retighten_when: "zero rows"`. Stale. |
| 2026-08-23 | HIGH | **`createPool()` localhost default** (Spec 122 §P0) | Closed same-day 2026-09-03 per file's own CLOSED annotation. Stale. |
| 2026-07-01 | LOW | **Sibling numeric ceilings use `'min'`** | Marked RESOLVED 2026-10-06 per file annotation (E1 Spec 69 R-ZV, all 9 base params now `'dominant'`). Stale. |
| 2026-08-23 | HIGH | **`max_build_dim_below_floor` live regression** | Superseded 2026-10-01 (check re-scoped; healthy run now reads PASS). Stale. |

**9 stale items confirmed.** These should be struck from `review_followups.md` on its next authoring pass.

---

## 2. Top 5 Actionable Items This Week

Ranked by: severity → unblocking count → proximity to recent commits.

### #1 — Admin audit log: 5 remaining unaudited mutations (HIGH)
**File:** `src/app/api/admin/control-panel/configs/route.ts` (PUT) · `src/app/api/admin/pipelines/[slug]/route.ts` (POST/DELETE) · `src/app/api/admin/pipelines/schedules/route.ts` (PUT/PATCH) · `src/app/api/admin/rules/route.ts` (POST/PATCH) · `src/app/api/admin/notifications/test-send/route.ts` (POST)

**Why now:** `src/lib/admin/admin-audit.ts` calls an unaudited mutation _"a compliance hole."_ `watchlist` and `resync` already have the working pattern. The remaining 5 are the same code shape — each takes less than a page to wire. The configs PUT is the highest-risk (rewrites `logic_variables` + 3 tunable tables). Unblocks any future audit-trail / SOC2-style reporting.

**Sweep home:** SWEEP-B (§4).

---

### #2 — Dead meter retirement: `useLeadView` + paywall copy (HIGH)
**Files:** `src/features/leads/api/useLeadView.ts` · `src/app/api/leads/view/route.ts` · `mobile/src/components/paywall/PaywallScreen.tsx:153`

**Why now:** Spec 128 R-08 ruled retirement months ago. `user_profiles.lead_views_count` is structurally 0; the paywall branch `leadViewsCount > 0` is unreachable in production. 44 tests pass over a meter nothing invokes. Every trial user sees the zero-state copy. No recent commits touch this code — it is genuinely idle. Retiring it removes ~200 lines of dead test coverage and fixes the paywall UX.

**Sweep home:** SWEEP-C (§4).

---

### #3 — `manifest.json` telemetry_tables omissions (MED)
**File:** `scripts/manifest.json` lines for `massing` and `enrich_parcels`

**Why now:** Two proven omissions from the 2026-09-03 cross-step ledger review: `massing` does not declare `parcel_buildings` (despite `scripts/load-massing.js:208,222` genuinely `DELETE FROM parcel_buildings`); `enrich_parcels` does not declare `enrich_parcels_pass3_scope` (despite `scripts/enrich-parcels.js:1851` genuinely `INSERT INTO enrich_parcels_pass3_scope`). Both tables are invisible to any telemetry consumer reading `telemetry_tables` as ground truth. Fix is a 2-line manifest edit with a test already in place to enforce it.

**Sweep home:** SWEEP-A (§4).

---

### #4 — False ordering lock in `chain.logic.test.ts` (MED)
**File:** `src/tests/chain.logic.test.ts:173-174`

**Why now:** `expect(slugs.indexOf('enrich_ravines')).toBe(slugs.indexOf('link_parcels') + 1)` asserts a manifest position, not a data dependency — `enrich-ravines.js` has no shared column with `link_parcels`. The two most recent commits (`31ab81f`, `b87f62d`) added `link_parcel_abutments` to the sources chain at position 24; the next insertion between `link_parcels` and `enrich_ravines` will break CI with a false failure. Needs a Guardian-owned WF3 (verify the introducing commit before removing) but is low-effort once the git blame check is done.

**Sweep home:** SWEEP-A (§4).

---

### #5 — `parcels_null_address_pct` permanently unsatisfiable WARN (MED)
**File:** `scripts/lib/parcels-csv-drift.js:27-35` · check in `load-parcels.js:508-525`

**Why now:** `ADDRESS_NUMBER` was deliberately dropped from the required CSV columns; `record.ADDRESS_NUMBER` is always empty post-drop; the gate fires 100% on every run against a `< 10%` threshold. Every single chain run produces a false WARN that operators must mentally filter. Fix is retire-or-rebase: either drop the check or rebase onto `address_points`/`parcel_address_points` bridge coverage (the documented replacement architecture).

**Sweep home:** SWEEP-A (§4).

---

## 3. Proposed Sweep WFs (1–3 grouped fixes)

### SWEEP-A: Pipeline manifest correctness
**Domain:** Backend/Pipeline · Estimated WF type: WF2

| Item | File(s) | Severity |
|------|---------|----------|
| `telemetry_tables` omissions (`parcel_buildings`, `enrich_parcels_pass3_scope`) | `scripts/manifest.json` | MED |
| `parcels_null_address_pct` permanently unsatisfiable | `scripts/lib/parcels-csv-drift.js`, `load-parcels.js` | MED |
| `massing_zero_link_ghost` comment false claim (day-one value 0 never observed) | `scripts/enrich-parcels.js:1896-1901` | MED |
| False ordering lock (`enrich_ravines` immediately after `link_parcels`) | `src/tests/chain.logic.test.ts:173-174` | MED |

**Scope:** `scripts/manifest.json`, `scripts/lib/parcels-csv-drift.js`, `scripts/enrich-parcels.js`, `src/tests/chain.logic.test.ts`. All Backend/Pipeline. Estimated 4 items → 1 WF2, 1 session.

---

### SWEEP-B: Admin audit log hardening
**Domain:** Cross-Domain (Admin UI + API routes) · Estimated WF type: WF3 with Security seat

| Item | File(s) | Severity |
|------|---------|----------|
| `control-panel/configs` PUT — no audit row | `src/app/api/admin/control-panel/configs/route.ts` | HIGH |
| `pipelines/[slug]` POST/DELETE — no audit row | `src/app/api/admin/pipelines/[slug]/route.ts` | HIGH |
| `pipelines/schedules` PUT/PATCH — no audit row | `src/app/api/admin/pipelines/schedules/route.ts` | HIGH |
| `rules` POST/PATCH — no audit row | `src/app/api/admin/rules/route.ts` | HIGH |
| `notifications/test-send` POST — no audit row | `src/app/api/admin/notifications/test-send/route.ts` | HIGH |

**Scope:** 5 route files in `src/app/api/admin/`. Pattern already established in `leads/watchlist` and `control-panel/resync`. Deliverable: all 5 write `admin_audit_log` row in the same txn; lock asserting every mutating `/api/admin/**` export audits. Estimated 1 WF3, 1 session.

---

### SWEEP-C: Dead code retirement
**Domain:** Admin + Mobile · Estimated WF type: WF3 (Cross-Domain)

| Item | File(s) | Severity |
|------|---------|----------|
| `useLeadView` retirement (Spec 128 R-08) + paywall copy fix | `src/features/leads/api/useLeadView.ts`, `src/app/api/leads/view/route.ts`, `mobile/src/components/paywall/PaywallScreen.tsx` | HIGH |
| `mobile/scripts/check-spec99-matrix.mjs` wired to nothing (Spec 126 §12 P0b) | `mobile/scripts/check-spec99-matrix.mjs`, `.husky/`, `mobile/package.json` | MED |
| Phone-path recovery email discarded (`mobile/app/(auth)/sign-up.tsx`) | `mobile/app/(auth)/sign-up.tsx` | MED |

**Scope:** Expo + admin, Cross-Domain rules apply. May split into 2 WFs (paywall/meter vs mobile-only items) depending on domain ruling. Estimated 3 items, 2 sessions.

---

## 4. Queue Health

| Metric | Value |
|--------|-------|
| Total file lines | 4,346 |
| Approximate open items (non-closed, non-stale rows) | ~95–110 estimated |
| HIGH severity open | ~12 (after stale removals) |
| MED severity open | ~35 |
| LOW severity open | ~50 |
| CRITICAL open | ~3 (Spec 62 CRIT — boolean NOT NULL DEFAULT false; mig 139 race at deploy; `lifecycle_status_history` same-second drop) |
| Stale items confirmed this triage | 9 |
| Prior triage baseline | None (first run) |

**Oldest unfiled section:** 2026-05-14 (mig 139 + migrate-to-lead-id follow-ups). Items in these sections are largely DEFERs on pre-existing patterns; no HIGH items are actionable there this week.

**Hot zone:** The 2026-09-15 Spec 126 surface research block (lines 81–124) contained the most HIGH-severity open items. 4 of the 6 §A security items are now stale; the 2 remaining open ones are the audit-log gap (SWEEP-B) and the `entities` five-columns-absent issue (not in Top 5 only because it requires confirming the builder page still renders blanks — recommend adding as a follow-up investigation to SWEEP-B).

**Next sweep priority:** SWEEP-B is the safest first pick (mechanical, proven pattern, high compliance value). SWEEP-A is the highest bang-for-effort (4 small pipeline items, no migration, no schema risk).
