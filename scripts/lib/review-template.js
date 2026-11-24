/**
 * review-template.js — shared template parsing for the plan-review scripts.
 *
 * Both `scripts/gemini-review.js` and `scripts/deepseek-review.js` accept a
 * `--template <path>` flag on the `plan` subcommand. The template is a
 * markdown file with two well-known sections — `## System persona` and
 * `## User prompt` — separated so the persona becomes the LLM's
 * systemInstruction and the user prompt carries the substituted plan +
 * specs + data context.
 *
 * This module owns the parsing + substitution logic so both review
 * scripts share one tested implementation.
 *
 * SPEC LINK: .claude/review-templates/README.md (template format + invocation)
 */
'use strict';

const fs = require('fs');
const path = require('path');

/** Sibling suffix for a step's prose notes file (Spec 120 §3.4). */
const NOTES_SUFFIX = '.notes.json';

/**
 * Split a template into systemInstruction + user prompt template.
 *
 * Convention: the template has two markdown sections under H2 headings.
 *   - `## System persona` — becomes the LLM's systemInstruction.
 *   - `## User prompt` — becomes the user prompt with placeholders.
 *
 * Fallback when `## User prompt` is missing: the entire template is used
 * as the user prompt, with a generic systemInstruction supplied by the
 * caller. This keeps short ad-hoc templates working without ceremony.
 *
 * @param {string} template - the full markdown body of the template file.
 * @returns {{ systemInstruction: string | null, userTemplate: string }}
 *   `systemInstruction` is null when no split was performed (caller
 *   should supply a generic one).
 */
function splitTemplate(template) {
  const userPromptIdx = template.indexOf('## User prompt');
  if (userPromptIdx === -1) {
    return { systemInstruction: null, userTemplate: template };
  }
  const systemIdx = template.indexOf('## System persona');
  const systemInstruction = systemIdx !== -1
    ? template.substring(systemIdx, userPromptIdx).trim()
    : template.substring(0, userPromptIdx).trim();
  const userTemplate = template.substring(userPromptIdx).trim();
  return { systemInstruction, userTemplate };
}

/**
 * Substitute placeholders in a user-prompt template body. Supported
 * placeholders are {{PLAN}}, {{SPECS}}, {{DATA_CONTEXT}}. All
 * occurrences of each placeholder are replaced; the template can
 * reference the same placeholder multiple times (e.g. quoting the
 * plan in two different sections).
 *
 * Missing values are NOT silently substituted — the caller passes the
 * literal fallback string they want. This keeps the substitution
 * function pure (no I/O, no policy).
 *
 * @param {string} userTemplate - the body returned by splitTemplate.
 * @param {object} values
 * @param {string} values.plan - substitutes {{PLAN}}.
 * @param {string} values.specs - substitutes {{SPECS}}.
 * @param {string} [values.dataContext] - substitutes {{DATA_CONTEXT}}.
 *   Optional — DeepSeek-only placeholder. When omitted, {{DATA_CONTEXT}}
 *   substitutes to an empty string (the template's own default-message
 *   wording is preserved by the caller, not this function).
 * @returns {string} substituted prompt.
 */
function substitutePlaceholders(userTemplate, { plan, specs, dataContext = '' }) {
  // task-366 (COMPLY.2): ONE pass with function replacers, so a value is inserted literally: no dollar-sequence expansion and no re-scan of inserted text for tokens.
  const values = { PLAN: plan, SPECS: specs, DATA_CONTEXT: dataContext };
  return userTemplate.replace(/\{\{(PLAN|SPECS|DATA_CONTEXT)\}\}/g, (_m, key) => values[key]);
}

/**
 * Locate the sibling `<stem>.notes.json` of a reviewed file and render its
 * `review_notes` block (Spec 120 §3.4 — the prose that must reach the
 * reviewer automatically). Pure lookup: never throws — a missing, unreadable
 * or malformed notes file, or one with no `review_notes`, yields `null`.
 *
 * @param {string} filePath - the file under review (relative or absolute).
 * @returns {{ notesPath: string, block: string } | null}
 *   `block` is a delimited markdown section ready to append to the prompt.
 */
function loadReviewNotesBlock(filePath) {
  const abs = path.resolve(filePath);
  const stem = path.basename(abs, path.extname(abs));
  const notesPath = path.join(path.dirname(abs), `${stem}${NOTES_SUFFIX}`);
  if (!fs.existsSync(notesPath)) return null;
  let notes;
  try {
    notes = JSON.parse(fs.readFileSync(notesPath, 'utf8'));
  } catch {
    return null;
  }
  const reviewNotes = notes && typeof notes === 'object' ? notes.review_notes : undefined;
  if (!Array.isArray(reviewNotes) || reviewNotes.length === 0) return null;
  const rel = path.relative(process.cwd(), notesPath).split(path.sep).join('/');
  const body = reviewNotes
    .map((n) => (typeof n === 'string' ? `- ${n}` : `- ${JSON.stringify(n)}`))
    .join('\n');
  const block = `\n\n## Review notes (from ${rel})\n\n${body}\n\n<!-- end review notes -->`;
  return { notesPath: rel, block };
}

/**
 * task-375 A2: the reviewer's context is the task, sized. ONE list of headings of the context file docs/reports/reviews/<task>/context-rN.md
 * (CONTEXT_SECTIONS) and the plan phase's material (PLAN_SECTIONS), shared by the review tool, rule-lists.mjs lens-input and the close check.
 */
const CONTEXT_SECTIONS = ['Task', 'Description', 'Acceptance criteria', 'Decisions naming this task', 'Implementation Notes'];
const PLAN_SECTIONS = ['Description', 'Acceptance criteria', 'Implementation Plan'];

/** Keep only the markdown sections whose heading line contains one of `wanted` (to the next heading of the same or higher level); throws on a missing heading. */
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

/** The number of the next review round of a task: the highest N of the context-r<N>.md files in `dir` (docs/reports/reviews/<task>/) plus one (0 when there is none), so a gap never names an existing file again (T7, task-453). ONE count, shared by the brief that writes the file and the launch that names it. */
function contextRound(dir) {
  const ns = fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => /^context-r(\d+)\.md$/.exec(f)).filter(Boolean).map((m) => Number(m[1])) : [];
  return Math.max(0, ...ns) + 1;
}

module.exports = { splitTemplate, substitutePlaceholders, loadReviewNotesBlock, NOTES_SUFFIX, CONTEXT_SECTIONS, PLAN_SECTIONS, extractSections, contextRound };
