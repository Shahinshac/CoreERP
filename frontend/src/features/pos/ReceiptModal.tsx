import React, { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Mail,
  Printer,
  SlidersHorizontal,
  X,
} from "lucide-react"
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

  // Invoice state
  const [invoice, setInvoice] = useState<Invoice | null>(initialInvoice || null)
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [customEmail, setCustomEmail] = useState("")
  const [showEmailInput, setShowEmailInput] = useState(false)

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

  if (!sale) return null

  const handleWidthChange = (w: "58mm" | "80mm") => {
    setPrinterWidth(w)
    try {
      localStorage.setItem("pos_thermal_printer_width", w)
    } catch {
      // Ignored
    }
  }

  const handlePrintA4 = () => {
    document.body.classList.add("printing-a4")
    document.body.classList.remove("printing-thermal")
    window.print()
    setTimeout(() => {
      document.body.classList.remove("printing-a4", "printing-thermal")
    }, 1000)
  }

  const handlePrintThermal = () => {
    document.body.classList.add("printing-thermal")
    document.body.classList.remove("printing-a4")
    window.print()
    setTimeout(() => {
      document.body.classList.remove("printing-a4", "printing-thermal")
    }, 1000)
  }

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

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(val) => {
          if (!val) {
            setShowEmailInput(false)
            setCustomEmail("")
          }
          onOpenChange(val)
        }}
      >
        <div className="space-y-4 max-w-4xl mx-auto w-full no-print">
          {/* Header */}
          <DialogHeader className="no-print">
            <div className="flex items-center gap-2 text-emerald-500 justify-center">
              <CheckCircle2 className="h-6 w-6" />
              <DialogTitle className="text-xl text-zinc-100 font-bold">
                Sale Complete & Finalized
              </DialogTitle>
            </div>
            <DialogDescription className="text-center text-xs text-zinc-400">
              Inventory decremented, GST ledger updated, and sequential tax invoice generated.
            </DialogDescription>
          </DialogHeader>

          {/* Format Selector Tabs & Quick Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-zinc-900/90 p-2.5 rounded-xl border border-white/[0.12] no-print">
            {/* Format toggle: A4 Tax Invoice vs Thermal Slip */}
            <div className="flex items-center gap-1.5 bg-black/60 p-1 rounded-lg border border-white/[0.08] w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setActiveFormat("a4")}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  activeFormat === "a4"
                    ? "bg-primary text-white shadow-sm font-bold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                A4 Tax Invoice (Standard)
              </button>
              <button
                type="button"
                onClick={() => setActiveFormat("thermal")}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  activeFormat === "thermal"
                    ? "bg-primary text-white shadow-sm font-bold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Printer className="h-3.5 w-3.5" />
                Thermal Slip (POS Roll)
              </button>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              {invoice && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowEmailInput((v) => !v)}
                    className="h-8 text-xs border-white/[0.14] text-zinc-300 hover:bg-zinc-800 gap-1"
                    title="Email Invoice to customer"
                  >
                    <Mail className="h-3.5 w-3.5 text-blue-400" />
                    <span>Email</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadPdf}
                    className="h-8 text-xs border-white/[0.14] text-zinc-300 hover:bg-zinc-800 gap-1"
                    title="Download A4 PDF"
                  >
                    <Download className="h-3.5 w-3.5 text-emerald-400" />
                    <span>PDF</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleViewInvoice}
                    className="h-8 text-xs border-white/[0.14] text-zinc-300 hover:bg-zinc-800 gap-1"
                    title="Open Full Invoice View"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-amber-400" />
                    <span>Details</span>
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Email Quick-Send Box */}
          {showEmailInput && invoice && (
            <div className="flex flex-col sm:flex-row items-center gap-2 bg-blue-950/30 p-2.5 rounded-xl border border-blue-500/30 text-xs no-print">
              <span className="text-blue-300 font-medium whitespace-nowrap">
                Recipient Email:
              </span>
              <Input
                type="email"
                placeholder={customer?.email || "customer@example.com"}
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                className="h-8 text-xs bg-black border-white/[0.14] text-zinc-100 flex-1"
              />
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  size="sm"
                  onClick={handleSendEmail}
                  disabled={isSendingEmail}
                  className="h-8 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4"
                >
                  {isSendingEmail ? "Sending..." : "Dispatch Now"}
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

          {/* Cash Tendered & Change (only in cash mode) */}
          {sale.payment_method === "cash" && (
            <div className="flex items-center justify-between bg-zinc-900/60 px-3.5 py-2 rounded-xl border border-white/[0.08] text-xs no-print">
              <div className="text-zinc-300 font-medium">
                <span>Cash Tendered:</span>
                {tenderedNum >= grandTotalNum && (
                  <span className="ml-2 font-mono text-emerald-400 font-semibold">
                    (Change Due: ₹{changeDue.toFixed(2)})
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

          {/* TAB 1: A4 TAX INVOICE PREVIEW */}
          {activeFormat === "a4" && (
            <div className="space-y-2 no-print">
              <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1 font-mono">
                <span>Official Statutory GST Tax Invoice (A4 Standard Format)</span>
                {invoice && (
                  <span className="text-emerald-400 font-bold">
                    {invoice.invoice_number}
                  </span>
                )}
              </div>
              <div className="bg-zinc-950/90 p-4 rounded-xl border border-white/[0.10] max-h-[55vh] overflow-y-auto">
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
            </div>
          )}

          {/* TAB 2: THERMAL RECEIPT SLIP PREVIEW */}
          {activeFormat === "thermal" && (
            <div className="space-y-2 no-print">
              <div className="flex items-center justify-between bg-zinc-900/60 px-3 py-2 rounded-xl border border-white/[0.08]">
                <div className="flex items-center gap-2 text-xs text-zinc-300 font-medium">
                  <SlidersHorizontal className="h-4 w-4 text-primary" />
                  <span>Thermal Roll Width:</span>
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

              <div className="bg-zinc-950/80 p-3 rounded-xl border border-white/[0.10] flex flex-col items-center max-h-[48vh] overflow-y-auto">
                <div className="text-[10px] text-zinc-400 font-mono mb-2 uppercase tracking-wider">
                  --- Live {printerWidth} Thermal Paper Slip Preview ---
                </div>
                <div className="shadow-2xl rounded-sm border border-neutral-300">
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
            </div>
          )}

          {/* Modal Footer Actions */}
          <DialogFooter className="flex flex-col sm:flex-row gap-2 justify-between pt-2 border-t border-white/[0.08] no-print">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="border-white/[0.14] text-zinc-300"
            >
              <X className="h-4 w-4 mr-1.5" />
              Close / New Sale
            </Button>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrintThermal}
                className="border-white/[0.14] text-zinc-300 hover:bg-zinc-800 gap-1.5"
              >
                <Printer className="h-4 w-4" />
                Print Thermal ({printerWidth})
              </Button>

              <Button
                size="sm"
                onClick={handlePrintA4}
                className="bg-primary hover:bg-primary/90 text-white font-semibold shadow-md gap-1.5 px-4"
              >
                <FileText className="h-4 w-4" />
                Print A4 Tax Invoice
              </Button>
            </div>
          </DialogFooter>
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
