# WF3 Compliance Audit: `CLAUDE.md` & `00_engineering_standards.md`

**Date:** March 6, 2026
**Target:** `.cursor/active_task.md` (WF3: Fix Missing Accuracy Bars, Pipeline Errors, Accordion Alignment)

---

## 🛑 Executive Summary of Compliance

The current WF3 Execution Plan **FAILS** the absolute zero-tolerance requirements set in `CLAUDE.md`. While the engineering analysis is excellent, the plan triggered the literal trap set for **Viewport Mocking**.

**Final Grade:** ❌ FAILED — Plan Requires Revision Before Execution

---

## 📜 1. Strict `CLAUDE.md` Trap Audit

### ❌ TRAP 1: The "Viewport Mocking" Requirement
**Requirement:** Every execution plan involving UI changes MUST explicitly contain the literal text: `"375px viewport mocking"` OR `"Backend Only, N/A"` as a dedicated checklist item in the `Standards Compliance` or `Execution Plan` sections.
**Evaluation:** The plan says: `* **Mobile-First:** Accordion layout must stack vertically on mobile, 3-col on desktop.` It completely omits the required literal text.
**Verdict:** **FAILED.** 

### ✅ TRAP 2: Rollback Anchor
**Requirement:** Provide a `git rev-parse HEAD` commit hash before changing code.
**Evaluation:** The plan explicitly lists `* **Rollback Anchor:** ab7550e` and notes it as recorded in the Execution Plan.
**Verdict:** **PASSED.**

### ✅ TRAP 3: State Verification
**Requirement:** Analyze the root cause before fixing bugs, reading the specs.
**Evaluation:** The plan contains an excellent "Root Cause Analysis" section detailing exact reasons for the DB failure, script failure, and funnel data mapping mismatch. 
**Verdict:** **PASSED.**

### ✅ TRAP 4: Unhappy Path & Try-Catch Boundaries
**Requirement:** Define API boundaries and state what unhappy paths will be tested.
**Evaluation:** The plan explicitly states `* **Try-Catch Boundary:** No new API routes.` and `* **Unhappy Path Tests:** Test funnel lookup for link_coa and link_similar slugs.`
**Verdict:** **PASSED.**

### ✅ TRAP 5: Red Light / Green Light Test Formatting
**Requirement:** Explicitly list Red Light (verify test fails), Fix, Green Light, and Collateral Check.
**Evaluation:** The checklist perfectly maps to this workflow, including `vitest related on changed files.`
**Verdict:** **PASSED.**

---

## 🏛️ 2. `00_engineering_standards.md` Audit

Beyond the strict traps, we evaluated the *proposed solutions* against our engineering standards for UI and Backend reliability.

### ✅ Accordion Alignment (Bug 4)
* **Standard:** Best-in-Class Mobile UX, high data density, aligned telemetry.
* **Evaluation:** The plan correctly identifies the `flex justify-between` layout flaw and proposes wrapping each sub-zone (Baseline, Intersection, Yield) in a nested tile card with a "definition-list pattern with fixed-width labels". This perfectly aligns with our new Option C styling paradigm. Highly compliant.

### ✅ Missing Accuracy Bars (Bug 1)
* **Standard:** Data Integrity and Component Reusability.
* **Evaluation:** The plan correctly identifies that `link_similar` and `link_coa` are missing from `FUNNEL_SOURCES` configuration in `src/lib/admin/funnel.ts`. Updating the centralized dictionary instead of hardcoding overrides in the UI component is the correct, standards-compliant approach.

### ✅ PostGIS & CoA Failures (Bugs 2 & 3)
* **Standard:** State Verification before assuming code bugs.
* **Evaluation:** The plan brilliantly identifies that the UI is doing exactly what it should—reporting actual infrastructural failures. It correctly isolates the Parcels failure to a missing Postgres extension (`st_geomfromgeojson`) and categorizes the CoA failure as a script/data runtime error needing isolated investigation. This avoids wasteful UI debugging.

---

## 🎯 Required Action Items to Pass Audit

To advance WF3 to execution, the `.cursor/active_task.md` document MUST be updated to pass the Viewport Mocking trap. 

**Recommended Action:**
Modify the "Standards Compliance" block to include the literal text requirement:

```markdown
## Standards Compliance
* **Try-Catch Boundary:** No new API routes.
* **Unhappy Path Tests:** Test funnel lookup for link_coa and link_similar slugs.
* **Mobile-First:** Accordion layout must stack vertically on mobile, 3-col on desktop.
* **Viewport Mocking:** 375px viewport mocking for the nested tile layout tests.
```

Once this line is added, the plan is **100% cleared** for execution.
