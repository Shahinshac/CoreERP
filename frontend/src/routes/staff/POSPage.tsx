import { useCallback, useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  HelpCircle,
  Keyboard,
  Minus,
  Package,
  Pin,
  Plus,
  ScanBarcode,
  Search,
  ShoppingCart,
  Trash2,
  User,
  Vault,
  Zap,
  Layers,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { NumericInput } from "@/components/ui/numeric-input"
import { CartItem, posApi, POSProduct, Sale, SplitPaymentPortion } from "@/features/pos/api"
import { catalogApi } from "@/features/catalog/api"
import { customersApi } from "@/features/customers/api"
import { ReceiptModal } from "@/features/pos/ReceiptModal"
import { CashDrawerModal } from "@/features/pos/CashDrawerModal"
import { cashDrawerApi } from "@/features/pos/cashDrawerApi"

export function POSPage() {
  const [productSearch, setProductSearch] = useState("")
  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("cash")
  const [splitPortions, setSplitPortions] = useState<SplitPaymentPortion[]>([
    { method: "cash", amount: "" },
    { method: "upi", amount: "" },
  ])
  const [orderDiscount, setOrderDiscount] = useState("0.00")
  const [notes, setNotes] = useState("")

  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [completedSale, setCompletedSale] = useState<Sale | null>(null)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [cashDrawerOpen, setCashDrawerOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  // Pinned Products Query
  const { data: pinnedProducts = [] } = useQuery({
    queryKey: ["pos-pinned-products"],
    queryFn: () => catalogApi.getProducts({ is_active: true, is_pinned: true }),
  })

  // Barcode Scanner State & Refs
  const [barcodeInput, setBarcodeInput] = useState("")
  const [isScanning, setIsScanning] = useState(false)
  const [lastScanFeedback, setLastScanFeedback] = useState<{
    type: "success" | "error"
    message: string
  } | null>(null)

  const barcodeInputRef = useRef<HTMLInputElement | null>(null)
  const barcodeCacheRef = useRef<Map<string, POSProduct>>(new Map())
  const wedgeBufferRef = useRef<string>("")
  const lastKeystrokeTimeRef = useRef<number>(0)

  // Autofocus barcode input on mount
  useEffect(() => {
    barcodeInputRef.current?.focus()
  }, [])

  // Cash Drawer Status Query
  const { data: drawerStatus, refetch: refetchDrawer } = useQuery({
    queryKey: ["pos-cash-drawer-status"],
    queryFn: () => cashDrawerApi.getCurrentStatus(),
    refetchInterval: 15000,
  })

  // Products Search Query
  const { data: searchResults = [], isLoading: searchLoading } = useQuery({
    queryKey: ["pos-products-search", productSearch],
    queryFn: () => (productSearch.trim() ? posApi.searchProducts(productSearch.trim()) : []),
    enabled: productSearch.trim().length >= 1,
  })

  // Customers Query
  const { data: customers = [] } = useQuery({
    queryKey: ["pos-customers-list"],
    queryFn: () => customersApi.getCustomers({ is_active: true }),
  })

  const handleAddToCart = (product: POSProduct) => {
    const stockAvailable = parseFloat(product.current_stock)
    if (stockAvailable <= 0) {
      toast.error(`'${product.name}' is completely out of stock.`)
      return
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id)
      if (existing) {
        const currentQty = parseFloat(existing.quantity)
        if (currentQty + 1 > stockAvailable) {
          toast.error(`Cannot exceed available stock of ${stockAvailable} ${product.unit}.`)
          return prev
        }
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: (currentQty + 1).toFixed(3) }
            : item
        )
      }
      return [
        ...prev,
        {
          product,
          quantity: "1.000",
          discount_amount: "0.00",
        },
      ]
    })
  }

  const handleUpdateQty = (productId: string, newQtyStr: string) => {
    const item = cart.find((i) => i.product.id === productId)
    if (!item) return

    const newQty = parseFloat(newQtyStr) || 0
    const maxStock = parseFloat(item.product.current_stock)

    if (newQty > maxStock) {
      toast.error(`Cannot exceed stock limit of ${maxStock} ${item.product.unit}.`)
      return
    }

    setCart((prev) =>
      prev.map((i) => (i.product.id === productId ? { ...i, quantity: newQtyStr } : i))
    )
  }

  const handleRemoveFromCart = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId))
  }

  // Barcode Scanner Handler
  const handleBarcodeScan = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim()
      if (!code) return

      // Clear input immediately so scanner buffer doesn't append to old input
      setBarcodeInput("")

      // 1. Fast in-memory cache resolution (handles rapid duplicate scans without race conditions)
      const cached = barcodeCacheRef.current.get(code.toLowerCase())
      if (cached) {
        handleAddToCart(cached)
        setLastScanFeedback({
          type: "success",
          message: `Added: ${cached.name} (SKU: ${cached.sku})`,
        })
        barcodeInputRef.current?.focus()
        return
      }

      setIsScanning(true)
      try {
        const product = await posApi.lookupBarcode(code)
        // Cache by barcode and SKU
        barcodeCacheRef.current.set(code.toLowerCase(), product)
        if (product.barcode) {
          barcodeCacheRef.current.set(product.barcode.toLowerCase(), product)
        }
        if (product.sku) {
          barcodeCacheRef.current.set(product.sku.toLowerCase(), product)
        }

        handleAddToCart(product)
        setLastScanFeedback({
          type: "success",
          message: `Added: ${product.name} (SKU: ${product.sku})`,
        })
      } catch {
        const notFoundMsg = `Product not found for barcode: ${code}`
        setLastScanFeedback({
          type: "error",
          message: notFoundMsg,
        })
        toast.error(notFoundMsg)
      } finally {
        setIsScanning(false)
        barcodeInputRef.current?.focus()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cart]
  )

  // Global scanner wedge listener + [F2] keyboard shortcut to focus scanner input
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // F2 hotkey: focus barcode scanner input
      if (e.key === "F2") {
        e.preventDefault()
        barcodeInputRef.current?.focus()
        return
      }

      // If already focused inside an input or textarea, let the element handle typing
      const activeEl = document.activeElement
      const isInputFocused =
        activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement

      if (isInputFocused && activeEl === barcodeInputRef.current) {
        return
      }

      if (isInputFocused) {
        return
      }

      // Wedge scanner detection for background/blurred scanner scans:
      const now = Date.now()
      const timeDiff = now - lastKeystrokeTimeRef.current
      lastKeystrokeTimeRef.current = now

      if (e.key === "Enter" || e.key === "Tab") {
        if (wedgeBufferRef.current.length >= 2) {
          const scannedCode = wedgeBufferRef.current
          wedgeBufferRef.current = ""
          e.preventDefault()
          handleBarcodeScan(scannedCode)
        } else {
          wedgeBufferRef.current = ""
        }
      } else if (e.key.length === 1) {
        if (timeDiff < 60 || wedgeBufferRef.current.length === 0) {
          wedgeBufferRef.current += e.key
        } else {
          wedgeBufferRef.current = e.key
        }
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown)
    return () => window.removeEventListener("keydown", handleGlobalKeyDown)
  }, [handleBarcodeScan])

  const handleLineDiscountChange = (productId: string, val: string) => {
    setCart((prev) =>
      prev.map((i) => (i.product.id === productId ? { ...i, discount_amount: val } : i))
    )
  }

  // Live client pre-calculation (mirroring backend server computation)
  const itemsSubtotal = cart.reduce((acc, item) => {
    const qty = parseFloat(item.quantity) || 0
    const price = parseFloat(item.product.selling_price) || 0
    const disc = parseFloat(item.discount_amount) || 0
    return acc + Math.max(0, qty * price - disc)
  }, 0)

  const parsedOrderDiscount = parseFloat(orderDiscount) || 0
  const grandTotal = Math.max(0, itemsSubtotal - parsedOrderDiscount)

  const isSplitMode = paymentMethod === "split" || paymentMethod === "mixed"

  const splitTotal = splitPortions.reduce((acc, p) => {
    const val = parseFloat(p.amount)
    return acc + (isNaN(val) ? 0 : val)
  }, 0)

  const splitRemaining = Math.round((grandTotal - splitTotal) * 100) / 100
  const isSplitExactMatch = Math.abs(splitRemaining) < 0.009 && grandTotal > 0
  const hasDuplicateSplitMethods =
    new Set(splitPortions.map((p) => p.method)).size !== splitPortions.length
  const hasInvalidSplitPortion = splitPortions.some((p) => {
    const v = parseFloat(p.amount)
    return isNaN(v) || v <= 0
  })
  const isSplitReady =
    !isSplitMode ||
    (isSplitExactMatch &&
      !hasDuplicateSplitMethods &&
      !hasInvalidSplitPortion &&
      splitPortions.length >= 2)

  const handleAddSplitPortion = () => {
    if (splitPortions.length >= 3) return
    const usedMethods = new Set(splitPortions.map((p) => p.method))
    const available = ["cash", "upi", "card"].find((m) => !usedMethods.has(m)) || "card"
    const remainingToAllocate = splitRemaining > 0 ? splitRemaining.toFixed(2) : ""
    setSplitPortions((prev) => [...prev, { method: available, amount: remainingToAllocate }])
  }

  const handleRemoveSplitPortion = (index: number) => {
    if (splitPortions.length <= 2) {
      toast.error("Split payment requires at least 2 portions.")
      return
    }
    setSplitPortions((prev) => prev.filter((_, idx) => idx !== index))
  }

  const handleSplitPortionChange = (
    index: number,
    field: "method" | "amount",
    value: string
  ) => {
    setSplitPortions((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item))
    )
  }

  const handleAutoFillSplitPortion = (index: number) => {
    const otherTotal = splitPortions.reduce((acc, p, idx) => {
      if (idx === index) return acc
      const val = parseFloat(p.amount)
      return acc + (isNaN(val) ? 0 : val)
    }, 0)
    const needed = Math.max(0, grandTotal - otherTotal)
    handleSplitPortionChange(index, "amount", needed.toFixed(2))
  }

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.error("Your cart is empty. Add products before checkout.")
      return
    }

    // Validate quantities
    for (const item of cart) {
      const qty = parseFloat(item.quantity)
      if (!qty || qty <= 0) {
        toast.error(`Invalid quantity for ${item.product.name}`)
        return
      }
      if (qty > parseFloat(item.product.current_stock)) {
        toast.error(
          `Insufficient stock for ${item.product.name}. Available: ${item.product.current_stock}`
        )
        return
      }
    }

    // Validate split payment
    if (isSplitMode) {
      if (splitPortions.length < 2) {
        toast.error("Split payment requires at least 2 payment portions.")
        return
      }
      if (hasDuplicateSplitMethods) {
        toast.error("Each payment portion must use a distinct payment method (e.g. Cash, Card, UPI).")
        return
      }
      if (hasInvalidSplitPortion) {
        toast.error("Every split payment portion must have an amount greater than ₹0.00.")
        return
      }
      if (!isSplitExactMatch) {
        if (splitRemaining > 0) {
          toast.error(`Underpaid: ₹${splitRemaining.toFixed(2)} remaining to be allocated.`)
        } else {
          toast.error(`Overpaid: Allocations exceed total by ₹${(-splitRemaining).toFixed(2)}.`)
        }
        return
      }
    }

    setIsCheckingOut(true)
    try {
      const sale = await posApi.checkout({
        customer_id: selectedCustomerId || null,
        items: cart.map((i) => ({
          product_id: i.product.id,
          quantity: i.quantity,
          discount_amount: i.discount_amount,
        })),
        discount_amount: orderDiscount,
        payment_method: isSplitMode ? "split" : paymentMethod,
        split_payments: isSplitMode
          ? splitPortions.map((p) => ({
              method: p.method,
              amount: parseFloat(p.amount).toFixed(2),
            }))
          : undefined,
        notes: notes.trim() || undefined,
        client_total: grandTotal.toFixed(2),
      })

      toast.success(`Checkout complete! Invoice: ${sale.invoice_number}`)
      setCompletedSale(sale)
      setReceiptOpen(true)
      refetchDrawer()

      // Clear cart
      setCart([])
      setOrderDiscount("0.00")
      setNotes("")
      setSplitPortions([
        { method: "cash", amount: "" },
        { method: "upi", amount: "" },
      ])
    } catch {
      // Handled by api error toast
    } finally {
      setIsCheckingOut(false)
    }
  }

  // POS Global Shortcuts: F2 for checkout, ? for help dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isInput = target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)

      if (e.key === "F2") {
        e.preventDefault()
        if (cart.length === 0) {
          toast.info("Your cart is empty. Add products before checkout.")
          return
        }
        handleCheckout()
      } else if (e.key === "?" && !isInput) {
        e.preventDefault()
        setShortcutsOpen((prev) => !prev)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [cart, isCheckingOut, isSplitMode, splitPortions, isSplitReady, grandTotal, selectedCustomerId, notes, orderDiscount, paymentMethod])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Point of Sale (POS)</h1>
          <p className="text-sm text-slate-500">
            Rapid checkout terminal with atomic stock decrements and server-enforced pricing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShortcutsOpen(true)}
            title="POS Keyboard Shortcuts (?)"
            className="h-9 w-9 p-0 rounded-lg border border-white/[0.14] text-zinc-300 hover:text-white bg-surface-elevated hover:bg-white/[0.08]"
          >
            <HelpCircle className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCashDrawerOpen(true)}
            className={`h-9 text-xs font-semibold gap-2 border transition ${
              drawerStatus?.active
                ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                : "bg-surface-elevated hover:bg-white/[0.08] text-zinc-300 border-white/[0.14]"
            }`}
          >
            <Vault className="h-4 w-4" />
            {drawerStatus?.active && drawerStatus.session ? (
              <span className="flex items-center gap-1.5 font-mono">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Drawer: ₹{parseFloat(drawerStatus.session.expected_cash).toFixed(2)}
              </span>
            ) : (
              <span>Drawer: Closed</span>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ==========================================
            LEFT PANEL: BARCODE SCANNER & CATALOG (7 COLS)
        ========================================== */}
        <div className="lg:col-span-7 space-y-4">
          {/* Dedicated Barcode Scanner Box */}
          <div className="bg-surface-elevated p-4 rounded-xl border border-primary/30 shadow-none space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ScanBarcode className="h-5 w-5 text-primary" />
                <h3 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                  Barcode Scanner
                  <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] px-1.5 py-0 font-mono gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    USB / BT READY
                  </Badge>
                </h3>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono text-zinc-400 border-white/[0.12]">
                Press [F2] to focus
              </Badge>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleBarcodeScan(barcodeInput)
              }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <ScanBarcode className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                <Input
                  ref={barcodeInputRef}
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "Tab") {
                      e.preventDefault()
                      handleBarcodeScan(barcodeInput)
                    }
                  }}
                  placeholder="Scan barcode or type SKU & press Enter..."
                  className="pl-9 h-10 text-sm font-mono bg-black/40 border-white/[0.14] text-white focus-visible:ring-primary"
                  autoComplete="off"
                />
              </div>
              <Button
                type="submit"
                disabled={isScanning || !barcodeInput.trim()}
                className="h-10 px-4 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold gap-1.5 shrink-0"
              >
                {isScanning ? "Scanning..." : "Scan / Add"}
              </Button>
            </form>

            {/* Non-blocking Scan Feedback Banner */}
            {lastScanFeedback && (
              <div
                className={`p-2.5 rounded-lg border text-xs flex items-center justify-between transition-all ${
                  lastScanFeedback.type === "success"
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                }`}
              >
                <div className="flex items-center gap-2 font-mono">
                  {lastScanFeedback.type === "success" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                  )}
                  <span>{lastScanFeedback.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setLastScanFeedback(null)}
                  className="text-zinc-400 hover:text-white text-[11px] underline ml-2"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>

          {/* Pinned Products Quick-Picks */}
          {pinnedProducts.length > 0 && (
            <div className="bg-card p-3.5 rounded-xl border border-primary/30 shadow-none space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                  <Pin className="h-3.5 w-3.5 fill-primary" />
                  <span>Pinned Quick-Picks ({pinnedProducts.length})</span>
                </div>
                <span className="text-[11px] text-zinc-400">Click to instantly add to cart</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {pinnedProducts.map((p) => {
                  const stockNum = parseFloat(p.current_stock)
                  const isOutOfStock = stockNum <= 0
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={isOutOfStock}
                      onClick={() => handleAddToCart(p as unknown as POSProduct)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-2 transition select-none ${
                        isOutOfStock
                          ? "bg-surface-elevated/40 border-white/[0.08] text-zinc-500 cursor-not-allowed opacity-60"
                          : "bg-surface-elevated border-white/[0.14] hover:border-primary/80 hover:bg-[#18181C] text-zinc-200 hover:text-white"
                      }`}
                    >
                      <span>{p.name}</span>
                      <span className="font-mono text-[11px] font-semibold text-primary">
                        ₹{parseFloat(p.selling_price).toFixed(2)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Catalog Search & Browse */}
          <div className="bg-card p-4 rounded-xl border border-white/[0.14] shadow-none space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    if (searchResults && searchResults.length > 0) {
                      const topProduct = searchResults[0]
                      if (parseFloat(topProduct.current_stock) <= 0) {
                        toast.error(`'${topProduct.name}' is out of stock.`)
                      } else {
                        handleAddToCart(topProduct)
                        toast.success(`Added '${topProduct.name}' to cart`)
                        setProductSearch("")
                      }
                    } else if (productSearch.trim()) {
                      toast.info("No matching products found.")
                    }
                  }
                }}
                placeholder="Search catalog by name, brand, or SKU (Enter adds top result)..."
                className="pl-9 h-10 text-sm font-medium"
              />
            </div>
            <p className="text-[11px] text-zinc-400">
              Type to search or press [Enter] to quickly add the top matching product.
            </p>
          </div>

          {/* Search Results Grid */}
          <div className="bg-card rounded-xl border border-white/[0.14] shadow-none p-4 min-h-[420px]">
            {searchLoading ? (
              <div className="py-20 text-center text-sm text-zinc-400">
                Searching active products...
              </div>
            ) : productSearch.trim().length === 0 ? (
              <div className="py-24 text-center text-zinc-400 space-y-2">
                <Package className="h-10 w-10 mx-auto text-zinc-500" />
                <p className="text-sm">Search for an item or scan a barcode to add to cart</p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="py-20 text-center text-sm text-zinc-400">
                No active products found matching "{productSearch}".
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {searchResults.map((prod) => {
                  const stockNum = parseFloat(prod.current_stock)
                  const isOutOfStock = stockNum <= 0
                  return (
                    <div
                      key={prod.id}
                      onClick={() => !isOutOfStock && handleAddToCart(prod)}
                      className={`p-3.5 rounded-xl border transition flex flex-col justify-between select-none ${
                        isOutOfStock
                          ? "bg-surface-elevated/50 border-white/[0.08] opacity-50 cursor-not-allowed"
                          : "bg-surface-elevated border-white/[0.14] hover:border-primary/60 hover:bg-[#18181C] cursor-pointer group"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <div className="font-semibold text-zinc-100 group-hover:text-primary transition text-sm">
                            {prod.name}
                          </div>
                          <div className="text-xs text-zinc-400 font-mono mt-0.5">
                            SKU: {prod.sku}
                          </div>
                        </div>
                        <Badge
                          variant={isOutOfStock ? "destructive" : "outline"}
                          className="text-[10px] shrink-0"
                        >
                          {isOutOfStock ? "Out of Stock" : `${prod.current_stock} ${prod.unit}`}
                        </Badge>
                      </div>

                      <div className="mt-4 pt-2 border-t border-white/[0.08] flex items-center justify-between">
                        <div className="text-base font-bold font-mono text-zinc-100">
                          ₹{parseFloat(prod.selling_price).toFixed(2)}
                        </div>
                        <Button
                          size="sm"
                          disabled={isOutOfStock}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (!isOutOfStock) handleAddToCart(prod)
                          }}
                          className="h-7 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ==========================================
            RIGHT PANEL: ACTIVE CART & CHECKOUT (5 COLS)
        ========================================== */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-card rounded-xl border border-white/[0.14] shadow-none p-4 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.10]">
              <div className="flex items-center gap-2 font-semibold text-zinc-100 text-base">
                <ShoppingCart className="h-5 w-5 text-primary" />
                Active Cart ({cart.length})
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-xs text-rose-400 hover:underline"
                >
                  Clear Cart
                </button>
              )}
            </div>

            {/* Customer Picker */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-zinc-400" />
                Select Customer (Optional)
              </label>
              <Select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
              >
                <option value="">Walk-in Customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.email})
                  </option>
                ))}
              </Select>
            </div>

            {/* Cart Items List */}
            <div className="divide-y divide-white/[0.08] max-h-72 overflow-y-auto space-y-2 pr-1">
              {cart.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-400 space-y-1">
                  <ShoppingCart className="h-8 w-8 mx-auto text-zinc-500" />
                  <div>No items in cart</div>
                </div>
              ) : (
                cart.map((item) => {
                  const maxStock = parseFloat(item.product.current_stock)
                  const currentQtyNum = parseFloat(item.quantity) || 0
                  const lineTotal = Math.max(
                    0,
                    currentQtyNum * parseFloat(item.product.selling_price) -
                      (parseFloat(item.discount_amount) || 0)
                  )

                  return (
                    <div key={item.product.id} className="pt-2 pb-2 space-y-2 text-xs">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-semibold text-zinc-100">{item.product.name}</div>
                          <div className="text-[11px] text-zinc-400 font-mono">
                            ₹{parseFloat(item.product.selling_price).toFixed(2)} / {item.product.unit}{" "}
                            (Max: {maxStock})
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveFromCart(item.product.id)}
                          className="text-zinc-400 hover:text-rose-400 transition"
                          title="Remove item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        {/* Quantity Stepper */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateQty(
                                item.product.id,
                                Math.max(1, currentQtyNum - 1).toFixed(3)
                              )
                            }
                            className="h-7 w-7 rounded bg-surface-hover hover:bg-white/[0.12] border border-white/[0.12] flex items-center justify-center text-zinc-200"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <NumericInput
                            value={item.quantity}
                            onChange={(val) => handleUpdateQty(item.product.id, val)}
                            precisionType="quantity"
                            className="h-7 w-20 text-center text-xs"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateQty(
                                item.product.id,
                                Math.min(maxStock, currentQtyNum + 1).toFixed(3)
                              )
                            }
                            disabled={currentQtyNum >= maxStock}
                            className="h-7 w-7 rounded bg-surface-hover hover:bg-white/[0.12] disabled:opacity-40 border border-white/[0.12] flex items-center justify-center text-zinc-200"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>

                        {/* Line Total */}
                        <div className="text-right font-mono font-bold text-zinc-100 text-sm">
                          ₹{lineTotal.toFixed(2)}
                        </div>
                      </div>

                      {/* Line Discount */}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-[11px] text-zinc-400">Item Discount (₹):</span>
                        <NumericInput
                          value={item.discount_amount}
                          onChange={(v) => handleLineDiscountChange(item.product.id, v)}
                          precisionType="money"
                          prefix="₹"
                          className="h-6 w-24 text-right text-[11px]"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Calculations & Order Discount */}
            <div className="pt-3 border-t border-white/[0.10] space-y-2 text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>Items Subtotal:</span>
                <span className="font-mono font-semibold text-zinc-200">₹{itemsSubtotal.toFixed(2)}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Order Discount (₹):</span>
                <NumericInput
                  value={orderDiscount}
                  onChange={setOrderDiscount}
                  precisionType="money"
                  prefix="₹"
                  className="h-7 w-28 text-right text-xs"
                  placeholder="0.00"
                />
              </div>

              <div className="flex justify-between items-baseline pt-2 border-t border-white/[0.10]">
                <div>
                  <span className="text-base font-bold text-zinc-100">Total Payable:</span>
                  <div className="text-[10px] text-zinc-400 font-sans">
                    Pre-GST Subtotal (Server calculated)
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-emerald-400">
                  ₹{grandTotal.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Payment Method */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5 text-zinc-400" />
                Payment Method
              </label>
              <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="cash">Cash Settlement</option>
                <option value="card">Credit / Debit Card</option>
                <option value="upi">UPI / QR Code</option>
                <option value="split">Split Payment</option>
              </Select>
            </div>

            {/* Split Payment Allocation Panel */}
            {isSplitMode && (
              <div className="p-3 rounded-lg bg-surface/80 border border-white/[0.10] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                    <Layers className="h-3.5 w-3.5 text-primary" />
                    <span>Split Portions</span>
                  </div>
                  {isSplitExactMatch ? (
                    <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 bg-emerald-500/10 text-[10px] gap-1 px-1.5 py-0.5">
                      <CheckCircle2 className="h-3 w-3" /> Balanced
                    </Badge>
                  ) : splitRemaining > 0 ? (
                    <Badge variant="outline" className="text-amber-400 border-amber-500/30 bg-amber-500/10 text-[10px] gap-1 px-1.5 py-0.5">
                      <AlertCircle className="h-3 w-3" /> ₹{splitRemaining.toFixed(2)} Left
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-rose-400 border-rose-500/30 bg-rose-500/10 text-[10px] gap-1 px-1.5 py-0.5">
                      <AlertCircle className="h-3 w-3" /> Over +₹{(-splitRemaining).toFixed(2)}
                    </Badge>
                  )}
                </div>

                <div className="space-y-2">
                  {splitPortions.map((portion, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-black/20 p-2 rounded border border-white/[0.06]">
                      {/* Method Selector */}
                      <div className="w-28 shrink-0">
                        <select
                          value={portion.method}
                          onChange={(e) => handleSplitPortionChange(idx, "method", e.target.value)}
                          className="w-full h-8 text-xs bg-surface-hover border border-white/[0.12] rounded px-2 text-zinc-200 focus:outline-none focus:border-primary uppercase font-mono"
                        >
                          <option value="cash">Cash</option>
                          <option value="upi">UPI</option>
                          <option value="card">Card</option>
                        </select>
                      </div>

                      {/* Amount Input */}
                      <div className="flex-1">
                        <NumericInput
                          value={portion.amount}
                          onChange={(val) => handleSplitPortionChange(idx, "amount", val)}
                          precisionType="money"
                          prefix="₹"
                          className="h-8 text-right text-xs"
                          placeholder="0.00"
                        />
                      </div>

                      {/* Auto-fill Helper */}
                      <button
                        type="button"
                        onClick={() => handleAutoFillSplitPortion(idx)}
                        title="Auto-fill remainder into this portion"
                        className="h-8 px-2 text-[10px] font-medium rounded bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 hover:text-white border border-white/[0.08] shrink-0"
                      >
                        Auto-fill
                      </button>

                      {/* Remove Button */}
                      {splitPortions.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSplitPortion(idx)}
                          className="h-8 w-8 rounded flex items-center justify-center text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 shrink-0"
                          title="Remove portion"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {hasDuplicateSplitMethods && (
                  <div className="text-[11px] text-rose-400 flex items-center gap-1.5 pt-0.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    Duplicate payment method detected. Each portion must have a unique method.
                  </div>
                )}

                {hasInvalidSplitPortion && (
                  <div className="text-[11px] text-amber-400 flex items-center gap-1.5 pt-0.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    Each portion must have an amount greater than ₹0.00.
                  </div>
                )}

                <div className="flex items-center justify-between pt-1 text-[11px]">
                  {splitPortions.length < 3 ? (
                    <button
                      type="button"
                      onClick={handleAddSplitPortion}
                      className="text-primary hover:underline font-medium flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" /> Add Method
                    </button>
                  ) : (
                    <span className="text-zinc-500">Max 3 methods (Cash, Card, UPI)</span>
                  )}
                  <div className="text-right text-zinc-400 font-mono">
                    Total: <span className="font-semibold text-zinc-200">₹{splitTotal.toFixed(2)}</span> / ₹{grandTotal.toFixed(2)}
                  </div>
                </div>
              </div>
            )}

            {/* Checkout Action Button */}
            <Button
              onClick={handleCheckout}
              disabled={cart.length === 0 || isCheckingOut || (isSplitMode && !isSplitReady)}
              className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm shadow-none gap-2"
            >
              <Zap className="h-4 w-4" />
              {isCheckingOut ? "Processing Transaction..." : `Complete Checkout (₹${grandTotal.toFixed(2)})`}
            </Button>
          </div>
        </div>
      </div>

      {/* Printable Receipt Modal */}
      <ReceiptModal
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        sale={completedSale}
        customerPhone={customers.find((c) => c.id === selectedCustomerId)?.phone}
      />

      {/* Cash Drawer Reconciliation Modal */}
      <CashDrawerModal
        open={cashDrawerOpen}
        onOpenChange={setCashDrawerOpen}
        onSessionChange={refetchDrawer}
      />

      {/* POS Keyboard Shortcuts Reference Dialog */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="max-w-md bg-surface border border-white/[0.12] text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Keyboard className="h-5 w-5 text-primary" />
              POS Keyboard Shortcuts
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400">
              Quick keyboard reference for cashier speed and efficiency.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-3 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-elevated border border-white/[0.08]">
              <span className="text-zinc-200 font-medium">Complete Checkout / Payment</span>
              <kbd className="px-2 py-1 rounded bg-black/50 border border-white/[0.14] font-mono text-[11px] text-primary font-bold">
                F2
              </kbd>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-elevated border border-white/[0.08]">
              <span className="text-zinc-200 font-medium">Add Top Search Result to Cart</span>
              <kbd className="px-2 py-1 rounded bg-black/50 border border-white/[0.14] font-mono text-[11px] text-primary font-bold">
                Enter
              </kbd>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-elevated border border-white/[0.08]">
              <span className="text-zinc-200 font-medium">Barcode Scanner / Rapid Add</span>
              <kbd className="px-2 py-1 rounded bg-black/50 border border-white/[0.14] font-mono text-[11px] text-primary font-bold">
                Enter / Tab
              </kbd>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-elevated border border-white/[0.08]">
              <span className="text-zinc-200 font-medium">Global Search (from anywhere)</span>
              <kbd className="px-2 py-1 rounded bg-black/50 border border-white/[0.14] font-mono text-[11px] text-primary font-bold">
                /
              </kbd>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-elevated border border-white/[0.08]">
              <span className="text-zinc-200 font-medium">Command Palette</span>
              <kbd className="px-2 py-1 rounded bg-black/50 border border-white/[0.14] font-mono text-[11px] text-primary font-bold">
                Ctrl + K
              </kbd>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-elevated border border-white/[0.08]">
              <span className="text-zinc-200 font-medium">Toggle Shortcuts Reference</span>
              <kbd className="px-2 py-1 rounded bg-black/50 border border-white/[0.14] font-mono text-[11px] text-primary font-bold">
                ?
              </kbd>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
export default POSPage
