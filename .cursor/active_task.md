# Active Task: WF2 — Cycle 6: Document realtors as a first-class persona — Spec 91 + Spec 95 + Spec 76 §3.7 amendments
**Status:** Implementation (authorized 2026-05-06)
**Workflow:** WF2 — Feature Enhancement (multi-spec amendment; no `src/` code; closes the Spec 76 §3.7 deferral and aligns three specs to a unified persona model)
**Domain Mode:** Cross-Domain (touches docs/specs/02-web-admin/ + docs/specs/03-mobile/ — both surfaces refer to the same `account_preset` enum + `trade_slug='realtor'` value)
**Rollback Anchor:** `78f81b0` (current HEAD — last Cycle 4 P5 commit)

## Source

Cycle 6 was queued at the close of Cycle 4 with the user's note: "Cycle 6 (queued, gated on product decision): Spec 91 amendment for user-type-differentiated feeds." Recon (this turn) revealed the product decision is simpler than the original deferral assumed:

- **Realtors are tradespeople algorithmically** — same feed, same flight center, same scoring. They differ only in WHICH trade they pick (`trade_slug='realtor'`) and the lifecycle phases that trade is calibrated to (earliest = P1 submission, latest = P20 occupancy — for listing prospecting + post-completion sale).
- **Manufacturers are NOT customer-facing feed personas** — admin-managed B2B accounts, already documented in Spec 95 §3.1 with `trade_slug=NULL` + `trade_slugs_override` array, and in Spec 94 §7 with onboarding bypass.

So Cycle 6 collapses to documenting realtors as a first-class persona that shares the tradesperson algorithm. NO code change in this cycle (Path A); a separate WF will follow to wire the backend (`TRADES` row + `trade_forecasts` calibration + `permit_trades` association).

## State Verification (WF2 step 1)

**Realtor wiring is HALF-COMPLETE today (broken end-to-end):**

✅ Mobile UX wired:
- `mobile/src/lib/onboarding/tradeData.ts:76` — "Real Estate Agent" with `slug: 'realtor'` in the trade picker (33-item list = 32 trades + realtor)
- `mobile/app/(onboarding)/profession.tsx:69` — picker → `OnboardingPath = 'realtor'`
- `mobile/app/(onboarding)/address.tsx:26` — `isRealtor` short-circuits to fixed-address (no GPS option)
- `mobile/src/lib/onboarding/getResumePath.ts:79` — resume path skips path-selection
- `mobile/src/store/onboardingStore.ts:44` — `OnboardingPath` includes `'realtor'`
- Spec 94 §3.1 — realtor radius default 3-5km
- Spec 94 §3.5 — "does not apply to realtors (always fixed)" address handling

❌ Feed/backend NOT wired:
- `src/lib/classification/trades.ts` — 32 entries; no `'realtor'`
- `migrations/004_trades.sql`, `028_new_trades.sql`, `029_rename_trades.sql` — no `'realtor'` seed
- `src/features/leads/lib/get-lead-feed.ts` — no special-case for `trade_slug='realtor'`
- `permit_trades` has no `'realtor'` rows (zero permits associated)
- `trade_forecasts` has no `'realtor'` row (no work_phase calibration)
- Spec 91 doesn't mention realtors anywhere
- Spec 95 §3.1 enum lists `'realtor'` but adjacent prose only documents `'manufacturer'`-special-handling

❌ Net effect: a realtor who completes onboarding today gets `trade_slug='realtor'` in their profile, their feed/flight-board queries return zero rows, the empty-state UI shows "no leads in your area" — an unrecoverable broken state. **The wire-up follow-up cycle will fix this; Path A documents the architectural intent so the wire-up cycle has a clear target.**

## Contract Definition (WF2 step 2)

**No API contract changes.** All endpoint contracts remain unchanged. The persona model becomes:

| `account_preset` | `trade_slug` | Persona | Feed algorithm | UX framing |
|---|---|---|---|---|
| `'tradesperson'` | one of 32 construction trades | Tradesperson | Spec 91 §3 algorithm, calibrated to that trade's `work_phase` | "Find jobs near you" |
| `'realtor'` | `'realtor'` | Real Estate Agent | **Same Spec 91 §3 algorithm**, calibrated to `'realtor'` `work_phase` (earliest + latest) | "Find listings & post-completion leads" |
| `'manufacturer'` | `NULL` | Manufacturer (B2B) | **Not customer-facing**; admin-managed via `trade_slugs_override` | Onboarding bypass (Spec 94 §7) |

Key clarification baked into Spec 95: **`account_preset` is a UX hint for onboarding/welcome copy. Feed differentiation flows through `trade_slug` only.** A realtor who somehow had `trade_slug='roofing'` would get a roofer's feed, not a realtor's — `trade_slug` is the authoritative input to the algorithm.

`npm run typecheck` to identify breaking consumers — N/A, no code changes.

## Spec Update (WF2 step 3)

### S1 — Spec 91 (`docs/specs/03-mobile/91_mobile_lead_feed.md`)

- Amend §1 (Goal & User Story) to include real estate agents as a parallel persona — add a second user story alongside the tradesperson story, identical algorithm, different lifecycle phase calibration.
- Add a new §X (Persona Coverage) section enumerating the three `account_preset` values and what they mean for feed behavior. Cross-reference Spec 95 §3.1 for the schema authority.
- Add a "Wire-up dependencies" subsection inside §3 noting that `trade_slug='realtor'` requires:
  1. A row in `TRADES` (`src/lib/classification/trades.ts`, id 33)
  2. A row in the `trades` DB table (migration)
  3. Calibration in `trade_forecasts` for the `'realtor'` work_phase (earliest = P1 submission, latest = P20 occupancy — exact P-codes resolved at wire-up time)
  4. A `permit_trades` association strategy — either every active permit gets a `'realtor'` row OR a SQL bypass when `trade_slug='realtor'` (decision deferred to wire-up cycle; document both options).
  5. Tests asserting realtor feed returns leads (currently 0 because of the missing data layer).

### S2 — Spec 95 (`docs/specs/03-mobile/95_mobile_user_profiles.md`)

- Add a §3.1.x "Persona vs trade_slug separation of concerns" subsection clarifying:
  - `account_preset` is a UX hint (onboarding flow, welcome copy, subscription rules per Spec 96)
  - `trade_slug` is the authoritative feed-algorithm input
  - The two CAN diverge in the schema (no DB constraint linking them) — but onboarding (Spec 94) ensures realtors get `trade_slug='realtor'`, tradespeople get one of 32 construction slugs, and manufacturers get `NULL` + `trade_slugs_override`.
- Reference Spec 91's new §X for the realtor persona's feed semantics.

### S3 — Spec 76 §3.7 (`docs/specs/02-web-admin/76_lead_feed_health_dashboard.md`)

- Close the deferral. Replace the "Concrete next step (out of this cycle): product decision on whether user-type-differentiated feeds are a planned feature" paragraph with: "Closed 2026-05-06 (Cycle 6): user_type-differentiated feeds are NOT a planned product feature. Realtors are tradespeople algorithmically — they share Spec 91's feed/flight-board algorithm via a calibrated `trade_slug='realtor'`. Manufacturers are not customer-facing feed personas (admin-managed B2B per Spec 94 §7). The admin Test Feed Tool / Flight Center does NOT need a `?user_type=` parameter — that would be dead UI surface. See Spec 91 §1 + §X for the persona model."

### S4 — System map regen

- `npm run system-map` after the three spec edits.

## Schema Evolution (WF2 step 4)

**N/A.** No DB impact — schema unchanged. The realtor wire-up follow-up cycle will own DB migrations.

## Compliance Cross-Check Matrix

| Spec | Section | Compliance check |
|---|---|---|
| Spec 91 | §1 user story | Amended to include real estate agents as parallel persona ✓ after S1 |
| Spec 91 | §3 algorithm | Unchanged — explicitly documented as persona-agnostic ✓ after S1 |
| Spec 95 | §3.1 schema | Adds persona vs trade_slug clarification (currently only documents manufacturer specials) ✓ after S2 |
| Spec 94 | §3.1 + §3.5 + §7 | Already covers realtor radius default + always-fixed address + manufacturer onboarding bypass — NO amendment needed ✓ |
| Spec 76 | §3.7 | Deferral closed; cross-reference to Spec 91 §X ✓ after S3 |
| Spec 96 (subscription) | manufacturer expiration logic | Unchanged — manufacturer-specific subscription handling is correct ✓ |
| Spec 99 §B3 | mutation patterns | N/A — no mutations changed |
| Spec 90 §5/§7 | mobile API contract | N/A — no API contract changed |

## Execution Plan

### Spec amendments
- [ ] **S1** — `docs/specs/03-mobile/91_mobile_lead_feed.md`: amend §1 user story, add §X persona coverage, add §3 wire-up dependencies subsection.
- [ ] **S2** — `docs/specs/03-mobile/95_mobile_user_profiles.md`: add §3.1.x persona-vs-trade_slug clarification, cross-reference Spec 91 §X.
- [ ] **S3** — `docs/specs/02-web-admin/76_lead_feed_health_dashboard.md` §3.7: close the deferral, cross-reference Spec 91 §X.
- [ ] **S4** — `npm run system-map`.

### Verification
- [ ] **V1** — Confirm internal cross-references resolve (Spec 91 §X exists when Spec 95 + Spec 76 reference it).
- [ ] **V2** — Confirm no `src/` code touched (`git status` shows only `docs/` + `.cursor/`).
- [ ] **V3** — `npm run typecheck` for sanity (should be a no-op since no `.ts` files changed).

### Multi-Agent Review (WF2 step 10)
- [ ] **R1** — Three parallel reviews on the spec amendments:
  - Gemini on `docs/specs/03-mobile/91_mobile_lead_feed.md` (Spec 91) — adversarial check that the realtor persona is documented unambiguously and the algorithm-agnostic claim holds.
  - DeepSeek on `docs/specs/03-mobile/95_mobile_user_profiles.md` (Spec 95) — adversarial check that the persona-vs-trade_slug separation is consistent with the existing schema docs (Spec 96 subscription, Spec 94 onboarding).
  - Worktree-isolated `feature-dev:code-reviewer` agent over the full diff: 3 spec edits + system map regen. Triage: spec drift → fix; deferred → `docs/reports/review_followups.md`.

### Green Light (WF2 step 11)
- [ ] **G1** — `npm run typecheck && npm run lint -- --fix` (no-op for spec changes; sanity check). Commit. Push.
- [ ] **G2** — Hand off to follow-up cycle ("Cycle 7 — Realtor backend wire-up") which will own the data engineering: `TRADES` array entry, DB migration for `trades` row, `trade_forecasts` calibration, `permit_trades` association strategy, tests.

## Standards Compliance

* **Try-Catch Boundary:** N/A — no code changes.
* **Unhappy Path Tests:** N/A — no code changes; the spec amendments themselves don't add behaviors that need tests.
* **logError Mandate:** N/A.
* **UI Layout:** N/A.

## Out of Scope (queued for follow-up cycle)

- **Cycle 7 — Realtor backend wire-up** (separate WF on authorization):
  - Add `{ id: 33, slug: 'realtor', name: 'Real Estate Agent', icon: 'Home', color: '#XXXXXX', sort_order: 33 }` to `src/lib/classification/trades.ts`
  - Migration to seed `trades` table with the realtor row
  - Decide `permit_trades` association strategy (every-active-permit vs. SQL bypass) — product+SQL design conversation
  - `trade_forecasts` calibration row (P1-ish for early signal, P20-ish for late signal — exact P-codes resolved during the cycle)
  - Tests asserting `getLeadFeed({trade_slug: 'realtor'})` returns leads end-to-end
  - Possible Spec 96 amendment (subscription) if realtor billing differs from tradesperson — TBD during the cycle

> **PLAN LOCKED. Do you authorize this WF2 Cycle 6 (Path A — spec amendments only) plan? (y/n)**
> §10 note: chose to close Spec 76 §3.7 as "not a planned feature" rather than amend it to acknowledge the new persona model. Reason: the deferral was about admin tooling exposing `?user_type=` — that's dead UI now AND in the future, because realtor-vs-tradesperson differentiation flows through `trade_slug` (a parameter the admin tool already exposes), not through a separate `user_type` axis.
> DO NOT generate code. DO NOT run commands. TERMINATE RESPONSE.
