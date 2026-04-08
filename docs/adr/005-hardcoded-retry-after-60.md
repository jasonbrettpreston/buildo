# ADR 005: Hardcoded `Retry-After: 60` header on rate-limited responses

**Status:** Accepted
**Date:** 2026-04-08
**Decision-makers:** core team

## Context

`src/features/leads/api/error-mapping.ts` `rateLimited()` returns a 429 with `Retry-After: 60` regardless of the actual rate-limit window or the time remaining until the bucket refills. Adversarial reviewers (Gemini, DeepSeek) flag this every cycle as misleading: "if the bucket refills in 8 seconds, the client wastes 52 seconds; if the window is 30 seconds, the value is wrong."

## Decision

Keep the hardcoded `Retry-After: 60`. Document the constraint in this ADR and revisit when the rate-limiter exposes a precise reset timestamp.

## Rationale

The current rate-limit primitive in `src/lib/auth/rate-limit.ts` returns `{ allowed: boolean, remaining: number }` but does NOT return `reset_at`. The Upstash backing (when configured) does expose a reset timestamp via `@upstash/ratelimit`'s response shape, but the in-memory dev fallback does not. Adding `reset_at` to the contract would require:

1. Plumbing it through both the in-memory and Upstash implementations
2. Updating every consumer of `withRateLimit` to handle the new field
3. Adding a test fixture for "what does in-memory return when no reset is computable" (the answer is "wall-clock + window_sec", which is what `Retry-After: 60` already encodes)

The 60-second window matches the spec 70 §API Endpoints rate-limit window for both feed (30/min) and view (60/min) routes. A client that respects `Retry-After` will succeed on its next attempt. The cost of the imprecision is at most ~50 seconds of wasted client wait, well within the spec's UX tolerance.

The contracts JSON enforcer (`src/tests/contracts.infra.test.ts`) already locks the value to `rate_limits.window_sec = 60`, so future drift between the constant and the header is impossible.

## Consequences

**Accepted:**
- Clients may wait longer than necessary if the bucket refills early
- Reviewers flag the pattern every cycle (mitigated by ADR link in error-mapping.ts header)
- Future window changes (e.g., shortening to 30s) require updating both the contract JSON and this ADR

**Avoided:**
- Refactor of the rate-limit primitive across both backends
- Test surface expansion for a UX nice-to-have

## Re-evaluation Triggers

- Window shortens below 30s — at that point the imprecision becomes noticeable
- Client telemetry shows `Retry-After`-respecting clients are wasting significant idle time
- Upstash rate-limit response shape becomes the only target (in-memory removed) — at which point the precise reset is free
