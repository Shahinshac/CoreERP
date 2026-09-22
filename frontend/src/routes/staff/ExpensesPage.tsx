import React, { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Receipt,
  Plus,
  DollarSign,
  ShoppingBag,
  CreditCard,
  Building,
  RefreshCw,
  Lock,
  Edit2,
  Trash2,
  AlertCircle,
  PieChart as PieChartIcon,
  BarChart3,
  Calendar,
} from "lucide-react"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
} from "recharts"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { financeApi } from "@/features/finance/api"
import { Expense } from "@/features/finance/types"
import { ExpenseModal } from "@/features/finance/ExpenseModal"
import { useAuth } from "@/features/auth/AuthContext"

const CATEGORY_COLORS: Record<string, string> = {
  salary: "#6366f1", // indigo
  rent: "#8b5cf6", // purple
  utilities: "#3b82f6", // blue
  transport: "#06b6d4", // cyan
  marketing: "#ec4899", // pink
  maintenance: "#f59e0b", // amber
  other: "#64748b", // slate
}

const CATEGORY_LABELS: Record<string, string> = {
  salary: "Salary & Payroll",
  rent: "Rent & Lease",
  utilities: "Utilities",
  transport: "Transport & Logistics",
  marketing: "Marketing & Ads",
  maintenance: "Maintenance",
  other: "Other Overhead",
}

export const ExpensesPage: React.FC = () => {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const callerRole = (user as { role?: string })?.role || "Staff"
  const canManage = callerRole === "Super Admin" || callerRole === "Admin" || callerRole === "Accountant"

  // Current selected period in YYYY-MM format
  const currentMonthStr = new Date().toISOString().slice(0, 7)
  const [selectedPeriod, setSelectedPeriod] = useState<string>(currentMonthStr)

  // Filters for Expenses list
  const [categoryFilter, setCategoryFilter] = useState<string>("")
  const [sourceFilter, setSourceFilter] = useState<string>("")
  const [page, setPage] = useState<number>(1)
  const limit = 15

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // 1. Fetch Financial Summary for selected period
  const {
    data: summary,
    isLoading: isSummaryLoading,
    isRefetching: isSummaryRefetching,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ["finance-summary", selectedPeriod],
    queryFn: () => financeApi.getSummary(selectedPeriod),
  })

  // 2. Fetch Expenses list
  const {
    data: expensesData,
    isLoading: isExpensesLoading,
    refetch: refetchExpenses,
  } = useQuery({
    queryKey: ["finance-expenses", selectedPeriod, categoryFilter, sourceFilter, page],
    queryFn: () =>
      financeApi.listExpenses({
        period: selectedPeriod,
        category: categoryFilter || undefined,
        source: sourceFilter || undefined,
        page,
        limit,
      }),
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => financeApi.deleteExpense(id),
    onSuccess: () => {
      toast.success("Expense removed (soft deleted for audit compliance)")
      setDeleteConfirmId(null)
      queryClient.invalidateQueries({ queryKey: ["finance-expenses"] })
      queryClient.invalidateQueries({ queryKey: ["finance-summary"] })
    },
    onError: () => {
      setDeleteConfirmId(null)
    },
  })

  const handleOpenCreate = () => {
    setEditingExpense(null)
    setIsModalOpen(true)
  }

  const handleOpenEdit = (exp: Expense) => {
    if (exp.source === "system_salary") {
      toast.error("System-generated salary expenses cannot be edited")
      return
    }
    setEditingExpense(exp)
    setIsModalOpen(true)
  }

  const handleDelete = (exp: Expense) => {
    if (exp.source === "system_salary") {
      toast.error("System-generated salary expenses cannot be deleted")
      return
    }
    setDeleteConfirmId(exp.id)
  }

  const confirmDelete = () => {
    if (deleteConfirmId) {
      deleteMutation.mutate(deleteConfirmId)
    }
  }

  // Formatting helpers
  const fmtMoney = (val?: string | number) => {
    const num = typeof val === "string" ? parseFloat(val) : val || 0
    return `₹${(num || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  // Prepare chart data for breakdown
  const categoryBreakdownData = summary?.expenses_breakdown
    ? Object.entries(summary.expenses_breakdown).map(([cat, amt]) => ({
        name: CATEGORY_LABELS[cat] || cat,
        key: cat,
        value: parseFloat(amt) || 0,
        color: CATEGORY_COLORS[cat] || "#94a3b8",
      })).filter((item) => item.value > 0)
    : []

  // Comparison metrics for bar chart
  const pnlComparisonData = summary
    ? [
        {
          name: "Revenue (Cash)",
          amount: parseFloat(summary.revenue) || 0,
          fill: "#10b981", // emerald
        },
        {
          name: "COGS",
          amount: parseFloat(summary.cost_of_goods) || 0,
          fill: "#f59e0b", // amber
        },
        {
          name: "Expenses",
          amount: parseFloat(summary.expenses) || 0,
          fill: "#ef4444", // rose
        },
        {
          name: "Gross Profit",
          amount: parseFloat(summary.gross_profit) || 0,
          fill: "#3b82f6", // blue
        },
        {
          name: "Net Profit",
          amount: parseFloat(summary.net_profit) || 0,
          fill: parseFloat(summary.net_profit) >= 0 ? "#6366f1" : "#dc2626", // indigo or deep red
        },
      ]
    : []

  const isNetProfitPositive = parseFloat(summary?.net_profit || "0") >= 0
  const isGrossProfitPositive = parseFloat(summary?.gross_profit || "0") >= 0

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header & Period Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Building className="w-6 h-6 text-indigo-600" />
              Financial Management & Expenses
            </h1>
            <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-200">
              Phase 11
            </Badge>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Real-time P&L analytics, cash revenue recognition, receivables, and operational expenses ledger.
          </p>
        </div>

        {/* Period Picker & Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Period:</span>
            <input
              type="month"
              value={selectedPeriod}
              onChange={(e) => {
                if (e.target.value) {
                  setSelectedPeriod(e.target.value)
                  setPage(1)
                }
              }}
              className="bg-transparent text-sm font-semibold focus:outline-none text-slate-900 dark:text-slate-100 cursor-pointer"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchSummary()
              refetchExpenses()
            }}
            disabled={isSummaryLoading || isSummaryRefetching}
            className="gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${isSummaryRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          {canManage && (
            <Button
              size="sm"
              onClick={handleOpenCreate}
              className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Record Expense
            </Button>
          )}
        </div>
      </div>

      {/* Live Financial KPI Dashboard Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Cash Revenue */}
        <Card className="border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/20 dark:bg-emerald-950/10">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-xs font-semibold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider">
              <span>Cash Revenue</span>
              <DollarSign className="w-4 h-4 text-emerald-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {isSummaryLoading ? "..." : fmtMoney(summary?.revenue)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cash basis receipts received in {selectedPeriod}
            </p>
            <div className="mt-2 text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-1.5">
              <span>Invoiced (Accrual):</span>
              <span className="font-semibold">{fmtMoney(summary?.invoiced_revenue)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Cost of Goods Sold */}
        <Card className="border-amber-200 dark:border-amber-900/50 bg-amber-50/20 dark:bg-amber-950/10">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-xs font-semibold text-amber-800 dark:text-amber-400 uppercase tracking-wider">
              <span>Cost of Goods (COGS)</span>
              <ShoppingBag className="w-4 h-4 text-amber-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {isSummaryLoading ? "..." : fmtMoney(summary?.cost_of_goods)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Supplier purchases & stock inventory intake
            </p>
            <div className="mt-2 text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-1.5">
              <span>Gross Profit:</span>
              <span className={`font-semibold ${isGrossProfitPositive ? "text-blue-600" : "text-rose-600"}`}>
                {fmtMoney(summary?.gross_profit)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Total Expenses */}
        <Card className="border-rose-200 dark:border-rose-900/50 bg-rose-50/20 dark:bg-rose-950/10">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-xs font-semibold text-rose-800 dark:text-rose-400 uppercase tracking-wider">
              <span>Total Expenses</span>
              <Receipt className="w-4 h-4 text-rose-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {isSummaryLoading ? "..." : fmtMoney(summary?.expenses)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Operating costs + Phase 10 payroll sync
            </p>
            <div className="mt-2 text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-1.5">
              <span>Net Profit:</span>
              <span className={`font-bold ${isNetProfitPositive ? "text-emerald-600" : "text-rose-600"}`}>
                {fmtMoney(summary?.net_profit)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Total Receivables (Invoice + EMI) */}
        <Card className="border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/20 dark:bg-indigo-950/10">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-xs font-semibold text-indigo-800 dark:text-indigo-400 uppercase tracking-wider">
              <span>Total Receivables</span>
              <CreditCard className="w-4 h-4 text-indigo-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {isSummaryLoading ? "..." : fmtMoney(summary?.total_receivables)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
              <div className="flex items-center justify-between">
                <span>Invoices Unpaid:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {fmtMoney(summary?.outstanding_receivables)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-1">
                <span>EMI Dues Remaining:</span>
                <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                  {fmtMoney(summary?.emi_receivables)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Visual Analytics Row: P&L Structure & Expense Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* P&L Components Comparison Bar Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-600" />
                Period P&L Structure ({selectedPeriod})
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Side-by-side financial breakdown using strict Decimal money accounting
              </p>
            </div>
            <Badge variant="secondary" className="text-[11px]">
              {summary?.accounting_basis}
            </Badge>
          </CardHeader>
          <CardContent>
            {isSummaryLoading ? (
              <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                Loading financial metrics...
              </div>
            ) : pnlComparisonData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                No activity recorded for {selectedPeriod}
              </div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pnlComparisonData} margin={{ top: 15, right: 20, left: 10, bottom: 25 }}>
                    <XAxis
                      dataKey="name"
                      stroke="#888888"
                      fontSize={11}
                      tickLine={false}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                    />
                    <YAxis
                      stroke="#888888"
                      fontSize={11}
                      tickLine={false}
                      tickFormatter={(val) => `₹${val}`}
                    />
                    <Tooltip
                      formatter={(val: unknown) => [
                        `₹${(typeof val === "number" ? val : 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
                        "Amount",
                      ]}
                      contentStyle={{ backgroundColor: "#1e293b", borderColor: "#334155", color: "#f8fafc", borderRadius: "8px" }}
                    />
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                      {pnlComparisonData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expense Category Breakdown Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 text-rose-600" />
              Expense Breakdown
            </CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Categorical distribution of operational expenditures
            </p>
          </CardHeader>
          <CardContent>
            {categoryBreakdownData.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-sm">
                <Receipt className="w-8 h-8 stroke-1 text-slate-300 mb-2" />
                <span>No expenses in {selectedPeriod}</span>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryBreakdownData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={38}
                        outerRadius={65}
                        paddingAngle={2}
                      >
                        {categoryBreakdownData.map((entry, index) => (
                          <Cell key={`slice-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val: unknown) => [
                          `₹${(typeof val === "number" ? val : 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
                          "Amount",
                        ]}
                        contentStyle={{ backgroundColor: "#1e293b", borderColor: "#334155", color: "#f8fafc", borderRadius: "8px" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Legend list */}
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {categoryBreakdownData.map((item) => (
                    <div key={item.key} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-slate-700 dark:text-slate-300 truncate max-w-[120px]">
                          {item.name}
                        </span>
                      </div>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {fmtMoney(item.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Expense Ledger Table */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Receipt className="w-5 h-5 text-indigo-600" />
                Expenses Ledger
              </CardTitle>
              <p className="text-xs text-slate-500 mt-1">
                Detailed record of all operating overheads, including automated Phase 10 payroll syncs.
              </p>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-9 px-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none"
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">All Categories</option>
                <option value="salary">Salary</option>
                <option value="rent">Rent</option>
                <option value="utilities">Utilities</option>
                <option value="transport">Transport</option>
                <option value="marketing">Marketing</option>
                <option value="maintenance">Maintenance</option>
                <option value="other">Other</option>
              </select>

              <select
                className="h-9 px-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none"
                value={sourceFilter}
                onChange={(e) => {
                  setSourceFilter(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">All Sources</option>
                <option value="manual">Manual Entry Only</option>
                <option value="system_salary">System Salary (Phase 10)</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 text-xs">
                  <th className="py-3 px-4 font-semibold">Date</th>
                  <th className="py-3 px-4 font-semibold">Category</th>
                  <th className="py-3 px-4 font-semibold">Description</th>
                  <th className="py-3 px-4 font-semibold">Source & Reference</th>
                  <th className="py-3 px-4 font-semibold text-right">Amount (₹)</th>
                  <th className="py-3 px-4 font-semibold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {isExpensesLoading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      Loading expenses...
                    </td>
                  </tr>
                ) : !expensesData || expensesData.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No expenses found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  expensesData.items.map((exp) => {
                    const isSystem = exp.source === "system_salary"
                    return (
                      <tr
                        key={exp.id}
                        className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3 px-4 whitespace-nowrap text-slate-900 dark:text-slate-100 font-medium">
                          {exp.date}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{
                              backgroundColor: `${CATEGORY_COLORS[exp.category] || "#64748b"}20`,
                              color: CATEGORY_COLORS[exp.category] || "#64748b",
                            }}
                          >
                            {CATEGORY_LABELS[exp.category] || exp.category}
                          </span>
                        </td>
                        <td className="py-3 px-4 max-w-xs truncate text-slate-600 dark:text-slate-300">
                          {exp.description || "—"}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {isSystem ? (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
                                <Lock className="w-3 h-3" />
                                System Payroll
                              </span>
                              {exp.reference_id && (
                                <span className="text-[10px] text-slate-400 font-mono" title={`SalaryRecord ID: ${exp.reference_id}`}>
                                  ref:{exp.reference_id.slice(0, 8)}...
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              Manual
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-right font-semibold text-slate-900 dark:text-slate-100">
                          {fmtMoney(exp.amount)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-center">
                          {isSystem ? (
                            <span
                              className="text-xs text-slate-400 italic flex items-center justify-center gap-1"
                              title="Immutable: Synchronized from Phase 10 payroll"
                            >
                              <Lock className="w-3 h-3" /> Immutable
                            </span>
                          ) : canManage ? (
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-slate-500 hover:text-indigo-600"
                                onClick={() => handleOpenEdit(exp)}
                                title="Edit Expense"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-slate-500 hover:text-rose-600"
                                onClick={() => handleDelete(exp)}
                                title="Delete Expense (Audit Safe)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {expensesData && expensesData.total > limit && (
            <div className="flex items-center justify-between p-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500">
              <span>
                Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, expensesData.total)} of {expensesData.total} expenses
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="h-8 text-xs"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page * limit >= expensesData.total}
                  onClick={() => setPage(page + 1)}
                  className="h-8 text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertCircle className="w-6 h-6" />
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                Confirm Soft Delete
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              This manual expense will be soft-deleted. The audit log retains the deletion timestamp and user ID, and it will be excluded from subsequent financial P&L aggregations.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteConfirmId(null)}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={confirmDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deleting..." : "Confirm Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Expense Modal */}
      <ExpenseModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        expense={editingExpense}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["finance-expenses"] })
          queryClient.invalidateQueries({ queryKey: ["finance-summary"] })
        }}
      />
    </div>
  )
}

export default ExpensesPage
