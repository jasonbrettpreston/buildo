# Tracking Data Accuracy Over Time

## 1. Overview
The Admin Panel’s current "Data Quality Section" provides an instantaneous snapshot of today’s accuracy (e.g., "Geocoding is at 99.2% today"). However, it cannot answer the fundamental operational question: **"Are our recent classification updates actually making the data better, or did we introduce a regression that is slowly degrading the database?"**

To monitor if our accuracy across the 7 data sources is improving or decreasing over time, we must shift from a fixed "current state" view to a **Historical Cohort Analysis** model.

---

## 2. Approach 1: Point-in-Time Metric Snapshots (The Macro View)

The easiest way to track overall platform health is to record the dashboard data every night. If we change the classification engine on Tuesday, we want to know if the overall trade classification metric goes up or down on Wednesday.

**Implementation Strategy:**
1. **New Database Table (`daily_accuracy_snapshots`):**
   - We create a simple SQL table that runs every night at 2:00 AM.
   - It calculates the exact percentages for our core metrics (Builder Identification, Trade Classification, CoA Linking, Parcel Linking) and inserts a single row with a `dated_on` timestamp.
2. **Admin UI Output (Line Charts):**
   - Below the current progress bars in the Admin Panel, we introduce an "Accuracy Trend (Past 90 Days)" line chart.
   - If the line for "Trade Classification" jumps from 44% to 58% on March 15th, we immediately know the expansion of the commercial Tag-Matrix deployed on March 14th was highly successful.
   - If the "Builder Enrichment" line starts sloping downward week over week, we know our API integration (like Google Places) is failing to parse newer format builder names.

---

## 3. Approach 2: Issuance Cohort Analysis (The Granular View)

The problem with measuring total database accuracy (130,000+ permits) is that it takes a massive amount of new, highly accurate data to move the needle on the 10-year historical average. 

To see if our current ingestion pipelines are performing well **right now**, we must measure accuracy based on the *Permit Issue Date*. 

**Implementation Strategy:**
We track the "Trade Classification Metric" not as one giant number, but broken down by the month the permit was issued. 
* **Example Report Visualization:**
  * **Q1 2024 Permits:** 41% Classified
  * **Q2 2024 Permits:** 42% Classified
  * **Q3 2024 Permits:** 45% Classified
  * **Q4 2024 Permits:** 58% Classified
  * **January 2025 Permits:** 62% Classified

**Why this matters:**
If January 2025 is jumping to 62%, the classification engine is performing exceptionally well on *modern, newly formatted* permit data. It tells the team that the overall engine is fine, and the 44% average is simply due to poor data formatting from 2018 permits dragging the average down. It shifts the operational focus away from "fixing the code" to "cleaning the historical data."

---

## 4. Approach 3: The "Golden Dataset" Regression Test

If we adjust the Tag-Matrix or change how we normalize builder names, we run the risk of breaking existing, correct classifications when the backend scripts re-sync. We must know *before* we deploy if accuracy will decrease.

**Implementation Strategy:**
1. **Define the Golden Data:** Curate a table of ~500 highly diverse, representative permits (e.g., 100 new houses, 100 commercial fit-outs, 100 minor alterations).
2. **Human Verification:** Manually verify and hardcode the perfect, expected Trade Classifications and Builder Normalizations for these 500 records.
3. **Automated CI/CD Checks:** 
   - Every time a developer changes `src/lib/classification/classifier.ts` or `extract-builders.js`, a script runs the new code strictly against the 500 unclassified versions of the Golden Dataset.
   - The script compares its output against the hardcoded perfect answers.
   - **Output:** The terminal reads: *"Classification Accuracy: 98% (Up +2% from previous version). Safe to deploy."* Or conversely, *"Accuracy 81% (Down -4%. You broke the roofing logic)."*

---

## 5. Summary Recommendation for the Admin Panel

To track accuracy over time directly in the Admin Panel without overwhelming the database:

1. **Implement the `daily_accuracy_snapshots` table immediately.** We need a baseline to know where we stand today so we can measure tomorrow's improvements.
2. **Add a "Rolling 30-Day Cohort" metric.** Next to the total "44.1%" classification rate, explicitly display the classification rate for **"Permits issued in the last 30 days"**. This instantly tells the business if the immediate data pipe is flowing cleanly, regardless of historical baggage.
3. **Visualize with Sparklines.** Use simple, space-efficient line graphs (sparklines) next to every data source in the Admin Panel to show if the health of that specific pipe is trending up, flat, or down over the last month.
