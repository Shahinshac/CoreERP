import React, { useState } from "react"
import { useNavigate } from "react-router-dom"
import { CheckCircle2, Download, ExternalLink, FileText, Printer, X } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sale } from "./api"
import { Invoice, invoicingApi } from "@/features/invoicing/api"

interface ReceiptModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sale: Sale | null
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  open,
  onOpenChange,
  sale,
}) => {
  const navigate = useNavigate()
  const [generatedInvoice, setGeneratedInvoice] = useState<Invoice | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [showTaxInvoiceForm, setShowTaxInvoiceForm] = useState(false)
  const [buyerName, setBuyerName] = useState("")
  const [buyerGstin, setBuyerGstin] = useState("")
  const [buyerState, setBuyerState] = useState("")

  if (!sale) return null

  const handlePrint = () => {
    window.print()
  }

  const handleGenerateInvoice = async () => {
    setIsGenerating(true)
    try {
      const inv = await invoicingApi.generateFromSale(sale.id, {
        buyer_name: buyerName.trim() || undefined,
        buyer_gstin: buyerGstin.trim() || undefined,
        buyer_state: buyerState.trim() || undefined,
      })
      setGeneratedInvoice(inv)
      toast.success(`GST Tax Invoice ${inv.invoice_number} generated!`)
    } catch {
      // Handled by API error toast
    } finally {
      setIsGenerating(false)
    }
  }

  const handleViewInvoice = () => {
    if (!generatedInvoice) return
    onOpenChange(false)
    navigate(`/staff/invoices/${generatedInvoice.id}`)
  }

  const handleDownloadPdf = async () => {
    if (!generatedInvoice) return
    try {
      await invoicingApi.downloadPdf(generatedInvoice.id, generatedInvoice.invoice_number)
      toast.success("Tax Invoice PDF downloaded successfully!")
    } catch {
      toast.error("Failed to download PDF.")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) {
          setGeneratedInvoice(null)
          setShowTaxInvoiceForm(false)
        }
        onOpenChange(val)
      }}
    >
      <div className="space-y-4 max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-emerald-600 justify-center">
            <CheckCircle2 className="h-6 w-6" />
            <DialogTitle className="text-xl">Checkout Complete</DialogTitle>
          </div>
          <DialogDescription className="text-center text-xs text-slate-500">
            Sale recorded atomically with stock deductions.
          </DialogDescription>
        </DialogHeader>

        {/* Printable Receipt Paper */}
        <div className="border border-dashed border-slate-300 rounded-xl p-5 bg-slate-50/50 space-y-3 font-mono text-xs text-slate-800">
          <div className="text-center pb-2 border-b border-dashed border-slate-300">
            <div className="font-bold text-sm text-slate-900">ERP RETAIL POS</div>
            <div className="text-[11px] text-slate-500">Official Store Receipt</div>
            <div className="mt-1 font-semibold text-slate-700">{sale.invoice_number}</div>
            <div className="text-[10px] text-slate-400">
              {new Date(sale.sale_date).toLocaleString()}
            </div>
          </div>

          <div className="flex justify-between text-[11px] text-slate-600">
            <span>Customer: {sale.customer_name || "Walk-in"}</span>
            <span>Cashier: {sale.staff_email.split("@")[0]}</span>
          </div>

          {/* Line Items */}
          <div className="py-2 border-t border-b border-dashed border-slate-300 space-y-1.5">
            {sale.items.map((item) => (
              <div key={item.id} className="flex justify-between items-start">
                <div className="max-w-[180px]">
                  <div className="font-medium truncate text-slate-900">{item.product_name}</div>
                  <div className="text-[10px] text-slate-400">
                    {item.quantity} x ₹{parseFloat(item.unit_price).toFixed(2)}
                    {parseFloat(item.discount_amount) > 0 && (
                      <span className="text-rose-600 ml-1">
                        (-₹{parseFloat(item.discount_amount).toFixed(2)})
                      </span>
                    )}
                  </div>
                </div>
                <div className="font-semibold text-right">
                  ₹{parseFloat(item.total_price).toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          {/* Calculation Breakdown */}
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between text-slate-600">
              <span>Items Subtotal:</span>
              <span>₹{parseFloat(sale.subtotal).toFixed(2)}</span>
            </div>
            {parseFloat(sale.discount_amount) > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>Order Discount:</span>
                <span>-₹{parseFloat(sale.discount_amount).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm text-slate-900 pt-1 border-t border-slate-200">
              <span>Grand Total:</span>
              <span>₹{parseFloat(sale.total_amount).toFixed(2)}</span>
            </div>
          </div>

          <div className="pt-2 text-center text-[10px] text-slate-400 border-t border-dashed border-slate-300">
            Payment Method: <span className="uppercase font-semibold">{sale.payment_method}</span>
          </div>
        </div>

        {/* Formal GST Invoice Section */}
        {generatedInvoice ? (
          <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/70 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-emerald-800">
                <FileText className="h-4 w-4" />
                GST Tax Invoice Generated!
              </div>
              <span className="font-mono text-emerald-900 font-semibold">
                {generatedInvoice.invoice_number}
              </span>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleViewInvoice}
                className="flex-1 h-8 text-xs bg-white text-emerald-700 hover:bg-emerald-50"
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                View Invoice
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadPdf}
                className="flex-1 h-8 text-xs bg-white text-emerald-700 hover:bg-emerald-50"
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                Download PDF
              </Button>
            </div>
          </div>
        ) : showTaxInvoiceForm ? (
          <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/50 space-y-2.5 text-xs">
            <div className="font-semibold text-blue-900 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-blue-600" />
              Tax Invoice Recipient Details
            </div>
            <div className="space-y-1.5">
              <Input
                placeholder="Buyer / Business Name (defaults to customer)"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                className="h-8 text-xs bg-white"
              />
              <Input
                placeholder="Buyer GSTIN (Optional, for B2B ITC)"
                value={buyerGstin}
                onChange={(e) => setBuyerGstin(e.target.value)}
                className="h-8 text-xs bg-white uppercase font-mono"
              />
              <Input
                placeholder="Buyer State (e.g. Maharashtra, Delhi)"
                value={buyerState}
                onChange={(e) => setBuyerState(e.target.value)}
                className="h-8 text-xs bg-white"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleGenerateInvoice}
                disabled={isGenerating}
                className="flex-1 h-8 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
              >
                {isGenerating ? "Finalizing..." : "Create Sequential Invoice"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTaxInvoiceForm(false)}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTaxInvoiceForm(true)}
            className="w-full h-9 border-blue-200 bg-blue-50/50 hover:bg-blue-100 text-blue-700 text-xs font-semibold gap-1.5"
          >
            <FileText className="h-3.5 w-3.5" />
            Generate Statutory GST Tax Invoice
          </Button>
        )}

        <DialogFooter className="flex gap-2 sm:justify-between pt-1">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-1.5" />
            Close
          </Button>
          <Button size="sm" onClick={handlePrint} className="bg-slate-900 text-white">
            <Printer className="h-4 w-4 mr-1.5" />
            Print Receipt
          </Button>
        </DialogFooter>
      </div>
    </Dialog>
  )
}
