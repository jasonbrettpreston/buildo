#!/usr/bin/env node
/**
 * Semantic-Diff Narrator
 *
 * Reads a git diff from stdin, asks Gemini to summarize it in 3-5 bullets
 * focused on what could surprise a reviewer (stale comments, contract drift,
 * unexpected files, side effects in pure functions), and APPENDS the bullets
 * to the commit message file passed as argv[2]. Wired via the
 * scripts/hooks/diff-narrator.sh wrapper + .husky/prepare-commit-msg.
 *
 * Critical design rules:
 *   - Opt-in via BUILDO_DIFF_NARRATOR=1 (default OFF). The wrapper enforces.
 *   - FAILS OPEN: any error (missing key, network, API timeout, parse fail)
 *     logs a warning and exits 0 so the commit proceeds. Never blocks the
 *     dev's commit on its own.
 *   - Never reads or modifies anything other than the passed message file
 *     and stdin.
 *   - Skips automatically when the diff is empty (e.g., merge commits,
 *     amend with no changes).
 *
 * Usage (called by the hook, not by humans):
 *   git diff --cached | node scripts/diff-narrator.js path/to/COMMIT_EDITMSG
 *
 * Env:
 *   GEMINI_API_KEY — required (read via dotenv from .env)
 *   BUILDO_NARRATOR_MODEL — optional override, default 'gemini-2.5-flash'
 *     (faster + cheaper than gemini-2.5-pro for this thin-summary task)
 *   BUILDO_NARRATOR_TIMEOUT_MS — optional, default 15000 (15s)
 */

require('dotenv').config();
const fs = require('fs');

const TIMEOUT_MS = Number(process.env.BUILDO_NARRATOR_TIMEOUT_MS) || 15_000;
const MODEL = process.env.BUILDO_NARRATOR_MODEL || 'gemini-2.5-flash';
const SEPARATOR = '\n\n--- diff narrator (BUILDO_DIFF_NARRATOR=1) ---\n';

const SYSTEM = `You are a code review assistant that summarizes a git diff in 3-5 bullet points. Focus on what could surprise a reviewer:
- Stale comments that no longer match the code (e.g., "never throws" near a new throw statement)
- Contract drift between what a spec/JSDoc claims and what the diff actually does
- Side effects added to a function previously documented as pure
- Unexpected files in the diff (test fixtures, config, secrets, generated code)
- API surface changes (renamed exports, changed signatures)

Be concise: 1 line per bullet, under 100 words total. Skip generic observations like "added a test" or "renamed variable" unless they materially affect the review. If the diff is small and routine, say so in 1 line and stop.`;

function fail(msg, err) {
  // Fail-open: log to stderr (visible in pre-commit output) but exit 0.
  console.warn(`⚠️  diff-narrator: ${msg}`);
  if (err && err.message) console.warn(`   ${err.message}`);
  process.exit(0);
}

async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const msgPath = process.argv[2];
  if (!msgPath) {
    fail('no commit message path passed as argv[2]');
  }

  if (!process.env.GEMINI_API_KEY) {
    fail('GEMINI_API_KEY not set in .env — narrator skipped');
  }

  const diff = await readStdin();
  if (!diff || diff.trim().length === 0) {
    // Nothing to summarize — empty merge commit, etc.
    process.exit(0);
  }

  // Cap the diff at ~30K chars to keep the API call cheap and within the
  // model's context window. Most commits are well under this; large
  // refactors get truncated with a tail marker.
  const MAX_DIFF_CHARS = 30_000;
  let diffForPrompt = diff;
  let truncated = false;
  if (diff.length > MAX_DIFF_CHARS) {
    diffForPrompt = diff.slice(0, MAX_DIFF_CHARS);
    truncated = true;
  }

  let geminiText;
  try {
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await withTimeout(
      ai.models.generateContent({
        model: MODEL,
        contents: `Summarize this git diff:\n\n\`\`\`diff\n${diffForPrompt}\n\`\`\`${
          truncated ? '\n\n(Diff was truncated at 30KB.)' : ''
        }`,
        config: { systemInstruction: SYSTEM },
      }),
      TIMEOUT_MS,
      'Gemini API call',
    );
    geminiText = response.text;
  } catch (err) {
    fail('Gemini call failed', err);
  }

  if (!geminiText || typeof geminiText !== 'string') {
    fail('Gemini returned empty response');
  }

  // Append to the commit message file. Read first to preserve the original
  // user-authored message (or the auto-generated one from `git commit -m`).
  let original;
  try {
    original = fs.readFileSync(msgPath, 'utf8');
  } catch (err) {
    fail('failed to read commit message file', err);
  }

  // Don't append twice if the narrator footer is already present (e.g.,
  // amend retry).
  if (original.includes(SEPARATOR.trim())) {
    process.exit(0);
  }

  try {
    fs.writeFileSync(
      msgPath,
      `${original.trimEnd()}${SEPARATOR}${geminiText.trim()}\n`,
      'utf8',
    );
  } catch (err) {
    fail('failed to write commit message file', err);
  }

  // Success — silent exit so the commit proceeds normally.
  process.exit(0);
}

main().catch((err) => fail('unhandled error', err));
