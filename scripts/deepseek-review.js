#!/usr/bin/env node
/**
 * DeepSeek Adversarial Review
 *
 * Uses DeepSeek-R1 (reasoning model) to perform adversarial code/spec/plan
 * reviews. Different model lineage from Gemini and Claude — catches different
 * blind spots. Mirrors the interface of scripts/gemini-review.js.
 *
 * Setup:
 *   1. Add to .env: DEEPSEEK_API_KEY=sk-...
 *   2. Run: node scripts/deepseek-review.js test
 *
 * Commands:
 *   test                          - Sanity check the API connection
 *   review <file>                 - Adversarial review of a single file
 *   review <file> --context <f>   - Review with extra context file
 *   spec <spec-path>              - Review a spec for gaps and contradictions
 *   plan                          - Review .cursor/active_task.md
 *
 * Models: deepseek-reasoner (R1) by default for adversarial work.
 *         Override with DEEPSEEK_MODEL env var (e.g., 'deepseek-chat' for V3).
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { splitTemplate, substitutePlaceholders, loadReviewNotesBlock } = require('./lib/review-template');

// `--fast` selects deepseek-chat (V3) for a quick lens tier; DEEPSEEK_MODEL overrides both.
const MODEL = process.env.DEEPSEEK_MODEL || (process.argv.includes('--fast') ? 'deepseek-chat' : 'deepseek-reasoner');
// 2026-10-03: whole-spec contexts (Spec 122 = 206 KB) plus ~30K reasoning tokens ran past every
// caller's cap with nothing printed (non-streaming). Bound the prompt and stream with progress.
const MAX_PROMPT_CHARS = Number(process.env.DEEPSEEK_REVIEW_MAX_CHARS) || 120000;
const TIMEOUT_MS = Number(process.env.DEEPSEEK_REVIEW_TIMEOUT_MS) || 900000;
const BASE_URL = 'https://api.deepseek.com';

if (!process.env.DEEPSEEK_API_KEY) {
  console.error('❌ DEEPSEEK_API_KEY not found in .env');
  console.error('   Add this line to your .env file:');
  console.error('   DEEPSEEK_API_KEY=sk-...');
  console.error('   Get a key at: https://platform.deepseek.com/api_keys');
  process.exit(1);
}

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: BASE_URL,
});

async function callDeepSeek(prompt, systemInstruction = null) {
  const startMs = Date.now();
  const messages = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: prompt });

  const promptChars = (systemInstruction || '').length + prompt.length;
  if (promptChars > MAX_PROMPT_CHARS) {
    throw new Error(
      `prompt is ${promptChars} chars, over the ${MAX_PROMPT_CHARS} bound — refusing to send (it would run past any caller's cap). ` +
      'Pass only the relevant part of a large context with --section "<heading text>" (repeatable), ' +
      'or raise DEEPSEEK_REVIEW_MAX_CHARS deliberately.',
    );
  }

  const ctrl = new AbortController();
  const deadline = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let text = '';
  let reasoning = '';
  let usage = null;
  let lastTick = Date.now();
  try {
    const stream = await client.chat.completions.create(
      { model: MODEL, messages, stream: true, stream_options: { include_usage: true } },
      { signal: ctrl.signal },
    );
    for await (const chunk of stream) {
      const delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
      if (delta && delta.content) text += delta.content;
      if (delta && delta.reasoning_content) reasoning += delta.reasoning_content;
      if (chunk.usage) usage = chunk.usage;
      if (Date.now() - lastTick > 15000) {
        lastTick = Date.now();
        process.stderr.write(`[deepseek-review] ${MODEL} working… reasoning ${reasoning.length} chars, answer ${text.length} chars, ${Math.round((Date.now() - startMs) / 1000)}s\n`);
      }
    }
    return { text, reasoning, durationMs: Date.now() - startMs, usage };
  } catch (err) {
    if (ctrl.signal.aborted) {
      console.error(`❌ timed out after ${Math.round(TIMEOUT_MS / 1000)}s (partial answer below)`);
      if (text) console.log(text);
      process.exitCode = 1;
      return { text, reasoning, durationMs: Date.now() - startMs, usage, timedOut: true };
    }
    console.error('❌ DeepSeek API error:', err.message);
    throw err;
  } finally {
    clearTimeout(deadline);
  }
}

/** Keep only the markdown sections whose heading line contains one of `wanted` (to the next heading of the same or higher level). */
function extractSections(markdown, wanted) {
  const lines = markdown.split('\n');
  const out = [];
  for (const want of wanted) {
    const start = lines.findIndex((l) => /^#{1,6}\s/.test(l) && l.includes(want));
    if (start === -1) throw new Error(`--section "${want}": no heading contains that text`);
    const level = lines[start].match(/^(#+)/)[1].length;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i += 1) {
      const m = lines[i].match(/^(#+)\s/);
      if (m && m[1].length <= level) { end = i; break; }
    }
    out.push(lines.slice(start, end).join('\n'));
  }
  return out.join('\n\n');
}

function readFileOrFail(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    console.error(`❌ File not found: ${abs}`);
    process.exit(1);
  }
  return fs.readFileSync(abs, 'utf8');
}

function printUsage(usage, durationMs) {
  console.log(`\n---\n⏱  ${durationMs}ms (${(durationMs / 1000).toFixed(1)}s)`);
  if (usage) {
    const parts = [`total: ${usage.total_tokens}`, `input: ${usage.prompt_tokens}`, `output: ${usage.completion_tokens}`];
    if (usage.completion_tokens_details?.reasoning_tokens) {
      parts.push(`reasoning: ${usage.completion_tokens_details.reasoning_tokens}`);
    }
    console.log(`📊 Tokens — ${parts.join(', ')}`);
  }
}

// ============================================================
// Commands
// ============================================================

async function cmdTest() {
  console.log(`🧪 Testing DeepSeek ${MODEL}...\n`);
  const result = await callDeepSeek(
    'Reply with exactly: "DeepSeek R1 is online and ready for adversarial reviews."'
  );
  console.log('Response:', result.text);
  printUsage(result.usage, result.durationMs);
  console.log('\n✅ Connection working');
}

async function cmdReviewFile(filePath, contextPath = null, sections = []) {
  console.log(`🔍 Adversarial review of ${filePath} (model: ${MODEL})\n`);
  const code = readFileOrFail(filePath);
  const rawContext = contextPath ? readFileOrFail(contextPath) : null;
  const context = rawContext && sections.length ? extractSections(rawContext, sections) : rawContext;

  const systemInstruction = `You are a senior software engineer performing an ADVERSARIAL code review. Your job is to find bugs, edge cases, security issues, and design flaws that the original author may have missed or rationalised away. Be specific. Cite line numbers. Do not be polite — be useful.

For each issue, format as:
- **[SEVERITY]** (line N): Description. Why it's a problem. How to fix it.

Severities: CRITICAL, HIGH, MEDIUM, LOW, NIT
End with a 1-paragraph overall verdict.`;

  let prompt = `## File: ${filePath}\n\n\`\`\`\n${code}\n\`\`\``;
  if (context) {
    prompt += `\n\n## Additional context: ${contextPath}\n\n\`\`\`\n${context}\n\`\`\``;
  }
  // Spec 120 §3.4 — a sibling <stem>.notes.json ships its review_notes automatically.
  const notes = loadReviewNotesBlock(filePath);
  if (notes) {
    prompt += notes.block;
    console.log(`📝 Included review_notes from sibling .notes.json: ${notes.notesPath}\n`);
  }
  prompt += '\n\nReview this code adversarially. Find what the author missed.';

  const result = await callDeepSeek(prompt, systemInstruction);
  console.log(result.text);
  printUsage(result.usage, result.durationMs);
}

async function cmdReviewSpec(specPath) {
  console.log(`📋 Adversarial spec review of ${specPath}\n`);
  const spec = readFileOrFail(specPath);

  const systemInstruction = `You are a senior software architect reviewing a technical spec adversarially. Your job is to find:
- Internal contradictions
- Missing edge cases
- Unspecified failure modes
- Hidden assumptions
- Scalability blind spots
- Security gaps
- Things the author claims work but may not

Be specific and cite section numbers. End with a list of 3-5 questions the author should answer before implementation begins.`;

  const prompt = `## Spec: ${specPath}\n\n${spec}\n\nReview this spec adversarially. What's missing, contradictory, or wrong?`;

  const result = await callDeepSeek(prompt, systemInstruction);
  console.log(result.text);
  printUsage(result.usage, result.durationMs);
}

async function cmdReviewPlan({ templatePath = null, specPaths = [], dataContextPath = null } = {}) {
  const planPath = '.cursor/active_task.md';
  console.log(`📋 Reviewing active task plan: ${planPath}\n`);
  const plan = readFileOrFail(planPath);

  // Template-mode: see scripts/gemini-review.js cmdReviewPlan for the
  // template parsing contract. DeepSeek's template adds a third
  // placeholder {{DATA_CONTEXT}} for live-DB query results that ground
  // the plan's data assumptions.
  if (templatePath) {
    const template = readFileOrFail(templatePath);
    console.log(`📐 Template: ${templatePath}`);
    if (specPaths.length > 0) {
      console.log(`📚 Specs: ${specPaths.join(', ')}`);
    }
    if (dataContextPath) {
      console.log(`📊 Data context: ${dataContextPath}`);
    }

    const split = splitTemplate(template);
    const systemInstruction = split.systemInstruction
      ?? 'You are a focused plan reviewer. Follow the prompt\'s requested output format strictly. Be specific and cite line numbers.';

    const specsBlock = specPaths.length === 0
      ? '(no specs provided as context)'
      : specPaths.map((p) => `### ${p}\n\n${readFileOrFail(p)}`).join('\n\n---\n\n');

    const dataContextBlock = dataContextPath
      ? readFileOrFail(dataContextPath)
      : '(no live-DB context provided — flag every data assumption as UNVERIFIED PREMISE)';

    const prompt = substitutePlaceholders(split.userTemplate, {
      plan,
      specs: specsBlock,
      dataContext: dataContextBlock,
    });

    const result = await callDeepSeek(prompt, systemInstruction);
    console.log(result.text);
    printUsage(result.usage, result.durationMs);
    return;
  }

  // Legacy mode (no --template) — preserves the original hardcoded prompt
  // so existing callers don't break.
  const systemInstruction = `You are a senior engineering manager reviewing an active task plan adversarially. Your job is to find:
- Steps that look complete but skip critical work
- Missing rollback / safety considerations
- Test coverage gaps
- Hidden dependencies on other work
- Risks the author downplayed
- Order-of-operations bugs

Be specific. End with a clear recommendation: APPROVE, APPROVE WITH CHANGES, or REJECT (with reasons).`;

  const prompt = `## Active Task Plan\n\n${plan}\n\nReview this plan adversarially. What's the implementor going to regret?`;

  const result = await callDeepSeek(prompt, systemInstruction);
  console.log(result.text);
  printUsage(result.usage, result.durationMs);
}

// ============================================================
// CLI dispatch
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(`
DeepSeek Adversarial Review (model: ${MODEL})

Usage:
  node scripts/deepseek-review.js <command> [args]

Commands:
  test                          Sanity check the API connection
  review <file>                 Adversarial code review of a file
  review <file> --context <f>   Code review with extra context
  spec <spec-path>              Adversarial spec review
  plan                          Review .cursor/active_task.md (legacy hardcoded prompt)
  plan --template <path>        Review with a structured template
       [--specs <a,b,...>]      Comma-separated spec files to substitute for {{SPECS}}
       [--data-context <path>]  File of live-DB query results to substitute for {{DATA_CONTEXT}}

Override model with DEEPSEEK_MODEL env var:
  - deepseek-reasoner (R1, default — extended chain of thought)
  - deepseek-chat (V3 — faster, cheaper)

Examples:
  node scripts/deepseek-review.js test
  node scripts/deepseek-review.js review scripts/link-coa.js
  node scripts/deepseek-review.js review <plan.md> --context <big-spec.md> --section "6.6.1" [--fast]
    (prompts over DEEPSEEK_REVIEW_MAX_CHARS=120000 are refused — pass --section; output streams;
     DEEPSEEK_REVIEW_TIMEOUT_MS=900000 deadline; --fast = deepseek-chat)
  node scripts/deepseek-review.js spec docs/specs/03-mobile/75_lead_feed_implementation_guide.md
  node scripts/deepseek-review.js plan
  node scripts/deepseek-review.js plan \\
    --template .claude/review-templates/plan-review-deepseek.md \\
    --specs docs/specs/02-web-admin/76_lead_feed_health_dashboard.md \\
    --data-context .review-data-context.md
`);
    return;
  }

  try {
    if (command === 'test') {
      await cmdTest();
    } else if (command === 'review') {
      const file = args[1];
      if (!file) {
        console.error('❌ Usage: review <file> [--context <file>]');
        process.exit(1);
      }
      const contextIdx = args.indexOf('--context');
      const contextFile = contextIdx !== -1 ? args[contextIdx + 1] : null;
      const sections = args.flatMap((a, i) => (a === '--section' && args[i + 1] ? [args[i + 1]] : []));
      await cmdReviewFile(file, contextFile, sections);
    } else if (command === 'spec') {
      const file = args[1];
      if (!file) {
        console.error('❌ Usage: spec <spec-path>');
        process.exit(1);
      }
      await cmdReviewSpec(file);
    } else if (command === 'plan') {
      const templateIdx = args.indexOf('--template');
      const templatePath = templateIdx !== -1 ? args[templateIdx + 1] : null;
      const specsIdx = args.indexOf('--specs');
      const specPaths = specsIdx !== -1 && args[specsIdx + 1]
        ? args[specsIdx + 1].split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      const dataIdx = args.indexOf('--data-context');
      const dataContextPath = dataIdx !== -1 ? args[dataIdx + 1] : null;
      await cmdReviewPlan({ templatePath, specPaths, dataContextPath });
    } else {
      console.error(`❌ Unknown command: ${command}`);
      console.error('   Run with no args for help');
      process.exit(1);
    }
  } catch (err) {
    console.error('\n❌ Failed:', err.message);
    if (err.stack && process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}

main();
