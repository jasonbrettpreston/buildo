'use client';
// SPEC LINK: docs/specs/00-architecture/117_maxbld_brand.md section 7 (dated note 2026-11-09: the web theme is GENERATED, never hand-edited) and
//            section 3.2 (On-primary #472a00), docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b.4, batch C-2 (one provider module).
//
// MF-37 · the one Mantine provider module (listed in bindings.json providers). It merges the generated theme with ONE Button vars entry, so the
// primary (filled, primary colour) button text is the On-primary colour: a vars function cannot cross from a server layout into the client provider
// (plan v3 section 12 F1). The colour scheme is passed by each route (admin: light; batch C-2).
import type { ReactNode } from 'react';
import { Button, MantineProvider, createTheme, type MantineColorShade, type MantineColorsTuple, type MantineThemeOverride } from '@mantine/core';
import generated from '@/lib/surfaces/web/theme.generated.json';

const { $comment: _generatedBy, colors, ...rest } = generated; // eslint-disable-line @typescript-eslint/no-unused-vars -- the generator stamp is not a theme key
export const adminTheme: MantineThemeOverride = createTheme({
  ...rest,
  primaryShade: generated.primaryShade as MantineColorShade,
  colors: Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, v as unknown as MantineColorsTuple])),
  components: {
    Button: Button.extend({
      vars: (theme, props) => {
        const primary = (props.variant === undefined || props.variant === 'filled') && (props.color === undefined || props.color === theme.primaryColor);
        return primary ? { root: { '--button-color': theme.other.onPrimary as string } } : { root: {} };
      },
    }),
  },
});

export function AdminMantineProvider({ scheme, children }: { scheme: 'light' | 'dark'; children: ReactNode }) {
  return <MantineProvider theme={adminTheme} forceColorScheme={scheme}>{children}</MantineProvider>;
}
