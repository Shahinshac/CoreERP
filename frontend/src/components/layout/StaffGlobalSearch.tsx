import React, { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { FileText, Loader2, Package, Search, User, X } from "lucide-react"
import { searchApi } from "@/features/search/api"

export const StaffGlobalSearch: React.FC = () => {
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Listen for global '/' key to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is already typing in an input, textarea, or contentEditable
      const target = e.target as HTMLElement | null
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)

      if (e.key === "/" && !isInput) {
        e.preventDefault()
        inputRef.current?.focus()
        setIsOpen(true)
      } else if (e.key === "Escape" && isOpen) {
        setIsOpen(false)
        inputRef.current?.blur()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen])

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Debounced search query
  const trimmedQuery = query.trim()
  const { data, isLoading } = useQuery({
    queryKey: ["staff-global-search", trimmedQuery],
    queryFn: () => searchApi.search(trimmedQuery),
    enabled: trimmedQuery.length >= 1,
    staleTime: 1000 * 30,
  })

  const hasResults =
    data &&
    (data.products.length > 0 ||
      data.customers.length > 0 ||
      data.invoices.length > 0)

  const handleSelectProduct = (sku: string) => {
    setIsOpen(false)
    setQuery("")
    navigate(`/staff/products?search=${encodeURIComponent(sku)}`)
  }

  const handleSelectCustomer = (phoneOrName: string) => {
    setIsOpen(false)
    setQuery("")
    navigate(`/staff/customers?search=${encodeURIComponent(phoneOrName)}`)
  }

  const handleSelectInvoice = (id: string) => {
    setIsOpen(false)
    setQuery("")
    navigate(`/staff/invoices/${id}`)
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-xs sm:max-w-sm md:max-w-md">
      {/* Search Input Bar */}
      <div className="relative flex items-center">
        <Search className="absolute left-3 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsOpen(true)
          }}
          placeholder="Search ERP (/ to focus)..."
          className="w-full h-8 pl-8 pr-8 rounded-lg bg-[#141417] border border-white/[0.12] text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-primary transition-colors font-sans"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("")
              inputRef.current?.focus()
            }}
            className="absolute right-2 p-0.5 text-zinc-400 hover:text-zinc-200"
            title="Clear search"
          >
            <X className="h-3 w-3" />
          </button>
        ) : (
          <kbd className="hidden sm:inline-flex absolute right-2.5 items-center rounded border border-white/[0.12] bg-white/[0.05] px-1.5 py-0.5 text-[9px] font-mono text-zinc-400 pointer-events-none">
            /
          </kbd>
        )}
      </div>

      {/* Dropdown Results Card */}
      {isOpen && trimmedQuery.length >= 1 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-xl border border-white/[0.14] bg-[#0C0C0E] shadow-2xl overflow-hidden divide-y divide-white/[0.06] animate-in fade-in-0 zoom-in-95 duration-100 max-h-[420px] overflow-y-auto">
          {isLoading ? (
            <div className="py-6 flex items-center justify-center gap-2 text-xs text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Searching products, customers & invoices...</span>
            </div>
          ) : !hasResults ? (
            <div className="py-6 text-center text-xs text-zinc-400">
              No results found for &ldquo;{trimmedQuery}&rdquo;
            </div>
          ) : (
            <>
              {/* Products Section */}
              {data.products.length > 0 && (
                <div className="p-2 space-y-1">
                  <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                    <Package className="h-3 w-3 text-primary" />
                    <span>Products ({data.products.length})</span>
                  </div>
                  {data.products.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => handleSelectProduct(p.sku)}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer text-xs text-zinc-300 hover:bg-white/[0.06] hover:text-white transition-colors"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-medium text-zinc-100 truncate">
                          {p.name}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono">
                          SKU: {p.sku} {p.barcode ? `| Barcode: ${p.barcode}` : ""}
                        </div>
                      </div>
                      <div className="text-right shrink-0 font-mono text-[11px]">
                        <div className="font-semibold text-emerald-400">
                          ₹{parseFloat(p.selling_price).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          Stock: {parseFloat(p.current_stock).toFixed(0)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Customers Section */}
              {data.customers.length > 0 && (
                <div className="p-2 space-y-1">
                  <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                    <User className="h-3 w-3 text-cyan-400" />
                    <span>Customers ({data.customers.length})</span>
                  </div>
                  {data.customers.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => handleSelectCustomer(c.phone || c.name)}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer text-xs text-zinc-300 hover:bg-white/[0.06] hover:text-white transition-colors"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-medium text-zinc-100 truncate">
                          {c.name}
                        </div>
                        <div className="text-[10px] text-zinc-500 truncate">
                          {c.email}
                        </div>
                      </div>
                      {c.phone && (
                        <div className="text-right shrink-0 font-mono text-[11px] text-zinc-400">
                          {c.phone}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Invoices Section */}
              {data.invoices.length > 0 && (
                <div className="p-2 space-y-1">
                  <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                    <FileText className="h-3 w-3 text-amber-400" />
                    <span>Invoices ({data.invoices.length})</span>
                  </div>
                  {data.invoices.map((inv) => (
                    <div
                      key={inv.id}
                      onClick={() => handleSelectInvoice(inv.id)}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer text-xs text-zinc-300 hover:bg-white/[0.06] hover:text-white transition-colors"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-semibold text-zinc-100 font-mono">
                          {inv.invoice_number}
                        </div>
                        <div className="text-[10px] text-zinc-500 truncate">
                          Buyer: {inv.buyer_name} ({inv.invoice_date})
                        </div>
                      </div>
                      <div className="text-right shrink-0 font-mono text-[11px] font-bold text-zinc-200">
                        ₹{parseFloat(inv.total_amount).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
