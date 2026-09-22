import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  CreditCard,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  User,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { NumericInput } from "@/components/ui/numeric-input"
import { CartItem, posApi, POSProduct, Sale } from "@/features/pos/api"
import { customersApi } from "@/features/customers/api"
import { ReceiptModal } from "@/features/pos/ReceiptModal"

export function POSPage() {
  const [productSearch, setProductSearch] = useState("")
  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("cash")
  const [orderDiscount, setOrderDiscount] = useState("0.00")
  const [notes, setNotes] = useState("")

  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [completedSale, setCompletedSale] = useState<Sale | null>(null)
  const [receiptOpen, setReceiptOpen] = useState(false)

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
        payment_method: paymentMethod,
        notes: notes.trim() || undefined,
        client_total: grandTotal.toFixed(2),
      })

      toast.success(`Checkout complete! Invoice: ${sale.invoice_number}`)
      setCompletedSale(sale)
      setReceiptOpen(true)

      // Clear cart
      setCart([])
      setOrderDiscount("0.00")
      setNotes("")
    } catch {
      // Handled by api error toast
    } finally {
      setIsCheckingOut(false)
    }
  }

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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ==========================================
            LEFT PANEL: PRODUCT SEARCH & CATALOG (7 COLS)
        ========================================== */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search products by Name, SKU, or scan barcode..."
                className="pl-9 h-10 text-sm font-medium"
                autoFocus
              />
            </div>
            <p className="text-[11px] text-slate-400">
              Type at least 1 character to search catalog items with active stock.
            </p>
          </div>

          {/* Search Results Grid */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 min-h-[420px]">
            {searchLoading ? (
              <div className="py-20 text-center text-sm text-slate-500">
                Searching active products...
              </div>
            ) : productSearch.trim().length === 0 ? (
              <div className="py-24 text-center text-slate-400 space-y-2">
                <Package className="h-10 w-10 mx-auto text-slate-300" />
                <p className="text-sm">Search for an item or scan a barcode to add to cart</p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="py-20 text-center text-sm text-slate-500">
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
                          ? "bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed"
                          : "bg-white border-slate-200 hover:border-blue-500 hover:shadow-md cursor-pointer group"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <div className="font-semibold text-slate-900 group-hover:text-blue-600 transition text-sm">
                            {prod.name}
                          </div>
                          <div className="text-xs text-slate-400 font-mono mt-0.5">
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

                      <div className="mt-4 pt-2 border-t border-slate-100 flex items-center justify-between">
                        <div className="text-base font-bold font-mono text-slate-900">
                          ₹{parseFloat(prod.selling_price).toFixed(2)}
                        </div>
                        <Button
                          size="sm"
                          disabled={isOutOfStock}
                          className="h-7 text-xs bg-slate-900 group-hover:bg-blue-600 text-white gap-1"
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
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 font-semibold text-slate-900 text-base">
                <ShoppingCart className="h-5 w-5 text-blue-600" />
                Active Cart ({cart.length})
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-xs text-rose-600 hover:underline"
                >
                  Clear Cart
                </button>
              )}
            </div>

            {/* Customer Picker */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-slate-400" />
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
            <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto space-y-2 pr-1">
              {cart.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 space-y-1">
                  <ShoppingCart className="h-8 w-8 mx-auto text-slate-200" />
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
                          <div className="font-semibold text-slate-900">{item.product.name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            ₹{parseFloat(item.product.selling_price).toFixed(2)} / {item.product.unit}{" "}
                            (Max: {maxStock})
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveFromCart(item.product.id)}
                          className="text-slate-400 hover:text-rose-600 transition"
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
                            className="h-7 w-7 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700"
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
                            className="h-7 w-7 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40 flex items-center justify-center text-slate-700"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>

                        {/* Line Total */}
                        <div className="text-right font-mono font-bold text-slate-900 text-sm">
                          ₹{lineTotal.toFixed(2)}
                        </div>
                      </div>

                      {/* Line Discount */}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-[11px] text-slate-500">Item Discount (₹):</span>
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
            <div className="pt-3 border-t border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Items Subtotal:</span>
                <span className="font-mono font-semibold">₹{itemsSubtotal.toFixed(2)}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-600">Order Discount (₹):</span>
                <NumericInput
                  value={orderDiscount}
                  onChange={setOrderDiscount}
                  precisionType="money"
                  prefix="₹"
                  className="h-7 w-28 text-right text-xs"
                  placeholder="0.00"
                />
              </div>

              <div className="flex justify-between items-baseline pt-2 border-t border-slate-200">
                <div>
                  <span className="text-base font-bold text-slate-900">Total Payable:</span>
                  <div className="text-[10px] text-slate-400 font-sans">
                    Pre-GST Subtotal (Server calculated)
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-emerald-600">
                  ₹{grandTotal.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Payment Method */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5 text-slate-400" />
                Payment Method
              </label>
              <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="cash">Cash Settlement</option>
                <option value="card">Credit / Debit Card</option>
                <option value="upi">UPI / QR Code</option>
                <option value="mixed">Split / Mixed Payment</option>
              </Select>
            </div>

            {/* Checkout Action Button */}
            <Button
              onClick={handleCheckout}
              disabled={cart.length === 0 || isCheckingOut}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-md gap-2"
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
      />
    </div>
  )
}
export default POSPage
