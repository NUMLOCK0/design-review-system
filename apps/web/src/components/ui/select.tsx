'use client';

import * as React from 'react';
import * as Primitive from '@radix-ui/react-select';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Select = Primitive.Root;
export const SelectValue = Primitive.Value;
export function SelectTrigger({ className, children, ...props }: React.ComponentProps<typeof Primitive.Trigger>) {
  return <Primitive.Trigger {...props} className={cn('flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--role-primary)] disabled:opacity-50', className)}>{children}<Primitive.Icon><ChevronDown className="h-4 w-4 text-slate-400" /></Primitive.Icon></Primitive.Trigger>;
}
export function SelectContent({ children, className, ...props }: React.ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Portal><Primitive.Content {...props} position="popper" className={cn('z-[150] max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg', className)}><Primitive.Viewport>{children}</Primitive.Viewport></Primitive.Content></Primitive.Portal>;
}
export function SelectItem({ children, className, ...props }: React.ComponentProps<typeof Primitive.Item>) {
  return <Primitive.Item {...props} className={cn('relative flex min-h-10 cursor-pointer items-center rounded-lg py-2 pl-3 pr-9 text-sm text-slate-600 outline-none data-[highlighted]:bg-slate-100 data-[state=checked]:text-[var(--role-primary)]', className)}><Primitive.ItemText>{children}</Primitive.ItemText><Primitive.ItemIndicator className="absolute right-3"><Check className="h-4 w-4" /></Primitive.ItemIndicator></Primitive.Item>;
}
