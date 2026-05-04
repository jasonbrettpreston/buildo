# Active Task: WF2 §9.14 — Flatten `notification_prefs` JSONB → 5 atomic columns
**Status:** Implementation (authorized 2026-05-04)
**Workflow:** WF2 — Cross-Domain refactor
**Domain Mode:** Cross-Domain (DB migration + server API + mobile schema + mobile UI + pipeline script)
**Rollback Anchor:** `87a0f84`

## Context
* **Goal:** Eliminate the JSONB `notification_prefs` indirection on `user_profiles`. Replace one JSONB column with 5 sibling columns (3 booleans + 2 enums). On the mobile side this kills the `fast-deep-equal` hot path in `userProfileStore.hydrate()`: equality on object identity vs deep-walk per Spec 99 §6.6. On the server side the JSONB merge syntax disappears in favor of standard column UPDATEs.
* **Target Spec:** `docs/specs/03-mobile/99_mobile_state_architecture.md` §9.14 (P2 backlog row)
* **Cross-Spec Dependencies:**
  - `docs/specs/03-mobile/92_mobile_engagement_hardware.md` §2.3 — describes the JSONB shape
  - `docs/specs/03-mobile/95_mobile_user_profiles.md` §6 — field list
  - Migration 108 `notification_prefs.sql` — original creation (will be reversed)
* **Key Files:**
  - DB: `migrations/117_notification_prefs_flatten.sql` (NEW)
  - Server schema: `src/lib/userProfile.schema.ts`
  - Server API: `src/app/api/user-profile/route.ts`, `src/app/api/notifications/preferences/route.ts`
  - Pipeline: `scripts/classify-lifecycle-phase.js`
  - Mobile schema: `mobile/src/lib/userProfile.schema.ts`
  - Mobile store: `mobile/src/store/userProfileStore.ts`
  - Mobile UI: `mobile/app/(app)/settings.tsx`
  - Mobile tests: `mobile/__tests__/{storeIdempotency,bridges,authGate,filterStore}.test.ts`
  - Drift script: `mobile/scripts/check-spec99-matrix.mjs` (no code change; spec must update so it stays at 0 drift)

## Technical Implementation
* **Schema change (5 columns to add + 1 to drop):**
  ```
  new_lead_min_cost_tier  TEXT CHECK (... 'low','medium','high' ...)  DEFAULT 'medium'  NOT NULL
  phase_changed           BOOLEAN  DEFAULT TRUE  NOT NULL
  lifecycle_stalled_pref  BOOLEAN  DEFAULT TRUE  NOT NULL  (suffix `_pref` to avoid collision with `permits.lifecycle_stalled`)
  start_date_urgent       BOOLEAN  DEFAULT TRUE  NOT NULL
  notification_schedule   TEXT CHECK (... 'morning','anytime','evening' ...)  DEFAULT 'anytime'  NOT NULL
  ```
  Then BACKFILL from `notification_prefs` JSONB, then DROP `notification_prefs` column.
* **Naming note:** `lifecycle_stalled` already exists on the `permits` table (different semantic — a derived classification). To avoid silent ambiguity in pipeline SELECTs that join `permits` with `user_profiles`, the user-pref column is named `lifecycle_stalled_pref`. The mobile-side store field stays `lifecycleStalled` (no collision in the mobile bundle).
* **Database Impact:** YES.
  - `user_profiles` row count is small (one row per user, < 10K projected). Single-statement `ALTER TABLE ADD COLUMN ... DEFAULT ...` is safe at this scale.
  - DROP COLUMN at the end is destructive — `-- ALLOW-DESTRUCTIVE` marker required.
  - DOWN block commented out per project convention.

## Standards Compliance
* **Try-Catch Boundary:** Both API routes already wrap handler bodies in try/catch with `logError(...)` — no new boundaries introduced. Pipeline script uses pipeline SDK error handling; no changes.
* **Unhappy Path Tests:** Migration backfill verified by a SQL reproducer (`scripts/quality/notification_prefs_flatten_reproducer.sql`) that asserts every row's old JSONB matches the new column values. Mobile tests cover: hydrate idempotency on equal payload (each of 5 fields), hydrate on changed primitive (each field independently triggers re-render), persist-migrate v1→v2 dropping legacy `notificationPrefs` blob from MMKV.
* **logError Mandate:** N/A — no new catch blocks; existing call sites already comply.
* **UI Layout:** Mobile-first (Expo) — settings screen already uses NativeWind; just changing prop bindings, no layout restructuring.
* **§9.13 drift impact:** Spec 99 §3.1 must add 5 rows + remove the `notification_prefs` row in the same WF, otherwise the drift script (committed in this branch) will fail.

## Execution Plan

**Phase A — DB + server (commit 1)**
- [ ] A1. Write migration `117_notification_prefs_flatten.sql`: ADD 5 columns with defaults, BACKFILL from JSONB (`(notification_prefs ->> 'phase_changed')::boolean`-style with COALESCE-to-default), then `-- ALLOW-DESTRUCTIVE` DROP `notification_prefs`. Forward-only (DOWN commented).
- [ ] A2. Run `npm run migrate` against local Cloud SQL to verify the migration applies cleanly.
- [ ] A3. Write `scripts/quality/notification_prefs_flatten_reproducer.sql` as a one-shot data-integrity check (run BEFORE migration, capture old JSONB; run AFTER, compare).
- [ ] A4. Update `src/lib/userProfile.schema.ts`: replace `notification_prefs: z.object({...})` with 5 sibling fields. The Zod field `lifecycleStalledPref` maps to DB `lifecycle_stalled_pref`.
- [ ] A5. Update `src/app/api/user-profile/route.ts:254-258`: replace JSONB merge clause with 5 individual `addField()` calls.
- [ ] A6. Rewrite `src/app/api/notifications/preferences/route.ts`: GET selects 5 columns directly; PATCH builds individual SET clauses. Reconcile cost-tier enum to `['low','medium','high']` (the canonical Spec 95 values) — the `small/medium/large/major/mega` enum only ever appeared in this one route and matches no other consumer. In-scope drift fix.
- [ ] A7. Update `scripts/classify-lifecycle-phase.js`: 3 SELECT statements + 3 dispatch sites switched from `prefs.<key>` to direct row column access.
- [ ] A8. Update 6 web-side test files (fixtures + assertions on the new flat shape):
  - `src/tests/api.infra.test.ts`
  - `src/tests/classify-lifecycle-phase.infra.test.ts`
  - `src/tests/notifications.infra.test.ts`
  - `src/tests/user-profiles-schema.infra.test.ts`
  - `src/tests/user-profiles.infra.test.ts`
  - `src/tests/user-profiles.security.test.ts`
- [ ] A9. Run `npm run typecheck && npm run lint && npm run test` (root pre-commit gates pass).
- [ ] A10. **Commit 1:** `feat(99_mobile_state_architecture): WF2 §9.14 Phase A — flatten notification_prefs (server + DB)`.

**Phase B — Mobile (commit 2)**
- [ ] B1. Update `mobile/src/lib/userProfile.schema.ts`: same flat structure as server.
- [ ] B2. Update `mobile/src/store/userProfileStore.ts`:
  - Replace `notificationPrefs: Record<string, unknown> | null` with 5 atomic fields (3 booleans + 2 enum strings).
  - Drop `fast-deep-equal/es6` import — no longer needed (5 primitives compare via `Object.is`).
  - Update `INITIAL_STATE` and `hydrate()`.
  - Bump persist `version` from current → next; write `migrate` function that reads the old `notificationPrefs` blob (if present) and projects into the 5 new fields, then deletes the legacy key.
- [ ] B3. Update `mobile/app/(app)/settings.tsx`: read 5 atomic selectors instead of one object selector; PATCH sends 5 fields.
- [ ] B4. Update mobile tests:
  - `storeIdempotency.test.ts` — add 5 idempotency cases (one per field) replacing the 1 deep-equal-object case.
  - `bridges.test.ts` — update sample profile fixture.
  - `authGate.test.ts` — fixtures use flat shape.
  - `filterStore.test.ts` — fixtures use flat shape.
- [ ] B5. Re-run `mobile/scripts/check-spec99-matrix.mjs` — expect drift initially because §3.1 hasn't been updated yet (intentional — fixed in Phase C).
- [ ] B6. Run mobile typecheck + suite.
- [ ] B7. **Commit 2:** `feat(99_mobile_state_architecture): WF2 §9.14 Phase B — flatten notification_prefs (mobile)`.

**Phase C — Specs + drift script (commit 3)**
- [ ] C1. Update Spec 99 §3.1: drop the `notification_prefs` JSONB row, add 5 atomic rows (all 5 owned by `userProfileStore`).
- [ ] C2. Update Spec 99 §6.6 deep-equal mandate: prepend a callout that flat primitive fields use `Object.is` and the §6.6 mandate now applies only if a future composite field is reintroduced (effectively retired for current state). Update §B5 hydrate example to show the new flat shape.
- [ ] C3. Update Spec 99 §9 backlog row 9.14 to ✅ DONE with implementation summary.
- [ ] C4. Update Spec 92 §2.3 and Spec 95 §6 — schema description aligned to flat fields.
- [ ] C5. Run `node mobile/scripts/check-spec99-matrix.mjs` — expect 0 drift.
- [ ] C6. **Commit 3:** `docs(99_mobile_state_architecture): WF2 §9.14 Phase C — spec amendments + drift verification`.

**Phase D — Adversarial review (commit 4)**
- [ ] D1. Spawn 3 reviewers in parallel worktrees on the range `Phase A..Phase C`:
  - Gemini via `npm run review:gemini` per modified file.
  - DeepSeek via `npm run review:deepseek` per modified file.
  - `feature-dev:code-reviewer` agent on the same range.
- [ ] D2. Consolidate findings — surface CRITICAL/HIGH only; cross-validate (drop single-reviewer hallucinations).
- [ ] D3. Apply inline fixes.
- [ ] D4. Re-run typecheck + full mobile suite + drift script.
- [ ] D5. **Commit 4:** `fix(99_mobile_state_architecture): WF2 §9.14 — adversarial trio review amendments`.

## Out of Scope (file as separate WFs if confirmed)
- §9.16 (Bridge B6 codify) — separate WF1.
- Storage of the legacy `notification_prefs` JSONB column for archival purposes — explicitly NOT preserved per "scope discipline" (a stale JSONB next to 5 fresh columns would re-create exactly the dual-source-of-truth class Spec 99 was written to prevent).

> **PLAN LOCKED. Do you authorize this WF2 Cross-Domain plan? (y/n)**
> §10 note: cross-spec dependencies on Spec 92 + 95 + 99 surfaced and addressed in Phase C; cost-tier enum drift fix at A6 is in-scope because the divergent enum existed only in one route with no other consumers.
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
