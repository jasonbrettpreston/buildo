# Workflow Verification (Final Constraints Check)

This is a targeted verification of the finalized `engineering_workflows.md` to ensure the core data-integrity rules (API Contracts and Database Rollbacks) were successfully persisted in the master protocol.

## 1. Database Rollbacks (UP/DOWN Migrations)
**Status: VERIFIED PRESENT ✅**

The rules for Schema Evolution have been successfully hardened in both WF1 (Genesis) and WF2 (Enhance).
The AI is strictly constrained to write reversible database logic.

* **WF1 (Line 96):**
  > `- [ ] **Schema Evolution:** If Database Impact is YES: grep for the affected type/interface to understand blast radius. Write both \`UP\` and \`DOWN\` migrations in \`migrations/NNN_[feature].sql\`...`
* **WF2 (Line 118):**
  > `- [ ] **Schema Evolution:** If Database Impact is YES: ... Write both \`UP\` and \`DOWN\` migrations in \`migrations/NNN_[change].sql\`...`

## 2. API Contract Enforcement
**Status: VERIFIED PRESENT ✅**

The rules preventing the AI from hallucinating API code without first establishing the TypeScript structural boundaries are present.

* **WF1 (Line 94):**
  > `- [ ] **Contract Definition:** If creating an API route, define Request/Response TypeScript interface BEFORE implementation.`
* **WF2 (Line 116):**
  > `- [ ] **Contract Definition:** If altering an API route, define updated Request/Response interface BEFORE implementation. Run \`npm run typecheck\` to identify breaking consumers.`

## 3. The Spec Boundary Rule
**Status: VERIFIED PRESENT ✅**

As requested in the Spec Optimization evaluation, the rule constraining the AI to use the new Spec Boundaries has been successfully injected into the global rules.

* **Line 194:**
  > `Every new spec MUST include an \`## Operating Boundaries\` section (Target Files, Out-of-Scope Files, Cross-Spec Dependencies). Copy from \`docs/specs/_spec_template.md\`.`

---

## Conclusion

The `engineering_workflows.md` protocol is officially locked in its optimal state. It successfully encapsulates security, code health, atomic committing, AI determinism, and data integrity constraints in only 219 lines of text. 

No further modifications are recommended for the Master Protocol at this time. You are ready for high-velocity, low-error Spec-Led Development.

---

## 4. Automating the "Spec Update" Phase

Looking closely at the WF2 execution checklist, the current instruction is:
`- [ ] **Spec Update:** Update \`docs/specs/[feature].md\` to reflect new requirements. Run \`npm run system-map\`.`

While the `system-map` generation is automated, updating the actual feature spec is still a manual AI writing task. To completely automate spec updating and guarantee `docs/specs/*.md` never drifts from `src/`, apply these **Spec-as-Code Automations**:

### A. TypeDoc Automation (Auto-Generating Contracts)
* **The Concept:** Instead of manually writing API contracts and data schemas in the markdown spec, write robust JSDoc comments directly in your `.ts` files. 
* **The Automation:** Install `typedoc` and `typedoc-plugin-markdown`. Add a script to `package.json`: 
  `"docs:generate": "typedoc --plugin typedoc-plugin-markdown --out docs/specs/api src/app/api"`
* **The Workflow Change:** Modify the WF2 checklist to:
  > *- [ ] **Spec Update:** Write JSDoc comments for the new logic, then run `npm run docs:generate`.*

### B. Prisma / Kysely Auto-Schema Generator
* **The Concept:**Specs like `01_database.md` are notoriously difficult to keep manually updated when you write `UP/DOWN` migrations. Let the code write the spec.
* **The Automation:** There are libraries (like `prisma-docs-generator` or `postgres-schema-builder`) that read your live database schema and output a formatted Markdown table of all tables, columns, and relations.
* **The Workflow Change:** Instead of manually updating `01_database.md` when Database Impact = YES, the AI simply runs:
  > *- [ ] **Schema Sync:** Run `npm run db:docs` to auto-regenerate `01_database.md` from the live PostgreSQL schema.*

### C. Automated Test Harvesting (The Triad Sync)
* **The Concept:** The "Lean Spec" template requires you to list the "Testing Triad" (Logic, UI, Infra tests) in the markdown. Manually keeping this markdown list synced with your actual `src/tests/` folder is prone to error.
* **The Automation:** Write a custom Node script (`scripts/harvest-tests.mjs`) that parses your `.test.ts` files, extracts the `describe()` and `it()` strings, and automatically injects them into the `## 4. Testing Mandate` section of the relevant `.md` spec using a hidden HTML injection comment `<!-- TEST_INJECT_START -->`.
* **The Workflow Change:** Combine this with your existing audit script:
  > *- [ ] **Spec Update:** Run `npm run audit-specs` to automatically harvest new test headers into the markdown spec.*
