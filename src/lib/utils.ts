// 🔗 SPEC LINK: docs/specs/00_engineering_standards.md §12.5 Shadcn UI primitives
//
// Shadcn `cn` utility — merges class names + deduplicates Tailwind
// utilities via `tailwind-merge`. Used throughout `src/components/ui/`
// and any Shadcn-style component that composes variants + overrides.

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
