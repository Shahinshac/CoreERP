import React, { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowUpDown,
  CornerDownLeft,
  FileText,
  Package,
  Search,
  User,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { searchApi } from "@/features/search/api"

export interface CommandItem {
  id: string
  title: string
  description?: string
  category: string
  href?: string
  icon: React.ElementType
  keywords?: string[]
  action?: () => void
  badge?: string
}

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: CommandItem[]
  placeholder?: string
  enableGlobalSearch?: boolean
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onOpenChange,
  items,
  placeholder = "Type a command or search pages...",
  enableGlobalSearch = false,
}) => {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Global Ctrl+K / Cmd+K keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, onOpenChange])

  // Reset search and selection when palette opens/closes
  useEffect(() => {
    if (open) {
      setSearchQuery("")
      setSelectedIndex(0)
      // Focus after modal transitions
      setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
    }
  }, [open])

  // Global search dynamic queries when enabled
  const cleanQ = searchQuery.trim()
  const { data: searchResults } = useQuery({
    queryKey: ["command-palette-search", cleanQ],
    queryFn: () => searchApi.search(cleanQ),
    enabled: Boolean(enableGlobalSearch && cleanQ.length >= 2),
    staleTime: 1000 * 20,
  })

  // Filter items matching query in title, description, category, or keywords + dynamic search results
  const filteredItems = useMemo(() => {
    const q = cleanQ.toLowerCase()
    let base = items
    if (q) {
      base = items.filter((item) => {
        const inTitle = item.title.toLowerCase().includes(q)
        const inDesc = item.description?.toLowerCase().includes(q)
        const inCat = item.category.toLowerCase().includes(q)
        const inKeywords = item.keywords?.some((k) => k.toLowerCase().includes(q))
        return inTitle || inDesc || inCat || inKeywords
      })
    }

    if (!enableGlobalSearch || !searchResults) {
      return base
    }

    const dynamicItems: CommandItem[] = []

    // Products from global search
    for (const p of searchResults.products) {
      dynamicItems.push({
        id: `search-prod-${p.id}`,
        title: p.name,
        description: `SKU: ${p.sku} | ₹${parseFloat(p.selling_price).toFixed(2)} | Stock: ${parseFloat(p.current_stock).toFixed(0)}`,
        category: "Matching Products",
        href: `/staff/products?search=${encodeURIComponent(p.sku)}`,
        icon: Package,
      })
    }

    // Customers from global search
    for (const c of searchResults.customers) {
      dynamicItems.push({
        id: `search-cust-${c.id}`,
        title: c.name,
        description: `${c.email}${c.phone ? ` • ${c.phone}` : ""}`,
        category: "Matching Customers",
        href: `/staff/customers?search=${encodeURIComponent(c.phone || c.name)}`,
        icon: User,
      })
    }

    // Invoices from global search
    for (const inv of searchResults.invoices) {
      dynamicItems.push({
        id: `search-inv-${inv.id}`,
        title: inv.invoice_number,
        description: `${inv.buyer_name} • ₹${parseFloat(inv.total_amount).toFixed(2)} (${inv.invoice_date})`,
        category: "Matching Invoices",
        href: `/staff/invoices/${inv.id}`,
        icon: FileText,
      })
    }

    return [...base, ...dynamicItems]
  }, [items, cleanQ, enableGlobalSearch, searchResults])

  // Clamp selection index when filtered items change
  useEffect(() => {
    setSelectedIndex(0)
  }, [searchQuery])

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return
    const activeEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement | null
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" })
    }
  }, [selectedIndex])

  const handleSelect = (item: CommandItem) => {
    onOpenChange(false)
    if (item.action) {
      item.action()
    } else if (item.href) {
      navigate(item.href)
    }
  }

  // Keyboard navigation within the palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filteredItems.length === 0 && e.key !== "Escape") return

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % filteredItems.length)
        break
      case "ArrowUp":
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length)
        break
      case "Enter":
        e.preventDefault()
        if (filteredItems[selectedIndex]) {
          handleSelect(filteredItems[selectedIndex])
        }
        break
      case "Escape":
        e.preventDefault()
        onOpenChange(false)
        break
    }
  }

  if (!open) return null

  // Group items by category for visual organization while preserving index mapping
  let currentIndex = 0
  const groupedCategories: { category: string; items: { item: CommandItem; index: number }[] }[] = []
  const categoryMap = new Map<string, { item: CommandItem; index: number }[]>()

  for (const item of filteredItems) {
    const entry = { item, index: currentIndex++ }
    if (!categoryMap.has(item.category)) {
      categoryMap.set(item.category, [])
    }
    categoryMap.get(item.category)!.push(entry)
  }

  categoryMap.forEach((catItems, category) => {
    groupedCategories.push({ category, items: catItems })
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-3 sm:px-4 bg-black/75 backdrop-blur-sm animate-in fade-in-0 duration-150"
      onClick={() => onOpenChange(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      <div
        className="w-full max-w-xl rounded-xl border border-white/[0.14] bg-[#0C0C0E] shadow-2xl overflow-hidden flex flex-col animate-in fade-in-0 zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.10] bg-[#111114]">
          <Search className="h-4 w-4 text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-sm sm:text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08]"
              title="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center rounded border border-white/[0.14] bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
            Esc
          </kbd>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          className="max-h-[380px] overflow-y-auto p-2 space-y-3 divide-y divide-white/[0.05]"
        >
          {filteredItems.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <Search className="h-8 w-8 text-zinc-600 mx-auto" />
              <p className="text-sm font-medium text-zinc-300">
                No commands or pages found
              </p>
              <p className="text-xs text-zinc-500">
                No matching results for &ldquo;{searchQuery}&rdquo;. Try another search term.
              </p>
            </div>
          ) : (
            groupedCategories.map(({ category, items: catItems }) => (
              <div key={category} className="pt-2 first:pt-0">
                <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  {category}
                </div>
                <div className="space-y-0.5">
                  {catItems.map(({ item, index }) => {
                    const Icon = item.icon
                    const isSelected = selectedIndex === index

                    return (
                      <div
                        key={item.id}
                        data-index={index}
                        onClick={() => handleSelect(item)}
                        onMouseEnter={() => setSelectedIndex(index)}
                        className={cn(
                          "flex items-center justify-between gap-3 px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors",
                          isSelected
                            ? "bg-primary/15 text-primary border border-primary/20"
                            : "text-zinc-300 hover:bg-white/[0.05] border border-transparent"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={cn(
                              "flex h-7 w-7 items-center justify-center rounded-md border shrink-0 transition-colors",
                              isSelected
                                ? "bg-primary/20 text-primary border-primary/30"
                                : "bg-white/[0.04] text-zinc-400 border-white/[0.08]"
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-zinc-100 truncate">
                              {item.title}
                            </div>
                            {item.description && (
                              <div className="text-[11px] text-zinc-400 truncate">
                                {item.description}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {item.badge && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-400 border border-white/[0.08]">
                              {item.badge}
                            </span>
                          )}
                          {isSelected && (
                            <CornerDownLeft className="h-3.5 w-3.5 text-primary shrink-0" />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer with Keyboard Hints */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-white/[0.08] bg-[#0E0E11] text-[11px] text-zinc-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <ArrowUpDown className="h-3 w-3" />
              <span>Navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <CornerDownLeft className="h-3 w-3" />
              <span>Select</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="font-mono text-[9px] bg-white/[0.06] px-1 py-0.5 rounded border border-white/[0.10]">
                Esc
              </kbd>
              <span>Close</span>
            </span>
          </div>

          <div className="font-mono text-[10px] text-zinc-500">
            {filteredItems.length} {filteredItems.length === 1 ? "result" : "results"}
          </div>
        </div>
      </div>
    </div>
  )
}
