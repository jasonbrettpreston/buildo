# WF5 Audit — `docs/specs/03-mobile/` Specs ↔ Code ↔ Tests

**Date:** 2026-05-06
**Audit anchor:** `ebfcf4d` (HEAD)
**Method:** 3 parallel Explore agents + verification pass against current HEAD before treating findings as actionable (per `review_followups.md` Adversarial Pattern Notes verification protocol).
**Scope:** 11 mobile specs (3,785 LoC); `mobile/src/` + `mobile/app/` + `mobile/__tests__/`; cross-references into `src/lib/leads/` + `src/features/leads/lib/` for backend-side claims.

---

## Executive Summary

| Dimension | Findings | Severity-rolled |
|---|---|---|
| **Dimension 1 — Spec 99 permeation** | 8 actionable items (incl. 1 HIGH spec-vs-spec contradiction across 3 files) | 1 HIGH · 4 MEDIUM · 3 LOW |
| **Dimension 2 — Spec ↔ code drift** | 38 anchor claims; 33 PASS, 3 PARTIAL, 2 FAIL (after verification 1 FAIL flipped to PASS) | 1 FAIL (HIGH) · 1 FAIL (MEDIUM) · 3 PARTIAL |
| **Dimension 3 — Test ↔ spec gap** | 27 invariants audited; 17 TEST_EXISTS, 2 TEST_PARTIAL, 0 TEST_MISSING at §8 mandate level. Top-10 gap list at sub-§8 layer. | 2 CRITICAL · 4 HIGH · 4 MEDIUM |

**Top 5 actionable items (severity-prioritized):**

1. **HIGH (spec-vs-spec drift):** `paywallStore.clear()` named in Specs 93, 96, 98 — but Spec 99 §3.4 (canonical) renamed the method to `.reset()` on 2026-05-03 (commits `dd638c2`/`d032621` era). **Code uses `.reset()`** (verified `mobile/src/store/authStore.ts:96`). The three downstream specs are the stale side. → **WF2 doc-only spec sync** (3 single-line edits + cite §9.19 for the rename).
2. **CRITICAL (test gap):** Spec 99 §B6 mid-session 401 refresh interceptor lacks a live-HTTP test; only structural test in `bridges.test.ts`. Regression risk: token refresh silently breaks at the 1-hour token expiry mark, no test catches it. → **WF3** add test case to `apiClient.test.ts`.
3. **MEDIUM (spec ↔ code FAIL):** Spec 90 §12 mandates `FlashList estimatedItemSize`. Verified: zero `estimatedItemSize` usages in `mobile/` source (only `.cursorrules` and `node_modules` mention it). 60fps scroll on the lead feed at scale is at risk. → **WF3 single-line addition** to both `index.tsx` and `flight-board.tsx`.
4. **MEDIUM (spec ↔ code FAIL):** Spec 95 §5 lists `phone_number` as a Settings-editable field with OTP re-verification. Verified: `mobile/app/(app)/settings.tsx` contains zero `phone`/`otp`/`verify` matches. Either the spec promise is unimplemented OR the spec should be amended to mark it as out-of-scope. → **WF1** if implementing OR **WF2 doc-only** to scope-mark.
5. **HIGH (spec ↔ spec drift, Spec 92):** Spec 92 §4.4 still contains the stale "60-second window" wording even after the 2026-05-06 supersession to Spec 77 §3.2's MMKV-last-seen contract. → **WF2 doc-only** delete the legacy paragraph; cross-link to Spec 77 §3.2.

**Spec 47 (pipeline script protocol) applicability to mobile specs:** confirmed N/A across the entire mobile spec set; the audit found no places where Spec 47 §6.4 or §7 would re-engage. Out of audit scope per design.

---

## Dimension 1 — Spec 99 Permeation Audit

**Reference density (cross-references to Spec 99 anchors `§B[1-6]`, `§3.[1-5]`, `§6.[1-7]`, `§7.[1-4]`, `§8.[1-5]`):**

| Spec | Refs | Health |
|---|---:|---|
| 95 (User Profiles) | 8 | ✅ STRONG — exemplar permeation |
| 93 (Auth) | 5 | ⚠️ has the `.clear()` drift below |
| 94 (Onboarding) | 4 | ✅ healthy |
| 92 (Engagement) | 3 | ⚠️ stale §4.4 wording (see Finding 1.5) |
| 97 (Settings) | 3 | ✅ healthy |
| 77 (Flight Board) | 2 | ✅ healthy (post WF1-C amendment) |
| 96 (Subscription) | 1 | ⚠️ has the `.clear()` drift |
| 90 (Engineering Protocol) | 1 | ✅ healthy (treats Spec 99 as authority) |
| 91 (Lead Feed) | 0 | ⚠️ should cite §B1 + §B3 |
| 98 (Testing Protocol) | 0 | ⚠️ should cite §8.1–§8.5 mandates |

### Findings

**1.1 — HIGH spec-vs-spec contradiction: `paywallStore.clear()` vs `.reset()`**

- Spec 99 §3.4 (canonical, line 143): `reset()` (renamed from `clear()` on 2026-05-03 for §B5 naming uniformity).
- Spec 93 §3.4 line 332-333: `paywallStore.clear()`.
- Spec 96 §9 lines 224, 253, 260: `paywallStore.clear()`.
- Spec 98 §4.1 line 86: `paywallStore.clear()`.
- **Code:** `mobile/src/store/authStore.ts:96` calls `.reset()`. `mobile/src/store/paywallStore.ts` exports `.reset()`.
- **Severity:** HIGH — three downstream specs document a method name that doesn't exist. A future contributor searching by spec name finds nothing in the code, then either creates `.clear()` (regression) or amends the spec ad-hoc. Drift will compound.
- **Remediation:** WF2 doc-only — replace `.clear()` → `.reset()` in 5 occurrences across 3 files; add "(Spec 99 §3.4 + §9.19)" cite.

**1.2 — MEDIUM: Spec 91 has zero Spec 99 cross-references**

- Spec 91 §2 prescribes `useInfiniteQuery` on `GET /api/leads/feed` but doesn't cite Spec 99 §B1.
- Spec 91 §4.4 prescribes optimistic update + rollback for `SaveButton.tsx` but doesn't cite Spec 99 §B3.
- **Severity:** MEDIUM — implementations are correct but spec is an island; if §B1/§B3 are amended, Spec 91 wouldn't surface in the cross-reference graph.
- **Remediation:** WF2 doc-only — add cites to §2 ("see Spec 99 §B1 for the canonical bridge pattern") and §4.4 ("see Spec 99 §B3 for the rollback contract").

**1.3 — MEDIUM: Spec 98 has zero Spec 99 cross-references**

- Spec 98 §4.1 prescribes "unit tests for stores and routing guards" but doesn't cite Spec 99 §8.1–§8.5 (the actual normative mandates).
- **Severity:** MEDIUM — a developer following Spec 98 alone misses bridge-idempotency tests, gate-stability tests, store-enumeration grep tests.
- **Remediation:** WF2 doc-only — Spec 98 §4.1 should explicitly enumerate Spec 99 §8.1–§8.5 mandates as the binding test set.

**1.4 — MEDIUM: Spec 92 §4.4 retains stale "60-second window" language**

- Spec 92 §4.4 line 161 still contains the pre-2026-05-06 wording even after the supersession added by WF1-C (commit `0beaaf4`). The supersession-note paragraph references Spec 77 §3.2 as canonical, but the legacy paragraph beneath was not deleted.
- **Severity:** MEDIUM — readers see two contradictory rules in the same section.
- **Remediation:** WF2 doc-only — delete the legacy paragraph; keep only the cross-reference to Spec 77 §3.2.

**1.5 — LOW: Spec 90 §12 doesn't reference §6.5**

- Spec 90 §12 prescribes performance via FlashList, but doesn't cite Spec 99 §6.5 ("gate conditions MUST be stable signals, no `isFetching`").
- **Severity:** LOW — separate concerns; nice-to-have cite.
- **Remediation:** Defer.

**1.6 — LOW: Spec 77 §5 missing §B2 cite**

- Spec 77 §5 describes the MMKV `flightBoardSeenStore` mechanism but doesn't explicitly frame it as a hydration bridge.
- **Severity:** LOW — architecture is correct.
- **Remediation:** Defer.

**1.7 — LOW: Spec 98 §3.1 missing §B5 cite**

- Spec 98 §3.1 references Maestro's `clearState: true` but doesn't cite Spec 99 §B5's `clearLocalSessionState()` for orthogonality.
- **Severity:** LOW.
- **Remediation:** Defer.

**1.8 — Healthy permeation patterns to preserve**

- Spec 92 §2.1 (line 47): `"per Spec 99 §9.14"` — exemplar precise-amendment cite.
- Spec 77 §3.2 (line 81): `"per Spec 99 §3.4c, reset on sign-out via §B5"` — exemplar dual-anchor cite.
- Spec 95 throughout: 8 cites with contextual framing — set the bar.

---

## Dimension 2 — Spec ↔ Code Drift Audit

38 anchor claims audited. After verification:

### Verified PASS (33 claims)

Highlights:
- ✅ Spec 90 §3 Dumb Glass — `LeadCard.tsx`, `FlightCard.tsx`, `[lead].tsx` post-WF1-A all receive props/data from hooks.
- ✅ Spec 90 §11 Bearer auth — every hook uses `fetchWithAuth`; verified across `mobile/src/hooks/`.
- ✅ Spec 90 §13 Zod boundary — every queryFn parses through `*Schema.safeParse` or `parse`. Verified in `useLeadDetail`, `useFlightJobDetail`, `useFlightBoard`, `useUserProfile`.
- ✅ Spec 91 §3 "OTHER users" `competition_count` — **verified PASS at `src/features/leads/lib/get-lead-feed.ts:136` (`AND lv2.user_id != $9::text`) and `src/lib/leads/lead-detail-query.ts:105` (`AND lv2.user_id != $4::text`)**. Agent 2 marked this as FAIL but did not check the backend SQL. Both the feed and detail endpoints exclude the viewer correctly.
- ✅ Spec 93 §3.4 sign-out fan-out — `clearLocalSessionState` enumerates all peer stores (verified `authStore.ts:93-118`; §8.5 lint test enforces).
- ✅ Spec 95 §9 hydration idempotency — `filterStore.hydrate()` and `userProfileStore.hydrate()` deep-equal-before-set.
- ✅ Spec 96 paywallStore not MMKV-persisted — `paywallStore.ts` has no `persist()` middleware.
- ✅ Spec 91 §4.1 testID conventions (`lead-card-{index}`, `save-button-{index}`) — present.

### Verified FAIL (2)

**2.1 — HIGH: Spec 90 §12 `FlashList estimatedItemSize` not implemented**

- **Spec:** 90 §12 — "FlashList Mastery: You MUST provide an accurate `estimatedItemSize`."
- **Code:** zero `estimatedItemSize` usages in `mobile/` source. Only `.cursorrules:75` (the rule itself) and `node_modules` mention it.
- **Impact:** at-scale 60fps scroll is at risk on lead feed (`mobile/app/(app)/index.tsx`) and flight board (`flight-board.tsx`). The `AnimatedFlashList` typed wrapper exists (commit `21520d9` per H4) but the `estimatedItemSize` prop is never set on the consumer.
- **Severity:** MEDIUM (perf, not correctness).
- **Remediation:** WF3 — add `estimatedItemSize={120}` (or empirically measured value) to both list call sites.

**2.2 — MEDIUM: Spec 95 §5 phone editability unimplemented**

- **Spec:** 95 §5 table row 2 — `phone_number` listed as Settings-editable with OTP re-verification.
- **Code:** `mobile/app/(app)/settings.tsx` contains zero matches for `phone` / `Phone` / `otp` / `verify`.
- **Severity:** MEDIUM — spec promise vs code; either implement or amend spec.
- **Remediation choice:** WF1 if implementing (significant — needs `PhoneAuthProvider` linking flow); WF2 doc-only if scope-marking as "Phase 2".

### Verified PARTIAL (3)

**2.3 — Spec 92 §2.3 vs Spec 99 §9.14 (notification_prefs schema)**

- Spec 92 still describes `notification_prefs` JSONB; Spec 99 §9.14 amendment flattened to 5 atomic columns.
- Code correctly implements the flat schema. The drift is doc-only and was not caught by the WF1-C audit.
- **Severity:** MEDIUM (doc clarity).
- **Remediation:** WF2 doc-only — Spec 92 §2.3 should cite "(superseded by Spec 99 §9.14 — see flat schema in `userProfileStore`)".

**2.4 — Spec 93 §3.4 "MMKV preserved" wording**

- Spec promise: "**Does not** clear MMKV local state."
- Code: `clearLocalSessionState` calls `.reset()` on persisted stores, which writes INITIAL_STATE back to MMKV via Zustand persist middleware. Old user's data is overwritten by INITIAL_STATE; not literally preserved.
- **Severity:** PARTIAL — functionally correct (next user gets clean slate) but the spec wording is loose. Spec 99 §B5 PIPEDA framing supersedes.
- **Remediation:** WF2 doc-only — reword Spec 93 §3.4 to align with Spec 99 §B5's PIPEDA semantics.

**2.5 — Spec 96 §10 AppState refetch behavior**

- Spec implies `subscription_status` should refetch on AppState 'active'. Code has the listener but the refetch behavior isn't fully tested (see Dimension 3).
- **Severity:** PARTIAL.

---

## Dimension 3 — Test ↔ Spec Gap Audit

### Spec 99 §8 Mandates — All Have Implementation Evidence

| §8 mandate | Test path | Status |
|---|---|---|
| §8.1 B1 idempotency | `bridges.test.ts` | ✅ EXISTS |
| §8.1 B2 hydrate idempotency | `storeIdempotency.test.ts` (filterStore + userProfileStore) | ✅ EXISTS |
| §8.1 B3 mutation rollback | `usePatchProfile.test.ts` | ✅ EXISTS |
| §8.1 B4 UID-change invalidation | `useAuth.test.ts` | ✅ EXISTS |
| §8.1 B5 sign-out reset | `useAuth.test.ts` + `storeReset.coverage.test.ts` | ✅ EXISTS |
| §8.1 B6 mid-session 401 refresh | `apiClient.test.ts` | ⚠️ PARTIAL (see 3.1 below) |
| §8.2 router branch coverage | `authGate.test.ts:94-340` | ✅ EXISTS |
| §8.3 gate stability (no isFetching) | `subscriptionGate.test.ts` | ✅ EXISTS |
| §8.5 store-enumeration lint | `storeReset.coverage.test.ts` | ✅ EXISTS |

The §8 mandate-lint test (`spec99.mandates.lint.test.ts`) closes the meta-gap: every mandate has at least source-level evidence.

### Sub-§8 Test Gaps (Top 6 actionable, severity-tagged)

**3.1 — CRITICAL: B6 401-interceptor live test missing**

- Spec 99 §B6 (lines 331-365) prescribes a single-flight 401 interceptor that calls `getIdToken(true)` and retries once.
- `mobile/__tests__/apiClient.test.ts` exists but does NOT exercise the live retry path. Only structural/grep evidence in `bridges.test.ts`.
- **Risk:** at the 1-hour Firebase token expiry mark, the refresh interceptor silently breaks; no test catches it until users complain.
- **Remediation:** WF3 — add jest test case mocking `fetch` to return 401 on first call + 200 on second; assert `auth().currentUser.getIdToken(true)` called exactly once and the second `fetch` carries the new bearer.

**3.2 — CRITICAL: Phone sign-in nonce hash verification missing**

- Spec 93 §10 mandates `AppleAuthentication.signInAsync({ nonce: hashedNonce })` AND `AppleAuthProvider.credential(idToken, rawNonce)`. The HASH relationship is the security-critical part.
- `useAuth.test.ts` mocks the providers but doesn't assert `hashValue(rawNonce) === hashedNonce`.
- **Risk:** if the hash function is silently swapped (e.g., crypto module update changes default), the security claim breaks without test signal.
- **Remediation:** WF3 — add `expect(hashValue(rawNonce)).toBe(hashedNonce)` to the existing Apple-sign-in test case.

**3.3 — HIGH: Notification preferences E2E flow missing**

- Spec 97 §10 implies an E2E flow for the 5 notification toggles; no `mobile/maestro/settings-notifications.yaml` exists.
- `storeIdempotency.test.ts` covers store-level assertions but not the end-to-end UX (toggle → PATCH → server reflects).
- **Severity:** HIGH (user-facing feature).
- **Remediation:** WF1 — add `settings-notifications.yaml` Maestro flow.

**3.4 — HIGH: `[lead].tsx` cold-boot deep-link not in Maestro**

- WF1-A landed the cold-boot fix but no Maestro flow asserts the loading skeleton → detail render path.
- The new Spec 91 §4.3 sections (cost / sqft / target-date / neighbourhood) have testIDs but no E2E assertion exists.
- **Severity:** HIGH — the very Maestro-blocker WF1-A unblocked has no test enforcing it doesn't regress.
- **Remediation:** WF1 — add `lead-detail.yaml` Maestro flow with `openLink: buildo://(app)/lead?id=<test-id>` + assertVisible on each new section's testID.

**3.5 — HIGH: `[flight-job].tsx` cold-boot deep-link not in Maestro**

- WF1-B landed the cold-boot fix; same Maestro-coverage gap.
- **Severity:** HIGH.
- **Remediation:** WF1 — add `flight-job-detail.yaml` Maestro flow.

**3.6 — MEDIUM: `flight-card-update-flash` animation not unit-tested**

- The `flightBoardSeenStore` data-layer is tested (`flightBoardSeenStore.test.ts`) but the FlightCard's Reanimated `withSequence` flash animation isn't exercised.
- **Severity:** MEDIUM (cosmetic correctness).
- **Remediation:** Defer to a future Reanimated-test-harness WF.

### Lower-priority gaps (defer-list, 4 items)

- **3.7 testID consistency lint** (Spec 98 §3.2) — no static lint test enforces the convention.
- **3.8 AppState 'active' refetch behavior** (Spec 96 §10) — listener exists, behavior not tested.
- **3.9 AuthGate sub-arm sequential integration** (Spec 99 §5.3 5a→5b transitions) — branches tested individually, transitions not.
- **3.10 Cache invalidation telemetry chain** (Spec 99 §7.2) — `logQueryInvalidate` exists; no end-to-end Sentry-breadcrumb assertion.

---

## Prioritized Remediation List → Workflow Mapping

| # | Item | Severity | WF type | Effort |
|---:|---|---|---|---|
| 1 | `paywallStore.clear()` → `.reset()` rename in Specs 93/96/98 (5 lines, 3 files) | HIGH | **WF2 doc-only** | XS |
| 2 | Spec 92 §4.4 delete legacy "60-second window" paragraph | MEDIUM | **WF2 doc-only** | XS |
| 3 | Spec 92 §2.3 cite `(superseded by Spec 99 §9.14)` | MEDIUM | **WF2 doc-only** | XS |
| 4 | Spec 93 §3.4 reword "MMKV preserved" to align with §B5 PIPEDA framing | MEDIUM | **WF2 doc-only** | XS |
| 5 | Spec 91 §2 + §4.4 add Spec 99 §B1/§B3 cites | MEDIUM | **WF2 doc-only** | XS |
| 6 | Spec 98 §4.1 add Spec 99 §8.1–§8.5 mandate cites | MEDIUM | **WF2 doc-only** | XS |
| 7 | B6 401-interceptor live test (`apiClient.test.ts`) | CRITICAL | **WF3** | S |
| 8 | Phone sign-in nonce hash verification test (`useAuth.test.ts`) | CRITICAL | **WF3** | XS |
| 9 | FlashList `estimatedItemSize` on `index.tsx` + `flight-board.tsx` | MEDIUM | **WF3** | XS |
| 10 | Spec 95 §5 phone editability — implement OR scope-mark | MEDIUM | **WF1 OR WF2** | M (if implementing) |
| 11 | Maestro `lead-detail.yaml` (WF1-A regression cover) | HIGH | **WF1** | S |
| 12 | Maestro `flight-job-detail.yaml` (WF1-B regression cover) | HIGH | **WF1** | S |
| 13 | Maestro `settings-notifications.yaml` (Spec 97 §10) | HIGH | **WF1** | S |

**Recommended batching:**
- **Single WF2 doc-only batch (items 1-6):** all spec-vs-spec drift fixes can land in one commit. ~10 minutes of work; closes 6 documentation findings.
- **Single WF3 test batch (items 7-9):** small parallel test additions; closes 2 CRITICAL gaps + 1 perf MEDIUM.
- **Single WF1 Maestro batch (items 11-13):** one cycle of Maestro flow authoring closes the 3 highest-impact E2E gaps.
- **Item 10 (phone editability):** decision needed — implement (WF1) or scope-mark (WF2). Recommend scope-mark unless product priority elevates phone editing.

---

## Audit Pattern Notes

**Reviewer false-positive rate this audit:**
- Agent 1 (permeation, Sonnet): 0 false positives across 8 findings — strong precision.
- Agent 2 (spec-vs-code, Sonnet): 1 false positive of 38 claims (~3%) — flagged Spec 91 §3 "OTHER users" as FAIL without checking backend SQL. Lesson: code-drift audits MUST verify backend invariants before declaring mobile-side data flow incorrect.
- Agent 3 (test gap, Sonnet): 0 false positives across 27 invariants. Their top-10 ranking was directly usable.

Consistent with the Adversarial Pattern Notes (`review_followups.md`) — Sonnet-class reviewers run ~5% false-positive on bounded, context-rich audits when given explicit verification protocols.

**Spec 47 applicability:** zero contact points. The mobile audit has no pipeline-script surface. Confirmed as documented in the active task scope.

---

## Out of Scope (For Follow-up Audits)

- **Backend specs (`02-web-admin/`)** — separate audit.
- **Pipeline specs (`01-pipeline/`)** — separate audit.
- **Architecture specs (`00-architecture/`)** — separate audit.
- **Maestro flow correctness** — testID coverage was in scope; flow logic correctness was not.
- **Mobile UI design polish** — covered in earlier rounds (`review_followups.md` Pre-Spec-99 Mobile Findings 🟢 Maestro-NO-but-real list).

---

_End of audit. No code changes; no commits. Findings are advisory — implementation requires follow-up WF1/WF2/WF3 cycles._
