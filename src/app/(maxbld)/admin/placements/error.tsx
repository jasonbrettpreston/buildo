'use client';
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b (mount file; the LIST error state), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31.
//
// MF-40 · the admin placements error boundary: the offers LIST binding in its error state, every word from content.
import { useEffect } from 'react';
import { ListBinding, listTree } from '@/components/surfaces/web/ListBinding';
import { reportPlacementsBoundary } from '@/lib/placements/report-boundary';
import { PLACEMENTS_CONTENT, PLACEMENTS_SURFACES } from '@/lib/placements/surfaces';

type ListDescriptor = Parameters<typeof listTree>[0];

export default function AdminPlacementsError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => { reportPlacementsBoundary(error); }, [error]);
  const list = PLACEMENTS_SURFACES.list as unknown as ListDescriptor;
  return <ListBinding descriptor={list} tree={listTree(list, 'error')} rows={[]} content={PLACEMENTS_CONTENT} />;
}
