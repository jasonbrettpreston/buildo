---
description: WF6 — Harden and commit all files modified in the current session. The mandatory exit gate after WF1/WF2/WF3 Green Light.
---

You are running WF6: Review & Commit.

**Step 1 — Scope:** Run `git status` and `git diff` to identify all files modified in this session.

**Step 2 — 5-Point Hardening Sweep** (for each modified file):
1. **Error paths** — Every function has try-catch or throws. No `.catch(() => {})` silencing without logging.
2. **Edge cases** — Null, empty array, 0, undefined handled.
3. **Type safety** — `npm run typecheck` passes. No `any` without `// SAFETY:` comment.
4. **Consistency** — Patterns match adjacent files (naming, error shape, SDK usage).
5. **Drift** — If shared logic was touched, all consumers are updated.

**Step 3 — Collateral Check:** Run `npx vitest related [changed files] --run`.

**Step 4 — Founder's Audit:** No laziness placeholders (`// ... existing code`), all exports resolve, schema matches spec.

**Step 5 — Auto-Fix:** Apply any fixes found. Run `npm run test && npm run lint -- --fix`.

**Step 6 — Verdict (MUST appear in your response):**
For each of the 5 sweep points, state what you found — not a bare checkbox.
- Name the specific functions examined for error paths.
- Paste the `npm run typecheck` output line for type safety.
- Paste the final `npm run test` summary line.
- Final line must be: **"CLEAN"** or **"N gaps remain: [list]"**

**Step 7 — Atomic Commit:**
```
git commit -m "[type](NN_spec): [description]"
```
Conventional prefixes: feat / fix / refactor / test / docs / chore.
Commit each logical unit individually — do not batch unrelated changes.
