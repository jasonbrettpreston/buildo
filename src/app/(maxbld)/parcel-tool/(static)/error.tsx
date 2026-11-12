'use client';
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b (mount file; the STATIC error state), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md
//            FE-31, docs/specs/02-web-admin/33_web_admin_engineering_protocol.md section 11 (Sentry with a feature tag) and :145 (a deliberate state).
//
// MF-46 stage C · the error boundary of the MaxBLD plain pages (Help & Support, Terms, Privacy): web_maxbld_error in its `error` state, every word
// from content, Try again resets the boundary (plan v3 §12 fold 16: the plain pages' error page from content, not the search page's). The error
// message is never shown (it may carry a server string); it is reported to Sentry only (the MF-44 boundary report).
import { useEffect } from 'react';
import { StaticBinding, staticWebTree } from '@/components/surfaces/web/StaticBinding';
import { reportMaxbldWebBoundary } from '@/lib/surfaces/maxbld-web-boundary';
import { staticPage } from '@/lib/surfaces/maxbld-static';

export default function MaxbldStaticError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportMaxbldWebBoundary(error); }, [error]);
  const { page, content } = staticPage('web_maxbld_error', 'error');
  return <StaticBinding tree={staticWebTree(page)} content={content} actions={{ retry: reset }} />;
}
