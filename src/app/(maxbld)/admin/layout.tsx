// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b (the provider), docs/specs/02-web-admin/33_web_admin_engineering_protocol.md
//            (Spec 33 amendment 2026-11-09: Mantine CSS in @layer mantine beside Tailwind 4), batch C-2.
//
// MF-37 · the admin MaxBLD provider layout (listed in bindings.json providers): the layered library sheets, the colour-scheme script, the one
// provider module (forced light for admin, COMPONENT-ALIGNMENT T6) and one Toaster. It reads nothing and gates nothing: each page gates itself
// first (requireAdminPage, Spec 33 section 8 dated note 2026-11-09).
import type { ReactNode } from 'react';
import '@mantine/core/styles.layer.css';
import 'mantine-datatable/styles.layer.css';
import { ColorSchemeScript } from '@mantine/core';
import { Toaster } from 'sonner';
import { AdminMantineProvider } from '@/components/surfaces/web/AdminMantineProvider';

export default function MaxbldAdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ColorSchemeScript forceColorScheme="light" />
      <AdminMantineProvider scheme="light">{children}</AdminMantineProvider>
      <Toaster richColors />
    </>
  );
}
