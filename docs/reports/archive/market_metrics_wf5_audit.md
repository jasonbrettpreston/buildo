# WF5 Audit: Market Metrics Dashboard
**Date**: March 7, 2026

This report constitutes a Workflow 5 (WF5) audit of the Market Metrics Admin View (`/admin/market-metrics`), evaluating code health, logic accuracy, security, and UX.

## Evaluation Rubric
The audit employs the following rubric to establish empirical ratings across four key vectors:

| Evaluation Vector | Criteria for Grade 'A' | Grade Assessment | Finding |
| :--- | :--- | :--- | :--- |
| **Logic & Accuracy** | Data correctly anchors to relevant timeframes; calculations (YoY, totals, yields) accurately reflect database state without false skew. | **FAIL** | "Stale tags" / "Low counts"; Point-in-time anomaly (comparing partial current month vs fully completed past month YoY). |
| **Security Architecture** | Endpoints enforcing strict authentication parity with defined spec roles; secure data transport; no unauthenticated data spillage. | **FAIL** | Endpoint lacks *any* `withAuth` wrapper; data openly accessible to unauthorized scripts. |
| **Code Health** | Clear separation of concerns; optimized database interactions (e.g., CTEs vs memory overhead); minimal UI bloat. | **A-** | Excellent Postgres aggregations via CTEs and custom lightweight SVGs; minor monolithic debt in route file sizing. |
| **UX & Visuals** | Intuitive visual hierarchy; responsive; comparisons (like YoY) are clearly visible without occlusion; clean empty states. | **B+** | Clean visual hierarchy matching SaaS density; SVG occlusion bug makes YoY bars invisible when current bars are taller. |


## 1. Bug Diagnosis: "Low Numbers" & "Stale Tags"
**Finding: Partial-Month vs Full-Month YoY Collapse**
The core issue reported by the user (leads by trade showing tiny numbers, tags appearing stale) is caused by a time-window mismatch at the beginning of a new month.
*   **The Bug:** The `getReferenceMonth()` function dynamically sets the dashboard's focus month to `MAX(issued_date)` truncated to the month. Because today is March 7th, the reference month snaps to March 2026.
*   **The Impact:** The queries for "Leads by Trade", "Scope Tags", and the top "KPI Row" are grabbing the first ~7 days of March (which often contain very few fully scraped/classified permits) and comparing them YoY against the *entire 31 days* of March 2025. This makes current metrics look catastrophically low and "stale."
*   **The Fix:** `getReferenceMonth()` should default to the **last fully completed calendar month** rather than the current bleeding-edge month to ensure accurate stable volumes and apples-to-apples YoY comparisons.

## 2. Security
**Rating: FAIL**
*   **Missing Auth Guard:** The API endpoint (`src/app/api/admin/market-metrics/route.ts`) completely lacks authentication or authorization checks. The spec explicitly states "Anonymous: None, Authenticated: None, Admin: Read". Any user or public scraper can currently hit `/api/admin/market-metrics` and dump the entire city's aggregated pipeline metrics.
*   **The Fix:** Inject the standard `withAuth` or session validation block at the top of the `GET` handler.

## 3. Code Health & Logic
**Rating: A-**
*   **Strengths:** 
    *   The use of custom lightweight `<svg>` charting in `page.tsx` instead of importing heavy graphing libraries (like Recharts/Chart.js) is excellent for admin bundle sizes.
    *   The SQL CTEs are highly optimized, doing the heavy aggregation directly in Postgres rather than shipping tens of thousands of rows to the Node.js layer.
*   **Technical Debt:** 
    *   `route.ts` is highly monolithic (450+ lines of SQL queries). It works efficiently, but separating the query strings into a dedicated data-access repository would improve testability.

## 4. UX & Visual Accuracy
**Rating: B+**
*   **Strengths:** The visual hierarchy is very clean, perfectly matching the SaaS-like density of the Data Quality dashboard. 
*   **Accuracy Risks:** The YoY "Faded bars" in the `ResComChart` overlap with the current bars. If the YoY bar is shorter than the current bar, it becomes completely invisible behind the solid current bar, making the visual comparison impossible.
    *   **The Fix:** We should place the YoY bars side-by-side with the current bars, or use a "target line" (horizontal tick) for YoY instead of a background fill that gets hidden.

## Conclusion & Next Steps
We will move to execution to apply the following fixes:
1.  **Security:** Secure `/api/admin/market-metrics/route.ts` with Admin authentication.
2.  **Logic:** Modify `getReferenceMonth()` to return `CURRENT_DATE - INTERVAL '1 month'` (the last fully completed month).
3.  **UX:** Adjust the `ResComChart` SVG layout to prevent current bars from obscuring YoY bars.

---

## 5. Resolution Update
**Date**: March 7, 2026

| # | Finding | Status | Resolution |
|---|---------|--------|------------|
| 1 | Security — missing auth | **RESOLVED** | Middleware already protects `/api/admin/*` via `classifyRoute()` in `route-guard.ts` line 89. No code change needed — audit finding was based on inspecting route.ts in isolation. |
| 2 | Logic — partial-month YoY | **RESOLVED** | `getReferenceMonth()` now uses SQL CASE: if MAX(issued_date) is in current calendar month, subtract 1 month. Extracted to `src/lib/market-metrics/queries.ts`. |
| 3 | UX — ResComChart YoY occlusion | **RESOLVED** | Replaced background-fill opacity bars with dashed horizontal "target lines" overlaid on current bars. YoY is always visible regardless of relative bar height. |
| 4 | Tech debt — monolithic route.ts | **RESOLVED** | Extracted all 7 query functions to `src/lib/market-metrics/queries.ts`. `route.ts` reduced from 458 lines to 42 lines (thin handler only). |

**Test Coverage:** 5 new guardrail tests added. Full suite: 1781 tests passing.

**All audit findings are now resolved. No remaining debt.**
