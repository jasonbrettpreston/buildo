// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b (mount file), 11b.3 (web_landing, dated note 2026-11-11 MF-76), 11b.7 W1,
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31 (a mount file imports only framework packages, binding modules and
//            project-internal paths; it holds no display text), FE-37 (the declared server reads of a STATIC page).
//
// MF-76 · the MaxBLD landing (mount file of web_landing, archetype STATIC). Public: maxbld.ca / is the public host-table row rewritten here
// (src/lib/auth/host-policy.ts); it gates nothing (never requireParcelToolPage) and sets no cookie. The values are read on the server for each
// request (src/lib/surfaces/maxbld-landing.ts); a read that fails leaves its part out, never a 500. Every word comes from the content file.
import type { Metadata } from 'next';
import { StaticBinding, staticWebTree } from '@/components/surfaces/web/StaticBinding';
import { pool } from '@/lib/db/client';
import { landingMetadata, readLanding } from '@/lib/surfaces/maxbld-landing';

// Read per request: the stored counts and the allowances change without a deploy. (Time-based caching waits on a landing setting, plan v3 §12
// fold 17; no setting is created by this row.)
export const dynamic = 'force-dynamic';

export const metadata: Metadata = landingMetadata();

export default async function MaxbldLandingPage() {
  const { page, content, values, report } = await readLanding(pool);
  return <StaticBinding tree={staticWebTree(page)} content={content} values={values} report={report} />;
}
