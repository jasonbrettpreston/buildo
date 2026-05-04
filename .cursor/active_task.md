# Active Task: WF3 Top-6 Follow-up — Cursor Backward-Compat + PII MMKV Strip
**Status:** Implementation (authorized 2026-05-04)
**Workflow:** WF3 — bug-fix follow-up to the top-6 sweep
**Domain Mode:** Cross-Domain (server cursor SQL + mobile persister config)
**Rollback Anchor:** `39c9ec3`

## Context
Two items deferred from the Phase 7 adversarial review on the original WF3 top-6 sweep, both now ripe for a focused follow-up:

1. **Phase 6 cursor wire-format break** — Phase 6 (`fefc2a3`) changed the builder `lead_id` projection from `e.id::text` to `LPAD(e.id::text, 20, '0')`. At the deploy moment, mobile clients holding pre-deploy cursors (`lead_id="9"`) compare against post-deploy server-emitted `"00000000000000000009"`. Lex order: `"00000000000000000009" < "9"` is TRUE → cursor pages through ALL builders again from the top → duplicate rows in the user's feed. Real one-time bug at every deploy.

2. **Mobile MMKV PII scope** — `mobile/src/lib/userProfile.schema.ts` still includes `full_name`, `phone_number`, `company_name`, `email`, `backup_email`. Verified: `mmkvPersister.ts:11` creates the MMKV instance with NO `encryptionKey` — the user-profile query's TanStack persisted blob lands on unencrypted disk. Direct Spec 99 §2.1 violation (Layer 4a is unencrypted; PII MUST go to Layer 4b).

## Technical Implementation

### Item 1 — Cursor backward-compat (small, safe)

The cursor comparison in `LEAD_FEED_SQL` is currently:
```sql
($6::int IS NULL OR (relevance_score, lead_type, lead_id) < ($6, $7, $8))
```

Pre-deploy clients send `lead_id="9"` (bare int as text). Post-deploy server emits `lead_id="00000000000000000009"`. The comparison is broken across the deploy boundary.

Fix: when the cursor's `lead_type` is `'builder'`, server-side LPAD the incoming `$8` to 20 chars before comparing. New shape:
```sql
($6::int IS NULL OR
  (relevance_score, lead_type, lead_id) <
  ($6, $7, CASE WHEN $7 = 'builder' THEN LPAD($8, 20, '0') ELSE $8 END))
```

Effect:
- Pre-deploy client with `lead_id="9"` → server LPAD's to `"00...09"` → compares correctly against post-deploy projection → no duplicates
- Post-deploy client with `lead_id="00...09"` → LPAD on already-padded value is a no-op → still compares correctly
- Permit cursors (`lead_type='permit'`) are untouched — bypass the CASE entirely

Cost: 1 SQL line + 1 regression test. No cursor-format change required on the client side. No deploy migration needed.

### Item 2 — PII MMKV strip via `shouldDehydrateQuery`

Strategy: add `dehydrateOptions.shouldDehydrateQuery` to `PersistQueryClientProvider` in `mobile/app/_layout.tsx:392-400`. Filter out the `['user-profile']` query from the dehydrated/persisted blob. The query stays in-memory normally (cold-boot fetches it from server as the canonical source), but never lands on disk.

Justification for excluding the entire user-profile query rather than per-field stripping:
- The 5 PII fields ARE the bulk of the user-profile payload's value
- Per-field stripping requires custom dehydrate logic that TanStack's persister doesn't natively support without a custom serializer
- The non-PII fields (subscription_status, lead_views_count, notification prefs) are server-canonical and re-fetchable at zero ergonomic cost (~50ms)
- Other queries with public data (`['lead-feed']`, `['flight-board']`) continue to persist normally

Side effects to verify:
- AuthGate's cold-boot path: existing `profileLoading && !profile` guard already handles the no-cached-profile case (the `splash-with-spinner` state). No new behavior.
- Settings screen's first render after cold boot: `useUserProfile()` returns `{ data: undefined, isLoading: true }` for ~50-200ms while the fetch resolves. Existing skeleton components cover this.
- `NotificationHandlers`: reads `notification_prefs` via the same query → same brief no-data window, no UI impact (the handler doesn't render, it just registers listeners).

Cost: ~5 lines in `_layout.tsx` + 1 regression test asserting the dehydrate filter excludes `['user-profile']`. No schema change.

## Standards Compliance
* **Try-Catch Boundary:** N/A — no new error paths.
* **Unhappy Path Tests:** Item 1 — behavioral test that a pre-deploy bare-int cursor (`lead_id="9"`) correctly paginates to the next builder page after deploy (asserts the SQL WHERE includes the CASE-LPAD). Item 2 — assert `shouldDehydrateQuery` returns `false` for `['user-profile']` and `true` for `['lead-feed']`.
* **logError Mandate:** N/A.
* **UI Layout:** N/A.
* **§9.13 drift impact:** None — no schema changes.

## Execution Plan

**Phase 1 — Cursor backward-compat (commit 1)**
- [ ] 1a. Locate the cursor comparison in `src/features/leads/lib/get-lead-feed.ts` (around line 460–465 per the existing diff).
- [ ] 1b. Wrap the `$8` placeholder in a `CASE WHEN $7 = 'builder' THEN LPAD($8, 20, '0') ELSE $8 END` expression.
- [ ] 1c. Add a regression test in `src/tests/get-lead-feed.logic.test.ts` asserting the cursor comparison contains the CASE+LPAD pattern.
- [ ] 1d. Pre-commit gate.
- [ ] 1e. **Commit 1:** `fix(70_lead_feed): WF3 cursor backward-compat — accept pre-deploy bare-int builder lead_ids`

**Phase 2 — PII MMKV strip (commit 2)**
- [ ] 2a. Update `mobile/app/_layout.tsx` `PersistQueryClientProvider` `persistOptions` to include `dehydrateOptions: { shouldDehydrateQuery: (q) => q.queryKey[0] !== 'user-profile' }`.
- [ ] 2b. Add a regression test in `mobile/__tests__` (or extend existing `bridges.test.ts`) asserting the filter excludes user-profile and includes lead-feed.
- [ ] 2c. Update Spec 99 §2.1 (in-line note) documenting that user-profile is excluded from MMKV persistence per WF3 hardening.
- [ ] 2d. Run mobile suite + drift script.
- [ ] 2e. **Commit 2:** `fix(99_mobile_state_architecture): WF3 strip user-profile from MMKV persister to comply with §2.1 PII layer boundary`

**Phase 3 — Adversarial review (single reviewer for this small surface)**
- [ ] 3a. Spawn `feature-dev:code-reviewer` non-isolated on the range `39c9ec3..HEAD`. Single reviewer for the small surface; trio is overkill.
- [ ] 3b. Apply CRITICAL/HIGH inline.
- [ ] 3c. **Commit 3 (if amendments):** `fix(99_mobile_state_architecture): WF3 cursor + PII followup — code-reviewer amendments`

**Phase 4 — Update review_followups.md**
- [ ] 4a. Update the existing WF3 sweep header to mark these two items RESOLVED (they're currently listed as "deferred from Phase 7").
- [ ] 4b. **Commit 4:** `docs(99_mobile_state_architecture): mark WF3 cursor + PII followup items resolved in review_followups.md`

## Out of Scope
- Encrypted MMKV via `encryptionKey` (Option B from the analysis). Bigger lift, requires Keychain key generation/storage flow and key-rotation policy. The `shouldDehydrateQuery` filter eliminates the immediate PII-on-disk risk; encryption can be a future hardening.
- Per-field PII stripping (would require custom serializer in the persister). The whole-query exclusion is simpler and the non-PII fields in user-profile are server-canonical anyway.
- Spec 99 §2.1 amendment + CISO sign-off framework — out of scope for this code-only WF3.

> **PLAN LOCKED. Do you authorize this WF3 follow-up plan? (y/n)**
>
> §10 note: 4 commits, ~30 lines of code + ~30 lines of test + 1 spec note. Surface is small enough that I'm recommending a SINGLE reviewer (code-reviewer agent) instead of the full trio for Phase 3.
>
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
