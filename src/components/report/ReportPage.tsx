// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.7 (dated note 2026-11-09, MF-14: one component, the layout table), 11a.10 (ad slots), 5.3 (client is glass),
//            docs/specs/02-web-admin/128_surface_standard_policy.md Rule 15 (same everywhere), Rule 16 (no maths), Rule 17 (honest display), R-34 (an ad is never inside a card),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05, FE-24; approved mock v21 (open-questions.md "mock v21: APPROVED", rulings 1 a and 2).
//
// MF-57 · McFrontend queue. THE v21 report page over the page view (pageViewOf). MF-19 (2026-11-11): the after-entry line section (D-5); the accessibility fold A12 on the sheet (scroll cap, alert, native radio pair). It reads parts by ROLE (scripts/surfaces/_schema/report-page.json
// `kinds`), never a field name, a target name or a number: the layout row decides whether the details panels start closed with toggles
// (`details: collapsed`) or open without them (`expanded`). Every text is a part's text as built on the server; a pending part shows the ruled
// pending text in its own slot in one muted style (data-pending). Colours are the named report-* theme colours (ruling 1 a); geometry is in
// class strings (the FE-05 lock bans number literals here). The one client island is ReportPageToggles (UI state only).
import Link from 'next/link';
import type { ReactElement } from 'react';
import type { PagePart, PageSection, PageView, ViewImage } from '../../lib/surfaces/report/core';
import { ReportPageToggles } from './ReportPageToggles';
import { Picture } from './ReportView';
import { footerNode, pickFooterText, type FooterLayout, type FooterNode, type FooterSection, type FooterText } from '../surfaces/web/footerNode';

type Part = PagePart | undefined;
// Important (trailing !): in Tailwind 4 the stylesheet order, not the class order, decides, so the slot's own type would otherwise win (design seat fold 1).
const PENDING = 'text-[14px]/[20px]! font-normal! text-report-quiet! normal-case! tracking-normal!';
const all = (s: PageSection, role: string): PagePart[] => s.parts.filter((p) => p.role === role);
const one = (s: PageSection, role: string): Part => s.parts.find((p) => p.role === role);
const pending = (p: Part): boolean => p?.kind === 'pending';

const T = ({ p, className = '', as = 'span', id }: { p: Part; className?: string; as?: 'span' | 'div' | 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'dt' | 'dd' | 'li'; id?: string }): ReactElement | null => {
  if (!p) return null;
  const Tag = as;
  return (
    <Tag id={id} data-part={p.role} data-kind={p.kind} data-pending={pending(p) ? 'true' : undefined} className={pending(p) ? `${className} ${PENDING}` : className}>
      {p.text}
    </Tag>
  );
};

const Rows = ({ s, label, value }: { s: PageSection; label: string; value: string }): ReactElement => {
  const ls = all(s, label);
  const vs = all(s, value);
  return (
    <dl className="m-0 grid">
      {ls.map((l, i) => (
        <div key={`${l.brief}-${l.role}-${l.text}`} className="flex justify-between gap-3 border-b border-report-line py-2">
          <T p={l} as="dt" className="text-[14px]/[20px] text-report-muted" />
          <T p={vs[i]} as="dd" className="m-0 text-right text-[14px]/[20px] font-semibold tabular-nums" />
        </div>
      ))}
    </dl>
  );
};

const Badge = ({ p }: { p: Part }): ReactElement | null =>
  p ? <T p={p} className="absolute -top-[11px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-report-tile px-2 py-[2px] text-[11px]/[16px] font-semibold text-report-dim shadow-[0_0_0_1px_var(--color-report-line)]" /> : null;

const PanelButton = ({ panelId, see, hide, count, open }: { panelId: string; see: Part; hide: Part; count: Part; open: boolean }): ReactElement | null => {
  if (open) return null;
  return (
    <button
      type="button" data-toggle="panel" aria-expanded="false" aria-controls={panelId} data-closed-label={see?.text} data-open-label={hide?.text}
      className="mt-[10px] inline-flex min-h-11 items-center justify-center gap-1 self-end justify-self-stretch whitespace-nowrap rounded-full border border-report-button-border bg-report-button px-2 text-[13px]/[18px] font-semibold text-report-ink aria-expanded:border-report-amber-ink aria-expanded:bg-report-amber-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-report-amber"
    >
      <span data-label>{see?.text}</span>
      {count && !pending(count) ? <span data-part={count.role} className="inline-grid h-[18px] min-w-[18px] place-items-center rounded-full bg-report-amber px-1 text-[11px]/[18px] font-bold text-report-count-ink">{count.text}</span> : null}
    </button>
  );
};

// MF-83 (FE-43, FE-36): with details_view: sheet the See details control is a ROUTE (a link to #<option>/<panel>), not a toggle; the island opens the dialog of that address.
const PanelLink = ({ route, see, count }: { route: string; see: Part; count: Part }): ReactElement => (
  <a
    href={route} data-detail="open" aria-haspopup="dialog"
    className="mt-[10px] inline-flex min-h-11 items-center justify-center gap-1 self-end justify-self-stretch whitespace-nowrap rounded-full border border-report-button-border bg-report-button px-2 text-[13px]/[18px] font-semibold text-report-ink no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-report-amber"
  >
    <span data-label>{see?.text}</span>
    {count && !pending(count) ? <span data-part={count.role} className="inline-grid h-[18px] min-w-[18px] place-items-center rounded-full bg-report-amber px-1 text-[11px]/[18px] font-bold text-report-count-ink">{count.text}</span> : null}
  </a>
);

// One detail dialog (MF-83): the existing panel parts in the existing sheet look, its own address, Back (a link to the option) closes it.
const Detail = ({ route, optionId, title, back, children }: { route: string; optionId: string; title: string; back: Part; children: ReactElement }): ReactElement => (
  <dialog data-detail="sheet" data-route={route} aria-labelledby={`${title}`} className="mx-auto mb-0 mt-auto max-h-[100dvh] overflow-y-auto w-full max-w-[430px] rounded-t-[20px] border border-b-0 border-report-outer-border bg-report-inner p-0 text-report-ink backdrop:bg-report-scrim">
    <div className="grid gap-3 px-4 pb-6 pt-3">
      <div aria-hidden="true" className="h-1 w-10 justify-self-center rounded-sm bg-report-button-border" />
      {children}
      <a href={`#${optionId}`} data-detail="close" className="grid min-h-11 place-items-center rounded-xl border border-report-line text-[15px]/[20px] font-semibold text-report-ink no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-report-amber">{back?.text}</a>
    </div>
  </dialog>
);

const Tile = ({ s, pre, panelId, open, wide = false, sheet = false }: { s: PageSection; pre: string; panelId?: string; open: boolean; wide?: boolean; sheet?: boolean }): ReactElement => (
  <div data-tile={pre} className={`relative grid content-start justify-items-center gap-[2px] rounded-xl border border-report-tile-border bg-report-tile px-3 pb-3 pt-[18px] text-center ${wide ? 'col-span-2 mt-3' : ''}`}>
    <Badge p={one(s, `${pre}.badge`)} />
    <div className="grid min-h-[38px] text-[14px]/[20px] font-semibold text-report-ink">
      <T p={one(s, `${pre}.label`)} />
      <T p={one(s, `${pre}.sub`)} className="text-[12px]/[16px] font-normal text-report-quiet" />
    </div>
    {/* D-J (operator 2026-11-11): the number and its unit are two server-formatted parts; the unit takes the smaller v21 unit style (13/18, report-dim). */}
    <div className="mt-2 text-[26px]/[30px] font-bold tracking-[-0.01em] tabular-nums">
      <T p={one(s, `${pre}.value`)} />
      {one(s, `${pre}.unit`) ? <>{' '}<T p={one(s, `${pre}.unit`)} className="text-[13px]/[18px] font-semibold tracking-normal text-report-dim" /></> : null}
    </div>
    <T p={one(s, `${pre}.m2`) ?? one(s, `${pre}.rate`)} as="div" className="text-[12px]/[16px] text-report-quiet" />
    {panelId && sheet ? <PanelLink route={`#${s.id}/${pre}`} see={one(s, `${pre}.button`)} count={one(s, `${pre}.count`)} /> : panelId ? <PanelButton panelId={panelId} see={one(s, `${pre}.button`)} hide={one(s, `${pre}.panel.hide`)} count={one(s, `${pre}.count`)} open={open} /> : null}
  </div>
);

const H5 = ({ p }: { p: Part }): ReactElement => <T p={p} as="h5" className="mb-2 mt-4 text-[13px]/[18px] font-semibold uppercase tracking-[.06em] text-report-soft" />;

const HideButton = ({ p, open }: { p: Part; open: boolean }): ReactElement | null =>
  open ? null : (
    <button type="button" data-toggle="hide" className="mb-2 mt-3 min-h-11 w-full rounded-xl border border-report-line bg-transparent text-[15px]/[20px] font-semibold text-report-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-report-amber">
      {p?.text}
    </button>
  );

const SizePanel = ({ s, id, open }: { s: PageSection; id: string; open: boolean }): ReactElement => (
  <div data-panel id={id} hidden={!open} className="mx-[2px] rounded-[14px] border border-report-tile-border bg-report-tile px-4 pb-2 pt-3">
    <T p={one(s, 'size.panel.h')} as="h4" className="my-1 text-[14px]/[20px] font-semibold text-report-muted" />
    <T p={one(s, 'size.panel.why')} as="p" className="mb-1 mt-0 text-[14px]/[20px] text-report-muted" />
    <H5 p={one(s, 'size.panel.notes_h')} />
    <T p={one(s, 'size.panel.notes')} as="p" className="m-0 text-[14px]/[20px] text-report-ink" />
    <H5 p={one(s, 'size.panel.all')} />
    <Rows s={s} label="size.row.label" value="size.row.value" />
    <T p={one(s, 'size.panel.ver')} as="p" className="mb-0 mt-[10px] text-[13px]/[18px] text-report-soft" />
    <HideButton p={one(s, 'size.panel.hide')} open={open} />
  </div>
);

const CostPanel = ({ s, id, open }: { s: PageSection; id: string; open: boolean }): ReactElement => (
  <div data-panel id={id} hidden={!open} className="mx-[2px] rounded-[14px] border border-report-tile-border bg-report-tile px-4 pb-2 pt-3">
    <T p={one(s, 'cost.panel.h')} as="h4" className="my-1 text-[14px]/[20px] font-semibold text-report-muted" />
    <Rows s={s} label="cost.row.label" value="cost.row.value" />
    <T p={one(s, 'cost.panel.note')} as="p" className="mb-2 mt-0 text-[13px]/[18px] text-report-quiet" />
    <T p={one(s, 'cost.panel.ver')} as="p" className="mb-0 mt-[10px] text-[13px]/[18px] text-report-soft" />
    <HideButton p={one(s, 'cost.panel.hide')} open={open} />
  </div>
);

const QA = ({ children, labelId }: { children: ReactElement[]; labelId: string }): ReactElement => (
  <section aria-labelledby={labelId} className="relative grid gap-[10px] rounded-xl border border-report-tile-border bg-report-tile px-[14px] pb-[14px] pt-[18px]">{children}</section>
);

// MF-83 group 2 (FE-42): the lot view, drawn from the server's coordinates (a 0..1000 frame) with no geometry of its own. The label, the one outline-state note and the one
// caption are parts; an option with no drawing part (data absent, fail closed) draws nothing. Edge classes only choose a stroke class.
const EDGE_STROKE: Record<string, string> = { front: 'stroke-report-amber-ink', side: 'stroke-report-ink', rear: 'stroke-report-muted' };
const pts = (ring: number[][]): string => ring.map((p) => p.join(',')).join(' ');
const LotView = ({ s }: { s: PageSection }): ReactElement | null => {
  const d = one(s, 'lotview.above');
  if (!d?.drawing) return null;
  const g = d.drawing;
  return (
    <figure data-lotview={g.state} className="m-0 mx-[2px] grid gap-2 rounded-[14px] border border-report-tile-border bg-report-tile p-3">
      <T p={d} as="div" className="text-[13px]/[18px] font-semibold text-report-muted" />
      <svg viewBox="0 0 1000 1000" role="img" aria-label={d.text} className="h-auto w-full">
        <polygon data-part="lotview.outline" points={pts(g.outline)} className="fill-report-card stroke-report-line" strokeWidth="4" />
        {g.envelope ? <polygon data-part="lotview.envelope" points={pts(g.envelope)} className="fill-report-amber-soft stroke-report-amber-ink" strokeWidth="4" strokeDasharray="16 10" /> : null}
        {g.footprint ? <polygon data-part="lotview.footprint" points={pts(g.footprint)} className="fill-report-sky stroke-report-ink" strokeWidth="4" /> : null}
        {g.edges.map((e, i) => <line key={i} data-edge={e.class} x1={e.line[0]![0]} y1={e.line[0]![1]} x2={e.line[1]![0]} y2={e.line[1]![1]} className={EDGE_STROKE[e.class]} strokeWidth="8" />)}
      </svg>
      <T p={one(s, 'lotview.note')} as="p" className="m-0 text-[13px]/[18px] text-report-muted" />
      <T p={one(s, 'lotview.caption')} as="p" className="m-0 text-[12px]/[16px] text-report-soft" />
    </figure>
  );
};

const Option = ({ s, open, image, sheet }: { s: PageSection; open: boolean; image: ViewImage | undefined; sheet: boolean }): ReactElement => {
  const id = (x: string): string => `${s.id}-${x}`;
  const how = one(s, 'bigger.how');
  return (
    <article id={s.id} data-section="option" data-scenario={s.scenario} aria-labelledby={id('t')} className="grid gap-[14px] rounded-[20px] border border-report-outer-border bg-report-outer p-3 shadow-report-card">
      <div className="grid gap-3 pb-[14px]">
        {/* MF-38 follow-up (operator 2026-11-11): the option's one image is the reused ReportView figure filling this box; with no signed URL yet
            (MF-44 / MF-22) nothing is drawn in it: no figure, no caption (the ruled empty state). */}
        <div data-picture className="relative h-60 overflow-hidden rounded-[14px] bg-[linear-gradient(0deg,var(--color-report-line)_0_20%,var(--color-report-sky)_20%)]">
          {image ? <Picture im={image} fill /> : null}
          <div aria-hidden="true" className="absolute inset-0 z-[1] bg-[linear-gradient(0deg,transparent_50%,var(--color-report-shade)_100%)]" />
          <div className="absolute left-4 right-4 top-[14px] z-[2]">
            <T p={one(s, 'label')} as="div" className="text-[14px]/[18px] font-bold uppercase tracking-[.1em] text-report-option-label" />
            <T p={one(s, 'title')} as="h2" id={id('t')} className="mb-0 mt-1 text-[22px]/[28px] font-bold text-report-ink [text-wrap:balance]" />
          </div>
          <T p={one(s, 'tag')} className="absolute bottom-3 left-4 z-[2] rounded-full bg-report-sky px-2 py-[2px] text-[12px]/[18px] font-semibold text-report-ink shadow-[0_0_0_1px_var(--color-report-line)]" />
        </div>
        <LotView s={s} />
        <T p={one(s, 'spec_label')} as="div" className="mx-[2px] mb-2 mt-[2px] text-[11px]/[14px] font-semibold uppercase tracking-[.08em] text-report-soft" />
        <div className="mx-[2px] grid grid-cols-[repeat(2,minmax(0,1fr))] gap-[10px] px-[2px]">
          <Tile s={s} pre="size" panelId={id('size')} open={open} sheet={sheet} />
          <Tile s={s} pre="cost" panelId={id('cost')} open={open} sheet={sheet} />
          {one(s, 'unit.value') ? <Tile s={s} pre="unit" open={open} wide /> : null}
        </div>
        {sheet ? (
          <>
            <Detail route={`#${s.id}/size`} optionId={s.id} title={id('t')} back={one(s, 'size.panel.hide')}><SizePanel s={s} id={id('size')} open /></Detail>
            <Detail route={`#${s.id}/cost`} optionId={s.id} title={id('t')} back={one(s, 'cost.panel.hide')}><CostPanel s={s} id={id('cost')} open /></Detail>
          </>
        ) : (
          <>
            <SizePanel s={s} id={id('size')} open={open} />
            <CostPanel s={s} id={id('cost')} open={open} />
          </>
        )}
      </div>
      <div className="grid gap-5 border-t border-report-outer-border px-[2px] pb-[2px] pt-4">
        <T p={one(s, 'var_label')} as="div" className="mb-1 text-[11px]/[14px] font-semibold uppercase tracking-[.08em] text-report-soft" />
        <QA labelId={id('q')}>
          <T p={one(s, 'bigger.q')} as="h3" id={id('q')} className="m-0 text-[16px]/[22px] font-bold" />
          <div className="flex items-center justify-between gap-2 text-[15px]/[22px]">
            <T p={one(s, 'bigger.answer')} />
            {how && sheet ? (
              <a href={`#${s.id}/how`} data-detail="open" aria-haspopup="dialog" className="inline-grid min-h-11 flex-none place-items-center rounded-full border border-report-button-border bg-report-button px-[18px] text-[13px]/[18px] font-semibold text-report-ink no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-report-amber">{how.text}</a>
            ) : how && !open ? (
              <button type="button" data-toggle="how" aria-expanded="false" aria-controls={id('how')} className="min-h-11 flex-none rounded-full border border-report-button-border bg-report-button px-[18px] text-[13px]/[18px] font-semibold text-report-ink aria-expanded:border-report-amber-ink aria-expanded:bg-report-amber-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-report-amber">
                {how.text}
              </button>
            ) : null}
          </div>
          {how && sheet ? <Detail route={`#${s.id}/how`} optionId={s.id} title={id('q')} back={one(s, 'size.panel.hide')}><div id={id('how')} data-how><T p={one(s, 'bigger.how.steps')} as="p" className="m-0 text-[14px]/[20px] text-report-muted" /></div></Detail> : how ? <div id={id('how')} hidden={!open} data-how><T p={one(s, 'bigger.how.steps')} as="p" className="m-0 text-[14px]/[20px] text-report-muted" /></div> : <></>}
        </QA>
        {one(s, 'nbr.q') ? (
          <QA labelId={id('n')}>
            <T p={one(s, 'nbr.q')} as="h3" id={id('n')} className="m-0 text-[16px]/[22px] font-bold" />
            <T p={one(s, 'nbr.answer')} as="div" className="text-[15px]/[22px]" />
            {one(s, 'nbr.recent') ? (
              <div className="mt-1 flex items-center justify-between border-t border-report-outer-border pt-[10px] text-[12px]/[16px] font-semibold uppercase tracking-[.05em] text-report-dim">
                <T p={one(s, 'nbr.recent')} />
                <T p={one(s, 'nbr.swipe')} className="font-normal normal-case tracking-normal text-report-quiet" />
              </div>
            ) : <></>}
            <T p={one(s, 'nbr.projects') ?? one(s, 'nbr.pointer')} as="p" className="mb-2 mt-0 text-[13px]/[18px] text-report-quiet" />
          </QA>
        ) : null}
      </div>
    </article>
  );
};

const H2 = ({ p, id }: { p: Part; id: string }): ReactElement => <T p={p} as="h2" id={id} className="mb-[10px] mt-0 text-[20px]/[26px] font-bold" />;

// MF-91 (SRCH.FOOTER, task-332; operator "this is a shared component", MORNING-DECISIONS.md:1066): the web report footer is the ONE shared footer tree
// (../surfaces/web/footerNode.ts) drawn with plain tags (the report renders without a Mantine provider). G2 sources (pending until GAP.4 task-127 binds its
// value INSIDE this footer) and G3 the by-laws change line are the page parts' own texts; the three links (G5) and the copyright (G4) are the shared
// strings the caller supplies. The mobile binding keeps its own footer (mobile/src/components/surfaces/ReportBinding.tsx): its G4 part is unchanged.
const REPORT_FOOTER_LAYOUT: FooterLayout = {
  footer: 'grid gap-2 border-t border-report-line pt-4 text-[14px]/[20px] text-report-soft', links: 'flex flex-wrap gap-x-4 gap-y-1',
  link: 'inline-flex min-h-11 items-center text-report-soft underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-report-amber', line: '', legal: '', copyright: '',
};
const renderFooter = (n: FooterNode, text: (key: string) => string): ReactElement => {
  const kids = n.children.map((c) => ('content' in c ? text(c.content) : renderFooter(c, text)));
  const p = n.props;
  const key = String(p.key);
  const cls = String(p.className);
  switch (n.component) {
    case 'Stack': return <footer key={key} data-section="footer" className={cls}>{kids}</footer>;
    case 'Group': return <div key={key} className={cls}>{kids}</div>;
    case 'Text': return <span key={key} data-pending={p.pending === true ? 'true' : undefined} className={p.pending === true ? `${cls} ${PENDING}` : cls}>{kids}</span>;
    case 'Button': return <Link key={key} href={String(p.href)} className={cls}>{kids}</Link>;
    default: throw new Error(`ReportPage footer: unmapped component "${n.component}"`);
  }
};
const ReportFooter = ({ s, footer }: { s: PageSection; footer: FooterText }): ReactElement => {
  const [g2, g3] = [one(s, 'sources'), one(s, 'change')];
  const section: FooterSection = {
    id: s.id,
    parts: [
      ...(g2 ? [{ role: 'line', content: 'sources', pending: pending(g2) }] : []),
      ...(g3 ? [{ role: 'line', content: 'change', pending: pending(g3) }] : []),
      { role: 'link', content: 'footer.terms', href: '/terms' }, { role: 'link', content: 'footer.privacy', href: '/privacy' }, { role: 'link', content: 'footer.help', href: '/help' },
      { role: 'copyright', content: 'footer.copyright' },
    ],
  };
  const texts: Record<string, string> = { ...footer, sources: g2?.text ?? '', change: g3?.text ?? '' };
  return renderFooter(footerNode(section, REPORT_FOOTER_LAYOUT, 'report'), (k) => (Object.hasOwn(texts, k) ? (texts[k] as string) : (() => { throw new Error(`ReportPage footer: unknown text key "${k}"`); })()));
};

const Section = ({ s, open, images, sheet, footer }: { s: PageSection; open: boolean; images: PageView['images']; sheet: boolean; footer: FooterText }): ReactElement | null => {
  switch (s.kind) {
    case 'title':
      return <header data-section="title"><T p={one(s, 'title')} as="h1" className="m-0 text-[28px]/[34px] font-bold tracking-[-0.02em]" /></header>;
    case 'address':
      return <div data-section="address" className="-mt-4"><T p={one(s, 'address')} as="div" className="text-[18px]/[24px] font-semibold" /></div>;
    case 'summary': {
      // MF-83 (FE-41): options at a glance. Every text is a built part (a reference to the option's own part); an item is a route link to its option (FE-36).
      const ids = [...new Set(s.parts.flatMap((p) => (p.option ? [p.option] : [])))];
      return (
        <nav data-section="summary" aria-labelledby="report-sum-t" className="grid gap-2">
          <T p={one(s, 'heading')} as="h2" id="report-sum-t" className="m-0 text-[17px]/[24px] font-semibold" />
          <ol className="m-0 grid list-none gap-2 p-0">
            {ids.map((o) => {
              const at = (role: string): Part => s.parts.find((p) => p.option === o && p.role === role);
              return (
                <li key={o}>
                  <a href={`#${o}`} data-item={o} className="grid gap-[2px] rounded-xl border border-report-line bg-report-card px-4 py-3 text-report-ink no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-report-amber">
                    <T p={at('item.label')} as="span" className="text-[12px]/[16px] font-bold uppercase tracking-[.1em] text-report-option-label" />
                    <T p={at('item.title')} as="span" className="text-[16px]/[22px] font-semibold" />
                    <span className="text-[14px]/[20px] text-report-muted">
                      <T p={at('item.max')} />{at('item.max') ? ' ' : ''}<T p={at('item.value')} className="font-semibold text-report-ink tabular-nums" />{at('item.unit') ? ' ' : ''}<T p={at('item.unit')} />
                    </span>
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>
      );
    }
    case 'option':
      return <Option s={s} open={open} image={s.scenario !== undefined ? images?.[s.scenario] : undefined} sheet={sheet} />;
    case 'lot_size':
      return (
        <section data-section="lot_size" aria-labelledby="report-ls-t" className="grid gap-[10px] rounded-[14px] bg-report-card px-6 py-4 shadow-report-card">
          <T p={one(s, 'title')} as="h2" id="report-ls-t" className="m-0 text-[17px]/[24px] font-semibold" />
          <T p={one(s, 'body')} as="p" className="m-0 text-[14px]/[20px] text-report-muted" />
          <button type="button" data-toggle="sheet" aria-haspopup="dialog" aria-controls="report-sheet" className="min-h-12 rounded-xl border-0 bg-report-amber text-[16px]/[24px] font-bold text-report-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-report-amber">
            {one(s, 'button')?.text}
          </button>
        </section>
      );
    case 'lot_size_entered':
      // MF-19 (D-5): the after-entry line, one neutral line for every viewer, in place of the box; every text is the server's or content.
      return (
        <section data-section="lot_size_entered" aria-labelledby="report-lse" className="rounded-[14px] border border-report-line px-6 py-4">
          <p id="report-lse" className="m-0 text-[14px]/[20px] text-report-muted">
            <T p={one(s, 'label')} />{' '}<T p={one(s, 'value')} className="font-semibold text-report-ink tabular-nums" />{' '}<T p={one(s, 'source')} />{' '}<T p={one(s, 'date')} /><T p={one(s, 'end')} />
            {one(s, 'recalc') ? <>{' '}<T p={one(s, 'recalc')} /></> : null}
          </p>
        </section>
      );
    case 'ad':
      return s.ad ? (
        <aside data-section="ad" aria-label={s.ad.disclosure} data-slot={s.ad.slot} data-ad-field={s.ad.field} className="grid gap-1 rounded-[14px] border border-dashed border-report-line px-6 py-4">
          <span className="text-[12px]/[16px] font-semibold uppercase tracking-[.08em] text-report-soft">{s.ad.disclosure}</span>
          <div className="text-[16px]/[24px] font-semibold">{s.ad.value}</div>
        </aside>
      ) : null;
    case 'coming_soon':
      return (
        <section data-section="coming_soon" aria-labelledby="report-soon">
          <H2 p={one(s, 'heading')} id="report-soon" />
          <ul className="m-0 grid list-none gap-2 p-0 text-report-muted">{all(s, 'items').map((p) => <T key={p.brief} p={p} as="li" />)}</ul>
        </section>
      );
    case 'lot_facts': {
      const ls = all(s, 'row.label');
      const vs = all(s, 'row.value');
      return (
        <section data-section="lot_facts" aria-labelledby="report-lot">
          <H2 p={one(s, 'heading')} id="report-lot" />
          <div className="rounded-[14px] bg-report-card px-6 py-1">
            {ls.map((l, i) => (
              <div key={l.brief} className="flex justify-between gap-3 border-t border-report-line py-3 first:border-t-0">
                <T p={l} className="text-report-muted" />
                <T p={vs[i]} className="text-right font-semibold" />
              </div>
            ))}
          </div>
        </section>
      );
    }
    case 'legal':
      return <div data-section="legal"><T p={one(s, 'line')} as="p" className="m-0 text-[14px]/[20px] text-report-muted" /></div>;
    case 'footer':
      return (
        <ReportFooter s={s} footer={footer} />
      );
    case 'sheet':
      return (
        <dialog data-section="sheet" id="report-sheet" aria-labelledby="report-sheet-t" className="mx-auto mb-0 mt-auto max-h-[100dvh] overflow-y-auto w-full max-w-[430px] rounded-t-[20px] border border-b-0 border-report-outer-border bg-report-inner p-0 text-report-ink backdrop:bg-report-scrim">
          <form method="dialog" className="m-0 grid gap-3 px-4 pb-6 pt-3">
            <div aria-hidden="true" className="h-1 w-10 justify-self-center rounded-sm bg-report-button-border" />
            <T p={one(s, 'title')} as="h2" id="report-sheet-t" className="mb-0 mt-1 text-[18px]/[24px] font-bold" />
            <T p={one(s, 'body')} as="p" className="m-0 text-[14px]/[20px] text-report-dim" />
            <div className="flex justify-between gap-3 rounded-xl border border-report-tile-border bg-report-tile px-[14px] py-3 text-[14px]/[20px]">
              <T p={one(s, 'record.label')} className="text-report-quiet" />
              <T p={one(s, 'record.value')} className="font-semibold tabular-nums" />
            </div>
            {/* MF-19 plan v3 (operator 2026-11-15, amendment "b"): the lot width (frontage) and depth, one ft / m switch; the 1st label and placeholder are the width's, the 2nd the depth's. */}
            {['width', 'depth'].map((side, i) => (
              <div key={side} className="grid gap-1">
                <label id={`report-sheet-lbl-${side}`} htmlFor={`report-sheet-in-${side}`} className="text-[14px]/[20px] font-semibold">{all(s, 'input.label')[i]?.text}</label>
                <input id={`report-sheet-in-${side}`} readOnly inputMode="decimal" autoComplete="off" placeholder={all(s, 'input.placeholder')[i]?.text} data-part="input.placeholder" aria-describedby="report-sheet-err" className="min-h-12 min-w-0 flex-1 rounded-xl border border-report-field bg-report-tile px-[14px] text-[18px]/[24px] font-semibold text-report-ink tabular-nums focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-report-amber" />
              </div>
            ))}
            {/* MF-19 A12 (WCAG 1.4.11, 4.1.2): a native radio pair (one tab stop, arrow keys, checked state from the browser); the selected segment draws a report-ink border. */}
            <div role="radiogroup" aria-labelledby="report-sheet-lbl-width report-sheet-lbl-depth" className="flex justify-self-start overflow-hidden rounded-xl border border-report-field">
              <label className="cursor-pointer">
                <input type="radio" name="report-sheet-unit" value="ft" defaultChecked className="peer sr-only" />
                <span className="flex min-h-12 min-w-14 items-center justify-center rounded-xl border border-transparent px-2 text-[14px]/[20px] font-semibold text-report-dim peer-checked:border-report-ink peer-checked:bg-report-button peer-checked:text-report-ink peer-focus-visible:outline-2 peer-focus-visible:-outline-offset-2 peer-focus-visible:outline-report-amber">{one(s, 'unit.ft')?.text}</span>
              </label>
              <label className="cursor-pointer">
                <input type="radio" name="report-sheet-unit" value="m" className="peer sr-only" />
                <span className="flex min-h-12 min-w-14 items-center justify-center rounded-xl border border-transparent px-2 text-[14px]/[20px] font-semibold text-report-dim peer-checked:border-report-ink peer-checked:bg-report-button peer-checked:text-report-ink peer-focus-visible:outline-2 peer-focus-visible:-outline-offset-2 peer-focus-visible:outline-report-amber">{one(s, 'unit.m')?.text}</span>
              </label>
            </div>
            {/* A12 (WCAG 3.3.1, 4.1.3): the refusal text the server sends is announced when it appears. */}
            <div id="report-sheet-err" role="alert" hidden><T p={one(s, 'error')} as="p" className="m-0 text-[13px]/[18px] text-report-refused" /></div>
            {/* plan v3 (Spec 128 section 4 dated note 2026-11-15): the closed role link is a text part; no href, no action until the sheet mounts the form (MF-44, MF-48). */}
            <button type="button" disabled data-part="link" className="min-h-11 justify-self-start rounded-xl border-0 bg-transparent px-0 text-left text-[14px]/[20px] font-semibold text-report-dim underline">{one(s, 'link')?.text}</button>
            <T p={one(s, 'note')} as="p" className="m-0 text-[13px]/[20px] text-report-quiet" />
            <button type="submit" disabled className="min-h-12 rounded-xl border-0 bg-report-amber text-[16px]/[24px] font-bold text-report-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-report-ink">{one(s, 'submit')?.text}</button>
            <button type="button" data-toggle="sheet-close" className="min-h-11 rounded-xl border-0 bg-transparent text-[15px]/[20px] font-semibold text-report-dim focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-report-ink">{one(s, 'cancel')?.text}</button>
          </form>
        </dialog>
      );
    default:
      return null;
  }
};

export function ReportPage({ view, footer }: { view: PageView; footer: FooterText }): ReactElement {
  pickFooterText(footer); // a missing footer string throws, never a blank (FE-18)
  const open = view.layout.details === 'expanded';
  const sheet = view.layout.details_view === 'sheet' && !open; // MF-83 (FE-43): the layout row decides; an expanded row prints every panel open
  return (
    <ReportPageToggles>
      <div data-report-page data-target={view.target} data-details={view.layout.details} className="mx-auto grid max-w-[430px] gap-6 bg-report-page px-4 pb-14 pt-4 font-sans text-[16px]/[24px] text-report-ink">
        {view.sections.map((s) => <Section key={s.id} s={s} open={open} images={view.images} sheet={sheet} footer={footer} />)}
      </div>
    </ReportPageToggles>
  );
}
