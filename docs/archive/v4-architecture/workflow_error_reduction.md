# Engineering Workflows: Error Reduction & Optimization

To further harden `engineering_workflows.md` and make development less prone to errors, hallucinations, and UI regressions, you should implement the following four specific workflow additions. These additions force developers (and AI agents) to verify context constraints *before* and *after* writing code.

---

## 1. The "State & Context" Pre-Flight Check (For WF2 & WF3)
Often, errors occur because a new component is designed with an incorrect assumption about the state (e.g., assuming a "Permit" object is fully hydrated when it is actually a shallow list view object).

**The Addition:** 
Before Step 1 in WF2 (Enhance) or WF3 (Fix), force a mandated contextual data check.

```markdown
- [ ] **State Verification:** 
      1. Examine the parent component calling this feature.
      2. Document exactly what Props/State are currently passed down.
      3. Verify if the required data is actually available at this level of the component tree or if it requires a new data fetching hook.
```
**Impact:** Eliminates "undefined reading property 'X'" crashes that occur when building UI components in isolation without checking the real-world parent data pipeline.

---

## 2. The "CSS / UI Regression" Guardrail (WF2)
When modifying a massive UI application utilizing Tailwind CSS, changing a flexbox layout deep in the tree can unintentionally destroy the layout of sibling components.

**The Addition:**
In the Execution Plan of Workflow 2 (Enhance), mandate UI testing boundary isolation.

```markdown
- [ ] **UI Boundary Isolation:**
      1. Ensure the new visual component is strictly bounded (`max-w`, `overflow-hidden`).
      2. If modifying a shared global component (e.g. `PermitCard.tsx`), you MUST run `npx vitest run src/tests/components/` to ensure you did not break the snapshot tests of other dashboards before proceeding.
```
**Impact:** Prevents CSS/Tailwind regressions from bleeding out into unaffected areas of the application.

---

## 3. The "Rollback Protocol" (WF3)
When fixing bugs (WF3), there is a high risk of the "whack-a-mole" effect, where fixing Bug A introduces Bug B. 

**The Addition:**
Before execution, define the exact git commit hash representing the "last known good" state for the affected module.

```markdown
- [ ] **Rollback Anchor:** Save the current Git commit hash in `.cursor/active_task.md`.
- [ ] ... (Fix execution steps)
- [ ] **Collateral Check:** After the fix, run the full test suite (`npm run verify`). If the test suite fails on a completely unrelated file, you MUST `git stash` the fix, analyze the root cause of the coupling, and rewrite the fix. Do not start fixing the new broken file.
```
**Impact:** Prevents the codebase from spiraling into spaghetti code where developers continuously twist logic to patch side-effects instead of correcting the root architectural flaw.

---

## 4. The "Data Migration" Warning (WF1 & WF2)
When developing new features, AI agents and developers frequently forget that changing a database schema requires migrating the *existing* 240,000+ permit rows.

**The Addition:**
In the "Technical Implementation" section of WF1 and WF2, add a mandatory Database section.

```markdown
## 💻 Technical Implementation
* **Database Impact:** [Are we altering a schema? YES/NO]
* **Migration Strategy:** [If YES, you must write `migrations/026_[feature].sql`. You must also draft the `UPDATE` query strategy for gracefully handling the 240,000 existing historical rows that have NULL for this new column.]
```
**Impact:** Prevents catastrophic production crashes where a new UI feature assumes a column exists and has data, but the historical database rows were never backfilled during deployment.

---

## 5. Formal API Contract Integration (WF1 & WF2)
To enforce the "Contract-First" methodology detailed in the impact analysis, the API Contract constraint must be injected directly into the **Execution Plan** of Workflow 1 (Genesis) and Workflow 2 (Enhance).

**Where to Add It:**
Inside `engineering_workflows.md`, append the following as the absolute **first step** under `## 🛠️ Execution Plan` for WF1 and WF2:

```markdown
- [ ] **Contract Definition:** If creating or altering an API route, you MUST define the precise Request/Response JSON interface (e.g., `docs/api/[feature]_contract.ts` or Zod schema) BEFORE scaffolding the UI or Backend implementation. Check that it aligns with `00_api_gateway.md`.
- [ ] **Contract Compilation:** If modifying an existing contract (WF2), run the frontend TypeScript compiler (`npx tsc --noEmit`) to explicitly identify which UI components will break due to this change before proceeding.
```
**Impact:** Eradicates frontend/backend integration bugs by forcing the developer (or AI) to mathematically prove the frontend is ready before writing the Node.js API logic.

---

## 6. Streamlining `engineering_workflows.md` (Redundancy Reduction)
Currently, `engineering_workflows.md` is **635 lines long** and incredibly bloated. 

**The Problem:** The exact same 15-line `# ├️ Active Task: [Feature]` markdown template (Status, Context, Technical Implementation, Execution Plan headings) is copy-pasted verbatim **11 times** across WF1 through WF14. 

This causes the file to be a massive token-sink for AI agents, making it harder for the agent to spot the actual differences between the workflows.

### **The Cleanup Strategy**
To compress the file by an estimated **50-60%**, make the following architectural changes:

1. **Centralize the Base Template:** Define the `📄 The Active Task Template` (lines 35-54) as the absolute "Master Template" and expand it to include the *Execution Plan* header.
2. **Gut the Workflows:** Remove the full markdown templates from WF1, WF2, WF3, etc. Instead of printing the entire 15-line boilerplate every time, condense the workflow instruction to just the execution steps.
   * **Example format for WF1:**
     ```markdown
     # 🆕 Workflow 1: New Feature Genesis
     1. Create `.cursor/active_task.md` using the *Master Template*.
     2. For your `## 🛠️ Execution Plan`, paste these exact steps:
        - [ ] Contract Definition...
        - [ ] Spec & Registry Sync...
        - [ ] ...etc
     ```
3. **Merge Audits (WF5, WF7, WF8, WF13):** You currently have **four** separate workflows for auditing (Spec Audit, Quality Rubric, Lock Snapshot, Build Audit). 
   * **Improvement:** Merge these into a single **"Workflow 5: Pre-Flight Audit"** that sequentially triggers standard Code Verification (`verify`), Build tests, and Snapshot diffs.

By drastically reducing the repetitive boilerplate, the document will become significantly punchier, ensuring engineers and AI follow the sequence strictly without "skipping ahead" through giant blocks of duplicate text.

---

## 7. Shortening AI Prompts (Creating "God Mode" Triggers)
If you are repeatedly typing `"run workflow 3 from the engineering_workflows.md file"`, you are wasting your own keystrokes. You can shorten your prompts down to just `"WF3: Fix login bug"` by turning your workflows into a **Global System Prompt**.

### **How to implement the `WF{X}` Shortcodes:**
Right now, Claude does not memorize `engineering_workflows.md` until you explicitly point to it in a conversation. You need to make it omnipresent.

1. **Create an `.ai/system_prompt.md` (or Custom Instructions file):**
   Extract the "Quick Triggers" table from the top of your current `engineering_workflows.md` and explicitly command the AI to always be listening for them.
   
   **Add this preamble to your AI's Custom Instructions or System Prompt (if using Cursor/Claude Pro):**
   ```text
   You are an AI adhering strictly to the 'engineering_workflows.md' protocol. 
   Whenever the user begins a prompt with "WF1", "WF2", "WF3", etc., you must immediately read the `engineering_workflows.md` file in the root directory and execute the corresponding workflow without asking for permission.
   ```

2. **Refine the Workflow Triggers:**
   Update the triggers inside your `engineering_workflows.md` file to explicitly state these shortcodes.
   * **Change:** `**Trigger:** "Fix a bug" or "Resolve issue".`
   * **To:** `**Trigger:** User prompt starting with "WF3" or "Fix a bug".`

**The Result:** 
You can now open a brand new chat with Claude and instantly type:
> `"WF3: Fix the map rendering crash"`

Claude will automatically fetch the `engineering_workflows.md` rules, generate the Active Task template, and establish the Rollback hash, completely automating your setup in 4 keystrokes.

---

### **How to implement the `WF{X}` Shortcodes for Claude in the Terminal (CLI):**
If you are running the `claude` command line tool directly in your terminal (instead of a GUI editor like Cursor), you cannot rely on GUI system prompts. Instead, you create a seamless **Terminal Alias or Function** that automatically feeds the markdown configuration to Claude every time you run it.

#### **For Windows (PowerShell):**
1. Open your PowerShell profile by running: `notepad $PROFILE` (If the file doesn't exist, create it).
2. Add this custom `wf` function to the bottom of the file:
   ```powershell
   function wf {
       param([string]$command)
       # This tells the Claude CLI to read the file and execute your shortcode
       claude "Read engineering_workflows.md and strictly follow its protocol. Execute: $command"
   }
   ```
3. Save the file and restart PowerShell (or run `. $PROFILE`).
4. **Usage:** Now, in your terminal, instead of typing `claude ...`, you just type:
   > `wf "WF3: Fix the map crash"`

#### **For Mac / Linux (Zsh / Bash):**
1. Open your shell profile (e.g., `nano ~/.zshrc` or `nano ~/.bashrc`).
2. Add this alias function at the bottom:
   ```bash
   wf() {
       claude "Read engineering_workflows.md and strictly follow its protocol. Execute: $1"
   }
   ```
By creating this 2-character wrapper command (`wf`), you completely eliminate the need to type out the file name or give redundant context ever again.

---

## 8. Spec Hardening: The "Do Not Touch" Constraints
Since your workflow relies entirely on "Spec-Focused Development" (e.g., executing directly off `13_auth.md`), the AI and engineers currently have too much freedom to decide *where* code belongs. 

If a Spec is open-ended, an AI might accidentally rewrite core database logic to satisfy a UI request, causing a massive architectural regression.

### **How to Harden Your Specifications:**
Every single `.md` spec file in your `docs/specs/` folder should be updated to strictly define its **Operating Boundaries** using these exact markdown headers:

```markdown
## 🎯 Operating Boundaries
*(The absolute truth of what files this spec governs.)*

### ✅ Target Files (Modify / Create)
- `src/app/api/auth/route.ts`
- `src/components/auth/LoginForm.tsx`
- `src/middleware.ts`

### 🛑 Out-of-Scope Files (DO NOT TOUCH)
- **`src/lib/classification/classifier.ts`**: (Governed by Spec 08. Do not modify trade logic to fake a user login).
- **`migrations/`**: (Schema is locked by Database Admin. Raise query if schema must change).

### 🔗 Cross-Spec Dependencies
- Relies on **Spec 01 (Database Schema)**: You may import and read the `User` interface, but you may not alter it.
```

### **The Impact of Boundary Enforcements:**
1. **Preventing Hallucinated Architectures:** AI agents frequently invent entirely new folder structures (e.g., creating `src/services/LoginService.ts` when you use Next.js Route Handlers). An explicit `✅ Target Files` list mathematically bounds the agent. It fundamentally cannot hallucinate files if it is forced to stick to the allowed list.
2. **Preventing Infinite Loops:** If an agent gets stuck trying to fix a bug in a Spec, it will often try to "hack" a deeply nested utility function to make the test pass. The `🛑 Out-of-Scope Files` list acts as an electric fence. If the agent hits a wall, it is forced to stop and ask the human for permission rather than silently corrupting a shared utility.
3. **True Modularity:** By explicitly calling out `🔗 Cross-Spec Dependencies`, you formally document the "read-only" contracts between your different features, ensuring that Spec A never breaks Spec B.

---

## 9. Spec Discovery & Traceability (WF1, WF2, WF3)
To answer your question directly: **No**, the current `engineering_workflows.md` does not strictly force the AI to "find and read" the spec if you forget to mention it in your prompt. 

Currently, WF3 says: `- [ ] Spec Review: Read docs/specs/[feature].md to confirm intended behavior.`
However, if an AI doesn't know what `[feature].md` is, it might hallucinate the intended behavior instead of searching for the spec.

### **The Addition: Enforced Discovery**
You must upgrade the "Context" section of your **Master Template** (line 43) to make Spec Discovery a hard, unskippable requirement.

**Change the Master Template Context block to this:**
```markdown
## Context
* **Goal:** [What are we building/fixing?]
* **Target Spec:** 🔴 MISSING 🔴 (AI MUST search `docs/specs/` and replace this with the absolute path to the relevant `.md` spec file before proceeding).
* **Key Files:** [List specific src files]
```

### **The Impact of the Target Spec Red Flag:**
1. **The Search Mandate:** If you just say `"WF3: Fix the admin login"`, the AI will load the Master Template, see the `🔴 MISSING 🔴` flag, and be forced to run a `list_dir` on your `docs/specs/` folder to physically read `.../13_auth.md` before it writes any Execution Plan steps.
2. **Eliminating Assumptions:** It mathematically prevents the AI from saying "I assume the admin login should work like X" because it is forced to link to the actual architectural document defining exactly how it operates.
