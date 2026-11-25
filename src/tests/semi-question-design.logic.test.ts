// 🔗 SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.2 (one props golden per state per target; regenerated, never hand-edited)
// 🔗 SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (dated note 2026-11-13, SEMI-B)
//
// SRCH.SEMI stage 2 (task-319, MF-93) · the semi question page is built to the operator-approved mock (small pages v8, 2026-11-19, operator
// verbatim "Mock looks good - just the questions "Is this house one half of a semi" should extend out as far as the boxes beneath - from a width
// perspective", MORNING-DECISIONS.md:1188). Read from the COMMITTED props goldens (written by scripts/surfaces/semi-question-golden-capture.ts,
// never by hand) and from the source text of the shared files, so it needs no mobile alias. Mobile jest cases of the same page are in
// mobile/__tests__ (not run by the commit hook: UNVERIFIED unless run by hand).
//   the question heading is 18/24 bold and spans the same column as the cards (no narrower measure of its own);
//   each answer is a radio card with a dot first, no check icon, text weight 400; the chosen card has the ink dot ring;
//   Continue is 48 px, radius 12; the top bar is 56 px with a hairline and a chevron, outside the scroll column;
//   the entitlement notice has the info icon, Try again is the secondary button, loading is a status line with no spinner;
//   NO shared key moved: the lot map cards, the search button and the notices keep their classes (the shared table is byte-pinned below).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Node = { component: string; props: Record<string, any>; children: unknown[] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- golden JSON
const REPO = path.resolve(__dirname, '..', '..');
const DIR = path.join(REPO, 'src/tests/fixtures/surfaces/mobile_parcel_semi_question');
const golden = (n: string): { props: Node } => JSON.parse(fs.readFileSync(path.join(DIR, `${n}.mobile.json`), 'utf8'));
const read = (p: string): string => fs.readFileSync(path.join(REPO, p), 'utf8');
const isNode = (v: unknown): v is Node => typeof v === 'object' && v !== null && 'component' in v;
const all = (t: Node): Node[] => [t, ...t.children.filter(isNode).flatMap(all)];
const byKey = (t: Node, k: string): Node | undefined => all(t).find((n) => n.props.key === k);
const classes = (n: Node | undefined): string[] => String(n?.props.className ?? '').split(/\s+/).filter(Boolean);
const parentOf = (t: Node, child: Node): Node | undefined => all(t).find((n) => n.children.includes(child));
const ask = golden('ask').props;
const answered = golden('answered').props;
const cards = (t: Node): Node[] => all(t).filter((n) => n.props.role === 'radio');

describe('the question heading spans the cards (the one change)', () => {
  const h = byKey(ask, 'question')!;
  // Dated 2026-11-25 (task-465 McFixV2.1; RR-0485 "1 inside", finding 19, the approved mock state 7 .semi h3 26/32 bold; prior title kept: "is 18/24
  // bold ink with the full width of its column and no measure of its own").
  it('is 26/32 bold ink with the full width of its column and no measure of its own', () => {
    expect(classes(h)).toEqual(expect.arrayContaining(['w-full', 'text-[26px]', 'font-bold', 'leading-[32px]', 'text-report-ink']));
    expect(classes(h).filter((c) => /^(max-w|px|mx|ml|mr|pl|pr)-/.test(c))).toEqual([]);
  });
  it('is a child of the same column as the three cards, and that column adds no inset beyond the page gutter', () => {
    const col = parentOf(ask, h)!;
    expect(col.props.testID).toBe('parcel-semi-column');
    for (const c of cards(ask)) expect(parentOf(ask, c)).toBe(col);
    expect(classes(col)).toEqual(['w-full', 'px-4']);
  });
});

describe('the answer cards are the v8 radio cards', () => {
  it('each card keeps role radio and the checked state, with the dot View first and no icon', () => {
    expect(cards(ask)).toHaveLength(3);
    for (const c of cards(ask)) {
      expect(c.props.accessibilityState).toEqual({ checked: false });
      expect(all(c).filter((n) => n.component === 'Icon')).toEqual([]);
      const row = c.children.filter(isNode)[0]!;
      const [dot, text] = row.children.filter(isNode);
      expect(dot!.component).toBe('View');
      expect(text!.component).toBe('Text');
      // Dated 2026-11-25 (task-465, mock state 7 .ans div 15/20; prior line kept as text: text-base font-normal): the answers are 15/20, lighter.
      expect(classes(text)).toEqual(expect.arrayContaining(['text-[15px]', 'leading-[20px]', 'font-normal', 'text-report-muted']));
      expect(classes(c)).toEqual(expect.arrayContaining(['min-h-[48px]']));
    }
  });
  it('the dot is the mock ring: 22 px, 2 px field border; chosen: a 7 px ink ring and the card edge is ink', () => {
    const dot = (t: Node, id: string): Node => all(byKey(t, id)!).find((n) => String(n.props.key).includes('dot'))!;
    expect(classes(dot(ask, 'answer-yes'))).toEqual(expect.arrayContaining(['h-[22px]', 'w-[22px]', 'rounded-full', 'border-2', 'border-report-field']));
    expect(classes(dot(answered, 'answer-yes'))).toEqual(expect.arrayContaining(['h-[22px]', 'w-[22px]', 'rounded-full', 'border-[7px]', 'border-report-ink']));
    expect(classes(byKey(answered, 'answer-yes'))).toEqual(expect.arrayContaining(['border-report-ink']));
    expect(cards(answered).filter((c) => c.props.accessibilityState.checked === true)).toHaveLength(1);
  });
});

describe('task-465: the question is the focus (RR-0485 "1 inside"; the approved mock state 7)', () => {
  const px = (n: Node | undefined): number => Number(/^text-\[(\d+)px\]$/.exec(classes(n).find((c) => /^text-\[\d+px\]$/.test(c)) ?? '')?.[1] ?? NaN);
  it('the heading px is larger than every answer px (a class check; the rendered sizes are measured on the phone walk)', () => {
    const h = px(byKey(ask, 'question'));
    expect(h).toBe(26);
    for (const c of cards(ask)) {
      const [, text] = c.children.filter(isNode)[0]!.children.filter(isNode);
      expect(px(text)).toBeLessThan(h);
    }
  });
});

describe('Continue, the top bar and the states', () => {
  it('Continue is 48 px with radius 12', () => {
    expect(classes(byKey(ask, 'continue'))).toEqual(expect.arrayContaining(['min-h-[48px]', 'w-full', 'rounded-xl']));
  });
  it('the top bar is 56 px with a hairline, the first child of the screen before the scroll view, with the back chevron', () => {
    const bar = byKey(ask, 'header')!;
    expect(ask.children.filter(isNode)[0]).toBe(bar);
    expect(classes(bar)).toEqual(expect.arrayContaining(['min-h-[56px]', 'w-full', 'flex-row', 'items-center', 'border-b', 'border-report-line', 'px-4']));
    expect(ask.props.edges).toEqual({ top: 'additive' });
    expect(byKey(ask, 'back-icon')!.props.icon).toBe('ChevronLeft');
    expect(byKey(ask, 'back')!.props.accessibilityLabel).toEqual({ content: 'back.label' });
  });
  it('loading is one status line with no spinner', () => {
    const t = golden('loading').props;
    expect(all(t).filter((n) => n.component === 'ActivityIndicator')).toEqual([]);
    const line = byKey(t, 'loading-text')!;
    expect(line.props.role).toBe('status');
    expect(line.children).toEqual([{ content: 'state.loading' }]);
  });
  it('the error state has the secondary Try again, no amber', () => {
    const r = byKey(golden('error').props, 'retry')!;
    expect(r.props.variant).toBe('outline');
    expect(classes(r)).toEqual(expect.arrayContaining(['min-h-[48px]', 'bg-report-button']));
  });
  it('the entitlement notice has the neutral info icon, the rate-limit notice keeps the alert icon', () => {
    const e = all(golden('unauthorized').props).find((n) => n.component === 'Alert')!;
    expect(e.props.icon).toBe('Info');
    expect(all(golden('rate_limited').props).find((n) => n.component === 'Alert')!.props.icon).toBe('AlertTriangle');
  });
});

describe('the shared files move only by addition', () => {
  const renderer = read('mobile/src/components/surfaces/SurfaceRenderer.tsx');
  it('the shared icon table gains ChevronLeft and Info and keeps its ten names', () => {
    const line = renderer.split('\n').find((l) => l.startsWith('export const ICONS'))!;
    for (const n of ['Search', 'MapPin', 'AlertTriangle', 'RefreshCw', 'Lock', 'Ban', 'User', 'Check', 'ArrowRight', 'X', 'ChevronLeft', 'Info']) expect(line).toMatch(new RegExp(`\\b${n}\\b`));
    expect(renderer).toMatch(/import \{[^}]*\bChevronLeft\b[^}]*\bInfo\b[^}]*\} from 'lucide-react-native'/);
  });
  it('the shared layout keys the lot map and the search page read are byte-unchanged', () => {
    const lot = read('mobile/src/constants/lotMap.ts');
    expect(lot).toContain("noticeHeading: 'text-base font-semibold text-report-ink',");
    expect(lot).toContain('  card: S.card,\n  cardChecked: S.cardChecked,\n  cardRow: S.cardRow,');
    expect(lot).toContain("cardArea: 'mt-1 text-base font-semibold text-report-ink',");
    expect(lot).toContain('  select: S.select,\n  selectText: S.selectText,');
    expect(read('mobile/src/constants/parcelSearch.ts')).toContain("select: 'mt-4 min-h-[44px] w-full rounded-xl',");
  });
  it('the semi keys are their own (semi-prefixed) and the binding reads them, not the shared card, heading or select', () => {
    const lot = read('mobile/src/constants/lotMap.ts');
    // task-465: + the semi page's own question and answer keys (the wall keeps semiHeading and semiCard*).
    for (const k of ['semiTop', 'semiBack', 'semiHeading', 'semiCard', 'semiCardChecked', 'semiCardRow', 'semiDot', 'semiDotChecked', 'semiCardText', 'semiSelect', 'semiRetry', 'semiLoadingText', 'semiQuestionHeading', 'semiAnswerCard', 'semiAnswerCardChecked', 'semiAnswerText']) expect(lot).toMatch(new RegExp(`^  ${k}:`, 'm'));
    const b = read('mobile/src/components/surfaces/SemiQuestionBinding.tsx');
    for (const k of ['L.noticeHeading', 'L.card,', 'L.cardChecked', 'L.select,', 'L.cardArea']) expect(b).not.toContain(k);
  });
});
