# Active Task: Add Automated Enforcement Gates (ESLint + Git Hooks)
**Status:** Planning

## Context
* **Goal:** Automate enforcement of engineering standards that are currently only enforced by human review. Three highest-impact gates: (1) commit-msg hook for spec traceability, (2) ESLint ban on `console.error` in API routes, (3) migration UP/DOWN validator in pre-commit.
* **Target Spec:** `docs/specs/00_engineering_standards.md`
* **Key Files:**
  - MODIFY: `eslint.config.mjs` — add `no-restricted-syntax` rules for console.error in API routes + `new Pool()` outside scripts/lib/
  - MODIFY: `.husky/pre-commit` — call migration validator script
  - CREATE: `.husky/commit-msg` — enforce `type(NN_spec): description` format
  - CREATE: `scripts/hooks/validate-migrations.sh` — check all .sql files have UP + DOWN blocks
  - CREATE: `scripts/hooks/validate-commit-msg.sh` — enforce conventional commit + spec ID format
  - CREATE: `src/tests/enforcement.logic.test.ts` — verify ESLint config contains expected rules

## Technical Implementation
* **ESLint Rules (eslint.config.mjs):**
  - Add file-scoped override for `src/app/api/**` banning `console.error` via `no-restricted-syntax` (enforces §6.1 logError mandate)
  - Add `no-restricted-syntax` rule banning `new Pool()` globally (enforces centralized pool via `scripts/lib/db.js`)
  - Note: `no-restricted-syntax` already has one entry (process.exit ban); must convert to array of selectors
* **commit-msg hook (.husky/commit-msg):**
  - Regex: `^(feat|fix|refactor|test|docs|chore)\([0-9]{2}_[a-z_]+\): .+`
  - Allows merge commits (`^Merge `) and initial commits
  - ~15 lines of shell script
* **Migration validator (scripts/hooks/validate-migrations.sh):**
  - Scans staged `migrations/*.sql` files for `-- DOWN` block presence
  - Enforces §3.2 Migration Rollback Safety
  - ~20 lines of shell script
* **Database Impact:** NO
* **New/Modified Components:** None (tooling only)
* **Data Hooks/Libs:** None

## Standards Compliance

### §1.1 Mobile-First UI Mandate
- **Applicability:** NOT APPLICABLE — no UI components created or modified.
- **Evidence:** This task modifies only ESLint config, shell scripts, and git hooks. Zero `.tsx` files touched.

### §1.2 Component Isolation
- **Applicability:** NOT APPLICABLE — no UI components.

### §2.1 The "Unhappy Path" Test Mandate
- **Applicability:** NOT APPLICABLE — no `.infra.test.ts` integration tests needed. No API routes created.
- **Evidence:** Tests are `.logic.test.ts` (pure config structure validation). No HTTP handler to exercise error paths against.

### §2.2 The Try-Catch Boundary Rule
- **Applicability:** NOT APPLICABLE — no API routes created or modified.
- **Evidence:** The ESLint rule we're adding *enforces* §2.2/§6.1 for future code, but this change itself creates no routes.

### §2.3 Assumption Documentation
- **Applicability:** LOW RISK — shell scripts read file content and git state. No nested object access.
- **Evidence:** Shell scripts use `grep` on staged files; failure modes are "no files matched" (safe exit 0).

### §3.1 Zero-Downtime Migration Pattern
- **Applicability:** NOT APPLICABLE — no database migrations in this change.
- **Note:** We are *automating enforcement* of §3.2 (the DOWN block rule) via the migration validator.

### §3.2 Migration Rollback Safety
- **Applicability:** NOT APPLICABLE — no migrations.
- **Note:** The migration validator script being created enforces this rule for all future migrations.

### §3.3 Pagination Enforcement
- **Applicability:** NOT APPLICABLE — no API routes reading from DB.

### §4.1 Route Guarding
- **Applicability:** NOT APPLICABLE — no new endpoints.

### §4.2 Parameterization
- **Applicability:** NOT APPLICABLE — no SQL in this change.

### §5.1 Typed Factories Only
- **Applicability:** COMPLIANT — test file uses direct assertions on config structure and file contents. No mocked domain objects needed, so no factories required.

### §5.2 Test File Pattern
- **Applicability:** COMPLIANT — `src/tests/enforcement.logic.test.ts` follows `*.logic.test.ts` pattern for pure logic/config validation.

### §5.3 Red-Green Test Cycle
- **Applicability:** COMPLIANT — write failing test first (Red Light step), then implement code to pass (Green Light step).

### §5.4 Test Data Seeding
- **Applicability:** NOT APPLICABLE — no DB scenarios needed.

### §6.1 logError Mandate
- **Applicability:** NOT APPLICABLE — no API routes or lib modules with catch blocks.
- **Note:** The ESLint rule we're adding *automates enforcement* of this mandate for all future API code.

### §7.1 Classification Sync Rule
- **Applicability:** NOT APPLICABLE — not touching classification logic.

### §7.2 Scope Classification Sync
- **Applicability:** NOT APPLICABLE — not touching scope classification logic.

### §8.1 API Route Export Rule
- **Applicability:** NOT APPLICABLE — no route files modified.

### §8.2 TypeScript Target Gotchas
- **Applicability:** LOW RISK — test file is `.ts` (not `.tsx`), no regex `s` flag, no `process.env` assignment, no `globalThis.google`.

### §9.1 Transaction Boundaries
- **Applicability:** NOT APPLICABLE — no pipeline scripts writing to DB.

### §9.2 PostgreSQL Parameter Limit
- **Applicability:** NOT APPLICABLE — no batch inserts.

### §9.3 Idempotent Scripts
- **Applicability:** NOT APPLICABLE — shell hook scripts are idempotent by nature (validate and exit).

### §9.4 Pipeline SDK Mandate
- **Applicability:** NOT APPLICABLE — no pipeline scripts created. The `new Pool()` ESLint ban reinforces this rule for future code.

### §9.5 Streaming Ingestion
- **Applicability:** NOT APPLICABLE — no data loaders.

### §9.6 Pipeline Manifest
- **Applicability:** NOT APPLICABLE — no chain/pipeline changes.

### §9.7 Pipeline Observability
- **Applicability:** NOT APPLICABLE — no pipeline scripts.

## §10 Plan Compliance Checklist

### If Database Impact = YES:
⬜ N/A — Database Impact is NO.

### If API Route Created/Modified:
⬜ N/A — No API routes created or modified.

### If UI Component Created/Modified:
⬜ N/A — No UI components. Backend tooling only.

### If Shared Logic Touched (classification, scoring, scope):
⬜ N/A — Not touching classification, scoring, or scope logic.

### If Pipeline Script Created/Modified:
⬜ N/A — No pipeline scripts created. Shell hook scripts are not pipeline scripts.

### Viewport Mocking:
Backend Only, N/A.

## Execution Plan
- [ ] **Rollback Anchor:** Current commit `598db99`.
- [ ] **State Verification:** Read current `eslint.config.mjs`, `.husky/pre-commit`, verify no `.husky/commit-msg` exists.
- [ ] **Spec Update:** Update `docs/specs/00_engineering_standards.md` to document the automated gates.
- [ ] **Viewport Mocking:** Backend Only, N/A.
- [ ] **Guardrail Test:** Create `src/tests/enforcement.logic.test.ts` with tests for:
  - ESLint config contains `console.error` ban scoped to API routes
  - ESLint config contains `new Pool` ban
  - commit-msg hook script exists and has regex validation
  - migration validator script exists and checks for DOWN block
- [ ] **Red Light:** Run `npm run test`. New tests must fail.
- [ ] **Implementation:**
  1. Update `eslint.config.mjs`: Add API-scoped `console.error` ban + global `new Pool()` ban
  2. Create `scripts/hooks/validate-commit-msg.sh`: Regex enforcer for spec traceability
  3. Create `scripts/hooks/validate-migrations.sh`: UP/DOWN block checker for staged .sql files
  4. Create `.husky/commit-msg`: Calls validate-commit-msg.sh
  5. Update `.husky/pre-commit`: Add migration validator call
- [ ] **Green Light:** `npm run test && npm run lint -- --fix`. All pass.
- [ ] **Collateral Check:** `npx vitest related eslint.config.mjs --run`.
- [ ] **Atomic Commit:** `git commit -m "feat(00_engineering_standards): add automated enforcement gates (ESLint + git hooks)"`.
- [ ] **Founder's Audit:** Verify no laziness placeholders, all scripts executable, hooks fire correctly.
