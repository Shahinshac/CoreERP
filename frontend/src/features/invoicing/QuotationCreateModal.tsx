import React, { useEffect, useState } from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { catalogApi, Product } from "@/features/catalog/api"
import { customersApi, Customer } from "@/features/customers/api"
import { Quotation, quotationsApi } from "./api"

interface QuotationCreateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (quotation: Quotation) => void
}

interface QuotationItemRow {
  productId: string
  productName: string
  productSku: string
  quantity: number
  unitPrice: number
  discountAmount: number
  gstRate: number
}

export const QuotationCreateModal: React.FC<QuotationCreateModalProps> = ({
  open,
  onOpenChange,
  onSuccess,
}) => {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("")
  const [buyerName, setBuyerName] = useState("")
  const [buyerPhone, setBuyerPhone] = useState("")
  const [buyerState, setBuyerState] = useState("Maharashtra")
  const [buyerGstin, setBuyerGstin] = useState("")
  const [validUntil, setValidUntil] = useState("")
  const [notes, setNotes] = useState("")
  const [items, setItems] = useState<QuotationItemRow[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Load active customers and products when modal opens
  useEffect(() => {
    if (open) {
      customersApi.getCustomers({ is_active: true }).then((data) => setCustomers(data)).catch(() => {})
      catalogApi.getProducts({ is_active: true }).then((data) => setProducts(data)).catch(() => {})
    }
  }, [open])

  const handleCustomerChange = (customerId: string) => {
    setSelectedCustomerId(customerId)
    if (customerId) {
      const cust = customers.find((c) => c.id === customerId)
      if (cust) {
        setBuyerName(cust.name)
        setBuyerPhone(cust.phone || "")
      }
    }
  }

  const handleAddProduct = (productId: string) => {
    if (!productId) return
    const prod = products.find((p) => p.id === productId)
    if (!prod) return

    // If product already in list, increment qty
    const existingIndex = items.findIndex((i) => i.productId === prod.id)
    if (existingIndex >= 0) {
      const updated = [...items]
      updated[existingIndex].quantity += 1
      setItems(updated)
      return
    }

    setItems([
      ...items,
      {
        productId: prod.id,
        productName: prod.name,
        productSku: prod.sku,
        quantity: 1,
        unitPrice: parseFloat(prod.selling_price) || 0,
        discountAmount: 0,
        gstRate: parseFloat(prod.gst_rate) || 0,
      },
    ])
  }

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const handleUpdateItem = (index: number, field: keyof QuotationItemRow, val: number) => {
    const updated = [...items]
    updated[index] = { ...updated[index], [field]: val }
    setItems(updated)
  }

  // Calculate live totals
  const subtotal = items.reduce((acc, item) => {
    const gross = item.quantity * item.unitPrice
    const taxable = Math.max(0, gross - item.discountAmount)
    return acc + taxable
  }, 0)

  const estimatedTax = items.reduce((acc, item) => {
    const gross = item.quantity * item.unitPrice
    const taxable = Math.max(0, gross - item.discountAmount)
    return acc + taxable * (item.gstRate / 100)
  }, 0)

  const grandTotal = subtotal + estimatedTax

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (items.length === 0) {
      toast.error("Please add at least one product item to the quotation.")
      return
    }

    setIsSubmitting(true)
    try {
      const created = await quotationsApi.create({
        customer_id: selectedCustomerId || undefined,
        buyer_name: buyerName.trim() || undefined,
        buyer_phone: buyerPhone.trim() || undefined,
        buyer_state: buyerState.trim() || undefined,
        buyer_gstin: buyerGstin.trim() || undefined,
        valid_until: validUntil || undefined,
        notes: notes.trim() || undefined,
        items: items.map((item) => ({
          product_id: item.productId,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          discount_amount: item.discountAmount,
        })),
      })
      toast.success(`Quotation ${created.quotation_number} created successfully!`)
      onSuccess(created)
      onOpenChange(false)
    } catch (err: any) {
      const errMsg = err?.response?.data?.error?.message || err?.message || "Failed to create quotation."
      toast.error(errMsg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Quotation / Estimate</DialogTitle>
          <DialogDescription>
            Generate a sales quotation for a prospective or existing customer. Stock is NOT deducted until converted to an invoice.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Customer / Buyer Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-white/[0.03] rounded-lg border border-white/[0.08]">
            <div>
              <label className="text-zinc-400 font-medium mb-1 block">Customer Account (Optional)</label>
              <Select
                value={selectedCustomerId}
                onChange={(e) => handleCustomerChange(e.target.value)}
                className="h-9 text-xs"
              >
                <option value="">-- Walk-in / Custom Buyer --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ""}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="text-zinc-400 font-medium mb-1 block">Buyer Name *</label>
              <Input
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="Buyer / Company Name"
                className="h-9 text-xs"
                required
              />
            </div>

            <div>
              <label className="text-zinc-400 font-medium mb-1 block">Buyer Phone</label>
              <Input
                value={buyerPhone}
                onChange={(e) => setBuyerPhone(e.target.value)}
                placeholder="10-digit mobile number"
                className="h-9 text-xs"
              />
            </div>

            <div>
              <label className="text-zinc-400 font-medium mb-1 block">Place of Supply / State</label>
              <Input
                value={buyerState}
                onChange={(e) => setBuyerState(e.target.value)}
                placeholder="e.g. Maharashtra"
                className="h-9 text-xs"
              />
            </div>

            <div>
              <label className="text-zinc-400 font-medium mb-1 block">Buyer GSTIN (Optional)</label>
              <Input
                value={buyerGstin}
                onChange={(e) => setBuyerGstin(e.target.value.toUpperCase())}
                placeholder="15-character GSTIN"
                className="h-9 text-xs"
              />
            </div>

            <div>
              <label className="text-zinc-400 font-medium mb-1 block">Valid Until</label>
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* Product Items Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-zinc-300 font-medium">Quotation Items</label>
              <div className="w-64">
                <Select
                  value=""
                  onChange={(e) => {
                    handleAddProduct(e.target.value)
                    e.target.value = ""
                  }}
                  className="h-8 text-xs"
                >
                  <option value="">+ Add product from catalog...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (₹{p.selling_price})
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="p-6 text-center text-zinc-500 border border-dashed border-white/[0.1] rounded-lg">
                No items added yet. Select a product from the dropdown above to add items to this estimate.
              </div>
            ) : (
              <div className="border border-white/[0.08] rounded-lg overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-white/[0.04] text-zinc-400">
                    <tr>
                      <th className="py-2 px-3">Product</th>
                      <th className="py-2 px-2 w-20">Qty</th>
                      <th className="py-2 px-2 w-28">Unit Price</th>
                      <th className="py-2 px-2 w-24">Discount</th>
                      <th className="py-2 px-2 text-right">Taxable</th>
                      <th className="py-2 px-2 text-center w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {items.map((item, idx) => {
                      const taxable = Math.max(0, item.quantity * item.unitPrice - item.discountAmount)
                      return (
                        <tr key={item.productId}>
                          <td className="py-2 px-3">
                            <p className="font-medium text-zinc-200">{item.productName}</p>
                            <p className="text-[10px] text-zinc-500">
                              SKU: {item.productSku} | GST: {item.gstRate}%
                            </p>
                          </td>
                          <td className="py-2 px-2">
                            <Input
                              type="number"
                              min="1"
                              step="1"
                              value={item.quantity}
                              onChange={(e) => handleUpdateItem(idx, "quantity", parseFloat(e.target.value) || 1)}
                              className="h-7 text-xs w-16"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unitPrice}
                              onChange={(e) => handleUpdateItem(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                              className="h-7 text-xs w-24"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.discountAmount}
                              onChange={(e) => handleUpdateItem(idx, "discountAmount", parseFloat(e.target.value) || 0)}
                              className="h-7 text-xs w-20"
                            />
                          </td>
                          <td className="py-2 px-2 text-right font-medium text-zinc-200">
                            ₹{taxable.toFixed(2)}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="text-zinc-500 hover:text-red-400 p-1"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Notes & Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="text-zinc-400 font-medium mb-1 block">Notes / Terms</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Terms and conditions, delivery estimate, payment terms..."
                className="w-full bg-[#141416] border border-white/[0.14] rounded-lg p-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="bg-white/[0.02] p-3 rounded-lg border border-white/[0.08] space-y-1.5">
              <div className="flex justify-between text-zinc-400">
                <span>Subtotal (Taxable):</span>
                <span>₹{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Estimated GST:</span>
                <span>₹{estimatedTax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-zinc-100 pt-1 border-t border-white/[0.08]">
                <span>Grand Total:</span>
                <span className="text-emerald-400">₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || items.length === 0}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isSubmitting ? "Generating..." : "Save Quotation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
