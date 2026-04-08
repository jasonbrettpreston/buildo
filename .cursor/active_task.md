# Active Task: WF1 — Frontend Phase 0 Foundation
**Status:** Implementation
**Workflow:** WF1 — New Feature Genesis (foundation infrastructure)
**Rollback Anchor:** `6603cd6`

## Domain Mode
**Frontend Mode** — sets up the tooling, observability, and quality gates that all frontend work in `src/features/leads/` will rely on. Per CLAUDE.md Frontend Mode rules: required tooling stack from §12 + observability from §13.

## Context
* **Goal:** Build the frontend tooling foundation for the lead feed feature. After this phase completes, every subsequent feature WF can rely on Biome catching React logic errors at commit time, PostHog capturing events, Sentry catching production exceptions, Lighthouse CI enforcing performance budgets, and the Impeccable plugin guiding design decisions. Lessons-learned: build observability + safety nets BEFORE feature code, not after.
* **Target Spec:** `docs/specs/product/future/75_lead_feed_implementation_guide.md` §7a Foundation Tooling + §11 Phase 0 (frontend portions: days 1-2, 3-4, 5, 6 Impeccable, 8-9 Lighthouse). `docs/specs/00_engineering_standards.md` §12, §13.
* **Key Files:** new — `biome.json`, `src/lib/observability/capture.ts`, `.lighthouserc.json`, `.github/workflows/lighthouse.yml`. Modified — `src/lib/logger.ts`, `tsconfig.json`, `eslint.config.mjs`, `.husky/pre-commit`, `package.json`, `src/app/layout.tsx`, `src/instrumentation.ts` (Sentry).

## Technical Implementation

### New/Modified Components
- **`src/lib/observability/capture.ts`** (NEW) — PostHog wrapper with type-safe `EventName` union, init queue for events fired before posthog loads, `captureEvent`, `identifyUser`, `isFeatureEnabled` exports
- **`src/lib/observability/sentry.ts`** (NEW) — minimal Sentry helper for context enrichment, called by route-level `error.tsx`
- **`src/lib/logger.ts`** (MODIFIED) — add `logInfo(tag, event, context)` function alongside existing `logError` and `logWarn`
- **`src/app/layout.tsx`** (MODIFIED) — wrap children in PostHog provider, call `initObservability()`
- **`src/instrumentation.ts`** (NEW per Sentry wizard) — Sentry SDK init for client + server runtimes
- **`tsconfig.json`** (MODIFIED) — add `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`
- **`biome.json`** (NEW) — scoped to `src/features/leads/**`, enforces `useHookAtTopLevel`, `noFloatingPromises`, `useExhaustiveDependencies` as errors
- **`package.json`** (MODIFIED) — add `lint-staged` config, new scripts: `lighthouse:ci`, `biome:check`
- **`.husky/pre-commit`** (MODIFIED) — ADD `npx lint-staged` at the start, KEEP existing typecheck + test runs
- **`.lighthouserc.json`** (NEW) — performance ≥90 mobile, accessibility ≥95, LCP <2.5s, CLS <0.1, TBT <200ms
- **`.github/workflows/lighthouse.yml`** (NEW) — runs Lighthouse CI on every PR
- **`.claude/plugins/impeccable/`** (NEW via npx install) — Impeccable Claude plugin

### Data Hooks/Libs
None — this phase has no data fetching. TanStack Query setup is Phase 3 of the broader rollout.

### Database Impact
**NO** — this phase explicitly excludes all database work. PostGIS, migrations 070-077, the location sync trigger, the cost_estimates table, etc. are all in a SEPARATE WF1 ("Backend Phase 0") that can run in parallel or sequentially. The two phases are independent: frontend tooling doesn't depend on the database, and backend foundation doesn't depend on the frontend tooling.

## Standards Compliance

* **Try-Catch Boundary:** N/A for tooling configs. Applies to the PostHog wrapper (`captureEvent` already swallows errors silently per spec — never crashes the calling component) and the Sentry helper (boundary catches everything via `app/[...]/error.tsx`).
* **Unhappy Path Tests:** 
  - `captureEvent` called before `initObservability()` → event queues, drains on load
  - `captureEvent` called when PostHog is down → swallows error, doesn't crash
  - Sentry init fails → app continues to render without telemetry
  - `logInfo` called with non-serializable context → handles gracefully
* **logError Mandate:** N/A — this phase ADDS `logInfo` to the existing `logger.ts` module that already has `logError` and `logWarn`. No API routes touched.
* **Mobile-First:** Lighthouse CI mandate enforces mobile performance budget. The CI fails any PR that drops below 90 on the Moto G4 emulation profile. Touch target ≥44px and 375px viewport are part of the accessibility category (≥95).

## What's IN Scope (this WF)

| Day | Deliverable | Standards alignment |
|-----|-------------|---------------------|
| **1-2** | Biome scoped to `src/features/leads/`, stricter tsconfig, lint-staged additive to existing pre-commit, `logInfo` added to logger | §12.1, §12.2 (logic safety net) |
| **3-4** | PostHog SDK install, `src/lib/observability/capture.ts` wrapper with init queue, layout wiring, type-safe EventName union | §13.1 |
| **5** | Sentry SDK install via `@sentry/wizard`, instrumentation.ts, route-level error boundary helper | §13.2 |
| **6** | Impeccable Claude plugin install (`npx claudepluginhub pbakaus/impeccable --plugin impeccable`) | §12 design quality |
| **8-9** | Lighthouse CI: `.lighthouserc.json` config, GitHub Actions workflow, hard performance budgets | §13.4 |

## What's OUT of Scope (separate Backend Phase 0 WF1)

These items are in spec 75 §11 Phase 0 but belong to Backend Mode and will be a sibling WF1:

- Day 6 backend: SQLFluff install, `scripts/validate-migration.js` script
- Day 7: PostGIS extension, migrations 070-072, `permits.location` column + trigger, photo_url column, batched backfill script
- Day 10: Firebase `verifyIdToken` wiring, `@upstash/ratelimit` setup, `getUserIdFromSession` helper, rate limiter wrapper

**Why separate:** Different domain (Backend/Pipeline Mode), different risk profile (DB migrations need careful rollout), different verification (no UI tests). Splitting reduces blast radius — if either WF hits an issue, the other can still proceed.

## Execution Plan

*Per WF1 protocol — every step verbatim, N/A explained where applicable:*

```
- [ ] Contract Definition: N/A — no API routes created in this phase. The
      observability wrappers (captureEvent, logInfo) are internal-only and
      don't expose HTTP endpoints. API routes come in Phase 2.

- [ ] Spec & Registry Sync: Specs 70-75 already exist and are hardened.
      Run `npm run system-map` AFTER implementation to capture the new
      `src/lib/observability/` paths in the system map.

- [ ] Schema Evolution: N/A for this phase. Database work is explicitly
      deferred to the Backend Phase 0 WF1. No migrations, no factory updates,
      no `db:generate` run needed here.

- [ ] Test Scaffolding: Create three new test files following the triad pattern:
      - `src/tests/observability.logic.test.ts` (15-20 tests)
        * captureEvent queues events when called pre-init
        * captureEvent drains queue on init via loaded() callback
        * captureEvent swallows errors silently when PostHog is unavailable
        * captureEvent no-ops on SSR (window === undefined)
        * isFeatureEnabled returns false in SSR
        * EventName type is enforced at compile time (TS-only check)
      - `src/tests/sentry.logic.test.ts` (8-10 tests)
        * Sentry helper passes context to captureException
        * Dev mode bypass — Sentry not initialized when NODE_ENV=development
        * Source map upload config validated at build time only
      - `src/tests/logger.logic.test.ts` EXTEND existing
        * logInfo emits structured JSON line with correct level
        * logInfo includes timestamp, tag, event, context
        * logInfo handles non-serializable context gracefully (Date, BigInt, circular)

- [ ] Red Light: Run `npm run test`. The new test files MUST fail because
      `src/lib/observability/capture.ts`, `src/lib/observability/sentry.ts`,
      and `src/lib/logger.ts` (logInfo function) don't exist yet.

- [ ] Implementation:
      Day 1-2 — Logic safety net:
        a) Install: `npm install --save-dev @biomejs/biome lint-staged`
        b) `npx @biomejs/biome init`, then edit `biome.json` to scope linting
           to `src/features/leads/**` only (don't lint the rest of the repo,
           ESLint stays in charge there)
        c) Update `tsconfig.json` with the 5 new strict flags
        d) Edit `src/lib/logger.ts` to add `logInfo` (matches existing
           pattern of logError + logWarn)
        e) Add `lint-staged` config to `package.json`
        f) Update `.husky/pre-commit` to call `npx lint-staged` BEFORE the
           existing `npm run typecheck && npm run test`
        g) Verify: stage a file in src/features/leads/ (placeholder), commit,
           confirm Biome runs

      Day 3-4 — PostHog telemetry:
        a) Install: `npm install posthog-js`
        b) Create `src/lib/observability/capture.ts` with the full wrapper
           code from spec 75 §7a (init queue, type-safe EventName, captureEvent,
           identifyUser, isFeatureEnabled)
        c) Add env vars to `.env.example`: NEXT_PUBLIC_POSTHOG_KEY,
           NEXT_PUBLIC_POSTHOG_HOST
        d) Create `src/components/observability/PostHogProvider.tsx` —
           client component wrapper that calls initObservability() in a useEffect
        e) Wrap `src/app/layout.tsx` children with the provider

      Day 5 — Sentry error tracking:
        a) Run `npx @sentry/wizard@latest -i nextjs` (interactive setup —
           may need user input for project selection)
        b) Verify it created `instrumentation.ts`, `sentry.client.config.ts`,
           `sentry.server.config.ts`, `sentry.edge.config.ts`
        c) Add SENTRY_DSN, SENTRY_AUTH_TOKEN to `.env.example`
        d) Create `src/lib/observability/sentry.ts` helper for the
           error.tsx route boundary integration (will be used in Phase 5
           when error.tsx files are created)
        e) Set `enabled: process.env.NODE_ENV === 'production'` in client config

      Day 6 — Impeccable design plugin:
        a) Run `npx claudepluginhub pbakaus/impeccable --plugin impeccable`
        b) Verify the plugin loads in Claude Code (`/audit`, `/critique`,
           `/polish` commands available)
        c) Document the workflow integration in `.cursor/active_task.md`
           template — note that future frontend WFs should run `/critique`
           after Phase 4 component creation per the §7a workflow table

      Day 8-9 — Lighthouse CI:
        a) Install: `npm install --save-dev @lhci/cli`
        b) Create `.lighthouserc.json` with the budget config from spec 75 §7a
        c) Create `.github/workflows/lighthouse.yml` that runs on every PR
        d) Add `lighthouse:ci` script to package.json
        e) Verify locally: `npx lhci autorun --collect.url=http://localhost:3000`

- [ ] Auth Boundary & Secrets: 
      - PostHog key (NEXT_PUBLIC_POSTHOG_KEY) is intentionally public — it's
        scoped per-project at the PostHog level, not a secret. Documented in
        §4.3 of engineering standards as an exception to the "no secrets in
        client" rule.
      - Sentry DSN (NEXT_PUBLIC_SENTRY_DSN) same — public by design.
      - SENTRY_AUTH_TOKEN is build-time only, never exposed to client. Used
        only for source map upload during `next build`. Goes in CI secrets,
        not .env.
      - No new API routes in this phase, so no middleware verification needed.

- [ ] Green Light: 
      - `npm run test` — must show 2428 + new observability/sentry/logger
        tests all passing (~2450+)
      - `npm run lint -- --fix` — all pass
      - `npm run typecheck` — verifies the new strict flags don't break
        existing code (may surface latent issues that need fixing — addressed
        as part of this WF)
      - `npx lhci autorun` against local dev server — confirms Lighthouse CI
        config works
      - `git commit` — verifies the new pre-commit hook runs Biome correctly
      Output visible execution summary using ✅/⬜ for every step above. → WF6.
```

## Risk Notes

1. **Stricter tsconfig may surface existing latent issues.** `noUncheckedIndexedAccess` is the most likely culprit — anywhere we do `array[0]` without null check will now flag. **Mitigation:** Run `npm run typecheck` after the tsconfig change, fix issues iteratively before moving to PostHog. Budget extra time on Day 1-2 for this.

2. **Sentry wizard is interactive and may need a real Sentry project.** **Mitigation:** Either set up the Sentry project manually first, OR run the wizard in non-interactive mode with project ID from the user. Document which approach in the implementation step.

3. **Husky pre-commit changes affect everyone's workflow.** **Mitigation:** Test the new hook on at least 3 different commit scenarios (frontend file change, backend file change, mixed) before considering Day 1-2 complete.

4. **Lighthouse CI may fail on the existing app at first.** Existing pages may not meet the new ≥90 mobile threshold. **Mitigation:** Run Lighthouse against the current `/search` and `/dashboard` pages BEFORE committing the workflow file. If they fail, either (a) fix them as part of this WF, or (b) scope Lighthouse CI to only run against `/leads` once it exists, deferring the full enforcement to Phase 5+. Decision required from user when this step is reached.

5. **Impeccable plugin install path is unverified.** **Mitigation:** Already tested the install command earlier in this conversation (it worked for me — `npx claudepluginhub pbakaus/impeccable --plugin impeccable`). Should work the same way during implementation.
