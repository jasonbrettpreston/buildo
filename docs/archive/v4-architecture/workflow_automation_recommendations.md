# Further Workflow Automation Opportunities

Beyond using Husky (for Git Hooks) and Prisma/Drizzle (for automated SQL-to-TypeScript type generation), you can heavily automate the manual friction points in `engineering_workflows.md`.

Here are 5 powerful automations you can seamlessly integrate into your project to replace manual human/AI checklists:

## 1. Automating the "Master Template" Generation
**The Manual Step:** In WF1, WF2, and WF3, the user or AI currently has to manually copy-paste the "Master Template", grab the specific Workflow checklist, and write it to `.cursor/active_task.md`.
**The Automation:** Create a simple Node.js scaffolding script (`scripts/task-init.mjs`).
* **Implementation:** You run `npm run task -- --wf=3 --name="Fix Map Bug"`. The script automatically fetches the current Git commit hash (The Rollback Anchor), grabs the latest `docs/specs` list to prompt you for the Target Spec, and generates the fully populated `.cursor/active_task.md` file instantly. 
* **Impact:** Eliminates 30 seconds of setup time and completely prevents AI hallucination of the task template boundaries.

## 2. Automating the Spec Audit (WF5)
**The Manual Step:** Currently, WF5 commands the engineer to read the spec, scan the code, and manually write a discrepancy report.
**The Automation:** We already built `audit_all_specs.mjs`! 
* **Implementation:** Replace the manual steps in WF5 with a single command: `node scripts/audit_all_specs.mjs --spec=13_auth`. 
* **Impact:** The script will automatically scan the codebase, verify the required files exist, and check the `src/tests/` folder for exact Triad test coverage, printing a rigorous 5/5 score instantly without human reading time.

## 3. Automating System Map & Spec Sync (WF1 & WF2)
**The Manual Step:** Developers are tasked with remembering to update `00_system_map.md` whenever they create a new spec in `docs/specs/`.
**The Automation:** Turn `00_system_map.md` into an auto-generated artifact.
* **Implementation:** Write a 20-line Node.js script that reads all the YAML frontmatter/Markdown tags from every file in `docs/specs/` and compiles them into the `00_system_map.md` markdown table automatically during the build process.
* **Impact:** Your System Map becomes a living, infallible index that literally cannot fall out of sync with the specs folder.

## 4. Automating Dead Code & Deprecation Checks (WF7)
**The Manual Step:** WF7 (Quality Rubric) asks the developer to manually check for `@deprecated` usage and dead code.
**The Automation:** Integrate `knip` or `eslint-plugin-deprecation`.
* **Implementation:** `knip` (a phenomenal tool for JS/TS ecosystems) automatically finds unused files, unused exports, and unused dependencies. Add `npx knip` to your `npm run verify` script.
* **Impact:** The AI no longer has to guess if an old helper function is safely deletable; the compiler will actively hunt down and flag dead architecture.

## 5. Automating the "Rollback" Collateral Check (WF3)
**The Manual Step:** After fixing a bug, WF3 commands the user to do a "Collateral Check" to ensure no unrelated tests broke.
**The Automation:** Strict Vitest Dependency Tracking.
* **Implementation:** Run `npx vitest related src/features/my-fixed-file.ts --run`. 
* **Impact:** Instead of manually running the entire 1,200+ test suite and looking through the console to see if a *different* feature failed, this built-in Vitest command statistically calculates exactly which other tests across the app depend on your changed file, and runs *only* those tests, proving isolation instantly.
