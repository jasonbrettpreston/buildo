# Lead Feed Health Dashboard - Code Review

**Evaluated By:** Antigravity (Google DeepMind Agentic IDE)
**Date:** April 2026

This document presents a comprehensive code review of the Lead Feed Health Dashboard, examining the frontend React UI, the Next.js API route layer, and the underlying PostgreSQL analytical aggregate queries.

---

## 1. File-by-File Analysis & Deep-Dive Logic Bugs

### A. `LeadFeedHealthDashboard.tsx` (Frontend Component)
**🚨 Deep-Dive Logic Bug:** *Ghost Polling on Fatal Error*
When the page fails to load, the dashboard renders an early-return Error state containing a manual "Retry" button. However, the `useEffect` that mounted the component already fired `setInterval(fetchHealth, 10_000)` and it never clears during an early-return render! The app silently hammers the backend every 10 seconds.

**🚨 Deep-Dive Logic Bug:** *The Missing-Cron Green Light*
If the database `timing_calibration` cron stops running and the table truncates, `timingFreshnessHours` outputs as `null`. This causes `isTimingStale` to evaluate to `false`. The dashboard will happily grant the section a perfect **GREEN** light, hiding the fact that the entire timing engine has vanished.


### B. `lead-feed-health.ts` (Database Analytics) & Structural Limits

**💥 The Level 8 Doomsday Protocol: Internal DDOS**
The developer left a comment stating they consolidated 14 queries to 7 queries to *"reduce connection pool pressure."* However, `route.ts` employs a `Promise.all` that simultaneously executes `getLeadFeedReadiness` (8 queries), `getCostCoverage` (1 query), and `getEngagement` (3 queries). 
This blasts **12 parallel database scans** utilizing `COUNT(*)` across tables with over a million rows *simultaneously*. If instances scale or a mere **two** administrators open this dashboard, it requires 24 simultaneous connections every 10 seconds. Since the production Postgres Database Pool limit was raised strictly to `max: 20`, two admins gazing at this dashboard will completely cripple the entire primary production application by starving the connection pool, instantly bringing down the user-facing web app.

**🚨 Deep-Dive Logic Bug:** *USING vs ON NULL Drops*
In `getLeadFeedReadiness`, the query for Feed Eligible Permits dictates:
`JOIN permit_trades pt USING (permit_num, revision_num)`
Under the SQL ISO standard, if `revision_num` is `NULL` in the Permits table, `NULL = NULL` equates to `FALSE`. This immediately severs all `JOIN` links for every single un-revisioned permit. The real feed logic uses a custom wrapper `(pt.revision_num = p.revision_num OR (pt.revision_num IS NULL AND p.revision_num IS NULL))` to bypass this DB engine rule. Consequently, the dashboard silently drops all un-revisioned rows from the Readiness display, creating a catastrophic divergence from reality.

**🚨 Deep-Dive Logic Bug:** *The Array NULL Filter BlackHole*
When compiling the `permits_by_opportunity_status` breakdown, the final fallback counter uses:
`COUNT(*) FILTER (WHERE status NOT IN ('Permit Issued','Inspection','Application','Cancelled','Revoked','Closed')) as opp_other_active`
In PostgreSQL, conducting a `NOT IN (...)` lookup against a `NULL` column evaluates strictly to `NULL`, inherently failing the `WHERE` closure! Permits with unknown/null statuses are entirely annihilated from the mathematical breakdown, meaning the four UI pills on the dashboard actively add up to less than total Feed Active permits.

---

### Previous Deepest Flaws (Level 6 & 7)

1. **The Missing JOIN Crash (100% Fatal):** The Builder feed-eligible query checks `(website IS NOT NULL)` directly against `wsib_registry`, a table that doesn't hold the website column! It requires a `JOIN` to `entities`. This will crash the Endpoint immediately.
2. **Silent Engagement Dropping (Phase 3):** Users saving permits they viewed >7 days ago are not captured in the 7-Day Engagement metric because `viewed_at >= CURRENT_DATE - 7 Days` aggressively dumps the row prior to checking `saved = true`.
3. **The Revision-Nullification Concat Drop:** `COUNT(DISTINCT p.permit_num || ':' || p.revision_num)`. In Postgres, processing a concat string with `NULL` wipes the entire string to `NULL`. Unrevisioned permits completely skip the unique tracker.
4. **The Denominational Isolation Bug:** The Cost Coverage percentage isolates its % math by calculating purely against the size of the *cache table* rather than the literal uncosted volume living within the core dataset.
5. **Corrupted Test Feed Averages:** Test feed arrays forcefully merge builder structures into permit arrays. Since builders possess no native scoring inputs for `timing` and `opportunity`, the JavaScript `reduce` treats builder attributes as literal zero values (`0`); collapsing real timing averages radically toward the bottom bounds without warning.

---

## Conclusion
**Grade: D (Downgraded due to Cascading Denial of Service Risks)**
The Dashboard's theoretical React architecture limits internal bugs beautifully, but its execution on the application bridges is fatal. Its data retrieval method has morphed into a literal internal attack vector, threatening to overwhelm the backend pool within one tab opening. The system suffers deeply from PostgreSQL math strictures (null concat wipes, null boolean wipes, null boolean JOIN severs) and desperately requires mathematical hardening, correlation table decoupling, and a switch away from aggressive `10_000ms` frontend intervals into edge-cached NextJS data fetching!
