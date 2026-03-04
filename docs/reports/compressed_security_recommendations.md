# Compressed Security Additions for Workflows

To rapidly secure your existing `engineering_workflows.md` against AI hallucinations and human error, copy and paste these 3 concise additions into their respective workflow sections:

### 1. Add to WF1 (Genesis) & WF2 (Enhance) Execution Plans
```markdown
- [ ] **Auth Boundary & Secrets:** If creating/modifying an API route, explicitly verify it is protected by `src/middleware.ts`. Ensure NO `.env` secrets are exposed to client components.
```

### 2. Add to WF7 (Quality Rubric)
```markdown
- [ ] **Supply Chain Security:** Run `npm audit`. Zero "High" or "Critical" vulnerabilities allowed before merge.
```

### 3. Add to "Testing Standards" (The Triad)
```markdown
| `*.security.test.ts` | Negative/Abuse | Does it block malicious payloads and unauthorized users? |
```
