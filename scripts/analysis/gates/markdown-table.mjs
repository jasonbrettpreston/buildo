// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §5 R-FA (header and separator rows are never
//            data rows), R-FB (G3/G-2 score intent-ledger tables only); docs/specs/01-pipeline/123_step_opt_assessment_validation.md §6 (G3)
//
// THE ONE markdown-table row reader for every row-counting scorer (R-FA, McDonald's Airtight V3, operator y
// 2026-10-20). A table's SEPARATOR row (`|---|:---:|`, alignment colons allowed) and its HEADER row (the `|`
// line directly above a separator) are never data rows. G3, G-2 (step-validate.mjs), the churn-table parser
// (step-validate.mjs, step-churn-complexity.mjs) and #36's defect-definition reader (registries.mjs) all read
// rows through `tableDataRows`, so no scorer can count a header, and no report gains by naming its
// disposition vocabulary in a header.
//
// R-FB (operator y 2026-10-20): inside a PH-3 section, G3 and G-2 read only INTENT-LEDGER tables (a header naming a
// Disposition column) through `ledgerTableRows`; every other table there is evidence and is not scored.

const SEPARATOR_RE = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/;

/** True for a markdown table separator row (`|---|---|`, `| :--- | ---: |`). PURE. */
export function isSeparatorRow(line) {
  const t = String(line || '').trim();
  return t.startsWith('|') && SEPARATOR_RE.test(t);
}

/**
 * Every markdown table in `text`, in order. A table is a run of `|` lines; a new table starts at a header row (the
 * `|` line directly above a separator) or, with `header: null`, at the first data row after a non-`|` line.
 * `columns` are the header's trimmed cell texts ([] when headerless); `rows` are its data rows (never a header or a
 * separator, R-FA). `line` is 1-based within `text`. PURE.
 * @param {string} text
 * @returns {Array<{header: {text: string, line: number}|null, columns: string[], rows: Array<{text: string, line: number}>}>}
 */
export function markdownTables(text) {
  const lines = String(text || '').split('\n');
  const tables = [];
  let cur = null;
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (!t.startsWith('|')) { cur = null; continue; }
    if (isSeparatorRow(t)) continue;
    if (i + 1 < lines.length && isSeparatorRow(lines[i + 1])) { // header row
      cur = { header: { text: t, line: i + 1 }, columns: t.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()), rows: [] };
      tables.push(cur);
      continue;
    }
    if (!cur) { cur = { header: null, columns: [], rows: [] }; tables.push(cur); }
    cur.rows.push({ text: t, line: i + 1 });
  }
  return tables;
}

/**
 * Every data row of every markdown table in `text`, in order: a trimmed line starting with `|` that is neither a
 * separator row nor the header row directly above one. `line` is 1-based within `text`. PURE.
 * @param {string} text
 * @returns {Array<{text: string, line: number}>}
 */
export function tableDataRows(text) {
  return markdownTables(text).flatMap((t) => t.rows);
}

/** R-FB: an intent-ledger table is one whose header names a Disposition column. PURE. */
export function isLedgerTable(table) {
  return (table.columns || []).some((c) => /disposition/i.test(c));
}

/**
 * R-FB (operator y 2026-10-20): the rows of a PH-3 section split into intent-LEDGER rows (tables whose header names
 * a Disposition column) and EVIDENCE rows (every other table: censuses, lock inventories, line accounting,
 * provenance; a headerless table is evidence). G3 scores `ledger` only; G-2 reads `ledger` only. PURE.
 * @param {string} text
 * @returns {{ledger: Array<{text: string, line: number}>, evidence: Array<{text: string, line: number}>}}
 */
export function ledgerTableRows(text) {
  const ledger = [];
  const evidence = [];
  for (const t of markdownTables(text)) (isLedgerTable(t) ? ledger : evidence).push(...t.rows);
  return { ledger, evidence };
}
