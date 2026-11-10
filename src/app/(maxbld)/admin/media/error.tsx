'use client';
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b (mount file; the LIST error state), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31.
//
// MF-37 · the admin media error boundary: the LIST binding in its error state, every word from content.
import { useEffect } from 'react';
import { ListBinding, listTree } from '@/components/surfaces/web/ListBinding';
import { reportMediaBoundary } from '@/lib/media/report-boundary';
import { MEDIA_CONTENT, MEDIA_SURFACES } from '@/lib/media/surfaces';

type ListDescriptor = Parameters<typeof listTree>[0];

export default function AdminMediaError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => { reportMediaBoundary(error); }, [error]);
  const list = MEDIA_SURFACES.list as unknown as ListDescriptor;
  return <ListBinding descriptor={list} tree={listTree(list, 'error')} rows={[]} content={MEDIA_CONTENT} />;
}
