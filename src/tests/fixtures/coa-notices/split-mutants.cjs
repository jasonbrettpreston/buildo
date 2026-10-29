/**
 * SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §5 (j), :238 (red runs selected by env)
 *
 * Named in-memory patches of scripts/lib/compute/load-coa-notices.js for the split-decision red runs
 * (split-decision.logic.test.ts; `COA_SPLIT_MUTANT=<name>`). Each patch is `{find, replace}` against the compute's
 * SOURCE TEXT and is applied in memory only, compiled at the real path; no file is ever written. Each one removes or
 * weakens exactly one designed part of the split, so at least its designed case goes red (Spec 08 §11.3). `throw-text` is
 * applied by T-SPLIT-D33 itself; `no-wrap` composes with it.
 */
'use strict';

module.exports = {
  // ---- the rule grammar (the pre-registered rules block) ----
  'no-range': { find: 'LIST_TOKEN: /^(\\d{1,2})(?:-(\\d{1,2}))?$/,', replace: 'LIST_TOKEN: /^(\\d{1,2})$/,' },
  'no-modify-arm': { find: 'F3_HEADER: /((?:to|and)\\s+(?:approve|refuse)', replace: 'F3_HEADER: /((?:to)\\s+(?:approve|refuse)' },
  'f3-one-digit': { find: 'F3_ITEM: /(?:^|\\s)(\\d{1,2})\\.\\s+', replace: 'F3_ITEM: /(?:^|\\s)(\\d)\\.\\s+' },
  'f2-any-head-wide': { find: 'F2_ANY: /minor\\s+variance\\s+(?:items?|numbers?)', replace: 'F2_ANY: /minor\\s+variance\\s+(?:items?|numbers?|application)' },
  'f3-refuse-loose': { find: 'F3_REFUSE: /to\\s+refuse\\s+the', replace: 'F3_REFUSE: /refuse\\s+the' },
  'lazy-list': { find: 'F1_SCAN: /variance\\s+requests?\\s+((?:\\d{1,2}(?:\\s*(?:,|&|and)\\s*)?)+)', replace: 'F1_SCAN: /variance\\s+requests?\\s+((?:\\d{1,2}(?:\\s*(?:,|&|and)\\s*)?)+?)' },
  'no-normid': { find: "const normId = (s) => s.replace(/\\s*-\\s*/g, '-').replace(/\\s+/g, '');", replace: 'const normId = (s) => s;' },
  // ---- the paragraph ----
  'no-para-end': { find: 'const end = rest.findIndex((l, i) => i > 0 && SPLIT_RX.PARA_END.test(l.text));', replace: 'const end = -1;' },
  'no-reasons-cut': { find: 'const reasons = SPLIT_RX.REASONS.exec(para);', replace: 'const reasons = null;' },
  'op-cut-at-conditions': {
    find: 'return reasons ? para.slice(0, reasons.index) : para;',
    replace: 'const op0 = reasons ? para.slice(0, reasons.index) : para; const c = /\\bconditions?\\s*:|\\bsubject\\s+to\\s+the\\s+condition/i.exec(op0); return c ? op0.slice(0, c.index) : op0;',
  },
  // ---- detection, lists, resolution ----
  'detect-on-list': { find: 'const any = all(SPLIT_RX.F2_ANY, op);', replace: 'const any = all(SPLIT_RX.F2_LIST, op).map((x) => Object.assign([x[0], x[2]], { index: x.index }));' },
  'prefix-list': { find: 'const m = SPLIT_RX.LIST_TOKEN.exec(tok.trim());\n    if (!m) return null;', replace: 'const m = SPLIT_RX.LIST_TOKEN.exec(tok.trim());\n    if (!m) { const p = /^(\\d{1,2})/.exec(tok.trim()); if (!p) return null; out.push(Number(p[1])); continue; }' },
  'first-hit': { find: 'if (hits.length !== 1) { st.unresolved++; return null; }', replace: 'if (hits.length === 0) { st.unresolved++; return null; }' },
  'f1-clause-to-end': { find: 'const tailEnd = e ? e.index : after.length;', replace: 'const tailEnd = after.length;' },
  // ---- the fail-closed guards, one half each ----
  'no-order-guard': { find: "    if (iR < iA) return out(family, 'd_order');\n", replace: '' },
  'no-class-guard': { find: "    if (!APPROVALS.has(noticeDecision)) return out(family, 'd_notice_class');\n", replace: '' },
  'no-bylaw-pending-guard': { find: "          if (!pending.length) bad = bad || 'b_bylaw_pending';\n", replace: '' },
  'no-leftover-guard': { find: "      if (pending.length) bad = bad || 'b_leftover';\n", replace: '' },
  'no-zero-guard': { find: "  if (refused.size === 0) return out(family, 'c_zero_refs');\n", replace: '' },
  'approval-anywhere': { find: 'const appr = after.slice(tailEnd);', replace: 'const appr = op;' },
  'no-approval-class-guard': { find: "    if (!APPROVALS.has(approvalClass)) return out(family, 'e_approval_class');\n", replace: '' },
  // ---- the gate #48 bump ----
  'version-revert': { find: "const EXTRACTOR_VERSION = 'coa-extractor-4';", replace: "const EXTRACTOR_VERSION = 'coa-extractor-3';" },
  // ---- placement, mapping, dedup, counter, errors, PII ----
  'no-default': { find: '    for (const item of items) item.decision = noticeDecision;\n', replace: '' },
  'raw-before-skip': { find: 'const refs = rawKept.map(splitRef);', replace: 'const refs = raw.map(splitRef);' },
  'old-signature': { find: 'i.proposed_value, i.proposed_unit, i.decision]', replace: 'i.proposed_value, i.proposed_unit]' },
  'counter-zero': { find: 'split_decisions: splitCounts,', replace: 'split_decisions: { notices: 0, refs_unresolved: 0, notices_unknown: 0 },' },
  'throw-text': {
    find: 'function splitDecision(op, raw, noticeDecision) {\n',
    replace: "function splitDecision(op, raw, noticeDecision) {\n  throw Object.assign(new Error('synth-fixture leaked notice text'), { code: 'bad code!' });\n",
  },
  'no-wrap': {
    find: '      try {\n        split = splitDecision(operativeText(block, decisionAt), refs, noticeDecision);\n      } catch (err) {\n        // D3.3: the split reads notice text; nothing of it may leave in an error.\n        throw parseError(splitCode(err), doc.doc_id, block[0].page);\n      }\n',
    replace: '      split = splitDecision(operativeText(block, decisionAt), refs, noticeDecision);\n',
  },
  'leak-paragraph': {
    find: 'split: split ? { refs_unresolved: split.refs_unresolved, unknown: split.unknown !== null } : null,',
    replace: 'split: split ? { refs_unresolved: split.refs_unresolved, unknown: split.unknown !== null, text: operativeText(block, decisionAt) } : null,',
  },
};
