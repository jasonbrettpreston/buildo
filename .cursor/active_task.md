# Active Task: WF3 — link-neighbourhoods.js Missing Dependency + Legacy Upgrade
**Status:** Planning
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `795b7d1`

## Context
* **Goal:** Fix crash on `@turf/centroid` missing dependency. Upgrade link-neighbourhoods.js to properly gate Turf.js imports behind the hasPostGIS check so PostGIS environments don't need Turf at all.
* **Target Spec:** `docs/specs/pipeline/60_shared_steps.md`
* **Key Files:** `scripts/link-neighbourhoods.js`, `package.json`

## Bug
**Reproduction:** `node scripts/link-neighbourhoods.js` → `Error: Cannot find module '@turf/centroid'`
**Root Cause:** `@turf/centroid` required at module level (line 22) but never added to `package.json` dependencies. The PostGIS fast path (added this session) doesn't use Turf, but the import crashes before the `hasPostGIS` check runs.

## Technical Implementation

### Fix 1: Lazy-require Turf.js inside the JS fallback path
Move all `require('@turf/...')` calls from module level into the `else` block (JS fallback path). When PostGIS is available, Turf is never imported. When PostGIS is unavailable, the require runs and throws a clear error if not installed.

### Fix 2: Install @turf/centroid as dependency
Already done (`npm install @turf/centroid`). This ensures the JS fallback works in dev environments without PostGIS.

### Fix 3: Apply same pattern to link-parcels.js and link-massing.js
Check if they have the same module-level Turf imports that would crash in environments where Turf isn't installed. Ensure all Turf imports are lazy (inside the fallback path).

## Standards Compliance
* **Try-Catch Boundary:** N/A — import restructuring
* **Unhappy Path Tests:** Add test that link-neighbourhoods.js doesn't require Turf at module level
* **logError Mandate:** N/A
* **Mobile-First:** N/A

## Execution Plan
- [ ] **Rollback Anchor:** `795b7d1`
- [ ] **Fix 1:** Move Turf require() calls into JS fallback else block in link-neighbourhoods.js
- [ ] **Fix 2:** Verify @turf/centroid in package.json (already installed)
- [ ] **Fix 3:** Check link-parcels.js and link-massing.js for same pattern
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass.
