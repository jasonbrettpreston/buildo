# File Organization & Cleanup Report

Based on a full repository scan (including a `knip` dead code analysis and directory mapping), the codebase has accumulated exploratory "clutter" that should be cleaned up before proceeding with high-velocity feature development. 

Here is the strategic plan to organize the repository and remove unnecessary files.

---

## 1. Dead Code Removal (`src/`)
The `npm run dead-code` scan identified **50 unused exports** and **27 unused exported types** across the `src/` directory. 

* **The Clutter:** These are remnants of old spec architectures (e.g., `DEPRECATED_TIER_2_RULES` in the classification engine, unused mathematical helpers in `src/lib/massing/geometry.ts`, and dangling database queries like `getUnlinkedApplications`).
* **The Risk:** Dead code eats up the AI's context window. When the AI scans `classification/rules.ts`, it has to read and comprehend rules that aren't even used by the application anymore, slowing it down.
* **The Recommendation:** Execute a "Dead Code Purge" task. The AI should run `npm run dead-code` and systematically delete every unused function and type export it discovers in `src/`.

## 2. Script Consolidation (`scripts/`)
There are currently **57 separate `.js` and `.mjs` scripts** sitting in your root `scripts/` directory.

* **The Clutter:** Many of these are one-off exploratory scripts or redundant loaders (e.g., `analyze-lot-size.js`, `analyze-lot-size-json.js`, `analyze-descriptions.js`, `check-multiple-projects.js`, `get-sample-tags.js`).
* **The Risk:** Having 57 scripts in a flat folder makes it difficult for an AI to locate the actual production utility scripts (like the newly created `harvest-tests.mjs`).
* **The Recommendation:** Create subdirectories to organize the context:
  * `scripts/utilities/` - For permanent CLI tools (Env Check, Task Init, Harvester).
  * `scripts/loaders/` - For the `load-*.js` and `seed-*.js` database population scripts.
  * `scripts/analysis/` - Move all the one-off exploratory scripts (e.g., `audit-scope-accuracy.js`) here so they are preserved but out of the immediate line of sight.

## 3. Documentation Archiving (`docs/reports/`)
There are currently **28 distinct Markdown reports** sitting in `docs/reports/`.

* **The Clutter:** We have generated massive amounts of architectural analysis today (e.g., `final_workflow_evaluation_rubric.md`, `spec_optimization_evaluation.md`, `workflow_update_audit.md`). 
* **The Risk:** While these reports are valuable historical records of *why* we changed the architecture, they hold no value for the day-to-day writing of code. If an AI runs a global search, it might accidentally pull context from `workflow_error_reduction.md` instead of the actual `CLAUDE.md` protocol.
* **The Recommendation:** 
  1. Create a `docs/archive/architecture-decisions-v4/` folder.
  2. Move all 28 current reports into that folder. The AI should only refer to the core `docs/specs/` and `CLAUDE.md` going forward.

---

### Suggested Execution Path

To effortlessly implement these cleanups, you can trigger three quick sequential AI commands:

1. `"WF2: Execute a dead-code purge in src/ by running npm run dead-code and deleting all unused exports."`
2. `"WF2: Reorganize the scripts/ directory into utilities/, loaders/, and analysis/ subfolders."`
3. `"WF2: Archive all current markdown files in docs/reports/ into a new docs/archive/v4-architecture/ folder."`
