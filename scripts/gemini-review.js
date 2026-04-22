#!/usr/bin/env node
/**
 * Gemini Adversarial Review
 *
 * Uses Google Gemini 2.5 Pro to perform adversarial code/spec/plan reviews.
 * Acts as a second opinion to catch issues Claude may have missed or
 * rationalised away.
 *
 * Setup:
 *   1. Add to .env:  GEMINI_API_KEY=your_key_here
 *   2. Run: node scripts/gemini-review.js test
 *
 * Commands:
 *   test                          - Sanity check the API connection
 *   review <file>                 - Adversarial review of a single file
 *   review <file> --context <f>   - Review with extra context file
 *   spec <spec-path>              - Review a spec for gaps and contradictions
 *   plan                          - Review .cursor/active_task.md
 *
 * Examples:
 *   node scripts/gemini-review.js test
 *   node scripts/gemini-review.js review scripts/link-coa.js
 *   node scripts/gemini-review.js spec docs/specs/03-mobile/75_lead_feed_implementation_guide.md
 *   node scripts/gemini-review.js plan
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const MODEL = 'gemini-2.5-pro';

if (!process.env.GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY not found in .env');
  console.error('   Add this line to your .env file:');
  console.error('   GEMINI_API_KEY=your_key_here');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function callGemini(prompt, systemInstruction = null) {
  const startMs = Date.now();
  const config = {};
  if (systemInstruction) {
    config.systemInstruction = systemInstruction;
  }

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: Object.keys(config).length > 0 ? config : undefined,
    });
    const durationMs = Date.now() - startMs;
    const text = response.text;
    const usage = response.usageMetadata;
    return { text, durationMs, usage };
  } catch (err) {
    console.error('❌ Gemini API error:', err.message);
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

// ============================================================
// Commands
// ============================================================

async function cmdTest() {
  console.log(`🧪 Testing Gemini ${MODEL}...\n`);
  const result = await callGemini(
    'Reply with exactly: "Gemini 2.5 Pro is online and ready for adversarial reviews."'
  );
  console.log('Response:', result.text);
  console.log(`\n⏱  ${result.durationMs}ms`);
  if (result.usage) {
    console.log(`📊 Tokens — input: ${result.usage.promptTokenCount}, output: ${result.usage.candidatesTokenCount}, total: ${result.usage.totalTokenCount}`);
  }
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

  const result = await callGemini(prompt, systemInstruction);
  console.log(result.text);
  console.log(`\n---\n⏱  ${result.durationMs}ms`);
  if (result.usage) {
    console.log(`📊 Tokens: ${result.usage.totalTokenCount} (input: ${result.usage.promptTokenCount}, output: ${result.usage.candidatesTokenCount})`);
  }
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

  const result = await callGemini(prompt, systemInstruction);
  console.log(result.text);
  console.log(`\n---\n⏱  ${result.durationMs}ms`);
  if (result.usage) {
    console.log(`📊 Tokens: ${result.usage.totalTokenCount}`);
  }
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

  const result = await callGemini(prompt, systemInstruction);
  console.log(result.text);
  console.log(`\n---\n⏱  ${result.durationMs}ms`);
  if (result.usage) {
    console.log(`📊 Tokens: ${result.usage.totalTokenCount}`);
  }
}

// ============================================================
// CLI dispatch
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(`
Gemini Adversarial Review (model: ${MODEL})

Usage:
  node scripts/gemini-review.js <command> [args]

Commands:
  test                          Sanity check the API connection
  review <file>                 Adversarial code review of a file
  review <file> --context <f>   Code review with extra context
  spec <spec-path>              Adversarial spec review
  plan                          Review .cursor/active_task.md

Examples:
  node scripts/gemini-review.js test
  node scripts/gemini-review.js review scripts/link-coa.js
  node scripts/gemini-review.js spec docs/specs/03-mobile/75_lead_feed_implementation_guide.md
  node scripts/gemini-review.js plan
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
