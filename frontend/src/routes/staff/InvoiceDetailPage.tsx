import React, { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  ArrowLeft,
  Building,
  Calendar,
  CreditCard,
  Download,
  ExternalLink,
  Printer,
  QrCode,
  RotateCcw,
  User,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CreditNoteModal } from "@/features/invoicing/CreditNoteModal"
import { Invoice, invoicingApi } from "@/features/invoicing/api"
import { Payment, paymentsApi } from "@/features/payments/api"
import { PaymentRecordModal } from "@/features/payments/PaymentRecordModal"
import { UPIQRModal } from "@/features/payments/UPIQRModal"

export const InvoiceDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [isDownloading, setIsDownloading] = useState(false)
  const [creditNoteModalOpen, setCreditNoteModalOpen] = useState(false)

  // Payments State
  const [payments, setPayments] = useState<Payment[]>([])
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [upiModalOpen, setUpiModalOpen] = useState(false)

  const fetchInvoice = async () => {
    if (!id) return
    setLoading(true)
    try {
      const data = await invoicingApi.get(id)
      setInvoice(data)
    } catch {
      toast.error("Failed to load invoice details.")
      navigate("/staff/invoices")
    } finally {
      setLoading(false)
    }
  }

  const fetchPayments = async () => {
    if (!id) return
    try {
      const res = await paymentsApi.list({ invoice_id: id })
      setPayments(res.items)
    } catch {
      // Non-blocking silently on initial payment fetch
    }
  }

  useEffect(() => {
    fetchInvoice()
    fetchPayments()
  }, [id])

  // Total paid calculation
  const totalPaid = payments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + parseFloat(p.amount), 0)

  const remainingBalance = invoice
    ? Math.max(0, parseFloat(invoice.grand_total) - totalPaid)
    : 0

  const handleDownloadPdf = async () => {
    if (!invoice) return
    setIsDownloading(true)
    try {
      await invoicingApi.downloadPdf(invoice.id, invoice.invoice_number)
      toast.success("Tax Invoice PDF downloaded successfully!")
    } catch (err: any) {
      toast.error(err.message || "Failed to download PDF.")
    } finally {
      setIsDownloading(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-slate-500">Loading statutory tax invoice...</p>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="text-center py-20 space-y-3">
        <p className="text-slate-500">Invoice not found.</p>
        <Button onClick={() => navigate("/staff/invoices")} variant="outline" size="sm">
          Return to Invoices
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/staff/invoices")}
            className="h-9 gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Invoices
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground font-mono">
              {invoice.invoice_number}
            </h1>
            <p className="text-xs text-muted-foreground">
              Financial Year: {invoice.financial_year} • Issued on {new Date(invoice.invoice_date).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="h-9 gap-1.5"
          >
            <Printer className="h-4 w-4" />
            Print
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadPdf}
            disabled={isDownloading}
            className="h-9 gap-1.5"
          >
            <Download className="h-4 w-4" />
            {isDownloading ? "Streaming PDF..." : "Download Official PDF"}
          </Button>

          {!invoice.is_cancelled && remainingBalance > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUpiModalOpen(true)}
                className="h-9 gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                <QrCode className="h-4 w-4" />
                Scan UPI QR
              </Button>

              <Button
                size="sm"
                onClick={() => setPaymentModalOpen(true)}
                className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm"
              >
                <CreditCard className="h-4 w-4" />
                Record Payment
              </Button>
            </>
          )}

          {!invoice.is_cancelled && (
            <Button
              size="sm"
              onClick={() => setCreditNoteModalOpen(true)}
              className="h-9 gap-1.5 bg-rose-600 hover:bg-rose-700 text-white"
            >
              <RotateCcw className="h-4 w-4" />
              Issue Credit Note
            </Button>
          )}
        </div>
      </div>

      {/* Main Invoice Document Container (Paper style) */}
      <div className="bg-card rounded-xl border border-white/[0.14] shadow-none p-6 sm:p-8 space-y-6 print:border-none print:shadow-none print:p-0">
        {/* Document Header */}
        <div className="border-b border-white/[0.10] pb-5 space-y-2">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded">
                GST Tax Invoice
              </span>
              <h2 className="text-2xl font-black text-zinc-100 mt-1">TAX INVOICE</h2>
              <p className="text-[11px] text-zinc-400">
                (Issued under Section 31 of the Central Goods and Services Tax Act, 2017)
              </p>
            </div>

            <div className="text-right space-y-1">
              <div className="flex items-center gap-2 sm:justify-end">
                <span className="text-xs text-zinc-400">Status:</span>
                {invoice.is_cancelled ? (
                  <Badge variant="destructive" className="uppercase font-semibold">
                    Cancelled / Reversed
                  </Badge>
                ) : invoice.payment_status === "paid" ? (
                  <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase font-semibold">Paid</Badge>
                ) : (
                  <Badge variant="outline" className="text-amber-400 border-amber-500/20 bg-amber-500/10 uppercase font-semibold">
                    {invoice.payment_status}
                  </Badge>
                )}
              </div>
              <div className="font-mono text-xs text-zinc-400">
                Supply: <span className="font-semibold text-zinc-200">{invoice.is_inter_state ? "Inter-State (IGST)" : "Intra-State (CGST + SGST)"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Supplier & Recipient 2-Column Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Supplier (Seller) */}
          <div className="bg-surface-elevated p-4 rounded-xl border border-white/[0.10] space-y-2 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-zinc-100 pb-1 border-b border-white/[0.08]">
              <Building className="h-4 w-4 text-primary" />
              DETAILS OF SUPPLIER
            </div>
            <div className="text-sm font-bold text-zinc-100">{invoice.seller_name}</div>
            <div className="text-zinc-400 leading-relaxed whitespace-pre-line">{invoice.seller_address || "Store Address"}</div>
            <div className="pt-1 space-y-0.5 font-mono">
              <div>
                <span className="text-zinc-400 font-sans">GSTIN: </span>
                <span className="font-semibold text-zinc-200">{invoice.seller_gstin}</span>
              </div>
              <div>
                <span className="text-zinc-400 font-sans">State: </span>
                <span className="text-zinc-300">{invoice.seller_state} (Code: {invoice.seller_state_code || "N/A"})</span>
              </div>
              {invoice.seller_phone && (
                <div>
                  <span className="text-zinc-400 font-sans">Contact: </span>
                  <span className="text-zinc-300">{invoice.seller_phone}</span>
                </div>
              )}
            </div>
          </div>

          {/* Recipient (Buyer) */}
          <div className="bg-surface-elevated p-4 rounded-xl border border-white/[0.10] space-y-2 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-zinc-100 pb-1 border-b border-white/[0.08]">
              <User className="h-4 w-4 text-emerald-400" />
              DETAILS OF RECIPIENT / BILLED TO
            </div>
            <div className="text-sm font-bold text-zinc-100">{invoice.buyer_name}</div>
            <div className="text-zinc-400 leading-relaxed whitespace-pre-line">
              {invoice.buyer_address || "Over-the-counter Walk-in Customer"}
            </div>
            <div className="pt-1 space-y-0.5 font-mono">
              <div>
                <span className="text-zinc-400 font-sans">GSTIN: </span>
                <span className="font-semibold text-zinc-200">
                  {invoice.buyer_gstin || "Unregistered / Consumer"}
                </span>
              </div>
              <div>
                <span className="text-zinc-400 font-sans">Place of Supply: </span>
                <span className="font-semibold text-zinc-200">{invoice.place_of_supply}</span>
              </div>
              {invoice.buyer_phone && (
                <div>
                  <span className="text-zinc-400 font-sans">Contact: </span>
                  <span className="text-zinc-300">{invoice.buyer_phone}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Invoice Metadata Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-surface-elevated p-3 rounded-lg border border-white/[0.10] text-xs font-mono">
          <div>
            <span className="text-zinc-400 block text-[10px] font-sans">Invoice No:</span>
            <span className="font-bold text-zinc-100">{invoice.invoice_number}</span>
          </div>
          <div>
            <span className="text-zinc-400 block text-[10px] font-sans">Invoice Date:</span>
            <span className="font-semibold text-zinc-200">
              {new Date(invoice.invoice_date).toLocaleDateString()}
            </span>
          </div>
          <div>
            <span className="text-zinc-400 block text-[10px] font-sans">Financial Year:</span>
            <span className="font-semibold text-zinc-200">{invoice.financial_year}</span>
          </div>
          <div>
            <span className="text-zinc-400 block text-[10px] font-sans">Reverse Charge:</span>
            <span className="font-semibold text-zinc-200">Applicable (No)</span>
          </div>
        </div>

        {/* Line Items Table with Complete GST Breakdown */}
        <div className="overflow-x-auto rounded-lg border border-white/[0.14]">
          <table className="w-full text-xs text-left">
            <thead className="bg-white/[0.02] text-zinc-300 font-bold border-b border-white/[0.10]">
              <tr>
                <th className="py-2.5 px-3 w-8">#</th>
                <th className="py-2.5 px-3">Description of Goods</th>
                <th className="py-2.5 px-3 text-center">HSN</th>
                <th className="py-2.5 px-3 text-right">Qty</th>
                <th className="py-2.5 px-3 text-right">Unit Price</th>
                <th className="py-2.5 px-3 text-right">Taxable Val</th>
                {invoice.is_inter_state ? (
                  <>
                    <th className="py-2.5 px-3 text-right">IGST %</th>
                    <th className="py-2.5 px-3 text-right">IGST Amt</th>
                  </>
                ) : (
                  <>
                    <th className="py-2.5 px-3 text-right">CGST</th>
                    <th className="py-2.5 px-3 text-right">SGST</th>
                  </>
                )}
                <th className="py-2.5 px-3 text-right font-bold">Total (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] font-mono">
              {invoice.items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-white/[0.04]">
                  <td className="py-2.5 px-3 text-zinc-400">{idx + 1}</td>
                  <td className="py-2.5 px-3 font-sans">
                    <div className="font-semibold text-zinc-100">{item.product_name}</div>
                    <div className="text-[10px] text-zinc-400 font-mono">SKU: {item.product_sku}</div>
                  </td>
                  <td className="py-2.5 px-3 text-center text-zinc-400">{item.hsn_code || "—"}</td>
                  <td className="py-2.5 px-3 text-right text-zinc-300">{parseFloat(item.quantity).toFixed(2)}</td>
                  <td className="py-2.5 px-3 text-right text-zinc-300">₹{parseFloat(item.unit_price).toFixed(2)}</td>
                  <td className="py-2.5 px-3 text-right font-medium text-zinc-100">
                    ₹{parseFloat(item.taxable_value).toFixed(2)}
                  </td>
                  {invoice.is_inter_state ? (
                    <>
                      <td className="py-2.5 px-3 text-right text-zinc-300">{parseFloat(item.igst_rate).toFixed(1)}%</td>
                      <td className="py-2.5 px-3 text-right text-zinc-300">₹{parseFloat(item.igst_amount).toFixed(2)}</td>
                    </>
                  ) : (
                    <>
                      <td className="py-2.5 px-3 text-right text-zinc-300">
                        ₹{parseFloat(item.cgst_amount).toFixed(2)}
                        <span className="text-[10px] text-zinc-400 block">({parseFloat(item.cgst_rate).toFixed(1)}%)</span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-zinc-300">
                        ₹{parseFloat(item.sgst_amount).toFixed(2)}
                        <span className="text-[10px] text-zinc-400 block">({parseFloat(item.sgst_rate).toFixed(1)}%)</span>
                      </td>
                    </>
                  )}
                  <td className="py-2.5 px-3 text-right font-bold text-zinc-100">
                    ₹{parseFloat(item.total_amount).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary Totals & Statutory Signature */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 pt-2">
          {/* Notes & Legal Declarations (7 cols) */}
          <div className="sm:col-span-7 space-y-3 text-xs text-zinc-400">
            <div className="p-3 rounded-lg border border-white/[0.10] bg-surface-elevated space-y-1">
              <span className="font-bold text-zinc-200 block">Terms & Conditions:</span>
              <p>1. Goods once sold will be accepted only pursuant to formal Credit Note reversal rules.</p>
              <p>2. Reverse Charge: Tax is NOT payable on reverse charge basis.</p>
              <p>3. This is an authentic system-generated GST Tax Invoice under Section 31 of the CGST Act, 2017.</p>
            </div>
            {invoice.notes && (
              <div className="text-[11px] text-zinc-400 italic">
                Notes: {invoice.notes}
              </div>
            )}
          </div>

          {/* Grand Totals Card (5 cols) */}
          <div className="sm:col-span-5 space-y-2 font-mono text-xs">
            <div className="p-4 rounded-xl border border-white/[0.14] bg-surface-elevated space-y-2">
              <div className="flex justify-between text-zinc-400">
                <span className="font-sans">Taxable Subtotal:</span>
                <span className="font-semibold text-zinc-100">₹{parseFloat(invoice.subtotal).toFixed(2)}</span>
              </div>

              {invoice.is_inter_state ? (
                <div className="flex justify-between text-zinc-400">
                  <span className="font-sans">Integrated Tax (IGST):</span>
                  <span className="text-zinc-200">₹{parseFloat(invoice.igst_amount).toFixed(2)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-zinc-400">
                    <span className="font-sans">Central Tax (CGST):</span>
                    <span className="text-zinc-200">₹{parseFloat(invoice.cgst_amount).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span className="font-sans">State Tax (SGST):</span>
                    <span className="text-zinc-200">₹{parseFloat(invoice.sgst_amount).toFixed(2)}</span>
                  </div>
                </>
              )}

              <div className="flex justify-between text-zinc-400 pt-1 border-t border-white/[0.10]">
                <span className="font-sans">Total Tax Amount:</span>
                <span className="font-semibold text-zinc-100">₹{parseFloat(invoice.total_tax).toFixed(2)}</span>
              </div>

              <div className="flex justify-between items-baseline pt-2 border-t-2 border-white/[0.16]">
                <span className="font-sans text-sm font-bold text-zinc-100">Grand Total:</span>
                <span className="text-xl font-black text-emerald-400">
                  ₹{parseFloat(invoice.grand_total).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Credit Notes Section (if any issued) */}
        {invoice.credit_notes && invoice.credit_notes.length > 0 && (
          <div className="mt-6 pt-5 border-t border-slate-200 space-y-3">
            <div className="flex items-center gap-2 text-rose-600 font-bold text-xs">
              <RotateCcw className="h-4 w-4" />
              ASSOCIATED CREDIT NOTES (REVERSALS)
            </div>
            <div className="space-y-2">
              {invoice.credit_notes.map((cn) => (
                <div
                  key={cn.id}
                  className="p-3 rounded-lg border border-rose-200 bg-rose-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center text-xs font-mono gap-2"
                >
                  <div>
                    <span className="font-bold text-rose-800">{cn.credit_note_number}</span>
                    <span className="text-slate-500 font-sans ml-2">({new Date(cn.credit_note_date).toLocaleDateString()})</span>
                    <div className="text-[11px] text-slate-600 font-sans mt-0.5">Reason: {cn.reason}</div>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 font-sans">Refunded: </span>
                    <span className="font-bold text-rose-700">₹{parseFloat(cn.grand_total_refunded).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* EMI Financing Plan Card */}
        {invoice.emi_plan && (
          <div className="mt-6 pt-5 border-t border-border space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-foreground font-bold text-xs">
                <Calendar className="h-4 w-4 text-sky-500" />
                LINKED EMI FINANCING PLAN
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/staff/emi/${invoice.emi_plan?.id}`)}
                className="h-7 text-xs gap-1.5 text-sky-600 border-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/40"
              >
                <span>View Full EMI Schedule & Collect</span>
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-sky-500/5 border border-sky-200/50 rounded-xl text-xs">
              <div>
                <span className="text-muted-foreground text-[10px] uppercase font-medium">Financed Principal</span>
                <div className="font-mono font-bold text-foreground text-sm">₹{parseFloat(invoice.emi_plan.principal).toFixed(2)}</div>
              </div>
              <div>
                <span className="text-muted-foreground text-[10px] uppercase font-medium">Down Payment</span>
                <div className="font-mono font-bold text-emerald-600 text-sm">₹{parseFloat(invoice.emi_plan.down_payment).toFixed(2)}</div>
              </div>
              <div>
                <span className="text-muted-foreground text-[10px] uppercase font-medium">Monthly Installment</span>
                <div className="font-mono font-bold text-sky-600 text-sm">₹{parseFloat(invoice.emi_plan.installment_amount).toFixed(2)}/mo</div>
              </div>
              <div>
                <span className="text-muted-foreground text-[10px] uppercase font-medium">Tenure & Status</span>
                <div className="font-medium text-foreground">
                  {invoice.emi_plan.number_of_installments} Months • <Badge variant="outline" className="text-[10px] uppercase font-bold text-sky-600 border-sky-300">{invoice.emi_plan.status}</Badge>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Payment History & Settlement Ledger */}
        <div className="mt-6 pt-5 border-t border-border space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-foreground font-bold text-xs">
              <CreditCard className="h-4 w-4 text-emerald-600" />
              PAYMENT HISTORY & SETTLEMENT LEDGER
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-slate-500 font-sans">
                Settled: <span className="font-bold text-emerald-600 font-mono">₹{totalPaid.toFixed(2)}</span>
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-slate-500 font-sans">
                Balance:{" "}
                <span className={`font-bold font-mono ${remainingBalance > 0 ? "text-amber-600" : "text-slate-600"}`}>
                  ₹{remainingBalance.toFixed(2)}
                </span>
              </span>
            </div>
          </div>

          {payments.length === 0 ? (
            <div className="p-6 rounded-xl border border-dashed border-slate-200 text-center space-y-2 bg-slate-50/50">
              <p className="text-xs text-slate-500">
                No payments have been recorded for this invoice yet.
              </p>
              {!invoice.is_cancelled && (
                <div className="flex items-center justify-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPaymentModalOpen(true)}
                    className="h-8 text-xs gap-1.5"
                  >
                    <CreditCard className="h-3.5 w-3.5 text-emerald-600" />
                    Record First Payment
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-sans">
                    <th className="py-2.5 px-3 text-left font-semibold">Payment ID / Date</th>
                    <th className="py-2.5 px-3 text-left font-semibold">Method</th>
                    <th className="py-2.5 px-3 text-left font-semibold">Reference / Gateway ID</th>
                    <th className="py-2.5 px-3 text-center font-semibold">Status</th>
                    <th className="py-2.5 px-3 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/50 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-foreground">
                          {p.id.slice(0, 8)}...
                        </div>
                        <div className="text-[10px] text-muted-foreground font-sans">
                          {new Date(p.created_at).toLocaleString()}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium uppercase bg-muted text-foreground">
                          {p.method}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">
                        {p.reference_id || <span className="text-muted-foreground/60 italic font-sans">Direct Cash / N/A</span>}
                      </td>
                      <td className="py-2.5 px-3 text-center font-sans">
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase font-bold ${
                            p.status === "paid"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400"
                              : p.status === "failed"
                              ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400"
                              : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400"
                          }`}
                        >
                          {p.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-foreground font-mono">
                        ₹{parseFloat(p.amount).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Credit Note Reversal Modal */}
      <CreditNoteModal
        open={creditNoteModalOpen}
        onOpenChange={setCreditNoteModalOpen}
        invoice={invoice}
        onSuccess={() => {
          fetchInvoice()
          fetchPayments()
        }}
      />

      {/* Payment Recording Modal */}
      <PaymentRecordModal
        open={paymentModalOpen}
        onOpenChange={setPaymentModalOpen}
        invoice={invoice}
        remainingBalance={remainingBalance}
        onSuccess={() => {
          fetchInvoice()
          fetchPayments()
        }}
        onOpenUpiQr={() => {
          setPaymentModalOpen(false)
          setUpiModalOpen(true)
        }}
      />

      {/* Static UPI QR Modal */}
      <UPIQRModal
        open={upiModalOpen}
        onOpenChange={setUpiModalOpen}
        invoice={invoice}
        onRecordPayment={() => {
          setUpiModalOpen(false)
          setPaymentModalOpen(true)
        }}
      />
    </div>
  )
}
export default InvoiceDetailPage
