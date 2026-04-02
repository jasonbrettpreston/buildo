# Research Report: Specification Best Practices for LLMs & Data Pipelines

This report synthesizes the latest industry best practices for writing effective specification documents, specifically tailored for **LLM (AI) coding assistants** and **Data Processing Pipelines**.

---

## Part 1: Writing Software Specifications for LLMs
Writing specs for AI requires a mental shift: you are no longer writing just for human intuition, but for an intelligence that is incredibly capable yet constrained by its context window and linear processing capabilities.

### 1. The "Spec-First" Workflow
- **The Living Anchor:** Maintain a `SPEC.md` or similar markdown file as the absolute source of truth. Because LLMs "forget" past chat sessions, injecting this file at the start of a session grounds the AI immediately.
- **Top-Down Elaboration:** Start with a concise, high-level product brief. Let the AI elaborate the architectural details first. Once the design is validated (Plan Mode), move to execution.
- **Iterate the Spec, Not the Code:** If the AI produces incorrect code, fix the *Specification* first, then ask the AI to re-read the spec to fix the code.

### 2. Structuring for Machine Parsing
- **Semantic Markdown:** Use strict, hierarchical Markdown. Mathematical formatting, ordered lists, and code blocks help the AI parse contexts. Avoid screenshots, PDFs, or complex conceptual diagrams unless translated to text/Mermaid.
- **XML/HTML Structural Tags:** Advanced practice involves wrapping sections in XML tags (e.g., `<requirements>`, `<constraints>`, `<schema>`). This dramatically helps the Attention Mechanism of the LLM segregate instructions from background context.
- **Q&A Formatting:** For RAG (Retrieval-Augmented Generation) setups, phrasing complex system behaviors as Question-and-Answer pairs heavily improves the LLM's recall accuracy.

### 3. Essential Spec Components for AI
- **Strict Constraints (Negative Prompting):** Explicitly define what the AI should *not* do (e.g., "Do not modify `auth.ts`", "Do not use external libraries"). LLMs benefit greatly from defined boundary boxes.
- **I/O Examples:** Provide concrete JSON/Data examples of exact inputs and exact expected outputs.
- **Environment Context:** Explicitly list the tech stack, library versions, and architectural patterns (e.g., "Next.js App Router v14, strict TypeScript, Tailwind CSS").

---

## Part 2: Writing Data Pipeline Specifications
Data pipelines require specifications that bridge the gap between technical orchestration logic and downstream business/analytical value. 

### 1. The "RFC" (Request for Comments) Approach
Treat data pipelines as software engineering products. Write the spec as an RFC before writing code to establish shared ownership, prevent data silos, and catch scaling bottlenecks early.

### 2. Core Components of a Pipeline Spec
To ensure a pipeline is fully understood, the document must include:
- **High-Level Architecture (The Graph):** Visual flowcharts or DAG descriptions illustrating data movement from Origin -> Processing -> Storage -> Consumption.
- **Technical Mechanisms:**
  - **Sources:** APIs, databases, or logs (including authentication methods).
  - **Ingestion/Transformation:** The core logic, aggregations, and cleaning steps.
  - **Storage:** Where it lands, and the resulting Schema Definitions (fields, types, constraints).
- **Operational Requirements (The Behavioral Contract):**
  - **Error Handling & Retries:** Dead-letter queues, failure alerting.
  - **Orchestration Rules:** Cron schedules, trigger dependencies.
  - **Data Quality:** Explicit validation checks (e.g., "Row count must match Source", "No nulls in ID").

### 3. Documentation "As Code" & Automation
Manual documentation rots quickly. The modern standard blends human intent with automated truth:
- **The "One-Pager " (Human Intent):** A minimal markdown file capturing the *Why*, the *Who* (Ownership), the *Dependencies*, and the *Blast Radius* if the pipeline fails.
- **Automated Lineage (Machine Truth):** Expose tools like **dbt**, **Apache Airflow**, or native Data Catalogs to auto-generate the actual DAGs and schema definitions directly from the codebase.
- **Integrate into CI/CD:** Updating the pipeline text document must be a requested PR block before merging feature changes to the pipeline.

---

## Summary Synthesis: The Ultimate Spec
If you are designing pipelines *with* an AI, the perfect specification document combines both paradigms:
1. **XML-Tagged Structured Markdown** (Appeals to the LLM).
2. **Strict I/O Examples & Edge Cases** (Appeals to the LLM).
3. **Explicit Orchestration & Lineage Definitions** (Critical for Data Pipelines).
4. **Data Quality Assertions** (Protects the Pipeline).
