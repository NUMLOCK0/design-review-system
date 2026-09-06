import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-xs font-semibold w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1.5 transition-all shadow-[0_1px_3px_rgba(0,0,0,0.05)]",
  {
    variants: {
      variant: {
        default:
          "border-blue-400/30 bg-blue-500/15 text-blue-600 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]",
        secondary:
          "border-white/80 bg-white/80 text-slate-700 shadow-[0_1px_4px_rgba(180,200,225,0.2)]",
        destructive:
          "border-red-400/30 bg-red-500/15 text-red-600 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]",
        outline:
          "border-slate-200/80 bg-white/40 text-slate-600 backdrop-blur-sm",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
