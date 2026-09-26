import React, { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  BarChart3,
  FileText,
  TrendingUp,
  Package,
  Users,
  CreditCard,
  Calendar,
  Download,
  RefreshCw,
  ShoppingCart,
  DollarSign,
  Receipt,
  Briefcase,
  PieChart,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Hourglass,
  Search,
} from "lucide-react"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts"
import { Button } from "@/components/ui/button"
import { reportsApi, ReportType } from "@/features/reports/api"

// ============================================================
// Types
// ============================================================

type Tab =
  | "profit-loss"
  | "sales"
  | "purchases"
  | "inventory"
  | "inventory-aging"
  | "gst"
  | "payments"
  | "expenses"
  | "salary"
  | "customers"
  | "emi"

interface TabConfig {
  id: Tab
  label: string
  icon: React.ElementType
  exports: ("csv" | "excel" | "pdf")[]
  noDateRange?: boolean
}

const TABS: TabConfig[] = [
  { id: "profit-loss", label: "Profit & Loss", icon: TrendingUp, exports: ["csv", "excel", "pdf"] },
  { id: "sales", label: "Sales", icon: Receipt, exports: ["csv", "excel", "pdf"] },
  { id: "gst", label: "GST", icon: FileText, exports: ["csv", "excel"] },
  { id: "inventory", label: "Inventory", icon: Package, exports: ["csv", "excel"], noDateRange: true },
  { id: "inventory-aging", label: "Dead Stock / Aging", icon: Hourglass, exports: ["csv", "excel"], noDateRange: true },
  { id: "purchases", label: "Purchases", icon: ShoppingCart, exports: ["csv"] },
  { id: "payments", label: "Payments", icon: CreditCard, exports: ["csv"] },
  { id: "expenses", label: "Expenses", icon: DollarSign, exports: ["csv"] },
  { id: "salary", label: "Salary", icon: Briefcase, exports: ["csv"] },
  { id: "customers", label: "Customers", icon: Users, exports: ["csv"] },
  { id: "emi", label: "EMI Plans", icon: PieChart, exports: ["csv"] },
]

// ============================================================
// Helpers
// ============================================================

function today() {
  return new Date().toISOString().slice(0, 10)
}

function firstOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
}

function fmt(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined) return "—"
  if (typeof val === "boolean") return val ? "Yes" : "No"
  return String(val)
}

function fmtCurrency(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "—"
  const num = parseFloat(String(val))
  if (isNaN(num)) return String(val)
  return `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Column config per report type
const COLUMN_MAPS: Partial<Record<Tab, { key: string; label: string; currency?: boolean }[]>> = {
  "profit-loss": [
    { key: "period", label: "Period" },
    { key: "revenue", label: "Gross Revenue", currency: true },
    { key: "returns_refunded", label: "Refunds", currency: true },
    { key: "net_revenue", label: "Net Revenue", currency: true },
    { key: "invoiced_revenue", label: "Invoiced Rev.", currency: true },
    { key: "cost_of_goods", label: "COGS", currency: true },
    { key: "expenses", label: "Expenses", currency: true },
    { key: "gross_profit", label: "Gross Profit", currency: true },
    { key: "net_profit", label: "Net Profit", currency: true },
  ],
  sales: [
    { key: "invoice_number", label: "Invoice #" },
    { key: "sale_date", label: "Date" },
    { key: "customer_name", label: "Customer" },
    { key: "subtotal", label: "Subtotal", currency: true },
    { key: "discount_amount", label: "Discount", currency: true },
    { key: "tax_amount", label: "Tax", currency: true },
    { key: "total_amount", label: "Gross Total", currency: true },
    { key: "returned_amount", label: "Refunded", currency: true },
    { key: "net_amount", label: "Net Total", currency: true },
    { key: "status", label: "Status" },
    { key: "payment_method", label: "Method" },
  ],
  gst: [
    { key: "invoice_number", label: "Invoice #" },
    { key: "invoice_date", label: "Date" },
    { key: "buyer_name", label: "Buyer" },
    { key: "buyer_gstin", label: "GSTIN" },
    { key: "buyer_state", label: "State" },
    { key: "is_inter_state", label: "Inter-State" },
    { key: "taxable_value", label: "Taxable", currency: true },
    { key: "cgst_amount", label: "CGST", currency: true },
    { key: "sgst_amount", label: "SGST", currency: true },
    { key: "igst_amount", label: "IGST", currency: true },
    { key: "total_tax", label: "Total Tax", currency: true },
    { key: "grand_total", label: "Grand Total", currency: true },
  ],
  inventory: [
    { key: "name", label: "Product" },
    { key: "sku", label: "SKU" },
    { key: "hsn_code", label: "HSN/SAC" },
    { key: "category", label: "Category" },
    { key: "current_stock", label: "Stock" },
    { key: "min_stock", label: "Min Stock" },
    { key: "purchase_price", label: "Buy Price", currency: true },
    { key: "selling_price", label: "Sell Price", currency: true },
    { key: "valuation", label: "Valuation", currency: true },
    { key: "is_low_stock", label: "Low Stock?" },
  ],
  "inventory-aging": [
    { key: "name", label: "Product" },
    { key: "sku", label: "SKU" },
    { key: "hsn_code", label: "HSN/SAC" },
    { key: "category", label: "Category" },
    { key: "current_stock", label: "Stock" },
    { key: "purchase_price", label: "Buy Price", currency: true },
    { key: "selling_price", label: "Sell Price", currency: true },
    { key: "valuation", label: "Valuation", currency: true },
    { key: "last_sale_date", label: "Last Outbound" },
    { key: "days_inactive", label: "Days Inactive" },
    { key: "bucket", label: "Bucket" },
  ],
  purchases: [
    { key: "purchase_date", label: "Date" },
    { key: "supplier_name", label: "Supplier" },
    { key: "total_amount", label: "Amount", currency: true },
    { key: "status", label: "Status" },
  ],
  payments: [
    { key: "date", label: "Date" },
    { key: "method", label: "Method" },
    { key: "amount", label: "Amount", currency: true },
    { key: "status", label: "Status" },
    { key: "reference_id", label: "Ref #" },
  ],
  expenses: [
    { key: "date", label: "Date" },
    { key: "category", label: "Category" },
    { key: "description", label: "Description" },
    { key: "amount", label: "Amount", currency: true },
    { key: "source", label: "Source" },
  ],
  salary: [
    { key: "period", label: "Period" },
    { key: "staff_name", label: "Staff" },
    { key: "base_salary", label: "Base Salary", currency: true },
    { key: "total_deductions", label: "Deductions", currency: true },
    { key: "net_salary", label: "Net Salary", currency: true },
    { key: "status", label: "Status" },
    { key: "generated_at", label: "Generated" },
  ],
  customers: [
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "is_active", label: "Active" },
    { key: "joined_date", label: "Joined" },
  ],
  emi: [
    { key: "customer_id", label: "Customer ID" },
    { key: "start_date", label: "Start Date" },
    { key: "principal", label: "Principal", currency: true },
    { key: "down_payment", label: "Down Payment", currency: true },
    { key: "installments", label: "Installments" },
    { key: "installment_amount", label: "Per Installment", currency: true },
    { key: "status", label: "Status" },
  ],
}

// ============================================================
// Summary card component
// ============================================================

function SummaryCard({
  label,
  value,
  currency = false,
  highlight = false,
}: {
  label: string
  value: string | number | undefined
  currency?: boolean
  highlight?: boolean
}) {
  const display =
    currency && value !== undefined
      ? fmtCurrency(String(value))
      : value !== undefined
      ? String(value)
      : "—"

  const isNegative = display.includes("-")

  return (
    <div
      className={`rounded-xl p-4 border transition-all ${
        highlight
          ? "bg-primary/10 border-primary/40 text-primary"
          : "bg-card border-white/[0.14] text-zinc-100"
      }`}
    >
      <p className="text-xs text-zinc-400 mb-1 font-medium uppercase tracking-wide">{label}</p>
      <p
        className={`text-lg font-bold font-mono ${
          isNegative ? "text-rose-400" : highlight ? "text-primary" : "text-zinc-100"
        }`}
      >
        {display}
      </p>
    </div>
  )
}

// ============================================================
// Export button
// ============================================================

function ExportButton({
  format,
  type,
  startDate,
  endDate,
  lowStockOnly,
  bucket,
  disabled,
}: {
  format: "csv" | "excel" | "pdf"
  type: ReportType
  startDate?: string
  endDate?: string
  lowStockOnly?: boolean
  bucket?: string
  disabled?: boolean
}) {
  const [downloading, setDownloading] = useState(false)
  const icons = { csv: FileText, excel: FileSpreadsheet, pdf: BarChart3 }
  const labels = { csv: "CSV", excel: "Excel", pdf: "PDF" }
  const Icon = icons[format]

  const handleDownload = async () => {
    if (disabled || downloading) return
    setDownloading(true)
    try {
      await reportsApi.download(type, format, {
        start_date: startDate,
        end_date: endDate,
        low_stock_only: lowStockOnly,
        bucket,
      })
      toast.success(`${labels[format]} exported successfully`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Download failed"
      toast.error(`Export failed: ${msg}`)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={disabled || downloading}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
        disabled || downloading
          ? "bg-white/[0.04] text-zinc-500 cursor-not-allowed border border-white/[0.08]"
          : format === "pdf"
          ? "bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-500/30"
          : format === "excel"
          ? "bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border border-emerald-500/30"
          : "bg-primary/15 hover:bg-primary/25 text-blue-300 border border-primary/30"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {downloading ? "Exporting..." : labels[format]}
    </button>
  )
}

// ============================================================
// P&L Chart
// ============================================================

function PLChart({ rows }: { rows: Record<string, string | number | boolean | null>[] }) {
  const data = rows.map((r) => ({
    period: fmt(r.period),
    "Net Revenue": parseFloat(String(r.net_revenue ?? r.revenue ?? 0)),
    COGS: parseFloat(String(r.cost_of_goods || 0)),
    Expenses: parseFloat(String(r.expenses || 0)),
    "Net Profit": parseFloat(String(r.net_profit || 0)),
  }))

  return (
    <div className="h-64 mt-4 bg-card p-4 rounded-xl border border-white/[0.14]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="period" tick={{ fill: "#94949C", fontSize: 11 }} />
          <YAxis
            tick={{ fill: "#94949C", fontSize: 10 }}
            tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip
            contentStyle={{ background: "#0C0C0E", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 8, boxShadow: "none" }}
            labelStyle={{ color: "#F5F5F7", fontWeight: 600 }}
            itemStyle={{ color: "#C4C4C8" }}
            formatter={(v: any) => [`₹${Number(v || 0).toLocaleString("en-IN")}`, ""]}
          />
          <Legend wrapperStyle={{ color: "#C4C4C8", fontSize: 11 }} />
          <Bar dataKey="Net Revenue" fill="#3B82F6" radius={[3, 3, 0, 0]} />
          <Bar dataKey="COGS" fill="#F59E0B" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Expenses" fill="#EF4444" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Net Profit" fill="#10B981" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ============================================================
// Data table
// ============================================================

function DataTable({
  columns,
  rows,
  isLoading,
}: {
  columns: { key: string; label: string; currency?: boolean }[]
  rows: Record<string, string | number | boolean | null>[]
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-400 gap-3">
        <RefreshCw className="h-5 w-5 animate-spin text-primary" />
        Loading report data…
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-400 gap-2">
        <BarChart3 className="h-10 w-10 opacity-30 text-zinc-500" />
        <p className="text-sm">No records found for this period.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.14] bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-white/[0.02] border-b border-white/[0.08]">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-3 py-3 text-left font-semibold text-zinc-400 text-xs uppercase tracking-wide whitespace-nowrap"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-white/[0.08] transition-colors hover:bg-white/[0.04]"
            >
              {columns.map((col) => {
                const raw = row[col.key]
                const display = col.currency ? fmtCurrency(raw as string) : fmt(raw)
                const isNeg = col.currency && display.includes("-")
                const isLowStock = col.key === "is_low_stock" && raw === true
                const isNegProfit =
                  col.key === "net_profit" && display.includes("-")

                const isBucket = col.key === "bucket"
                const isDeadStock = isBucket && raw === "90+"
                const isDaysInactive = col.key === "days_inactive" && typeof raw === "number" && raw >= 90

                return (
                  <td
                    key={col.key}
                    className={`px-3 py-2.5 whitespace-nowrap font-mono text-xs ${
                      isDeadStock || isDaysInactive
                        ? "text-rose-400 font-medium"
                        : isNeg || isNegProfit
                        ? "text-rose-400"
                        : isLowStock
                        ? "text-amber-400"
                        : col.currency
                        ? "text-emerald-400"
                        : "text-zinc-200"
                    }`}
                  >
                    {isLowStock ? (
                      <span className="inline-flex items-center gap-1 bg-amber-950/40 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full text-xs">
                        ⚠ Low
                      </span>
                    ) : isBucket ? (
                      raw === "90+" ? (
                        <span className="inline-flex items-center gap-1 bg-rose-950/50 text-rose-300 border border-rose-500/40 px-2 py-0.5 rounded-full text-xs font-semibold">
                          ⚠ Dead Stock (90+ d)
                        </span>
                      ) : raw === "61-90" ? (
                        <span className="inline-flex items-center gap-1 bg-amber-950/40 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full text-xs font-medium">
                          61-90 days
                        </span>
                      ) : raw === "31-60" ? (
                        <span className="inline-flex items-center gap-1 bg-yellow-950/30 text-yellow-300 border border-yellow-500/20 px-2 py-0.5 rounded-full text-xs font-medium">
                          31-60 days
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-emerald-950/40 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full text-xs font-medium">
                          0-30 days
                        </span>
                      )
                    ) : (
                      display
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface SummaryCardItem {
  label: string
  value: string
  currency?: boolean
  highlight?: boolean
}

// ============================================================
// Main ReportsPage
// ============================================================

export const ReportsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>("profit-loss")
  const [startDate, setStartDate] = useState(firstOfMonth())
  const [endDate, setEndDate] = useState(today())
  const [page, setPage] = useState(1)
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [agingBucket, setAgingBucket] = useState<string>("")
  const [agingSearch, setAgingSearch] = useState<string>("")

  const tabCfg = TABS.find((t) => t.id === activeTab)!
  const columns = COLUMN_MAPS[activeTab] ?? []

  // Reset page when switching tabs or date range
  const resetPage = () => setPage(1)

  const params = useMemo(() => {
    const p: Record<string, string | number | boolean> = { page, page_size: 50 }
    if (!tabCfg.noDateRange) {
      p.start_date = startDate
      p.end_date = endDate
    }
    if (activeTab === "inventory" && lowStockOnly) {
      p.low_stock_only = true
    }
    if (activeTab === "inventory-aging") {
      if (agingBucket) p.bucket = agingBucket
      if (agingSearch.trim()) p.search = agingSearch.trim()
    }
    return p
  }, [activeTab, startDate, endDate, page, lowStockOnly, agingBucket, agingSearch, tabCfg.noDateRange])

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["report", activeTab, params],
    queryFn: () =>
      reportsApi.fetch(activeTab as ReportType, params as {
        start_date?: string
        end_date?: string
        page?: number
        page_size?: number
        low_stock_only?: boolean
        bucket?: string
        search?: string
      }),
    staleTime: 60_000,
    retry: 1,
  })

  const summary = data?.summary ?? {}
  const rows = data?.rows ?? []
  const totalPages = data?.total_pages ?? 1
  const totalRecords = data?.total_records ?? 0

  // Summary cards per tab
  const summaryCards = useMemo<SummaryCardItem[]>(() => {
    if (!data) return []
    const s = summary

    switch (activeTab) {
      case "profit-loss":
        return [
          { label: "Gross Cash Revenue", value: String(s.revenue ?? "0.00"), currency: true },
          { label: "Refunds", value: String(s.returns_refunded ?? "0.00"), currency: true },
          { label: "Net Revenue", value: String(s.net_revenue ?? s.revenue ?? "0.00"), currency: true, highlight: true },
          { label: "Invoiced Revenue", value: String(s.invoiced_revenue ?? "0.00"), currency: true },
          { label: "COGS", value: String(s.cost_of_goods ?? "0.00"), currency: true },
          { label: "Expenses", value: String(s.expenses ?? "0.00"), currency: true },
          { label: "Gross Profit", value: String(s.gross_profit ?? "0.00"), currency: true, highlight: true },
          { label: "Net Profit", value: String(s.net_profit ?? "0.00"), currency: true, highlight: true },
        ]
      case "sales":
        return [
          { label: "Total Orders", value: String(s.total_sales ?? 0) },
          { label: "Gross Revenue", value: String(s.total_revenue ?? "0.00"), currency: true },
          { label: "Refunds Issued", value: String(s.total_refunds ?? "0.00"), currency: true },
          { label: "Net Revenue", value: String(s.net_revenue ?? s.total_revenue ?? "0.00"), currency: true, highlight: true },
          { label: "Tax Collected", value: String(s.total_tax ?? "0.00"), currency: true },
          { label: "Discounts Given", value: String(s.total_discount ?? "0.00"), currency: true },
        ]
      case "gst":
        return [
          { label: "Invoices", value: String(s.total_invoices ?? 0) },
          { label: "Gross Taxable", value: String(s.total_taxable_value ?? "0.00"), currency: true },
          { label: "Credit Notes (Taxable)", value: String(s.credit_notes_taxable_value ?? "0.00"), currency: true },
          { label: "Net Taxable Turnover", value: String(s.net_taxable_value ?? s.total_taxable_value ?? "0.00"), currency: true },
          { label: "Gross Tax", value: String(s.total_tax ?? "0.00"), currency: true },
          { label: "Credit Notes (Tax)", value: String(s.credit_notes_tax_refunded ?? "0.00"), currency: true },
          { label: "Net Tax Liability", value: String(s.net_tax_liability ?? s.total_tax ?? "0.00"), currency: true, highlight: true },
        ]
      case "purchases":
        return [
          { label: "Total Orders", value: String(s.total_purchases ?? 0) },
          { label: "Total Spend", value: String(s.total_amount ?? "0.00"), currency: true, highlight: true },
        ]
      case "payments":
        return [
          { label: "Paid Transactions", value: String(s.paid_count ?? 0) },
          { label: "Total Received", value: String(s.total_received ?? "0.00"), currency: true, highlight: true },
        ]
      case "expenses":
        return [
          { label: "Total Expenses", value: String(s.total_expenses ?? "0.00"), currency: true, highlight: true },
        ]
      case "salary":
        return [
          { label: "Records", value: String(s.total_records ?? 0) },
          { label: "Total Net Salary", value: String(s.total_net_salary_paid ?? "0.00"), currency: true, highlight: true },
          { label: "Total Deductions", value: String(s.total_deductions ?? "0.00"), currency: true },
        ]
      case "emi":
        return [
          { label: "Plans", value: String(s.total_plans ?? 0) },
          { label: "Total Principal", value: String(s.total_principal ?? "0.00"), currency: true, highlight: true },
        ]
      case "customers":
        return [{ label: "New Customers", value: String(s.new_customers ?? 0), highlight: true }]
      case "inventory":
        return [
          { label: "Products", value: String(s.total_products ?? 0) },
          { label: "Page Valuation", value: String(s.page_valuation ?? "0.00"), currency: true, highlight: true },
        ]
      case "inventory-aging": {
        const buckets = (s.buckets as Record<string, { count: number; valuation: string }>) || {}
        return [
          { label: "Total Products", value: String(s.total_products ?? 0) },
          { label: "Total Valuation", value: String(s.total_valuation ?? "0.00"), currency: true },
          { label: "Dead Stock (90+ d)", value: String(s.dead_stock_count ?? 0), highlight: true },
          { label: "Dead Stock Value", value: String(s.dead_stock_valuation ?? "0.00"), currency: true, highlight: true },
          { label: "0-30d Value", value: String(buckets["0-30"]?.valuation ?? "0.00"), currency: true },
          { label: "31-60d Value", value: String(buckets["31-60"]?.valuation ?? "0.00"), currency: true },
          { label: "61-90d Value", value: String(buckets["61-90"]?.valuation ?? "0.00"), currency: true },
        ]
      }
      default:
        return []
    }
  }, [activeTab, data])

  return (
    <div className="min-h-screen bg-transparent text-zinc-100 p-4 md:p-6 space-y-6">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Reports & Analytics
          </h1>
          <p className="text-zinc-400 text-sm mt-0.5">
            Historical period-range analysis — {data?.accounting_basis ?? ""}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="border-white/[0.16] text-zinc-300 hover:text-white hover:bg-[#18181C]"
          onClick={() => refetch()}
        >
          <RefreshCw className={`h-4 w-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* ---- Tab bar ---- */}
      <div className="flex gap-1.5 flex-wrap mb-5">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = tab.id === activeTab
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id)
                resetPage()
              }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? "bg-primary text-white shadow-none"
                  : "bg-card text-zinc-400 hover:bg-[#18181C] hover:text-zinc-100 border border-white/[0.14]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ---- Date Range + Filters ---- */}
      {!tabCfg.noDateRange ? (
        <div className="flex flex-wrap gap-3 mb-5 items-center">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-zinc-400" />
            <span className="text-zinc-300 text-sm font-medium">Period:</span>
          </div>
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={(e) => { setStartDate(e.target.value); resetPage() }}
            className="bg-[#0A0A0C] border border-white/[0.16] text-zinc-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary/60"
          />
          <span className="text-zinc-500">→</span>
          <input
            type="date"
            value={endDate}
            min={startDate}
            max={today()}
            onChange={(e) => { setEndDate(e.target.value); resetPage() }}
            className="bg-[#0A0A0C] border border-white/[0.16] text-zinc-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary/60"
          />

          {/* Preset quick buttons */}
          {[
            { label: "This Month", start: firstOfMonth(), end: today() },
            {
              label: "Last Month",
              start: (() => {
                const d = new Date(); d.setDate(0)
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
              })(),
              end: (() => {
                const d = new Date(); d.setDate(0)
                return d.toISOString().slice(0, 10)
              })(),
            },
          ].map((p) => (
            <button
              key={p.label}
              onClick={() => { setStartDate(p.start); setEndDate(p.end); resetPage() }}
              className="px-3 py-1.5 text-xs rounded-lg bg-card border border-white/[0.14] text-zinc-300 hover:text-white hover:bg-[#18181C] transition-all"
            >
              {p.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 mb-5">
          {activeTab === "inventory" && (
            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={lowStockOnly}
                onChange={(e) => { setLowStockOnly(e.target.checked); resetPage() }}
                className="accent-primary"
              />
              Low stock only
            </label>
          )}

          {activeTab === "inventory-aging" && (
            <div className="flex flex-wrap items-center justify-between w-full gap-3">
              {/* Bucket filter pills */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-zinc-400 font-medium mr-1">Bucket:</span>
                {[
                  { id: "", label: "All" },
                  { id: "0-30", label: "0-30 days" },
                  { id: "31-60", label: "31-60 days" },
                  { id: "61-90", label: "61-90 days" },
                  { id: "90+", label: "90+ days (Dead Stock)", isDeadStock: true },
                ].map((b) => {
                  const isSel = agingBucket === b.id
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => { setAgingBucket(b.id); resetPage() }}
                      className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${
                        isSel
                          ? b.isDeadStock
                            ? "bg-rose-600 text-white font-semibold shadow-sm"
                            : "bg-primary text-white shadow-sm"
                          : b.isDeadStock
                          ? "bg-rose-950/30 text-rose-300 border border-rose-500/30 hover:bg-rose-900/40"
                          : "bg-card border border-white/[0.14] text-zinc-300 hover:text-white hover:bg-[#18181C]"
                      }`}
                    >
                      {b.label}
                    </button>
                  )
                })}
              </div>

              {/* Search input */}
              <div className="relative sm:w-64 w-full">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search product or SKU..."
                  value={agingSearch}
                  onChange={(e) => { setAgingSearch(e.target.value); resetPage() }}
                  className="w-full bg-[#0A0A0C] border border-white/[0.16] text-zinc-100 placeholder:text-zinc-500 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-primary/60"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- Export buttons ---- */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <span className="text-zinc-400 text-xs flex items-center gap-1.5">
          <Download className="h-3.5 w-3.5" />
          Export:
        </span>
        {tabCfg.exports.map((fmt) => (
          <ExportButton
            key={fmt}
            format={fmt}
            type={activeTab as ReportType}
            startDate={tabCfg.noDateRange ? undefined : startDate}
            endDate={tabCfg.noDateRange ? undefined : endDate}
            lowStockOnly={activeTab === "inventory" ? lowStockOnly : undefined}
            bucket={activeTab === "inventory-aging" ? agingBucket || undefined : undefined}
          />
        ))}
        {totalRecords > 0 && (
          <span className="ml-auto text-xs text-zinc-400">
            {totalRecords.toLocaleString()} records
          </span>
        )}
      </div>

      {/* ---- Summary Cards ---- */}
      {summaryCards.length > 0 && (
        <div
          className={`grid gap-3 mb-5 ${
            summaryCards.length <= 2
              ? "grid-cols-2"
              : summaryCards.length <= 4
              ? "grid-cols-2 md:grid-cols-4"
              : "grid-cols-2 md:grid-cols-3 lg:grid-cols-6"
          }`}
        >
          {summaryCards.map((c) => (
            <SummaryCard
              key={c.label}
              label={c.label}
              value={c.value}
              currency={c.currency}
              highlight={c.highlight}
            />
          ))}
        </div>
      )}

      {/* ---- P&L Chart (only for profit-loss) ---- */}
      {activeTab === "profit-loss" && rows.length > 0 && <PLChart rows={rows} />}

      {/* ---- Data table ---- */}
      <div className={`mt-5 ${activeTab === "profit-loss" ? "mt-6" : ""}`}>
        <DataTable columns={columns} rows={rows} isLoading={isLoading || isFetching} />
      </div>

      {/* ---- Pagination ---- */}
      {(data?.total_pages ?? 1) > 1 && (
        <div className="flex items-center justify-center gap-3 mt-5">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="p-2 rounded-lg bg-card border border-white/[0.16] text-zinc-300 hover:text-white hover:bg-[#18181C] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-zinc-400">
            Page <span className="text-zinc-100 font-semibold">{page}</span> of{" "}
            <span className="text-zinc-100 font-semibold">{totalPages}</span>
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="p-2 rounded-lg bg-card border border-white/[0.16] text-zinc-300 hover:text-white hover:bg-[#18181C] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}

export default ReportsPage
