/**
 * SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §5 (j), :49 (refused wins per item)
 * SPEC LINK: decision log 2026-10-25-batch-g#CHAT-157.SPLIT-DECISION-ROUND; 2026-10-26-batch-j#CHAT-169.SPLIT-THREE-FAMILIES
 *
 * SYNTHETIC split-decision notices for split-decision.logic.test.ts. The decision-paragraph wording is built from the
 * pre-registered rule grammar, written in lower case and marked `synth-fixture`; nothing is copied from a notice
 * (Spec 129 §3 / §3.5). The VALUES (file numbers, item counts, printed ordinals, by-law ids, refused sets, classes) are
 * those of the pinned 2017 notices; every name, address and sentence is invented. The sentinel sits only in the
 * decision paragraph and the item bodies, never on the file-number or zoning line.
 */
'use strict';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS fixture beside its sibling corpus
const corpus = require('./corpus.cjs');

const S = 'synth-fixture';
const ANCHOR = 'IT WAS THE DECISION OF THE COMMITTEE OF ADJUSTMENT THAT:';

/** Item-head templates per by-law (the head shapes of corpus.cjs). */
const HEAD = {
  '569-2013': (n) => `${n}. Chapter 10.20.40.${n}0.(1), By-law No. 569-2013`,
  '438-86': (n) => `${n}. Section 6(3) Part II ${n}, By-law No. 438-86`,
  '6752': (n) => `${n}. Section 7.${n}, By-law No. 6752`,
};

/** `[[bylaw, [printed…]], …]` → the section lines (head + a synthetic body per item). */
function section(groups) {
  const out = ['REQUESTED VARIANCE(S) TO THE ZONING BY-LAW:'];
  for (const [bylaw, ns] of groups) for (const n of ns) out.push(HEAD[bylaw](n), `${S} filler ${n}.`);
  return out;
}
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => a + k);

/** One notice: header, section, the decision anchor + paragraph lines, the mailed lines (the paragraph end). */
function notice(fileNo, groups, para, { anchor = true, tail = [] } = {}) {
  return [
    ...corpus.header(fileNo, 'RD - Residential Detached'),
    ...section(groups),
    ...(anchor ? [ANCHOR] : ['synth-fixture closing text with no decision anchor.']),
    ...para,
    ...corpus.mailed('July 19, 2017'),
    ...tail,
  ];
}
const doc = (lines, over = {}) => corpus.doc(over, lines);
/** The F3 decision-paragraph item lines: `N. chapter 10.N synth-fixture filler`. */
const f3items = (ns) => ns.map((n) => `${n}. chapter 10.${n} ${S} filler`).join(' ');
/** A line the notice-decision lexicon reads as approved_with_conditions, outside every family grammar. */
const AWC_LINE = `${S} decision: approved on condition, as follows:`;

const NOTICES = {
  // ---- F1 (TEY wording) ----
  F1a: notice('A0019/17TEY', [['569-2013', range(1, 4)], ['438-86', range(1, 3)]], [
    `1. variance request 4, by-law 569-2013 and variance request 3, by-law 438-86 be refused; and 2. variance requests 1, 2 and 3, by-law 569-2013 and variance requests 1 and 2, by-law 438-86 ${S} are approved, subject to the following conditions: ${S} permit.`,
  ]),
  F1e: notice('A0019/17TEY', [['569-2013', range(1, 4)], ['438-86', range(1, 3)]], [
    `1. variance request 4, by-law 569-2013 and variance request 3, by-law 438-86 be refused; and 2. variance requests 1, 2 and 3, by-law 569-2013 and variance requests 1 and 2, by-law 438-86 ${S} are approved, subject to the following conditions: ${S} permit, failing which the ${S} approval is refused.`,
  ]),
  // asymmetric by-law spelling: the item heads read "By-law No. 569-2013", the decision paragraph "by - law 569 - 2013"
  F1b: notice('A0354/17TEY', [['569-2013', range(1, 4)], ['6752', range(1, 4)]], [
    `1. variance request 4 - by - law 569 - 2013 and variance request 1 - by - law 6752 be refused; and 2. all other variance requests ${S} filler are approved.`,
  ]),
  F1f: notice('A0383/17TEY', [['569-2013', range(1, 3)], ['438-86', range(1, 4)]], [
    `1. variance request 2, by-law 569-2013 and variance requests 2 and 4, by-law 438-86 ${S} filler be refused; and 2. all other ${S} requests are approved, subject to the following condition: ${S} permit.`,
  ]),
  F1c: notice('A0172/17TEY', [['569-2013', range(1, 6)], ['6752', range(1, 4)]], [
    `(A) the variance requests ${S} are refused, as follows: 3. Chapter 10.20.40.30.(1), By-law No. 569-2013; 1. Section 7.1, By-law No. 6752; 6. Chapter 10.20.40.60.(1), By-law No. 569-2013`,
    `(B) ${S} items under by-law 596-2013 and by-law 6725, ${S} amended items are approved, together with ${S} amendments: ${S}.`,
  ]),
  F1d: notice('A1294/16TEY', [['569-2013', range(1, 9)]], [
    `1. variance request 3, by-law 569-2013 be refused; and 2. all other variance requests ${S} are approved on condition: ${S}.`,
  ]),
  F1g: notice('A9101/17TEY', [['569-2013', range(1, 5)]], [
    'the minor variance application is approved on condition:',
    `1. ${S} condition, failing which variance request 2 is refused ${S}.`,
  ]),
  // ---- F2 (EYK / SC wording) ----
  F2a: notice('A0127/17SC', [['569-2013', range(1, 8)]], [
    `minor variance items 1 & 4-8 are approved ${S}.`,
    `minor variance items 2 & 3 are refused ${S}.`,
  ]),
  F2b: notice('A0332/17SC', [['569-2013', range(1, 7)]], [
    `minor variance items 1 through 6 are approved on condition ${S}.`,
    `minor variance item 7 is refused ${S}.`,
  ]),
  F2c: notice('A9102/17SC', [['569-2013', range(1, 10)]], [
    `minor variance items 1-5 & 7-10 are approved ${S}.`,
    `minor variance item 6 is refused ${S}.`,
  ]),
  F2d: notice('A9103/17SC', [['569-2013', range(1, 10)]], [
    `minor variance items 1-5 & 9-10 are approved ${S}.`,
    `minor variance items 6 through 8 are refused ${S}.`,
  ]),
  F2e: notice('A9104/17SC', [['569-2013', range(1, 5)]], [
    'the minor variance application is approved on condition:',
    `1. ${S} condition, failing which minor variance item 2 is refused ${S}.`,
  ]),
  F2g: notice('A9105/17SC', [['569-2013', range(1, 5)]], [
    'minor variance items 1-5 are approved on condition:',
    `1. ${S} condition, failing which minor variance item 2 is refused ${S}.`,
  ]),
  // ---- F3 (NY wording) ----
  F3a: notice('A0948/17NY', [['569-2013', range(1, 3)]], [
    AWC_LINE,
    `to approve the following variance(s): ${f3items([1, 2])}`,
    `to refuse the following variance(s): ${f3items([3])}`,
    `for the following reasons: ${S}`,
  ]),
  F3b: notice('A0931/17NY', [['569-2013', range(1, 10)]], [
    AWC_LINE,
    `to approve the following variance(s): ${f3items([1, 3, 4, 5, 7, 9, 10])}`,
    `to modify and approve the following variance(s): ${f3items([6])}`,
    `to refuse the following variance(s): ${f3items([2, 8])}`,
    `for the following reasons: ${S}`,
  ]),
  F3c: notice('A0749/17NY', [['569-2013', range(1, 17)]], [
    AWC_LINE,
    `to approve the following variance(s): ${f3items([1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 15, 16, 17])}`,
    `to refuse the following variance(s): ${f3items([3, 4, 13, 14])}`,
    `for the following reasons: ${S}`,
  ]),
  F3d: notice('A0931/17NY', [['569-2013', range(1, 10)]], [
    AWC_LINE,
    `to approve the following variance(s): ${f3items([1, 3, 4, 5, 7, 9, 10])}`,
    `to refuse the following variance(s): ${f3items([2, 8])}`,
    `to modify and approve the following variance(s): ${f3items([6])}`,
    `for the following reasons: ${S}`,
  ]),
  F3e: notice('A9106/17NY', [['569-2013', range(1, 3)]], [
    AWC_LINE,
    `to approve the following variance(s): ${f3items([1, 2, 3])}`,
    `subject to the condition that the ${S} officer may refuse the following variance ${S} if unmet.`,
    `for the following reasons: ${S}`,
  ]),
  F3g: notice('A9107/17NY', [['569-2013', range(1, 3)]], [
    AWC_LINE,
    `to approve the following variance(s): ${f3items([1, 2, 3])}`,
    `subject to the condition that, if unmet, the committee is to refuse the following variance(s): 2. chapter ${S}`,
    `for the following reasons: ${S}`,
  ]),
  // ---- the paragraph cuts ----
  cutReasons: notice('A9108/17SC', [['569-2013', range(1, 5)]], [
    `minor variance items 1, 2, 4 & 5 are approved ${S}.`,
    `minor variance item 3 is refused ${S}.`,
    `the reasons for the decision: ${S} minor variance item 5 is refused ${S} wording.`,
  ]),
  cutParaEnd: notice('A9109/17SC', [['569-2013', range(1, 5)]], [
    `minor variance items 1, 2, 4 & 5 are approved ${S}.`,
    `minor variance item 3 is refused ${S}.`,
  ], { tail: [`minor variance item 5 is refused ${S}.`] }),
  // ---- fail closed ----
  failA1: notice('A9110/17SC', [['569-2013', range(1, 5)]], [
    `minor variance items 1-4 are approved ${S}.`,
    `minor variance item 9 is refused ${S}.`,
  ]),
  failA2: notice('A9111/17SC', [['569-2013', [1, 2, 3, 4, 4]]], [
    `minor variance items 1-3 are approved ${S}.`,
    `minor variance item 4 is refused ${S}.`,
  ]),
  failB1: notice('A9112/17SC', [['569-2013', range(1, 5)]], [
    `minor variance items 1 & 2 are approved ${S}.`,
    `minor variance items 3 to 5 are refused ${S}.`,
  ]),
  failB1t: notice('A9113/17SC', [['569-2013', range(1, 5)]], [
    `minor variance items 1, 2 & 4 are approved ${S}.`,
    `minor variance items 3 through are refused ${S}.`,
  ]),
  failB2: notice('A9114/17SC', [['569-2013', range(1, 5)]], [
    `minor variance items 2-5 are approved ${S}.`,
    `minor variance item 1- is refused ${S}.`,
  ]),
  failB3: notice('A9115/17TEY', [['569-2013', range(1, 4)], ['438-86', range(1, 4)]], [
    `1. variance request 4 - by-law 569-2013 and the ${S} item of by-law 438-86 be refused; and 2. all other variance requests ${S} filler are approved.`,
  ]),
  failB4: notice('A9116/17TEY', [['569-2013', range(1, 4)], ['438-86', range(1, 4)]], [
    `1. variance request 4 - by-law 569-2013 and variance request 3 ${S} be refused; and 2. all other variance requests ${S} filler are approved.`,
  ]),
  failC: notice('A9117/17TEY', [['569-2013', range(1, 5)]], [
    `1. the variance requests ${S} be refused; and 2. all other ${S} requests are approved.`,
  ]),
  failD1: notice('A9118/17SC', [['569-2013', range(1, 5)]], [
    `${S} decision: approved, as follows:`,
    `minor variance item 3 is refused ${S}.`,
    `minor variance items 1, 2, 4 & 5 are approved ${S}.`,
  ]),
  failD2: notice('A9119/17SC', [['569-2013', range(1, 5)]], [
    `${S} line one.`, `${S} line two.`, `${S} line three.`,
    `minor variance items 1, 2, 4 & 5 are approved ${S}.`,
    `minor variance item 3 is refused ${S}.`,
  ]),
  failE1: notice('A9120/17TEY', [['569-2013', range(1, 4)], ['438-86', range(1, 4)]], [
    `1. all ${S} requests are approved except: 2. variance request 4 - by-law 569-2013 be refused.`,
  ]),
  failE2: notice('A9121/17TEY', [['569-2013', range(1, 4)], ['438-86', range(1, 4)]], [
    `1. variance request 4 - by-law 569-2013 be refused; and 2. ${S} others are approved not approved.`,
  ]),
  // ---- mapping, dedup ----
  consent: [
    ...corpus.header('A9122/17SC', 'RD - Residential Detached', 'CONSENT AND MINOR VARIANCE/PERMISSION'),
    'REQUESTED VARIANCE(S) TO THE ZONING BY-LAW:',
    HEAD['569-2013'](1), `${S} filler 1.`,
    `2. To permit the lot created by consent application B0003/17SC ${S} filler.`,
    HEAD['569-2013'](3), `${S} filler 3.`,
    HEAD['569-2013'](4), `${S} filler 4.`,
    ANCHOR,
    `minor variance items 1 & 4 are approved ${S}.`,
    `minor variance item 3 is refused ${S}.`,
    ...corpus.mailed('July 19, 2017'),
  ],
  dedupOther: notice('A0127/17SC', [['569-2013', range(1, 8)]], [
    `minor variance items 1, 3 & 4-8 are approved ${S}.`,
    `minor variance item 2 is refused ${S}.`,
  ]),
  // ---- survive-the-fix (green both) ----
  G1: notice('A0144/17SC', [['569-2013', range(1, 4)]], [`the minor variance application is refused ${S}.`]),
  G2: notice('A0271/17TEY', [['569-2013', range(1, 3)]], [
    `the minor variance application is approved on condition ${S}.`,
    `the minor variance application is refused ${S}.`,
  ]),
  G3: notice('A0978/16TEY', [['569-2013', range(1, 3)]], [`the minor varience application is refused ${S}.`]),
  G5: notice('A9123/17SC', [['569-2013', range(1, 3)]], [
    `the minor variance application is approved ${S}.`,
    `${S} condition: ${S} refuse storage condition.`,
  ]),
  G7: notice('A0508/17EYK', [['569-2013', range(1, 4)]], [`${S} text.`], { anchor: false }),
};

module.exports = { S, NOTICES, doc, notice, section, range, f3items, HEAD, ANCHOR };
