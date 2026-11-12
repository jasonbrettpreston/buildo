// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b (mount file), 11b.7 W9 and dated note 2026-11-11 item 3,
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31 (a mount file imports only framework packages, binding modules and
//            project-internal paths; it holds no display text).
//
// MF-46 stage C · the MaxBLD Terms page (mount file of web_terms, archetype STATIC). Public: maxbld.ca /terms is a public host-table row rewritten here
// (src/lib/auth/host-policy.ts); it reads nothing and gates nothing (never requireParcelToolPage). Every word comes from the content file.
import type { Metadata } from 'next';
import { StaticBinding, staticWebTree } from '@/components/surfaces/web/StaticBinding';
import { staticPage, staticTitle } from '@/lib/surfaces/maxbld-static';

export const metadata: Metadata = { title: staticTitle('web_terms', 'static') };

export default function MaxbldTermsPage() {
  const { page, content } = staticPage('web_terms', 'static');
  return <StaticBinding tree={staticWebTree(page)} content={content} />;
}
