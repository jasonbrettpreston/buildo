# Active Task: WF2 §9.16 — Codify Bridge B6 (migrate radius_km local-set callers to B3) + add §9.14 deferred items to review_followups.md
**Status:** Implementation (authorized 2026-05-04)
**Workflow:** WF2 — Mobile + docs
**Domain Mode:** Admin (mobile)
**Rollback Anchor:** `656e985`

## Context
* **Goal:** Close the last open Spec 99 §9 backlog item. §9.16 was "Codify or ban Bridge B6 (LeadFilterSheet/settings PATCH+local-set without B3 ceremony)." The grep finds 4 call sites that do `setRadiusKm(...)` with NO server PATCH — `radius_km` is server-canonical per Spec 99 §3.1, so every change is lost on cold boot and silently drifts on shared devices. Decision: **migrate to canonical B3** (the Spec 99 §4.B3 pattern already documented). No new "B6" pattern is added — the existing partial implementation was a bug, not a deliberate design. Also: capture the §9.14 adversarial-review deferred items in `docs/reports/review_followups.md` so they don't get lost in commit log search.
* **Target Spec:** `docs/specs/03-mobile/99_mobile_state_architecture.md` §9.16 (P2 backlog row) + §4.B3 (the canonical pattern this migrates to)
* **Cross-Spec Dependencies:** none (server `/api/user-profile` PATCH already accepts `radius_km`)
* **Key Files:**
  - `mobile/src/hooks/usePatchProfile.ts` (NEW) — B3 mutation hook for `radius_km` (designed to extend to other server-canonical filterStore fields in future)
  - `mobile/app/(app)/index.tsx:149,193` — widen-radius callers
  - `mobile/app/(app)/settings.tsx:186` — settings slider
  - `mobile/src/components/feed/LeadFilterSheet.tsx:66` — filter sheet radius presets
  - `mobile/__tests__/usePatchProfile.test.ts` (NEW)
  - `docs/specs/03-mobile/99_mobile_state_architecture.md` — §9.16 row → ✅ DONE, §3.4 entry for radius B3 wiring
  - `docs/reports/review_followups.md` — append §9.14 deferred items (~12 entries)

## Technical Implementation
* **`usePatchProfile` hook shape:**
  ```ts
  export function usePatchProfile() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (patch: Partial<{ radius_km: number; ... }>) =>
        fetchWithAuth('/api/user-profile', { method: 'PATCH', body: JSON.stringify(patch) }),
      onMutate: async (patch) => {
        // Cancel in-flight profile refetches so they cannot overwrite the optimistic local set.
        await queryClient.cancelQueries({ queryKey: ['user-profile'] });
        const prevRadius = useFilterStore.getState().radiusKm;
        if (patch.radius_km !== undefined) useFilterStore.getState().setRadiusKm(patch.radius_km);
        return { prevRadius };
      },
      onError: (_err, _patch, ctx) => {
        if (ctx?.prevRadius !== undefined) useFilterStore.getState().setRadiusKm(ctx.prevRadius);
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: ['user-profile'] }),
    });
  }
  ```
* **Caller migration** — three sites:
  - `(app)/index.tsx` widen handler: `mutate({ radius_km: Math.min(radiusKm * 2, 50) })`
  - `(app)/settings.tsx` slider `onSlidingComplete`: `mutate({ radius_km: val })`
  - `LeadFilterSheet.tsx` preset onPress: `mutate({ radius_km: km })`
* **Database Impact:** NO. `/api/user-profile` PATCH already accepts `radius_km`; the route applies the admin `radius_cap_km` cap in-place. No migration needed.
* **§9.13 drift impact:** None — no schema changes.

## Standards Compliance
* **Try-Catch Boundary:** TanStack mutation's `onError` handles the rollback path; `fetchWithAuth` already throws typed errors (ApiError for 4xx/5xx) which the mutation catches. No new manual try/catch needed.
* **Unhappy Path Tests:** `usePatchProfile.test.ts` covers: (a) optimistic local set fires before server, (b) rollback on `mutationFn` rejection restores prior radius, (c) `onSettled` triggers `invalidateQueries(['user-profile'])`, (d) concurrent in-flight refetch is cancelled (`cancelQueries` called in `onMutate`).
* **logError Mandate:** N/A — no new catch blocks.
* **UI Layout:** No layout changes; only changes the click handler wiring.

## Execution Plan

**Phase A — `usePatchProfile` hook + tests (commit 1)**
- [ ] A1. Create `mobile/src/hooks/usePatchProfile.ts` with the B3 mutation shape above.
- [ ] A2. Create `mobile/__tests__/usePatchProfile.test.ts` covering 4 cases (optimistic, rollback, invalidate, cancel).
- [ ] A3. Run mobile typecheck + suite. Expect all green.
- [ ] A4. **Commit 1:** `feat(99_mobile_state_architecture): WF2 §9.16 Phase A — add usePatchProfile B3 hook`.

**Phase B — Migrate 3 call sites + Spec 99 amendments (commit 2)**
- [ ] B1. Replace `setRadiusKm(...)` with `mutate({ radius_km: ... })` in `(app)/index.tsx` (2 sites at lines 149 + 193).
- [ ] B2. Replace `setRadiusKm(val)` in `(app)/settings.tsx:186` with `mutate({ radius_km: val })`. Drop the now-unused `setRadiusKm` selector.
- [ ] B3. Replace `setRadiusKm(km)` in `LeadFilterSheet.tsx:66` with `mutate({ radius_km: km })`. Drop the now-unused `setRadiusKm` selector.
- [ ] B4. Update Spec 99 §9.16 backlog row → ✅ DONE.
- [ ] B5. Update Spec 99 §3.4 (or §4.B3 if cleaner) to add `radius_km` as a documented B3-using field, noting `usePatchProfile` is the canonical writer.
- [ ] B6. Mobile typecheck + suite + drift script.
- [ ] B7. **Commit 2:** `feat(99_mobile_state_architecture): WF2 §9.16 Phase B — migrate radius_km callers to B3`.

**Phase C — Append §9.14 deferred items to review_followups.md (commit 3)**
- [ ] C1. Append a new section `## WF2 §9.14 Phase D — Deferred items (2026-05-04)` to `docs/reports/review_followups.md` covering the ~12 items captured in commit `656e985`'s message.
- [ ] C2. **Commit 3:** `docs(reports): append WF2 §9.14 deferred items to review_followups.md`.

**Phase D — Adversarial review (commit 4, optional given small surface)**
- [ ] D1. Spawn adversarial trio (Gemini + DeepSeek + code-reviewer) on the range `656e985..HEAD-after-Phase-C`. Use **non-worktree** isolation (the worktree pool is stuck at `7dfe1a1` per the §9.14 D-phase debugging).
- [ ] D2. Apply CRITICAL/HIGH inline. Defer LOW/NIT to followups.
- [ ] D3. **Commit 4:** `fix(99_mobile_state_architecture): WF2 §9.16 — adversarial trio review amendments`.

## Out of Scope
- Onboarding-flow setters (`address.tsx`, `profession.tsx`, `supplier.tsx` call `setHomeBaseLocation` / `setLocationMode` / `setTradeSlug` / `setSupplierSelection` without the B3 ceremony). These are part of the multi-screen onboarding flow that PATCHes once at `complete.tsx`; structurally different from the single-field-edit pattern in settings/feed. File as separate WF if the onboarding PATCH path proves to also be lossy.
- The other §9.14 deferred items (settings `localRadius` stale snapshot, sign-out toast missing, schema validation gaps, etc.) — captured in C1 but not implemented here.
- §9.13 server↔mobile schema drift detection — pre-existing gap (DeepSeek WF2 §9.14 finding); separate WF.

> **PLAN LOCKED. Do you authorize this WF2 Admin (mobile) plan? (y/n)**
> §10 note: small-surface follow-up; adversarial review (Phase D) gated on user preference — small scope may not warrant the trio, recommendation is to run only the code-reviewer for a faster cycle.
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
