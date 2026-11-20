# FINDINGS (untriaged): BL-GATES lens round on f90ba87c7 and 00ecd67cd against 3a36e8b26, task-367

Lane BL-GATES. Nothing here is adjudicated or fixed; no verdicts. G-nnn lines are BUG or DEFER lines returned by DeepSeek lenses (scripts/deepseek-review.js review, .claude/review-templates/lens-*.md) as returned. Runs: compliance once per rule source (c132 Spec 132 sections 2 and 6; c122 Spec 122 :795-830 plus 122a A26; c136 Spec 136 section 2; c90 Spec 90 whole; ceng engineering standards sections 5, 9, 14), code-review, error-paths; each against 2 diff parts (diff-1 32912 characters, diff-2 6733) with the source passed whole by --context (`$` doubled and placeholder tokens neutralised per README). Code-review and error-paths got only the task goal as context. The lens returns at most 8 findings per run. Raw outputs: out-*.txt beside this file. The "Opened" check was not done (UNVERIFIED); the grounder opens each.

Findings by lens and severity (G- findings): codereview BUG HIGH=1; codereview DEFER MED=5; codereview DEFER LOW=6; codereview DEFER NIT=2; compliance:c122 BUG HIGH=4; compliance:c122 BUG MED=2; compliance:c122 DEFER MED=4; compliance:c122 DEFER LOW=4; compliance:c132 BUG HIGH=2; compliance:c132 BUG MED=1; compliance:c132 DEFER MED=3; compliance:c132 DEFER LOW=2; compliance:c136 BUG HIGH=2; compliance:c136 DEFER MED=6; compliance:c136 DEFER LOW=2; compliance:c90 DEFER MED=3; compliance:c90 DEFER LOW=7; compliance:ceng BUG HIGH=2; compliance:ceng BUG MED=1; compliance:ceng DEFER MED=2; compliance:ceng DEFER LOW=3; errorpaths BUG HIGH=1; errorpaths DEFER MED=10; errorpaths DEFER LOW=2
Total G findings: 77. Runs with no BUG/DEFER line: none

### Own self-review (from REPORT.md), listed by id, no verdicts
- CR-1 (code review): Gate A first used `@/` = src/ for every file; wrong for mobile files. Changed in compute-reach.mjs listCallers before the green commit.
- CR-2 (code review): Gate B class U4 includes key `duration`, which also matches reanimated animation options (noise in the informational list).
- CR-3 (code review): Gate C row C3 flags `typeof window` guards as use; none on the real tree.
- EP-1 (error paths): a missing ast-grep binary or an unreadable file throws and the run fails loudly; a rule id missing from compute-shape.yml throws (test A5).
- EP-2 (error paths): `--strict` exits 1 with findings and 0 by default (real-tree.out).
- CP-1 (compliance): core.8 is not stretched to mobile code (Gate B header); the 122:806 directory-scope stretch is named in Gate A header; rules quoted with file:line in all three headers.

### G-001 · codereview · diff part 1 · BUG severity=HIGH
- compute-reach.mjs:157 "if (spec === s.stem || base === s.stem) via.add(s.file);" — neither `spec` nor `base` has its extension stripped, so a caller importing the reacher as `'./clean-reacher.js'` yields `base='src/clean-reacher.js'` which never equals `stem='src/clean-reacher'`, and the caller is silently never listed or scanned — strip the extension on both sides before comparing, e.g. const noExt=(p)=>p.replace(/\.[^./]+$/,'') and compare noExt(spec)/noExt(base) to s.stem.
- Opened: not opened by this lane (UNVERIFIED)

### G-002 · codereview · diff part 1 · DEFER severity=MED
- mobile-never-do.mjs:60 "if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && row('C3-no-dom-apis').names.includes(n.name.text)) shadowed.add(n.name.text);" — `shadowed` is one file-wide set, so a single `const document = ...` anywhere suppresses every genuine global `document`/`window`/`localStorage` reference in that file (the gate checks `!shadowed.has(n.text)` at line 87), so a real DOM use in the same file is missed — resolve shadowing per scope with a push/pop binding set instead of a file-global Set.
- Opened: not opened by this lane (UNVERIFIED)

### G-003 · codereview · diff part 1 · DEFER severity=MED
- compute-reach.mjs:111 "const LINE_RE = /^(.+?):(\d+):(\d+): (?:error|warning|info)\[([\w-]+)\]:/;" — ast-grep severities include `hint`, and every stdout line that fails this regex (including a `hint[...]` finding) is dropped at line 128-129 with no warning, so findings vanish silently — add `hint|warning|error|info` to the alternation and count/log unmatched non-empty stdout lines.
- Opened: not opened by this lane (UNVERIFIED)

### G-004 · codereview · diff part 1 · DEFER severity=LOW
- compute-reach.mjs:82 "out.push({ form, spec, line: text.slice(0, m.index + m[0].indexOf(m[1])).split('\n').length });" — `indexOf(m[1])` finds the first textual occurrence of the specifier, so for `import foo from './foo'` it locates the imported binding `foo`, not the quoted specifier, giving a wrong reported line for a multi-line import — use `m[0].lastIndexOf(m[1])` (the specifier is always last in the match) or the regex `d` flag indices.
- Opened: not opened by this lane (UNVERIFIED)

### G-005 · codereview · diff part 1 · DEFER severity=LOW
- compute-reach.mjs:68 "else if (SCAN_EXT.test(e.name) && !SKIP_FILE.test(e.name)) out.push(rel);" — `SCAN_EXT = /\.(?:[cm]?[jt]sx?)$/` also matches `.d.ts` and `SKIP_FILE` does not drop it, so declaration files (and `import type`) get listed as reachers and run through ast-grep, while the two sibling gates explicitly skip `.d.ts` — add `\.d\.ts$` to `SKIP_FILE` or `SKIP_DIR`.
- Opened: not opened by this lane (UNVERIFIED)

### G-006 · codereview · diff part 1 · DEFER severity=NIT
- mobile-never-do.mjs:72 "if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && (n.expression.text === 'require' || n.expression.text === 'import')" — the `'import'` branch is dead code: a dynamic `import()` call has an `ImportKeyword` expression, so `ts.isIdentifier(n.expression)` is false and only the line-74 check can ever fire for it — drop `|| n.expression.text === 'import'`.
- Opened: not opened by this lane (UNVERIFIED)

### G-007 · codereview · diff part 1 · DEFER severity=LOW
- compute-reach.mjs:123 "if (res.error) throw res.error;" — `main()` (line 176 `const { reachers, callers, findings } = run();`) calls `run()` with no try/catch, so any thrown error (spawn failure, missing rule id at line 104) exits as an uncaught stack trace with no summary line, indistinguishable in exit code from a `--strict` finding failure — wrap `run()` in try/catch, log the message, and `process.exit(2)` for errors.
- Opened: not opened by this lane (UNVERIFIED)

### G-008 · codereview · diff part 2 · DEFER severity=MED
- src/tests/gate-compute-reach.infra.test.ts:12 "const run = (): any => gate.run(ROOT, [FIX]);" — returning `any` erases the whole gate result shape, so a renamed field (`ruleId` vs `id`) or a missing `hits` only surfaces as a runtime TypeError, and line 28 "expect(clean.hits.map((h: { form: string }) => h.form).sort()).toEqual(['dynamic', 'static']);" dereferences the possibly-undefined `find` result with no guard — safe only because the preceding toBeTruthy throws first — declare an interface for the run() return (or JSDoc types in the .mjs) and return that instead of `any`.
- Opened: not opened by this lane (UNVERIFIED)

### G-009 · codereview · diff part 2 · DEFER severity=MED
- src/tests/gate-compute-reach.infra.test.ts:45 "expect(() => gate.reusedRules(ROOT)).not.toThrow();" — the test name claims "the applied rule ids all exist in the reused rule file" but the assertion only proves the call does not throw, so a renamed or absent rule id in the rules file still passes — assert membership, e.g. `GATE_A_RULE_IDS.every((id) => gate.reusedRules(ROOT).some((r) => r.id === id))`.
- Opened: not opened by this lane (UNVERIFIED)

### G-010 · codereview · diff part 2 · DEFER severity=MED
- src/tests/gate-mobile-compliance.infra.test.ts:24 "expect([...bound, ...info].filter((f: F) => f.file.endsWith('clean-b.tsx'))).toEqual([]);" and :44 "expect(findings.filter((f: F) => f.file.endsWith('clean-c.tsx'))).toEqual([]);" — both GREEN assertions are vacuously true if the clean twin is never visited (renamed fixture, extension filtered out, path mismatch), because nothing asserts the clean file was scanned — add a positive control, e.g. assert the clean file is in the scanned set or plant one bound-class literal in the clean twin and assert that single finding.
- Opened: not opened by this lane (UNVERIFIED)

### G-011 · codereview · diff part 2 · DEFER severity=LOW
- src/tests/gate-compute-reach.infra.test.ts:17 "expect(reachers.map((r: { file: string }) => r.file)).toContain(`${FIX}/bad-reacher.ts`);" — A1 and :40 compare an exact relative path while A2/A3/C compare basenames with `endsWith`, so if the gate emits ROOT-joined paths A1/A4 go red while A2 stays green — derive the expectation from the same value the gate returns, or use `endsWith` consistently.
- Opened: not opened by this lane (UNVERIFIED)

### G-012 · codereview · diff part 2 · DEFER severity=LOW
- src/tests/gate-mobile-compliance.infra.test.ts:35 "const findings = gateC.scan(ROOT, [FIX]) as F[];" — unchecked `as` cast to a shape keyed on `id`, whereas Gate A's findings are keyed on `ruleId` (gate-compute-reach:20 "const ids = new Set(findings.filter((f: { file: string }) => f.file.endsWith('bad-reacher.ts')).map((f: { ruleId: string }) => f.ruleId));"); if Gate C in fact emits another field, `hit` returns false and the message is misleading — type the scan return rather than casting, so the compiler checks the field name.
- Opened: not opened by this lane (UNVERIFIED)

### G-013 · codereview · diff part 2 · DEFER severity=LOW
- src/tests/gate-compute-reach.infra.test.ts:35 "expect(findings.some((f: { file: string }) => f.file.endsWith('not-a-reacher.ts'))).toBe(false);" — the header's "breaks rules but never reaches the core is not listed" claim is only exercised if that fixture file actually contains a violation, which this test does not assert (cannot see the fixture file) — assert the fixture itself contains a known violating line before asserting the gate stayed silent.
- Opened: not opened by this lane (UNVERIFIED)

### G-014 · codereview · diff part 2 · DEFER severity=NIT
- src/tests/gate-mobile-compliance.infra.test.ts:11 "type F = { file: string; id: string; line: number };" — `line` is never read anywhere in the file (`hit` uses only `file` and `id`), so the field is dead — either drop it or include `f.line` in the failure messages.
- Opened: not opened by this lane (UNVERIFIED)

### G-015 · compliance:c122 · diff part 1 · BUG severity=HIGH
- 122 §5.5 "over `scripts/lib/compute/**` (driver: `scripts/hooks/check-step-shape.mjs`, always blocking, the directory IS the scope, no `converted.json` entry needed)" — compute-reach.mjs:13-14 "A file under src/ or mobile/ that IMPORTS the compute core is outside that directory, so no existing gate scans it (the gap). Gate A (1) LISTS every such file, and (2) runs the SAME rule data ... on it as an ADVISORY" — the gate applies compute-shape rule ids to files the pasted clause puts outside the rule's scope, and no pasted ruling authorizes the widening (A26: "no widening of an old gate") — in stage 1 emit only the REACH/CALLER lists, and emit rule-id findings only after an operator ruling adding src/ and mobile/ to scope is pasted into the spec.
- Opened: not opened by this lane (UNVERIFIED)

### G-016 · compliance:c122 · diff part 1 · BUG severity=HIGH
- 122a A26 "The ast-grep codes are added to `GATE_E_RULE_IDS`; rule ids 1–10 stay non-filterable ("no widening of an old gate", `compute-literals.mjs`)." — compute-reach.mjs:56 "...GATE_E_RULE_IDS.filter((id) => id !== 'compute-forbidden-require-dynamic' && id !== 'compute-no-literal-violation-compare')," — a gate E literal id is filtered out of the reused set, and the filter is not even listed in the gate's own EXCLUDED comment at :50-52, so an id the ruling says stays non-filterable silently stops applying — apply every non-dynamic gate E id unfiltered, or record the exclusion as a ruling row in 122a before shipping.
- Opened: not opened by this lane (UNVERIFIED)

### G-017 · compliance:c122 · diff part 1 · BUG severity=MED
- 122a A26 "rule ids 1–10 stay non-filterable" read with the gate's own closed-set claim "Rule ids of compute-shape.yml applied to a reacher (closed)" — compute-reach.mjs:50-52 "EXCLUDED with reason: ... compute-no-postgis-branch, compute-no-verdict-derivation, compute-no-literal-threshold, compute-no-literal-byte-window, compute-no-literal-url-tunable (bind a compute's own check/verdict code, not a route)" — none of those five ids is excluded by the code at :56, so the applied set is wider than the set the gate declares and a route will receive findings the design text says do not bind a route — derive the list from an explicit EXCLUDED_RULE_IDS constant and throw unless applied plus excluded equals GATE_E_RULE_IDS.
- Opened: not opened by this lane (UNVERIFIED)

### G-018 · compliance:c122 · diff part 1 · BUG severity=MED
- 122 §5.5 "a finding is closed only by becoming a declared `config.logic_variables[]` entry (as gate A requires for descriptor-level bounds) or a dated `standard-gates-ledger.json` row" — compute-reach.mjs:179 "for (const f of findings) console.log(`FINDING ${f.file}:${f.line} ${f.ruleId} | ${f.lineText}`);" — findings are published under gate E rule ids on route files that have no descriptor logic_variables[] and no ledger row, so the pasted closure path cannot exist for them and they read as unclosable gate E debt — either name the closure route for advisory findings in the header or emit them under advisory-only ids that gate E does not own.
- Opened: not opened by this lane (UNVERIFIED)

### G-019 · compliance:c122 · diff part 1 · DEFER severity=MED
- pasted context names no prove-red fixture obligation for these gates, yet the gates assert planted defects are caught — compute-reach.mjs:33 "export const SCAN_ROOTS = ['src', 'mobile'];" against scripts/steps/_schema/fixtures/reach/bad-reacher.ts:5 "const core = await import('../../../../../scripts/lib/compute/demo-core.js');" — all six fixture files sit outside the gates' own scan roots and no test in the diff runs them, so the only evidence that the rules fire is an unexecuted comment — add a gate test that calls run(dirname of fixtures) and asserts the specific planted findings.
- Opened: not opened by this lane (UNVERIFIED)

### G-020 · compliance:c122 · diff part 1 · DEFER severity=LOW
- 122a A26 "Every site answers exactly one token: `PASS | FAIL:<CODE>:<file>:<line>`. `<CODE>` is a row's rule id below" — compute-reach.mjs:179 "console.log(`FINDING ${f.file}:${f.line} ${f.ruleId} | ${f.lineText}`);" — sites judged under A26 code-table ids are reported outside the closed answer grammar, so PASS and not-run are indistinguishable in the output — print the A26 token form or state in the header that these ids are outside the A26 answer set.
- Opened: not opened by this lane (UNVERIFIED)

### G-021 · compliance:c122 · diff part 1 · DEFER severity=LOW
- clauses fe.05/fe.44 (136), Spec 90 §5, 132 core.8 and core.9 are cited but are not in the pasted context, cannot see — mobile-literals.mjs:7 "136_mcfrontend_handbook.md:163 fe.44 ...; the conversion factor is content/settings, never code" and compute-reach.mjs:9 "132_step_standard_handbook.md:154 core.8" — the BOUND/INFORMATIONAL split of Gate B and the six rows of Gate C, plus Gate A's justification for touching routes, rest on text I cannot check here — paste fe.05, fe.44, Spec 90 §5 and 132 core.8/core.9 verbatim so scope and severity can be judged.
- Opened: not opened by this lane (UNVERIFIED)

### G-022 · compliance:c122 · diff part 2 · BUG severity=HIGH
- Spec 122 §5.5 "driver: `scripts/hooks/check-step-shape.mjs`, always blocking" — src/tests/gate-compute-reach.infra.test.ts:5 "Report-only: nothing here wires it." — the pasted clause makes the compute-shape lock blocking, but the only artifact this change adds is an unwired, report-only gate plus tests, so a compute island that has left `scripts/lib/compute/**` is still not blocked — wire `compute-reach.mjs` into `check-step-shape.mjs` (or a `step-validate` invariant) in this change, or quote the clause that defers the wiring
- Opened: not opened by this lane (UNVERIFIED)

### G-023 · compliance:c122 · diff part 2 · BUG severity=HIGH
- Spec 122 §5.5 "so a 606-line island can become a 7-line file plus a 606-line island one directory over. §5.5 closes that." — src/tests/gate-compute-reach.infra.test.ts:48 "expect(gate.reaches(\"const y = require('../lib/compute-helper')\").length).toBe(0);" — the change locks in that a literal `require()` is not a reach, so a CommonJS step delegating to compute is never listed and never scanned, and the "one directory over" island the clause closes is undetected — accept a literal `require()` of a core path as a reach and add the matching RED row (or a positive test proving no core path is expressible via `require`)
- Opened: not opened by this lane (UNVERIFIED)

### G-024 · compliance:c122 · diff part 2 · DEFER severity=MED
- 122a A26 "The ast-grep codes are added to `GATE_E_RULE_IDS`" — src/tests/gate-compute-reach.infra.test.ts:45 "expect(() => gate.reusedRules(ROOT)).not.toThrow();" — the test title claims every applied id exists in the reused rule file, but the body only proves the reader does not throw and one id is absent at line 46, so an applied id outside the pasted A26 closed set would pass silently — assert every member of `GATE_A_RULE_IDS` is present in the parsed rule file (and in the A26 table)
- Opened: not opened by this lane (UNVERIFIED)

### G-025 · compliance:c122 · diff part 2 · DEFER severity=MED
- not pasted: Spec 136 "fe.05, fe.44" and Spec 90 §5 — src/tests/gate-mobile-compliance.infra.test.ts:1 "// SPEC LINK: docs/specs/02-web-admin/136_mcfrontend_handbook.md fe.05, fe.44; docs/specs/03-mobile/90_mobile_engineering_protocol.md §5" — the six never-do rows, the conversion-factor bound rule and the skip list are judged against clauses absent from the pasted context, so gates B and C cannot be assessed for compliance — paste 136 fe.44 and Spec 90 §5 with the change, or drop gates B/C from this review
- Opened: not opened by this lane (UNVERIFIED)

### G-026 · compliance:c122 · diff part 2 · DEFER severity=MED
- Spec 122 §5.5 "prove-red fixture: `scripts/steps/_schema/fixtures/compute/bad-compute-shape.js`" — src/tests/gate-compute-reach.infra.test.ts:7 "import * as gate from '../../scripts/analysis/gates/compute-reach.mjs';" — the diff adds only the two test files, so the gate modules, their fixture trees and the RED-then-GREEN run are not in the material under review and the "proven in BOTH directions" claim (line 3) cannot be verified — include `compute-reach.mjs`, `mobile-literals.mjs`, `mobile-never-do.mjs` and the two fixture directories, or the red/green run log, in the reviewed change
- Opened: not opened by this lane (UNVERIFIED)

### G-027 · compliance:c122 · diff part 2 · DEFER severity=LOW
- Spec 122 §5.4 operator ruling "cite by anchor, line numbers rot" — src/tests/gate-compute-reach.infra.test.ts:1 "§5.5 (:804-815)" — the header cites a line range, which is the exact rot the pasted ruling forbids — cite "§5.5 Condition 4" as the anchor and drop `(:804-815)`
- Opened: not opened by this lane (UNVERIFIED)

### G-028 · compliance:c122 · diff part 2 · DEFER severity=LOW
- not pasted: Spec 90 §5 — src/tests/gate-mobile-compliance.infra.test.ts:41 "for (const row of gateC.ROWS) expect(row.quote.length).toBeGreaterThan(10);" — the test title claims each row carries its quote from Spec 90 §5, but only string length is asserted, so a fabricated quote of 11 characters passes — assert each `row.quote` appears verbatim in the Spec 90 §5 text with an anchor cite
- Opened: not opened by this lane (UNVERIFIED)

### G-029 · compliance:c132 · diff part 1 · BUG severity=HIGH
- core.8 "Every number a step, gate, admin surface or tool uses is a registered logic variable or an exact zero." — scripts/analysis/gates/mobile-literals.mjs:31 "export const CONVERSION_FACTORS = ['10.7639', '10.764', '3.28084', '3.2808', '0.3048', '0.092903', '0.0929'];" — the seven numbers that decide every BOUND finding of this gate are literals in code, not gate_* / tooling_* variables, so the gate that enforces externalization exempts itself — move the factor set into a registered logic variable read through gateVariable and pin it.
- Opened: not opened by this lane (UNVERIFIED)

### G-030 · compliance:c132 · diff part 1 · BUG severity=MED
- core.8 "Unit constants and definitional windows are pinned (min = max)." — scripts/analysis/gates/compute-reach.mjs:121 "maxBuffer: gateVariable('tooling_spawn_max_buffer_mb') * 1024 * 1024" — the MB to bytes unit constant 1024 * 1024 is written in code while the registered variable is in MB — register the buffer ceiling in bytes as a pinned tooling_* variable and use it directly.
- Opened: not opened by this lane (UNVERIFIED)

### G-031 · compliance:c132 · diff part 1 · DEFER severity=MED
- core.8 "Every number a step, gate, admin surface or tool uses is a registered logic variable or an exact zero." — scripts/analysis/gates/mobile-literals.mjs:7 "It names step, gate, admin surface, tool. It does NOT name the phone app, so by its own words it does not bind mobile code." — whether core.8 reaches phone numbers (classes U1 to U4, counted by nothing and never by --strict) rests only on a code comment plus an UNVERIFIED note, and no operator ruling is pasted — carry the question as an explicit open item with the ruling reference, or apply core.8 to phone numbers until that ruling lands.
- Opened: not opened by this lane (UNVERIFIED)

### G-032 · compliance:c132 · diff part 1 · DEFER severity=MED
- §6 R-BA "A step-standard item that no machine checks is not part of the standard" — scripts/analysis/gates/mobile-never-do.mjs:10 "Exit 0 with a list; --strict exits 1 on findings. Not wired." — three report-only gates wired to no hook, station or CI leave the §6 none count unchanged, so no standard item becomes machine-checked — name the wiring step inside this change or state in the change record that it closes nothing.
- Opened: not opened by this lane (UNVERIFIED)

### G-033 · compliance:c132 · diff part 1 · DEFER severity=LOW
- §6 "The list only shrinks: `src/tests/handbook-rule-map.logic.test.ts` caps it, and `step-validate --all` prints the count." — scripts/analysis/gates/compute-reach.mjs:1 "SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5; 132_step_standard_handbook.md §6 R-BA" — no test or lock in the diff names R-BA or any §6 row, so the SPEC LINK citation is not carried by the shrink-only register — add the lock test naming the rule ids or drop the §6 R-BA citation.
- Opened: not opened by this lane (UNVERIFIED)

### G-034 · compliance:c132 · diff part 1 · DEFER severity=LOW
- core.8 "Every number a step, gate, admin surface or tool uses is a registered logic variable or an exact zero." — scripts/steps/_schema/fixtures/reach/bad-reacher.ts:3 "const WAIT_LIMIT = 5;" — the new fixtures carry planted numbers and defects under scripts/steps, outside compute-reach.mjs:33 "export const SCAN_ROOTS = ['src', 'mobile'];" and outside the mobile roots at mobile-literals.mjs:28, and no test in the diff points a gate at them — add the test that runs the gates over these fixture roots or drop the fixtures.
- Opened: not opened by this lane (UNVERIFIED)

### G-035 · compliance:c132 · diff part 2 · BUG severity=HIGH
- core.8 "Every number a step, gate, admin surface or tool uses is a registered logic variable or an exact zero." — src/tests/gate-mobile-compliance.infra.test.ts:40 "expect(gateC.ROWS.length).toBe(6);" — the never-do row count is a bare gate number and the quote-length floor at :41 is a bare tooling number, neither is a pinned gate_* or tooling_* variable — register both as pinned logic variables (min=max) and assert against them.
- Opened: not opened by this lane (UNVERIFIED)

### G-036 · compliance:c132 · diff part 2 · DEFER severity=MED
- core.8 "Every number a step, gate, admin surface or tool uses is a registered logic variable or an exact zero." — src/tests/gate-compute-reach.infra.test.ts:47 "expect(gate.reaches(\"import x from '../../scripts/lib/step/config.js'\").length).toBe(1);" — the expected reach count and the two-conversion-factor count at gate-mobile-compliance.infra.test.ts:18 are bare literals, so they will drift from the fixtures — pin them as tooling_* variables or derive them from the fixtures.
- Opened: not opened by this lane (UNVERIFIED)

### G-037 · compliance:c136 · diff part 1 · BUG severity=HIGH
- fe.01 "McFrontend is documents only now; the build starts after McBylaws increment 2 closes, with the 2026-11-02 infra freeze lifted for it by name" — scripts/analysis/gates/mobile-literals.mjs:1 "// SPEC LINK: docs/specs/02-web-admin/136_mcfrontend_handbook.md fe.05, fe.44" — two McFrontend/mobile gates are added as build with no pasted ruling that increment 2 closed or that the freeze was lifted for task-367 by name — fix: paste the operator ruling that lifts the freeze for this card, or hold mobile-literals.mjs and mobile-never-do.mjs to stage 2.
- Opened: not opened by this lane (UNVERIFIED)

### G-038 · compliance:c136 · diff part 1 · DEFER severity=MED
- fe.13 "surface-validate.mjs (MF-15) is the first gate McFrontend builds, part of the build after increment 2" — scripts/analysis/gates/mobile-never-do.mjs:1 "// SPEC LINK: docs/specs/03-mobile/90_mobile_engineering_protocol.md §5; 132_step_standard_handbook.md §6 R-BA" — the named first McFrontend gate surface-validate.mjs appears nowhere in the diff while two other McFrontend gates land — rationale: a resequence may be legitimate, but no pasted ruling resequences it.
- Opened: not opened by this lane (UNVERIFIED)

### G-039 · compliance:c136 · diff part 1 · DEFER severity=MED
- fe.05 "every number from McBylaws; no maths in the UI" — scripts/analysis/gates/mobile-literals.mjs:11-12 "a timer or retry count is not a displayed number and not maths on one" — the gate puts non-displayed numbers (scripts/steps/_schema/fixtures/mobile-gates/bad-b.tsx:4 "export const SLOW_WAIT_MS = 45_000;") outside --strict on a "displayed" qualifier fe.05 does not contain — rationale: the carve-out is the gate's own reading, an operator ruling must supply it.
- Opened: not opened by this lane (UNVERIFIED)

### G-040 · compliance:c136 · diff part 1 · DEFER severity=MED
- fe.44 "the conversion factor is content/settings, never code" — scripts/analysis/gates/mobile-literals.mjs:31 "export const CONVERSION_FACTORS = ['10.7639', '10.764', '3.28084', '3.2808', '0.3048', '0.092903', '0.0929'];" — a factor written as any other spelling (0.09290304, 2.47105 acres per hectare, 0.836127 square yards) is invisible, so "never code" is enforced only for these seven strings — rationale: bounded miss, but the clause is absolute and the list is closed.
- Opened: not opened by this lane (UNVERIFIED)

### G-041 · compliance:c136 · diff part 1 · DEFER severity=MED
- fe.15 "planted defect in a temp copy: non-zero exit; clean copy: zero" — scripts/steps/_schema/fixtures/mobile-gates/bad-b.tsx:1 "// @ts-nocheck" — eight planted-defect and clean-twin fixtures are added with no runner in the diff, so nothing proves the bad twin exits non-zero and the clean twin exits zero — fix: add the proving test that runs each gate over its bad and clean fixtures.
- Opened: not opened by this lane (UNVERIFIED)

### G-042 · compliance:c136 · diff part 2 · BUG severity=HIGH
- fe.01 "McFrontend is documents only now; the build starts after McBylaws increment 2 closes, with the 2026-11-02 infra freeze lifted for it by name; scope mobile, web, admin and PDF." — src/tests/gate-mobile-compliance.infra.test.ts:1 "SPEC LINK: docs/specs/02-web-admin/136_mcfrontend_handbook.md fe.05, fe.44; docs/specs/03-mobile/90_mobile_engineering_protocol.md §5" — the header leans on two McFrontend rules to justify landing McFrontend mobile gates B and C, and no pasted line shows increment 2 closed or the freeze lifted by name for these gates (cannot see) — cite the operator ruling or plan line that lifts the freeze for gate B and gate C, or hold the change.
- Opened: not opened by this lane (UNVERIFIED)

### G-043 · compliance:c136 · diff part 2 · DEFER severity=MED
- fe.44 "the conversion factor is content/settings, never code" — src/tests/gate-mobile-compliance.infra.test.ts:30 "expect(gateB.isSkipped('mobile/src/theme.generated.ts')).toBe(true);" — a by-name carve-out for generated files (and tests, mocks) from a clause written as absolute, with no pasted ruling granting conversion factors a home in generated mobile code — drop the generated-file skip or cite the ruling that grants it.
- Opened: not opened by this lane (UNVERIFIED)

### G-044 · compliance:c136 · diff part 2 · DEFER severity=MED
- fe.05 "the front end may show more, never derive differently; every number from McBylaws; no maths in the UI" — src/tests/gate-mobile-compliance.infra.test.ts:22 "for (const id of ['U1-upper-snake-number', 'U2-timer-number', 'U3-retry-count', 'U4-query-option-number'])" — four informational numeric classes (timers, retry counts, query options) enter the gated surface though no pasted clause names any of them — keep only the fe.44 conversion-factor class or cite the clause that requires the other four.
- Opened: not opened by this lane (UNVERIFIED)

### G-045 · compliance:c136 · diff part 2 · DEFER severity=LOW
- fe.13 "surface-validate.mjs (MF-15) is the first gate McFrontend builds, part of the build after increment 2." — src/tests/gate-mobile-compliance.infra.test.ts:7 "import * as gateB from '../../scripts/analysis/gates/mobile-literals.mjs';" — gates B and C are landed ahead of the gate the clause names as first, and no pasted line places surface-validate in this sequence — name where surface-validate sits relative to these gates, or reorder.
- Opened: not opened by this lane (UNVERIFIED)

### G-046 · compliance:c136 · diff part 2 · DEFER severity=LOW
- fe.44 "The page producer sends each number pre-formatted in both units; the client only switches which is shown, with no maths" — src/tests/gate-mobile-compliance.infra.test.ts:16 "const { bound, info } = gateB.scan(ROOT, [FIX]);" — fe.44 is cited in the header but only its literal ban is exercised, the pre-formatted-both-units and no-client-maths limbs are not proven here and the owed lock src/tests/surfaces/report-units.logic.test.ts is not added — mark fe.44 as still OWED in the header, or add the owed lock.
- Opened: not opened by this lane (UNVERIFIED)

### G-047 · compliance:c90 · diff part 1 · DEFER severity=MED
- Spec 90 §9 "Touch targets for all interactive elements MUST be a minimum of `44px` by `44px`." — scripts/analysis/gates/mobile-literals.mjs:16 "(Spec 97:328 names tabBarHeight only; Spec 90 §9 sets a 44px minimum, which is a floor, not a ban)." — §9 is a deterministic numeric MUST and is therefore gate-able, yet the numbers gate records it as not covered and calls a MUST "a floor, not a ban", leaving the only deterministic numeric clause in the pasted spec unenforced while a non-pasted conversion-factor rule is bound — add a check that flags interactive elements sized below 44px, or cite a pasted operator ruling that defers §9.
- Opened: not opened by this lane (UNVERIFIED)

### G-048 · compliance:c90 · diff part 1 · DEFER severity=MED
- Spec 90 §5 C3 "Never use `window`, `document`, `localStorage`, `navigator.geolocation`." — scripts/analysis/gates/mobile-never-do.mjs:61 "if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && row('C3-no-dom-apis').names.includes(n.name.text)) shadowed.add(n.name.text);" — shadowing is collected file-wide, so one parameter or local named document/window/localStorage suppresses every reference to the real global in that file and §5 C3 passes undetected — make the suppression scope-aware so only references bound to that declaration are skipped.
- Opened: not opened by this lane (UNVERIFIED)

### G-049 · compliance:c90 · diff part 1 · DEFER severity=LOW
- Spec 90 §5 C6 "Never use the base React Native `<Image>` for external URLs." — scripts/analysis/gates/mobile-never-do.mjs:50 "let rnImage = false; // `Image` imported from 'react-native'" — rnImage is only set for an ES named import, so a namespace `<RN.Image source={{uri:...}}>` or a destructured `require('react-native')` yields no flag and a base RN Image for an external URL passes — also detect Image reached via a namespace member or a destructured require.
- Opened: not opened by this lane (UNVERIFIED)

### G-050 · compliance:c90 · diff part 1 · DEFER severity=LOW
- Spec 90 §5 C4 "Never fetch API data inside a `useEffect`." — scripts/analysis/gates/mobile-never-do.mjs:95 "if (effectDepth.n > 0 && ts.isCallExpression(n) && ts.isIdentifier(n.expression) && row('C4-no-useeffect-fetch').names.includes(n.expression.text))" — detection only sees fetch/fetchWithAuth called literally in the effect subtree, so `useEffect(fetcher)` or a fetch inside a named helper the effect calls is not flagged — also flag a bare fetch identifier passed as the effect argument, or follow a named helper reference.
- Opened: not opened by this lane (UNVERIFIED)

### G-051 · compliance:c90 · diff part 1 · DEFER severity=LOW
- no pasted clause names conversion factors — scripts/analysis/gates/mobile-literals.mjs:10 "Binds the client: a unit-conversion factor written in code. -> BOUND class B1." — Gate B's only BOUND class and its `--strict` exit 1 rest on 136 fe.44 which is not in the pasted context, and no pasted Spec 90 clause bans a conversion factor, so a failing behaviour is added without a pasted governing clause — cite a pasted clause or operator ruling for B1, or drop `--strict` for it.
- Opened: not opened by this lane (UNVERIFIED)

### G-052 · compliance:c90 · diff part 1 · DEFER severity=LOW
- no pasted clause names compute-shape on mobile — scripts/analysis/gates/compute-reach.mjs:41 "export const SCAN_ROOTS = ['src', 'mobile'];" — Gate A applies the 122/132 compute rules (not pasted) to files under mobile, and the pasted Spec 90 says nothing about compute-shape or core.8/core.9, so this added detection is ungoverned by anything pasted — cite the pasted clause authorizing compute checks on mobile, or scope Gate A to the pasted spec.
- Opened: not opened by this lane (UNVERIFIED)

### G-053 · compliance:c90 · diff part 2 · DEFER severity=MED
- Spec 90 §5 "Strict Anti-Patterns (NEVER DO THESE)" — src/tests/gate-mobile-compliance.infra.test.ts:39-41 "it('C2: the list is six rows, each with its quote from Spec 90 §5'" / "expect(row.quote.length).toBeGreaterThan(10)" — the test name claims every row carries its quote from §5 but the only assertions are row count 6 and quote length > 10, so a wrong-but-long quote is green, meaning the six-row list is not bound to the six pasted §5 bullets — assert each row.quote is a substring of the pasted §5 text and assert the six expected row ids.
- Opened: not opened by this lane (UNVERIFIED)

### G-054 · compliance:c90 · diff part 2 · DEFER severity=LOW
- Spec 90 §5 "NO HTML/DOM: Never use `<div>`, `<span>`, `<a>`, `<p>`, or `<button>`." — src/tests/gate-mobile-compliance.infra.test.ts:37 "for (const row of gateC.ROWS) expect(hit(findings, 'bad-c.tsx', row.id), row.id).toBe(true);" — one hit per row on one fixture is the whole proof for a row that must catch five distinct tags, a row matching only one tag would still pass C1 — assert a hit per tag, or split the expected ids per tag.
- Opened: not opened by this lane (UNVERIFIED)

### G-055 · compliance:c90 · diff part 2 · DEFER severity=LOW
- clause not pasted (136 fe.05, fe.44; 132 §6 R-BA, core.8, core.9; 08_agents.md:462) — src/tests/gate-mobile-compliance.infra.test.ts:21 "for (const id of ['U1-upper-snake-number', 'U2-timer-number', 'U3-retry-count', 'U4-query-option-number'])" — the conversion-factor bound and the four informational classes are behaviour no pasted clause names, and no pasted Spec 90 clause governs numeric literals in mobile code — paste fe.05/fe.44 so the B1/U1-U4 rules have a governing clause in context.
- Opened: not opened by this lane (UNVERIFIED)

### G-056 · compliance:c90 · diff part 2 · DEFER severity=LOW
- clause not pasted (122 §5.5, 132 §6 R-BA/core.8/core.9) — src/tests/gate-compute-reach.infra.test.ts:1 "// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5 (:804-815); 132_step_standard_handbook.md §6 R-BA, core.8, core.9" — Gate A rests entirely on clauses absent from the pasted context, so this lens can neither confirm nor refute A1 to A5 — paste 122 §5.5 and 132 §6 core.8/core.9 into the review context.
- Opened: not opened by this lane (UNVERIFIED)

### G-057 · compliance:ceng · diff part 1 · BUG severity=HIGH
- §5.3 "You MUST write and run a **failing test** (Red Light) BEFORE writing any feature or fix code." — NONE (no test file appears in the diff) — three new gate modules and eight fixture files are added with no failing test that demonstrates the red light, so the Golden Rule has no evidence of being followed — add the red test that fails against the fixture before the gate code, and show the run.
- Opened: not opened by this lane (UNVERIFIED)

### G-058 · compliance:ceng · diff part 1 · BUG severity=HIGH
- §5.2 "`*.logic.test.ts` | Pure functions, scoring, classification | Any pure/derivation logic" — scripts/analysis/gates/compute-reach.mjs:73 "export function reaches(text) {" — the diff adds pure derivation logic (`reaches`, `walk`, `scan`, `isSkipped`, `nonZero`, `matchesPkg`, `reusedRules`) across three modules, plus `bad-b.tsx` / `bad-c.tsx` / `clean-*` / `reach/*` fixtures, and no `*.logic.test.ts` exists to run any of them, so the fixtures prove nothing — add `compute-reach.logic.test.ts`, `mobile-literals.logic.test.ts`, `mobile-never-do.logic.test.ts` asserting each planted fixture yields its named findings and each clean twin yields none.
- Opened: not opened by this lane (UNVERIFIED)

### G-059 · compliance:ceng · diff part 1 · BUG severity=MED
- §14 "Every source/test file's `SPEC LINK` points at the spec **AND the section (§N)**" — scripts/steps/_schema/fixtures/reach/bad-reacher.ts:1 "// @ts-nocheck" — all eight new fixture files (bad-b, bad-c, clean-b, clean-c, bad-reacher, caller, clean-reacher, not-a-reacher) start at line 1 with `@ts-nocheck` and carry no SPEC LINK at all, unlike the three gate modules which do — add a SPEC LINK naming the spec and section (e.g. 90_mobile_engineering_protocol.md §5) to each fixture.
- Opened: not opened by this lane (UNVERIFIED)

### G-060 · compliance:ceng · diff part 1 · DEFER severity=MED
- §14 "where deterministic, **promoted to a machine-read GATE** (husky footgun / ESLint / migration hook) — the strongest form: *a NO-GO the machine reads cannot be shipped past*" — scripts/analysis/gates/compute-reach.mjs:20 "// Report-only: exit 0 with a findings list; --strict exits 1 on findings. Not wired into any hook, the push station or CI (stage 1)." — all three gates are advisory only, so nothing yet prevents the classes §14 exists to prevent — stage 2 must wire at least one hook/CI entry, and that wiring should be the named next step, not left open.
- Opened: not opened by this lane (UNVERIFIED)

### G-061 · compliance:ceng · diff part 1 · DEFER severity=LOW
- §9.6 "Pipeline metadata (chain definitions, script paths, table reads/writes, feature flags) MUST be declared in `scripts/manifest.json` as the single source of truth." — NONE (no manifest entry in the diff) — three new scripts are added under `scripts/` with no `scripts/manifest.json` entry, so the "single source of truth" for script paths no longer lists them — confirm whether analysis gates are manifest-scoped or add entries with their read-only I/O declaration.
- Opened: not opened by this lane (UNVERIFIED)

### G-062 · compliance:ceng · diff part 2 · DEFER severity=MED
- §5.2 "| `*.infra.test.ts` | API routes, DB queries, external calls | New API route / DB mutation (unhappy path first, §5.3) |" and §5.5 "| `*.logic.test.ts` | The pure function computes the right value on happy + edge inputs." — src/tests/gate-compute-reach.infra.test.ts:14 "describe('gate A — engine compute reached outside the scanned compute folder', () => {" (same for src/tests/gate-mobile-compliance.infra.test.ts:14) — both files test file-content parsers that classify findings, with no API route, no DB query and no external call, so the layer named by §5.5 for classification is `.logic.test.ts` and §5.5 warns "a green suite in the wrong layer is false confidence" — rename to `gate-compute-reach.logic.test.ts` / `gate-mobile-compliance.logic.test.ts`, or add an explicit gate-scanner row to §5.2 in the same change so the layer choice is ruled, not assumed.
- Opened: not opened by this lane (UNVERIFIED)

### G-063 · compliance:ceng · diff part 2 · DEFER severity=LOW
- §5.3 "You MUST write and run a **failing test** (Red Light) BEFORE writing any feature or fix code. Code may not be written until the test demonstrably fails." — src/tests/gate-compute-reach.infra.test.ts:3 "COMPLY.3 stage 1 (task-367) — Gate A, `scripts/analysis/gates/compute-reach.mjs`, proven in BOTH directions" — the gate modules being proven (`scripts/analysis/gates/compute-reach.mjs`, `mobile-literals.mjs`, `mobile-never-do.mjs`) are not in this diff, so the red-before-green ordering cannot be seen, and the only visible evidence is a header comment, which the format rule says is not proof — paste the red run output (or the gate-module diff) into the change set so the failing-first order is visible.
- Opened: not opened by this lane (UNVERIFIED)

### G-064 · compliance:ceng · diff part 2 · DEFER severity=LOW
- §5.5 "Pick the layer that *proves the claim*; a green suite in the wrong layer is false confidence." — src/tests/gate-mobile-compliance.infra.test.ts:40 "expect(gateC.ROWS.length).toBe(6);" — C2 proves the never-do list is six rows with quotes longer than 10 chars, but proves nothing about each row tracing to a Spec 90 §5 line (Spec 90 §5 itself is not pasted, so alignment is cannot see) — pin each row id to its quoted §5 sentence in the fixture so the test fails when a row drifts from the spec text.
- Opened: not opened by this lane (UNVERIFIED)

### G-065 · errorpaths · diff part 1 · BUG severity=HIGH
- scripts/analysis/gates/compute-reach.mjs:123 "if (res.status !== 0 && res.status !== 1) throw new Error(`ast-grep failed (exit ${res.status}): ${res.stderr}`);" — if ast-grep exits 1 for a rule-load or config error instead of a match, the gate accepts it, parses empty stdout to zero findings and reports the file clean, a false-negative fail-open — treat exit 1 as findings only when stdout parses and stderr carries no diagnostic, otherwise throw and abort loudly.
- Opened: not opened by this lane (UNVERIFIED)

### G-066 · errorpaths · diff part 1 · DEFER severity=MED
- scripts/analysis/gates/compute-reach.mjs:128 "if (m) out.push({ file, line: Number(m[2]), ruleId: m[4], lineText: (lines[Number(m[2]) - 1] || '').trim() });" — any output line whose severity or format differs from LINE_RE is dropped with no notice, so real findings vanish silently — count non-empty stdout lines that fail LINE_RE and fail the scan if any exist.
- Opened: not opened by this lane (UNVERIFIED)

### G-067 · errorpaths · diff part 1 · DEFER severity=MED
- scripts/analysis/gates/compute-reach.mjs:156 "if (spec === s.stem || base === s.stem) via.add(s.file);" with :155 "const base = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1]));" — a caller importing the reacher as "./clean-reacher.js" yields a base that keeps the extension while s.stem is extension-stripped, so that caller is never listed or scanned — strip the extension from base before the equality test.
- Opened: not opened by this lane (UNVERIFIED)

### G-068 · errorpaths · diff part 1 · DEFER severity=MED
- scripts/analysis/gates/mobile-never-do.mjs:61 "if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && row('C3-no-dom-apis').names.includes(n.name.text)) shadowed.add(n.name.text);" — one local "const document =" anywhere in a file suppresses every document, window and localStorage reference in that same file, including genuine global uses, so C3 goes quiet (false clean) — scope shadowing to the declaring binding's references, not a file-wide name set.
- Opened: not opened by this lane (UNVERIFIED)

### G-069 · errorpaths · diff part 1 · DEFER severity=MED
- scripts/analysis/gates/compute-reach.mjs:184 "if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();" — invoking the gate through a symlink or node_modules/.bin shim makes the guard false, so it prints nothing and exits 0, indistinguishable from a clean pass — compare realpath to realpath, or pathToFileURL on the resolved path.
- Opened: not opened by this lane (UNVERIFIED)

### G-070 · errorpaths · diff part 1 · DEFER severity=MED
- scripts/analysis/gates/compute-reach.mjs:62 "if (!fs.existsSync(abs)) return out;" — when both src/ and mobile/ are absent the walk returns nothing and main prints 0 files, 0 findings, exit 0, a silent clean for a tree it never scanned — fail (exit non-zero) when the walked file count across all roots is zero.
- Opened: not opened by this lane (UNVERIFIED)

### G-071 · errorpaths · diff part 1 · DEFER severity=LOW
- scripts/analysis/gates/compute-reach.mjs:118 "fs.writeFileSync(ruleFile, rules.map((r) => yaml.dump(r, { lineWidth: -1 })).join('---\n'));" — this write sits before the try/finally, so a throw here (disk full, read-only tmp) leaks the mkdtemp dir on every error — move it inside the try so the finally rmSync removes the temp dir.
- Opened: not opened by this lane (UNVERIFIED)

### G-072 · errorpaths · diff part 2 · DEFER severity=MED
- src/tests/gate-mobile-compliance.infra.test.ts:24 "expect([...bound, ...info].filter((f: F) => f.file.endsWith('clean-b.tsx'))).toEqual([]);" — the GREEN direction fails open: if clean-b.tsx is deleted, renamed to a skipped suffix, or unreadable, the scan yields nothing for it and the test passes, so the lock is reported proven without the file ever having been visited (same shape at line 44 for clean-c.tsx, and at gate-compute-reach.infra.test.ts:29 for clean-reacher.ts) — assert a positive control that the twin was scanned (e.g. filesScanned contains clean-b.tsx) before asserting zero findings.
- Opened: not opened by this lane (UNVERIFIED)

### G-073 · errorpaths · diff part 2 · DEFER severity=MED
- src/tests/gate-compute-reach.infra.test.ts:34 "expect(reachers.concat(callers).some((r: { file: string }) => r.file.endsWith('not-a-reacher.ts'))).toBe(false);" — A3 claims "not listed and not scanned" but only asserts absence, so a missing fixture file or a swallowed readdir error satisfies it; if not-a-reacher.ts must break a rule yet never reach the core, assert first that the file was visited and that it does contain a violation, otherwise the absence is vacuous.
- Opened: not opened by this lane (UNVERIFIED)

### G-074 · errorpaths · diff part 2 · DEFER severity=MED
- src/tests/gate-compute-reach.infra.test.ts:45 "expect(() => gate.reusedRules(ROOT)).not.toThrow();" — A5's name says "the applied rule ids all exist in the reused rule file" but the body only asserts no throw, so an error path that returns an empty or partial rule map without throwing passes and a renamed or deleted rule id goes unnoticed — assert every id in GATE_A_RULE_IDS is a key of the returned map and the map is non-empty.
- Opened: not opened by this lane (UNVERIFIED)

### G-075 · errorpaths · diff part 2 · DEFER severity=MED
- src/tests/gate-compute-reach.infra.test.ts:18 "const ids = new Set(findings.filter((f: { file: string }) => f.file.endsWith('bad-reacher.ts')).map((f: { ruleId: string }) => f.ruleId));" — building a Set erases duplicates by construction, and A2 shows a file can be reached twice (static and dynamic), so a gate that emits the same violation once per reach form double-reports to consumers and no test can see it — also assert the raw finding count for bad-reacher.ts equals a declared number.
- Opened: not opened by this lane (UNVERIFIED)

### G-076 · errorpaths · diff part 2 · DEFER severity=MED
- src/tests/gate-mobile-compliance.infra.test.ts:15 "const { bound, info } = gateB.scan(ROOT, [FIX]);" — the Gate B scan runs at describe collection time, so a throw or a hang there aborts collection of the rest of the file and the Gate C tests (line 35, later in the same file) never register, turning two independent gate verdicts into one collection error with no timeout bound — move each scan into a beforeAll inside its own describe, or split Gate B and Gate C into separate files.
- Opened: not opened by this lane (UNVERIFIED)

### G-077 · errorpaths · diff part 2 · DEFER severity=LOW
- src/tests/gate-mobile-compliance.infra.test.ts:10 "const ROOT = process.cwd();" — both files resolve FIX relative to the test runner's cwd, so running vitest from a subdirectory or a different workspace root makes the fixture path resolve to nothing; whether the gate then throws or returns empty is cannot see, and if it returns empty the absence assertions pass while the RED ones fail with a misleading message — derive ROOT from import.meta.url instead of process.cwd().
- Opened: not opened by this lane (UNVERIFIED)
