import { apiClient } from "@/lib/api"

export interface TodayDashboardSummary {
  date: string
  total_sales: string
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
