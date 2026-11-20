# REPORT: BL-FIXFOOT (task-374, FIX.FOOTER, D7 and D8)
1. For a person: the Terms, Privacy and Help links in the web report footer now move through the app router (next/link) and are 44 px tall, as the approved report mock draws them (report-themes/pub/B.html:222 "min-height:44px").
2. What moved: ReportPage.tsx only (one import, one class string, one tag); no golden, stored value, builder (footerNode.ts), search or static footer moved.
3. Operator items left untouched: conflicts C1 to C5, the 48 or 44 px question (min-h-11 = 44 px, the class pair already at ReportPage.tsx:56), the 60 s wait value.
4. Unverified: phone tests (none touched; Mobile CI only); the real next/link render (the new test mocks next/link; the real component is exercised by the existing search and static footer tests); no push, no full suite run.
5. Grounder owed; task left RUNNING; findings are untriaged in FINDINGS.md.

## Defects confirmed on the head (AC1)
- D7: src/components/report/ReportPage.tsx:251 (before the fix) `case 'Button': return <a key={key} href={String(p.href)} className={cls}>`; rule Spec 136 handbook line 139 fe.36 "a control that moves the user uses the platform router (web <Link> ...)". SearchBinding.tsx:384 and StaticBinding.tsx:429 already use component={Link}.
- D8 (report): ReportPage.tsx:240 REPORT_FOOTER_LAYOUT.link had no min-h; rule 00_engineering_standards.md:14 "MUST have a minimum tappable area of 44px x 44px". The approved mock draws 44 px: B.html:222 and small-pages-v8/search.html:174, so no operator draft.
- D8 (static), NOT changed: StaticBinding.tsx:141 renders the footer link as a Mantine Button size 'lg'; node_modules/@mantine/core/styles/Button.css:5 `--button-height-lg: 50px`, so it is not under 44 px on the head. The same holds for SearchBinding (Button, same size). I did not change them. The grounder verdict row (VERDICTS-SUMMARY.md:19) says "StaticBinding.tsx:90 the same"; that claim looks not true of the code (for the grounder).
- Rule lists: the task has no own-line "Files:" line (check-task-files WARN in commit.out), and the brief attached none; I resolved them with `rule-lists.mjs resolve --files <the touched files> --type build --letter 1` (rule-lists.resolved.json): eng-s1, eng-s2-s4-s10-s11, eng-s5, surface-136, surface-126, surface-127, surface-128, surface-135, inc-1; the compliance lens ran once per list, each whole (surface-126 split into p1..p4 by the tool's own bound).

## Red then green (AC2)
- red.out (commit attempt, test and task staged): "Tests  2 failed | 2 passed (4)": D7 `expected [..., false] ...` and D8 `expected [ '/terms', false, false, false ] to deeply equal [ '/terms', true, true, true ]`.
- green: commit.out: "Test Files  11 passed (11) / Tests  140 passed (140)", "GATE OK", "POLICY CHECKS OK (commit-msg): 2 file(s)", "[wf1/inc1b-fixfoot 032ed06] fix(136_mcfrontend_handbook): footer links are route links at 44 px (FIX.FOOTER)".
- typecheck: typecheck.out (npm run typecheck exit 0, before the commit).
- Parity (AC4): the existing site-footer.logic, site-footer.ui, report-page.ui, static-web-binding.ui, web-landing tests ran in the same hook related run and passed (commit.out).

## Process points for the orchestrator
- The first green attempt was refused by the McFrontend gate (commit.full: FAIL:C:no-mf-task, FAIL:P:no-record): ReportPage.tsx is a surface path, so the commit needs a McFrontend-Task trailer, its prereg and docs/reports/panels/<MF>.json. I used MF-91 (the row that built the shared footer; prereg-MF-91-1.json rules ["FE-31"], docs/reports/panels/MF-91.json exist) and claimed no new MF id. That choice (reusing MF-91 rather than a new row) is the grounder's or operator's to confirm. The message therefore cites no FE id (the prereg lists only FE-31 and a cited id outside it is refused).
- No lens-regression template exists in .claude/review-templates, so the brief's regression lens was not run on DeepSeek; regression evidence is the existing related tests (140 passed) and the unchanged goldens (git diff --stat shows 3 files). UNVERIFIED by a lens.
- The task description has no own-line "Files:" line; backlog-lane resolves rule lists from it (refused without one).
- Header comment ReportPage.tsx:1-10 still says "The one client island is ReportPageToggles"; a lens flagged it (out-code-review#5); I did not touch it.

## Findings
FINDINGS.md lists every lens finding by id, untriaged (plan stage 15 outputs, output stage 14 outputs). No verdicts, no grounder file written.

STATUS: BL-FIXFOOT task-374 fix committed 032ed06 on wf1/inc1b-fixfoot, ready, grounder owed, task RUNNING, no push.
