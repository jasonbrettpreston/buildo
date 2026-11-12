// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.2 and its dated note 2026-11-11 (MF-48: the mobile REPORT binding, the
//            part ref), §11b.1 dated note 2026-11-11 (Button and a plain View), §11a.7 dated note 2026-11-11 (the three approved state texts),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05 (no maths here), FE-18, FE-31, FE-32; approved mock v21.
//
// MF-48 · the mobile REPORT binding (props half). Pure: no React, no JSX. `reportProps(view, ui)` maps one v21 page view (MF-57's pageViewOf, built
// and checked by the core on the server side; never rebuilt here) and the screen-local UI state (open panels, How?) to two props trees: the page and
// the Add lot size sheet body (the host holds the sheet). It reads parts by ROLE and section by KIND, never a field name or a target name: the layout
// row decides whether the details start open (`details: expanded`, no toggles) or closed with toggles. Every shown text is a ref, never a string:
//   {"part": "<section id>.<part index>.<role>"}   one part of the view (SurfaceRenderer resolves it; a role mismatch throws);
//   {"part": "<section id>.ad.value|disclosure"}   the two shown texts of an ad section;
//   {"content": "states.lifecycle.<state>"}        an approved lifecycle text (report-presentation.json; lifecycleProps).
// A pending part shows its ruled text in its own slot with REPORT_PENDING appended last (MF-57 D-E). Nothing is skipped silently: an unknown
// section kind throws, and so does any part of the view that is neither placed nor a declared unshown role (UNSHOWN). FE-05: no numeric literal but
// 0 and 1, no arithmetic.
import { REPORT_HEX as H, REPORT_PAGE_LAYOUT as L, REPORT_PENDING } from '@/constants/reportPage';
import slice from '@/generated/surfaces/mobile_parcel_detail.json';

/** MF-48 Stage B: the generated content slice of S-001 (emit-mobile-surfaces.mjs: the approved lifecycle texts and Retry, Back), the MF-35 form. */
export const REPORT_SLICE = slice;

export type PagePart = { role: string; brief: string; kind: 'value' | 'content' | 'pending'; text: string };
export type PageAd = { field: string; slot: string; value: string; disclosure: string };
export type PageSection = { kind: string; id: string; scenario?: string; ad?: PageAd; parts: PagePart[] };
export type PageView = { target: string; layout: { details: string }; sections: PageSection[] };
export type PanelName = 'size' | 'cost';
/** Screen-local UI state (Spec 99: ephemeral, never persisted; every visit starts closed). Keyed by option section id. */
export type ReportUi = { panel: Record<string, PanelName | null>; how: Record<string, boolean> };
export type LifecycleState = 'loading' | 'miss' | 'error';
export type Ref = { part: string } | { content: string };
export type PropsNode = { component: string; props: Record<string, unknown>; children: (PropsNode | Ref)[] };

export const REPORT_UI_CLOSED: ReportUi = { panel: {}, how: {} };
const EXPANDED = 'expanded';
const DETAILS = [EXPANDED, 'collapsed']; // report-layout.json closed.details
/** Parts the v21 page does not show, by section kind and role, with when (web parity, ReportPage.tsx): the count chip while its count is pending;
 * the sheet's input error until the input exists (MF-19). */
export const UNSHOWN: Record<string, { role: string; whenPending: boolean }[]> = {
  option: [{ role: 'size.count', whenPending: true }],
  sheet: [{ role: 'error', whenPending: true }],
};

const node = (component: string, props: Record<string, unknown>, children: (PropsNode | Ref)[] = []): PropsNode => ({ component, props, children });
const isPending = (p: PagePart | undefined): boolean => p?.kind === 'pending';

/** One section's part picker: it hands out refs by role, in order, and remembers which parts were placed. */
function picker(s: PageSection) {
  const used = new Set<number>();
  const at = (role: string): number[] => s.parts.flatMap((p, i) => (p.role === role ? [i] : []));
  const ref = (i: number): Ref => ({ part: `${s.id}.${i}.${s.parts[i]!.role}` });
  const has = (role: string): boolean => at(role).length !== 0;
  const one = (role: string): number | undefined => at(role)[0];
  /** A Text node for the first part of a role (or none): the pending style appended last. A part may be shown twice (the hide label). */
  const text = (role: string, key: string, cls: string, extra: Record<string, unknown> = {}): PropsNode[] => {
    const i = one(role);
    if (i === undefined) return [];
    used.add(i);
    return [node('Text', { key, className: isPending(s.parts[i]) ? `${cls} ${REPORT_PENDING}` : cls, ...extra }, [ref(i)])];
  };
  /** Text nodes for every part of a role, in order. */
  const texts = (role: string, key: string, cls: string): PropsNode[] =>
    at(role).map((i) => {
      used.add(i);
      return node('Text', { key: `${key}-${i}`, className: isPending(s.parts[i]) ? `${cls} ${REPORT_PENDING}` : cls }, [ref(i)]);
    });
  /** Label/value rows: the k-th label with the k-th value. */
  const rows = (label: string, value: string, key: string, row: string, lc: string, vc: string, firstRow = row): PropsNode[] => {
    const vs = at(value);
    return at(label).map((li, k) => {
      used.add(li);
      const vi = vs[k];
      if (vi !== undefined) used.add(vi);
      const cell = (i: number, cls: string, tag: string): PropsNode => node('Text', { key: `${key}-${tag}-${i}`, className: isPending(s.parts[i]) ? `${cls} ${REPORT_PENDING}` : cls }, [ref(i)]);
      return node('View', { key: `${key}-${li}`, className: k === 0 ? firstRow : row }, [cell(li, lc, 'l'), ...(vi === undefined ? [] : [cell(vi, vc, 'v')])]);
    });
  };
  const mark = (role: string): void => { const i = one(role); if (i !== undefined) used.add(i); };
  /** Every part is placed or a declared unshown role, else the binding throws: a part is never dropped silently. */
  const done = (): void => {
    const skip = UNSHOWN[s.kind] ?? [];
    s.parts.forEach((p, i) => {
      if (used.has(i)) return;
      if (skip.some((u) => u.role === p.role && (!u.whenPending || isPending(p)))) return;
      throw new Error(`ReportBinding: part ${s.id}.${i}.${p.role} of a ${s.kind} section is not placed`);
    });
  };
  return { has, one, ref, text, texts, rows, mark, done, used, part: (role: string): PagePart | undefined => { const i = one(role); return i === undefined ? undefined : s.parts[i]; } };
}

const tile = (s: PageSection, P: ReturnType<typeof picker>, pre: PanelName | 'unit', wide: boolean, toggle: PropsNode[]): PropsNode =>
  node('View', { key: `${s.id}-${pre}-tile`, testID: `report-${s.id}-${pre}-tile`, className: wide ? L.tileWide : L.tile }, [
    ...P.text(`${pre}.badge`, `${s.id}-${pre}-badge`, L.badge),
    ...P.text(`${pre}.label`, `${s.id}-${pre}-label`, L.tileLabel),
    ...P.text(`${pre}.sub`, `${s.id}-${pre}-sub`, L.tileSub),
    // MF-57 D-J (operator 2026-11-11): the number and its unit are two server-formatted parts, side by side (web parity).
    node('View', { key: `${s.id}-${pre}-value-row`, className: L.tileValueRow }, [
      ...P.text(`${pre}.value`, `${s.id}-${pre}-value`, L.tileValue),
      ...P.text(`${pre}.unit`, `${s.id}-${pre}-unit`, L.tileUnitWord),
    ]),
    ...P.text(`${pre}.m2`, `${s.id}-${pre}-m2`, L.tileUnit),
    ...P.text(`${pre}.rate`, `${s.id}-${pre}-rate`, L.tileUnit),
    ...toggle,
  ]);

function option(s: PageSection, ui: ReportUi, expanded: boolean): PropsNode {
  const P = picker(s);
  const id = s.id;
  const openPanel = ui.panel[id] ?? null;
  const isOpen = (name: PanelName): boolean => expanded || openPanel === name;
  /** The tile's See details button: closed label `<pre>.button`, open label `<pre>.panel.hide`; the count chip unless its count is pending. */
  const opener = (pre: PanelName): PropsNode[] => {
    if (expanded) { P.mark(`${pre}.button`); if (pre === 'size') P.mark('size.count'); return []; } // OUTPUT fold CR MED-1: no opener, no count chip (web parity)
    const open = openPanel === pre;
    const label = open ? `${pre}.panel.hide` : `${pre}.button`;
    P.mark(open ? `${pre}.button` : `${pre}.panel.hide`); // the other label of the same opener
    const count = pre === 'size' ? P.part('size.count') : undefined;
    return [node('Button', {
      key: `${id}-${pre}-open`, testID: `report-${id}-${pre}-open`, className: open ? `${L.pill} ${L.pillOpen}` : L.pill, accessibilityRole: 'button',
      accessibilityState: { expanded: open }, onPress: { action: 'toggle_panel', option: id, panel: pre },
    }, [
      ...P.text(label, `${id}-${pre}-open-label`, L.pillText),
      ...(count && !isPending(count) ? P.text('size.count', `${id}-size-count`, L.count) : []),
    ])];
  };
  const hide = (pre: PanelName): PropsNode[] => {
    if (expanded) { P.mark(`${pre}.panel.hide`); return []; }
    return [node('Button', {
      key: `${id}-${pre}-hide`, testID: `report-${id}-${pre}-hide`, className: L.hide, accessibilityRole: 'button',
      onPress: { action: 'toggle_panel', option: id, panel: pre },
    }, P.text(`${pre}.panel.hide`, `${id}-${pre}-hide-label`, L.hideText))];
  };
  const tiles: PropsNode[] = [tile(s, P, 'size', false, opener('size')), tile(s, P, 'cost', false, opener('cost'))];
  if (P.has('unit.value')) tiles.push(tile(s, P, 'unit', true, []));
  const panels: PropsNode[] = [];
  if (isOpen('size')) panels.push(node('View', { key: `${id}-size-panel`, testID: `report-${id}-size-panel`, className: L.panel }, [
    ...P.text('size.panel.h', `${id}-size-h`, L.panelH),
    ...P.text('size.panel.why', `${id}-size-why`, L.panelP),
    ...P.text('size.panel.notes_h', `${id}-size-notes-h`, L.panelH5),
    ...P.text('size.panel.notes', `${id}-size-notes`, L.panelNotes),
    ...P.text('size.panel.all', `${id}-size-all`, L.panelH5),
    ...P.rows('size.row.label', 'size.row.value', `${id}-size-row`, L.row, L.rowLabel, L.rowValue),
    ...P.text('size.panel.ver', `${id}-size-ver`, L.panelVer),
    ...hide('size'),
  ]));
  if (isOpen('cost')) panels.push(node('View', { key: `${id}-cost-panel`, testID: `report-${id}-cost-panel`, className: L.panel }, [
    ...P.text('cost.panel.h', `${id}-cost-h`, L.panelH),
    ...P.rows('cost.row.label', 'cost.row.value', `${id}-cost-row`, L.row, L.rowLabel, L.rowValue),
    ...P.text('cost.panel.note', `${id}-cost-note`, L.panelNote),
    ...P.text('cost.panel.ver', `${id}-cost-ver`, L.panelVer),
    ...hide('cost'),
  ]));
  // A closed panel's parts are part of the view but not drawn until opened: mark them so the totality check holds for the closed tree.
  if (!isOpen('size')) for (const r of ['size.panel.h', 'size.panel.why', 'size.panel.notes_h', 'size.panel.notes', 'size.panel.all', 'size.panel.ver']) P.mark(r);
  if (!isOpen('size')) s.parts.forEach((p, i) => { if (p.role === 'size.row.label' || p.role === 'size.row.value') P.used.add(i); });
  if (!isOpen('cost')) for (const r of ['cost.panel.h', 'cost.panel.note', 'cost.panel.ver']) P.mark(r);
  if (!isOpen('cost')) s.parts.forEach((p, i) => { if (p.role === 'cost.row.label' || p.role === 'cost.row.value') P.used.add(i); });

  const howOpen = expanded || ui.how[id] === true;
  const how = P.part('bigger.how');
  const qa: PropsNode[] = [node('View', { key: `${id}-bigger`, testID: `report-${id}-bigger`, className: L.qa }, [
    ...P.text('bigger.q', `${id}-bigger-q`, L.qaQ, { role: 'header' }),
    node('View', { key: `${id}-bigger-row`, className: L.qaRow }, [
      ...P.text('bigger.answer', `${id}-bigger-answer`, L.qaAnswer),
      ...(how && !expanded ? [node('Button', {
        key: `${id}-how`, testID: `report-${id}-how`, className: howOpen ? `${L.how} ${L.pillOpen}` : L.how, accessibilityRole: 'button',
        accessibilityState: { expanded: howOpen }, onPress: { action: 'toggle_how', option: id },
      }, P.text('bigger.how', `${id}-how-label`, L.pillText))] : []),
    ]),
    ...(how && howOpen ? [node('View', { key: `${id}-how-steps`, testID: `report-${id}-how-steps` }, P.text('bigger.how.steps', `${id}-how-steps-text`, L.howSteps))] : []),
  ])];
  if (how && expanded) P.mark('bigger.how');
  if (how && !howOpen) P.mark('bigger.how.steps');
  if (P.has('nbr.q')) qa.push(node('View', { key: `${id}-nbr`, testID: `report-${id}-nbr`, className: L.qa }, [
    ...P.text('nbr.q', `${id}-nbr-q`, L.qaQ, { role: 'header' }),
    ...P.text('nbr.answer', `${id}-nbr-answer`, L.qaAnswer),
    ...(P.has('nbr.recent') ? [node('View', { key: `${id}-nbr-recent`, className: L.recent }, [
      ...P.text('nbr.recent', `${id}-nbr-recent-text`, L.recentText),
      ...P.text('nbr.swipe', `${id}-nbr-swipe`, L.swipe),
    ])] : []),
    ...P.text('nbr.projects', `${id}-nbr-projects`, L.pointer),
    ...P.text('nbr.pointer', `${id}-nbr-pointer`, L.pointer),
  ]));

  const out = node('View', { key: id, testID: `report-${id}`, className: L.option }, [
    node('View', { key: `${id}-top`, className: L.optionTop }, [
      node('View', { key: `${id}-picture`, className: L.picture }, [
        node('View', { key: `${id}-ground`, className: L.ground }),
        node('View', { key: `${id}-head`, className: L.pictureHead }, [
          ...P.text('label', `${id}-label`, L.optionLabel),
          ...P.text('title', `${id}-title`, L.optionTitle, { role: 'header' }),
        ]),
        ...P.text('tag', `${id}-tag`, L.tag),
        ...P.text('picture.caption', `${id}-caption`, L.caption),
      ]),
      ...P.text('spec_label', `${id}-spec`, L.specLabel),
      node('View', { key: `${id}-tiles`, className: L.tiles }, tiles),
      ...panels,
    ]),
    node('View', { key: `${id}-vars`, className: L.vars }, [...P.text('var_label', `${id}-var`, L.varLabel), ...qa]),
  ]);
  P.done();
  return out;
}

function section(s: PageSection, ui: ReportUi, expanded: boolean): PropsNode {
  const P = picker(s);
  let out: PropsNode;
  switch (s.kind) {
    case 'option':
      return option(s, ui, expanded);
    case 'title':
      out = node('View', { key: s.id }, P.text('title', `${s.id}-title`, L.title, { role: 'header' }));
      break;
    case 'address':
      out = node('View', { key: s.id }, P.text('address', `${s.id}-address`, L.address));
      break;
    case 'lot_size':
      out = node('View', { key: s.id, testID: `report-${s.id}`, className: L.box }, [
        ...P.text('title', `${s.id}-title`, L.boxTitle, { role: 'header' }),
        ...P.text('body', `${s.id}-body`, L.boxBody),
        node('Button', { key: `${s.id}-open`, testID: 'report-lot-size-open', className: L.boxButton, accessibilityRole: 'button', onPress: { action: 'open_sheet' } },
          P.text('button', `${s.id}-button`, L.boxButtonText)),
      ]);
      break;
    case 'ad':
      if (!s.ad) throw new Error(`ReportBinding: ad section ${s.id} has no ad`);
      out = node('View', { key: s.id, testID: `report-${s.id}`, className: L.ad, accessibilityLabel: { part: `${s.id}.ad.disclosure` } }, [
        node('Text', { key: `${s.id}-disclosure`, className: L.adLabel }, [{ part: `${s.id}.ad.disclosure` }]),
        node('Text', { key: `${s.id}-value`, className: L.adValue }, [{ part: `${s.id}.ad.value` }]),
      ]);
      break;
    case 'coming_soon':
      out = node('View', { key: s.id, testID: `report-${s.id}` }, [...P.text('heading', `${s.id}-heading`, L.h2, { role: 'header' }), node('View', { key: `${s.id}-list`, className: L.list }, P.texts('items', `${s.id}-item`, L.listItem))]);
      break;
    case 'lot_facts':
      out = node('View', { key: s.id, testID: `report-${s.id}` }, [
        ...P.text('heading', `${s.id}-heading`, L.h2, { role: 'header' }),
        node('View', { key: `${s.id}-box`, className: L.facts }, P.rows('row.label', 'row.value', `${s.id}-row`, L.factRow, L.factLabel, L.factValue, L.factRowFirst)),
      ]);
      break;
    case 'legal':
      out = node('View', { key: s.id, testID: `report-${s.id}` }, P.text('line', `${s.id}-line`, L.legal));
      break;
    case 'footer':
      out = node('View', { key: s.id, testID: `report-${s.id}`, className: L.footer }, [
        ...P.text('sources', `${s.id}-sources`, L.footerText),
        ...P.text('change', `${s.id}-change`, L.footerText),
        ...P.text('copyright', `${s.id}-copyright`, L.footerText),
      ]);
      break;
    default:
      throw new Error(`ReportBinding: unknown section kind ${s.kind} (${s.id})`);
  }
  P.done();
  return out;
}

/** The Add lot size sheet body (H0). The input is read-only and Recalculate disabled until MF-19; Cancel closes the sheet. */
function sheetBody(s: PageSection): PropsNode {
  const P = picker(s);
  const ph = P.one('input.placeholder');
  if (ph !== undefined) P.mark('input.placeholder');
  const out = node('View', { key: s.id, testID: 'report-sheet', className: L.sheet }, [
    ...P.text('title', `${s.id}-title`, L.sheetTitle, { role: 'header' }),
    ...P.text('body', `${s.id}-body`, L.sheetBody),
    node('View', { key: `${s.id}-record`, className: L.record }, [
      ...P.text('record.label', `${s.id}-record-label`, L.recordLabel),
      ...P.text('record.value', `${s.id}-record-value`, L.recordValue),
    ]),
    ...P.text('input.label', `${s.id}-input-label`, L.inputLabel),
    node('View', { key: `${s.id}-input-row`, className: L.inputRow }, [
      node('Input', {
        key: `${s.id}-input`, testID: 'report-sheet-input', className: L.input, editable: false, inputMode: 'decimal',
        accessibilityState: { disabled: true }, ...(ph === undefined ? {} : { placeholder: P.ref(ph) }),
      }),
      node('View', { key: `${s.id}-units`, className: L.units }, [
        node('Button', { key: `${s.id}-sqft`, testID: 'report-sheet-sqft', className: L.unitOn, accessibilityRole: 'radio', accessibilityState: { checked: true, disabled: true }, disabled: true },
          P.text('unit.sqft', `${s.id}-sqft-label`, L.unitOnText)),
        node('Button', { key: `${s.id}-m2`, testID: 'report-sheet-m2', className: L.unitOff, accessibilityRole: 'radio', accessibilityState: { checked: false, disabled: true }, disabled: true },
          P.text('unit.m2', `${s.id}-m2-label`, L.unitOffText)),
      ]),
    ]),
    ...P.text('note', `${s.id}-note`, L.sheetNote),
    node('Button', { key: `${s.id}-submit`, testID: 'report-sheet-submit', className: L.submit, accessibilityRole: 'button', accessibilityState: { disabled: true }, disabled: true },
      P.text('submit', `${s.id}-submit-label`, L.submitText)),
    node('Button', { key: `${s.id}-cancel`, testID: 'report-sheet-cancel', className: L.cancel, accessibilityRole: 'button', onPress: { action: 'close_sheet' } },
      P.text('cancel', `${s.id}-cancel-label`, L.cancelText)),
  ]);
  P.done();
  return out;
}

/** The page tree and the sheet body tree of one view, for the given UI state. */
export function reportProps(view: PageView, ui: ReportUi = REPORT_UI_CLOSED): { page: PropsNode; sheet: PropsNode | null } {
  if (!DETAILS.includes(view.layout.details)) throw new Error(`ReportBinding: unknown layout details ${String(view.layout.details)}`); // OUTPUT fold CR LOW-1
  const expanded = view.layout.details === EXPANDED;
  const sheets = view.sections.filter((s) => s.kind === 'sheet');
  if (sheets.length > 1) throw new Error('ReportBinding: more than one sheet section');
  const page = node('ScrollView', { key: 'report', testID: 'report-page', className: L.scroll }, [
    node('View', { key: 'report-column', className: L.column }, view.sections.filter((s) => s.kind !== 'sheet').map((s) => section(s, ui, expanded))),
  ]);
  return { page, sheet: sheets[0] ? sheetBody(sheets[0]) : null };
}

/** A lifecycle state (no page view): the approved text, never a blank or the dash; loading adds a spinner. No new copy (D-6).
 * MF-48 Stage B (operator 2026-11-12 "Ball y", B-4 b; DECISIONS L-2): the error state adds Retry, its text the approved "Try again" (the label is the
 * text, so no accessibilityLabel of its own). */
export function lifecycleProps(state: LifecycleState): PropsNode {
  return node('View', { key: 'report-lifecycle', testID: `report-${state}`, className: L.lifecycle }, [
    ...(state === 'loading' ? [node('ActivityIndicator', { key: 'spinner', testID: 'report-spinner', size: 'small', color: H.amber })] : []),
    node('Text', { key: 'message', className: L.lifecycleText, accessibilityRole: 'text' }, [{ content: `states.lifecycle.${state}` }]),
    ...(state === 'error'
      ? [node('Button', { key: 'retry', testID: 'report-retry', className: L.retry, accessibilityRole: 'button', onPress: { action: 'retry' } }, [
          node('Text', { key: 'retry-label', className: L.retryText }, [{ content: 'retry.text' }]),
        ])]
      : []),
  ]);
}

/** MF-48 Stage B (nav-by-route audit #3, review F-11): the screen's one Back control, above the page and every lifecycle state, inside the top safe
 * area. The screen decides where it goes (router.back() with history, else the Lookup route: the MF-53 rule). */
export function backProps(): PropsNode {
  return node('SafeAreaView', { key: 'report-top', className: L.top, edges: { top: 'additive' } }, [
    node('Button', { key: 'back', testID: 'report-back', className: L.back, accessibilityRole: 'button', onPress: { action: 'back' } }, [
      node('Text', { key: 'back-label', className: L.backText }, [{ content: 'back.text' }]),
    ]),
  ]);
}

/** The lifecycle content keys the host needs (report-presentation.json states.lifecycle): the screen passes their texts in. */
export const LIFECYCLE_CONTENT_KEYS = ['states.lifecycle.loading', 'states.lifecycle.miss', 'states.lifecycle.error'];
/** MF-48 Stage B: the screen's own content keys (mobile_parcel_detail.content.json): Retry and Back. */
export const SCREEN_CONTENT_KEYS = ['retry.text', 'back.text'];

/** MF-48 Stage B (D-6; Spec 99 §6.5: loading is a gate state, not data): the lot route's lookup query to the host's input. A served page shows,
 * also from the persisted cache while a refetch fails (offline); a settled lookup with no page (every lot until MB-44, a miss, a dangling id) is
 * the miss text; an error with nothing cached is the error text and Retry; anything else is loading. */
export function reportScreenState(q: { data: { page?: PageView | null } | undefined; isError: boolean }): { view: PageView | null; lifecycle: LifecycleState } {
  if (q.data?.page) return { view: q.data.page, lifecycle: 'loading' }; // the host ignores lifecycle when a view is given
  if (q.data) return { view: null, lifecycle: 'miss' };
  return { view: null, lifecycle: q.isError ? 'error' : 'loading' };
}
