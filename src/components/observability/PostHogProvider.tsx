'use client';
// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §7a + §13

import { useEffect } from 'react';
import { initObservability } from '@/lib/observability/capture';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initObservability();
  }, []);
  return <>{children}</>;
}
