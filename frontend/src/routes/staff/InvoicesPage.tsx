import React, { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  RefreshCw,
  Search,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Invoice, invoicingApi } from "@/features/invoicing/api"

export const InvoicesPage: React.FC = () => {
  const navigate = useNavigate()

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(15)
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState("")
  const [paymentStatus, setPaymentStatus] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const loadInvoices = async () => {
    setLoading(true)
    try {
      const data = await invoicingApi.list({
        search: search.trim() || undefined,
        payment_status: paymentStatus || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        page,
        limit,
      })
      setInvoices(data.items)
      setTotal(data.total)
    } catch {
      toast.error("Failed to load invoices.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInvoices()
  }, [page, paymentStatus, startDate, endDate])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    loadInvoices()
  }

  const handleResetFilters = () => {
    setSearch("")
    setPaymentStatus("")
    setStartDate("")
    setEndDate("")
    setPage(1)
  }

  const totalPages = Math.ceil(total / limit) || 1

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">GST Invoices</h1>
          <p className="text-sm text-slate-500">
            Authoritative, immutable GST tax invoices with gapless numbering and full CGST/SGST/IGST breakdown.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadInvoices}
            disabled={loading}
            className="h-9 gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => navigate("/staff/sales")}
            className="h-9 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <FileText className="h-4 w-4" />
            POS Terminal
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
          {/* Search Bar (5 cols) */}
          <div className="sm:col-span-4 relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Invoice #, Buyer Name, GSTIN..."
              className="pl-9 h-9 text-xs"
            />
          </div>

          {/* Payment Status (3 cols) */}
          <div className="sm:col-span-3">
            <Select
              value={paymentStatus}
              onChange={(e) => {
                setPaymentStatus(e.target.value)
                setPage(1)
              }}
              className="h-9 text-xs"
            >
              <option value="">All Payment Statuses</option>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
              <option value="cancelled">Cancelled / Reversed</option>
            </Select>
          </div>

          {/* Date Range (3 cols) */}
          <div className="sm:col-span-3 flex items-center gap-2">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value)
                setPage(1)
              }}
              className="h-9 text-xs"
            />
            <span className="text-slate-400 text-xs">to</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value)
                setPage(1)
              }}
              className="h-9 text-xs"
            />
          </div>

          {/* Search Button (2 cols) */}
          <div className="sm:col-span-2 flex items-center gap-2">
            <Button type="submit" size="sm" className="h-9 w-full text-xs">
              Search
            </Button>
            {(search || paymentStatus || startDate || endDate) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="h-9 text-xs text-slate-500 hover:text-slate-800"
              >
                Reset
              </Button>
            )}
          </div>
        </form>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-sm text-slate-500">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-2" />
            Loading invoices...
          </div>
        ) : invoices.length === 0 ? (
          <div className="py-20 text-center space-y-2 text-slate-400">
            <FileText className="h-10 w-10 mx-auto text-slate-300" />
            <p className="text-sm font-medium text-slate-600">No invoices found</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Invoices generated from POS checkouts or billing transactions will appear here with sequential gapless numbers.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
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
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4 font-mono font-bold text-blue-600">
                      <Link to={`/staff/invoices/${inv.id}`} className="hover:underline">
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-mono">
                      {new Date(inv.invoice_date).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-800">{inv.buyer_name}</div>
                      {inv.buyer_gstin ? (
                        <div className="text-[10px] text-slate-400 font-mono">GSTIN: {inv.buyer_gstin}</div>
                      ) : (
                        <div className="text-[10px] text-slate-400">Retail Consumer</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{inv.place_of_supply}</td>
                    <td className="py-3 px-4">
                      {inv.is_inter_state ? (
                        <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
                          IGST
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                          CGST + SGST
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      ₹{parseFloat(inv.subtotal).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      ₹{parseFloat(inv.total_tax).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      ₹{parseFloat(inv.grand_total).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {inv.is_cancelled ? (
                        <Badge variant="destructive" className="text-[10px] uppercase font-semibold">
                          Cancelled
                        </Badge>
                      ) : inv.payment_status === "paid" ? (
                        <Badge className="text-[10px] bg-emerald-600 uppercase font-semibold">
                          Paid
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 uppercase font-semibold">
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
                          className="h-7 w-7 p-0 text-slate-500 hover:text-slate-800"
                          title="View Invoice Details"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => invoicingApi.downloadPdf(inv.id, inv.invoice_number)}
                          className="h-7 w-7 p-0 text-slate-500 hover:text-blue-600"
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

        {/* Pagination Footer */}
        <div className="py-3 px-4 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-slate-500">
          <div>
            Showing {(page - 1) * limit + (invoices.length > 0 ? 1 : 0)} to{" "}
            {Math.min(page * limit, total)} of {total} invoices
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="h-8 px-2 text-xs"
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              Previous
            </Button>
            <span className="font-mono px-2">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="h-8 px-2 text-xs"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
export default InvoicesPage
