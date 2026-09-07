import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-slate-400 bg-white/70 border border-slate-200 shadow-[inset_0_2px_4px_rgba(180,200,225,0.2)] backdrop-blur-md h-9 w-full min-w-0 rounded-full px-4 py-1 text-sm text-slate-800 transition-all duration-200 outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus:bg-white focus:border-blue-300 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15),inset_0_1px_2px_rgba(255,255,255,0.9)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
