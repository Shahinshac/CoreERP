import React, { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import {
  ArrowLeft,
  CreditCard,
  FileText,
  Layers,
  Receipt,
  User,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmiInstallment, EmiPlanDetail, emiApi } from "@/features/emi/api"
import { EmiPaymentModal } from "@/features/emi/EmiPaymentModal"

export const EmiDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [plan, setPlan] = useState<EmiPlanDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [selectedInstallment, setSelectedInstallment] = useState<EmiInstallment | null>(null)

  const fetchPlan = async () => {
    if (!id) return
    setLoading(true)
    try {
      const data = await emiApi.get(id)
      setPlan(data)
    } catch {
      toast.error("Failed to load EMI plan details.")
      navigate("/staff/emi")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPlan()
  }, [id])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
        <p className="text-sm text-slate-500">Loading installment plan...</p>
      </div>
    )
  }

  if (!plan) {
    return (
      <div className="text-center py-20 space-y-3">
        <p className="text-slate-500">EMI Plan not found.</p>
        <Button onClick={() => navigate("/staff/emi")} variant="outline" size="sm">
          Back to EMI Plans
        </Button>
      </div>
    )
  }

  const totalFinanced = parseFloat(plan.total_financed) || 0
  const totalPaid = parseFloat(plan.total_paid) || 0
  const remainingBalance = parseFloat(plan.remaining_balance) || 0
  const progressPct = totalFinanced > 0 ? Math.min(100, Math.round((totalPaid / totalFinanced) * 100)) : 0

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/staff/emi")}
            className="h-9 gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to EMI Plans
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 font-mono">
                PLAN-{plan.id.slice(0, 8)}
              </h1>
              <Badge
                variant="outline"
                className={`uppercase font-bold text-[10px] ${
                  plan.status === "completed"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                    : plan.status === "defaulted"
                    ? "bg-rose-50 text-rose-700 border-rose-300"
                    : "bg-blue-50 text-blue-700 border-blue-300"
                }`}
              >
                {plan.status}
              </Badge>
            </div>
            <p className="text-xs text-slate-500">
              Created on {new Date(plan.created_at).toLocaleDateString()} • {plan.number_of_installments}-Month Schedule
            </p>
          </div>
        </div>

        {plan.status !== "completed" && plan.status !== "cancelled" && (
          <Button
            size="sm"
            onClick={() => {
              setSelectedInstallment(null)
              setPaymentModalOpen(true)
            }}
            className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
          >
            <CreditCard className="h-4 w-4" />
            Record Plan Payment
          </Button>
        )}
      </div>

      {/* KPI Cards & Progress */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 font-medium">Financed Principal</p>
          <p className="text-xl font-bold font-mono text-slate-900 mt-1">
            ₹{parseFloat(plan.principal).toFixed(2)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Down Payment: ₹{parseFloat(plan.down_payment).toFixed(2)}
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 font-medium">Interest / Financing</p>
          <p className="text-xl font-bold font-mono text-slate-900 mt-1">
            ₹{parseFloat(plan.interest_amount).toFixed(2)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {plan.interest_rate ? `${parseFloat(plan.interest_rate).toFixed(1)}% p.a.` : "No-Cost EMI (0%)"}
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 font-medium">Settled Amount</p>
          <p className="text-xl font-bold font-mono text-emerald-600 mt-1">
            ₹{totalPaid.toFixed(2)}
          </p>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className="bg-emerald-600 h-1.5 rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 font-medium">Outstanding Balance</p>
          <p className={`text-xl font-bold font-mono mt-1 ${remainingBalance > 0 ? "text-amber-600" : "text-slate-600"}`}>
            ₹{remainingBalance.toFixed(2)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {progressPct}% settled in total
          </p>
        </div>
      </div>

      {/* Customer & Agreement Info Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 text-xs grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1">
          <span className="text-slate-400 font-bold uppercase tracking-wider block">Customer Details</span>
          <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
            <User className="h-4 w-4 text-emerald-600" />
            {plan.customer_name || "Walk-in Retail Customer"}
          </div>
          <div className="text-slate-500 font-mono">ID: {plan.customer_id}</div>
        </div>

        <div className="space-y-1">
          <span className="text-slate-400 font-bold uppercase tracking-wider block">Linked Reference</span>
          {plan.invoice_id ? (
            <div>
              <Link
                to={`/staff/invoices/${plan.invoice_id}`}
                className="font-bold text-blue-600 hover:underline flex items-center gap-1"
              >
                <FileText className="h-3.5 w-3.5" />
                View Tax Invoice
              </Link>
              <div className="text-slate-400 font-mono text-[10px]">{plan.invoice_id}</div>
            </div>
          ) : (
            <span className="text-slate-500 italic">Standalone Consumer Financing</span>
          )}
        </div>

        <div className="space-y-1">
          <span className="text-slate-400 font-bold uppercase tracking-wider block">Monthly Obligation</span>
          <div className="font-bold text-slate-900 text-sm font-mono">
            ₹{parseFloat(plan.installment_amount).toFixed(2)} / month
          </div>
          <div className="text-slate-500">First Due: {new Date(plan.installments[0]?.due_date).toLocaleDateString()}</div>
        </div>
      </div>

      {/* Installment Schedule Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-2">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
            <Layers className="h-4 w-4 text-emerald-600" />
            INSTALLMENT REPAYMENT SCHEDULE
          </div>
          <div className="text-xs text-slate-500 font-sans">
            Rounding remainder adjusted on final installment • Auto-cascading enabled
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-sans">
              <tr>
                <th className="py-2.5 px-4 text-left font-semibold">Installment #</th>
                <th className="py-2.5 px-4 text-left font-semibold">Due Date</th>
                <th className="py-2.5 px-4 text-right font-semibold">Amount Due</th>
                <th className="py-2.5 px-4 text-right font-semibold">Amount Paid</th>
                <th className="py-2.5 px-4 text-right font-semibold">Remaining Due</th>
                <th className="py-2.5 px-4 text-center font-semibold">Status</th>
                <th className="py-2.5 px-4 text-center font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plan.installments.map((inst, idx) => (
                <tr
                  key={inst.id}
                  className={`hover:bg-slate-50/80 transition-colors ${
                    inst.status === "overdue" || inst.status === "defaulted"
                      ? "bg-rose-50/30"
                      : ""
                  }`}
                >
                  <td className="py-3 px-4 font-bold text-slate-900">
                    #{inst.installment_number}
                    {idx === plan.installments.length - 1 && (
                      <span className="ml-1 text-[9px] font-sans text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded">
                        Final
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-sans text-slate-700">
                    {new Date(inst.due_date).toLocaleDateString()}
                    {inst.days_overdue > 0 && (
                      <span className="text-[10px] text-rose-600 font-bold block">
                        {inst.days_overdue} days overdue
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900">
                    ₹{parseFloat(inst.amount_due).toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-emerald-600">
                    ₹{parseFloat(inst.amount_paid).toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-800">
                    ₹{parseFloat(inst.remaining_amount).toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-center font-sans">
                    <Badge
                      variant="outline"
                      className={`text-[10px] uppercase font-bold ${
                        inst.status === "paid"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                          : inst.status === "partial"
                          ? "bg-amber-50 text-amber-700 border-amber-300"
                          : inst.status === "overdue"
                          ? "bg-rose-50 text-rose-700 border-rose-300"
                          : inst.status === "defaulted"
                          ? "bg-red-100 text-red-800 border-red-400"
                          : "bg-slate-100 text-slate-600 border-slate-200"
                      }`}
                    >
                      {inst.status}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-center font-sans">
                    {inst.status !== "paid" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedInstallment(inst)
                          setPaymentModalOpen(true)
                        }}
                        className="h-7 px-2.5 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                      >
                        Pay #{inst.installment_number}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Linked Payments Ledger Table */}
      {plan.payments && plan.payments.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
            <Receipt className="h-4 w-4 text-emerald-600" />
            PAYMENTS APPLIED TO THIS PLAN
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs font-mono">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-sans">
                <tr>
                  <th className="py-2 px-3 text-left">Receipt ID</th>
                  <th className="py-2 px-3 text-left">Channel</th>
                  <th className="py-2 px-3 text-left">Reference / Trans ID</th>
                  <th className="py-2 px-3 text-left">Recorded At</th>
                  <th className="py-2 px-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {plan.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 px-3 font-semibold text-slate-800">{p.id.slice(0, 8)}...</td>
                    <td className="py-2 px-3 uppercase font-sans">{p.method}</td>
                    <td className="py-2 px-3 text-slate-600">{p.reference_id || "Direct / Cash"}</td>
                    <td className="py-2 px-3 font-sans text-slate-500">{new Date(p.created_at).toLocaleString()}</td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-600">
                      ₹{parseFloat(p.amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payment Recording Modal */}
      <EmiPaymentModal
        open={paymentModalOpen}
        onOpenChange={setPaymentModalOpen}
        plan={plan}
        targetInstallment={selectedInstallment}
        onSuccess={(updated) => setPlan(updated)}
      />
    </div>
  )
}
export default EmiDetailPage
