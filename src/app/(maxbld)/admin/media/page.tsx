// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b (mount file), docs/specs/02-web-admin/33_web_admin_engineering_protocol.md section 8
//            (dated note 2026-11-09: an admin RSC page that reads rows gates itself first), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31.
//
// MF-37 · the admin media page (mount file of admin_media). Gate first, read the list on the server, pass plain data to the client mount.
import { requireAdminPage } from '@/lib/auth/require-admin-page';
import { listMedia } from '@/lib/media/list';
import { MediaPageClient } from './MediaPageClient';

export const dynamic = 'force-dynamic';

export default async function AdminMediaPage() {
  await requireAdminPage();
  const { rows, meta } = await listMedia();
  const state = rows.length === 0 ? 'empty' : meta.partial ? 'partial' : meta.unsigned > 0 ? 'degraded' : 'hit';
  return <MediaPageClient rows={rows} state={state} />;
}
