import * as React from "react"
import { cn } from "@/lib/utils"

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 select-none block",
        className
      )}
      {...props}
    />
  )
}
