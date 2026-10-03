---
write_scope:
- scripts/analysis/generate-chain-args.mjs
---
# WF3 ca-3b — five anchored fixes to `scripts/analysis/generate-chain-args.mjs` — LEAVE UNCOMMITTED

**Provider:** deepseek. Tools: `read_file`, `edit_file` only. Do NOT investigate anything else: read this one file, make the five edits below with `edit_file` (text anchors are authoritative), run the Verify commands, stop. Never `git add`/`commit`; never edit the manifest or tests. LF endings.

## Fix 1 — `findings`: the expected value is the derivation, unfiltered
Delete the whole comment block that starts `// \`chain_args\` is keyed by slug, but a chain run reads NAME-keyed lists` together with the `let expected = null;` + `if (expectedRaw) { … }` block that follows it (ends just before `// argv drift: union of both key sets`). Replace with exactly:
```
      const expected = expectedRaw;
```

## Fix 2 — `findings`: an invocation chain that is not a member chain is ALWAYS a violation
Replace the block starting `// The other direction: the invocation names a chain whose member list omits the slug, while a` through the closing `}` of that `for (const chain of invChains) { … }` loop with:
```
      // The other direction: the invocation names a chain that does not contain the slug.
      for (const chain of invChains) {
        if (!memberChains.includes(chain)) {
          violations.push(
            `${slug}: execution.invocation names chain "${chain}", which is not a manifest chain containing ${slug}`,
          );
        }
      }
```
And in the NEXT loop (the invocation `PIPELINE_CHAIN` one) delete the line `        if (!memberChains.includes(chain)) continue;` — every declared invocation env is checked.

## Fix 3 — `run`: write mode REWRITES drift (it currently returns early and never writes)
Replace everything from the comment `// A checked run must never be a WRITE:` down to and including the line `    newText = rewriteEntry(newText, slug, derived);` and its closing `  }` of the for-loop with:
```
  // Membership / PIPELINE_CHAIN / orphan violations are not derivable: write NOTHING.
  if (found.violations.length) {
    return { changed: [], drift: found.drift.map(formatDrift), violations: found.violations };
  }

  /** @type {Map<string, Record<string, string[]>|null>} */
  const derivedBySlug = new Map();
  for (const file of converted) {
    for (const slug of slugsForFile(manifest, file)) derivedBySlug.set(slug, deriveChainArgs(descriptors[file]));
  }

  let newText = oldText;
  const rewritten = new Set();
  for (const { slug } of found.drift) {
    if (rewritten.has(slug)) continue;
    rewritten.add(slug);
    newText = rewriteEntry(newText, slug, derivedBySlug.get(slug) ?? null);
  }
```
(This deletes the unused `Proxy` block entirely.)

## Fix 4 — `run`: verify the rewrite is EXACTLY the intended edit
Replace the block from `  // VERIFY before writing: re-run the VERY SAME check` through the line `    throw new Error('generate-chain-args: surgical rewrite verification failed');` + its `  }` with:
```
  // VERIFY before writing: (1) the parsed result equals the old parse with ONLY the rewritten slugs'
  // chain_args replaced (key order ignored), and (2) the same check now finds zero drift.
  const newParsed = JSON.parse(newText);
  const intended = JSON.parse(oldText);
  for (const slug of rewritten) {
    const derived = derivedBySlug.get(slug) ?? null;
    if (derived === null) delete intended.scripts[slug].chain_args;
    else intended.scripts[slug].chain_args = derived;
  }
  const after = findings({ manifest: newParsed, converted, descriptors });
  if (canonical(newParsed) !== canonical(intended) || after.drift.length > 0 || after.violations.length > 0) {
    throw new Error('generate-chain-args: surgical rewrite verification failed — nothing written');
  }
```
and add this helper directly ABOVE the `/** @param {unknown} err @returns {string} */` line of `messageOf`:
```
/**
 * Key-order-insensitive JSON rendering, so a rewrite that inserts `chain_args` mid-entry compares
 * equal to the intended object. @param {unknown} value @returns {string}
 */
function canonical(value) {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
      : v,
  );
}

```

## Fix 5 — `main`: no count line
Delete the line `    stdout.write(\`changed ${changed.length}\n\`);`.

## Verify (run, report output)
- `npx vitest run src/tests/chain-args-generated.infra.test.ts` — EXPECTED: exactly 2 failures, tests "fleet parity…" and "the live CLI is CLEAN…", both naming `link_parcels/sources` (correct until the orchestrator's real `--write`). All 9 others pass.
- `npx eslint scripts/analysis/generate-chain-args.mjs` — clean.
