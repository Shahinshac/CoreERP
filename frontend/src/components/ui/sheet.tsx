import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  side?: "left" | "right"
  children: React.ReactNode
}

export function Sheet({
  open,
  onOpenChange,
  side = "left",
  children,
}: SheetProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={() => onOpenChange(false)}
      />
      {/* Drawer content */}
      <div
        className={cn(
          "relative z-50 flex h-full w-3/4 max-w-sm flex-col bg-background p-6 shadow-xl transition ease-in-out duration-300",
          side === "left" ? "mr-auto animate-in slide-in-from-left" : "ml-auto animate-in slide-in-from-right"
        )}
      >
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
        >
          <X className="h-5 w-5" />
          <span className="sr-only">Close</span>
        </button>
        {children}
      </div>
    </div>
  )
}
