# Workflow Security Audit: Threat Modeling the Protocol

## 1. Executive Summary
This report evaluates `engineering_workflows.md` from a **Cybersecurity and Threat Modeling** perspective. While the current protocol excels at functional correctness and preventing UI regressions, it currently has **Dangerous Gaps** regarding secure coding practices. 

If an AI or Junior Developer follows these workflows perfectly, they could still accidentally introduce critical security vulnerabilities (e.g., exposing an unauthenticated API route, leaking secrets, or utilizing a compromised NPM package).

**Overall Security Grade:** C- (Requires Hardening)

---

## 2. The 5-Point Security Rubric Evaluation

### **1. Authentication & Authorization Enforcement [Score: 1/5 - Critical Risk]**
*Does the workflow force the developer to verify who can access the new feature?*
* **Strengths:** None currently implemented in the workflow templates.
* **Gaps:** WF1 (Genesis) and WF2 (Enhance) mandate checking the "API Contract" (request/response shape), but they **do not mandate checking the Auth Middleware**. An AI could easily build `POST /api/permits/delete` and completely forget to check if the route is protected by `src/middleware.ts` or `src/lib/auth/route-guard.ts`.
* **The Fix:** Add a mandatory "Authorization" execution step to WF1 and WF2.

### **2. Input Validation & Injection Prevention [Score: 3/5 - Moderate]**
*Does the workflow prevent malicious data (XSS, SQLi) from entering the database?*
* **Strengths:** The newly added `API Contract` (Zod Schema) requirement in WF1/WF2 acts as a powerful first line of defense, automatically rejecting malformed JSON payloads before they reach the database handlers, mitigating NoSQL/SQL mass-assignment injections.
* **Gaps:** The workflow does not explicitly remind developers to sanitize inputs that bypass the API (e.g., CSV uploads in the Admin panel, or raw SQL queries in migrations).

### **3. Dependency & Supply Chain Security [Score: 0/5 - Critical Risk]**
*Does the workflow prevent the introduction of compromised third-party packages?*
* **Strengths:** None.
* **Gaps:** WF7 (Quality Rubric) and WF12 (Build Audit) evaluate memory, bundle size, and circular dependencies, but they **completely ignore `npm audit`**. An entire feature could be built and merged using a library with a known Remote Code Execution (RCE) vulnerability. 
* **The Fix:** `npm audit` must become a hard, unskippable gate in the WF7 Quality Rubric.

### **4. Secrets & Configuration Management [Score: 2/5 - Poor]**
*Does the workflow prevent hardcoding API keys or exposing `.env` variables to the client?*
* **Strengths:** The Next.js framework inherently protects server-side variables unless prefixed with `NEXT_PUBLIC_`.
* **Gaps:** When building Integration Wiring (WF9), there is no workflow checklist reminding the AI/Developer to ensure sensitive keys (like Stripe Secret Keys or Firebase Admin SDK keys) are explicitly kept out of the React `src/components/` directory.

### **5. Security Abuse Testing (Negative Testing) [Score: 1/5 - Critical Risk]**
*Does the workflow mandate testing what happens when a malicious user attacks the feature?*
* **Strengths:** The `Triad Test Criteria` is great for "happy paths" and algorithmic boundary conditions.
* **Gaps:** The current workflows only instruct the developer to write tests for *intended* behavior. There is no mandate to write **Negative Tests** (e.g., "What happens if a user with a `contractor` role tries to hit the `admin` deletion endpoint?").

---

## 3. Strategic Recommendations for Final Hardening

To elevate the engineering workflows to a **Secure-By-Design** standard, inject these specific checkpoints into `engineering_workflows.md`:

### **A. Update WF1 (Genesis) & WF2 (Enhance)**
Add this precise line right under the API Contract definition:
```markdown
- [ ] **Auth Boundary & Secrets:** If creating/modifying an API route or Server Action, explicitly define the required Role (Public, User, Admin) and verify it is protected by `src/middleware.ts`. Ensure NO secret keys are exposed to client components.
```

### **B. Upgrade WF7 (Quality Rubric)**
Add a Supply Chain security gate to the Pre-Merge Checklist:
```markdown
- [ ] **Security Audit:** Run `npm audit`. There must be ZERO "High" or "Critical" vulnerabilities introduced by new dependencies.
```

### **C. Expand the Testing Triad**
Update the Testing Standards section to mandate **Negative Tests**:
```markdown
### Test File Pattern (Triad + 1)
| Pattern | Focus | Goal |
|---------|-------|------|
| `*.logic.test.ts` | Pure algorithms | Is the math right? |
| `*.ui.test.tsx` | React rendering | Does it look right? |
| `*.infra.test.ts` | API/DB routes | Does it wire up correctly? |
| `*.security.test.ts` | **Negative/Abuse Testing** | **Does it reject unauthorized users and invalid payloads?** |
```

### **Conclusion**
Implementing these 3 specific additions transforms the Master Protocol from a tool that just builds software *fast*, into a tool that builds software *safely*, preventing junior engineers and autonomous AI from inadvertently opening catastrophic attack vectors.
