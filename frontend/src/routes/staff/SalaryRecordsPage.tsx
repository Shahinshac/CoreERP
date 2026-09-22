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
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Payroll & Salary Records
            </h1>
            <Badge variant="outline" className="text-xs font-semibold text-emerald-600 border-emerald-200">
              {totalCount} Records
            </Badge>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Browse snapshotted monthly salary runs, inspect itemized deduction breakdowns, and execute payouts.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link to="/staff/staff-management">
            <Button variant="outline" className="gap-1.5 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800">
              <Users className="w-4 h-4" />
              Staff Directory
            </Button>
          </Link>

          {isAdmin && (
            <Button
              onClick={() => setIsGenerateModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm"
            >
              <PlusCircle className="w-4 h-4" />
              Generate Salary Run
            </Button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <Filter className="w-3.5 h-3.5" /> Filter Period:
          </div>

          <input
            type="month"
            value={periodFilter}
            onChange={(e) => {
              setPeriodFilter(e.target.value)
              setPage(1)
            }}
            className="h-9 px-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 font-mono focus:outline-none"
          />

          {periodFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPeriodFilter("")
                setPage(1)
              }}
              className="h-9 text-xs text-slate-500"
            >
              Clear Month
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(1)
            }}
            className="h-9 px-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="generated">Generated (Unpaid)</option>
            <option value="paid">Paid (Disbursed)</option>
          </select>
        </div>
      </div>

      {/* Salary Records Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
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
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Loading salary records...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    No salary records found for the selected filter.
                  </td>
                </tr>
              ) : (
                records.map((r) => {
                  const isPaid = r.status === "paid"
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {r.period}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {r.staff_name || r.staff_email}
                        </div>
                        <div className="text-xs text-slate-500">{r.staff_email}</div>
                      </td>

                      <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-400">
                        {r.employee_code || "—"}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                        ₹{parseFloat(r.base_salary).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>

                      <td className="py-3 px-4 font-mono text-rose-600 dark:text-rose-400">
                        -₹{parseFloat(r.total_deductions).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        ₹{parseFloat(r.net_salary).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                            isPaid
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                              : "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
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
                            className="h-8 text-xs text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" /> Details
                          </Button>

                          {!isPaid && canDisburse && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedRecordForPay(r)}
                              className="h-8 text-xs text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 gap-1 font-medium"
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
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <div>
              Showing {(page - 1) * limit + 1} - {Math.min(page * limit, totalCount)} of {totalCount} records
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="h-8 text-xs"
              >
                Previous
              </Button>
              <span className="px-2">Page {page}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={page * limit >= totalCount}
                onClick={() => setPage(page + 1)}
                className="h-8 text-xs"
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
