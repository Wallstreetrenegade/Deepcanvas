import {cva, type VariantProps} from 'class-variance-authority';
import * as React from 'react';

import {cn} from '../../lib';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-neutral-100 text-neutral-900',
        secondary: 'border-transparent bg-neutral-100 text-neutral-900',
        outline: 'text-neutral-950',
        neutral: 'border-transparent bg-neutral-50 text-neutral-600',
        destructive: 'border-transparent bg-red-100 text-red-900',
        success: 'border-transparent bg-green-100 text-green-900',
        warning: 'border-transparent bg-amber-100 text-amber-900',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({className, variant, ...props}: BadgeProps) {
  return <div className={cn(badgeVariants({variant}), className)} {...props} />;
}

export {Badge, badgeVariants};
