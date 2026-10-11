/**
 * SPEC LINK: docs/specs/01-pipeline/129_source_coa_notices.md §D5 (the shared synthetic corpus)
 *
 * SYNTHETIC notice texts — the structure copies the measured shapes of the 2017 Toronto CoA "Notice of
 * Decision" PDFs (P2-12a spike, `.cursor/mcbylaw/coa-spike/parse.mjs`); every name, address, file number
 * and value here is INVENTED. The `Owner(s):`/`Agent:` lines carry fake names on purpose: T-PII proves no
 * output field ever contains them. Each page is the `\n`-joined line text the acquisition seam's line
 * reconstruction yields.
 */
'use strict';

const FAKE_NAMES = ['JANE EXAMPLE', 'JOHN SAMPLE', 'PAT PLACEHOLDER'];

function header(fileNo, zoning, kind = 'MINOR VARIANCE/PERMISSION') {
  return [
    'Committee of Adjustment',
    'NOTICE OF DECISION',
    kind,
    '(Section 45 of the Planning Act)',
    `File Number: ${fileNo} Zoning ${zoning}`,
    `Owner(s): ${FAKE_NAMES[0]}`,
    `Agent: ${FAKE_NAMES[1]}`,
    'Property Address: 12 EXAMPLE AVE',
    'Legal Description: PLAN 0000 LOT 1',
    'Hearing Date: Thursday, July 13, 2017',
  ];
}

const decision = (text) => ['IT WAS THE DECISION OF THE COMMITTEE OF ADJUSTMENT THAT:', text];
const mailed = (d) => [`DATE DECISION MAILED ON: Wednesday, ${d}`, 'LAST DATE OF APPEAL TO THE ONTARIO MUNICIPAL BOARD: Tuesday, August 8, 2017'];

/** Notice A: approved on condition, three numbered chapter items, 569-2013. */
const NOTICE_A = [
  ...header('A0101/17EYK', 'RD - Residential Detached'),
  'PURPOSE OF THE APPLICATION:',
  'To construct a new two-storey detached dwelling.',
  'REQUESTED VARIANCE(S) TO THE ZONING BY-LAW:',
  '1. Chapter 10.20.40.10.(1)(A), By-law No. 569-2013',
  'The maximum permitted height of a building is 10 metres.',
  'The new dwelling will have a height of 10.5 metres.',
  '2. Chapter 10.20.40.70.(3), By-law No. 569-2013',
  'To permit the proposed side yard setback of 0.9 metres, whereas the By-law requires a minimum side yard setback of 1.2 metres.',
  '3. Chapter 10.20.30.40.(1), By-law No. 569-2013',
  'To permit the proposed lot coverage of 41%, whereas the By-law permits a maximum lot coverage of 33%.',
  'The Committee of Adjustment considered the written submissions relating to the application.',
  ...decision('The Minor Variance Application is Approved on Condition'),
  'The following conditions shall apply: if the conditions are not met the approval is refused.',
  ...mailed('July 19, 2017'),
];

/** Notice B: refused, one whereas item with a thousands comma and a by-law token wrapped to the next line. */
const NOTICE_B = [
  ...header('A0102/17EYK', 'RD - Residential Detached'),
  'REQUESTED VARIANCE(S) TO THE ZONING BY-LAW:',
  '1. Chapter 10.20.30.10.(1)(A), By-law No.',
  '569-2013',
  'To permit the proposed lot area of 1,150 square metres, whereas the By-law requires a minimum lot area of 1,200 square metres.',
  'SIGNATURE PAGE',
  ...decision('The Minor Variance Application is Refused'),
  ...mailed('July 20, 2017'),
];

/** Notice C: a mixed consent + minor variance notice whose B-file item is skipped (T-PARSE-k). */
const NOTICE_C = [
  ...header('A0103/17EYK', 'RD - Residential Detached', 'CONSENT AND MINOR VARIANCE/PERMISSION'),
  'REQUESTED VARIANCE(S) TO THE ZONING BY-LAW:',
  '1. Chapter 10.20.40.70.(1), By-law No. 569-2013',
  'To permit the proposed front yard setback of 4.8 metres, whereas the By-law requires a minimum front yard setback of 6 metres.',
  '2. To permit the lot created by consent application B0003/17EYK to have a lot frontage of 7.6 metres, whereas the By-law requires a minimum lot frontage of 12 metres.',
  ...decision('The Minor Variance Application is Approved'),
  ...mailed('July 19, 2017'),
];

/** A signature page repeating notice A's file number with no variance section. */
const SIGNATURE_A = [
  'NOTICE OF DECISION',
  'MINOR VARIANCE/PERMISSION',
  'File Number: A0101/17EYK Zoning RD - Residential Detached',
  'SIGNATURE PAGE',
  'Panel member',
];

/** A consent-only notice: kept as a counted not_minor_variance block. */
const CONSENT_ONLY = [
  'NOTICE OF DECISION',
  'CONSENT',
  '(Section 53 of the Planning Act)',
  'File Number: B0004/17EYK Zoning RD',
  `Owner(s): ${FAKE_NAMES[2]}`,
];

/**
 * Lay `lines` onto pages of `perPage`, adding page furniture at each page's top and bottom
 * ("Page N" header, "<file> N" footer) — the furniture the page-boundary NOISE filter removes.
 */
function paginate(lines, perPage = 30, fileNo = 'A0101/17EYK') {
  const pages = [];
  for (let i = 0, p = 1; i < lines.length; i += perPage, p++) {
    pages.push([`Page ${p}`, ...lines.slice(i, i + perPage), `${fileNo} ${p}`].join('\n'));
  }
  return pages;
}

/** A body where a value wraps onto its own line mid-page (`10` alone) — must survive (T-PARSE-f). */
const NOTICE_WRAP = [
  ...header('A0105/17EYK', 'RD - Residential Detached'),
  'REQUESTED VARIANCE(S) TO THE ZONING BY-LAW:',
  '1. Chapter 10.20.40.10.(1)(A), By-law No. 569-2013',
  'To permit the proposed building height of 11 metres, whereas the By-law permits a maximum building height of',
  '10',
  'metres.',
  ...decision('The Minor Variance Application is Approved'),
  ...mailed('July 19, 2017'),
];

function doc(overrides, lines) {
  return {
    doc_id: 'doc-a', sha256: 'a'.repeat(64), hearing_date: '2017-07-13', kind: 'committee', revision: 'original', session: 'full', panel: 'etobicoke_york',
    ...overrides,
    text_pages: paginate(lines),
  };
}

module.exports = {
  FAKE_NAMES, NOTICE_A, NOTICE_B, NOTICE_C, NOTICE_WRAP, SIGNATURE_A, CONSENT_ONLY, header, decision, mailed, paginate, doc,
};
