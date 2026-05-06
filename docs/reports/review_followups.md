# Active Review Follow-ups (Consolidated)
_Generated following the Pipeline Clean-up Mandate. Trimmed 2026-05-05 — full prose history of resolved batches recoverable via `git log -p docs/reports/review_followups.md`._

---

## 🔴 Maestro-First — Frontend Candidates (pull only on observed symptoms)

**Pivot 2026-05-05:** session-end decision was to abandon speculative pre-Maestro patches (the FC1+FC2+FC3 batch I attempted at commit `3709025`, reverted via `2ccb8c0`). The right signal is running Maestro against the current architecture and fixing only what genuinely manifests. The candidates below remain open, scoped, and ready to pull from when matching symptoms appear in Maestro logs — but DO NOT pre-emptively patch.

**FC1 was reframed and closed** as a spec amendment, not a code change: §9.24 was originally a doc-only rule that mandated re-read-before-rollback in `usePatchProfile.ts:onError`, creating an immediate spec-vs-code drift (the M1+M2+M3 batch was specifically designed to close drifts; we created a 4th the same session). Spec rewritten 2026-05-05 to demote re-read to "recommended for high-contention fields" — naive rollback is the canonical pattern for low-contention fields. No code change needed; spec-vs-code drift closed in the smaller direction.

| # | Item | Source | Symptom | Pull-when |
|---|---|---|---|---|
| **FC2** | **B5 paywall reset ordering during sign-out** | DeepSeek M1+M2+M3 batch (MEDIUM) | `usePaywallStore.reset()` runs in §9.19's `finally` block AFTER `await auth().signOut()` resolves; microtask interleave with React effects could briefly flash the paywall during sign-out animation | Maestro sign-out flow shows visible paywall flash between tap-Sign-Out and the redirect to `/(auth)/sign-in` |
| **FC3** | **§3.3 onboarding completion race** | Gemini M1+M2+M3 batch (LOW) | `mobile/app/(onboarding)/complete.tsx` calls `setStep('next')` before the `onboarding_complete` PATCH resolves. PATCH failure leaves user with mismatched state on relaunch (server says incomplete; local says done) → resumed back into onboarding | Maestro flaky-network onboarding test produces "user re-enters onboarding flow on second launch" symptom |

**Symptom-driven escalation only.** If Maestro doesn't surface FC2/FC3, they stay deferred. The architecture itself is sound; the races are observable only under specific user-behavior + network-failure intersections that may not actually occur in practice.

---

## Active Open Items

### Code-fix WF3 candidates (non-frontend-critical)

| Severity | Source | Item | Planned Home |
|---|---|---|---|
| HIGH | Gemini WF2 M1+M2+M3 batch | **§4 B6 concurrent 401 thundering herd needs a mutex.** Currently noted as "low risk known limitation" in `apiClient.ts:69-71` + the new B6 spec rules. Gemini argues a single in-flight refresh promise that subsequent 401s `await` is structurally correct. Real concern under burst-401 scenarios (deploy-induced 401 storm; post-network-restoration retries). | WF3 — implement promise-mutex in `mobile/src/lib/apiClient.ts`; amend §4 B6 spec rules to require it. **Promote to Architectural Reinforcement section.** |
| HIGH | Gemini WF2 M1+M2+M3 batch | **§4 B3 version-counter design discussion** — spec defaults to naive rollback (post-2026-05-05 revision); re-read-before-rollback is recommended for high-contention fields. Gemini argues version-counter is structurally correct vs. either. Decision can wait until a high-contention field surfaces a real issue. | Open design discussion — no action until a real bug surfaces. |

### Spec-amendment WF2 candidates

| Severity | Source | Item | Planned Home |
|---|---|---|---|
| HIGH | Spec 96 WF5 2026-04-30 | **Subscription funnel has near-zero PostHog events.** Only `subscription_expired_to_active` is wired (WF3 H3, commit `d032621`). The original Spec 96 audit flagged that the full funnel — `paywall_shown`, `subscribe_button_clicked`, `checkout_initiated`, `checkout_completed`, `subscribe_failed` etc. — has no instrumentation. Affects revenue/conversion analytics, not Maestro testing. | WF3 — wire the missing PostHog events at PaywallScreen + checkout flow sites; add to Spec 99 §7.3 production-event enumeration if any are routing-relevant. |
| MEDIUM | Gemini WF2 M1+M2+M3 batch | **§4 B2 server-payload coupling.** `hydrateFilter(query.data)` and `hydrateUserProfile(query.data)` pass entire server response into both stores. Future API field additions expose both to changes only one cares about. Recommend bridge-level mapping: `hydrateFilter({tradeSlug: query.data.trade_slug, ...})`. | WF2 — amend §4 B2 spec rules + refactor `useUserProfile.ts` hydration call sites. |
| MEDIUM | Gemini WF2 M1+M2+M3 batch | **§4 B4 `lastKnownUid` module-let is fragile.** Disputes the spec's HMR-caveat justification. Recommends moving to Zustand state with `partialize` exclusion + read in `onRehydrateStorage`. | WF2 — design discussion; current pattern was reviewed and accepted at §9.6 amendment time. Re-open only if HMR remains a friction point. |
| MEDIUM | DeepSeek M1+M2+M3 batch | **§B4 cache invalidation race after `setAuth`.** New component renders may start a query with the old bearer token before `invalidateQueries` fires. Already partially mitigated by `useUserProfile` idToken gate (commit `ffd9851`). At minimum: document inefficiency in spec + add Sentry breadcrumb. | WF2 — spec doc clarification + optional breadcrumb wire. |
| MEDIUM | M1+M2+M3 #10 (DeepSeek) | **`getDiagnosticsSnapshot()` returns empty in production builds — CI tests in production mode pass vacuously.** §8.4's `expect(maxRendersPerSecond).toBeLessThan(20)` would mask render-storm regressions if CI runs with `__DEV__=false`. | WF2 — gate the assertion to dev-mode tests OR provide a production-safe diagnostic fallback. |

### WF1 candidates (new tooling)

| Severity | Source | Item | Planned Home |
|---|---|---|---|
| MEDIUM | M1+M2+M3 #9 (Gemini) | **MMKV ban lacks automated enforcement.** §2.1 hard rule banning direct `createMMKV().getString()` outside `mobile/src/lib/persistence/` is verified manually only. | WF1 — add ESLint rule banning `react-native-mmkv` imports outside the allowed module list. |

### Test/spec polish (LOW + NIT)

| Severity | Source | Item | Planned Home |
|---|---|---|---|
| LOW | DeepSeek M1+M2+M3 batch | **§8.5 store-enumeration test regex fragility.** `create<…>(` regex misses `createStore` factory pattern; a future store created via factory bypasses enumeration silently. | WF3 — replace regex with explicit allow-list or import-based discovery. |
| LOW | §7.2 code-reviewer | **§9.21 lint check comment overstates enforcement.** `mobile/__tests__/spec99.mandates.lint.test.ts:149-155` comment claims "at least 2 hits in src/" but actual condition uses boolean `searchTree`. Helper file matches the regex, so `srcCallerFound` is permanently `true`. Guard inert via `src/` path. | Future doc-only WF — correct the comment OR implement a `countMatches` variant. |
| LOW | §9.21 code-reviewer | **§7.4 Strict Mode suppression-marker vocabulary is static.** Check tests `strictModeSuppress\|suppressDoubleFire`. A future contributor suppressing via different token (`dedupRender`, `strictModeNoop`) would evade. | Future hardening — expand regex if `stateDebug` ever gains a config arg. |
| LOW | §9.21 code-reviewer | **§8.3 lint regex matches against regex-literal syntax in source.** Could lose coverage if gate-stability test is refactored to use `.toContain('Permitted carve-outs')` instead of regex literal. | Future hardening — re-anchor to `it()` test title string (more stable). |
| LOW | D1 H5 code-reviewer | **`feedback_wf3_granularity.md` SHA chain in `**Why:**` paragraph fragile after rebase.** SHAs are illustrative not load-bearing; if commits get squashed/force-pushed the chain becomes unverifiable. | Future cleanup — replace SHA chain with count-only ("9 separate plan-lock commits across 8 findings + 1 class fix"). |
| LOW | D1 H5 code-reviewer | **`feedback_wf3_granularity.md` recursive deferred-item case not explicitly stated.** Implicit by composition with `feedback_always_use_workflow.md` ceremony rule. | Future memory edit if confusion surfaces. |
| NIT | Gemini WF2 M1+M2+M3 batch | **§6.6 composite-field rule weak.** "MUST justify the deep-equal cost in the spec PR" is subjective. Recommend stricter "MUST flatten unless server-side equivalent absent". | WF2 — strengthen §6.6 rule prescriptively. |

---

## 🟢 Architectural Reinforcement — close spec-vs-code gaps (high-leverage)

These are NOT race patches. They are gaps where the spec promises something the implementation does not actually guarantee, OR places where a bridge has a "known limitation" footnote that violates the architecture's "safe by construction" principle. Closing these reinforces the architecture rather than patching around it. Each is small + high-leverage.

| Item | Gap shape | Why it reinforces |
|---|---|---|
| **§9.21 lint check `app/`-only enforcement** (LOW) | The `searchTree` boolean check has TWO paths (src/ and app/). The `src/` path is permanently `true` because the helper file at `mobile/src/lib/queryTelemetry.ts` matches the `logQueryInvalidate(` regex itself. So the §7.2 mandate's enforcement runs through `app/` ONLY. A future change that orphans all `app/` callers would silently pass. | Replace `searchTree` boolean with `countMatches` returning a number; require count ≥ 2 (helper + ≥1 caller). Makes the §7.2 lint actually enforce what its comment claims. |
| **§8.5 store-enum import-based discovery** (LOW) | Currently regex-discovers `create<...>(` patterns in `mobile/src/store/*.ts`. A factory pattern (`createStore(...)`) silently bypasses; new store added via factory → no `.reset()` enforcement → stale data leaks across users on shared device (a §B5 PIPEDA-class bug). | Replace regex with maintained allow-list OR import-graph parsing of `useXxxStore` exports across the directory. Makes §B5 store-reset coverage robust to future Zustand idiom changes. |
| **§4 B2 server-payload coupling** (MEDIUM) | `hydrateFilter(query.data)` and `hydrateUserProfile(query.data)` pass the FULL TanStack response into both stores. §3.1 mandates "exactly ONE store owns each field" — but each bridge call exposes both stores to fields neither owns. | Refactor `useUserProfile.ts` hydration calls to pass per-store sub-objects: `hydrateFilter({tradeSlug, radiusKm, ...})`. Tightens single-ownership at the bridge boundary. ~10 lines of code change. |
| **§4 B6 thundering-herd mutex** (HIGH) | Spec says "exactly-once retry per call chain" but admits N parallel `getIdToken(true)` calls under burst-401. The asterisk itself violates Spec 99's "bridges are safe by construction" principle. | Implement single-flight promise in `apiClient.ts`: first 401 starts the refresh, subsequent 401s `await` the same promise. Removes the "known limitation" footnote. ~15 lines. |
| **§B4 idToken-gate documentation** (MEDIUM) | Commit `ffd9851` added the idToken gate to `useUserProfile` that mitigates the §B4 cache invalidation race — but the mitigation isn't called out in §B4's spec text. Future contributor reading §B4 wouldn't know the gate exists or why removing it would re-open a race. | Add a one-paragraph "Implementation note" under §B4 documenting the `useUserProfile.ts:enabled` gate as the canonical mitigation. ~5 lines of spec edit. Closes implicit knowledge. |

**Why these matter more than FC2/FC3:** the FC items are races that may or may not manifest in practice. The reinforcement items are concrete gaps where someone reading the architecture today gets the wrong impression (lint claims to enforce something it doesn't; spec promises ownership the bridge dilutes; B6 admits the limitation it shouldn't have). Closing these makes the architecture trustworthy by self-description — the spec describes what the code does, the code does what the spec says.

**Suggested ordering** (not a workflow plan — just relative leverage):
1. §9.21 lint (cheapest; removes a false-confidence trap)
2. §B4 idToken-gate doc (cheapest spec edit; closes implicit knowledge)
3. §4 B2 coupling (tightens bridge contract structurally)
4. §8.5 import-based discovery (eliminates a §B5 PIPEDA-coverage hole)
5. §4 B6 mutex (largest effort; promotes "known limitation" to "safe by construction")

---

## Adversarial Pattern Notes

Across the H1-H5 + M1-M3 + §7.2 + §9.21 + M1+M2+M3 WF3/WF2 batches this session, the 3-agent Multi-Agent Review pattern produced these false-positive rates on Spec 99 doc-only and code amendments:

| Reviewer | Substantive findings | False-positive findings (already-resolved at scan time) | False-positive rate |
|---|---|---|---|
| `feature-dev:code-reviewer` (Sonnet, worktree-isolated) | many — all triaged + applied inline where applicable | 1 (`save-heart-filled` testID — flagged as Maestro-blocking BUG against this trim, but actual code at `LeadCard.tsx:117` uses `${index}` not `${leadId}` — already-fixed) | ~5% on spec-sync/doc-amendment WFs |
| Gemini Pro | 5-7 substantive | 4-5 (`userProfileStore` PII partialize, §7.3 telemetry, §8.3 gate tests) | ~40% on spec-sync/doc-amendment WFs |
| DeepSeek-R1 | 4-5 substantive | 3-4 (§7.3 telemetry, §8.3 gate tests, §B4 cache race) | ~40% on spec-sync/doc-amendment WFs |

**Pattern:** All 3 reviewers can fall prey to "trust historical doc text without verifying current code". Gemini and DeepSeek do this systematically (~40% on spec-sync WFs); code-reviewer was thought to be exempt but EXHIBITED IT ONCE in this session — flagged the `save-heart-filled` testID mismatch as a Maestro-blocking BUG against the file trim, citing a stale historical entry. Verifying against `LeadCard.tsx:117` showed the bug was already fixed (uses `${index}`, not `${leadId}`). The lesson generalises: **always verify findings against current HEAD before treating them as actionable, regardless of which reviewer surfaced them.**

**Recommendations going forward:**
1. **Pre-verify each adversarial finding** against current HEAD before treating it as actionable. ~40% of Gemini/DeepSeek output during this session was already-resolved noise.
2. **Use code-reviewer as the primary signal** (low false-positive rate, full code-context awareness).
3. **Treat adversarial output as a "did we miss anything" sanity check**, not a primary review pass.
4. **Default-skip adversarial on doc-only WFs** unless explicitly requested. The bug-finding payoff is low (Gemini/DeepSeek review code, not text drift) and the noise is high. User pattern across this session has consistently been "skip adversarial" for doc-only batches.
5. **Keep adversarial mandatory for WF1/WF2 code changes** per `feedback_review_protocol.md` — the false-positive rate is acceptable when the review surface is real code. Noise reduction is ~40% pre-verification: budget that into review-amendment time.

**Verification protocol for adversarial findings:** before treating any adversarial-surfaced finding as actionable, perform this 3-step check:
1. **Read the finding's claimed file:line citation in current HEAD.** Does the code there match the finding's description?
2. **`git log --oneline -- <cited-file>` since the audit's date.** Has the file been touched? If yes, re-verify the finding against the post-touch state.
3. **If the finding is a "missing implementation" claim** (e.g., "no `track('route_decision', ...)` calls anywhere"), grep for the pattern in current HEAD across the relevant scope. Don't trust the audit's claim if the pattern was added since.

If any of (1)/(2)/(3) reveals already-resolved state, document as "false positive (verified <date>)" in this file, NOT silently dropped. Adds to the adversarial-pattern data set.

---

## Hygiene Practices (forward-going)

These practices keep `review_followups.md` from drifting back to the 1246-line state.

1. **Auto-prune at WF6 close-out.** Every WF6 close-out commit that records a RESOLVED batch should ALSO trim the prior PENDING entries that the batch closed. Bodies move to the historical index as 1-line summaries with commit hash. Don't accumulate full-prose RESOLVED bodies in the active sections.

2. **Time-based archival for `Future hardening`.** Items tagged `Future hardening` or `Reactive` that sit dormant >2 weeks without escalation get archived (collapsed to a 1-line note in the historical index OR removed entirely if not load-bearing). The current rule "items dormant >1 week without escalation are deemed not actively tracked" stands; tighten to 2 weeks with explicit archival rather than silent retention.

3. **Severity decay.** A HIGH item dormant >2 weeks without progress is either actively prioritized (commits referencing it) or demoted to MEDIUM. Forces escalation or removal, prevents indefinite HIGH-tagged items.

4. **Adversarial pre-verification (above).** Before logging any adversarial finding here, run the 3-step verification protocol. False positives are documented as "false positive (verified <date>)" rather than silently dropped — this builds the adversarial-pattern data set so we can refine the false-positive-rate estimate.

5. **Spec-vs-code drift gets a special tag.** Items where the spec text and code state disagree are tagged `[DRIFT]` and surfaced higher than other LOW items. The M1+M2+M3 batch demonstrated drift is a recurring gap; tagging it explicitly prevents it from hiding among LOW polish items.

6. **Maestro-relevance tag on every active item.** YES (Maestro-blocking) / MAYBE (could surface under specific conditions) / NO (test infra, design, backend telemetry). When new findings are filed, they get this tag immediately; surfaces frontend-critical items automatically without a manual review pass.

7. **Update `feedback_review_protocol.md`** to reflect the Adversarial Pattern Notes recommendation: WF2 default for spec-sync / doc-amendment changes can be single-reviewer (currently mandates 3-agent for all WF2). Match the pattern user has been picking ("skip adversarial") — make the memory describe actual practice.

---

## Resolved (Historical Index)

One-line per resolved batch with commit hash + date. Full prose recoverable via `git log -p docs/reports/review_followups.md`.

### 2026-05-05 (this session)

- `dd638c2` — **WF3 H1 Spec 99 §6.5 amendment** — permitted narrow `isFetching` carve-out for stable status fields; AppLayout `expired`-refetch enumerated as the canonical exception.
- `e41d6a5` — **WF3 H2 §8.3 gate-stability tests** — 4 source-grep regression tests in `subscriptionGate.test.ts` covering all §6.5 render gates.
- `d032621` — **WF3 H3 §7.3 router decision telemetry** — DEV `route_decision` event at 2 router.replace sites + 3 production events (`reactivation_modal_shown`, `cancelled_pending_deletion_signout`, `subscription_expired_to_active`).
- `47a1b24` / `19de789` / `21520d9` / `11eb10a` — **WF3 H4 mobile typecheck cleanup** (4 phases) — bridges.test.ts QueryObserver readonly + helper variance; `@tanstack/query-sync-storage-persister` dev-dep; `AnimatedFlashList` typed wrapper; `_layout.tsx` `NotificationBehavior` fields. 15 → 0 errors.
- `c3cf253` — **WF3 H5 MEMORY.md auto-memory cleanup** — 94 → 22 lines per "index, not memory" rule. Memory-side only.
- `fa563bf` — **WF2 M1+M2+M3 doc-only spec sync** — §B5+§9.10, §5.2 falsy-uid, §9.17-§9.20 catalog rows.
- `e655417` — **WF1 §9.21 mandates-lint test** (Pattern A class fix) — `spec99.mandates.lint.test.ts` enforces every §7+§8 mandate has implementation evidence. Surfaced §7.2 gap.
- `fe03abe` — **WF3 D1 from H5: `feedback_wf3_granularity.md`** — auto-memory addition for per-finding cadence rule.
- `ec4d1bd` — **WF3 §7.2 cache invalidation telemetry** — `logQueryInvalidate` helper at 10 non-trivial sites; closes §9.21 lint's `it.skip`.
- `ffd9851` / `6ee943b` / `5e3f9b4` / `2a7a9c9` — **WF3 M1+M2+M3 batch** (3 phases + close-out) — #4 idToken gate; #5 unconditional crash-recovery cleanup; #12 stale-profile loading guard.
- `aed9918` / `cddc3d0` / `d0e581f` — **WF2 M1+M2+M3 batch** (2 phases + close-out) — #6 B6 bridge spec; #7 B3 rollback race amendment; 5 inline reviewer fixes.

### 2026-05-04 and earlier

- `656e985` — **WF2 §9.14 Phase D adversarial trio review** — Gemini + DeepSeek + code-reviewer on `notification_prefs` JSONB-flatten WF; 7 fixes inline + 23 deferrals (most since resolved by H1-H4 + M1+M2+M3).
- **WF3 Top-6 deferred bug sweep** — 9 CRITICAL + 8 HIGH closed; 7 commits (`d609b9b` auth hardening, `08ff833` user-profile route, `6b518ae` push dispatch, `857bf51` PII strip, `fefc2a3` LPAD cursor, `0fa1314` Phase 7 amendments).
- `3fa96a1` — Cursor backward-compat (server-side LPAD bare-int support).
- `671aa87` + `202a9aa` — PII MMKV strip (§9.18 — `persistFilter.ts` NEW + buster bump).
- `381a0c9` + `f2f7147` — Forced-signout cleanup unification (§9.19 — `clearLocalSessionState` helper extraction).
- `7bcb681` — Dead-code sweep (§9.20 — server `CLIENT_SAFE_COLUMNS` removal).
- Multi-week earlier batches (Spec 93/94/95/96 follow-ups, WF5 prod backend audits, mobile Ph4-7, Phase 8.0 pre-test gauntlet, validate-migration hardening, audit-fk-orphans, Stripe webhook, etc.) — all resolved or stale; commits in `git log` 2026-04-08 → 2026-05-04 range. Items dormant >1 week without escalation are deemed not actively tracked.

### Operational Safety (dormant but live)

- **`scripts/backup-db.js` has never run in production** per WF5 prod backend 2026-04-25 audit. Script exists; operational state unverified. File a backup-runbook WF before next migration that touches a >100K-row table.

---

_If you need a specific historical entry's full prose, use `git log -p docs/reports/review_followups.md` and grep for the commit hash above._
