// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b (mount file), §11a.9 (dated note 2026-11-11),
//            docs/specs/02-web-admin/33_web_admin_engineering_protocol.md section 8 (an admin page gates itself first),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31.
//
// MF-19 · the admin lot-size page (mount file of admin_lot_size_revert, D-4). Gate first; the client mount holds the one FORM.
import { requireAdminPage } from '@/lib/auth/require-admin-page';
import { LotSizeRevertPageClient } from './LotSizeRevertPageClient';

export const dynamic = 'force-dynamic';

export default async function AdminLotSizePage() {
  await requireAdminPage();
  return <LotSizeRevertPageClient />;
}
