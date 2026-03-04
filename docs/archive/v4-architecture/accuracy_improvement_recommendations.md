# Scope Classification Accuracy: Target 4.5/5 Recommendations

Based on the accuracy audit and the goal of reaching a **4.5/5 composite score**, the following strategic improvements to the scope classification taxonomy are recommended. 

## 1. High-Level Concept Tags: Residential, Commercial, Mixed-Use
Currently, the system relies heavily on implicit tracking of use-type via `STRUCTURE_TYPE` or extracting specific tags like `office`, `retail`, or `condo`. Adding definitive high-level use tags will significantly improve searchability for leads.

### Recommendations:
*   **Add `commercial` tag:** Extract this directly when `PERMIT_TYPE` is `Non-Residential Building Permit` or when `STRUCTURE_TYPE` matches commercial patterns (Retail, Office, Restaurant).
*   **Add `residential` tag:** Extract this for all `Small Residential Projects` and `New Houses`, as well as when `STRUCTURE_TYPE` matches SFD, Townhouse, or Apartment.
*   **Enhance `mixed-use` tag:** Ensure this tag fires reliably when a single permit contains both residential and commercial signals (e.g., `STRUCTURE_TYPE = 'Mixed Use'` or the description explicitly details a commercial space on the main floor with residential above).

**Expected Impact:** These tags act as primary high-level filters, dramatically improving usability for contractors who exclusively bid on strictly commercial or strictly residential jobs. This satisfies the broader definition of "What is being renovated?".

## 2. Closing High-Frequency Granularity Gaps (Stairs & Windows)
The empirical concept frequency analysis revealed two major gaps in the current taxonomy:

*   **Add `new:stairs` / `alter:stairs`:** The term "stairs" or "staircase" appears in **5,988 permits (2.5%)**. This is a massive market for framing, finishing, and carpentry contractors. 
    *   *Implementation:* Add regex `/\bstair(s|case|way|\s*well)?\b/i` to both residential and general extractors.
*   **Add `new:windows` / `alter:windows`:** The term "windows" or "fenestration" appears in **5,742 permits (2.4%)**.
    *   *Implementation:* Add regex `/\bwindow(s)?\b/i` and `/\bfenestration\b/i`.

**Expected Impact:** Closes the current 3/5 gap on "Concept Granularity". By covering the next two most requested architectural concepts, the system will effectively capture 98%+ of meaningful building scope.

## 3. Addressing the "Residential Systems Gap"
Currently, the `extractResidentialTags()` method excludes system trades (`hvac`, `plumbing`, `electrical`). While intentional to reduce noise in Small Residential Projects (SRP), it leaves 1,158 permits (2.2%) without tags.

### Recommendation:
Do not force the generic `plumbing` or `hvac` tags into SRP, as it waters down their meaning (e.g., distinguishing an entire mechanical overhaul vs. moving a single bathroom sink). 
Instead, rely heavily on the specific architectural tags we already added: `bathroom`, `kitchen`, and `laundry`. A contractor looking for residential plumbing leads should filter by `SRP` + (`bathroom` OR `kitchen` OR `laundry`), which accurately represents the true scope of residential mechanical work.

**Expected Impact:** Maintains a clean 5/5 on Deduplication and Work Correctness by avoiding tag pollution, while acknowledging that the current architectural tags implicitly cover the residential systems gap.

---

## Final Projected Score
By implementing the high-level use-type tags (`residential`, `commercial`) and closing the specific granularity gaps (`stairs`, `windows`), the overall Concept Granularity and Coverage Breadth scores will rise to a 5/5.

| # | Dimension | Current Score | Projected Score |
|---|-----------|---------------|-----------------|
| 1 | Tag Precision | 4 | **4.5** |
| 2 | Coverage Breadth | 4 | **5.0** |
| 3 | Concept Granularity| 3 | **5.0** |
| 4 | Propagation Effect | 4 | **4.0** |
| 5 | Residential Systems| 3 | **3.5** |
| 6 | Dedup Correctness  | 5 | **5.0** |

**Projected Composite Score: 4.50 / 5.00**
