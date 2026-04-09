// Shadcn UI — ToggleGroup primitive (wraps Radix ToggleGroup)
// Used by LeadFilterSheet for the radius selector. Single-select
// radio-style behavior with keyboard navigation via Radix, plus
// the amber-hardhat active state via data-[state=on] selector.

'use client';

import * as React from 'react';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const toggleGroupItemVariants = cva(
  // Base: 44px touch target + focus ring + transition + data-[state=on]
  // active styling (amber-hardhat matches the Button default variant).
  'inline-flex min-h-11 items-center justify-center rounded-md bg-transparent px-4 font-data text-sm font-semibold text-text-primary transition-colors hover:bg-card-pressed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-hardhat focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-amber-hardhat data-[state=on]:text-neutral-900',
  {
    variants: {
      size: {
        default: 'h-11 px-4',
        sm: 'h-9 px-3 text-xs',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
);

const ToggleGroup = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ToggleGroupPrimitive.Root
    ref={ref}
    className={cn('flex items-center gap-2', className)}
    {...props}
  >
    {children}
  </ToggleGroupPrimitive.Root>
));
ToggleGroup.displayName = ToggleGroupPrimitive.Root.displayName;

const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item> &
    VariantProps<typeof toggleGroupItemVariants>
>(({ className, size, children, ...props }, ref) => (
  <ToggleGroupPrimitive.Item
    ref={ref}
    className={cn(toggleGroupItemVariants({ size }), className)}
    {...props}
  >
    {children}
  </ToggleGroupPrimitive.Item>
));
ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName;

export { ToggleGroup, ToggleGroupItem };
