# Active Task: Mobile-First Strategy & CLAUDE.md Debt Reduction
**Status:** Implementation

## Context
* **Goal:** Pivot to mobile-first UI strategy per `docs/reports/mobile_and_production_audit.md`. Reduce CLAUDE.md technical debt by extracting detailed rules into a dedicated engineering standards spec with accountability hooks that force the AI to prove compliance. Refactor core UI components for responsive mobile layouts and 44px touch targets.
* **Target Spec:** `docs/reports/mobile_and_production_audit.md` (audit), `docs/specs/_spec_template.md` (template update), `docs/specs/00_engineering_standards.md` (new)
* **Key Files:**
  - `CLAUDE.md` (slim down + add enforcement hooks)
  - `docs/specs/00_engineering_standards.md` (new — extracted rules)
  - `docs/specs/_spec_template.md` (add mobile section)
  - `src/components/permits/PermitCard.tsx` (reflow layout)
  - `src/components/permits/PermitFeed.tsx` (gap/pagination)
  - `src/components/search/FilterPanel.tsx` (touch targets, tooltip)
  - `src/components/layout/MobileNav.tsx` (new — responsive nav)
  - All page headers (dashboard, search, admin, home, etc.)

## Technical Implementation
* **New Files:**
  - `docs/specs/00_engineering_standards.md` — extracted error handling rules, try-catch boundary, assumption docs, zero-downtime migration, testing standards
  - `src/components/layout/MobileNav.tsx` — hamburger menu / mobile drawer nav
* **Modified Files:**
  - `CLAUDE.md` — 3 changes:
    1. Remove "Error Handling & Stability Rules" section (Rules 1-4, ~15 lines)
    2. Update Execution Order Constraint: "You MUST read `docs/specs/00_engineering_standards.md` AND the relevant `docs/specs/[feature].md`..."
    3. Add "Standards Verification" step to WF1 and WF2 Execution Plans
    4. Add mobile-first Tailwind rule under Prime Directive
  - `docs/specs/_spec_template.md` — add `## 6. Mobile & Responsive Behavior` section
  - `src/components/permits/PermitCard.tsx` — flex-col/md:flex-row reflow, 44px touch targets, flex-wrap meta row
  - `src/components/permits/PermitFeed.tsx` — responsive gaps, larger pagination buttons
  - `src/components/search/FilterPanel.tsx` — 44px toggle/select targets, responsive tooltip width
  - Page headers (6+ files) — integrate MobileNav, collapse nav on mobile
* **Database Impact:** NO

## Execution Plan

### Track A: CLAUDE.md Debt Reduction & Enforcement Hooks (docs only)
- [ ] **A1. Create `docs/specs/00_engineering_standards.md`:** Extract the 4 error handling rules + testing standards from CLAUDE.md into this foundational spec.
- [ ] **A2. Slim CLAUDE.md — Remove rules:** Delete the "Error Handling & Stability Rules" section (Rules 1-4). Replace with a single line under Prime Directive: "When writing API, frontend, or database code, you MUST adhere to the stability rules in `docs/specs/00_engineering_standards.md`."
- [ ] **A3. CLAUDE.md — "Read" constraint:** Update Execution Order Constraint step 1 from "You MUST read the relevant `docs/specs/[feature].md`" to "You MUST read `docs/specs/00_engineering_standards.md` AND the relevant `docs/specs/[feature].md` file before generating the Active Task."
- [ ] **A4. CLAUDE.md — "Prove It" constraint:** Add a mandatory `Standards Verification` step to both WF1 and WF2 Execution Plans: "Explicitly state how your implementation adheres to the Try-Catch, Unhappy Path, and Mobile-First rules defined in `00_engineering_standards.md`."
- [ ] **A5. CLAUDE.md — Active Task template:** Add a `## Standards Compliance` section to the Master Template that the AI must fill out before authorization.
- [ ] **A6. CLAUDE.md — Mobile-first rule:** Add under Prime Directive: "All Tailwind styling MUST be written mobile-first (base classes = mobile, `md:` / `lg:` = desktop)."
- [ ] **A7. Update `_spec_template.md`:** Add mandatory `## 6. Mobile & Responsive Behavior` section.

### Track B: Mobile-First UI Refactors
- [ ] **B1. Guardrail Tests:** Add UI tests for mobile layout (PermitCard stacking, touch targets, MobileNav).
- [ ] **B2. Red Light:** Verify new tests fail.
- [ ] **B3. PermitCard Reflow:** flex-col on mobile, flex-row on md+. flex-wrap meta row. min-h-[44px] save button.
- [ ] **B4. PermitFeed:** space-y-2 md:space-y-3. min-h-[44px] pagination buttons.
- [ ] **B5. FilterPanel:** py-2.5 toggle/selects. Responsive tooltip. Bump trade table text.
- [ ] **B6. MobileNav Component:** Hamburger menu (md:hidden), desktop nav (hidden md:flex).
- [ ] **B7. Wire MobileNav into page headers.**
- [ ] **B8. Green Light:** npm run test && npm run lint -- --fix.
- [ ] **B9. UI Regression Check:** npx vitest run src/tests/*.ui.test.tsx.
- [ ] **Atomic Commits.**
