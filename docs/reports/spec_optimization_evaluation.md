# Specification Optimization Evaluation

## 1. Executive Summary
This report evaluates the current structure and length of the system specifications (e.g., `docs/specs/*.md`) against the newly optimized `engineering_workflows.md` protocol. The primary goal is to determine if the specifications themselves need to be streamlined to maximize AI performance, code health, and security during Spec-Led Development.

**Overall Grade:** B- (Highly Detailed, but Cognitively Bloated for AI)

The current specs (such as the 369-line `06_data_api.md`) are exceptionally thorough for *human* engineers. However, when fed into an AI context window alongside the Master Protocol, they suffer from "Over-Prescription Bloat," which can actually degrade AI performance and limit architectural flexibility.

---

## 2. The 4-Point Spec Evaluation Rubric

### **1. AI Performance & Context Efficiency [Score: 2/5 - Poor]**
*Are the specs optimized for an AI's attention window?*
* **The Problem:** Specs like `06_data_api.md` are nearly 400 lines long. They contain highly specific SQL implementation details (e.g., exact `to_tsvector` syntax) and exhaustive 20+ row tables of Triad Test Criteria. 
* **The AI Impact:** When you supply a 400-line Spec alongside a 100-line Workflow, you consume a massive chunk of the LLM's high-attention tokens before it even looks at `src/` code. Highly prescriptive implementation details (like writing out exact JSON response shapes and SQL queries) force the AI to act as a "typist" rather than an "engineer," and increases the chance it drops context.
* **The Fix:** Move from *Implementation Specs* to *Contract Specs*. The AI knows how to write PostgreSQL full-text search. You only need to tell it *what* the criteria are, not *how* to write the SQL query.

### **2. Security & Boundaries [Score: 4/5 - Strong]**
*Do the specs clearly define security perimeters?*
* **Strengths:** The newly added `Operating Boundaries` (Target Files, Out-of-Scope Files, Cross-Spec Dependencies) at the bottom of the specs are phenomenal. They mathematically prevent the AI from hallucinating files.
* **Gaps:** The specs often lack explicit `Authorization` matrices. For example, `06_data_api.md` mentions "No authentication" in constraints. A dedicated, structured `🛡️ Security & Auth` header at the top of every spec would ensure the AI immediately understands who can access the feature.

### **3. Code Health & DRYness [Score: 3/5 - Moderate]**
*Are the specs maintainable, or do they duplicate code?*
* **The Problem:** The specs currently duplicate a massive amount of code logic. Writing out exact TypeScript interfaces (`PermitFilter`, Response Shapes) directly inside the markdown file means that if the database schema changes, you now have to update the `.ts` file *and* the `.md` file to keep them in sync.
* **The Impact:** Specs fall out-of-date rapidly. If an AI reads an outdated TS interface in the Spec, it will overwrite the correct, modern TS interface in the codebase.
* **The Fix:** Never write exact code in a spec. Reference it: *"Interface: See `export interface PermitFilter` in `src/lib/permits/types.ts`."*

### **4. Spec-Led Development Viability [Score: 5/5 - Exceptional]**
*Can an AI/developer read this document and immediately begin TDD?*
* **Strengths:** The `User Story`, `Endpoints`, and `Constraints & Edge Cases` sections are brilliantly formulated. The `Triad Test Criteria` tables provide a perfect checklist for the AI to execute the "Red Light" testing phase of the workflows.
* **Verdict:** The structural intent of the specs is perfect for Spec-Led Development. They just need to be compressed.

---

## 3. Strategic Recommendations for Spec Streamlining

To align your Specs with your incredibly lean v4.0 Engineering Protocol, you need to transition them from "Hardcoded Blueprints" to "Behavioral Contracts".

### **Recommendation 1: Delete Code Snippets (DRY the Specs)**
Strip out all SQL queries, JSON objects, and TypeScript interfaces from the markdown. 
* **Change:**
  ```typescript
  interface PermitFilter { status?: string; ... }
  ```
* **To:** 
  > **Data Contract:** Must accept optional filters for status, type, ward, cost, and search. Return paginated Permit rows.

### **Recommendation 2: Compress the Triad Tests**
Instead of writing out 20 distinct rows for logic tests, summarize the testing behavior. The AI is smart enough to generate the 20 test cases if you give it the bounds.
* **Change:** (Listing out `L01`, `L02`, `L03`... for every individual filter).
* **To:** 
  > **Logic Tests:** Assert all filter queries (`status`, `ward`, `trade_slug`, `min_cost`, `search`) work independently and conjunctively. Assert pagination caps. Assert SQL injection is blocked on sort columns.

### **Recommendation 3: The "Lean Spec" Template**
Update your default Spec Template to this hyper-compressed structure. An ideal spec should be under 100 lines.

```markdown
# Spec [XX] -- [Feature Name]

## 1. Goal & User Story
[1-2 sentences]

## 2. 🛡️ Security & Auth Matrix
- **Role Required:** Public / User / Admin
- **Data Perimeter:** What restricted data must NOT be leaked?

## 3. Behavioral Contract (The "What")
- **Inputs:** [What triggers this? API Route / UI Click]
- **Core Logic:** [High-level business rules. E.g. "Calculate buffer using Turf.js, threshold is 50%"]
- **Outputs:** [What is returned/rendered?]
- **Edge Cases:** [List 3-4 ways this could fail]

## 4. Testing Mandate (The Triad)
- **Logic:** [What math/algorithms must be proven?]
- **UI:** [What components must render?]
- **Infra:** [What DB/API connections must be mocked?]

## 5. 🎯 Operating Boundaries
*(Keep the existing Target Files / Out-of-Scope Files section here. It is perfect).*
```

### The Result
If you compress your specs into this 5-point template, you will reduce their token footprint by 70%. When combined with the new 100-line Master Protocol, you give the AI a massive, unclouded "thinking space" to write brilliant, constraint-driven code.
