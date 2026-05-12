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
  return userTemplate
    .replace(/\{\{PLAN\}\}/g, plan)
    .replace(/\{\{SPECS\}\}/g, specs)
    .replace(/\{\{DATA_CONTEXT\}\}/g, dataContext);
}

module.exports = { splitTemplate, substitutePlaceholders };
