---
write_scope:
- scripts/analysis/generate-chain-args.mjs
allow_commit: false
---
# WF3 ca-7 — one-line TODO above `rewriteEntry` pointing at the P2-C2 generalisation — STOP BEFORE COMMIT
**Provider:** deepseek. `edit_file` only, anchored text edit verified once, preserve the file's line endings (LF). NEVER run git add / commit / stash / reset. Touch ONLY `scripts/analysis/generate-chain-args.mjs`. Comment only — NO code change.
**Facts (verified by the orchestrator):** the JSDoc block of `export function rewriteEntry(text, slug, chainArgs)` ends with the lines:
```
 * @returns {string}
 */
export function rewriteEntry(text, slug, chainArgs) {
```
(the first `export function rewriteEntry` occurrence; it hard-codes the `"chain_args"` property name in its regexes and insertion anchor).
1. **Change:** insert exactly this single line immediately BEFORE `export function rewriteEntry(text, slug, chainArgs) {` (i.e. between ` */` and that line):
```
// TODO(P2-C2): generalise beyond the hard-coded "chain_args" property to also write step_timeout_minutes — .cursor/wf2_registry_truth_active_task.md fold 8b, item 16.
```
Nothing else.
**Verify:** `node scripts/analysis/generate-chain-args.mjs --check` — still prints `drift link_parcels/sources: expected ["--full"] actual null` and exits 1. `npx eslint scripts/analysis/generate-chain-args.mjs` — clean. Report each result.
