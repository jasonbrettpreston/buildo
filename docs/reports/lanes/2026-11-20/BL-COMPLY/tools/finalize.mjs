import fs from 'node:fs'; import { execFileSync } from 'node:child_process';
const C = process.env.HOME + '/Buildo-scratch/lanes-20261119/inc1b/comply';
const R = JSON.parse(fs.readFileSync(`${C}/build/findings.json`, 'utf8'));
const jobs = fs.readFileSync(`${C}/runs/JOBS.tsv`, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
const pl = (pack) => fs.readFileSync(`${C}/packs-out/${pack}.md`, 'utf8').match(/Rules in the whole list: (\d+)/)[1];
const manifest = fs.readFileSync(`${C}/diffs/MANIFEST.tsv`, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
const out = [];
const P = (s = '') => out.push(s);
P('# FINDINGS (untriaged): task-365 COMPLY.1, handbook compliance pass on git diff 9f04d9074..3a36e8b26 (src, mobile, scripts)');
P();
P('Lane BL-COMPLY. Nothing here is adjudicated or fixed. A finding is a BUG or DEFER line returned by the DeepSeek compliance lens (.claude/review-templates/lens-compliance.md), copied as returned. The only line added by this lane per finding is "Opened:" (file:line opened at 3a36e8b26: the quoted code is there / is not there). Every finding goes to a separate grounder (Spec 08 section 5.3).');
P();
P('## Question for the grounder (stated, not answered by this lane)');
P();
P('The new route-side entry `src/lib/parcels/report-compute.ts` (LOAD.1, task-266) and the changes it needed inside `scripts/lib/compute` or the core: which McDonald\'s Airtight gates SCAN those files? A file outside `scripts/lib/compute` may be outside every purity gate. No file under `scripts/lib/` changed in the range (`git diff --name-only 9f04d9074 3a36e8b26 | grep ^scripts/lib` printed nothing), so the question is about `src/lib/parcels/report-compute.ts` itself. The table is the scope glob of each gate, read at the line shown, and whether that glob matches the path `src/lib/parcels/report-compute.ts` (a path match only; whether the file is reachable from a scanned compute module is not claimed):');
P();
P('| Gate | Scope glob or set, file:line | Matches report-compute.ts by path |');
P('|---|---|---|');
const G = [
  ['ast-grep compute-shape rules (console, bare fetch, wall clock, process.env, forbidden require, literals)', "scripts/ast-grep-rules/compute-shape.yml:22-24 `files: 'scripts/lib/compute/**/*.js', 'scripts/steps/_schema/fixtures/compute/**/*.js'`", 'does not scan'],
  ['check-step-shape.mjs (A2, pre-commit; Spec 122 5.1)', "scripts/hooks/check-step-shape.mjs:61 `COMPUTE_DIR = process.env.BUILDO_COMPUTE_DIR || 'scripts/lib/compute'`", 'does not scan'],
  ['compute-literals.mjs (tunable literals in compute)', "scripts/analysis/gates/compute-literals.mjs:34 `COMPUTE_DIR = 'scripts/lib/compute'`", 'does not scan'],
  ['compute-closure.mjs (G0, what compute can reach)', "scripts/analysis/gates/compute-closure.mjs:50 `COMPUTE_GLOB_DIR = 'scripts/lib/compute'`; runner entries :53 `scripts/lib/step/index.js`, `scripts/lib/pipeline.js`", 'does not scan (it walks outward from scripts/lib/compute; a file that calls into compute is not in the closure by this glob)'],
  ['compute-purity.mjs G1-G13 (SQL and JS halves)', 'scripts/analysis/gates/compute-purity.mjs:94-106 `scanPurity`: scan set = computeEntries() plus computeClosure().modules, .js/.cjs only (:11 header text)', 'does not scan (.ts, outside the closure by this definition)'],
  ['ast-grep step-shape.yml', "scripts/ast-grep-rules/step-shape.yml:51 and :159 `'scripts/**/*.js'`", 'does not scan'],
  ['ast-grep bylaw-literal.yml (M-61 no by-law id literal)', 'scripts/ast-grep-rules/bylaw-literal.yml:21-28 (scripts/analysis/bylaw/**, scripts/lib/maxbld-*.js, scripts/lib/bylaw-*.js, scripts/lib/compute/ files, and the by-law resolver script)', 'does not scan'],
  ['estate-literals.mjs (R-LA estate scopes)', "scripts/analysis/gates/estate-literals.mjs:44 `ESTATE_SCOPES = ['scripts/analysis/gates', 'scripts/lib/step']`", 'does not scan'],
  ['ast-grep-leads.sh silent-catch-fallback (a footgun rule, not a purity gate)', 'scripts/hooks/ast-grep-leads.sh:47 `scope_lib="src/lib"`, :59 `ast-grep scan --rule scripts/ast-grep-rules/silent-catch-fallback.yml "$scope_lib"` (run at .husky/pre-commit:52)', 'scans (src/lib/**)'],
  ['src-sql-ledger.mjs --check (src SQL catalog and closed interpolated set; .husky/pre-commit:23)', 'scripts/analysis/src-sql-ledger.mjs:82-111 `CLOSED_INTERPOLATED_SET` names src/lib/parcels/report-compute.ts at :111', 'scans (named in the closed set)'],
  ['report-no-maths.logic.test.ts (FE-05 AST scan)', "src/tests/surfaces/report-no-maths.logic.test.ts:28 `DIRS = ['src/lib/surfaces/report', 'src/components/report', 'src/app/admin/report-preview', 'src/lib/surfaces/report-images']`", 'does not scan (src/lib/parcels is not in DIRS)'],
];
for (const g of G) P(`| ${g[0]} | ${g[1].replace(/\|/g, '/')} | ${g[2]} |`);
P();
P('Not examined by this lane (UNVERIFIED): whether `report-compute.ts` imports a module that a gate scans (reachability is not the glob), the run-time scope of `step-validate.mjs` fast invariants beyond the gates named, and any gate not named in the brief.');
P();
P('## How a task\'s touched files map to rules, mechanically (asked by the coordinator; facts read in this lane)');
P();
P('| Artifact | What it maps (key to value) | Could it select the rules for a diff with no human choice |');
P('|---|---|---|');
P('| scripts/surfaces/_schema/surface-rule-map.json | `lines[]` = `{id: fe.NN, section}` (44) and `rules[]` = `{id: FE-NN, kind, status, handbook_line, source{file, anchor}}` (44). Rule id to handbook line to register row. No path, glob or file field. | No. It cannot take a file as input. |');
P('| scripts/steps/_schema/rule-map.json | `rules[]` (444): `{id, kind, status, handbook_line, enforcement{kind, ref}, statement, source{file, anchor}}`. Rule id to its handbook line and to the lock file (`enforcement.ref`) that enforces it; `unenforced[]` (100 entries). Rule to file direction only (lock file). | No. No file-to-rule key. |');
P('| scripts/analysis/bylaw/_schema/bylaw-rule-map.json | `rules[]` (546): `{id, kind, status, handbook_line, source{file, anchor}}`; no `enforcement` field on any entry. Rule id to handbook line and register row. | No. |');
P('| src/tests/handbook-rule-map.logic.test.ts, src/tests/surfaces/handbook-rule-map.logic.test.ts | Locks that the committed rule map and handbook equal what the generator builds from the register (Spec 132 and 136); every lock named in a rule entry exists and mentions its rule id. Map to generated text, not to code files. | No. |');
P('| Each spec\'s "Target Files" section (Spec 126 :1218, Spec 132 :658, Spec 135 :78) | The files that the spec\'s own change touches (documents, generators, tests). A spec to its own files. | No. It is not a code-file to rule map. |');
P('| Task `Files:` line (read by scripts/hooks/check-task-files.mjs, CHK.1) | task to the files it may change (commit scope), not to rules | No. |');
P('| scripts/surfaces/_schema/bindings.json `modules`, scripts/surfaces/_schema/binding-sources.json, scripts/ast-grep-rules/*.yml `files:` | The scope of individual gates: a gate to its files (globs). This is the only file-to-gate direction in the repo; it is per gate, not per handbook rule. | Partly: for the gates only, by glob (see the table above). Not for the handbook rules. |');
P();
P('Searches behind this answer: opened the three rule maps with `node -e` (keys and one entry each), grep `glob|path` in surface-rule-map.json (no path or glob field), grep "Target Files" in Specs 122, 124, 126, 132 (Spec 122 and 124 have none; 126 and 132 list their own files).');
P();
P('## Method and tool limits found (stated so the grounder can judge coverage)');
P();
P('- The pass ran the compliance lens (`scripts/deepseek-review.js review <diff part> --context <pack> --template .claude/review-templates/lens-compliance.md`), one run per (pack part, diff part). The brief\'s form (pack and diff in one file) was not usable: `scripts/lib/review-template.js` substitutes the plan placeholder twice in the template (the file is sent twice) and the 120000-character bound is on the doubled prompt. Pack therefore goes in `--context` (once), the diff part in the file (twice); diff parts are cut to 38000 characters or less at file boundaries.');
P('- `substitutePlaceholders` uses `String.replace` with the text as the replacement, so a `$` sequence in a diff or pack (`$&`, `$\'`) expands into other text and the placeholder tokens inside a diff are re-substituted. To keep the lens input equal to the real text, every `$` was doubled before the call (so the model sees the original) and the literal placeholder tokens in `diffs/diff-scripts-1.patch` (written with a zero-width space between the braces) were neutralised. A tool defect for the grounder to list: unescaped, the first run of `airtight-p1` on `scripts-1` built a 213932-character prompt.');
P('- The Opened line is a mechanical check: the cited file is read with `git show 3a36e8b26:<path>`, the quote (leading + removed, whitespace collapsed) is searched within 3 lines of the cited line, then in the whole file; a quote the lens wrote with an internal elision (...) or as diff text across lines reads "not there" even if the code exists, so the grounder opens it. Lines where the lens wrote only "none" (no finding of that kind) are not counted as findings.');
P('- The lens returns at most 8 findings per run (its own output format). A run that hit 8 may have had more; the count of BUG/DEFER lines per run is in the run table. MET and REJECT lines are not findings; they are in the pass files.');
P('- Packs are copied whole; where a pack is more than 33000 characters it is split by heading into parts and every part meets every diff part named for it.');
P('- Excluded from the diff (not sent): goldens and fixtures (160 files, 341596 characters of diff: `*.goldens.json`, `*/fixtures/*`, `coa-expected/*`), generated registries (`scripts/steps/_schema/consumer-registry.json`, `scripts/steps/_schema/src-sql-ledger.json`), and test files except the mobile tests (33 test files, 204806 characters of diff in all). Reason: size bound; the test files are the locks, not the product behaviour.');
P();
P('Diff parts sent (each is `git diff 9f04d9074 3a36e8b26 -- <files>`):');
P();
for (const m of manifest) P(`- ${m[0]} (${m[1]} characters): ${m[2]}`);
P();
P('## Coverage table');
P();
P('Rules total = rules in the whole copied list; sent = rules sent to the lens (every part of the pack meets every diff part named for it in the run table); with a machine check and with none are as the source itself says (named enforcer in the list, rule-map enforcement kind, or the check\'s own header); "not tabulated" = the source holds no per-rule enforcement field, so this lane did not invent one.');
P();
P('| Handbook (pack) | Source | Rules total | Rules sent | With a machine check | With none |');
P('|---|---|---|---|---|---|');
const COV = [
  ['fe (McFrontend handbook, Spec 136 section 2)', 'docs/specs/02-web-admin/136_mcfrontend_handbook.md:32-165', pl('fe'), pl('fe'), '35 name a lock (Enforced by: path); 8 are OWED (lock still to land); 1 other line', '8 OWED + 1 other'],
  ['step (Spec 132 sections 2, 3, 4, 6)', 'docs/specs/01-pipeline/132_step_standard_handbook.md:122-463, 503-591', `${pl('step-p1')} handbook lines (rule-map ids on those lines: 427 of 444)`, `${pl('step-p1')} lines (427 ids)`, '363 ids on the sent lines: 324 lock, 37 check, 1 hook, 1 lock-db (of 444: 325 lock, 37 check, 1 hook, 1 lock-db = 364)', '64 ids on the sent lines (of 444: 80 none); the section 6 table lists the 80 and 30 partial'],
  ['bylaw (Spec 133 section 2)', 'docs/specs/01-pipeline/133_bylaw_handbook.md:28-1826', pl('bylaw-p1'), pl('bylaw-p1'), '426 lines name an enforcer', '117 lines read "Enforced by: OWED"'],
  ['storage (doc-16, whole)', 'backlog/docs/doc-16 - McStorage-policy-v2.md:1-141', pl('storage-p1') + ' rules P1-P12', pl('storage-p1'), '3 named by scripts/analysis/policy-checks/chk5-mcstorage.mjs:1 (P3, P4, P6)', '9 (P1, P2, P5, P7-P12); doc-16 is DRAFT'],
  ['queue (Spec 137 sections 2-6)', 'docs/specs/00-architecture/137_mcqueue.md:33-176', pl('queue') + ' numbered rules', pl('queue'), '2 (rule 3 and rule 4 for plan tasks: scripts/hooks/check-backlog-task.mjs, scripts/analysis/backlog-decision.mjs, named in the McLane note 137:23-24)', '12 (stated by Spec 137 section 6 "Deferred": the commit check is not built)'],
  ['spec08 (sections 7 and 11)', 'docs/specs/00-architecture/08_agents.md:330-346, 453-516', pl('spec08') + ' items by pattern', pl('spec08'), 'not tabulated (source has no per-rule enforcement field)', 'not tabulated'],
  ['airtight (V1 R-BA, V2 R-BF, V3 R-BZ/R-CA/R-DT/R-EY, 122 5.5, 122a A26/A27)', 'docs/specs/01-pipeline/124a_step_standard_policy_appendix.md:240,245,254,280-281,511,943; 122:800-850, :1040-1053; 122a:753-818', pl('airtight-p1') + ' register rows by pattern', pl('airtight-p1'), 'the pack IS the gate specification: gates named in its text (compute-shape.yml, check-step-shape.mjs, step-validate.mjs, gates/compute-*.mjs)', 'not tabulated'],
  ['mobile-core (Spec 90 all, Spec 98 all, .claude/domain-admin.md)', 'docs/specs/03-mobile/90_*.md, 98_*.md; .claude/domain-admin.md', pl('mobile-core') + ' headings', pl('mobile-core'), 'not tabulated (no per-rule enforcement field)', 'not tabulated'],
  ['mobile-99 (Spec 99 whole)', 'docs/specs/03-mobile/99_mobile_state_architecture.md', pl('mobile-99-p1') + ' sections', pl('mobile-99-p1'), 'not tabulated', 'not tabulated'],
  ['mobile-100 (Spec 100 whole)', 'docs/specs/03-mobile/100_mobile_parcel_cost_tool.md', pl('mobile-100-p1') + ' sections', pl('mobile-100-p1'), 'not tabulated', 'not tabulated'],
  ['mobile-96 (Spec 96 whole)', 'docs/specs/03-mobile/96_mobile_subscription.md', pl('mobile-96-p1') + ' sections', pl('mobile-96-p1'), 'not tabulated', 'not tabulated'],
  ['eng (docs/specs/00_engineering_standards.md whole)', 'docs/specs/00_engineering_standards.md', pl('eng-p1') + ' sections', pl('eng-p1'), 'not tabulated', 'not tabulated'],
];
for (const c of COV) P(`| ${c.join(' | ')} |`);
P();
P('Not in a pack, named so the gap is visible: the Spec 135 register rows in full (the Spec 136 line is the one-line form of each row; the row text is the authority), McProof rows M-436..M-447 in Spec 69a, Spec 132 sections 1, 5, 7 and the glossary, Spec 133 sections 3 and 4, Spec 126 and Spec 128 text.');
P();
P('## Runs');
P();
P('| Pack part | Diff part | Prompt chars (pack + 2 x diff + template estimate) | BUG | DEFER | MET | REJECT | Verdict line | Clauses checked line |');
P('|---|---|---|---|---|---|---|---|---|');
const sz = Object.fromEntries(jobs.map((j) => [`${j[0]}|${j[1]}`, j[4]]));
for (const r of R.runInfo) P(`| ${r.pack} | ${r.part} | ${sz[`${r.pack}|${r.part}`] || ''} | ${r.bug} | ${r.defer} | ${r.met} | ${r.rej} | ${r.ok ? r.verdict.replace(/\|/g, '/') : 'NO VERDICT'} | ${r.checked} |`);
P();
P('## Findings count per handbook');
P();
P('| Handbook | Runs | BUG | DEFER | Findings (BUG + DEFER) | MET | REJECT |');
P('|---|---|---|---|---|---|---|');
for (const [h, t] of Object.entries(R.tally)) P(`| ${h} | ${t.runs} | ${t.bug} | ${t.defer} | ${t.bug + t.defer} | ${t.met} | ${t.rej} |`);
P();
P('## Findings (as returned)');
P();
const order = (k) => (k === 'BUG' ? 0 : 1);
for (const f of [...R.rows].sort((a, b) => order(a.kind) - order(b.kind) || a.id.localeCompare(b.id))) {
  P(`### ${f.id} · ${f.hb} (${f.pack}) · diff part ${f.part} · ${f.head}`);
  P(`- Clause: ${f.clause}`);
  P(`- Diff: ${f.code}`);
  P(`- Lens claim: ${f.claim}`);
  if (f.fix) P(`- Lens fix or rationale: ${f.fix}`);
  P(`- Opened: ${f.chk}`);
  P();
}
fs.writeFileSync(`${C}/FINDINGS.md`, out.join('\n') + '\n');
console.log('FINDINGS.md', out.length, 'lines');
