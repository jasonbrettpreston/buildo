---
write_scope:
- src/tests/fleet2-soft-retire-schema.logic.test.ts
- scripts/analysis/gates/witness-runner-set.mjs
- src/tests/step-library.logic.test.ts
- src/tests/run-chain-defer.logic.test.ts
allow_commit: false
---
## Goal
Four mechanical re-pins after a runner change (RE-FREEZE #37). Edit ONLY the lines described. Change nothing else in any file. Do not run git, generators, migrations or any test suite.

## Edits

1. `src/tests/fleet2-soft-retire-schema.logic.test.ts`, test `SC8` (near lines 223-242).
   - The expected retract enum array (near lines 231-236) currently lists `'none', 'departed', 'all', 'departed_mark'`. Add one more element after `'departed_mark',`: the line `      'replace_keys',`. Keep the same indentation as the other elements.
   - Change the assertion message string `'the retract enum must name the fourth member'` to `'the retract enum names the fourth member (fold 10) and the fifth, replace_keys (RE-FREEZE #37, Spec 124 R-EH)'`.

2. `scripts/analysis/gates/witness-runner-set.mjs`, lines 27 and 28. Each line contains `cite: 'scripts/lib/step/index.js:6334'`. Change `6334` to `6600` on BOTH lines. Nothing else on those lines changes.

3. `src/tests/step-library.logic.test.ts`, near lines 438-443.
   - The comment line `      // 9 runners produce \`failedPreWrite\` on their abort path (was 8 — \`runLinkColumnPhase\`` becomes `      // 10 abort sites produce \`failedPreWrite\` (was 9; 8 before \`runLinkColumnPhase\``.
   - Directly AFTER the comment line that ends with `consumer list too, which is exactly the silent-gap this assertion exists to prevent.`, insert this new comment line, same indentation:
     `      // RE-FREEZE #37 (Spec 124 R-EH): the MATERIALIZER ROWS arm is the 10th site; it returns through runMaterializePhase, so its consumer is the existing \`materialize\` entry below.`
   - In the line `      expect((src.match(/failedPreWrite: decision\.failed|failedPreWrite: gateDecision\.failed/g) || []).length).toBe(9);` change `toBe(9)` to `toBe(10)`.

4. `src/tests/run-chain-defer.logic.test.ts`, the test titled `'(a) the --full argv check itself is untouched (the OR is additive, not a replacement) — now in the runner, not the legacy script'` (near lines 271-277). Replace the WHOLE test (from `  it('(a) the --full argv check` through its closing `  });`) with exactly:

```ts
  it('(a) the --full argv check itself is untouched (the OR is additive, not a replacement) — now in the ONE run-mode helper the runner shares (RE-FREEZE #37, Spec 124 R-DX (iv))', () => {
    const src = readFileSync(STEP_INDEX_PATH, 'utf8');
    const helper = src.match(/function resolveRunMode\([\s\S]*?\n\}/);
    expect(helper, 'resolveRunMode helper body not found').not.toBeNull();
    expect(helper![0]).toMatch(/\.includes\(['"]--full['"]\)/);
    expect(helper![0]).toMatch(/overrides\.force_full === true/);
    const fnMatch = src.match(/async function runEnrichPhase\([\s\S]*?\n\}/);
    expect(fnMatch, 'runEnrichPhase function body not found').not.toBeNull();
    expect(fnMatch![0]).toMatch(/resolveRunMode\(\{ overrides, [^}]*argv: process\.argv \}\)/);
  });
```

## Verify
- `grep -n "index.js:6334" scripts/analysis/gates/witness-runner-set.mjs` prints nothing.
- `grep -n "toBe(10)" src/tests/step-library.logic.test.ts` prints the edited line.
- `grep -n "'replace_keys'," src/tests/fleet2-soft-retire-schema.logic.test.ts` prints one line.
