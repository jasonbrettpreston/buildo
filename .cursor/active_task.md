# Active Task: WF3 — link-neighbourhoods turfPolygons reference in summary
**Status:** Implementation
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `f5a87df`

## Bug
**Line 327:** `const nhoodCount = turfPolygons.length` — `turfPolygons` only exists in the JS fallback else block. When PostGIS path runs and processes permits, this line crashes.
**Why it passed standalone:** 0 permits to link → early return before line 327.
**Why it failed in chain:** step 9 loaded new neighbourhood data → 45 permits relinked → code reached line 327 → crash.

## Fix
Replace `turfPolygons.length` with `nhoods.rows.length` (the neighbourhood count from the DB query, available in both paths).
