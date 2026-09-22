import { apiClient } from "@/lib/api"
import {
  Expense,
  ExpenseCreatePayload,
  ExpenseFilterParams,
  ExpenseListResponse,
  ExpenseUpdatePayload,
  FinancialSummary,
} from "./types"

export const financeApi = {
  getSummary: (period?: string) => {
    const query = period ? `?period=${encodeURIComponent(period)}` : ""
    return apiClient.get<FinancialSummary>(`/api/finance/summary${query}`)
  },

  listExpenses: (params?: ExpenseFilterParams) => {
    const searchParams = new URLSearchParams()
    if (params?.period) searchParams.set("period", params.period)
    if (params?.category) searchParams.set("category", params.category)
    if (params?.source) searchParams.set("source", params.source)
    if (params?.start_date) searchParams.set("start_date", params.start_date)
    if (params?.end_date) searchParams.set("end_date", params.end_date)
    if (params?.page) searchParams.set("page", String(params.page))
    if (params?.limit) searchParams.set("limit", String(params.limit))
    const query = searchParams.toString()
    return apiClient.get<ExpenseListResponse>(`/api/finance/expenses${query ? `?${query}` : ""}`)
  },

  getExpense: (id: string) => apiClient.get<Expense>(`/api/finance/expenses/${id}`),

  createExpense: (payload: ExpenseCreatePayload) =>
    apiClient.post<Expense>("/api/finance/expenses", payload),

  updateExpense: (id: string, payload: ExpenseUpdatePayload) =>
    apiClient.put<Expense>(`/api/finance/expenses/${id}`, payload),

  deleteExpense: (id: string) =>
    apiClient.delete<{ message: string; id: string }>(`/api/finance/expenses/${id}`),
}
