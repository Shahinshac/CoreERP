import React, { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
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
  const [searchParams] = useSearchParams()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  useEffect(() => {
    if (searchParams.get("action") === "new" && canManage) {
      setEditingExpense(null)
      setIsModalOpen(true)
    }
  }, [searchParams, canManage])

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
          name: parseFloat(summary.returns_refunded || "0") > 0 ? "Net Revenue" : "Revenue",
          amount: parseFloat(summary.net_revenue || summary.revenue) || 0,
          fill: "#10b981", // emerald
        },
        ...(parseFloat(summary.returns_refunded || "0") > 0
          ? [
              {
                name: "Refunds",
                amount: parseFloat(summary.returns_refunded || "0"),
                fill: "#f43f5e", // rose
              },
            ]
          : []),
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-card border border-white/[0.14] rounded-xl p-6 shadow-none">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
              <Building className="w-6 h-6 text-primary" />
              Financial Management & Expenses
            </h1>
            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
              Phase 11
            </Badge>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Real-time P&L analytics, cash revenue recognition, receivables, and operational expenses ledger.
          </p>
        </div>

        {/* Period Picker & Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-[#0A0A0C] px-3 py-1.5 rounded-lg border border-white/[0.16]">
            <Calendar className="w-4 h-4 text-zinc-400" />
            <span className="text-xs font-medium text-zinc-300">Period:</span>
            <input
              type="month"
              value={selectedPeriod}
              onChange={(e) => {
                if (e.target.value) {
                  setSelectedPeriod(e.target.value)
                  setPage(1)
                }
              }}
              className="bg-transparent text-sm font-semibold focus:outline-none text-zinc-100 cursor-pointer"
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
            className="gap-1.5 border-white/[0.16] text-zinc-300 hover:text-white hover:bg-[#18181C]"
          >
            <RefreshCw className={`w-4 h-4 ${isSummaryRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          {canManage && (
            <Button
              size="sm"
              onClick={handleOpenCreate}
              className="bg-primary hover:bg-blue-500 text-white gap-1.5 font-medium shadow-none"
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
        <Card className="border-white/[0.14] bg-card shadow-none">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-xs font-semibold text-emerald-400 uppercase tracking-wider">
              <span>{parseFloat(summary?.returns_refunded || "0") > 0 ? "Net Cash Revenue" : "Cash Revenue"}</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <CardTitle className="text-2xl font-bold text-zinc-100">
              {isSummaryLoading ? "..." : fmtMoney(summary?.net_revenue || summary?.revenue)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-zinc-400">
              {parseFloat(summary?.returns_refunded || "0") > 0
                ? `Gross: ${fmtMoney(summary?.revenue)} • Refunds: -${fmtMoney(summary?.returns_refunded)}`
                : `Cash basis receipts received in ${selectedPeriod}`}
            </p>
            <div className="mt-2 text-[11px] text-zinc-400 flex items-center justify-between border-t border-white/[0.08] pt-1.5">
              <span>Invoiced (Accrual):</span>
              <span className="font-semibold text-zinc-200">{fmtMoney(summary?.invoiced_revenue)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Cost of Goods Sold */}
        <Card className="border-white/[0.14] bg-card shadow-none">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-xs font-semibold text-amber-400 uppercase tracking-wider">
              <span>Cost of Goods (COGS)</span>
              <ShoppingBag className="w-4 h-4 text-amber-400" />
            </div>
            <CardTitle className="text-2xl font-bold text-zinc-100">
              {isSummaryLoading ? "..." : fmtMoney(summary?.cost_of_goods)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-zinc-400">
              Supplier purchases & stock inventory intake
            </p>
            <div className="mt-2 text-[11px] text-zinc-400 flex items-center justify-between border-t border-white/[0.08] pt-1.5">
              <span>Gross Profit:</span>
              <span className={`font-semibold ${isGrossProfitPositive ? "text-primary" : "text-rose-400"}`}>
                {fmtMoney(summary?.gross_profit)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Total Expenses */}
        <Card className="border-white/[0.14] bg-card shadow-none">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-xs font-semibold text-rose-400 uppercase tracking-wider">
              <span>Total Expenses</span>
              <Receipt className="w-4 h-4 text-rose-400" />
            </div>
            <CardTitle className="text-2xl font-bold text-zinc-100">
              {isSummaryLoading ? "..." : fmtMoney(summary?.expenses)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-zinc-400">
              Operating costs + Phase 10 payroll sync
            </p>
            <div className="mt-2 text-[11px] text-zinc-400 flex items-center justify-between border-t border-white/[0.08] pt-1.5">
              <span>Net Profit:</span>
              <span className={`font-bold ${isNetProfitPositive ? "text-emerald-400" : "text-rose-400"}`}>
                {fmtMoney(summary?.net_profit)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Total Receivables (Invoice + EMI) */}
        <Card className="border-white/[0.14] bg-card shadow-none">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-xs font-semibold text-primary uppercase tracking-wider">
              <span>Total Receivables</span>
              <CreditCard className="w-4 h-4 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold text-zinc-100">
              {isSummaryLoading ? "..." : fmtMoney(summary?.total_receivables)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1 text-[11px] text-zinc-400">
              <div className="flex items-center justify-between">
                <span>Invoices Unpaid:</span>
                <span className="font-semibold text-zinc-200">
                  {fmtMoney(summary?.outstanding_receivables)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-white/[0.08] pt-1">
                <span>EMI Dues Remaining:</span>
                <span className="font-semibold text-primary">
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
        <Card className="lg:col-span-2 border-white/[0.14] bg-card shadow-none">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2 text-zinc-100">
                <BarChart3 className="w-4 h-4 text-primary" />
                Period P&L Structure ({selectedPeriod})
              </CardTitle>
              <p className="text-xs text-zinc-400 mt-0.5">
                Side-by-side financial breakdown using strict Decimal money accounting
              </p>
            </div>
            <Badge variant="secondary" className="text-[11px] bg-white/[0.06] text-zinc-300 border-white/[0.10]">
              {summary?.accounting_basis}
            </Badge>
          </CardHeader>
          <CardContent>
            {isSummaryLoading ? (
              <div className="h-64 flex items-center justify-center text-zinc-400 text-sm">
                Loading financial metrics...
              </div>
            ) : pnlComparisonData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-zinc-400 text-sm">
                No activity recorded for {selectedPeriod}
              </div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pnlComparisonData} margin={{ top: 15, right: 20, left: 10, bottom: 25 }}>
                    <XAxis
                      dataKey="name"
                      stroke="#94949C"
                      fontSize={11}
                      tickLine={false}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                    />
                    <YAxis
                      stroke="#94949C"
                      fontSize={11}
                      tickLine={false}
                      tickFormatter={(val) => `₹${val}`}
                    />
                    <Tooltip
                      formatter={(val: unknown) => [
                        `₹${(typeof val === "number" ? val : 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
                        "Amount",
                      ]}
                      contentStyle={{ backgroundColor: "#0C0C0E", borderColor: "rgba(255,255,255,0.14)", color: "#F5F5F7", borderRadius: "8px" }}
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
        <Card className="border-white/[0.14] bg-card shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-zinc-100">
              <PieChartIcon className="w-4 h-4 text-primary" />
              Expense Breakdown
            </CardTitle>
            <p className="text-xs text-zinc-400 mt-0.5">
              Categorical distribution of operational expenditures
            </p>
          </CardHeader>
          <CardContent>
            {categoryBreakdownData.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-zinc-400 text-sm">
                <Receipt className="w-8 h-8 stroke-1 text-zinc-500 mb-2" />
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
                        contentStyle={{ backgroundColor: "#0C0C0E", borderColor: "rgba(255,255,255,0.14)", color: "#F5F5F7", borderRadius: "8px" }}
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
                        <span className="text-zinc-300 truncate max-w-[120px]">
                          {item.name}
                        </span>
                      </div>
                      <span className="font-semibold text-zinc-100 font-mono">
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
      <Card className="border-white/[0.14] bg-card shadow-none">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2 text-zinc-100">
                <Receipt className="w-5 h-5 text-primary" />
                Expenses Ledger
              </CardTitle>
              <p className="text-xs text-zinc-400 mt-1">
                Detailed record of all operating overheads, including automated Phase 10 payroll syncs.
              </p>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-9 px-3 text-xs bg-[#0A0A0C] border border-white/[0.16] text-zinc-200 [&>option]:bg-[#0C0C0E] rounded-md focus:outline-none focus:border-primary/60"
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
                className="h-9 px-3 text-xs bg-[#0A0A0C] border border-white/[0.16] text-zinc-200 [&>option]:bg-[#0C0C0E] rounded-md focus:outline-none focus:border-primary/60"
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
                <tr className="border-b border-t border-white/[0.08] bg-white/[0.02] text-zinc-400 text-xs">
                  <th className="py-3 px-4 font-semibold">Date</th>
                  <th className="py-3 px-4 font-semibold">Category</th>
                  <th className="py-3 px-4 font-semibold">Description</th>
                  <th className="py-3 px-4 font-semibold">Source & Reference</th>
                  <th className="py-3 px-4 font-semibold text-right">Amount (₹)</th>
                  <th className="py-3 px-4 font-semibold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.08]">
                {isExpensesLoading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-zinc-400">
                      Loading expenses...
                    </td>
                  </tr>
                ) : !expensesData || expensesData.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-zinc-400">
                      No expenses found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  expensesData.items.map((exp) => {
                    const isSystem = exp.source === "system_salary"
                    return (
                      <tr
                        key={exp.id}
                        className="hover:bg-white/[0.04] transition-colors"
                      >
                        <td className="py-3 px-4 whitespace-nowrap text-zinc-100 font-medium">
                          {exp.date}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{
                              backgroundColor: `${CATEGORY_COLORS[exp.category] || "#64748b"}25`,
                              color: CATEGORY_COLORS[exp.category] || "#64748b",
                            }}
                          >
                            {CATEGORY_LABELS[exp.category] || exp.category}
                          </span>
                        </td>
                        <td className="py-3 px-4 max-w-xs truncate text-zinc-300">
                          {exp.description || "—"}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {isSystem ? (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-950/40 text-amber-400 border border-amber-500/30">
                                <Lock className="w-3 h-3" />
                                System Payroll
                              </span>
                              {exp.reference_id && (
                                <span className="text-[10px] text-zinc-500 font-mono" title={`SalaryRecord ID: ${exp.reference_id}`}>
                                  ref:{exp.reference_id.slice(0, 8)}...
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-white/[0.04] text-zinc-300 border border-white/[0.10]">
                              Manual
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-right font-semibold text-zinc-100 font-mono">
                          {fmtMoney(exp.amount)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-center">
                          {isSystem ? (
                            <span
                              className="text-xs text-zinc-500 italic flex items-center justify-center gap-1"
                              title="Immutable: Synchronized from Phase 10 payroll"
                            >
                              <Lock className="w-3 h-3" /> Immutable
                            </span>
                          ) : canManage ? (
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-white/[0.08]"
                                onClick={() => handleOpenEdit(exp)}
                                title="Edit Expense"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-zinc-400 hover:text-rose-400 hover:bg-rose-950/30"
                                onClick={() => handleDelete(exp)}
                                title="Delete Expense (Audit Safe)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-zinc-500">—</span>
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
            <div className="flex items-center justify-between p-4 border-t border-white/[0.08] text-xs text-zinc-400">
              <span>
                Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, expensesData.total)} of {expensesData.total} expenses
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="h-8 text-xs border-white/[0.16] hover:bg-[#18181C] text-zinc-200"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page * limit >= expensesData.total}
                  onClick={() => setPage(page + 1)}
                  className="h-8 text-xs border-white/[0.16] hover:bg-[#18181C] text-zinc-200"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0C0C0E] border border-white/[0.14] rounded-xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertCircle className="w-6 h-6" />
              <h3 className="font-bold text-base text-zinc-100">
                Confirm Soft Delete
              </h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              This manual expense will be soft-deleted. The audit log retains the deletion timestamp and user ID, and it will be excluded from subsequent financial P&L aggregations.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteConfirmId(null)}
                disabled={deleteMutation.isPending}
                className="border-white/[0.16] hover:bg-[#18181C] text-zinc-200"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={confirmDelete}
                disabled={deleteMutation.isPending}
                className="bg-rose-600 hover:bg-rose-500 text-white"
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
