# Active Task: WF2 — Pipeline Linting & CI/CD Guardrails
**Status:** Planning
**Workflow:** WF2 — Feature Enhancement
**Rollback Anchor:** `2b6eb35`

## Context
* **Goal:** Prevent pipeline anti-patterns from entering the codebase via automated linting and CI enforcement. Currently `scripts/**` is entirely excluded from ESLint, and no CI workflow exists.
* **Target Spec:** `docs/specs/00_engineering_standards.md` §9
* **Key Files:** `eslint.config.mjs`, `ruff.toml` (new), `.github/workflows/pipeline-lint.yml` (new)

## Technical Implementation

### Phase 1: ESLint for pipeline scripts
**Current state:** `scripts/**` is in ESLint `ignores` — pipeline JS is completely unlinked.

**Changes to `eslint.config.mjs`:**
1. Remove `scripts/**` from global ignores
2. Add a `scripts/**/*.js` config block with pipeline-specific rules:
   - `no-restricted-syntax` selector for SQL OFFSET in template literals (B1 guard)
   - `no-restricted-syntax` selector for `new Pool(` (force SDK usage)
   - `no-restricted-syntax` selector for bare `process.exit()` 
3. Exempt `scripts/lib/**` from certain rules (SDK internals)
4. Keep `@typescript-eslint` rules off for `.js` files (scripts are CommonJS)

**Why not a custom ESLint plugin:** The `no-restricted-syntax` AST selectors already cover our needs (proven pattern in this codebase — lines 28-37 of current config). A custom plugin adds npm packaging overhead with no benefit. For the OFFSET check specifically, we use the existing source-level test pattern (already catching B1 in pipeline-sdk.logic.test.ts) as the primary guard, and the ESLint rule as a secondary net.

### Phase 2: Ruff for Python scripts
**Changes:**
1. Create `ruff.toml` at project root with:
   - `target-version = "py311"`
   - Ban `psycopg2` import (force `asyncpg` for async code)
   - Enable BLE (blind-except) and TRY (tryceratops) rule sets
   - Scope to `scripts/*.py`
2. Add `ruff check scripts/*.py` to the CI workflow

### Phase 3: CI workflow
**New file:** `.github/workflows/pipeline-lint.yml`
- Triggers on `pull_request` to `main`
- Steps: checkout → setup Node → `npm run lint` → setup Python → `pip install ruff` → `ruff check scripts/*.py`
- No branch protection rules yet (local enforcement via Husky is primary)

### Phase 4: Grandfather baseline
**Strategy:** Rather than `eslint-disable` comments everywhere, keep the pipeline lint as **warn** (not error) for existing code initially. The Husky pre-commit already runs `npm run lint` — warnings won't block commits. New violations will be caught by tests (already have 35+ source-level assertions from this session).

## Database Impact
NO

## Standards Compliance
* **Try-Catch Boundary:** N/A — configuration only
* **Unhappy Path Tests:** N/A — lint rules tested by the existing 2379 test suite
* **logError Mandate:** N/A
* **Mobile-First:** N/A

## Execution Plan
- [ ] **State Verification:** ESLint ignores scripts/, no CI, no ruff
- [ ] **Spec Update:** N/A — enforcing existing standards
- [ ] **Implementation:**
  - [ ] Update `eslint.config.mjs` — add scripts/ config block, remove from ignores
  - [ ] Create `ruff.toml` for Python pipeline scripts
  - [ ] Create `.github/workflows/pipeline-lint.yml`
  - [ ] Fix any lint errors that surface in scripts/ (warn-level only)
  - [ ] Verify `npm run lint` still passes (Husky gate)
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass. → WF6
