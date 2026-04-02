# Active Task: WF2 — B5 Unhandled JSON.parse (Phase 3)
**Status:** Planning
**Workflow:** WF2 — Feature Enhancement
**Rollback Anchor:** `fda764e`

## Context
* **Goal:** Add try-catch protection to 4 scripts with unguarded JSON.parse on external/untrusted data.
* **Target Spec:** `docs/specs/pipeline/40_pipeline_system.md`
* **Key Files:** `scripts/compute-centroids.js`, `scripts/load-neighbourhoods.js`, `scripts/load-permits.js`, `scripts/task-init.mjs`

## State Verification
Spot-check found only **4 of 10** scripts are actually vulnerable. The other 6 already have try-catch wrappers.
B7 (substring CPU) — **0 real violations** (all use indexed prefix matching). No changes.
B13 (rowCount) — **0 real violations** (all guarded by IS DISTINCT FROM). No changes.

| Script | Line | Data Source | Risk |
|--------|------|------------|------|
| `compute-centroids.js` | 111 | `JSON.parse(row.geometry)` — DB column, could be corrupted | VULNERABLE |
| `load-neighbourhoods.js` | 107 | `JSON.parse(raw)` — external GeoJSON file from disk | VULNERABLE |
| `load-permits.js` | 407 | `JSON.parse(raw)` — external JSON file | VULNERABLE |
| `task-init.mjs` | 84 | `JSON.parse(fs.readFileSync(...))` — manifest.json | VULNERABLE (low — internal file) |

## Technical Implementation

### Fix 1: `compute-centroids.js:111` — geometry parsing
Wrap `JSON.parse(row.geometry)` in try-catch. On failure, skip the row and log a warning. The centroid can't be computed from corrupt geometry.

### Fix 2: `load-neighbourhoods.js:107` — GeoJSON file parsing
Wrap `JSON.parse(raw)` in try-catch. On failure, throw a descriptive error (file path + first 100 chars of raw) so the pipeline fails loudly instead of crashing with "Unexpected token".

### Fix 3: `load-permits.js:407` — JSON file parsing
Same pattern as Fix 2 — wrap with descriptive error on malformed file.

### Fix 4: `task-init.mjs:84` — manifest.json parsing
Wrap with descriptive error including file path. Lowest risk since this is an internal config file.

## Database Impact
NO

## Standards Compliance
* **Try-Catch Boundary:** Adding try-catch to unprotected JSON.parse calls
* **Unhappy Path Tests:** Source-level assertions that JSON.parse calls are wrapped
* **logError Mandate:** N/A — pipeline SDK logging
* **Mobile-First:** N/A — backend scripts

## Execution Plan
- [ ] **State Verification:** 4 scripts confirmed vulnerable, 6 already safe
- [ ] **Guardrail Test:** Source-level tests that JSON.parse is wrapped in try-catch in each script
- [ ] **Red Light:** Verify tests fail
- [ ] **Implementation:** Add try-catch wrappers to 4 scripts
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6
