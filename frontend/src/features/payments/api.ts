import { apiClient } from "@/lib/api"

export interface Payment {
  id: string
  invoice_id: string | null
  customer_id: string | null
  created_by: string
  method: "cash" | "upi" | "card" | "payment_link" | "emi"
  amount: string
  status: "pending" | "paid" | "failed" | "expired"
  idempotency_key: string
  reference_id: string | null
  notes: string | null
  created_at: string

  invoice_number?: string | null
  customer_name?: string | null
  invoice_payment_status?: string | null
  invoice_remaining_balance?: string | null
}

export interface PaymentCreateRequest {
  invoice_id?: string | null
  customer_id?: string | null
  method: "cash" | "upi" | "card" | "payment_link" | "emi"
  amount: string
  idempotency_key: string
  reference_id?: string | null
  notes?: string | null
  allow_overpayment?: boolean
}

export interface PaymentListResponse {
  items: Payment[]
  total: number
  page: number
  limit: number
}

export interface UPIIntentResponse {
  upi_uri: string
  seller_upi_id: string
  seller_name: string
  amount: string
  invoice_number: string
  notes?: string | null
}

export interface PaymentListParams {
  invoice_id?: string
  customer_id?: string
  status?: string
  method?: string
  start_date?: string
  end_date?: string
  page?: number
  limit?: number
}

export const paymentsApi = {
  record: async (payload: PaymentCreateRequest): Promise<Payment> => {
    return apiClient.post<Payment>("/api/payments", payload)
  },

  list: async (params?: PaymentListParams): Promise<PaymentListResponse> => {
    const q = new URLSearchParams()
    if (params?.invoice_id) q.set("invoice_id", params.invoice_id)
    if (params?.customer_id) q.set("customer_id", params.customer_id)
    if (params?.status) q.set("status", params.status)
    if (params?.method) q.set("method", params.method)
    if (params?.start_date) q.set("start_date", params.start_date)
    if (params?.end_date) q.set("end_date", params.end_date)
    if (params?.page) q.set("page", params.page.toString())
    if (params?.limit) q.set("limit", params.limit.toString())

    const queryStr = q.toString() ? `?${q.toString()}` : ""
    return apiClient.get<PaymentListResponse>(`/api/payments${queryStr}`)
  },

  get: async (id: string): Promise<Payment> => {
    return apiClient.get<Payment>(`/api/payments/${id}`)
  },

  getUpiIntent: async (invoiceId: string): Promise<UPIIntentResponse> => {
    return apiClient.get<UPIIntentResponse>(`/api/payments/upi-intent/${invoiceId}`)
  },
}
