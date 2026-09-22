'use strict';
/**
 * SPEC LINK: docs/specs/00-architecture/08_agents.md §C.5
 *
 * The model-client interface the loop in scripts/deepseek-exec.js drives:
 *   next(messages, tools) → { message, usage, finish_reason }
 *
 * Two implementations:
 *   - createTranscriptClient(turns) replays a recorded array of assistant
 *     turns with no network call — every Phase-1 lock runs on this (§11.3:
 *     "no lock may need a live API call").
 *   - createDeepSeekClient({ model }) is the real OpenAI-compatible client
 *     against DeepSeek's chat.completions endpoint, mirroring the pattern in
 *     scripts/deepseek-review.js (openai SDK, baseURL https://api.deepseek.com,
 *     key from process.env.DEEPSEEK_API_KEY only — never logged).
 */

const OpenAI = require('openai');

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

function emptyFinishTurn() {
  return {
    message: { role: 'assistant', content: null, tool_calls: [] },
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    finish_reason: 'stop',
  };
}

/**
 * createTranscriptClient(turns) — turns is an array of recorded
 * `{ message, usage, finish_reason }` objects (the exact shape `next()`
 * returns). Running out of recorded turns ends the loop cleanly, as if the
 * model had returned no further tool calls.
 */
function createTranscriptClient(turns) {
  const queue = Array.isArray(turns) ? turns.slice() : [];
  let cursor = 0;
  return {
    async next(_messages, _tools) {
      if (cursor >= queue.length) {
        return emptyFinishTurn();
      }
      const turn = queue[cursor];
      cursor += 1;
      return {
        message: turn.message || { role: 'assistant', content: null, tool_calls: [] },
        usage: turn.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        finish_reason: turn.finish_reason || (turn.message && turn.message.tool_calls && turn.message.tool_calls.length ? 'tool_calls' : 'stop'),
      };
    },
  };
}

/**
 * createDeepSeekClient({ model }) — DEEPSEEK_API_KEY is read from
 * process.env at call time (never accepted as a constructor argument, never
 * logged, never placed in a ledger record or prompt string per §C.1.5).
 */
function createDeepSeekClient({ model } = {}) {
  const resolvedModel = model || process.env.DEEPSEEK_EXEC_MODEL || 'deepseek-chat';
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not set — cannot create the DeepSeek execution client');
  }
  const client = new OpenAI({ apiKey, baseURL: DEEPSEEK_BASE_URL });

  return {
    async next(messages, tools) {
      const response = await client.chat.completions.create({
        model: resolvedModel,
        messages,
        tools: Array.isArray(tools) && tools.length > 0 ? tools : undefined,
        tool_choice: Array.isArray(tools) && tools.length > 0 ? 'auto' : undefined,
      });
      const choice = response.choices[0];
      const message = choice.message || { role: 'assistant', content: null, tool_calls: [] };
      return {
        message: {
          role: message.role || 'assistant',
          content: message.content ?? null,
          tool_calls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
        },
        usage: response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        finish_reason: choice.finish_reason || 'stop',
      };
    },
  };
}

module.exports = { createTranscriptClient, createDeepSeekClient };
