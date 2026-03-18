#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Task Initializer — generates .cursor/active_task.md from a workflow template
//
// Usage:
//   npm run task -- --wf=3 --name="Fix Map Bug"
//   node scripts/task-init.mjs --wf=1 --name="Add Notifications"
//
// Core 5 Pillars: WF1 (Genesis), WF2 (Enhance), WF3 (Fix), WF5 (Audit), WF11 (Launch)
//
// Auto-populates:
//   - Git commit hash (Rollback Anchor)
//   - Available spec files (for Target Spec selection)
//   - Workflow-specific checklist
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const TASK_FILE = path.join(ROOT, '.cursor', 'active_task.md');
const SPECS_DIR = path.join(ROOT, 'docs', 'specs');

// ── Parse CLI args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
  const flag = args.find(a => a.startsWith(`--${name}=`));
  return flag ? flag.split('=').slice(1).join('=') : null;
}

const wfNum = parseInt(getArg('wf') || '0', 10);
const taskName = getArg('name') || 'Untitled Task';
const scope = getArg('scope') || 'global'; // e.g., 'permits', 'coa', 'sources', 'entities', 'deep_scrapes'

const VALID_WFS = [1, 2, 3, 5, 11];
if (!VALID_WFS.includes(wfNum)) {
  console.error('Usage: node scripts/task-init.mjs --wf=<1|2|3|5|11> --name="Task Name" [--scope=permits|coa|sources|entities|deep_scrapes]');
  console.error('');
  console.error('  Core 5 Pillars:');
  console.error('    --wf=1   Genesis  (new feature)');
  console.error('    --wf=2   Enhance  (change, delete, wire, lock, schema)');
  console.error('    --wf=3   Fix      (bug fix)');
  console.error('    --wf=5   Audit    (code, spec, quality, security, perf)');
  console.error('    --wf=11  Launch   (safe start / recovery)');
  process.exit(1);
}

// ── Gather context ──────────────────────────────────────────────────────────
let commitHash = 'unknown';
try {
  commitHash = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
} catch (err) {
  const errMsg = err.stderr ? err.stderr.toString().trim() : err.message;
  console.warn(`⚠️  Could not generate Git Rollback Anchor: ${errMsg}`);
}

const shortHash = commitHash.slice(0, 8);

// List available specs — filtered by scope if provided
const allSpecFiles = fs.readdirSync(SPECS_DIR)
  .filter(f => f.endsWith('.md') && f !== '00_system_map.md' && !f.startsWith('_'))
  .map(f => `docs/specs/${f}`)
  .sort();

// Scope-based filtering: match spec filenames against scope keywords
const SCOPE_KEYWORDS = {
  permits: ['permit', 'sync', 'classification', 'scoring', 'builder', 'geocod', 'parcel', 'neighbourhood', 'massing', 'similar'],
  coa: ['coa', 'committee', 'pre_permit', 'pre-permit'],
  sources: ['address', 'parcel', 'massing', 'neighbourhood', 'wsib'],
  entities: ['builder', 'enrichment', 'wsib', 'entity'],
  deep_scrapes: ['inspection', 'scraping', 'aic'],
};

const scopeKeywords = SCOPE_KEYWORDS[scope];
const specFiles = scope !== 'global' && scopeKeywords
  ? allSpecFiles.filter(f => scopeKeywords.some(kw => f.toLowerCase().includes(kw)))
  : allSpecFiles;

// Read manifest for pipeline context
let manifestChain = null;
if (scope !== 'global') {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'manifest.json'), 'utf-8'));
    manifestChain = manifest.chains[scope] || null;
  } catch { /* manifest not found */ }
}

// ── Workflow checklists ─────────────────────────────────────────────────────
const WF_NAMES = {
  1: 'New Feature Genesis',
  2: 'Feature Enhancement',
  3: 'Bug Fix',
  5: 'Audit',
  11: 'Safe Launch',
};

const CHECKLISTS = {
  1: `- [ ] **Contract Definition:** If creating an API route, define Request/Response TypeScript interface BEFORE implementation.
- [ ] **Spec & Registry Sync:** Create/Update \`docs/specs/[feature].md\`. Run \`npm run system-map\`.
- [ ] **Schema Evolution:** If Database Impact is YES: write \`migrations/NNN_[feature].sql\`, run \`npm run migrate\`, then \`npm run db:generate\`. Update \`src/tests/factories.ts\` with new fields.
- [ ] **Test Scaffolding:** Create \`src/tests/[feature].logic.test.ts\` (or \`.infra\`/\`.ui\`/\`.security\`).
- [ ] **Red Light:** Run \`npm run test\`. Must see failing or pending tests.
- [ ] **Implementation:** Write \`src/lib/[feature]/\` or \`src/components/\` code to pass tests.
- [ ] **Auth Boundary & Secrets:** If creating/modifying an API route, verify it is protected by \`src/middleware.ts\`. Ensure NO \`.env\` secrets are exposed to client components.
- [ ] **Green Light:** Run \`npm run test && npm run lint -- --fix\`. All tests must pass.
- [ ] **Atomic Commit:** Prompt user to commit: \`git commit -m "feat(NN_spec): [description]"\`. Do not batch.
- [ ] **Founder's Audit:** Verify NO laziness placeholders (\`// ... existing code\`), all exports resolve, schema matches spec, and test coverage is complete.`,

  2: `- [ ] **State Verification:** Examine the calling context. Document what data is actually available vs. what the change assumes.
- [ ] **Contract Definition:** If altering an API route, define updated Request/Response interface BEFORE implementation. Run \`npm run typecheck\` to identify breaking consumers.
- [ ] **Spec Update:** Update \`docs/specs/[feature].md\` to reflect new requirements. Run \`npm run system-map\`.
- [ ] **Schema Evolution:** If Database Impact is YES: write \`migrations/NNN_[change].sql\`, run \`npm run migrate\`, then \`npm run db:generate\`. Update \`src/tests/factories.ts\` with new fields.
- [ ] **Guardrail Test:** Add/Update test case in \`src/tests/\` for the new behavior.
- [ ] **Red Light:** Verify new test fails.
- [ ] **Implementation:** Modify code to pass. *(If deleting a feature: remove code, tests, and move spec to \`docs/archive/\`.)*
- [ ] **Auth Boundary & Secrets:** If creating/modifying an API route, verify it is protected by \`src/middleware.ts\`. Ensure NO \`.env\` secrets are exposed to client components.
- [ ] **UI Regression Check:** If modifying a shared component, run \`npx vitest run src/tests/*.ui.test.tsx\` to verify no sibling UI broke.
- [ ] **Green Light:** Run \`npm run test && npm run lint -- --fix\`. All tests must pass.
- [ ] **Atomic Commit:** Prompt user to commit: \`git commit -m "feat|refactor|chore(NN_spec): [description]"\`. Do not batch.
- [ ] **Founder's Audit:** Verify NO laziness placeholders (\`// ... existing code\`), all exports resolve, schema matches spec, and test coverage is complete.`,

  3: `- [ ] **Rollback Anchor:** \`${shortHash}\` (auto-recorded by task-init)
- [ ] **State Verification:** Examine the calling context. Document what data is actually available vs. what the fix assumes.
- [ ] **Spec Review:** Read \`docs/specs/[feature].md\` to confirm the *intended* behavior.
- [ ] **Reproduction:** Create a failing test case in \`src/tests/\` that isolates the bug.
- [ ] **Red Light:** Run the new test. It MUST fail to confirm reproduction.
- [ ] **Fix:** Modify the code to resolve the issue.
- [ ] **Schema Evolution:** If the fix requires a DB change: write \`migrations/NNN_[fix].sql\` (UP + DOWN), run \`npm run migrate\`, then \`npm run db:generate\`.
- [ ] **Green Light:** Run \`npm run test && npm run lint -- --fix\`. All tests must pass.
- [ ] **Collateral Check:** Run \`npx vitest related src/path/to/changed-file.ts --run\` to verify no unrelated dependents broke.
- [ ] **Atomic Commit:** Prompt user to commit: \`git commit -m "fix(NN_spec): [description]"\`. Do not batch.
- [ ] **Spec Audit:** Update \`docs/specs/[feature].md\` IF AND ONLY IF the fix required a logic change.`,

  5: `- [ ] **Spec Alignment:** Run \`node scripts/audit_all_specs.mjs\` (or \`--spec=NN_name\`). Review \`docs/reports/full_spec_audit_report.md\`.
- [ ] **Test Suite:** Run \`npm run test\` — all tests must pass.
- [ ] **Type Check:** Run \`npm run typecheck\` — must be 0 errors.
- [ ] **Dead Code Scan:** Run \`npm run dead-code\` (knip) — review unused files, exports, and dependencies.
- [ ] **Supply Chain Security:** Run \`npm audit\`. Zero "High" or "Critical" vulnerabilities allowed.
- [ ] **Coverage Check:** Are there any untested critical paths (scoring, classification, sync)?
- [ ] **Build Health (if requested):** Run \`npm run build\`, measure time. Run \`npx madge --circular --extensions ts,tsx src\` for circular deps.
- [ ] **Manual Validation (if requested):** Read spec, create atomic scenario checkboxes, walk through each step. If any step fails: STOP → file WF3.
- [ ] **Verdict:** Output "GO" (Green) or "NO-GO" (Red) with specific blockers.`,

  11: `- [ ] **The Purge:** Kill all \`node\` processes. Delete \`.next\` cache.
- [ ] **Database Boot:** Ensure PostgreSQL is running (\`pg_isready -h localhost -p 5432\`).
    - **Scoop:** \`pg_ctl start -D "$HOME/scoop/apps/postgresql/current/data" -l "$HOME/scoop/apps/postgresql/current/logfile"\`
    - **WSL 2:** \`sudo service postgresql start\`
    - **Verify:** \`pg_isready -h localhost -p 5432\` must return "accepting connections"
    - **First-time:** If \`buildo\` DB doesn't exist: \`createdb -U postgres buildo && npm run migrate\`
- [ ] **Build Check:** Run \`npm run build\` to verify TypeScript integrity.
- [ ] **Data Probe:** Test PostgreSQL connectivity via \`src/lib/db/client.ts\`.
- [ ] **Ignition:** Run \`npm run dev\` and verify the app loads at \`http://localhost:3000\`.`,
};

// ── Build the task file ─────────────────────────────────────────────────────
const wfLabel = WF_NAMES[wfNum];
const checklist = CHECKLISTS[wfNum];

// WF5 and WF11 skip Technical Implementation section
const skipTechImpl = [5, 11].includes(wfNum);

let content = `# Active Task: ${taskName}
**Status:** Planning
**Workflow:** WF${wfNum} — ${wfLabel}
**Rollback Anchor:** \`${shortHash}\` (${commitHash})
${scope !== 'global' ? `**Scope:** ${scope}` : ''}

## Context
* **Goal:** [What are we building/fixing?]
${scope !== 'global' && manifestChain ? `* **Pipeline Chain:** \`${scope}\` — ${manifestChain.length} steps: ${manifestChain.join(' → ')}\n` : ''}* **Target Spec:** MISSING — select from the list below and replace this line:
${(specFiles.length > 0 ? specFiles : allSpecFiles).map(s => `  - \`${s}\``).join('\n')}
* **Key Files:** [List specific src files]
`;

if (!skipTechImpl) {
  content += `
## Technical Implementation
* **New/Modified Components:** [e.g. \`PermitCard.tsx\`]
* **Data Hooks/Libs:** [e.g. \`src/lib/permits/scoring.ts\`]
* **Database Impact:** [YES/NO — if YES, write \`migrations/NNN_[feature].sql\` and draft UPDATE strategy for 237K+ existing rows]
`;
}

content += `
## Execution Plan
${checklist}
`;

// ── Write ───────────────────────────────────────────────────────────────────
fs.mkdirSync(path.dirname(TASK_FILE), { recursive: true });
fs.writeFileSync(TASK_FILE, content);
console.log(`✔ Created ${path.relative(ROOT, TASK_FILE)}`);
console.log(`  Workflow: WF${wfNum} — ${wfLabel}`);
console.log(`  Scope:    ${scope}${manifestChain ? ` (${manifestChain.length} chain steps)` : ''}`);
console.log(`  Rollback: ${shortHash}`);
console.log(`  Specs:    ${specFiles.length} relevant${scope !== 'global' ? ` (of ${allSpecFiles.length} total)` : ''}`);
