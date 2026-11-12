// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.7 W9 (Terms, Privacy: plain pages) and dated note 2026-11-11 item 3
//            (support inbox = one admin setting; Terms and Privacy drafted and validated, lawyer before launch), §11b.2 (descriptor + content),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-18 (every string from content).
//
// MF-46 stage C · the MaxBLD static pages as data (plan ~/Buildo-scratch/mcfrontend/MF-46/plan.md v3 §12 folds 16, 18, 22). The mount files import
// this module (an allowed @/lib/ path, FE-31 C-2) instead of reaching scripts/ themselves (the MF-44 maxbld-web.ts pattern). One page per surface per
// state from the page table; the strings from the surface's own content file. A missing page or state throws (fail closed, never a blank page).
import pages from '../../../scripts/surfaces/_schema/static-page.json';
import help from '../../../scripts/surfaces/parcel_product/F06/surfaces/web_help.content.json';
import terms from '../../../scripts/surfaces/parcel_product/F06/surfaces/web_terms.content.json';
import privacy from '../../../scripts/surfaces/parcel_product/F06/surfaces/web_privacy.content.json';
import maxbldError from '../../../scripts/surfaces/parcel_product/F06/surfaces/web_maxbld_error.content.json';
import landing from '../../../scripts/surfaces/parcel_product/F06/surfaces/web_landing.content.json';
import type { StaticPage, StaticPart, StaticValues } from '@/components/surfaces/web/StaticBinding';

/** The STATIC web surfaces and their content files (one per surface, beside its descriptor). */
export const STATIC_CONTENT: Readonly<Record<string, Record<string, string>>> = {
  web_help: help,
  web_terms: terms,
  web_privacy: privacy,
  web_maxbld_error: maxbldError,
  web_landing: landing, // MF-76 (dated 2026-11-11): the landing; its page is filled on the server (maxbld-landing.ts)
};

const PAGES = pages.pages as Record<string, Record<string, StaticPage>>;

/** The page and content of one surface in one state; an unknown surface or state throws. */
export function staticPage(surface: string, state: string): { page: StaticPage; content: Record<string, string> } {
  const page = PAGES[surface]?.[state];
  const content = STATIC_CONTENT[surface];
  if (!page || !content) throw new Error(`maxbld-static: no page for ${surface} ${state}`);
  return { page, content };
}

/** The document title of a page: the text of its title part (the same content key the page shows, so the key is never an orphan). */
export function staticTitle(surface: string, state: string): string {
  const { page, content } = staticPage(surface, state);
  const key = page.sections.flatMap((s) => s.parts).find((p) => p.role === 'title')?.content;
  const title = key === undefined ? undefined : content[key];
  if (title === undefined) throw new Error(`maxbld-static: no title for ${surface} ${state}`);
  return title;
}

/** MF-76's value rule, one home (dated 2026-11-12, MF-46 Help & Support contact): every part naming a server value that is absent is left out,
 * and a section left with no parts too; `keep` adds a surface's own rule for the parts that name no value (the landing's report regions). */
export function keepValued(page: StaticPage, values: StaticValues, keep: (p: StaticPart) => boolean = () => true): StaticPage {
  const kept = (p: StaticPart): boolean => (p.value === undefined ? keep(p) : Object.hasOwn(values, p.value));
  return { sections: page.sections.map((s) => ({ ...s, parts: s.parts.filter(kept) })).filter((s) => s.parts.length > 0) };
}
