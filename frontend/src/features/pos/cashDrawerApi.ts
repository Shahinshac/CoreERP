import { apiClient } from "@/lib/api"

export interface CashMovement {
  id: string
  session_id: string
  movement_type: "cash_in" | "cash_out" | "cash_drop"
  amount: string
  reason: string
  performed_by_id: string
  performed_by_email?: string | null
  created_at: string
}

export interface CashDrawerSessionSummary {
  id: string
  cashier_id: string
  cashier_email: string
  status: "open" | "closed"
  opened_at: string
  closed_at?: string | null
  opening_cash: string
  closing_cash?: string | null
  expected_cash?: string | null
  variance?: string | null
  opening_notes?: string | null
  closing_notes?: string | null
  denominations?: Record<string, number> | null
  movements_count: number
}

export interface ActiveSessionDetails {
  id: string
  cashier_id: string
  cashier_email: string
  status: "open" | "closed"
  opened_at: string
  opening_cash: string
  cash_sales_amount: string
  cash_sales_count: number
  cash_refunds_amount: string
  cash_refunds_count: number
  cash_in_amount: string
  cash_out_amount: string
  expected_cash: string
  total_sales_amount: string
  transaction_count: number
  sales_by_payment_method: Record<string, string>
  movements: CashMovement[]
}

export interface CurrentDrawerStatus {
  active: boolean
  session: ActiveSessionDetails | null
}

export interface XReport {
  session_id: string
  cashier_id: string
  cashier_email: string
  status: string
  opened_at: string
  report_generated_at: string
  opening_cash: string
  cash_sales_amount: string
  cash_sales_count: number
  cash_refunds_amount: string
  cash_refunds_count: number
  cash_in_amount: string
  cash_out_amount: string
  expected_cash: string
  counted_cash?: string | null
  variance?: string | null
  sales_by_payment_method: Record<string, string>
  total_sales_amount: string
  transaction_count: number
  movements: CashMovement[]
}

export interface ZReport {
  session_id: string
  cashier_id: string
  cashier_email: string
  status: string
  opened_at: string
  closed_at: string
  opening_cash: string
  cash_sales_amount: string
  cash_sales_count: number
  cash_refunds_amount: string
  cash_refunds_count: number
  cash_in_amount: string
  cash_out_amount: string
  expected_cash: string
  actual_cash: string
  variance: string
  sales_by_payment_method: Record<string, string>
  total_sales_amount: string
  transaction_count: number
  denominations?: Record<string, number> | null
  opening_notes?: string | null
  closing_notes?: string | null
  movements: CashMovement[]
}

export interface OpenDrawerPayload {
  opening_cash: string
  opening_notes?: string
}

export interface CashMovementPayload {
  movement_type: "cash_in" | "cash_out" | "cash_drop"
  amount: string
  reason: string
}

export interface CloseDrawerPayload {
  closing_cash: string
  denominations?: Record<string, number>
  closing_notes?: string
}

export const cashDrawerApi = {
  getCurrentStatus: () =>
    apiClient.get<CurrentDrawerStatus>("/api/pos/cash-drawer/current"),

  openDrawer: (payload: OpenDrawerPayload) =>
    apiClient.post<CashDrawerSessionSummary>("/api/pos/cash-drawer/open", payload),

  recordMovement: (payload: CashMovementPayload) =>
    apiClient.post<CashMovement>("/api/pos/cash-drawer/movements", payload),

  getXReport: (countedCash?: string) => {
    const qs = countedCash ? `?counted_cash=${encodeURIComponent(countedCash)}` : ""
    return apiClient.get<XReport>(`/api/pos/cash-drawer/x-report${qs}`)
  },

  closeDrawer: (payload: CloseDrawerPayload) =>
    apiClient.post<ZReport>("/api/pos/cash-drawer/close", payload),

  getSessions: (params?: { limit?: number; offset?: number }) => {
    const query = new URLSearchParams()
    if (params?.limit) query.append("limit", String(params.limit))
    if (params?.offset) query.append("offset", String(params.offset))
    const qs = query.toString()
    return apiClient.get<CashDrawerSessionSummary[]>(`/api/pos/cash-drawer/sessions${qs ? `?${qs}` : ""}`)
  },

  getSessionZReport: (sessionId: string) =>
    apiClient.get<ZReport>(`/api/pos/cash-drawer/sessions/${sessionId}/z-report`),
}
