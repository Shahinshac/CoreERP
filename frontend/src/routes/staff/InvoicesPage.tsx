import React, { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileCheck,
  FileText,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Invoice, invoicingApi, Quotation, quotationsApi } from "@/features/invoicing/api"
import { QuotationCreateModal } from "@/features/invoicing/QuotationCreateModal"
import { QuotationDetailModal } from "@/features/invoicing/QuotationDetailModal"

export const InvoicesPage: React.FC = () => {
  const navigate = useNavigate()

  // Active Tab: 'invoices' | 'quotations'
  const [activeTab, setActiveTab] = useState<"invoices" | "quotations">("invoices")

  // Invoices State
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [invoiceTotal, setInvoiceTotal] = useState(0)
  const [invoicePage, setInvoicePage] = useState(1)
  const [invoiceLimit] = useState(15)
  const [invoiceLoading, setInvoiceLoading] = useState(true)

  // Invoices Filters
  const [invoiceSearch, setInvoiceSearch] = useState("")
  const [paymentStatus, setPaymentStatus] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  // Quotations State
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [quotationTotal, setQuotationTotal] = useState(0)
  const [quotationPage, setQuotationPage] = useState(1)
  const [quotationLimit] = useState(15)
  const [quotationLoading, setQuotationLoading] = useState(false)

  // Quotations Filters
  const [quotationSearch, setQuotationSearch] = useState("")
  const [quotationStatus, setQuotationStatus] = useState("")

  // Quotation Modals
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null)
  const [detailModalOpen, setDetailModalOpen] = useState(false)

  const loadInvoices = async () => {
    setInvoiceLoading(true)
    try {
      const data = await invoicingApi.list({
        search: invoiceSearch.trim() || undefined,
        payment_status: paymentStatus || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        page: invoicePage,
        limit: invoiceLimit,
      })
      setInvoices(data.items)
      setInvoiceTotal(data.total)
    } catch {
      toast.error("Failed to load invoices.")
    } finally {
      setInvoiceLoading(false)
    }
  }

  const loadQuotations = async () => {
    setQuotationLoading(true)
    try {
      const data = await quotationsApi.list({
        search: quotationSearch.trim() || undefined,
        status: quotationStatus || undefined,
        page: quotationPage,
        limit: quotationLimit,
      })
      setQuotations(data.items)
      setQuotationTotal(data.total)
    } catch {
      toast.error("Failed to load quotations.")
    } finally {
      setQuotationLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === "invoices") {
      loadInvoices()
    } else {
      loadQuotations()
    }
  }, [activeTab, invoicePage, paymentStatus, startDate, endDate, quotationPage, quotationStatus])

  const handleInvoiceSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setInvoicePage(1)
    loadInvoices()
  }

  const handleQuotationSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setQuotationPage(1)
    loadQuotations()
  }

  const handleConvertQuotation = async (q: Quotation) => {
    try {
      const invoice = await quotationsApi.convertToInvoice(q.id)
      toast.success(`Quotation ${q.quotation_number} converted to Invoice ${invoice.invoice_number}!`)
      loadQuotations()
      loadInvoices()
      navigate(`/staff/invoices/${invoice.id}`)
    } catch (err: any) {
      const errMsg = err?.response?.data?.error?.message || err?.message || "Failed to convert quotation."
      toast.error(errMsg)
    }
  }

  const invoiceTotalPages = Math.ceil(invoiceTotal / invoiceLimit) || 1
  const quotationTotalPages = Math.ceil(quotationTotal / quotationLimit) || 1

  const getQuotationStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20">Draft</Badge>
      case "sent":
        return <Badge variant="secondary" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/20">Sent</Badge>
      case "converted":
        return <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Converted</Badge>
      case "cancelled":
        return <Badge variant="secondary" className="text-[10px] bg-rose-500/10 text-rose-400 border-rose-500/20">Cancelled</Badge>
      default:
        return <Badge variant="outline" className="text-[10px]">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Billing & Quotations</h1>
          <p className="text-sm text-muted-foreground">
            GST tax invoices with gapless numbering and sales quotations with instant conversion to invoice.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "quotations" ? (
            <Button
              size="sm"
              onClick={() => setCreateModalOpen(true)}
              className="h-9 gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Plus className="h-4 w-4" />
              New Quotation
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => navigate("/staff/sales")}
              className="h-9 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <FileText className="h-4 w-4" />
              POS Terminal
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={activeTab === "invoices" ? loadInvoices : loadQuotations}
            disabled={activeTab === "invoices" ? invoiceLoading : quotationLoading}
            className="h-9 gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${(activeTab === "invoices" ? invoiceLoading : quotationLoading) ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-white/[0.14] gap-6 text-sm font-medium">
        <button
          onClick={() => setActiveTab("invoices")}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === "invoices"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>Tax Invoices</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.08] text-zinc-300">
            {invoiceTotal}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("quotations")}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === "quotations"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <FileCheck className="h-4 w-4" />
          <span>Quotations & Estimates</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.08] text-zinc-300">
            {quotationTotal}
          </span>
        </button>
      </div>

      {/* ===================== TAB 1: INVOICES ===================== */}
      {activeTab === "invoices" && (
        <div className="space-y-4">
          {/* Filter Toolbar */}
          <div className="bg-card p-4 rounded-xl border border-white/[0.14] shadow-none space-y-3">
            <form onSubmit={handleInvoiceSearchSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
              <div className="sm:col-span-4 relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                <Input
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  placeholder="Search Invoice #, Buyer Name, GSTIN..."
                  className="pl-9 h-9 text-xs"
                />
              </div>

              <div className="sm:col-span-3">
                <Select
                  value={paymentStatus}
                  onChange={(e) => {
                    setPaymentStatus(e.target.value)
                    setInvoicePage(1)
                  }}
                  className="h-9 text-xs"
                >
                  <option value="">All Payment Statuses</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid</option>
                  <option value="cancelled">Cancelled / Reversed</option>
                </Select>
              </div>

              <div className="sm:col-span-3 flex items-center gap-2">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value)
                    setInvoicePage(1)
                  }}
                  className="h-9 text-xs"
                />
                <span className="text-zinc-400 text-xs">to</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value)
                    setInvoicePage(1)
                  }}
                  className="h-9 text-xs"
                />
              </div>

              <div className="sm:col-span-2 flex items-center gap-2">
                <Button type="submit" size="sm" className="h-9 w-full text-xs">
                  Search
                </Button>
                {(invoiceSearch || paymentStatus || startDate || endDate) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setInvoiceSearch("")
                      setPaymentStatus("")
                      setStartDate("")
                      setEndDate("")
                      setInvoicePage(1)
                    }}
                    className="h-9 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08]"
                  >
                    Reset
                  </Button>
                )}
              </div>
            </form>
          </div>

          {/* Invoices Table */}
          <div className="bg-card rounded-xl border border-white/[0.14] shadow-none overflow-hidden">
            {invoiceLoading ? (
              <div className="py-20 text-center text-sm text-zinc-400">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-2" />
                Loading invoices...
              </div>
            ) : invoices.length === 0 ? (
              <div className="py-20 text-center space-y-2 text-zinc-400">
                <FileText className="h-10 w-10 mx-auto text-zinc-500" />
                <p className="text-sm font-medium text-zinc-300">No invoices found</p>
                <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                  Invoices generated from POS checkouts, converted quotations or billing will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-white/[0.02] text-zinc-400 font-semibold border-b border-white/[0.08]">
                    <tr>
                      <th className="py-3 px-4">Invoice #</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Customer / Buyer</th>
                      <th className="py-3 px-4">Place of Supply</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4 text-right">Taxable</th>
                      <th className="py-3 px-4 text-right">Tax (GST)</th>
                      <th className="py-3 px-4 text-right">Total (₹)</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-white/[0.04] transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-primary">
                          <Link to={`/staff/invoices/${inv.id}`} className="hover:underline">
                            {inv.invoice_number}
                          </Link>
                        </td>
                        <td className="py-3 px-4 text-zinc-400 font-mono">
                          {new Date(inv.invoice_date).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-zinc-100">{inv.buyer_name}</div>
                          {inv.buyer_gstin ? (
                            <div className="text-[10px] text-zinc-400 font-mono">GSTIN: {inv.buyer_gstin}</div>
                          ) : (
                            <div className="text-[10px] text-zinc-400">Retail Consumer</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-zinc-400">{inv.place_of_supply}</td>
                        <td className="py-3 px-4">
                          {inv.is_inter_state ? (
                            <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20">
                              IGST
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border border-primary/20">
                              CGST + SGST
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-zinc-300">
                          ₹{parseFloat(inv.subtotal).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-zinc-300">
                          ₹{parseFloat(inv.total_tax).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-zinc-100">
                          ₹{parseFloat(inv.grand_total).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {inv.is_cancelled ? (
                            <Badge variant="destructive" className="text-[10px] uppercase font-semibold">
                              Cancelled
                            </Badge>
                          ) : inv.payment_status === "paid" ? (
                            <Badge className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase font-semibold">
                              Paid
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/20 bg-amber-500/10 uppercase font-semibold">
                              {inv.payment_status}
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/staff/invoices/${inv.id}`)}
                              className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08]"
                              title="View Invoice Details"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => invoicingApi.downloadPdf(inv.id, inv.invoice_number)}
                              className="h-7 w-7 p-0 text-zinc-400 hover:text-primary hover:bg-white/[0.08]"
                              title="Download PDF"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            <div className="py-3 px-4 border-t border-white/[0.14] flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-zinc-400">
              <div>
                Showing {(invoicePage - 1) * invoiceLimit + (invoices.length > 0 ? 1 : 0)} to{" "}
                {Math.min(invoicePage * invoiceLimit, invoiceTotal)} of {invoiceTotal} invoices
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInvoicePage((p) => Math.max(1, p - 1))}
                  disabled={invoicePage <= 1}
                  className="h-8 px-2 text-xs"
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                  Previous
                </Button>
                <span className="font-mono px-2 text-zinc-200">
                  {invoicePage} / {invoiceTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInvoicePage((p) => Math.min(invoiceTotalPages, p + 1))}
                  disabled={invoicePage >= invoiceTotalPages}
                  className="h-8 px-2 text-xs"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB 2: QUOTATIONS ===================== */}
      {activeTab === "quotations" && (
        <div className="space-y-4">
          {/* Quotations Filter Toolbar */}
          <div className="bg-card p-4 rounded-xl border border-white/[0.14] shadow-none space-y-3">
            <form onSubmit={handleQuotationSearchSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
              <div className="sm:col-span-6 relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                <Input
                  value={quotationSearch}
                  onChange={(e) => setQuotationSearch(e.target.value)}
                  placeholder="Search Quotation #, Buyer Name, GSTIN..."
                  className="pl-9 h-9 text-xs"
                />
              </div>

              <div className="sm:col-span-3">
                <Select
                  value={quotationStatus}
                  onChange={(e) => {
                    setQuotationStatus(e.target.value)
                    setQuotationPage(1)
                  }}
                  className="h-9 text-xs"
                >
                  <option value="">All Statuses</option>
                  <option value="draft">Draft</option>
                  <option value="sent">Sent to Client</option>
                  <option value="converted">Converted to Invoice</option>
                  <option value="cancelled">Cancelled</option>
                </Select>
              </div>

              <div className="sm:col-span-3 flex items-center gap-2">
                <Button type="submit" size="sm" className="h-9 w-full text-xs">
                  Search
                </Button>
                {(quotationSearch || quotationStatus) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setQuotationSearch("")
                      setQuotationStatus("")
                      setQuotationPage(1)
                    }}
                    className="h-9 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08]"
                  >
                    Reset
                  </Button>
                )}
              </div>
            </form>
          </div>

          {/* Quotations Table */}
          <div className="bg-card rounded-xl border border-white/[0.14] shadow-none overflow-hidden">
            {quotationLoading ? (
              <div className="py-20 text-center text-sm text-zinc-400">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-2" />
                Loading quotations...
              </div>
            ) : quotations.length === 0 ? (
              <div className="py-20 text-center space-y-2 text-zinc-400">
                <FileCheck className="h-10 w-10 mx-auto text-zinc-500" />
                <p className="text-sm font-medium text-zinc-300">No quotations found</p>
                <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                  Create price estimates for prospective buyers. Convert accepted estimates to formal tax invoices with one click.
                </p>
                <Button
                  size="sm"
                  onClick={() => setCreateModalOpen(true)}
                  className="mt-2 text-xs gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create First Quotation
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-white/[0.02] text-zinc-400 font-semibold border-b border-white/[0.08]">
                    <tr>
                      <th className="py-3 px-4">Quotation #</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Customer / Buyer</th>
                      <th className="py-3 px-4">Valid Until</th>
                      <th className="py-3 px-4 text-right">Subtotal</th>
                      <th className="py-3 px-4 text-right">Tax (GST)</th>
                      <th className="py-3 px-4 text-right">Grand Total (₹)</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {quotations.map((q) => (
                      <tr key={q.id} className="hover:bg-white/[0.04] transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-primary">
                          <button
                            onClick={() => {
                              setSelectedQuotation(q)
                              setDetailModalOpen(true)
                            }}
                            className="hover:underline text-left"
                          >
                            {q.quotation_number}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-zinc-400 font-mono">
                          {new Date(q.quotation_date).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-zinc-100">{q.buyer_name}</div>
                          {q.buyer_phone && <div className="text-[10px] text-zinc-400">{q.buyer_phone}</div>}
                        </td>
                        <td className="py-3 px-4 text-zinc-400">
                          {q.valid_until ? new Date(q.valid_until).toLocaleDateString() : "—"}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-zinc-300">
                          ₹{parseFloat(q.subtotal).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-zinc-300">
                          ₹{parseFloat(q.total_tax).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-zinc-100">
                          ₹{parseFloat(q.grand_total).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {getQuotationStatusBadge(q.status)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedQuotation(q)
                                setDetailModalOpen(true)
                              }}
                              className="h-7 px-2 text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08] gap-1"
                              title="View Quotation"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              View
                            </Button>

                            {(q.status === "draft" || q.status === "sent") && (
                              <Button
                                size="sm"
                                onClick={() => handleConvertQuotation(q)}
                                className="h-7 px-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 gap-1 text-[11px]"
                                title="Convert to Invoice"
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                Convert
                              </Button>
                            )}

                            {q.status === "converted" && q.converted_invoice_id && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/staff/invoices/${q.converted_invoice_id}`)}
                                className="h-7 px-2 text-emerald-400 hover:text-emerald-300 border-emerald-500/20 text-[11px]"
                              >
                                Invoice →
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            <div className="py-3 px-4 border-t border-white/[0.14] flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-zinc-400">
              <div>
                Showing {(quotationPage - 1) * quotationLimit + (quotations.length > 0 ? 1 : 0)} to{" "}
                {Math.min(quotationPage * quotationLimit, quotationTotal)} of {quotationTotal} quotations
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setQuotationPage((p) => Math.max(1, p - 1))}
                  disabled={quotationPage <= 1}
                  className="h-8 px-2 text-xs"
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                  Previous
                </Button>
                <span className="font-mono px-2 text-zinc-200">
                  {quotationPage} / {quotationTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setQuotationPage((p) => Math.min(quotationTotalPages, p + 1))}
                  disabled={quotationPage >= quotationTotalPages}
                  className="h-8 px-2 text-xs"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <QuotationCreateModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onSuccess={(newQ) => {
          loadQuotations()
          setSelectedQuotation(newQ)
          setDetailModalOpen(true)
        }}
      />

      <QuotationDetailModal
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        quotation={selectedQuotation}
        onStatusUpdated={(updated) => {
          setSelectedQuotation(updated)
          loadQuotations()
        }}
        onConverted={(invoice) => {
          loadQuotations()
          loadInvoices()
          navigate(`/staff/invoices/${invoice.id}`)
        }}
      />
    </div>
  )
}

export default InvoicesPage
