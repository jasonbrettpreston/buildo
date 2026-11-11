'use client';
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b (mount file; the SEARCH error state), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md
//            FE-31, docs/specs/02-web-admin/33_web_admin_engineering_protocol.md section 11 (Sentry with a feature tag).
//
// MF-44 · the MaxBLD web pages' error boundary: the search binding in its error state (the error notice and Retry), every word from content.
// The error message is never shown (it may carry a database string); it is reported to Sentry only.
import { useEffect } from 'react';
import { SearchBinding, searchWebData, searchWebTree } from '@/components/surfaces/web/SearchBinding';
import { reportMaxbldWebBoundary } from '@/lib/surfaces/maxbld-web-boundary';
import { SEARCH_CONTENT, WEB_ERROR_SITUATION } from '@/lib/surfaces/maxbld-web';

export default function MaxbldError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportMaxbldWebBoundary(error); }, [error]);
  return (
    <SearchBinding
      tree={searchWebTree(WEB_ERROR_SITUATION)}
      content={SEARCH_CONTENT}
      data={searchWebData(WEB_ERROR_SITUATION)}
      actions={{ retry: reset }}
    />
  );
}
