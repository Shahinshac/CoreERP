import { apiClient } from "@/lib/api"

export interface EmiInstallment {
  id: string
  emi_plan_id: string
  installment_number: number
  due_date: string
  amount_due: string
  amount_paid: string
  remaining_amount: string
  status: "pending" | "paid" | "partial" | "overdue" | "defaulted"
  days_overdue: number
}

export interface EmiPaymentSummary {
  id: string
  amount: string
  method: string
  status: string
  idempotency_key: string
  reference_id: string | null
  created_at: string
}

export interface EmiPlan {
  id: string
  customer_id: string
  customer_name?: string | null
  invoice_id?: string | null
  principal: string
  down_payment: string
  number_of_installments: number
  interest_rate?: string | null
  interest_amount: string
  total_financed: string
  installment_amount: string
  start_date: string
  status: "active" | "completed" | "defaulted" | "cancelled"
  notes?: string | null
  total_paid: string
  remaining_balance: string
  created_at: string
}

export interface EmiPlanDetail extends EmiPlan {
  installments: EmiInstallment[]
  payments: EmiPaymentSummary[]
}

export interface EmiPlanListParams {
  customer_id?: string
  status?: string
  page?: number
  limit?: number
}

export interface EmiPlanListResponse {
  items: EmiPlan[]
  total: number
  page: number
  limit: number
}

export interface EmiPlanPreviewRequest {
  principal: string
  down_payment?: string
  number_of_installments: number
  interest_rate?: string | null
  start_date?: string | null
}

export interface EmiInstallmentPreview {
  installment_number: number
  due_date: string
  amount_due: string
  amount_paid: string
  status: string
}

export interface EmiPlanPreviewResponse {
  principal: string
  down_payment: string
  financed_principal: string
  interest_rate: string | null
  interest_amount: string
  total_financed: string
  installment_amount: string
  number_of_installments: number
  start_date: string
  installments: EmiInstallmentPreview[]
}

export interface EmiPlanCreateRequest {
  customer_id: string
  invoice_id?: string | null
  principal: string
  down_payment?: string
  number_of_installments: number
  interest_rate?: string | null
  start_date?: string | null
  notes?: string | null
}

export interface EmiPaymentRequest {
  amount: string
  method?: string
  idempotency_key: string
  reference_id?: string | null
  notes?: string | null
  allow_overpayment?: boolean
}

export interface OverdueInstallment {
  plan_id: string
  customer_id: string
  customer_name: string
  customer_phone?: string | null
  customer_email?: string | null
  installment_id: string
  installment_number: number
  due_date: string
  amount_due: string
  amount_paid: string
  amount_overdue: string
  days_overdue: number
}

export const emiApi = {
  preview: async (payload: EmiPlanPreviewRequest): Promise<EmiPlanPreviewResponse> => {
    return apiClient.post<EmiPlanPreviewResponse>("/api/emi/plans/preview", payload)
  },

  create: async (payload: EmiPlanCreateRequest): Promise<EmiPlanDetail> => {
    return apiClient.post<EmiPlanDetail>("/api/emi/plans", payload)
  },

  list: async (params?: EmiPlanListParams): Promise<EmiPlanListResponse> => {
    const q = new URLSearchParams()
    if (params?.customer_id) q.set("customer_id", params.customer_id)
    if (params?.status) q.set("status", params.status)
    if (params?.page) q.set("page", params.page.toString())
    if (params?.limit) q.set("limit", params.limit.toString())
    const qs = q.toString() ? `?${q.toString()}` : ""
    return apiClient.get<EmiPlanListResponse>(`/api/emi/plans${qs}`)
  },

  get: async (id: string): Promise<EmiPlanDetail> => {
    return apiClient.get<EmiPlanDetail>(`/api/emi/plans/${id}`)
  },

  pay: async (planId: string, payload: EmiPaymentRequest): Promise<EmiPlanDetail> => {
    return apiClient.post<EmiPlanDetail>(`/api/emi/plans/${planId}/pay`, payload)
  },

  payInstallment: async (
    planId: string,
    installmentNumber: number,
    payload: EmiPaymentRequest
  ): Promise<EmiPlanDetail> => {
    return apiClient.post<EmiPlanDetail>(
      `/api/emi/plans/${planId}/installments/${installmentNumber}/pay`,
      payload
    )
  },

  getOverdue: async (): Promise<OverdueInstallment[]> => {
    return apiClient.get<OverdueInstallment[]>("/api/emi/overdue")
  },
}
