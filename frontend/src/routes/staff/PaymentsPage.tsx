import React, { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  ArrowDownLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  QrCode,
  Receipt,
  RefreshCw,
  Search,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Payment, PaymentListParams, paymentsApi } from "@/features/payments/api"
import { PaymentRecordModal } from "@/features/payments/PaymentRecordModal"

export const PaymentsPage: React.FC = () => {
  const [payments, setPayments] = useState<Payment[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(15)
  const [loading, setLoading] = useState(true)

  // Filters
  const [status, setStatus] = useState<string>("")
  const [method, setMethod] = useState<string>("")
  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>("")
  const [searchInvoiceId, setSearchInvoiceId] = useState<string>("")

  // Selected payment for detail modal
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [recordModalOpen, setRecordModalOpen] = useState(false)

  const loadPayments = async () => {
    setLoading(true)
    try {
      const params: PaymentListParams = {
        page,
        limit,
        status: status || undefined,
        method: method || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        invoice_id: searchInvoiceId.trim() || undefined,
      }
      const data = await paymentsApi.list(params)
      setPayments(data.items)
      setTotal(data.total)
    } catch {
      toast.error("Failed to load payment transactions.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPayments()
  }, [page, status, method, startDate, endDate])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    loadPayments()
  }

  const handleResetFilters = () => {
    setStatus("")
    setMethod("")
    setStartDate("")
    setEndDate("")
    setSearchInvoiceId("")
    setPage(1)
  }

  // Summary calculations for loaded records
  const totalAmountPaid = payments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + parseFloat(p.amount), 0)

  const cashCollections = payments
    .filter((p) => p.status === "paid" && p.method === "cash")
    .reduce((sum, p) => sum + parseFloat(p.amount), 0)

  const digitalCollections = payments
    .filter((p) => p.status === "paid" && p.method !== "cash")
    .reduce((sum, p) => sum + parseFloat(p.amount), 0)

  const totalPages = Math.ceil(total / limit) || 1

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Payments Ledger
            </h1>
            <Badge variant="outline" className="text-emerald-700 bg-emerald-50 border-emerald-200">
              Append-Only Ledger
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Immutable settlement receipts, cash registers, and UPI / Card transaction logs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadPayments}
            className="h-9 gap-1.5 text-slate-600"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => setRecordModalOpen(true)}
            className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
          >
            <CreditCard className="h-4 w-4" />
            Record Payment
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Total Settled (Page)</p>
            <p className="text-2xl font-bold font-mono text-emerald-600 mt-1">
              ₹{totalAmountPaid.toFixed(2)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">{total} total transactions logged</p>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <Receipt className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Cash Collections</p>
            <p className="text-2xl font-bold font-mono text-blue-600 mt-1">
              ₹{cashCollections.toFixed(2)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Physical register intake</p>
          </div>
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
            <Wallet className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Digital / UPI / Cards</p>
            <p className="text-2xl font-bold font-mono text-purple-600 mt-1">
              ₹{digitalCollections.toFixed(2)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">UPI intent & POS terminals</p>
          </div>
          <div className="p-3 bg-purple-50 rounded-xl text-purple-600">
            <QrCode className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Audit Status</p>
            <p className="text-lg font-bold text-slate-800 mt-1 flex items-center gap-1.5">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Immutable
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">No edits/deletes permitted</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl text-slate-500">
            <ArrowDownLeft className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {/* Invoice ID / Filter */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search Invoice UUID..."
              value={searchInvoiceId}
              onChange={(e) => setSearchInvoiceId(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          {/* Status Filter */}
          <div>
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setPage(1)
              }}
              className="h-9 text-xs"
            >
              <option value="">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="expired">Expired</option>
            </Select>
          </div>

          {/* Method Filter */}
          <div>
            <Select
              value={method}
              onChange={(e) => {
                setMethod(e.target.value)
                setPage(1)
              }}
              className="h-9 text-xs"
            >
              <option value="">All Methods</option>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Debit / Credit Card</option>
              <option value="payment_link">Payment Link (UPI Intent)</option>
              <option value="emi">EMI (Phase 9 Reserved)</option>
            </Select>
          </div>

          {/* Date Range: Start */}
          <div>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value)
                setPage(1)
              }}
              className="h-9 text-xs"
              placeholder="Start Date"
            />
          </div>

          {/* Date Range: End */}
          <div className="flex gap-2">
            <Input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value)
                setPage(1)
              }}
              className="h-9 text-xs"
              placeholder="End Date"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetFilters}
              className="h-9 px-2 text-xs text-slate-500 hover:text-slate-900"
              title="Reset Filters"
            >
              Reset
            </Button>
          </div>
        </form>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 space-y-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
            <p className="text-sm text-slate-500">Loading immutable payments ledger...</p>
          </div>
        ) : payments.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <CreditCard className="h-10 w-10 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">No payment records found</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              No payments match your filter criteria. Record a transaction or clear your filters to view past receipts.
            </p>
            <Button
              size="sm"
              onClick={() => setRecordModalOpen(true)}
              className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Record New Payment
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Receipt / Timestamp</th>
                  <th className="py-3 px-4">Invoice Reference</th>
                  <th className="py-3 px-4">Method</th>
                  <th className="py-3 px-4">External Gateway / Ref</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Timestamp & Short ID */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{p.id.slice(0, 8)}...</div>
                      <div className="text-[11px] text-slate-500 font-sans mt-0.5">
                        {new Date(p.created_at).toLocaleString()}
                      </div>
                    </td>

                    {/* Invoice ID */}
                    <td className="py-3 px-4 font-sans">
                      {p.invoice_id ? (
                        <Link
                          to={`/staff/invoices/${p.invoice_id}`}
                          className="font-mono text-blue-600 hover:underline font-semibold"
                        >
                          {p.invoice_id.slice(0, 8)}...
                        </Link>
                      ) : (
                        <span className="text-slate-400 italic">General / Customer Advance</span>
                      )}
                    </td>

                    {/* Method */}
                    <td className="py-3 px-4 font-sans">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium uppercase bg-slate-100 text-slate-800">
                        {p.method.replace("_", " ")}
                      </span>
                    </td>

                    {/* Reference / Gateway */}
                    <td className="py-3 px-4 text-slate-600">
                      {p.reference_id ? (
                        <span>{p.reference_id}</span>
                      ) : (
                        <span className="text-slate-300 italic font-sans">Cash / Over-Counter</span>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-4 text-center font-sans">
                      <Badge
                        variant="outline"
                        className={`text-[10px] uppercase font-bold ${
                          p.status === "paid"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : p.status === "failed"
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}
                      >
                        {p.status}
                      </Badge>
                    </td>

                    {/* Amount */}
                    <td className="py-3 px-4 text-right">
                      <span
                        className={`font-bold text-sm ${
                          p.status === "paid" ? "text-emerald-600" : "text-slate-500"
                        }`}
                      >
                        ₹{parseFloat(p.amount).toFixed(2)}
                      </span>
                    </td>

                    {/* View Details Action */}
                    <td className="py-3 px-4 text-center font-sans">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedPayment(p)}
                        className="h-7 px-2 text-xs text-slate-600 hover:text-slate-900"
                      >
                        Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {!loading && total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-t border-slate-200 bg-slate-50/50 gap-3 text-xs text-slate-600">
            <div>
              Showing <span className="font-semibold text-slate-900">{(page - 1) * limit + 1}</span> to{" "}
              <span className="font-semibold text-slate-900">
                {Math.min(page * limit, total)}
              </span>{" "}
              of <span className="font-semibold text-slate-900">{total}</span> payments
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="h-8 gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="px-2">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="h-8 gap-1"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Payment Detail Modal */}
      {selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-base">Payment Receipt Details</h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedPayment(null)}
                className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600"
              >
                ✕
              </Button>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-sans">Payment UUID:</span>
                <span className="font-semibold text-slate-900">{selectedPayment.id}</span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-sans">Idempotency Key:</span>
                <span className="text-slate-600 break-all">{selectedPayment.idempotency_key}</span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-sans">Invoice ID:</span>
                {selectedPayment.invoice_id ? (
                  <Link
                    to={`/staff/invoices/${selectedPayment.invoice_id}`}
                    className="text-blue-600 underline"
                  >
                    {selectedPayment.invoice_id}
                  </Link>
                ) : (
                  <span className="text-slate-400 font-sans italic">None</span>
                )}
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100 font-sans">
                <span className="text-slate-500">Method:</span>
                <span className="font-bold uppercase text-slate-800">{selectedPayment.method}</span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-sans">Gateway / Ref:</span>
                <span className="text-slate-800">
                  {selectedPayment.reference_id || "Direct Cash"}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100 font-sans">
                <span className="text-slate-500">Lifecycle Status:</span>
                <Badge
                  variant="outline"
                  className={
                    selectedPayment.status === "paid"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700"
                  }
                >
                  {selectedPayment.status}
                </Badge>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-sans">Created By Staff:</span>
                <span className="text-slate-600">{selectedPayment.created_by || "System"}</span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-sans">Recorded At:</span>
                <span className="text-slate-600">
                  {new Date(selectedPayment.created_at).toLocaleString()}
                </span>
              </div>

              {selectedPayment.notes && (
                <div className="pt-1 font-sans text-slate-600">
                  <span className="text-slate-500 font-bold block mb-1">Notes:</span>
                  <div className="p-2 bg-slate-50 rounded border border-slate-100">
                    {selectedPayment.notes}
                  </div>
                </div>
              )}

              <div className="flex justify-between items-baseline pt-2">
                <span className="text-sm font-bold text-slate-900 font-sans">Settled Amount:</span>
                <span className="text-xl font-bold text-emerald-600 font-mono">
                  ₹{parseFloat(selectedPayment.amount).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="pt-2">
              <Button
                variant="outline"
                className="w-full text-xs"
                onClick={() => setSelectedPayment(null)}
              >
                Close Receipt
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Standalone Modal */}
      <PaymentRecordModal
        open={recordModalOpen}
        onOpenChange={setRecordModalOpen}
        onSuccess={() => {
          loadPayments()
        }}
      />
    </div>
  )
}
export default PaymentsPage
