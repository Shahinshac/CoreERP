import React, { useState } from "react"
import { CheckCircle2, Send, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Invoice, Quotation, quotationsApi } from "./api"

interface QuotationDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  quotation: Quotation | null
  onStatusUpdated: (updated: Quotation) => void
  onConverted: (invoice: Invoice) => void
}

export const QuotationDetailModal: React.FC<QuotationDetailModalProps> = ({
  open,
  onOpenChange,
  quotation,
  onStatusUpdated,
  onConverted,
}) => {
  const [isConverting, setIsConverting] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)

  if (!quotation) return null

  const handleStatusChange = async (newStatus: "draft" | "sent" | "cancelled") => {
    setIsUpdatingStatus(true)
    try {
      const updated = await quotationsApi.updateStatus(quotation.id, newStatus)
      toast.success(`Quotation status changed to "${newStatus}".`)
      onStatusUpdated(updated)
    } catch (err: any) {
      const errMsg = err?.response?.data?.error?.message || err?.message || "Failed to update quotation status."
      toast.error(errMsg)
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  const handleConvert = async () => {
    setIsConverting(true)
    try {
      const invoice = await quotationsApi.convertToInvoice(quotation.id)
      toast.success(`Successfully converted to Invoice #${invoice.invoice_number}!`)
      onConverted(invoice)
      onOpenChange(false)
    } catch (err: any) {
      const errMsg = err?.response?.data?.error?.message || err?.message || "Failed to convert quotation to invoice."
      toast.error(errMsg)
    } finally {
      setIsConverting(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="secondary" className="bg-amber-500/10 text-amber-400 border-amber-500/20">Draft</Badge>
      case "sent":
        return <Badge variant="secondary" className="bg-blue-500/10 text-blue-400 border-blue-500/20">Sent to Client</Badge>
      case "converted":
        return <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Converted to Invoice</Badge>
      case "cancelled":
        return <Badge variant="secondary" className="bg-rose-500/10 text-rose-400 border-rose-500/20">Cancelled</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <span>Quotation #{quotation.quotation_number}</span>
                {getStatusBadge(quotation.status)}
              </DialogTitle>
              <DialogDescription>
                Issued on {quotation.quotation_date}
                {quotation.valid_until && ` • Valid until ${quotation.valid_until}`}
              </DialogDescription>
            </div>
            {quotation.converted_invoice_id && (
              <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">
                Invoice Linked
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4 text-xs">
          {/* Parties Snapshot */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-white/[0.02] rounded-lg border border-white/[0.08]">
            <div className="space-y-1">
              <p className="font-semibold text-zinc-300">Seller Details</p>
              <p className="text-zinc-200">{quotation.seller_name}</p>
              <p className="text-zinc-400">GSTIN: {quotation.seller_gstin}</p>
              <p className="text-zinc-400">State: {quotation.seller_state}</p>
            </div>

            <div className="space-y-1">
              <p className="font-semibold text-zinc-300">Buyer Details</p>
              <p className="text-zinc-200 font-medium">{quotation.buyer_name}</p>
              {quotation.buyer_phone && <p className="text-zinc-400">Phone: {quotation.buyer_phone}</p>}
              {quotation.buyer_gstin && <p className="text-zinc-400">GSTIN: {quotation.buyer_gstin}</p>}
              <p className="text-zinc-400">Place of Supply: {quotation.place_of_supply}</p>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="border border-white/[0.08] rounded-lg overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-white/[0.04] text-zinc-400 font-semibold border-b border-white/[0.08]">
                <tr>
                  <th className="py-2.5 px-3">Item Details</th>
                  <th className="py-2.5 px-2 text-right">Qty</th>
                  <th className="py-2.5 px-2 text-right">Unit Price</th>
                  <th className="py-2.5 px-2 text-right">Discount</th>
                  <th className="py-2.5 px-2 text-right">Taxable</th>
                  <th className="py-2.5 px-2 text-right">GST Rate</th>
                  <th className="py-2.5 px-2 text-right">Tax Amount</th>
                  <th className="py-2.5 px-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {quotation.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2.5 px-3">
                      <p className="font-medium text-zinc-200">{item.product_name}</p>
                      <p className="text-[10px] text-zinc-500">
                        SKU: {item.product_sku} {item.hsn_code ? `| HSN: ${item.hsn_code}` : ""}
                      </p>
                    </td>
                    <td className="py-2.5 px-2 text-right text-zinc-300">{item.quantity}</td>
                    <td className="py-2.5 px-2 text-right text-zinc-300">₹{parseFloat(item.unit_price).toFixed(2)}</td>
                    <td className="py-2.5 px-2 text-right text-zinc-400">₹{parseFloat(item.discount_amount).toFixed(2)}</td>
                    <td className="py-2.5 px-2 text-right font-medium text-zinc-200">
                      ₹{parseFloat(item.taxable_value).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-2 text-right text-zinc-400">{item.gst_rate}%</td>
                    <td className="py-2.5 px-2 text-right text-zinc-400">
                      ₹{(parseFloat(item.cgst_amount) + parseFloat(item.sgst_amount) + parseFloat(item.igst_amount)).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-zinc-100">
                      ₹{parseFloat(item.total_amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              {quotation.notes && (
                <div className="p-3 bg-white/[0.02] rounded-lg border border-white/[0.08]">
                  <p className="font-semibold text-zinc-300 mb-1">Notes / Terms</p>
                  <p className="text-zinc-400 whitespace-pre-wrap">{quotation.notes}</p>
                </div>
              )}
            </div>

            <div className="p-3 bg-white/[0.02] rounded-lg border border-white/[0.08] space-y-1.5">
              <div className="flex justify-between text-zinc-400">
                <span>Subtotal:</span>
                <span>₹{parseFloat(quotation.subtotal).toFixed(2)}</span>
              </div>
              {parseFloat(quotation.cgst_amount) > 0 && (
                <div className="flex justify-between text-zinc-400">
                  <span>CGST:</span>
                  <span>₹{parseFloat(quotation.cgst_amount).toFixed(2)}</span>
                </div>
              )}
              {parseFloat(quotation.sgst_amount) > 0 && (
                <div className="flex justify-between text-zinc-400">
                  <span>SGST:</span>
                  <span>₹{parseFloat(quotation.sgst_amount).toFixed(2)}</span>
                </div>
              )}
              {parseFloat(quotation.igst_amount) > 0 && (
                <div className="flex justify-between text-zinc-400">
                  <span>IGST:</span>
                  <span>₹{parseFloat(quotation.igst_amount).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-zinc-400">
                <span>Total Tax:</span>
                <span>₹{parseFloat(quotation.total_tax).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-zinc-100 pt-1 border-t border-white/[0.08]">
                <span>Grand Total:</span>
                <span className="text-emerald-400">₹{parseFloat(quotation.grand_total).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {quotation.status === "draft" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStatusChange("sent")}
                disabled={isUpdatingStatus}
                className="gap-1.5 text-xs text-blue-400 hover:text-blue-300"
              >
                <Send className="h-3.5 w-3.5" />
                Mark as Sent
              </Button>
            )}

            {(quotation.status === "draft" || quotation.status === "sent") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStatusChange("cancelled")}
                disabled={isUpdatingStatus}
                className="gap-1.5 text-xs text-rose-400 hover:text-rose-300"
              >
                <XCircle className="h-3.5 w-3.5" />
                Cancel Quotation
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>

            {(quotation.status === "draft" || quotation.status === "sent") && (
              <Button
                size="sm"
                onClick={handleConvert}
                disabled={isConverting}
                className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 text-xs"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {isConverting ? "Converting..." : "Convert to Invoice"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
