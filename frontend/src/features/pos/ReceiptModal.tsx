import React, { useEffect, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import {
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Mail,
  Maximize2,
  Minimize2,
  Printer,
  User,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import { toast } from "sonner"
import { Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Sale, posApi, POSStoreInfo } from "./api"
import { Invoice, invoicingApi } from "@/features/invoicing/api"
import { Customer } from "@/features/customers/api"
import { ThermalReceipt } from "./ThermalReceipt"
import { A4Invoice } from "@/features/invoicing/A4Invoice"

interface ReceiptModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sale: Sale | null
  initialInvoice?: Invoice | null
  customer?: Customer | null
  customerPhone?: string | null
  customerGstin?: string | null
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  open,
  onOpenChange,
  sale,
  initialInvoice,
  customer,
  customerPhone,
  customerGstin,
}) => {
  const navigate = useNavigate()

  // Format mode: "a4" (default standard) | "thermal"
  const [activeFormat, setActiveFormat] = useState<"a4" | "thermal">("a4")

  // Fullscreen state for extra spacious view
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Zoom control for A4 invoice preview (percentage)
  const [zoom, setZoom] = useState<number>(100)

  // Invoice state
  const [invoice, setInvoice] = useState<Invoice | null>(initialInvoice || null)
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [customEmail, setCustomEmail] = useState("")
  const [showEmailInput, setShowEmailInput] = useState(false)
  const [copiedInvoice, setCopiedInvoice] = useState(false)

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

  // Sync initialInvoice or auto-generate invoice if not present
  useEffect(() => {
    if (initialInvoice) {
      setInvoice(initialInvoice)
    } else if (sale && open && !invoice) {
      invoicingApi
        .generateFromSale(sale.id, {
          buyer_name: customer?.name || sale.customer_name || undefined,
          buyer_gstin: customerGstin || customer?.gstin || undefined,
          buyer_state: customer?.state || undefined,
        })
        .then((inv) => {
          setInvoice(inv)
        })
        .catch(() => {
          // If invoice already exists, fetch it from invoices list
          invoicingApi
            .list({ limit: 10 })
            .then((res) => {
              const matched = res.items.find((i) => i.sale_id === sale.id)
              if (matched) setInvoice(matched)
            })
            .catch(() => {})
        })
    }
  }, [initialInvoice, sale, open, customer, customerGstin, invoice])

  // Initialize cash tendered when sale is provided
  useEffect(() => {
    if (sale) {
      setCashTendered(parseFloat(sale.total_amount).toFixed(2))
    }
  }, [sale])

  // Reset states when modal closes
  useEffect(() => {
    if (!open) {
      setShowEmailInput(false)
      setCustomEmail("")
      setIsFullscreen(false)
      setZoom(100)
    }
  }, [open])

  const handleWidthChange = (w: "58mm" | "80mm") => {
    setPrinterWidth(w)
    try {
      localStorage.setItem("pos_thermal_printer_width", w)
    } catch {
      // Ignored
    }
  }

  const handlePrintA4 = useCallback(() => {
    document.body.classList.add("printing-a4")
    document.body.classList.remove("printing-thermal")
    window.print()
    setTimeout(() => {
      document.body.classList.remove("printing-a4", "printing-thermal")
    }, 1000)
  }, [])

  const handlePrintThermal = useCallback(() => {
    document.body.classList.add("printing-thermal")
    document.body.classList.remove("printing-a4")
    window.print()
    setTimeout(() => {
      document.body.classList.remove("printing-a4", "printing-thermal")
    }, 1000)
  }, [])

  const handleCopyInvoiceNumber = () => {
    const invNum = invoice?.invoice_number || sale?.invoice_number
    if (!invNum) return
    navigator.clipboard.writeText(invNum)
    setCopiedInvoice(true)
    toast.success(`Invoice #${invNum} copied to clipboard`)
    setTimeout(() => setCopiedInvoice(false), 2000)
  }

  // Keyboard navigation shortcuts
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      if (e.key === "Escape") {
        e.preventDefault()
        onOpenChange(false)
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault()
        setIsFullscreen((prev) => !prev)
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault()
        if (activeFormat === "a4") {
          handlePrintA4()
        } else {
          handlePrintThermal()
        }
      } else if (e.key === "a" || e.key === "A") {
        e.preventDefault()
        setActiveFormat("a4")
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault()
        setActiveFormat("thermal")
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault()
        setZoom((z) => Math.min(150, z + 10))
      } else if (e.key === "-") {
        e.preventDefault()
        setZoom((z) => Math.max(50, z - 10))
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, activeFormat, handlePrintA4, handlePrintThermal, onOpenChange])

  if (!sale) return null

  const handleDownloadPdf = async () => {
    const invId = invoice?.id
    const invNum = invoice?.invoice_number || sale.invoice_number
    if (!invId) {
      toast.error("Invoice is being generated. Please try again in a moment.")
      return
    }
    try {
      await invoicingApi.downloadPdf(invId, invNum)
      toast.success("A4 Tax Invoice PDF downloaded successfully!")
    } catch {
      toast.error("Failed to download PDF.")
    }
  }

  const handleSendEmail = async () => {
    if (!invoice?.id) {
      toast.error("Invoice not available.")
      return
    }
    setIsSendingEmail(true)
    try {
      const emailToSend = customEmail.trim() || customer?.email || undefined
      await invoicingApi.sendEmail(invoice.id, emailToSend)
      toast.success(
        emailToSend
          ? `Invoice email sent to ${emailToSend}`
          : "Tax Invoice email dispatched successfully!"
      )
      setShowEmailInput(false)
      setCustomEmail("")
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to send invoice email.")
    } finally {
      setIsSendingEmail(false)
    }
  }

  const handleViewInvoice = () => {
    if (!invoice) return
    onOpenChange(false)
    navigate(`/staff/invoices/${invoice.id}`)
  }

  const grandTotalNum = parseFloat(sale.total_amount) || 0
  const tenderedNum = parseFloat(cashTendered) || 0
  const changeDue = tenderedNum >= grandTotalNum ? tenderedNum - grandTotalNum : 0
  const itemsCount = sale.items?.length || 0
  const totalUnits = sale.items?.reduce(
    (acc, curr) => acc + (parseFloat(curr.quantity) || 1),
    0
  ) || 0

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        hideCloseButton
        className={cn(
          "w-full transition-all duration-200 border-white/[0.14] bg-[#0A0A0C] shadow-2xl p-0 overflow-hidden flex flex-col",
          isFullscreen
            ? "fixed inset-2 max-w-none h-[calc(100vh-1rem)] my-0 rounded-2xl"
            : "max-w-6xl w-[96vw] h-[92vh] max-h-[94vh] rounded-2xl"
        )}
      >
        <div className="flex flex-col h-full w-full select-none-headers no-print overflow-hidden">
          {/* 1. HERO COMPLETION & FINALIZED HEADER BAR */}
          <div className="bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-zinc-900 px-5 sm:px-6 py-3.5 border-b border-white/[0.10] flex flex-wrap items-center justify-between gap-3 shrink-0">
            {/* Title & Celebration */}
            <div className="flex items-center gap-3.5">
              <div className="h-11 w-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/10 shrink-0">
                <CheckCircle2 className="h-6 w-6 animate-in zoom-in-50 duration-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                    Sale Complete & Finalized
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Success
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span className="text-zinc-300 font-medium">
                    {itemsCount} {itemsCount === 1 ? "Item" : "Items"} ({totalUnits}{" "}
                    {totalUnits === 1 ? "unit" : "units"})
                  </span>
                  <span className="text-zinc-600">•</span>
                  <span>Stock decremented</span>
                  <span className="text-zinc-600">•</span>
                  <span>GST synchronized</span>
                  <span className="text-zinc-600">•</span>
                  <span className="text-emerald-400 font-medium">Invoice Generated</span>
                </p>
              </div>
            </div>

            {/* Quick Key Metrics Ribbon */}
            <div className="flex items-center gap-2.5 sm:gap-3 ml-auto">
              {/* Grand Total Amount Paid */}
              <div className="bg-zinc-950/80 border border-emerald-500/30 rounded-xl px-3.5 py-1.5 text-right shadow-inner">
                <div className="text-[9px] uppercase font-bold text-zinc-400 tracking-wider">
                  Total Paid
                </div>
                <div className="text-base sm:text-lg font-black font-mono text-emerald-400 leading-tight">
                  ₹{grandTotalNum.toFixed(2)}
                </div>
              </div>

              {/* Invoice Number Pill with Quick Copy */}
              <div className="bg-zinc-950/80 border border-white/[0.12] rounded-xl px-3 py-1.5 text-left hidden sm:block">
                <div className="text-[9px] uppercase font-bold text-zinc-400 tracking-wider">
                  Tax Invoice #
                </div>
                <div className="flex items-center gap-1.5 leading-tight">
                  <span className="text-xs font-bold font-mono text-zinc-100">
                    {invoice?.invoice_number || sale.invoice_number || "INV-PENDING"}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyInvoiceNumber}
                    className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-zinc-100 transition-colors"
                    title="Copy Invoice Number"
                  >
                    {copiedInvoice ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Fullscreen & Close Controls */}
              <div className="flex items-center gap-1 pl-1.5 border-l border-white/[0.10]">
                <button
                  type="button"
                  onClick={() => setIsFullscreen((prev) => !prev)}
                  className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors"
                  title={isFullscreen ? "Exit Fullscreen (F)" : "Large Fullscreen View (F)"}
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors"
                  title="Close / New Sale (Esc)"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* 2. TRANSACTION SUMMARY & CASH TENDERED STRIP */}
          <div className="bg-zinc-900/60 border-b border-white/[0.08] px-5 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2.5 text-xs shrink-0">
            <div className="flex items-center gap-3 sm:gap-4 flex-wrap text-zinc-300">
              {/* Customer details */}
              <div className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-zinc-400" />
                <span className="text-zinc-400">Customer:</span>
                <span className="font-semibold text-zinc-100">
                  {customer?.name || sale.customer_name || "Walk-in Customer"}
                </span>
                {(customerPhone || customer?.phone) && (
                  <span className="text-zinc-400 font-mono text-[11px]">
                    ({customerPhone || customer?.phone})
                  </span>
                )}
                {customerGstin && (
                  <span className="text-emerald-400 font-mono text-[10px] bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                    GST: {customerGstin}
                  </span>
                )}
              </div>

              {/* Payment Method */}
              <div className="flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5 text-zinc-400" />
                <span className="text-zinc-400">Method:</span>
                <span className="uppercase font-bold text-zinc-200 px-2 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-[11px]">
                  {sale.payment_method}
                </span>
              </div>
            </div>

            {/* Cash Tendered & Change Calculation (in cash mode) */}
            {sale.payment_method === "cash" && (
              <div className="flex items-center gap-2.5 bg-zinc-950/80 px-3 py-1 rounded-lg border border-white/[0.10]">
                <span className="text-zinc-400 text-[11px]">Cash Tendered:</span>
                <div className="flex items-center gap-1">
                  <span className="text-zinc-400 font-mono text-xs">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    placeholder={grandTotalNum.toFixed(2)}
                    className="w-20 h-6 text-right bg-black text-zinc-100 rounded border border-white/[0.14] px-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                {tenderedNum >= grandTotalNum && (
                  <span className="font-mono text-emerald-400 font-bold text-xs pl-2 border-l border-white/[0.12]">
                    Change Due: ₹{changeDue.toFixed(2)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 3. FORMAT SELECTOR, ZOOM & TOOLBAR */}
          <div className="bg-zinc-900/90 px-5 sm:px-6 py-2.5 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-3 shrink-0">
            {/* Format Toggle Pill */}
            <div className="flex items-center gap-1 bg-black/60 p-1 rounded-xl border border-white/[0.08]">
              <button
                type="button"
                onClick={() => setActiveFormat("a4")}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  activeFormat === "a4"
                    ? "bg-primary text-white shadow-md font-bold"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                <FileText className="h-3.5 w-3.5" />
                A4 Tax Invoice (GST Standard)
              </button>
              <button
                type="button"
                onClick={() => setActiveFormat("thermal")}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  activeFormat === "thermal"
                    ? "bg-primary text-white shadow-md font-bold"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                <Printer className="h-3.5 w-3.5" />
                Thermal Slip (POS Roll)
              </button>
            </div>

            {/* Thermal Slip Width Selector */}
            {activeFormat === "thermal" && (
              <div className="flex items-center gap-2 bg-black/50 px-2 py-1 rounded-lg border border-white/[0.08]">
                <span className="text-[11px] text-zinc-400 font-medium">Roll Width:</span>
                <button
                  type="button"
                  onClick={() => handleWidthChange("58mm")}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs font-mono font-medium transition-all",
                    printerWidth === "58mm"
                      ? "bg-primary text-white font-bold"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  58mm (Compact)
                </button>
                <button
                  type="button"
                  onClick={() => handleWidthChange("80mm")}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs font-mono font-medium transition-all",
                    printerWidth === "80mm"
                      ? "bg-primary text-white font-bold"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  80mm (Standard)
                </button>
              </div>
            )}

            {/* A4 Zoom & Fit Viewport Controls */}
            {activeFormat === "a4" && (
              <div className="flex items-center gap-1.5 bg-black/50 px-2 py-1 rounded-lg border border-white/[0.08]">
                <span className="text-[11px] text-zinc-400 font-medium px-1">View:</span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(50, z - 10))}
                  className="p-1 hover:bg-white/10 rounded text-zinc-300 hover:text-white transition-colors"
                  title="Zoom Out (-10%) [Shortcut: -]"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs font-mono font-bold text-zinc-200 w-11 text-center">
                  {zoom}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(150, z + 10))}
                  className="p-1 hover:bg-white/10 rounded text-zinc-300 hover:text-white transition-colors"
                  title="Zoom In (+10%) [Shortcut: +]"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(100)}
                  className="text-[11px] text-zinc-400 hover:text-zinc-200 px-2 py-0.5 hover:bg-white/10 rounded font-mono transition-colors"
                  title="Reset to 100%"
                >
                  100%
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(85)}
                  className="text-[11px] text-primary hover:text-primary/80 px-2 py-0.5 hover:bg-primary/10 rounded font-medium transition-colors"
                  title="Fit whole page in view"
                >
                  Fit Page
                </button>
              </div>
            )}

            {/* Action Buttons: Email, Download PDF, Details */}
            <div className="flex items-center gap-2">
              {invoice && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowEmailInput((v) => !v)}
                    className="h-8 text-xs border-white/[0.14] text-zinc-300 hover:bg-zinc-800 gap-1.5"
                    title="Send Tax Invoice to Customer via Email"
                  >
                    <Mail className="h-3.5 w-3.5 text-blue-400" />
                    <span>Email</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadPdf}
                    className="h-8 text-xs border-white/[0.14] text-zinc-300 hover:bg-zinc-800 gap-1.5"
                    title="Download Official A4 Tax Invoice PDF"
                  >
                    <Download className="h-3.5 w-3.5 text-emerald-400" />
                    <span>PDF</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleViewInvoice}
                    className="h-8 text-xs border-white/[0.14] text-zinc-300 hover:bg-zinc-800 gap-1.5"
                    title="Open Full Ledger Invoice Page"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-amber-400" />
                    <span>Details</span>
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* 4. EXPANDABLE EMAIL INPUT DRAWER */}
          {showEmailInput && invoice && (
            <div className="bg-blue-950/40 px-5 sm:px-6 py-2.5 border-b border-blue-500/30 flex flex-col sm:flex-row items-center gap-2.5 text-xs shrink-0 animate-in slide-in-from-top-2 duration-150">
              <span className="text-blue-300 font-medium whitespace-nowrap flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                Recipient Email:
              </span>
              <Input
                type="email"
                placeholder={customer?.email || "customer@example.com"}
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                className="h-8 text-xs bg-black/80 border-white/[0.14] text-zinc-100 flex-1 max-w-md"
              />
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  size="sm"
                  onClick={handleSendEmail}
                  disabled={isSendingEmail}
                  className="h-8 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4"
                >
                  {isSendingEmail ? "Dispatching..." : "Send Invoice Now"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowEmailInput(false)}
                  className="h-8 text-xs border-white/[0.14] text-zinc-300"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* 5. LARGE & FULLY VISIBLE DOCUMENT WORKSPACE */}
          <div className="flex-1 min-h-0 overflow-y-auto bg-zinc-950/95 p-4 sm:p-6 md:p-8 flex justify-center items-start">
            {activeFormat === "a4" ? (
              <div
                className="transition-transform duration-150 ease-out origin-top mx-auto"
                style={{
                  transform: `scale(${zoom / 100})`,
                  transformOrigin: "top center",
                  marginBottom: zoom > 100 ? `${(zoom - 100) * 10}px` : "2rem",
                }}
              >
                <A4Invoice
                  invoice={invoice}
                  sale={sale}
                  customer={customer}
                  sellerName={storeInfo?.store_name}
                  sellerPhone={storeInfo?.phone || undefined}
                  sellerAddress={storeInfo?.address || undefined}
                  sellerGstin={storeInfo?.gstin}
                  sellerState={storeInfo?.state}
                  sellerStateCode={storeInfo?.state_code || undefined}
                  sellerUpiId={storeInfo?.upi_id || undefined}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center py-4">
                <div className="text-[11px] text-zinc-400 font-mono mb-3 uppercase tracking-wider bg-zinc-900/90 px-3 py-1 rounded-full border border-white/[0.08]">
                  --- Live {printerWidth} POS Roll Preview ---
                </div>
                <div className="shadow-2xl rounded-sm border border-neutral-300 bg-white">
                  <ThermalReceipt
                    sale={sale}
                    invoice={invoice}
                    storeInfo={storeInfo}
                    customerPhone={customerPhone}
                    customerGstin={customerGstin}
                    width={printerWidth}
                    cashTendered={cashTendered}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 6. MODAL FOOTER ACTIONS */}
          <div className="bg-zinc-900 px-5 sm:px-6 py-3 border-t border-white/[0.10] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 text-xs text-zinc-400">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="border-white/[0.14] text-zinc-300 hover:bg-zinc-800 gap-1.5 h-9"
              >
                <X className="h-4 w-4" />
                Close / New Sale <span className="text-[10px] text-zinc-500 font-mono ml-1">(Esc)</span>
              </Button>
              <span className="hidden sm:inline text-zinc-600">•</span>
              <span className="hidden sm:inline text-zinc-400 text-xs">
                Statutory GST Invoice registered & ready for distribution.
              </span>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrintThermal}
                className="border-white/[0.14] text-zinc-300 hover:bg-zinc-800 gap-2 h-9 px-4 font-medium"
              >
                <Printer className="h-4 w-4 text-amber-400" />
                Print Thermal ({printerWidth})
              </Button>

              <Button
                size="sm"
                onClick={handlePrintA4}
                className="bg-primary hover:bg-primary/90 text-white font-bold shadow-lg shadow-primary/20 gap-2 h-9 px-5"
              >
                <Printer className="h-4 w-4" />
                Print A4 Tax Invoice
              </Button>
            </div>
          </div>
        </div>
      </Dialog>

      {/* Dedicated Portal for Browser-Native A4 Invoice Printing */}
      {open &&
        createPortal(
          <div id="a4-invoice-print-area">
            <A4Invoice
              invoice={invoice}
              sale={sale}
              customer={customer}
              sellerName={storeInfo?.store_name}
              sellerPhone={storeInfo?.phone || undefined}
              sellerAddress={storeInfo?.address || undefined}
              sellerGstin={storeInfo?.gstin}
              sellerState={storeInfo?.state}
              sellerStateCode={storeInfo?.state_code || undefined}
              sellerUpiId={storeInfo?.upi_id || undefined}
            />
          </div>,
          document.body
        )}

      {/* Dedicated Portal for Browser-Native Thermal Printing */}
      {open &&
        createPortal(
          <div
            id="thermal-receipt-print-area"
            className={printerWidth === "58mm" ? "receipt-58mm" : "receipt-80mm"}
          >
            <ThermalReceipt
              sale={sale}
              invoice={invoice}
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
