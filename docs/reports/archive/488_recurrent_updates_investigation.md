# Investigation Report: The 488 Recurrent Record Updates (Confirmed Root Cause)

## The Symptom
Every time the `permits` ingestion pipeline runs against the CKAN open data API, it consistently reports exactly **488 updated records**, even when the CKAN dataset hasn't actually been modified by the city. 

## The Confirmed Root Cause: Cross-Batch Ping-Pong Updates
The root cause has been definitively identified as an interaction between **dirty CKAN data** and our script's **batch-level deduplication boundaries**.

### 1. The Dirty Data
Toronto Open Data's CKAN payload currently contains approximately **244 duplicate records** (meaning 244 instances where a specific `permit_num` + `revision_num` key appears twice in the data stream, yielding 488 actual JSON objects). Crucially, these duplicate pairs contain slightly different data (e.g., an altered timestamp or whitespace).

### 2. The Deduplication Blind Spot
Line 145-149 of `scripts/load-permits.js` implements a "last occurrence wins" deduplication logic:
```javascript
// Deduplicate within batch - last occurrence wins
const seen = new Map();
for (const row of batch) {
  seen.set(`${row.permit_num}--${row.revision_num}`, row);
}
```
**The Flaw:** This deduplication *only* operates within a single 500-record batch (`pipeline.BATCH_SIZE`). Because CKAN streams via pagination, the first occurrence of the duplicate (Occurrence A) often lands in Batch #1, while the second occurrence (Occurrence B) lands later in Batch #5.

### 3. The Infinite Update Cycle (The Ping-Pong Effect)
Because Occurrence A and Occurrence B exist in separate execution batches, the script fails to deduplicate them. This creates a perpetual ping-pong effect on every sync run:

**How a single run generates exactly 488 updates (244 pairs × 2 updates):**
1. **Start of Run:** The database enters the run holding the final state from yesterday (State B).
2. **Processing Batch #1:** The script fetches Occurrence A. It computes Hash A. It queries the DB and compares it to the stored Hash (which is currently Hash B). They do not match. 
   - *Result:* The script triggers an `ON CONFLICT DO UPDATE` to overwrite the row with State A. **(Update #1 recorded)**
3. **Processing Batch #5:** Later in the exact same run, the script fetches Occurrence B. It computes Hash B. It compares it to the newly stored DB Hash (which is now Hash A). They do not match.
   - *Result:* The script triggers an `ON CONFLICT DO UPDATE` to overwrite the row back to State B. **(Update #2 recorded)**

This means every one of the 244 duplicate pairs triggers **two** updates per run (A overwriting B, then B overwriting A). 
`244 duplicate pairs × 2 updates = 488 ghost updates.`

## The Fix Strategy
To break the cycle, deduplication must be elevated from the **batch level** to the **global stream level**. 

Instead of deduplicating inside `insertBatch()`, the pipeline must maintain a global `seen` cache for the entire CKAN fetch. The script should ideally:
1. Stream through all CKAN pages and deduplicate globally based on the highest integer `_id` before yielding batches.
2. Only process hashes and execute DB upserts *after* the global deduplication map is finalized.

*(Note: Code changes have been halted pending review of this summary).*
