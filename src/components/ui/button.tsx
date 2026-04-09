// Shadcn UI — Button primitive
// Scaffolded manually (no `shadcn init`) to avoid CLI touching unrelated
// config. Canonical Shadcn source adapted for the Buildo industrial
// utilitarian palette (amber-hardhat primary, dark charcoal backgrounds).
// Spec 75 §12.5. Touch target minimum 44px enforced via the `lg` size.

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  // Base: flex + focus ring + disabled + transition. Mobile-first — no
  // sizing in the base; size variants handle it.
  // Focus ring offset uses the generic surface token, not
  // `ring-offset-feed`, so the button primitive isn't coupled to the
  // dark charcoal feed background. Gemini Phase 3-ii review (MED).
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold font-display transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-hardhat focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-amber-hardhat text-neutral-900 hover:bg-amber-hardhat/90 active:scale-[0.98]',
        secondary:
          'bg-blue-blueprint text-text-primary hover:bg-blue-blueprint/90 active:scale-[0.98]',
        ghost:
          'text-text-primary hover:bg-card-pressed hover:text-text-primary active:scale-[0.98]',
        outline:
          'border border-text-tertiary bg-transparent text-text-primary hover:bg-card-pressed active:scale-[0.98]',
        destructive:
          'bg-red-stop text-neutral-100 hover:bg-red-stop/90 active:scale-[0.98]',
      },
      size: {
        default: 'h-11 px-4 py-2', // 44px — meets standards §1.1 touch target
        sm: 'h-9 px-3 text-xs',
        lg: 'h-12 px-6 text-base', // 48px
        icon: 'h-11 w-11', // 44×44 icon button
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
