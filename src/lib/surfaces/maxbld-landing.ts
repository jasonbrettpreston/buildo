// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.3 (web_landing, dated note 2026-11-11 MF-76), §11b.2, §11a.7 (the loading
//            state, MF-62), docs/specs/02-web-admin/128_surface_standard_policy.md §4 (dated note 2026-11-11: a STATIC page may read declared stored
//            values on the server), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05 (the server formats every value), FE-07, FE-35,
//            FE-37.
//
// MF-76 · McFrontend queue · lane E. The server half of web_landing, the MaxBLD landing on maxbld.ca / (plan ~/Buildo-scratch/mcfrontend/MF-46/plan.md
// v3 §3, §12 folds 1, 5-10, 17, §13a, §13b; operator D-1 (a), D-2 (a), D-3 (a) "3 y", D-5 (a), D-6 (a) and "include all the build scenarios").
// The page and its strings are committed files (scripts/surfaces/_schema/static-page.json pages.web_landing, web_landing.content.json); the values
// are the DECLARED reads below, each a server-formatted string (FE-05), never a typed number:
//   scenario_list, scenarios  web_landing.scenarios.json: the launch build scenario types of McBylaws increments 1-6 (the list in the operator's
//                             wording, each label once, in file order; the count of entries);
//   cost_sources              web_landing.cost-sources.json: the named sources of Spec 88 section 3 (the count of entries);
//   trial_reports, plan_reports  logic_variables parcel_tool_report_limit_trial / _plan (migration 303), through readReportLimits;
//   checked.citywide.<key>    the newest stored data_quality_snapshots row (MF-62 readCitywideRow and citywideLines, the by-law count from
//                             universe.lock.json), each line MF-62's own content template (report-presentation.json states.checked, one home).
// The two report regions are the shared renderers' inputs: the processing demo is the REPORT loading view of a `loading` tree carrying the citywide
// group only (MF-62 paced() over the app's own pace settings; the ready line names the sample's made-up address; Skip and View report lead to
// /#sample), and the sample is pageViewOf over the committed synthetic page tree (web_landing.sample.json, rebuilt by report-page-capture.ts).
// Failure: a read that throws, a missing or zero stored value, or unusable pace settings leave their parts out (logged once each), never a 500 and
// never a partial citywide group. The state is `static` with the citywide group, `degraded` without it.
// Owed (not in the page until their readers land; no typed value, no setting created here): the plan prices and the post-trial line (MF-47's
// Stripe price reader), the trial length (MF-47 parcel_tool_trial_months), the Pro allowance (MF-45), the process scene image (a media-library
// asset, operator mock pending) and the report pictures (the image URL signer, MF-44/MF-22).
import universe from '../../../scripts/seeds/bylaw/universe.lock.json';
import pages from '../../../scripts/surfaces/_schema/static-page.json';
import content from '../../../scripts/surfaces/parcel_product/F06/surfaces/web_landing.content.json';
import scenarios from '../../../scripts/surfaces/parcel_product/F06/surfaces/web_landing.scenarios.json';
import costSources from '../../../scripts/surfaces/parcel_product/F06/surfaces/web_landing.cost-sources.json';
import sample from '../../../scripts/surfaces/parcel_product/F06/surfaces/web_landing.sample.json';
import type { StaticPage, StaticReport, StaticValues } from '@/components/surfaces/web/StaticBinding';
import { readReportLimits, type Queryable } from '@/lib/entitlements';
import { logError, logWarn } from '@/lib/logger';
import { citywideLines, paced, readCitywideRow, readReportCheckPace, stepMs } from '@/lib/parcels/what-we-checked';
import type { Queryable as PaceQueryable } from '@/lib/parcels/report-check-pace';
import { buildTree, pageViewOf, viewOf, type PageView, type ReportView } from '@/lib/surfaces/report/core';
import { reportCtx } from '@/lib/surfaces/report/data';

const TAG = '[maxbld-landing]';
export const LANDING = 'web_landing';
/** The web layout row the landing draws the report regions with (the landing is a web page). */
const TARGET = 'web';
/** The sample region's anchor: Skip and View report lead here (a same-origin path; the page is maxbld.ca /). */
export const SAMPLE_HREF = '/#sample';
const SLOT = '{value}';

/** The declared server reads of the landing (the page table's `value` names plus the citywide lines). */
export const LANDING_READS = ['scenario_list', 'scenarios', 'cost_sources', 'trial_reports', 'plan_reports'] as const;

const fmt = (n: number): string => n.toLocaleString('en-CA');

/** The hero list: each scenario label once, in file order, in English list form ("a, b, and c"). */
export function scenarioList(list: ReadonlyArray<{ label: string }> = scenarios.scenarios): string {
  return new Intl.ListFormat('en', { type: 'conjunction' }).format([...new Set(list.map((s) => s.label))]);
}

/** The values read from committed files (no I/O). */
export function fileValues(): StaticValues {
  return {
    scenario_list: scenarioList(),
    scenarios: fmt(scenarios.scenarios.length),
    cost_sources: fmt(costSources.sources.length),
  };
}

type Lines = Array<{ key: string; value: string }>;
// The two Queryable shapes differ only in their generic bound (pg rows vs plain records); MF-62's readers take the same pool.
const asPace = (db: Queryable): PaceQueryable => db as unknown as PaceQueryable;

/** The citywide lines from the stored row, or [] (missing row, a missing or zero value, or a read that throws: logged, never thrown). */
export async function readCitywide(db: Queryable): Promise<Lines> {
  try {
    const row = await readCitywideRow(asPace(db));
    const lines = citywideLines(row, Number((universe as { rows: number }).rows));
    if (!lines.length) logWarn(TAG, 'no usable stored citywide row; the citywide figures and the demo are left out');
    return lines;
  } catch (err) {
    logError(TAG, err, { read: 'citywide' });
    return [];
  }
}

/** The two allowances as server text, or {} when the read throws (logged; their parts are left out). */
export async function readAllowances(db: Queryable): Promise<StaticValues> {
  try {
    const l = await readReportLimits(db);
    return { trial_reports: fmt(l.trial), plan_reports: fmt(l.plan) };
  } catch (err) {
    logError(TAG, err, { read: 'report_limits' });
    return {};
  }
}

/** The citywide figure texts: MF-62's own templates filled with the stored values (one content home). */
export function citywideTexts(lines: Lines): StaticValues {
  const tpl = reportCtx.content.states.checked.lines.citywide as Record<string, string>;
  return Object.fromEntries(lines.map((l) => [`checked.citywide.${l.key}`, String(tpl[l.key]).replace(SLOT, () => l.value)]));
}

/** The processing demo: the REPORT loading view of the citywide group (paced on the app's own settings), or undefined when they are unusable. */
export async function readDemo(db: Queryable, lines: Lines): Promise<ReportView | undefined> {
  if (!lines.length) return undefined;
  try {
    const pace = await readReportCheckPace(asPace(db));
    if ('bad' in pace) { logWarn(TAG, 'pace settings unusable; the demo is left out', { keys: pace.bad }); return undefined; }
    // MF-76 OUTPUT compliance F3 (a) (WCAG 2.2.2): the landing plays its demo only while Skip shows from the first paint.
    if (pace.skipAfterMs > 0) { logWarn(TAG, 'Skip does not show from the start; the demo is left out', { skipAfterMs: pace.skipAfterMs }); return undefined; }
    if (stepMs(lines.length, pace) < 1) { logWarn(TAG, 'pace leaves no room for the facts; the demo is left out', { facts: lines.length }); return undefined; }
    const what = paced([{ key: 'citywide', lines }], [], pace, sample.address);
    const tree = buildTree({ lifecycle: 'loading', what_we_checked: what }, reportCtx);
    return viewOf(tree, { target: TARGET, reportHref: SAMPLE_HREF }, reportCtx) as ReportView;
  } catch (err) {
    logError(TAG, err, { read: 'demo' });
    return undefined;
  }
}

/** The sample report view over the committed synthetic page tree (a defect here is a build defect: it throws to the error page). */
export function sampleView(): PageView {
  return pageViewOf(sample.rendered_tree, { target: TARGET }, reportCtx) as PageView;
}

/** The page of one state with every part whose value or view is absent left out (a section left with no parts is left out too). */
export function landingPage(state: 'static' | 'degraded', values: StaticValues, report: StaticReport): StaticPage {
  const page = (pages.pages as Record<string, Record<string, StaticPage>>)[LANDING]?.[state];
  if (!page) throw new Error(`maxbld-landing: no page for ${state}`);
  const keep = (p: StaticPage['sections'][number]['parts'][number]): boolean => {
    if (p.value !== undefined) return Object.hasOwn(values, p.value);
    if (p.role === 'checked') return Object.keys(values).some((k) => k.startsWith(`checked.${p.group}.`));
    if (p.role === 'demo' || p.role === 'picture' || p.role === 'scene') return report[p.role] !== undefined;
    return true;
  };
  return { sections: page.sections.map((s) => ({ ...s, parts: s.parts.filter(keep) })).filter((s) => s.parts.length > 0) };
}

export interface Landing { state: 'static' | 'degraded'; page: StaticPage; content: Record<string, string>; values: StaticValues; report: StaticReport }

/** The whole landing for one request. Reads never throw out of here; only a committed-file defect does. */
export async function readLanding(db: Queryable): Promise<Landing> {
  const [lines, allowances] = await Promise.all([readCitywide(db), readAllowances(db)]);
  const demo = await readDemo(db, lines);
  const values: StaticValues = { ...fileValues(), ...allowances, ...citywideTexts(lines) };
  const view = sampleView();
  // The step picture is the sample's first option picture; no image URL is issued yet (the signer is owed), so it is absent today.
  const picture = Object.values(view.images ?? {})[0];
  const report: StaticReport = { sample: view, ...(demo ? { demo } : {}), ...(picture ? { picture } : {}) };
  const state = lines.length ? 'static' : 'degraded';
  return { state, page: landingPage(state, values, report), content, values, report };
}

/** The document metadata from content: the wordmark and the tagline ("MaxBLD Lot Intelligence"); the description is the hero sub line. */
export function landingMetadata(): { title: string; description: string } {
  const c = content as Record<string, string>;
  return { title: `${c['nav.home']} ${c['hero.tagline']}`, description: String(c['hero.sub']).replace(SLOT, () => scenarioList()) };
}
