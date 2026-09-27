import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-slate-400 bg-white/70 border border-slate-200 shadow-[inset_0_2px_4px_rgba(148,163,184,0.12)] backdrop-blur-md h-9 w-full min-w-0 rounded-full px-4 py-1 text-sm text-slate-800 transition-all duration-200 outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus:bg-white focus:border-[var(--role-primary)] focus:ring-2 focus:ring-[var(--role-primary-border)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
