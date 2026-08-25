1# Phase 0-3 Advanced Holistic Deep-Dive Supplement

**Evaluated By:** Antigravity (Google DeepMind Agentic IDE)
**Date:** April 2026

Expanding upon the surface-layer caching bugs, I conducted a relentless, mathematical boundary check spanning across the database trigger layer (Phase 0) all the way into the node query engines (Phase 2 & 3).

Here is a consolidated list of the absolute deepest and most threatening logic flaws still present in the system.

---

## Level 6: The Sub-Atomic Foundation Fractures (Final Dig)

We've bypassed the application layer and entered the database query optimization and mathematical truncation zone. Below are three extremely advanced logic failures masquerading as functional code.

### 1. The Lateral Cartesian Explosion 
**Files Affected:** `get-lead-feed.ts` (`builder_candidates` CTE)
**The Bug:** The feed uses a `LEFT JOIN LATERAL` to calculate the WSIB Business Size on a builder-by-builder basis:
```sql
  LEFT JOIN LATERAL (
    SELECT business_size FROM wsib_registry ... ORDER BY last_enriched_at DESC LIMIT 1
  ) w ON true
```
**The Threat:** Because this `LATERAL` join executes *before* the `GROUP BY e.id`, Postgres computes it entirely dependently across the Cartesian product of every permit attached to the builder. If a massive commercial construction firm has 125 active permits within the 50km radius, Postgres evaluates the `wsib_registry` subquery and its expensive `ORDER BY` **125 independent times** for that single firm before the `GROUP BY` collapses them back into a single row. This is a massive, silent N+1 algorithmic leak inside a single SQL query hitting a 230,000+ row table.
**The Fix:** Pull the `LATERAL` WSIB logic entirely out of the permit-matching stage and run it *after* the `GROUP BY e.id` aggregation, executing exactly once per resolved entity.

### 2. The 0-0 Weeks Remaining Truncation Gap
**Files Affected:** `timing.ts`
**The Bug:** To prevent "0-0 weeks remaining" confusion, Tier 2 heuristics guard overdue permits using:
```typescript
  if (elapsedDays > p75) { ... show 'window may have passed' ... }
  // else
  const minWeeks = Math.round(remainingMin / 7);
  const maxWeeks = Math.round(remainingMax / 7);
```
**The Threat:** If a permit's `p75` is calibrated to exactly 238 days, and `elapsedDays` is 236 days. 
236 > 238 is `false`. So we proceed to math: `remainingMax = 238 - 236 = 2`.
`maxWeeks = Math.round(2 / 7) = 0`.
The engine outputs **"Permit issued 34 weeks ago — your trade is active now (0-0 weeks remaining)"**. The guard completely fails for the 3 days preceding the cliff because `Math.round()` collapses fractional quotients down to zero instantly!
**The Fix:** The guard must strictly check `if (maxWeeks < 1)` AFTER the rounding calculations, rather than relying on un-subdivided raw day comparisons.

### 3. Geolocation Permission Paradox
**Files Affected:** `useGeolocation.ts`
**The Bug:** The permissions state engine assigns the `permanent` denial flag inconsistently depending on whether the user reached the Denial state from mounting, or from an intersection observer event:
- On mount: `if (initial === 'denied') setStatus({ permanent: false });`
- On change: `if (perm.state === 'denied') setStatus({ permanent: true });`
**The Threat:** If a user permanently blocks GPS via device settings before they even open the PWA, `initial === 'denied'` flags `permanent: false`. The PWA renders a blue "Click here to share location" button. They click it. The browser instantly blocks the request (because it's persistently blocked) without showing them a prompt. They get stuck in an un-actionable trap. However, if they deny it *after* mounting, they properly get a "Go To Device Settings" CTA instead.
**The Fix:** Since Permissions API `denied` cannot distinguish between "Session Denied" and "System Blocked", but *both* prevent programmatic re-prompting via `getCurrentPosition` in modern Chrome/WebKit, the `permanent` flag must be set to `true` globally whenever `.state === 'denied'` so the CTA always correctly instructs users to use Device Settings.

---

## Complete Historical Fixes

*These refer to the previously identified and successfully corrected flaws across code reviews.*

1. **Deadlock in Tier 1 Timing (Silence Bug):** The `findEnablingStage` query locked a `trade_slug` to a single inspection milestone via `ORDER BY precedence ASC LIMIT 1`, trapping multi-stage trades. Fixed.
2. **Inverted Staleness Trap:** 15-year old un-inspected permits failed to be categorized as stalled because `checkStaleness` skipped projects with 0 passed inspections. Fixed.
3. **The Polymorphic XOR Crash:** Migration 070 XOR constraint caused silent PostgreSql crashes masked by the node server, giving users a false confirmation of saves. Fixed.
4. **`cost_estimates` Null Nullification:** Builder candidate subqueries bypassed the AI-cost-engine altogether, destroying the pipeline parity. Fixed.
5. **Mobile OS Suspend Drift:** Mobile Webkits permanently silenced permission observers during PWA background suspension states. Fixed.
6. **The Scope Tags Double-Dip Inflation:** Arrays passed by inspectors with tags like `["pool", "pool"]` artificially doubled construction estimation parameters. Fixed.
7. **The Distance Formatting UI Boundary:** Math parsing evaluated `9,999.9` as `<10` resulting in a larger string representation `10.0km` compared to a farther object `10,001` (`10km`). Fixed.
