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
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sales Returns & Refunds</h1>
        <p className="text-sm text-slate-500">
          Reverse sales transactions, restore inventory ledger stock, and audit merchandise returns.
        </p>
      </div>

      {/* Invoice Lookup Card */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <Search className="h-4 w-4 text-blue-600" />
          Lookup Invoice for Return
        </div>
        <div className="flex gap-2 max-w-xl">
          <Input
            value={invoiceQuery}
            onChange={(e) => setInvoiceQuery(e.target.value)}
            placeholder="Enter Invoice Number (e.g. POS-20260922-XXXX)..."
            className="font-mono text-sm"
          />
          <Button onClick={() => handleLookup()} className="bg-slate-900 text-white shrink-0">
            Find Sale
          </Button>
        </div>
      </div>

      {/* Return Processing Form */}
      {activeSale && (
        <form onSubmit={handleSubmitReturn} className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-5 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-3 border-b border-slate-100 gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg text-slate-900 font-mono">
                    {activeSale.invoice_number}
                  </span>
                  <Badge variant={activeSale.status === "completed" ? "default" : "destructive"}>
                    {activeSale.status}
                  </Badge>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Customer: <span className="font-medium text-slate-700">{activeSale.customer_name}</span> •
                  Date: {new Date(activeSale.sale_date).toLocaleString()}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400">Total Invoice Value</div>
                <div className="font-mono font-bold text-lg text-slate-900">
                  ₹{parseFloat(activeSale.total_amount).toFixed(2)}
                </div>
              </div>
            </div>

            {/* Sale Items Return Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sold Product</TableHead>
                    <TableHead className="text-center">Sold Qty</TableHead>
                    <TableHead className="text-center">Previously Returned</TableHead>
                    <TableHead className="text-center">Returnable Balance</TableHead>
                    <TableHead className="text-right">Unit Sold Price</TableHead>
                    <TableHead className="text-right w-36">Return Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeSale.items.map((item) => {
                    const soldQty = parseFloat(item.quantity)
                    const returnedQty = parseFloat(item.returned_quantity)
                    const returnable = Math.max(0, soldQty - returnedQty)
                    const isFullyReturned = returnable <= 0

                    return (
                      <TableRow key={item.id} className={isFullyReturned ? "bg-slate-50/70 opacity-60" : ""}>
                        <TableCell>
                          <div className="font-semibold text-slate-900">{item.product_name}</div>
                          <div className="text-xs text-slate-400 font-mono">SKU: {item.product_sku}</div>
                        </TableCell>

                        <TableCell className="text-center font-mono text-xs">{item.quantity}</TableCell>

                        <TableCell className="text-center font-mono text-xs text-amber-600">
                          {item.returned_quantity}
                        </TableCell>

                        <TableCell className="text-center font-mono text-xs font-bold text-slate-800">
                          {returnable.toFixed(3)}
                        </TableCell>

                        <TableCell className="text-right font-mono text-xs">
                          ₹{parseFloat(item.unit_price).toFixed(2)}
                        </TableCell>

                        <TableCell className="text-right">
                          <NumericInput
                            value={returnQuantities[item.id] || ""}
                            onChange={(val) => handleQtyChange(item.id, val)}
                            precisionType="quantity"
                            disabled={isFullyReturned || isSubmitting}
                            placeholder="0.000"
                            className="h-8 text-right font-mono text-xs"
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
              <label className="text-xs font-medium text-slate-700">Reason for Return / Defect Notes</label>
              <Input
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="e.g. Defective merchandise, incorrect model, customer exchange"
              />
            </div>

            {/* Submit Return */}
            <div className="pt-2 flex justify-end">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-rose-600 hover:bg-rose-700 text-white font-semibold gap-2"
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
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
            <div>
              <div className="text-sm font-bold text-emerald-900">
                Return Completed ({completedReturn.return_number})
              </div>
              <div className="text-xs text-emerald-700">
                Refund amount of{" "}
                <span className="font-mono font-bold">
                  ₹{parseFloat(completedReturn.total_refund_amount).toFixed(2)}
                </span>{" "}
                recorded. Stock ledger updated with incoming reversal movements.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Sales for Quick Action */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="font-semibold text-slate-900 text-sm flex items-center gap-2">
          <Receipt className="h-4 w-4 text-slate-500" />
          Recent Invoices (Quick Select)
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {recentSales.slice(0, 6).map((sale) => (
            <div
              key={sale.id}
              onClick={() => handleLookup(sale.invoice_number)}
              className="p-3 rounded-lg border border-slate-200 hover:border-blue-500 hover:shadow-sm cursor-pointer transition flex flex-col justify-between"
            >
              <div className="flex justify-between items-start">
                <span className="font-mono text-xs font-semibold text-slate-900">
                  {sale.invoice_number}
                </span>
                <Badge variant={sale.status === "completed" ? "outline" : "destructive"} className="text-[10px]">
                  {sale.status}
                </Badge>
              </div>
              <div className="text-[11px] text-slate-500 mt-2">
                Customer: {sale.customer_name || "Walk-in"}
              </div>
              <div className="text-xs font-bold font-mono text-slate-800 mt-1 flex justify-between">
                <span>₹{parseFloat(sale.total_amount).toFixed(2)}</span>
                <span className="text-[10px] text-blue-600 font-normal">Select</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
export default ReturnsPage
