import { apiClient } from "@/lib/api"

export interface TodayDashboardSummary {
  date: string
  total_sales: string
  gross_sales?: string
  returns_refunded?: string
  returns_count?: number
  sales_count: number
  cash_collected: string
  payment_method_totals: Record<string, string>
  customers_served: number
  low_stock_count: number
  open_tickets_count: number
}

export const dashboardApi = {
  getTodaySummary: () => apiClient.get<TodayDashboardSummary>("/api/dashboard/today"),
}
