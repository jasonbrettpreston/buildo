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
// task-267 LOAD.2 + task-317 LOAD.4 (PLAN-267-v2 step 5; approved mock MOCK-LOADING-ENDINGS-v3, RR-0491; RR-0492, RR-0493, RR-0494): the loading screen.
// checkedProps draws the What we checked view the server built (whatWeChecked, the fast read) as five screens from existing kinds only: the lines
// playing (checking), the ready line and View report (ready), the centred spinner and the loading words (holding), the failure sentence and Try again
// (error), the no-report sentence and Back to search (miss). Every text is a ref: {"derived": "checked.<path>"} into the view the server sent, or an
// approved content key. A line is a node present or absent by its delay_ms against the elapsed time the host passes in (no maths but the compare).
// reportScreenState is total over the screen's stable signals and picks one of view, checking, ready, holding, error, miss.
import { REPORT_HEX as H, REPORT_PAGE_LAYOUT as L, REPORT_PENDING } from '@/constants/reportPage';
import slice from '@/generated/surfaces/mobile_parcel_detail.json';

/** MF-48 Stage B: the generated content slice of S-001 (emit-mobile-surfaces.mjs: the approved lifecycle texts and Retry, Back), the MF-35 form. */
export const REPORT_SLICE = slice;

export type PagePart = { role: string; brief: string; kind: 'value' | 'content' | 'pending' | 'ref' | 'drawing'; option?: string; ref?: string; drawing?: LotDrawing; text: string };
/** MF-83 group 2 (FE-42): the server-built lot view (a 0..1000 frame, already validated by the core); drawn as sent, never computed. */
export type LotDrawing = { state: string; outline: number[][]; edges: { class: string; line: number[][] }[]; envelope?: number[][]; footprint?: number[][] };
export type PageAd = { field: string; slot: string; value: string; disclosure: string };
export type PageSection = { kind: string; id: string; scenario?: string; ad?: PageAd; parts: PagePart[] };
export type PageView = { target: string; layout: { details: string; details_view?: string }; sections: PageSection[] };
export type PanelName = 'size' | 'cost';
/** Screen-local UI state (Spec 99: ephemeral, never persisted; every visit starts closed). Keyed by option section id. */
export type ReportUi = { panel: Record<string, PanelName | null>; how: Record<string, boolean> };
export type LifecycleState = 'loading' | 'miss' | 'error';
/** task-267: the server-built What we checked view (core ViewChecked; mobile/src/lib/schemas.ts CheckedViewSchema). */
export type CheckedLine = { key: string; text: string; verb: string; delay_ms: number; done_ms: number };
export type CheckedView = {
  summary: string; groups: { key: string; lines: CheckedLine[] }[]; dates?: { text: string; delay_ms: number }; skip: { text: string; after_ms: number };
  ready: { text: string; at_ms: number }; open: { text: string }; min_ms: number; paced: boolean; href: string | null;
};
/** task-267: what the report screen shows. `view` is the page; the other five are the loading screen and its endings. */
export type ReportScreen = 'view' | 'checking' | 'ready' | 'holding' | 'error' | 'miss';
export type Ref = { part: string } | { content: string } | { derived: string }; // task-267: + derived (the checked view and the address the host passes as data.derived)
export type PropsNode = { component: string; props: Record<string, unknown>; children: (PropsNode | Ref)[] };

export const REPORT_UI_CLOSED: ReportUi = { panel: {}, how: {} };
const EXPANDED = 'expanded';
const DETAILS = [EXPANDED, 'collapsed']; // report-layout.json closed.details
const DETAIL_VIEWS = ['inline', 'sheet']; // report-layout.json closed.details_view (MF-83, FE-43)
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

/** MF-83 (FE-43): with details_view: sheet the open panel (or the open How? steps) is returned as `detail` for the host's bottom sheet and is NOT in the page; inline keeps today's in-place path. */
const ptsOf = (ring: number[][]): string => ring.map((p) => p.join(',')).join(' ');
const EDGE_STROKE: Record<string, string> = { front: H.amberInk, side: H.ink, rear: H.muted };
/** The lot view (FE-42): label, the drawing as react-native-svg nodes, the one outline-state note and the one caption; none when the view carries no drawing part. */
function lotView(s: PageSection, P: ReturnType<typeof picker>): PropsNode[] {
  const g = P.part('lotview.above')?.drawing;
  if (!g) return [];
  const id = s.id;
  return [node('View', { key: `${id}-lotview`, testID: `report-${id}-lotview`, className: L.lotView }, [
    ...P.text('lotview.above', `${id}-lotview-label`, L.lotViewLabel),
    node('Svg', { key: `${id}-lotview-svg`, viewBox: '0 0 1000 1000', width: '100%', height: '200' }, [
      node('SvgPolygon', { key: `${id}-lv-outline`, points: ptsOf(g.outline), fill: H.card, stroke: H.line, strokeWidth: '4' }),
      ...(g.envelope ? [node('SvgPolygon', { key: `${id}-lv-envelope`, points: ptsOf(g.envelope), fill: H.amberSoft, stroke: H.amberInk, strokeWidth: '4', strokeDasharray: '16 10' })] : []),
      ...(g.footprint ? [node('SvgPolygon', { key: `${id}-lv-footprint`, points: ptsOf(g.footprint), fill: H.sky, stroke: H.ink, strokeWidth: '4' })] : []),
      ...g.edges.map((e, i) => node('SvgLine', { key: `${id}-lv-edge-${i}`, x1: String(e.line[0]![0]), y1: String(e.line[0]![1]), x2: String(e.line[1]![0]), y2: String(e.line[1]![1]), stroke: EDGE_STROKE[e.class], strokeWidth: '8' })),
    ]),
    ...P.text('lotview.note', `${id}-lotview-note`, L.lotViewNote),
    ...P.text('lotview.caption', `${id}-lotview-caption`, L.lotViewCaption),
  ])];
}

function option(s: PageSection, ui: ReportUi, expanded: boolean, sheetMode: boolean): { node: PropsNode; detail: PropsNode | null } {
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
  const steps = how && howOpen ? node('View', { key: `${id}-how-steps`, testID: `report-${id}-how-steps` }, P.text('bigger.how.steps', `${id}-how-steps-text`, L.howSteps)) : null;
  const qa: PropsNode[] = [node('View', { key: `${id}-bigger`, testID: `report-${id}-bigger`, className: L.qa }, [
    ...P.text('bigger.q', `${id}-bigger-q`, L.qaQ, { role: 'header' }),
    node('View', { key: `${id}-bigger-row`, className: L.qaRow }, [
      ...P.text('bigger.answer', `${id}-bigger-answer`, L.qaAnswer),
      ...(how && !expanded ? [node('Button', {
        key: `${id}-how`, testID: `report-${id}-how`, className: howOpen ? `${L.how} ${L.pillOpen}` : L.how, accessibilityRole: 'button',
        accessibilityState: { expanded: howOpen }, onPress: { action: 'toggle_how', option: id },
      }, P.text('bigger.how', `${id}-how-label`, L.pillText))] : []),
    ]),
    ...(steps && !sheetMode ? [steps] : []),
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
      ...lotView(s, P),
      ...P.text('spec_label', `${id}-spec`, L.specLabel),
      node('View', { key: `${id}-tiles`, className: L.tiles }, tiles),
      ...(sheetMode ? [] : panels),
    ]),
    node('View', { key: `${id}-vars`, className: L.vars }, [...P.text('var_label', `${id}-var`, L.varLabel), ...qa]),
  ]);
  P.done();
  return { node: out, detail: sheetMode ? (panels[0] ?? steps) : null };
}

function section(s: PageSection, ui: ReportUi, expanded: boolean, sheetMode: boolean, details: PropsNode[]): PropsNode {
  const P = picker(s);
  let out: PropsNode;
  switch (s.kind) {
    case 'option': {
      const o = option(s, ui, expanded, sheetMode);
      if (o.detail) details.push(o.detail);
      return o.node;
    }
    case 'title':
      out = node('View', { key: s.id }, P.text('title', `${s.id}-title`, L.title, { role: 'header' }));
      break;
    case 'address':
      out = node('View', { key: s.id }, P.text('address', `${s.id}-address`, L.address));
      break;
    case 'summary': {
      // MF-83 (FE-41): options at a glance; every text is a part ref (the option's own built part). Mobile shows text only: no jump yet (no scroll host).
      const ids = [...new Set(s.parts.flatMap((p) => (p.option === undefined ? [] : [p.option])))];
      const cell = (o: string, role: string, cls: string): PropsNode[] => {
        const i = s.parts.findIndex((p) => p.option === o && p.role === role);
        if (i < 0) return [];
        P.used.add(i);
        return [node('Text', { key: `${s.id}-${o}-${role}`, className: isPending(s.parts[i]) ? `${cls} ${REPORT_PENDING}` : cls }, [P.ref(i)])];
      };
      out = node('View', { key: s.id, testID: `report-${s.id}`, className: L.summary }, [
        ...P.text('heading', `${s.id}-heading`, L.summaryHeading, { role: 'header' }),
        ...ids.map((o) => node('View', { key: `${s.id}-${o}`, testID: `report-${s.id}-${o}`, className: L.summaryItem }, [
          ...cell(o, 'item.label', L.summaryLabel), ...cell(o, 'item.title', L.summaryTitle),
          node('View', { key: `${s.id}-${o}-size`, className: L.summarySize }, [...cell(o, 'item.max', L.summaryMax), ...cell(o, 'item.value', L.summaryValue), ...cell(o, 'item.unit', L.summaryMax)]),
        ])),
      ]);
      break;
    }
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

/** The Add lot size sheet body (H0). MF-19 plan v3 (operator 2026-11-15, amendment "b"): the lot width (frontage) and depth, one ft / m switch and the link to the
 * area form; the 1st input.label and input.placeholder are the width's, the 2nd the depth's. The inputs are read-only, Recalculate and the link are disabled
 * until the sheet mounts the form (MF-48); Cancel closes the sheet. */
function sheetBody(s: PageSection): PropsNode {
  const P = picker(s);
  const idx = (role: string): number[] => s.parts.flatMap((p, i) => (p.role === role ? [i] : []));
  const labels = idx('input.label');
  const phs = idx('input.placeholder');
  const sides = ['width', 'depth'].flatMap((side, k) => {
    const li = labels[k];
    const pi = phs[k];
    if (li !== undefined) P.used.add(li);
    if (pi !== undefined) P.used.add(pi);
    return [
      ...(li === undefined ? [] : [node('Text', { key: `${s.id}-${side}-label`, className: L.inputLabel }, [P.ref(li)])]),
      node('Input', {
        key: `${s.id}-${side}-input`, testID: `report-sheet-${side}`, className: L.input, editable: false, inputMode: 'decimal',
        accessibilityState: { disabled: true }, ...(pi === undefined ? {} : { placeholder: P.ref(pi) }),
      }),
    ];
  });
  const out = node('View', { key: s.id, testID: 'report-sheet', className: L.sheet }, [
    ...P.text('title', `${s.id}-title`, L.sheetTitle, { role: 'header' }),
    ...P.text('body', `${s.id}-body`, L.sheetBody),
    node('View', { key: `${s.id}-record`, className: L.record }, [
      ...P.text('record.label', `${s.id}-record-label`, L.recordLabel),
      ...P.text('record.value', `${s.id}-record-value`, L.recordValue),
    ]),
    ...sides,
    node('View', { key: `${s.id}-units`, className: L.units }, [
      node('Button', { key: `${s.id}-ft`, testID: 'report-sheet-ft', className: L.unitOn, accessibilityRole: 'radio', accessibilityState: { checked: true, disabled: true }, disabled: true },
        P.text('unit.ft', `${s.id}-ft-label`, L.unitOnText)),
      node('Button', { key: `${s.id}-m`, testID: 'report-sheet-m', className: L.unitOff, accessibilityRole: 'radio', accessibilityState: { checked: false, disabled: true }, disabled: true },
        P.text('unit.m', `${s.id}-m-label`, L.unitOffText)),
    ]),
    node('Button', { key: `${s.id}-link`, testID: 'report-sheet-link', className: L.cancel, accessibilityRole: 'link', accessibilityState: { disabled: true }, disabled: true },
      P.text('link', `${s.id}-link-label`, L.cancelText)),
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
export function reportProps(view: PageView, ui: ReportUi = REPORT_UI_CLOSED): { page: PropsNode; sheet: PropsNode | null; detail: PropsNode | null } {
  if (!DETAILS.includes(view.layout.details)) throw new Error(`ReportBinding: unknown layout details ${String(view.layout.details)}`); // OUTPUT fold CR LOW-1
  if (view.layout.details_view !== undefined && !DETAIL_VIEWS.includes(view.layout.details_view)) throw new Error(`ReportBinding: unknown layout details_view ${String(view.layout.details_view)}`);
  const expanded = view.layout.details === EXPANDED;
  const sheetMode = view.layout.details_view === 'sheet' && !expanded;
  const details: PropsNode[] = [];
  const sheets = view.sections.filter((s) => s.kind === 'sheet');
  if (sheets.length > 1) throw new Error('ReportBinding: more than one sheet section');
  const page = node('ScrollView', { key: 'report', testID: 'report-page', className: L.scroll }, [
    node('View', { key: 'report-column', className: L.column }, view.sections.filter((s) => s.kind !== 'sheet').map((s) => section(s, ui, expanded, sheetMode, details))),
  ]);
  return { page, sheet: sheets[0] ? sheetBody(sheets[0]) : null, detail: details[0] ?? null };
}

/** A lifecycle state (no page view): the approved text, never a blank or the dash; loading adds a spinner. No new copy (D-6).
 * MF-48 Stage B (operator 2026-11-12 "Ball y", B-4 b; DECISIONS L-2): the error state adds Retry, its text the approved "Try again" (the label is the
 * text, so no accessibilityLabel of its own). */
export function lifecycleProps(state: LifecycleState): PropsNode {
  return node('View', { key: 'report-lifecycle', testID: `report-${state}`, className: L.lifecycle }, [
    ...(state === 'loading' ? [node('ActivityIndicator', { key: 'spinner', testID: 'report-spinner', size: 'small', color: H.amber })] : []),
    node('Text', { key: 'message', className: L.lifecycleText, accessibilityRole: 'text' }, [{ content: `states.lifecycle.${state}` }]),
    ...(state === 'error' ? [retryButton()] : []),
    // task-317 LOAD.4 (RR-0490 "4 B - no report screen"; the approved mock, screen 5): the no-report state carries Back to search (the `back` action).
    ...(state === 'miss' ? [backToSearchButton()] : []),
  ]);
}

const retryButton = (): PropsNode => node('Button', { key: 'retry', testID: 'report-retry', className: L.retry, accessibilityRole: 'button', onPress: { action: 'retry' } }, [
  node('Text', { key: 'retry-label', className: L.retryText }, [{ content: 'retry.text' }]),
]);
const backToSearchButton = (): PropsNode => node('Button', { key: 'back-to-search', testID: 'report-back-to-search', className: L.retry, accessibilityRole: 'button', onPress: { action: 'back' } }, [
  node('Text', { key: 'back-to-search-label', className: L.retryText }, [{ content: 'back_to_search.text' }]),
]);

/**
 * task-267 LOAD.2 + task-317 LOAD.4: the loading screen over the server's checked view (data.derived.checked). `lineElapsedMs` is the time since the pick
 * mark (the host passes a number past every delay under Reduce Motion or after Try again: all lines at once). A line shows its verb from delay_ms and its
 * finding from done_ms; the dates line from its delay_ms. The end area is the screen's: none while checking; the ready line and View report (submit) when
 * the lines are done and the report is in; the centred spinner and the loading words while the report is still building; the failure sentence and Try again;
 * the no-report sentence and Back to search. On an ending the host stops the clock, so the lines stay as far as they got (RR-0492 item 2). No Skip (RR-0176).
 */
/** The approved mock's done-line tick (MOCK-LOADING-ENDINGS-v3 .tick: path M5 12.5 l4.5 4.5 L19 7.5), drawn with the existing Svg kinds of the REPORT table (no Icon,
 *  no new component); the stroke is the report-ok green. strokeLinecap is not passed: it is not a declared non-display key (bindings.json). */
const tick = (): PropsNode => node('Svg', { key: 'tick', viewBox: '0 0 24 24', width: '18', height: '18' }, [
  node('SvgLine', { key: 'tick-a', x1: '5', y1: '12.5', x2: '9.5', y2: '17', stroke: H.ok, strokeWidth: '2.25' }),
  node('SvgLine', { key: 'tick-b', x1: '9.5', y1: '17', x2: '19', y2: '7.5', stroke: H.ok, strokeWidth: '2.25' }),
]);

export function checkedProps(checked: CheckedView, lineElapsedMs: number, screen: Exclude<ReportScreen, 'view'>): PropsNode {
  const lines: PropsNode[] = [];
  checked.groups.forEach((g, gi) => g.lines.forEach((l, li) => {
    if (lineElapsedMs < l.delay_ms) return;
    const at = `checked.groups.${gi}.lines.${li}`;
    const done = lineElapsedMs >= l.done_ms;
    lines.push(node('View', { key: `line-${g.key}-${l.key}`, testID: `report-line-${g.key}-${l.key}`, className: L.checkLine }, done
      ? [tick(), node('Text', { key: 'text', className: L.checkText }, [{ derived: `${at}.text` }])]
      : [node('ActivityIndicator', { key: 'wait', size: 'small', color: H.amber }), node('Text', { key: 'text', className: L.checkWait }, [{ derived: `${at}.verb` }])]));
  }));
  const dates = checked.dates && lineElapsedMs >= checked.dates.delay_ms ? [node('Text', { key: 'dates', className: L.checkDates }, [{ derived: 'checked.dates.text' }])] : [];
  const end: PropsNode[] = screen === 'ready'
    ? [node('View', { key: 'end', testID: 'report-ready', className: L.checkEnd }, [
        node('Text', { key: 'ready', className: L.checkReady, accessibilityRole: 'text' }, [{ derived: 'checked.ready.text' }]),
        // submit is the existing optional action (SurfaceRenderer); here it opens the report (View report; RR-0176: no auto-open)
        node('Button', { key: 'open', testID: 'report-open', className: L.open, accessibilityRole: 'button', onPress: { action: 'submit' } }, [
          node('Text', { key: 'open-label', className: L.openText }, [{ derived: 'checked.open.text' }]),
        ]),
      ])]
    : screen === 'holding'
      ? [node('View', { key: 'end', testID: 'report-holding', className: L.checkHold }, [
          node('ActivityIndicator', { key: 'spinner', testID: 'report-spinner', size: 'small', color: H.amber }),
          node('Text', { key: 'message', className: L.checkHoldText, accessibilityRole: 'text' }, [{ content: 'states.lifecycle.loading' }]),
        ])]
      : screen === 'error' || screen === 'miss'
        ? [node('View', { key: 'end', testID: `report-${screen}`, className: L.checkEnd }, [
            node('Text', { key: 'message', className: L.checkEndText, accessibilityRole: 'text' }, [{ content: `states.lifecycle.${screen}` }]),
            screen === 'error' ? retryButton() : backToSearchButton(),
          ])]
        : [];
  return node('View', { key: 'report-checked', testID: `report-checked-${screen}`, className: L.check }, [
    node('Text', { key: 'label', className: L.checkLabel, role: 'heading' }, [{ content: 'checks.label' }]),
    node('View', { key: 'lines', className: L.checkLines }, lines),
    ...dates,
    ...end,
  ]);
}

/** MF-48 Stage B (nav-by-route audit #3, review F-11): the screen's one Back control, above the page and every lifecycle state, inside the top safe
 * area. The screen decides where it goes (router.back() with history, else the Lookup route: the MF-53 rule). */
export function backProps(title = false): PropsNode {
  return node('SafeAreaView', { key: 'report-top', className: L.top, edges: { top: 'additive' } }, [
    node('View', { key: 'report-bar', className: L.bar }, [
      node('Button', { key: 'back', testID: 'report-back', className: L.back, accessibilityRole: 'button', onPress: { action: 'back' } }, [
        node('Text', { key: 'back-label', className: L.backText }, [{ content: 'back.text' }]),
      ]),
      // task-267 (PLAN-267-v2 section 3, O6; RR-0486 "it may not be the users lot"): the bar names the lot (data.derived.address, the stored display
      // address of the answer); with no address there is no title node at all.
      ...(title ? [node('Text', { key: 'title', testID: 'report-title', className: L.barTitle, numberOfLines: 1, role: 'heading' }, [{ derived: 'address' }])] : []),
    ]),
  ]);
}

/** The lifecycle content keys the host needs (report-presentation.json states.lifecycle): the screen passes their texts in. */
export const LIFECYCLE_CONTENT_KEYS = ['states.lifecycle.loading', 'states.lifecycle.miss', 'states.lifecycle.error'];
/** MF-48 Stage B: the screen's own content keys (mobile_parcel_detail.content.json): Retry and Back. task-267: + Back to search (RR-0490 4 B) and the
 *  visible label Checks for this lot (RR-0493). */
export const SCREEN_CONTENT_KEYS = ['retry.text', 'back.text', 'back_to_search.text', 'checks.label'];

/** The screen's stable signals (Spec 99 §6.5: never isFetching). `data` is the report read's answer (the page), `checked` the fast read's view (null: no
 *  lines), `elapsedMs` the time since the pick mark, `gaveUp` the 60 s give-up, `answeredThisVisit` whether `data` was answered since this visit (or
 *  this Try again) began, `opened` whether View report was pressed, `linesFull` whether the lines are drawn in full (after Try again). */
export type ScreenSignals = {
  data: { page?: PageView | null } | undefined; checked: CheckedView | null; isError: boolean; elapsedMs: number; gaveUp: boolean;
  answeredThisVisit: boolean; opened: boolean; linesFull: boolean;
};

/** MF-48 Stage B (D-6; Spec 99 §6.5: loading is a gate state, not data). task-267 LOAD.2 + task-317 LOAD.4 (PLAN-267-v2 step 5; dated 2026-11-25, prior
 * text: a page, else a settled miss, else error or loading): total over the signals. Only the report read decides an ending, and an ending shows at once:
 * the give-up or an error (after the ruled retries) is error (RR-0492 item 3, RR-0493); this visit's answer with no page is miss (RR-0494). A page shows at
 * once with no lines (a cached or stored page, or no checked view), else after the lines are done and View report is pressed (RR-0176): checking while the
 * lines play, ready when they are done. With no page and no ending: checking while the lines play, then holding. `lifecycle` is the state of the
 * no-lines screen (lifecycleProps) and of the wall branch. A page that stays in the cache from an earlier visit is a page; a miss from one is not an answer. */
export function reportScreenState(q: ScreenSignals): { view: PageView | null; lifecycle: LifecycleState; screen: ReportScreen } {
  const page = q.data?.page ?? null;
  const linesDone = q.checked === null || q.linesFull || q.elapsedMs >= q.checked.min_ms;
  if (q.gaveUp) return { view: null, lifecycle: 'error', screen: 'error' };
  if (page && (q.checked === null || q.opened)) return { view: page, lifecycle: 'loading', screen: 'view' }; // the host ignores lifecycle when a view is given
  if (page) return { view: null, lifecycle: 'loading', screen: linesDone ? 'ready' : 'checking' };
  if (q.isError) return { view: null, lifecycle: 'error', screen: 'error' };
  if (q.data && q.answeredThisVisit) return { view: null, lifecycle: 'miss', screen: 'miss' };
  return { view: null, lifecycle: 'loading', screen: linesDone ? 'holding' : 'checking' };
}
