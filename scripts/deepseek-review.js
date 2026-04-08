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

const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-reasoner';
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

  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages,
      // R1 doesn't support temperature/top_p — they're ignored
    });
    const durationMs = Date.now() - startMs;
    const choice = response.choices[0];
    const text = choice.message.content;
    // R1 also returns reasoning_content (the chain of thought)
    const reasoning = choice.message.reasoning_content;
    const usage = response.usage;
    return { text, reasoning, durationMs, usage };
  } catch (err) {
    console.error('❌ DeepSeek API error:', err.message);
    throw err;
  }
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

async function cmdReviewFile(filePath, contextPath = null) {
  console.log(`🔍 Adversarial review of ${filePath}\n`);
  const code = readFileOrFail(filePath);
  const context = contextPath ? readFileOrFail(contextPath) : null;

  const systemInstruction = `You are a senior software engineer performing an ADVERSARIAL code review. Your job is to find bugs, edge cases, security issues, and design flaws that the original author may have missed or rationalised away. Be specific. Cite line numbers. Do not be polite — be useful.

For each issue, format as:
- **[SEVERITY]** (line N): Description. Why it's a problem. How to fix it.

Severities: CRITICAL, HIGH, MEDIUM, LOW, NIT
End with a 1-paragraph overall verdict.`;

  let prompt = `## File: ${filePath}\n\n\`\`\`\n${code}\n\`\`\``;
  if (context) {
    prompt += `\n\n## Additional context: ${contextPath}\n\n\`\`\`\n${context}\n\`\`\``;
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

async function cmdReviewPlan() {
  const planPath = '.cursor/active_task.md';
  console.log(`📋 Reviewing active task plan: ${planPath}\n`);
  const plan = readFileOrFail(planPath);

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
  plan                          Review .cursor/active_task.md

Override model with DEEPSEEK_MODEL env var:
  - deepseek-reasoner (R1, default — extended chain of thought)
  - deepseek-chat (V3 — faster, cheaper)

Examples:
  node scripts/deepseek-review.js test
  node scripts/deepseek-review.js review scripts/link-coa.js
  node scripts/deepseek-review.js spec docs/specs/product/future/75_lead_feed_implementation_guide.md
  node scripts/deepseek-review.js plan
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
      await cmdReviewFile(file, contextFile);
    } else if (command === 'spec') {
      const file = args[1];
      if (!file) {
        console.error('❌ Usage: spec <spec-path>');
        process.exit(1);
      }
      await cmdReviewSpec(file);
    } else if (command === 'plan') {
      await cmdReviewPlan();
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
