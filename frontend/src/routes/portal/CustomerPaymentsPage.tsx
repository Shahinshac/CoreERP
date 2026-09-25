import React, { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import {
  CreditCard,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  Calendar,
  Wallet,
} from "lucide-react"
import { portalApi } from "@/features/portal/api"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

export const CustomerPaymentsPage: React.FC = () => {
  const [search, setSearch] = useState("")

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["portal", "payments"],
    queryFn: portalApi.getPayments,
  })

  const filtered = payments.filter((p) => {
    const q = search.toLowerCase()
    return (
      p.id.toLowerCase().includes(q) ||
      p.method.toLowerCase().includes(q) ||
      (p.invoice_number && p.invoice_number.toLowerCase().includes(q)) ||
      (p.reference_id && p.reference_id.toLowerCase().includes(q))
    )
  })

  const totalPaid = payments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + Number(p.amount), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card border border-white/[0.08] rounded-xl p-6 shadow-none flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Payment History</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Complete append-only ledger of all payments and settlements.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search txn or invoice..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {/* Summary KPI Banner */}
      <div className="bg-surface-elevated border border-white/[0.08] text-foreground rounded-xl p-6 shadow-none flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 rounded-lg text-primary border border-primary/20">
            <Wallet className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Total Settled Payments
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-zinc-100 mt-0.5">
              ₹{totalPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground bg-white/[0.04] px-3 py-1.5 rounded-lg border border-white/[0.08]">
          {payments.length} total ledger transactions
        </div>
      </div>

      {/* Payments Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-card border border-white/[0.08] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <CreditCard className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <h3 className="text-base font-semibold text-zinc-200">No payment records</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {search ? "No payments match your search." : "No payment transactions recorded yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="bg-card border border-white/[0.08] rounded-xl overflow-hidden shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.02] border-b border-white/[0.08] text-muted-foreground font-medium text-xs">
                <tr>
                  <th className="py-3 px-4">Receipt / Date</th>
                  <th className="py-3 px-4">Method</th>
                  <th className="py-3 px-4">Linked Record</th>
                  <th className="py-3 px-4">Reference / UTR</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {filtered.map((pay) => {
                  const payDate = new Date(pay.created_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })

                  return (
                    <tr key={pay.id} className="hover:bg-white/[0.02] transition">
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-xs text-zinc-200 font-semibold block">
                          REC-{pay.id.substring(0, 8).toUpperCase()}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Calendar className="h-3 w-3" />
                          {payDate}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase bg-white/[0.04] border border-white/[0.08] text-zinc-300 font-mono">
                          {pay.method}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-xs">
                        {pay.invoice_id ? (
                          <Link
                            to={`/portal/invoices/${pay.invoice_id}`}
                            className="font-medium text-primary hover:underline flex items-center gap-1"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            {pay.invoice_number || "Invoice"}
                          </Link>
                        ) : pay.emi_plan_id ? (
                          <Link
                            to="/portal/emi"
                            className="font-medium text-amber-400 hover:underline"
                          >
                            EMI Plan
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Account Deposit</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-xs text-muted-foreground">
                        {pay.reference_id || "—"}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <Badge
                          variant={
                            pay.status === "paid"
                              ? "success"
                              : pay.status === "pending"
                              ? "warning"
                              : "destructive"
                          }
                        >
                          {pay.status === "paid" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                          {pay.status === "pending" && <Clock className="h-3 w-3 mr-1" />}
                          {pay.status === "failed" && <XCircle className="h-3 w-3 mr-1" />}
                          {pay.status.toUpperCase()}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4 text-right font-bold text-zinc-100 font-mono">
                        ₹{Number(pay.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default CustomerPaymentsPage
