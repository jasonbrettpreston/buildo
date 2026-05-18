# Review Queue Triage — 2026-05-18

_Scope: `docs/reports/review_followups.md` (1000 lines, ~250-280 open items). No prior triage file exists — this is the queue's first structured pass._

---

## Stale Items

Items where grep/git evidence shows the concern is already addressed.

### STALE-1 — `lead_analytics.lead_key` alias view not tracked (Spec 42 §6 R0 Worktree DEFER2)
> Originally: "`lead_analytics.lead_key` alias view not tracked in any migration phase."

**Evidence:** `migrations/134_extend_lead_id_consumers.sql:8-10` reads:
```
-- lead_analytics: keeps lead_key as alias through Phase G per Spec 42
-- §6.6.C R2.v3 decision. NOT a column rename — Phase C backfills lead_id
-- from existing lead_key (which already encodes the same canonical...
```
Phase C (migrations 132-144, committed `06ddb8b`→`872ec73`) resolved the tracking gap — the column is the alias and the migration documents the strategy explicitly. **Recommend dropping from active queue.**

### STALE-2 — Pre-Spec-99 Mobile Findings (✅-marked rows)
> Already annotated resolved in the file at lines 467–470.

**Evidence:** Commits `657faf8`/`be9fcff`/`98ad3df` (WF1-A), `6416262`/`0beaaf4` (WF1-C), `4e2df49`/`3d5b47f` (WF1-B) confirm resolution. These rows are already marked ✅ in the source file and need no further tracking.

### LIVE ESCALATION — Realtor `trade_sqft_rates` row (Spec 86/91/95/99 WF3 Mig 118+119)
> Filed as: "Promote to WF2 **before or with** the backfill script — should land before or with `backfill-realtor-permit-trades.js`."

**Status change:** Backfill script ran end-to-end at commit `1967733`. Realtor `permit_trades` rows now exist in production. `trade_sqft_rates` still has no realtor row (`migrations/096_surgical_valuation.sql:71` seeds 32 trades; no subsequent migration adds realtor; confirmed via grep). The cost model at `src/features/leads/lib/cost-model.ts` falls back to `base_rate_sqft = 0` on a LEFT JOIN miss → **every realtor permit now has a silent $0 cost estimate.** This was MEDIUM at filing time; it is HIGH effective immediately.

---

## Top 5 This Week

Ranked by: (a) severity, (b) items unblocked, (c) active file churn.

### #1 — ESCALATED HIGH: Realtor `trade_sqft_rates` missing row
- **Source:** Spec 86/91/95/99 WF3 Mig 118+119 section (MEDIUM at filing; now HIGH)
- **File:** Single new migration (e.g. `145_seed_realtor_trade_sqft_rates.sql`)
- **Rationale:** The gating condition ("before or with the backfill script") has already been missed — commit `1967733` landed the backfill. Every realtor permit produces a $0 cost estimate in the mobile feed and admin inspector right now. One-migration fix. Unblocks the Spec 91 realtor scoring story.
- **Planned home:** WF2 — standalone migration + infra test.

### #2 — HIGH: `get-lead-feed.ts:100` `lead_id` colon separator
- **Source:** Spec 76 WF2 Cycle 4 P5 ("pre-existing broader bug" — NOT introduced by P5)
- **File:** `src/features/leads/lib/get-lead-feed.ts:100`
- **Evidence:**
  ```sql
  (p.permit_num || ':' || LPAD(p.revision_num, 2, '0')) AS lead_id
  ```
  Mobile does `router.push(\`/(app)/[lead]?id=${item.lead_id}\`)`, then `[lead].tsx` passes the id to `parseLeadId` which expects `permit:NUM:REV` (colons, correct) — wait, confirmed format is `permit:<permit_num>:<revision_num>` per `deriveLeadId` in `src/lib/leads/lead-id.ts`. However both line 100 and line 134/250 use `permit_num || ':' ||` (no `permit:` prefix), meaning the generated `lead_id` is missing the `permit:` prefix and uses `:` not `--` as originally filed. The feed exposes a non-canonical `lead_id` shape to mobile consumers. No git commits have touched this since it was filed (confirmed via `git log --all -S`).
- **Unblocks:** Every mobile feed → detail navigation path; any future cursor-pagination adopters.
- **Planned home:** WF3 — fix feed SQL to use `'permit:' || p.permit_num || ':' || LPAD(p.revision_num, 2, '0')` matching `deriveLeadId` canonical form; add a live-DB regression test.

### #3 — HIGH: `cost-model-shared.js` triple falsy-`0` sweep
- **Source:** Gemini WF2 #3 review (3 items explicitly scoped as "one commit covers all three")
- **Files:** `src/features/leads/lib/cost-model-shared.js` (lines 193, 234, 293)
- **Evidence (all three confirmed via grep):**
  - Line 193: `row.storeys || 1` — 0-storey foundation permits get GFA inflated to 1-storey
  - Line 234: `pct !== undefined && pct > 0` — `pct === 0` scope rows fall through to full-GFA fallback
  - Line 293: `rateRow.structure_complexity_factor || 1.0` — operator-set `0` silently overridden
- **Unblocks:** Once fixed, the `modelCoveragePct` denominator item (WF3 DEFER) and the proportional-rounding note (LOW) can be batched in. Directly adjacent to the scopeMatrix `.trim()` fix (#4 below).
- **Planned home:** WF3 — `??` for storeys and complexity_factor; `!== undefined` (drop `> 0`) for pct.

### #4 — HIGH: `scopeMatrix` missing `.trim()` in `compute-cost-estimates.js`
- **Source:** Gemini WF2 (neighbourhoods FK-join commit section)
- **File:** `scripts/compute-cost-estimates.js:241-244`
- **Evidence:** Key built as `` `${r.permit_type.toLowerCase()}::${r.structure_type.toLowerCase()}` `` — no `.trim()`. Spec 83 §3 explicitly mandates `.toLowerCase().trim()`. Trailing whitespace in a `scope_intensity_matrix` row silently misses the matrix → GFA fallback → cost inflation (the exact inflation vector WF2 #3 gated against).
- **Bundle opportunity:** Fold into WF3 sweep alongside #3 (same file family, same WF3 cost-model scope).

### #5 — HIGH: Spec 93 WF3 batch (filed planning notes, ready to execute)
- **Source:** `chore(93_mobile_auth)` commit `ff1a8f6` (2026-05-15 — 3 days ago)
- **Files:** `.cursor/deferred_task_spec93_authstate_reset_placement.md` · `.cursor/deferred_task_spec93_backup_email_persistence.md` · `.cursor/deferred_task_spec93_sentry_v8_upgrade.md`
- **Rationale:** All three planning notes exist on disk, explicitly authored for "pick up via `WF3` in a future session." WF3-B (auth-state reset leaks PII data on forced sign-out) and WF3-C (Sentry v7→v8 required for RN 0.81 + New Architecture) are the highest-severity of the three. These are the only items in the queue with pre-written scaffolding — lowest activation energy.
- **Planned home:** WF3 — three sequential tasks from the planning notes.

---

## Proposed Sweep WFs (1–3 grouped fixes)

### Sweep A — WF3: Cost-Model Precision Fix
| Item | File | LoC |
|------|------|-----|
| `storeys \|\| 1` → `?? 1` | `cost-model-shared.js:193` | 1 |
| `pct > 0` → drop `> 0` guard | `cost-model-shared.js:234` | 1 |
| `complexity_factor \|\| 1.0` → `?? 1.0` | `cost-model-shared.js:293` | 1 |
| `.toLowerCase()` → `.toLowerCase().trim()` | `compute-cost-estimates.js:241,243` | 2 |

**Scope:** 2 files, ~5 LoC changes, 4 queue items closed. No migration. Tests: extend `cost-model-shared.logic.test.ts` with zero-storey and zero-pct fixtures. Estimated: WF3, half-session.

### Sweep B — WF3: Lead Feed Correctness Bundle
| Item | File | Severity |
|------|------|----------|
| `lead_id` missing `permit:` prefix | `get-lead-feed.ts:100` | HIGH |
| `clampedKm = NaN` when `radius_km` undefined | `get-lead-feed.ts:740` | HIGH |
| `clampedLimit = NaN` when `limit` undefined | `get-lead-feed.ts:741` | HIGH |
| `wsib LEFT JOIN` acts as INNER (drops 30–50% builder leads) | `get-lead-feed.ts` | HIGH |
| Cursor pagination `NULL` → empty page (feed exhausted) | `get-lead-feed.ts` | MED |

**Scope:** 1 file, 5 queue items. Requires a live-DB regression test companion (`get-lead-feed.db.test.ts`). High user-visible impact — Maestro E2E lead-feed flow currently running against broken `lead_id` shape. Estimated: WF3, 1 session.

### Sweep C — WF2: Admin-Route + Classifier Hygiene
| Item | File | Severity |
|------|------|----------|
| TS interfaces exported from route file (lines 15, 26) | `src/app/api/admin/pipelines/history/route.ts` | LOW |
| Dead `tier === 3` ReDoS branch | `src/lib/classification/classifier.ts:39` | HIGH (security) |
| `lead_views` composite index for admin diagnostic | New migration | HIGH (perf) |

**Scope:** 3 files + 1 migration. The classifier dead-branch is a security item (user-supplied regex in a dead code path — ReDoS vector if Tier 3 ever activates). Move TS interfaces to `types.ts` (5 LoC). Drop dead branch (3 LoC). Add `CREATE INDEX CONCURRENTLY idx_lead_views_lead_key_saved ON lead_views (lead_key) INCLUDE (user_id) WHERE saved = true`. Estimated: WF2, half-session.

---

## Queue Health

| Dimension | Count |
|-----------|-------|
| Total open items (estimated) | ~260 |
| HIGH | ~38 |
| MED | ~105 |
| LOW | ~87 |
| NIT | ~30 |
| **Prior triage** | None — first run |

**Age distribution:**
- Filed 2026-05-13 (Phase B/C migration reviews, items #1–55): ~55 items — all correctly deferred to Phase D/E/H. Not actionable until those phases open.
- Filed 2026-05-09 to 2026-05-11 (WF1 #B/C, WF2 #2/#3, WF3 realtor/massing/neighbours): ~80 items — bulk of actionable backlog. Items #1–5 above come from this band.
- Filed 2026-05-06 to 2026-05-08 (Spec 30/76/91/95 cycles, pre-Spec-99 mobile): ~100 items — mix of real gaps and correctly-deferred design decisions.
- Filed pre-2026-05-05: Resolved historical index; no open items.

**Concentration risk:** The Spec 42 CoA pipeline Phase D/E/H deferrals (~55 items, all LOW-MED) will flood the actionable list once Phase D opens. Recommend a dedicated Phase-D triage pass before that WF1 starts to separate "blocked on data" from "ready to implement."

**Recommended next triage:** 2026-05-25. Expected delta: Sweep A + Sweep B completion (~9 items resolved, first-ever delta).

---

_Triage run: 2026-05-18. Source file: `docs/reports/review_followups.md` (1000 lines). Grep commands run against HEAD `ff1a8f6`. No items in `review_followups.md` were modified._
