## Lane plan (BL-REPORTOWN, task-384, STD.REPORT-OWN)

Goal: the three web report renderer files (src/components/report/ReportPage.tsx, ReportView.tsx, ReportPageToggles.tsx) get a census owner and join the checked set, in the same form as the phone REPORT modules. They stay a component; nothing is converted (Spec 126 section 11b.1, docs/specs/02-web-admin/126_maxbld_surface_standard.md:923: "REPORT keeps the landed renderer (§11a; Spec 135 FE-24)"; :924 "the landed web REPORT renderer" is on the list of our code).

Measured before any edit (lane measure script, a transpile of the real test file functions; ~/Buildo-scratch/lanes-20261119/inc1b/reportown/measure/measure-before.txt): with the three files treated as web REPORT modules, C-2b raises 108 findings (ReportPage 92, ReportView 16, ReportPageToggles 0) and C-8 raises 213 (171, 41, 1). Only 3 of the C-2b findings are display text (ReportView.tsx:19 twice, :121); the rest are structural attributes (as, data-*, aria-*). C-8 findings are intrinsic elements and local components: the renderer is hand-built by design. C-9 judges golden nodes (component + props.size), not source files, so no data edit puts the three files under it.

Smallest data edit, following the phone form (bindings.json modules[] + one promoted platform_shared census entry that owns them, as binding_mobile_report does, scripts/surfaces/_schema/census/mobile-product.json:15071-15267 and bindings.json:21-22):
1. census web-product.json: one new entry binding_web_report (archetype REPORT, platform web, scope platform_shared) with identity.owns.components = the three files; its descriptor file emitted beside it (same text as the census entry, as binding_web_static).
2. bindings.json: module_roots += src/components/report/; modules += the three files (platform web, archetypes REPORT, owner binding_web_report); promoted_entries += binding_web_report. mapping.web gets NO REPORT list (the renderer is not a library binding).
3. Regenerate the two generated registry docs; the registry section 5 falls from 14 to 11 unowned files; the it.fails at src/tests/surface-registry.infra.test.ts:198 stays (red for the other 11).

Tests (red first through the real hooks; commit attempt with only tests + task file staged):
- C-12 (new, surface-conformance.logic.test.ts): the three files are listed web REPORT modules owned by binding_web_report in the census; listed set equals exactly the three; bindingsProblems clean.
- The real-tree C-2b and C-8 cases judge the three files with the measured findings PINNED per file and per check (exact count, both directions: a new finding or a fixed one turns it red). This pin is a baseline: it is the one exemption, listed for the operator with each count and the reason (no one-line fix exists; renderer kept by 11b.1). No existing check is weakened for any other file.
- surface-registry.infra.test.ts: the three files are not in the unowned set, and the unowned set is exactly the other 11 (so the it.fails stays honest: it cannot pass or be dropped silently).
- Count lock in the conformance test [10,7,25] becomes [13,8,25].

Not done, left for the operator: the landing embed exception (C-8 SHARED_REPORT_RENDERERS, surface-conformance.logic.test.ts:532) stays as is, written up as a question; C-9 reach (needs a rule on what to judge in a hand-built renderer); the 3 display-text findings and the structural attributes.
Files beyond the task Files line that must be touched: census/web-product.json, the descriptor file, docs/reports/generated/127-surface-registry.md and 127-surface-review-queue.md, src/tests/surface-registry.infra.test.ts, and any test count lock the new entry moves; the Files line is extended through the backlog CLI.
Rules served: Spec 126 section 0a principle 1 and 11b.2; 128 R-13; standardized, understandable, simple.
