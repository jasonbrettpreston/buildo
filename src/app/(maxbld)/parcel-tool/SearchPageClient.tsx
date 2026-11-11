'use client';
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b (mount file), 11b.3 dated note 2026-11-11 (MF-44, the live switch),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31 (a mount file imports only framework packages, binding modules and
//            project-internal paths; it holds no display text).
//
// MF-44 · the client mount of mobile_parcel_search on the web (W4/W5). While the live switch is off it sends NO lookup request (a hit charges a
// report): the search binding renders the given situation with every control disabled. No fetch, no query cache, no stored history.
import { SearchBinding, searchWebData, searchWebTree, type WebSituation } from '@/components/surfaces/web/SearchBinding';
import { MAXBLD_WEB_LIVE, SEARCH_CONTENT } from '@/lib/surfaces/maxbld-web';

export function SearchPageClient({ situation }: { situation: WebSituation }) {
  return (
    <SearchBinding
      tree={searchWebTree(situation)}
      content={SEARCH_CONTENT}
      data={searchWebData(situation)}
      runtime={{ disabled: !MAXBLD_WEB_LIVE }}
    />
  );
}
