import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30",
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-[0_4px_14px_rgba(37,99,235,0.3),inset_0_1px_1px_rgba(255,255,255,0.4)] border border-white/20 hover:from-blue-500 hover:to-blue-600 hover:shadow-[0_6px_18px_rgba(37,99,235,0.4)] hover:-translate-y-0.5 active:translate-y-0',
        destructive:
          'bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-[0_4px_14px_rgba(239,68,68,0.25)] border border-white/20 hover:from-rose-600 hover:to-red-700 hover:-translate-y-0.5 active:translate-y-0',
        outline:
          'border border-white/80 bg-white/70 text-slate-700 shadow-[0_2px_8px_rgba(180,200,225,0.2),inset_0_1px_2px_rgba(255,255,255,0.8)] backdrop-blur-md hover:bg-white hover:text-blue-600 hover:border-blue-200 hover:-translate-y-0.5 active:translate-y-0',
        secondary:
          'bg-blue-50/80 text-blue-700 border border-blue-100/80 shadow-[inset_0_1px_2px_rgba(255,255,255,0.9)] hover:bg-blue-100/90',
        ghost:
          'text-slate-600 hover:bg-white/60 hover:text-slate-900',
        link: 'text-blue-600 underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-full gap-1.5 px-3.5 text-xs has-[>svg]:px-2.5',
        lg: 'h-10 rounded-full px-6 has-[>svg]:px-4',
        icon: 'size-9 rounded-full',
        'icon-xs': 'size-7 rounded-full',
        'icon-sm': 'size-8 rounded-full',
        'icon-lg': 'size-10 rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
