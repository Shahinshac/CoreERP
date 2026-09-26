import React, { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Layers,
  Phone,
  Plus,
  RefreshCw,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { EmiPlan, OverdueInstallment, emiApi } from "@/features/emi/api"
import { CreateEmiPlanModal } from "@/features/emi/CreateEmiPlanModal"

export const EmiPage: React.FC = () => {
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<"plans" | "overdue">("plans")
  const [plans, setPlans] = useState<EmiPlan[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(15)
  const [loading, setLoading] = useState(true)

  // Filters
  const [statusFilter, setStatusFilter] = useState("")

  // Overdue Installments State
  const [overdueList, setOverdueList] = useState<OverdueInstallment[]>([])
  const [loadingOverdue, setLoadingOverdue] = useState(false)

  // Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false)

  const loadPlans = async () => {
    setLoading(true)
    try {
      const res = await emiApi.list({
        status: statusFilter || undefined,
        page,
        limit,
      })
      setPlans(res.items)
      setTotal(res.total)
    } catch {
      toast.error("Failed to load EMI plans.")
    } finally {
      setLoading(false)
    }
  }

  const loadOverdue = async () => {
    setLoadingOverdue(true)
    try {
      const data = await emiApi.getOverdue()
      setOverdueList(data)
    } catch {
      toast.error("Failed to load overdue installments.")
    } finally {
      setLoadingOverdue(false)
    }
  }

  useEffect(() => {
    loadPlans()
    loadOverdue()
  }, [page, statusFilter])

  // Summary Metrics
  const activePlansCount = plans.filter((p) => p.status === "active").length
  const totalFinancedSum = plans.reduce((acc, p) => acc + parseFloat(p.total_financed), 0)
  const totalCollectedSum = plans.reduce((acc, p) => acc + parseFloat(p.total_paid), 0)
  const totalPages = Math.ceil(total / limit) || 1

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Installment (EMI) Financing
            </h1>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-400">
              POS Retail Credit
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Consumer financing schedules, remainder-adjusted repayments, and 90-day NPA tracking.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadPlans()
              loadOverdue()
            }}
            className="h-9 gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${loading || loadingOverdue ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => setCreateModalOpen(true)}
            className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
          >
            <Plus className="h-4 w-4" />
            New EMI Agreement
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card p-4 rounded-xl border border-white/[0.14] shadow-none flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-zinc-400">Active Plans</p>
            <p className="text-2xl font-bold font-mono text-zinc-100 mt-1">{activePlansCount}</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">{total} total registered plans</p>
          </div>
          <div className="p-3 bg-primary/10 rounded-xl text-primary border border-primary/20">
            <Layers className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-card p-4 rounded-xl border border-white/[0.14] shadow-none flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-zinc-400">Total Financed (Page)</p>
            <p className="text-2xl font-bold font-mono text-zinc-100 mt-1">
              ₹{totalFinancedSum.toFixed(2)}
            </p>
            <p className="text-[11px] text-zinc-400 mt-0.5">Principal + Flat Interest</p>
          </div>
          <div className="p-3 bg-purple-500/10 rounded-xl text-purple-400 border border-purple-500/20">
            <CreditCard className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-card p-4 rounded-xl border border-white/[0.14] shadow-none flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-zinc-400">Collected Capital</p>
            <p className="text-2xl font-bold font-mono text-emerald-400 mt-1">
              ₹{totalCollectedSum.toFixed(2)}
            </p>
            <p className="text-[11px] text-zinc-400 mt-0.5">Applied ledger settlements</p>
          </div>
          <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="h-6 w-6" />
          </div>
        </div>

        <div
          onClick={() => setActiveTab("overdue")}
          className="bg-card p-4 rounded-xl border border-white/[0.14] shadow-none flex items-center justify-between cursor-pointer hover:border-rose-500/40 hover:bg-[#18181C] transition-colors"
        >
          <div>
            <p className="text-xs font-medium text-zinc-400">Overdue Installments</p>
            <p className="text-2xl font-bold font-mono text-rose-400 mt-1">{overdueList.length}</p>
            <p className="text-[11px] text-rose-400 font-semibold mt-0.5">Click to view risk list</p>
          </div>
          <div className="p-3 bg-rose-500/10 rounded-xl text-rose-400 border border-rose-500/20">
            <AlertTriangle className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/[0.10] text-sm font-semibold">
        <button
          onClick={() => setActiveTab("plans")}
          className={`pb-3 px-4 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === "plans"
              ? "border-primary text-primary font-bold"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Layers className="h-4 w-4" />
          All Financing Plans ({total})
        </button>

        <button
          onClick={() => setActiveTab("overdue")}
          className={`pb-3 px-4 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === "overdue"
              ? "border-rose-400 text-rose-400 font-bold"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <AlertCircle className="h-4 w-4" />
          Overdue Installments Alert Center ({overdueList.length})
        </button>
      </div>

      {/* Tab Content: All Plans */}
      {activeTab === "plans" && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-card p-3.5 rounded-xl border border-white/[0.14] shadow-none flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="font-semibold text-zinc-300">Status:</span>
              <Select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  setPage(1)
                }}
                className="h-8 text-xs w-44"
              >
                <option value="">All Statuses</option>
                <option value="active">Active (Repaying)</option>
                <option value="completed">Completed (Settled)</option>
                <option value="defaulted">Defaulted (90+ Days NPA)</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            </div>

            {statusFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStatusFilter("")}
                className="h-7 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08]"
              >
                Clear Filter
              </Button>
            )}
          </div>

          {/* Plans Table */}
          <div className="bg-card rounded-xl border border-white/[0.14] shadow-none overflow-hidden">
            {loading ? (
              <div className="p-12 text-center space-y-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
                <p className="text-sm text-zinc-400">Loading EMI financing agreements...</p>
              </div>
            ) : plans.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <Layers className="h-10 w-10 text-zinc-500 mx-auto" />
                <p className="text-sm font-semibold text-zinc-200">No EMI plans found</p>
                <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                  Create a new financing agreement to offer customers flexible installment schedules.
                </p>
                <Button
                  size="sm"
                  onClick={() => setCreateModalOpen(true)}
                  className="h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                >
                  Create First Plan
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-white/[0.02] border-b border-white/[0.08] text-zinc-400 uppercase tracking-wider text-[11px] font-semibold">
                    <tr>
                      <th className="py-3 px-4">Plan Ref / Inception</th>
                      <th className="py-3 px-4">Customer</th>
                      <th className="py-3 px-4 text-center">Tenure</th>
                      <th className="py-3 px-4 text-right">Financed Total</th>
                      <th className="py-3 px-4 text-right">Settled</th>
                      <th className="py-3 px-4 text-right">Remaining Balance</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] font-mono">
                    {plans.map((p) => (
                      <tr key={p.id} className="hover:bg-white/[0.04] transition-colors">
                        <td className="py-3 px-4">
                          <Link
                            to={`/staff/emi/${p.id}`}
                            className="font-bold text-primary hover:underline"
                          >
                            PLAN-{p.id.slice(0, 8)}
                          </Link>
                          <div className="text-[10px] text-zinc-400 font-sans mt-0.5">
                            {new Date(p.created_at).toLocaleDateString()}
                          </div>
                        </td>

                        <td className="py-3 px-4 font-sans">
                          <div className="font-semibold text-zinc-100">
                            {p.customer_name || "Retail Customer"}
                          </div>
                          <div className="text-[10px] text-zinc-400 font-mono">
                            {p.customer_id.slice(0, 8)}...
                          </div>
                        </td>

                        <td className="py-3 px-4 text-center font-sans">
                          <span className="font-semibold text-zinc-200">
                            {p.number_of_installments} mos
                          </span>
                          <span className="text-[10px] text-zinc-400 block font-mono">
                            ₹{parseFloat(p.installment_amount).toFixed(2)}/mo
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right font-bold text-zinc-100">
                          ₹{parseFloat(p.total_financed).toFixed(2)}
                        </td>

                        <td className="py-3 px-4 text-right font-bold text-emerald-400">
                          ₹{parseFloat(p.total_paid).toFixed(2)}
                        </td>

                        <td className="py-3 px-4 text-right font-bold text-zinc-200">
                          ₹{parseFloat(p.remaining_balance).toFixed(2)}
                        </td>

                        <td className="py-3 px-4 text-center font-sans">
                          <Badge
                            variant="outline"
                            className={`text-[10px] uppercase font-bold ${
                              p.status === "completed"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : p.status === "defaulted"
                                ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                : "bg-primary/10 text-primary border-primary/20"
                            }`}
                          >
                            {p.status}
                          </Badge>
                        </td>

                        <td className="py-3 px-4 text-center font-sans">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/staff/emi/${p.id}`)}
                            className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08] gap-1"
                          >
                            Details
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {!loading && total > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-t border-white/[0.14] bg-surface-elevated/40 gap-3 text-xs text-zinc-400">
                <div>
                  Showing <span className="font-semibold text-zinc-100">{(page - 1) * limit + 1}</span> to{" "}
                  <span className="font-semibold text-zinc-100">
                    {Math.min(page * limit, total)}
                  </span>{" "}
                  of <span className="font-semibold text-zinc-100">{total}</span> plans
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
                  <span className="px-2 text-zinc-200">
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
        </div>
      )}

      {/* Tab Content: Overdue Alert Center */}
      {activeTab === "overdue" && (
        <div className="space-y-4">
          <div className="bg-rose-500/10 p-4 rounded-xl border border-rose-500/20 text-xs text-rose-300 space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-sm text-rose-400">
              <AlertTriangle className="h-4 w-4 text-rose-400" />
              Overdue Installment Recovery Center
            </div>
            <p className="text-zinc-300">
              Installments past due date without full settlement. Per store credit policy, accounts with
              3+ overdue installments or &gt;90 days past due automatically move to Default status.
            </p>
          </div>

          <div className="bg-card rounded-xl border border-white/[0.14] shadow-none overflow-hidden">
            {loadingOverdue ? (
              <div className="p-12 text-center space-y-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-rose-500 border-t-transparent mx-auto" />
                <p className="text-sm text-zinc-400">Checking overdue accounts...</p>
              </div>
            ) : overdueList.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto" />
                <p className="text-sm font-bold text-zinc-100">Zero Overdue Installments!</p>
                <p className="text-xs text-zinc-400">
                  All active customer financing accounts are currently up to date on scheduled repayments.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-white/[0.02] border-b border-white/[0.08] text-zinc-400 uppercase tracking-wider text-[11px] font-semibold">
                    <tr>
                      <th className="py-3 px-4">Due Date / Overdue</th>
                      <th className="py-3 px-4">Customer</th>
                      <th className="py-3 px-4">Installment #</th>
                      <th className="py-3 px-4 text-right">Amount Due</th>
                      <th className="py-3 px-4 text-right">Amount Paid</th>
                      <th className="py-3 px-4 text-right">Outstanding Overdue</th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] font-mono">
                    {overdueList.map((item) => (
                      <tr key={item.installment_id} className="hover:bg-white/[0.04] transition-colors">
                        <td className="py-3 px-4 font-sans">
                          <div className="font-bold text-zinc-100">
                            {new Date(item.due_date).toLocaleDateString()}
                          </div>
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase mt-0.5 ${
                              item.days_overdue > 90
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            }`}
                          >
                            {item.days_overdue} days past due {item.days_overdue > 90 && "(NPA)"}
                          </span>
                        </td>

                        <td className="py-3 px-4 font-sans">
                          <div className="font-bold text-zinc-100">{item.customer_name}</div>
                          {item.customer_phone && (
                            <div className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                              <Phone className="h-3 w-3" />
                              {item.customer_phone}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4 font-bold text-zinc-200">
                          Installment #{item.installment_number}
                        </td>

                        <td className="py-3 px-4 text-right font-bold text-zinc-100">
                          ₹{parseFloat(item.amount_due).toFixed(2)}
                        </td>

                        <td className="py-3 px-4 text-right text-emerald-400">
                          ₹{parseFloat(item.amount_paid).toFixed(2)}
                        </td>

                        <td className="py-3 px-4 text-right font-black text-rose-400">
                          ₹{parseFloat(item.amount_overdue).toFixed(2)}
                        </td>

                        <td className="py-3 px-4 text-center font-sans">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/staff/emi/${item.plan_id}`)}
                            className="h-7 px-2 text-xs text-primary border-primary/30 hover:bg-primary/10"
                          >
                            Open Plan
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Plan Modal */}
      <CreateEmiPlanModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onSuccess={() => {
          loadPlans()
          loadOverdue()
        }}
      />
    </div>
  )
}
export default EmiPage
