# Streamlining `engineering_workflows.md` (Post-WF13 Clutter)

You are absolutely correct. The bottom 100 lines of your original `engineering_workflows.md` document (everything after WF13) are heavily bloated. Because this document acts as your AI's core system prompt, every unnecessary word degrades the AI's focus on the actual task.

Here are 3 concrete strategies to eliminate or compress this clutter entirely:

### 1. Delete the "Available Factories" Table & Code Examples
**Current State:** 30 lines of text dedicated to showing "Good vs Bad" mocking code and listing out every single factory in `src/tests/factories.ts`.
**The Problem:** The AI already knows how to use TypeScript. It doesn't need bad examples. Furthermore, if you add a new database table, you have to manually update this markdown list, which is an anti-pattern.
**The Fix:** Delete lines 341-378 completely. Replace the entire "Testing Standards" section with two sentences:
> **Testing Standards:** Never write untyped inline mocks (e.g., `const user = {id: 1}`). You MUST always import typed factories from `src/tests/factories.ts`.
*Note: We already implemented this strict 2-sentence constraint in the `compressed_engineering_workflows.md` draft.*

### 2. Move "Spec Boundary Requirements" out of the Hot Path
**Current State:** 25 lines explaining how to write the `Target Files` and `Out-of-Scope Files` headers inside a spec.
**The Problem:** The AI does not need to read the instructions on "how to write a spec" when it is trying to execute a Bug Fix (WF3) or wire an API (WF9). It's dead weight in the context window.
**The Fix:** Delete this entire section from `engineering_workflows.md`. Move it into a dedicated template file: `docs/specs/_spec_template.md`. When you want the AI to write a new spec, you just tell it to copy the template.

### 3. Compress "The Founder's Audit Protocol"
**Current State:** A 15-line block at the very bottom of the file listing out rules like "No Laziness" and "Check Exports".
**The Problem:** Because it sits at the bottom of a 400-line file, AI agents prone to "lost in the middle" syndrome often forget to run this audit.
**The Fix:** Delete the standalone section. Instead, compress the rules into a single unskippable checkbox and inject it directly into the WF1 and WF2 execution checklists.
> `- [ ] **Founder's Audit:** Before task completion, verify NO "laziness" placeholders (`// ... existing code`) and ensure complete exports / schema match.`

### The Result
By executing these 3 recommendations, you can **delete ~70 redundant lines of text** from the bottom of your master protocol, ensuring the AI remains hyper-focused on executing your workflows without getting bogged down by instructional clutter.
