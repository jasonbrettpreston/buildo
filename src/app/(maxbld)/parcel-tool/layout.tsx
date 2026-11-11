// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b.4 (Mantine CSS in @layer mantine beside Tailwind 4; Spec 33 amendment
//            2026-11-09), 11b.3 dated note 2026-11-11 (MF-44: the nested (maxbld) layout of the MaxBLD web pages, no root-layout move).
//
// MF-44 · the MaxBLD web pages' provider layout (listed in bindings.json providers): the layered library sheet, the colour-scheme script and the
// one provider module, forced dark (the S-002 search page is dark, Spec 117 §6.1). It reads nothing and gates nothing: each page gates itself first
// (require-parcel-tool-page.ts). The admin layout beside it keeps its forced light scheme (MF-37 batch C-2); nothing here is group-level.
import type { ReactNode } from 'react';
import '@mantine/core/styles.layer.css';
import { ColorSchemeScript } from '@mantine/core';
import { AdminMantineProvider } from '@/components/surfaces/web/AdminMantineProvider';

export default function MaxbldParcelToolLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ColorSchemeScript forceColorScheme="dark" />
      <AdminMantineProvider scheme="dark">{children}</AdminMantineProvider>
    </>
  );
}
