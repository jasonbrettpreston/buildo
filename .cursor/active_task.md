# Active Task: WF3 — ESLint Pool Ban AST Selector Gap
**Status:** Implementation
**Workflow:** WF3 — Bug Fix
**Rollback Anchor:** `4cd52b7`

## Context
* **Goal:** Fix ESLint `no-restricted-syntax` selector to catch both `new Pool()` AND `new pg.Pool()` patterns in pipeline scripts.
* **Target Spec:** `docs/specs/00_engineering_standards.md` §9.4
* **Key Files:** `eslint.config.mjs`

## Bug
WF5 chaos test revealed `new pg.Pool()` bypasses the ESLint ban because the AST selector `NewExpression[callee.name='Pool']` only matches direct `new Pool()`, not member expression `new pg.Pool()` where callee is a MemberExpression.

## Fix
Add second selector: `NewExpression[callee.property.name='Pool']` — catches any `new X.Pool()` pattern.

## Execution Plan
- [x] **Rollback Anchor:** `4cd52b7`
- [ ] **Reproduction:** Verify rogue `new pg.Pool()` not caught
- [ ] **Fix:** Add member expression selector
- [ ] **Green Light:** Verify both patterns caught, all tests pass
