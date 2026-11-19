# TRIAGE r1: BL-R17 (task-350), r1-review.txt (deepseek-reasoner, one round, review mode on the G1 context file plus the section "Plan steps under review (lane BL-R17)")

The round read the pasted text only; it opened no cited file. Every verdict below rests on a file I opened (worktree ~/Buildo-wt-r17).

| # | finding (sev) | verdict | reason with file:line |
|---|---|---|---|
| 1 | "undefined" quote slots in the pack; approvals would record undefined (CRIT) | REJECTED | Opened backlog/decisions/decision-93, -94, -95: `grep -c undefined` prints 0 for each; the tool refuses unless the quote is at the cite (scripts/analysis/backlog-decision.mjs:38-40). The defect is in generated pack sections, already task-343 line 12 (draft-34). |
| 2 | Allowance-settings risk filed as an orphan (CRIT) | PARTLY KEPT | KEPT: the loose-end line carries a recommendation (one read-only SELECT of the three keys on the test stack). REJECTED "launch-blocking, whole population": the meter fails closed by ruling (src/lib/entitlements/index.ts:483-505) and the read degrades to null counts with a WARN (:640-646); live presence needs a database read this lane may not make; `tied up by: NONE` is allowed by the brief and by task-343's own text. |
| 3 | Three documents ENOENT in the pack (HIGH) | REJECTED | Generator defect, already on task-343 (line 12; R16 line 5), draft-34; the grounding used files I opened myself (listed in the review section). |
| 4 | RR-0308 text absent from the pack (HIGH) | KEPT as a fact, resolved | The quote and cite are now pasted in REPORT.md and held in decision-93 (cite MORNING-DECISIONS.md:1188 contains "Mock looks good", opened). |
| 5 | Only one of four lanes covered (HIGH) | REJECTED | The review section was scoped to the sorting (the brief: review the sorted eight); the loose-end lines for BL-SEMI2, BL-PROOF2, BL-W, BL-R16 are step 3 and are listed per lane in REPORT.md. |
| 6 | D2 web gate cited only on mobile (HIGH) | KEPT | Opened: mobile gate mobile/app/(app)/_layout.tsx:4-11; web: src/app/(maxbld)/parcel-tool/SearchPageClient.tsx:17 `disabled: !MAXBLD_WEB_LIVE`, and no web file reads the entitlement (git grep entitlement over src/app/(maxbld) and src/components/surfaces/web finds only the binding), so on web the line is absent today for everyone. D2 states this; web gating after the switch flips UNVERIFIED. |
| 7 | 403 notice defect dropped (HIGH) | PARTLY KEPT | It is a loose end line (mobile/src/lib/parcelSearchMatch.ts:295-300; no task owns the wall: grep of backlog/tasks for report-limit finds only task-340 and task-351) with `tied up by: NONE`; D1 now says the wall is a neighbour, not a precondition. REJECTED "defect abandoned". |
| 8 | File-count guesses (HIGH) | KEPT | Counts replaced by "size not measured (GUESS)" in the OPERATOR task. |
| 9 | verified/UNVERIFIED tag per clause (HIGH) | KEPT | Each Recommendation line states what r1 tested: the round saw the pasted grounding and raised no objection to the options; it did not open any cited file, so the recommendations are NOT marked verified. |
| 10 | doc-16 35 s text stale, no task (HIGH) | REJECTED | Not from today's lanes and not in this task's scope (brief step 3 lists the sources); RR-0176 dropped LOAD.3 already. |
| 11 | No doctor / idempotency step (HIGH) | REJECTED | The brief's steps run backlog doctor; the tool refuses duplicates (backlog-decision.mjs:48-55); each decision was entered once (decision-93, -94, -95). |
| 12 | Nine ids with one title (MED) | REJECTED | Generator output, not this task. |
| 13 | Truncated titles (MED) | REJECTED | Same. |
| 14 | Citations 135:54, FE-nn not resolvable (MED) | KEPT | Cites in the OPERATOR task and task-351 use the full path docs/specs/02-web-admin/135_*.md (file opened: FE-05 :27, FE-07 :29, FE-18 :40, FE-32 :54; path printed by ls). |
| 15 | DST not measured, locale not pinned (MED) | KEPT | Measured with node: 2026-07-10T03:30:00Z prints "9 Jul 2026", 2026-07-10T04:30:00Z prints "10 Jul 2026" (EDT boundary 04:00Z); already in task-351 AC 1 and 2 with a golden of the exact served string. |
| 16 | Removing reset_date unverified consumers (MED) | REJECTED | git grep of reset_date/resetsOn/formatResetDate listed every consumer (two bindings, descriptor :472, census mobile-product.json:7999, goldens, tests); task-351 AC 4 re-runs the grep. |
| 17 | D3 recommendation overrides the design (MED) | KEPT | D3 is worded as a deviation from v8 (search.html:305-306) with its reason; the operator may choose to follow v8. |
| 18 | Flip guard for the web switch (MED) | PARTLY KEPT | Recorded as a loose-end sentence: the web page is disabled by the flag (SearchPageClient.tsx:17) and nothing ties the flip to the entitlement being read on web; tied up by task-287. |
| 19 | Decision index stops at decision-68 (MED) | REJECTED | Generator limits; the decisions are decision-92..95 on disk (ls backlog/decisions). |
| 20 | Compliance list stale (MED) | REJECTED | Pack generator. |
| 21 | Milestone problem text contradicts the pack (MED) | REJECTED | Generated section, not this task. |
| 22 | RUNNING set by hand? (LOW) | REJECTED | task-350 note: "taken on the board at lane launch ... RR-0240" (opened). |
| 23 | Task references empty (LOW) | REJECTED | Refs are added with --add-ref in the closing commit (rule 19). |
| 24-25 | Path styles, duplicate objectives (NIT) | REJECTED | Generator output. |
