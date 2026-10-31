---
write_scope:
- scripts/analysis/mcbylaws-loop/loop-oracle.mjs
- src/tests/mcbylaws-loop-oracle.logic.test.ts
---
# MB-68 B6 - loop-oracle.mjs (oracle-first, classes, record_missing) - DeepSeek, red first, LEAVE UNCOMMITTED
Tools: `read_file`, `write_file`/`edit_file`, `run_command` (only `npx vitest run <path>`). Never git add/commit. ESM `.mjs`, 2-space indent, no `process.env`, no `process.exit`, no network. Pure functions return `string[]` of violation codes (empty = green); a code with a detail is `code:detail`. The test is a vitest file in TypeScript, plainly typed (no `any`), header with two `// SPEC LINK:` lines, `const ROOT = path.resolve(__dirname, "../..")` and `await import(path.join(ROOT, "scripts/analysis/mcbylaws-loop/<module>.mjs"))`. Every red case has a green twin. Order: (1) write the test, run `npx vitest run <test>`, it must FAIL (module missing); (2) write the module, run again, it must PASS; report both outputs. A `rulings` argument is a `Map(id -> status)` as `parseRulings` returns; authority = status `RATIFIED` or `RULED`.
Rules: plan section 6 "Classes" (PROPOSED PR-68-3, V68-1). Port the prototype printed verbatim at the END of this brief (its glob, class lists, `oracleFirstRange`, `commitStageFires`, `recordMissing`, `genMatches`, `isGen`/`isOracle`/`isCode` are the reference) into a module.

## Contract
- `globToRegExp(glob)` exactly as the prototype's `glob`.
- `DEFAULT_LAYER23` = `['scripts/analysis/bylaw/**','scripts/analysis/bylaw-validation/**','scripts/seeds/bylaw/**','src/tests/**/bylaw*']`; `ORACLE_GLOBS` (hand-authored) = `['src/tests/fixtures/bylaw-golden-lots/**','src/tests/fixtures/bylaw/**','mcbylaws/oracle/**','src/tests/mcbylaws/loop/**']` plus the regexes: `^src/tests/(?:.*/)?bylaw[^/]*\.test\.ts$`, `^src/tests/coa-[^/]*\.test\.ts$` and the prereg files `scripts/analysis/bylaw-validation/coa-expected/prereg-*.json`; `GEN_GLOBS` (generated) = the prototype's `GEN` list.
- `loadLayer23(root)`: if `<root>/mcbylaws/protected-paths.json` exists and has a `layer23` array of strings, return it; otherwise `DEFAULT_LAYER23`.
- `makeClassifier(layer23 = DEFAULT_LAYER23)` -> `classify(path)` returning `'generated'`, `'oracle'`, `'code'` or `null` (generated checked first, then oracle, then layer23 minus the other two). MB-68's own tests (`src/tests/mcbylaws-loop-*`) and files under `scripts/analysis/mcbylaws-loop/**` are `null` here unless a layer23 glob matches (the prototype's rules).
- `checkOracleFirst(commitsNameStatus, classify)` (`commitsNameStatus` = array of arrays of `{s, p}`; flatten = the range union): any CODE file plus any hand-authored ORACLE file with `s !== 'A'` (modify, delete, rename) -> `['oracle_moved_with_code:<n> oracle beside <m> code in range']`; adding a new oracle file is allowed.
- `commitStageFires(staged, classify)` -> true when any staged path classifies as code, oracle or generated.
- `recordMissing(nameStatus, classify)` -> `['record_missing']` when any path classifies (code/oracle/generated) and no `{s:'A'}` path matches `^docs/reports/loop-records/.+/round-\d+\.json$`.
- `boundPaths(paths, classify)` -> the paths that classify (these must appear in a record's `inputs`).
- `genMatches(actual, regenerated)` -> `[]` when `JSON.stringify` equal else `['generated_not_regenerable']`.
- `nameStatusOf(text)`: parse `git show --name-status --format=` output (tab separated; rename `R100\told\tnew` gives BOTH paths, status `R`) into `[{s, p}]`.

## Fixture and tests
The file `mcbylaws/loop/fixtures/d01e1458-files.json`: the REAL file list of commit d01e1458, an array of `{s, p}` with 31 entries, produced from `git show --name-status --format= d01e1458` (already supplied by the orchestrator: READ it, do not create it; if absent, STOP and report). Tests (all red and green): the 14 fold fixtures of the prototype ported as individual tests where they concern this module (forged-ruling and finding fixtures belong to other modules, skip them): split oracle-only then code-only commits caught by the range; REAL d01e1458 replay red, same list minus oracle green; the pair `coa-round.mjs` + `coa-round.logic.test.ts` fires `commitStageFires`; A0388 flip (constructed) red; the HONEST round (catalogue + expected-172.json + floors-172.json + ids + regression set + a new record) is green, `recordMissing` empty, `commitStageFires` true; with an added hand-authored `src/tests/mcbylaws/loop/increment-1/expected-25.json` modify it is red; `record_missing` red/green; `genMatches`; `loadLayer23` with and without a temp `mcbylaws/protected-paths.json`; `nameStatusOf` incl. rename.

## Reference: the prototype source, verbatim (the engine cannot read files outside the repo; port from this)
```js
const RULINGS = U.parseRulings(U.readSpec69Rulings(WT)); // Map(id -> status), the same lookup acceptFloors uses
const AUTH = new Set(['RATIFIED', 'RULED']);
const glob = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '\u0001').replace(/\*\*/g, '\u0002').replace(/\*/g, '[^/]*').replace(/\u0001/g, '(?:.*/)?').replace(/\u0002/g, '.*') + '$');
const LAYER23 = ['scripts/analysis/bylaw/**', 'scripts/analysis/bylaw-validation/**', 'scripts/seeds/bylaw/**', 'src/tests/**/bylaw*'].map(glob);
// V68-1: HAND-authored oracle (worked examples, expected answers, accepted findings, existing tests) vs GENERATED outputs (pins, floors, id lists, regression set, records)
const ORACLE = ['src/tests/fixtures/bylaw-golden-lots/**', 'src/tests/fixtures/bylaw/**', 'mcbylaws/oracle/**', 'src/tests/mcbylaws/loop/**'].map(glob);
const GEN = ['scripts/analysis/bylaw-validation/coa-expected/expected-*.json', 'scripts/analysis/bylaw-validation/coa-expected/floors-*.json', 'mcbylaws/loop/floors-*.json', 'mcbylaws/loop/regression-set.json', 'mcbylaws/loop/data/ids-*.json', 'docs/reports/loop-records/**'].map(glob);
const isGen = (p) => GEN.some((r) => r.test(p));
const isOracle = (p) => !isGen(p) && ORACLE.some((r) => r.test(p)) || /^src\/tests\/(?:.*\/)?bylaw[^/]*\.test\.ts$/.test(p) || /^src\/tests\/coa-[^/]*\.test\.ts$/.test(p);
const isCode = (p) => LAYER23.some((r) => r.test(p)) && !isOracle(p) && !isGen(p);
// G68-02: a new rulings[] id must resolve to RATIFIED or RULED in the register
const flat = (f) => { const o = {}; for (const m of ['accuracy', 'answered']) { if (f.overall) o[`overall ${m}`] = f.overall[m]; for (const [a, x] of Object.entries(f.articles || {})) o[`article ${a} ${m}`] = x[m]; } return o; };
const floorEdit = (base, cur) => {
  const v = []; const added = (cur.rulings || []).slice((base.rulings || []).length);
  const named = new Set(added.filter((r) => AUTH.has(RULINGS.get(r.ruling))).flatMap((r) => r.lines.map((l) => l.line)));
  for (const r of added) if (!AUTH.has(RULINGS.get(r.ruling))) v.push(`ruling_not_authority:${r.ruling}`);
  const b = flat(base); const c = flat(cur);
  for (const [k, bv] of Object.entries(b)) if ((c[k] === undefined || c[k] < bv) && ![...named].some((l) => k === l || k.startsWith(l + ' '))) v.push(`floor_lowered_without_ruling:${k}`);
  return v;
};
// G68-03: finding id is a register row id that exists, reason 20+ characters
const finding = (f) => { const v = []; if (!(/^M-\d+$/.test(f.finding_id || '') && RULINGS.has(f.finding_id))) v.push('finding_id_not_in_register'); if ((f.reason || '').trim().length < 20) v.push('finding_reason_short'); if (!f.case) v.push('finding_case_missing'); return v; };
// G68-04: oracle-first over a whole range (union of name-status), and the commit stage fires on CODE or ORACLE
const oracleFirstRange = (commits) => { const all = commits.flat(); const code = all.filter((x) => isCode(x.p)); const orc = all.filter((x) => x.s !== 'A' && isOracle(x.p)); return code.length && orc.length ? [`oracle_moved_with_code:${orc.length} oracle beside ${code.length} code in range`] : []; };
const commitStageFires = (staged) => staged.some((x) => isCode(x.p) || isOracle(x.p) || isGen(x.p));
// generated outputs must equal a regeneration from the inputs (the tool recomputes; a hand edit differs)
const genMatches = (actual, regenerated) => (JSON.stringify(actual) === JSON.stringify(regenerated) ? [] : ['generated_not_regenerable']);
// G68-01: the gate derives the bound set from the tree; a changed bound file absent from the record is a failure
const bound = (rec, treeBlobs, changed) => { const v = []; for (const p of changed) if (isCode(p) || isOracle(p) || isGen(p)) { if (!(p in rec.inputs)) v.push(`input_not_bound:${p}`); else if (rec.inputs[p] !== treeBlobs[p]) v.push(`stale_green:${p}`); } return v; };
const caseMissing = (regIds, recIds) => { const s = new Set(recIds); return regIds.filter((i) => !s.has(i)).map((i) => `case_missing:${i}`); };
// G68-05: skip-ahead asks history, not binding of an old record
const skipAhead = (n, greenHistory) => (n === '1' || greenHistory.includes(String(Number(n) - 1)) ? [] : ['increment_skips_ahead_previous_not_green']);
// G68-06: records are add-only
const recordsAddOnly = (ns) => ns.filter((x) => /^docs\/reports\/loop-records\//.test(x.p) && x.s !== 'A').map((x) => `record_modified_or_deleted:${x.p}`);
const recordMissing = (ns) => ((ns.some((x) => isCode(x.p) || isOracle(x.p))) && !ns.some((x) => /^docs\/reports\/loop-records\/.+\/round-\d+\.json$/.test(x.p) && x.s === 'A') ? ['record_missing'] : []);
const d01 = ns('d01e1458'); T('REAL d01e1458 replay with layer23 classes', oracleFirstRange([d01]), oracleFirstRange([d01.filter((x) => !isOracle(x.p))]), 'oracle_moved_with_code');
T('A0388 flip (constructed)', oracleFirstRange([[{ s: 'M', p: 'src/tests/mcbylaws/loop/increment-1/expected-25.json' }, { s: 'M', p: 'scripts/seeds/bylaw/layer3-catalogue.json' }]]), oracleFirstRange([codeOnly]), 'oracle_moved_with_code');
T('changed file absent from record', bound({ inputs: { 'scripts/seeds/bylaw/layer3-catalogue.json': 'a' } }, { 'scripts/seeds/bylaw/layer3-catalogue.json': 'a', 'scripts/seeds/bylaw/switchboard.json': 'b' }, ['scripts/seeds/bylaw/switchboard.json']), bound({ inputs: { 'scripts/seeds/bylaw/switchboard.json': 'b' } }, { 'scripts/seeds/bylaw/switchboard.json': 'b' }, ['scripts/seeds/bylaw/switchboard.json']), 'input_not_bound');
T('case omitted from record', caseMissing(['a|1', 'b|1'], ['a|1']), caseMissing(['a|1'], ['a|1']), 'case_missing');
T('skip-ahead by history', skipAhead('3', ['1']), skipAhead('2', ['1']), 'increment_skips_ahead');
T('record modified after add', recordsAddOnly([{ s: 'M', p: 'docs/reports/loop-records/inc1/round-01.json' }]), recordsAddOnly([{ s: 'A', p: 'docs/reports/loop-records/inc1/round-02.json' }]), 'record_modified_or_deleted');
T('record_missing', recordMissing(codeOnly), recordMissing([...codeOnly, { s: 'A', p: 'docs/reports/loop-records/inc1/round-03.json' }]), 'record_missing');
// V68-1 fixtures: an honest round (catalogue + tool-moved pin + floor raise + ids + regression set + new record) is GREEN; a hand-edited pin is red
const honest = [{ s: 'M', p: 'scripts/seeds/bylaw/layer3-catalogue.json' }, { s: 'M', p: 'scripts/analysis/bylaw-validation/coa-expected/expected-172.json' }, { s: 'M', p: 'scripts/analysis/bylaw-validation/coa-expected/floors-172.json' }, { s: 'M', p: 'mcbylaws/loop/data/ids-coa172.json' }, { s: 'M', p: 'mcbylaws/loop/regression-set.json' }, { s: 'A', p: 'docs/reports/loop-records/inc1/round-04.json' }];
out.push({ name: 'HONEST round is green (catalogue + pin + floor raise + ids + regression set + record)', ok: oracleFirstRange([honest]).length === 0 && recordMissing(honest).length === 0 && commitStageFires(honest), red: 'green, gate runs', green: '' });
T('hand-edited pin differs from regeneration', genMatches({ MATCH: 401 }, { MATCH: 400 }), genMatches({ MATCH: 400 }, { MATCH: 400 }), 'generated_not_regenerable');
out.push({ name: 'a hand-authored expected answer beside the honest round is still red', ok: oracleFirstRange([[...honest, { s: 'M', p: 'src/tests/mcbylaws/loop/increment-1/expected-25.json' }]]).length > 0, red: 'fires', green: '' });
console.log(`register rulings parsed ${RULINGS.size}; authority id used for the green twins: ${realRuled}; d01e1458 files ${d01.length}`);
for (const o of out) console.log(`${o.ok ? 'OK ' : 'BAD'} ${o.name}  -> ${o.red}${o.green ? '  GREEN-DIRTY: ' + o.green : ''}`);
```
