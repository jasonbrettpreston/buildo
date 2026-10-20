// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-FA (header and separator rows are never
//            data rows); docs/specs/01-pipeline/123_step_opt_assessment_validation.md §6 (G3)
//
// THE ONE markdown-table row reader for every row-counting scorer (R-FA, McDonald's Airtight V3, operator y
// 2026-10-20). A table's SEPARATOR row (`|---|:---:|`, alignment colons allowed) and its HEADER row (the `|`
// line directly above a separator) are never data rows. G3, G-2 (step-validate.mjs), the churn-table parser
// (step-validate.mjs, step-churn-complexity.mjs) and #36's defect-definition reader (registries.mjs) all read
// rows through `tableDataRows`, so no scorer can count a header, and no report gains by naming its
// disposition vocabulary in a header.

const SEPARATOR_RE = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/;

/** True for a markdown table separator row (`|---|---|`, `| :--- | ---: |`). PURE. */
export function isSeparatorRow(line) {
  const t = String(line || '').trim();
  return t.startsWith('|') && SEPARATOR_RE.test(t);
}

/**
 * Every data row of every markdown table in `text`, in order: a trimmed line starting with `|` that is neither a
 * separator row nor the header row directly above one. `line` is 1-based within `text`. PURE.
 * @param {string} text
 * @returns {Array<{text: string, line: number}>}
 */
export function tableDataRows(text) {
  const lines = String(text || '').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (!t.startsWith('|')) continue;
    if (isSeparatorRow(t)) continue;
    if (i + 1 < lines.length && isSeparatorRow(lines[i + 1])) continue; // header row
    out.push({ text: t, line: i + 1 });
  }
  return out;
}
