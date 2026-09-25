import React, { useState, useEffect, useCallback } from "react"
import { Link } from "react-router-dom"
import {
  PlusCircle,
  Users,
  Eye,
  CheckCircle2,
  Clock,
  Filter,
  CheckCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/features/auth/AuthContext"
import { hrApi } from "@/features/hr/api"
import { SalaryRecord } from "@/features/hr/types"
import { SalaryGenerateModal } from "@/features/hr/SalaryGenerateModal"
import { SalaryDetailModal } from "@/features/hr/SalaryDetailModal"
import { SalaryPayModal } from "@/features/hr/SalaryPayModal"

export const SalaryRecordsPage: React.FC = () => {
  const { user } = useAuth()
  const callerRole = (user as { role?: string })?.role || "Staff"
  const isAdmin = callerRole === "Super Admin" || callerRole === "Admin"
  const canDisburse = isAdmin || callerRole === "Accountant"

  const [records, setRecords] = useState<SalaryRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [totalCount, setTotalCount] = useState(0)

  // Filters
  const [periodFilter, setPeriodFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [page, setPage] = useState(1)
  const limit = 20

  // Modals
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false)
  const [selectedRecordForDetail, setSelectedRecordForDetail] = useState<SalaryRecord | null>(null)
  const [selectedRecordForPay, setSelectedRecordForPay] = useState<SalaryRecord | null>(null)

  const fetchSalaryRecords = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await hrApi.listSalaryRecords({
        period: periodFilter || undefined,
        status: statusFilter || undefined,
        page,
        limit,
      })
      setRecords(data.items)
      setTotalCount(data.total)
    } catch (err: unknown) {
      // Handled by toast
    } finally {
      setIsLoading(false)
    }
  }, [periodFilter, statusFilter, page])

  useEffect(() => {
    fetchSalaryRecords()
  }, [fetchSalaryRecords])

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
              Payroll & Salary Records
            </h1>
            <Badge variant="outline" className="text-xs font-semibold text-emerald-400 border-emerald-500/40 bg-emerald-950/20">
              {totalCount} Records
            </Badge>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Browse snapshotted monthly salary runs, inspect itemized deduction breakdowns, and execute payouts.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link to="/staff/staff-management">
            <Button variant="outline" className="gap-1.5 text-zinc-200 border-white/[0.16] hover:bg-[#18181C] hover:text-white">
              <Users className="w-4 h-4 text-primary" />
              Staff Directory
            </Button>
          </Link>

          {isAdmin && (
            <Button
              onClick={() => setIsGenerateModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 shadow-none font-medium"
            >
              <PlusCircle className="w-4 h-4" />
              Generate Salary Run
            </Button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 bg-card border border-white/[0.14] rounded-xl shadow-none flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-medium">
            <Filter className="w-3.5 h-3.5" /> Filter Period:
          </div>

          <input
            type="month"
            value={periodFilter}
            onChange={(e) => {
              setPeriodFilter(e.target.value)
              setPage(1)
            }}
            className="h-9 px-3 text-xs bg-black/40 border border-white/[0.16] rounded-lg text-zinc-200 font-mono focus:outline-none focus:border-primary/60"
          />

          {periodFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPeriodFilter("")
                setPage(1)
              }}
              className="h-9 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08]"
            >
              Clear Month
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400 font-medium">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(1)
            }}
            className="h-9 px-3 text-xs bg-black/40 border border-white/[0.16] rounded-lg text-zinc-200 [&>option]:bg-[#0C0C0E] focus:outline-none focus:border-primary/60"
          >
            <option value="">All Statuses</option>
            <option value="generated">Generated (Unpaid)</option>
            <option value="paid">Paid (Disbursed)</option>
          </select>
        </div>
      </div>

      {/* Salary Records Table */}
      <div className="bg-card border border-white/[0.14] rounded-xl shadow-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/[0.08] text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                <th className="py-3 px-4">Period</th>
                <th className="py-3 px-4">Staff Member</th>
                <th className="py-3 px-4">Emp Code</th>
                <th className="py-3 px-4">Base Salary</th>
                <th className="py-3 px-4">Deductions</th>
                <th className="py-3 px-4">Net Salary</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.08]">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-zinc-400">
                    Loading salary records...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-zinc-400">
                    No salary records found for the selected filter.
                  </td>
                </tr>
              ) : (
                records.map((r) => {
                  const isPaid = r.status === "paid"
                  return (
                    <tr key={r.id} className="hover:bg-white/[0.04] transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-zinc-100">
                        {r.period}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-zinc-100">
                          {r.staff_name || r.staff_email}
                        </div>
                        <div className="text-xs text-zinc-400">{r.staff_email}</div>
                      </td>

                      <td className="py-3 px-4 font-mono text-xs text-zinc-300">
                        {r.employee_code || "—"}
                      </td>

                      <td className="py-3 px-4 font-mono text-zinc-200">
                        ₹{parseFloat(r.base_salary).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>

                      <td className="py-3 px-4 font-mono text-rose-400">
                        -₹{parseFloat(r.total_deductions).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                        ₹{parseFloat(r.net_salary).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                            isPaid
                              ? "bg-emerald-950/40 text-emerald-400 border border-emerald-500/30"
                              : "bg-amber-950/40 text-amber-400 border border-amber-500/30"
                          }`}
                        >
                          {isPaid ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          {isPaid ? "Paid" : "Generated"}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedRecordForDetail(r)}
                            className="h-8 text-xs text-zinc-300 hover:text-white hover:bg-white/[0.08] gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" /> Details
                          </Button>

                          {!isPaid && canDisburse && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedRecordForPay(r)}
                              className="h-8 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40 gap-1 font-medium"
                            >
                              <CheckCircle className="w-3.5 h-3.5" /> Pay
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalCount > limit && (
          <div className="p-4 border-t border-white/[0.08] flex items-center justify-between text-xs text-zinc-400">
            <div>
              Showing {(page - 1) * limit + 1} - {Math.min(page * limit, totalCount)} of {totalCount} records
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="h-8 text-xs border-white/[0.16] hover:bg-[#18181C] text-zinc-200"
              >
                Previous
              </Button>
              <span className="px-2 text-zinc-300">Page {page}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={page * limit >= totalCount}
                onClick={() => setPage(page + 1)}
                className="h-8 text-xs border-white/[0.16] hover:bg-[#18181C] text-zinc-200"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Salary Generation Modal */}
      <SalaryGenerateModal
        open={isGenerateModalOpen}
        onOpenChange={setIsGenerateModalOpen}
        onSuccess={fetchSalaryRecords}
      />

      {/* Salary Detail Breakdown Modal */}
      <SalaryDetailModal
        open={Boolean(selectedRecordForDetail)}
        onOpenChange={(open) => !open && setSelectedRecordForDetail(null)}
        record={selectedRecordForDetail}
        onPayClick={(record) => {
          setSelectedRecordForDetail(null)
          setSelectedRecordForPay(record)
        }}
        canPay={canDisburse}
      />

      {/* Salary Payment Disbursement Modal */}
      <SalaryPayModal
        open={Boolean(selectedRecordForPay)}
        onOpenChange={(open) => !open && setSelectedRecordForPay(null)}
        record={selectedRecordForPay}
        onSuccess={fetchSalaryRecords}
      />
    </div>
  )
}

export default SalaryRecordsPage
