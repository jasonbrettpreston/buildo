// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b (mount file), 11b.7 W9 and dated note 2026-11-11 item 3, 11b.3 (dated note
//            2026-11-12, MF-46: the mailto role and the inbox setting), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31 (a mount
//            file imports only framework packages, binding modules and project-internal paths; it holds no display text), FE-37.
//
// MF-46 stage C · the MaxBLD Help & Support page (mount file of web_help, archetype STATIC). Public: maxbld.ca /help is a public host-table row rewritten here
// (src/lib/auth/host-policy.ts); it gates nothing (never requireParcelToolPage). Every word comes from the content file.
// Dated 2026-11-12 (MF-46 follow-up, Help & Support contact): the one server read is the support inbox (migration 314), per request so a new
// address shows at once; unset or unreadable leaves the mail links out (keepValued), never a 500. HelpPrefill adds the fragment's prefill.
import type { Metadata } from 'next';
import { StaticBinding, staticWebTree } from '@/components/surfaces/web/StaticBinding';
import { pool } from '@/lib/db/client';
import { keepValued, staticPage, staticTitle } from '@/lib/surfaces/maxbld-static';
import { readSupportInbox } from '@/lib/surfaces/maxbld-support';
import { HelpPrefill } from './HelpPrefill';

export const metadata: Metadata = { title: staticTitle('web_help', 'static') };
export const dynamic = 'force-dynamic';

export default async function MaxbldHelpPage() {
  const { page, content } = staticPage('web_help', 'static');
  const values = await readSupportInbox(pool);
  return (
    <>
      <StaticBinding tree={staticWebTree(keepValued(page, values))} content={content} values={values} />
      <HelpPrefill />
    </>
  );
}
