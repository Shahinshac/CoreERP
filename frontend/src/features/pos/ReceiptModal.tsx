import React, { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import { CheckCircle2, Download, ExternalLink, FileText, Printer, X, SlidersHorizontal } from "lucide-react"
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
import { Sale, posApi, POSStoreInfo } from "./api"
import { Invoice, invoicingApi } from "@/features/invoicing/api"
import { ThermalReceipt } from "./ThermalReceipt"

interface ReceiptModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sale: Sale | null
  customerPhone?: string | null
  customerGstin?: string | null
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  open,
  onOpenChange,
  sale,
  customerPhone,
  customerGstin,
}) => {
  const navigate = useNavigate()
  const [generatedInvoice, setGeneratedInvoice] = useState<Invoice | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [showTaxInvoiceForm, setShowTaxInvoiceForm] = useState(false)
  const [buyerName, setBuyerName] = useState("")
  const [buyerGstin, setBuyerGstin] = useState("")
  const [buyerState, setBuyerState] = useState("")

  // Thermal printer configuration (persisted across sessions)
  const [printerWidth, setPrinterWidth] = useState<"58mm" | "80mm">(() => {
    try {
      const saved = localStorage.getItem("pos_thermal_printer_width")
      return saved === "58mm" ? "58mm" : "80mm"
    } catch {
      return "80mm"
    }
  })

  // Store information
  const [storeInfo, setStoreInfo] = useState<POSStoreInfo | null>(null)

  // Cash payment tendered tracking
  const [cashTendered, setCashTendered] = useState<string>("")

  // Fetch store info when modal opens
  useEffect(() => {
    if (open) {
      posApi
        .getStoreInfo()
        .then(setStoreInfo)
        .catch(() => {
          // Fallback defaults in ThermalReceipt
        })
    }
  }, [open])

  // Initialize cash tendered when sale is provided
  useEffect(() => {
    if (sale) {
      setCashTendered(parseFloat(sale.total_amount).toFixed(2))
    }
  }, [sale])

  if (!sale) return null

  const handleWidthChange = (w: "58mm" | "80mm") => {
    setPrinterWidth(w)
    try {
      localStorage.setItem("pos_thermal_printer_width", w)
    } catch {
      // Ignored if storage is blocked
    }
  }

  const handlePrint = () => {
    // Native browser printing; print styles in index.css isolate #thermal-receipt-print-area
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

  const grandTotalNum = parseFloat(sale.total_amount) || 0
  const tenderedNum = parseFloat(cashTendered) || 0
  const changeDue = tenderedNum >= grandTotalNum ? tenderedNum - grandTotalNum : 0

  return (
    <>
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
        <div className="space-y-4 max-w-lg mx-auto">
          {/* Header */}
          <DialogHeader className="no-print">
            <div className="flex items-center gap-2 text-emerald-500 justify-center">
              <CheckCircle2 className="h-6 w-6" />
              <DialogTitle className="text-xl text-zinc-100 font-bold">
                Checkout Complete
              </DialogTitle>
            </div>
            <DialogDescription className="text-center text-xs text-zinc-400">
              Transaction finalized and inventory automatically decremented.
            </DialogDescription>
          </DialogHeader>

          {/* Thermal Printer Width Selector & Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-zinc-900/90 p-2.5 rounded-xl border border-white/[0.12] no-print">
            <div className="flex items-center gap-2 text-xs text-zinc-300 font-medium">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              <span>Thermal Printer Format:</span>
            </div>
            <div className="flex items-center gap-1.5 bg-black/60 p-1 rounded-lg border border-white/[0.08]">
              <button
                type="button"
                onClick={() => handleWidthChange("58mm")}
                className={`px-3 py-1 rounded-md text-xs font-mono font-medium transition-all ${
                  printerWidth === "58mm"
                    ? "bg-primary text-white shadow-sm font-bold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                58mm (Compact)
              </button>
              <button
                type="button"
                onClick={() => handleWidthChange("80mm")}
                className={`px-3 py-1 rounded-md text-xs font-mono font-medium transition-all ${
                  printerWidth === "80mm"
                    ? "bg-primary text-white shadow-sm font-bold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                80mm (Standard)
              </button>
            </div>
          </div>

          {/* Cash Tendered & Change Calculator (when payment is cash) */}
          {sale.payment_method === "cash" && (
            <div className="flex items-center justify-between bg-zinc-900/60 px-3.5 py-2.5 rounded-xl border border-white/[0.08] text-xs no-print">
              <div className="text-zinc-300 font-medium">
                <span>Cash Tendered:</span>
                {tenderedNum >= grandTotalNum && (
                  <span className="ml-2 font-mono text-emerald-400 font-semibold">
                    (Change: ₹{changeDue.toFixed(2)})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-400 font-mono">₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  placeholder={grandTotalNum.toFixed(2)}
                  className="w-24 h-7 text-right bg-black text-zinc-100 rounded border border-white/[0.14] px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          )}

          {/* Scrollable Realistic Thermal Receipt Paper Preview */}
          <div className="bg-zinc-950/80 p-3 rounded-xl border border-white/[0.10] flex flex-col items-center max-h-[380px] overflow-y-auto no-print">
            <div className="text-[10px] text-zinc-400 font-mono mb-2 uppercase tracking-wider">
              --- Live {printerWidth} Thermal Paper Slip Preview ---
            </div>
            <div className="shadow-2xl rounded-sm border border-neutral-300 transition-all duration-200">
              <ThermalReceipt
                sale={sale}
                invoice={generatedInvoice}
                storeInfo={storeInfo}
                customerPhone={customerPhone}
                customerGstin={customerGstin}
                width={printerWidth}
                cashTendered={cashTendered}
              />
            </div>
          </div>

          {/* Statutory GST Invoice Section (Preserved A4 & Accounting Flow) */}
          {generatedInvoice ? (
            <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 space-y-2 text-xs no-print">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                  <FileText className="h-4 w-4" />
                  Statutory GST Tax Invoice Linked
                </div>
                <span className="font-mono text-emerald-300 font-semibold">
                  {generatedInvoice.invoice_number}
                </span>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleViewInvoice}
                  className="flex-1 h-8 text-xs border-emerald-500/30 text-emerald-300 hover:bg-emerald-900/30"
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                  View Invoice
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadPdf}
                  className="flex-1 h-8 text-xs border-emerald-500/30 text-emerald-300 hover:bg-emerald-900/30"
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Download A4 PDF
                </Button>
              </div>
            </div>
          ) : showTaxInvoiceForm ? (
            <div className="p-3 rounded-xl border border-blue-500/30 bg-blue-950/20 space-y-2.5 text-xs no-print">
              <div className="font-semibold text-blue-300 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-blue-400" />
                Tax Invoice Recipient Details
              </div>
              <div className="space-y-1.5">
                <Input
                  placeholder="Buyer / Business Name (defaults to customer)"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  className="h-8 text-xs bg-black border-white/[0.14] text-zinc-100"
                />
                <Input
                  placeholder="Buyer GSTIN (Optional, for B2B ITC)"
                  value={buyerGstin}
                  onChange={(e) => setBuyerGstin(e.target.value)}
                  className="h-8 text-xs bg-black border-white/[0.14] text-zinc-100 uppercase font-mono"
                />
                <Input
                  placeholder="Buyer State (e.g. Maharashtra, Delhi)"
                  value={buyerState}
                  onChange={(e) => setBuyerState(e.target.value)}
                  className="h-8 text-xs bg-black border-white/[0.14] text-zinc-100"
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
                  className="h-8 text-xs border-white/[0.14] text-zinc-300"
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
              className="w-full h-9 border-blue-500/30 bg-blue-950/20 hover:bg-blue-900/30 text-blue-300 text-xs font-semibold gap-1.5 no-print"
            >
              <FileText className="h-3.5 w-3.5 text-blue-400" />
              Generate Statutory GST Tax Invoice
            </Button>
          )}

          {/* Modal Actions */}
          <DialogFooter className="flex gap-2 sm:justify-between pt-1 no-print">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="border-white/[0.14] text-zinc-300"
            >
              <X className="h-4 w-4 mr-1.5" />
              Close
            </Button>
            <Button
              size="sm"
              onClick={handlePrint}
              className="bg-primary hover:bg-primary/90 text-white font-semibold shadow-md gap-1.5"
            >
              <Printer className="h-4 w-4" />
              Print Thermal Receipt ({printerWidth})
            </Button>
          </DialogFooter>
        </div>
      </Dialog>

      {/* Dedicated Portal for Browser-Native Thermal Printing */}
      {open &&
        createPortal(
          <div
            id="thermal-receipt-print-area"
            className={printerWidth === "58mm" ? "receipt-58mm" : "receipt-80mm"}
          >
            <ThermalReceipt
              sale={sale}
              invoice={generatedInvoice}
              storeInfo={storeInfo}
              customerPhone={customerPhone}
              customerGstin={customerGstin}
              width={printerWidth}
              cashTendered={cashTendered}
            />
          </div>,
          document.body
        )}
    </>
  )
}
export default ReceiptModal
