// 🔗 SPEC LINK: .claude/review-templates/README.md (template format + invocation)
//
// Pure-function tests for `scripts/lib/review-template.js` — the shared
// helper used by both `scripts/gemini-review.js` and
// `scripts/deepseek-review.js` to parse and substitute plan-review
// templates.
//
// Surfaced by R0 Gemini review of the WF2 #review-templates plan: the
// original plan said "no automated tests" for the new flag-parsing +
// template-splitting logic. That's the exact pattern WF3
// #realtor-backfill's lessons.md warned against — "merged but never
// run end-to-end." Test added in-loop.

import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { splitTemplate, substitutePlaceholders } = require('../../scripts/lib/review-template');

describe('splitTemplate — system/user prompt separation', () => {
  it('splits a well-formed template into systemInstruction + userTemplate', () => {
    const template = `# Title

## System persona

You are a focused plan reviewer.

## User prompt

Review the plan: {{PLAN}}.
`;
    const result = splitTemplate(template);
    expect(result.systemInstruction).toContain('You are a focused plan reviewer.');
    expect(result.systemInstruction).not.toContain('Review the plan');
    expect(result.userTemplate).toContain('## User prompt');
    expect(result.userTemplate).toContain('Review the plan: {{PLAN}}.');
  });

  it("returns systemInstruction=null when '## User prompt' heading is missing (fallback signal)", () => {
    const template = `# Title only

Some prose, no headings the parser recognizes.`;
    const result = splitTemplate(template);
    expect(result.systemInstruction).toBeNull();
    expect(result.userTemplate).toBe(template);
  });

  it("handles a template that has '## User prompt' but no '## System persona'", () => {
    // Author wrote a prose preamble but skipped the persona heading —
    // the parser should still split at User prompt and put everything
    // before that into systemInstruction.
    const template = `# My template

Some preamble prose without a System persona heading.

## User prompt

The actual prompt body.`;
    const result = splitTemplate(template);
    expect(result.systemInstruction).toContain('Some preamble prose');
    expect(result.userTemplate).toContain('## User prompt');
    expect(result.userTemplate).toContain('The actual prompt body.');
  });

  it('splits on the FIRST occurrence of ## User prompt if multiple appear', () => {
    // A second `## User prompt` heading would be malformed but the
    // parser should tolerate it deterministically.
    const template = `## System persona

System.

## User prompt

First user prompt body.

## User prompt

Second occurrence (treated as part of the first body).`;
    const result = splitTemplate(template);
    expect(result.systemInstruction).toBe('## System persona\n\nSystem.');
    expect(result.userTemplate).toContain('First user prompt body.');
    expect(result.userTemplate).toContain('Second occurrence');
  });
});

describe('substitutePlaceholders — placeholder replacement', () => {
  it('substitutes {{PLAN}} and {{SPECS}}', () => {
    const result = substitutePlaceholders(
      'Plan body: {{PLAN}}\n\nSpecs:\n{{SPECS}}',
      { plan: 'PLAN_CONTENT', specs: 'SPECS_CONTENT' },
    );
    expect(result).toBe('Plan body: PLAN_CONTENT\n\nSpecs:\nSPECS_CONTENT');
  });

  it('replaces MULTIPLE occurrences of the same placeholder (global flag)', () => {
    // Without /g on the regex, only the first occurrence is replaced —
    // that would silently produce a template with mixed-substituted +
    // raw-placeholder content. Lock the global-replace behavior.
    const result = substitutePlaceholders(
      '{{PLAN}} appears here and also here: {{PLAN}}',
      { plan: 'REPLACED', specs: '' },
    );
    expect(result).toBe('REPLACED appears here and also here: REPLACED');
  });

  it('substitutes {{DATA_CONTEXT}} when provided (DeepSeek template)', () => {
    const result = substitutePlaceholders(
      '{{PLAN}} | {{SPECS}} | {{DATA_CONTEXT}}',
      { plan: 'A', specs: 'B', dataContext: 'C' },
    );
    expect(result).toBe('A | B | C');
  });

  it('treats omitted {{DATA_CONTEXT}} as empty string (Gemini template — placeholder absent)', () => {
    // Gemini's template doesn't have {{DATA_CONTEXT}}; this should be
    // a no-op. The function should not throw or inject anything weird.
    const result = substitutePlaceholders(
      '{{PLAN}} and {{SPECS}}',
      { plan: 'X', specs: 'Y' },
    );
    expect(result).toBe('X and Y');
  });

  it('does NOT substitute partial-match placeholders like {{PLA}} or {PLAN}', () => {
    // Only the exact {{NAME}} form is a placeholder.
    const result = substitutePlaceholders(
      'partial {PLAN} and {{PLA}} should pass through',
      { plan: 'X', specs: '' },
    );
    expect(result).toBe('partial {PLAN} and {{PLA}} should pass through');
  });

  it('treats placeholder values as literal strings (no regex / backreference interpretation)', () => {
    // If the plan content contains regex-special characters, they
    // should be inserted verbatim — not interpreted as regex.
    const result = substitutePlaceholders(
      'Plan: {{PLAN}}',
      { plan: '$1 $2 ${SHELL} \\n literal', specs: '' },
    );
    expect(result).toBe('Plan: $1 $2 ${SHELL} \\n literal');
  });
});
