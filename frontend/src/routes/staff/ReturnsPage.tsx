import React, { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  CheckCircle2,
  Receipt,
  RotateCcw,
  Search,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { NumericInput } from "@/components/ui/numeric-input"
import { posApi, ReturnItemInput, Sale, SaleReturn } from "@/features/pos/api"

export function ReturnsPage() {
  const [invoiceQuery, setInvoiceQuery] = useState("")
  const [activeSale, setActiveSale] = useState<Sale | null>(null)
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({})
  const [returnReason, setReturnReason] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [completedReturn, setCompletedReturn] = useState<SaleReturn | null>(null)

  // Recent Sales query for quick lookup
  const { data: recentSales = [], refetch: refetchSales } = useQuery({
    queryKey: ["recent-sales-lookup"],
    queryFn: () => posApi.getSales(),
  })

  const handleLookup = async (idOrNum?: string) => {
    const target = idOrNum || invoiceQuery.trim()
    if (!target) {
      toast.error("Please enter an invoice number to look up.")
      return
    }

    try {
      const sale = await posApi.getSale(target)
      setActiveSale(sale)
      setInvoiceQuery(sale.invoice_number)
      setReturnQuantities({})
      setCompletedReturn(null)
    } catch {
      toast.error(`Sale with invoice number '${target}' not found.`)
    }
  }

  const handleQtyChange = (saleItemId: string, val: string) => {
    setReturnQuantities((prev) => ({ ...prev, [saleItemId]: val }))
  }

  const handleSubmitReturn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeSale) return

    const itemsToReturn: ReturnItemInput[] = []
    for (const item of activeSale.items) {
      const qtyStr = returnQuantities[item.id] || "0"
      const qtyNum = parseFloat(qtyStr)
      if (qtyNum > 0) {
        const remaining = parseFloat(item.quantity) - parseFloat(item.returned_quantity)
        if (qtyNum > remaining) {
          toast.error(
            `Return quantity (${qtyNum}) exceeds remaining balance (${remaining}) for ${item.product_name}.`
          )
          return
        }
        itemsToReturn.push({ sale_item_id: item.id, quantity: qtyStr })
      }
    }

    if (itemsToReturn.length === 0) {
      toast.error("Please enter a quantity for at least one item to return.")
      return
    }

    setIsSubmitting(true)
    try {
      const result = await posApi.submitReturn({
        sale_id: activeSale.id,
        reason: returnReason.trim() || undefined,
        items: itemsToReturn,
      })
      toast.success(`Return processed successfully! Ref: ${result.return_number}`)
      setCompletedReturn(result)

      // Refresh active sale to reflect new returned quantities
      const refreshedSale = await posApi.getSale(activeSale.id)
      setActiveSale(refreshedSale)
      setReturnQuantities({})
      setReturnReason("")
      refetchSales()
    } catch {
      // Handled by api error toast
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Sales Returns & Refunds</h1>
        <p className="text-sm text-zinc-400">
          Reverse sales transactions, restore inventory ledger stock, and audit merchandise returns.
        </p>
      </div>

      {/* Invoice Lookup Card */}
      <div className="bg-card p-5 rounded-xl border border-white/[0.14] shadow-none space-y-3">
        <div className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" />
          Lookup Invoice for Return
        </div>
        <div className="flex gap-2 max-w-xl">
          <Input
            value={invoiceQuery}
            onChange={(e) => setInvoiceQuery(e.target.value)}
            placeholder="Enter Invoice Number (e.g. POS-20260922-XXXX)..."
            className="font-mono text-sm bg-black/40 border-white/[0.16] text-zinc-100 placeholder:text-zinc-500"
          />
          <Button onClick={() => handleLookup()} className="bg-primary hover:bg-blue-500 text-white shrink-0 font-medium">
            Find Sale
          </Button>
        </div>
      </div>

      {/* Return Processing Form */}
      {activeSale && (
        <form onSubmit={handleSubmitReturn} className="space-y-6">
          <div className="bg-card rounded-xl border border-white/[0.14] shadow-none overflow-hidden p-5 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-3 border-b border-white/[0.10] gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg text-zinc-100 font-mono">
                    {activeSale.invoice_number}
                  </span>
                  <Badge variant={activeSale.status === "completed" ? "default" : "destructive"}>
                    {activeSale.status}
                  </Badge>
                </div>
                <div className="text-xs text-zinc-400 mt-0.5">
                  Customer: <span className="font-medium text-zinc-200">{activeSale.customer_name}</span> •
                  Date: {new Date(activeSale.sale_date).toLocaleString()}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-zinc-400">Total Invoice Value</div>
                <div className="font-mono font-bold text-lg text-zinc-100">
                  ₹{parseFloat(activeSale.total_amount).toFixed(2)}
                </div>
              </div>
            </div>

            {/* Sale Items Return Table */}
            <div className="border border-white/[0.14] rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/[0.10] bg-white/[0.02]">
                    <TableHead className="text-zinc-400">Sold Product</TableHead>
                    <TableHead className="text-center text-zinc-400">Sold Qty</TableHead>
                    <TableHead className="text-center text-zinc-400">Previously Returned</TableHead>
                    <TableHead className="text-center text-zinc-400">Returnable Balance</TableHead>
                    <TableHead className="text-right text-zinc-400">Unit Sold Price</TableHead>
                    <TableHead className="text-right w-36 text-zinc-400">Return Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeSale.items.map((item) => {
                    const soldQty = parseFloat(item.quantity)
                    const returnedQty = parseFloat(item.returned_quantity)
                    const returnable = Math.max(0, soldQty - returnedQty)
                    const isFullyReturned = returnable <= 0

                    return (
                      <TableRow key={item.id} className={isFullyReturned ? "bg-white/[0.02] opacity-40 border-white/[0.06]" : "border-white/[0.08]"}>
                        <TableCell>
                          <div className="font-semibold text-zinc-100">{item.product_name}</div>
                          <div className="text-xs text-zinc-400 font-mono">SKU: {item.product_sku}</div>
                        </TableCell>

                        <TableCell className="text-center font-mono text-xs text-zinc-300">{item.quantity}</TableCell>

                        <TableCell className="text-center font-mono text-xs text-amber-400">
                          {item.returned_quantity}
                        </TableCell>

                        <TableCell className="text-center font-mono text-xs font-bold text-zinc-100">
                          {returnable.toFixed(3)}
                        </TableCell>

                        <TableCell className="text-right font-mono text-xs text-zinc-200">
                          ₹{parseFloat(item.unit_price).toFixed(2)}
                        </TableCell>

                        <TableCell className="text-right">
                          <NumericInput
                            value={returnQuantities[item.id] || ""}
                            onChange={(val) => handleQtyChange(item.id, val)}
                            precisionType="quantity"
                            disabled={isFullyReturned || isSubmitting}
                            placeholder="0.000"
                            className="h-8 text-right font-mono text-xs bg-black/40 border-white/[0.16] text-zinc-100 placeholder:text-zinc-500"
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Return Reason Field */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-300">Reason for Return / Defect Notes</label>
              <Input
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="e.g. Defective merchandise, incorrect model, customer exchange"
                className="bg-black/40 border-white/[0.16] text-zinc-100 placeholder:text-zinc-500"
              />
            </div>

            {/* Submit Return */}
            <div className="pt-2 flex justify-end">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-rose-600 hover:bg-rose-500 text-white font-semibold gap-2 border border-rose-500/30"
              >
                <RotateCcw className="h-4 w-4" />
                {isSubmitting ? "Processing Return..." : "Submit Return & Restore Stock"}
              </Button>
            </div>
          </div>
        </form>
      )}

      {/* Return Success Confirmation Banner */}
      {completedReturn && (
        <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" />
            <div>
              <div className="text-sm font-bold text-emerald-300">
                Return Completed ({completedReturn.return_number})
              </div>
              <div className="text-xs text-emerald-400/80">
                Refund amount of{" "}
                <span className="font-mono font-bold text-emerald-200">
                  ₹{parseFloat(completedReturn.total_refund_amount).toFixed(2)}
                </span>{" "}
                recorded. Stock ledger updated with incoming reversal movements.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Sales for Quick Action */}
      <div className="bg-card rounded-xl border border-white/[0.14] shadow-none p-4 space-y-3">
        <div className="font-semibold text-zinc-200 text-sm flex items-center gap-2">
          <Receipt className="h-4 w-4 text-zinc-400" />
          Recent Invoices (Quick Select)
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {recentSales.slice(0, 6).map((sale) => (
            <div
              key={sale.id}
              onClick={() => handleLookup(sale.invoice_number)}
              className="p-3 rounded-lg border border-white/[0.12] bg-[#0C0C0E] hover:border-primary/60 hover:bg-[#18181C] cursor-pointer transition flex flex-col justify-between"
            >
              <div className="flex justify-between items-start">
                <span className="font-mono text-xs font-semibold text-zinc-100">
                  {sale.invoice_number}
                </span>
                <Badge variant={sale.status === "completed" ? "outline" : "destructive"} className="text-[10px]">
                  {sale.status}
                </Badge>
              </div>
              <div className="text-[11px] text-zinc-400 mt-2">
                Customer: {sale.customer_name || "Walk-in"}
              </div>
              <div className="text-xs font-bold font-mono text-zinc-200 mt-1 flex justify-between">
                <span>₹{parseFloat(sale.total_amount).toFixed(2)}</span>
                <span className="text-[10px] text-primary font-normal">Select</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
export default ReturnsPage
