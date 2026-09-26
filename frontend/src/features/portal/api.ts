import { apiClient, getAccessToken } from "@/lib/api"
import { EmiPlanBrief } from "@/features/invoicing/api"

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000"

export interface PortalPurchaseItem {
  id: string
  product_name: string
  product_sku: string
  quantity: string | number
  unit_price: string | number
  total_amount: string | number
}

export interface PortalPurchase {
  id: string
  invoice_number: string
  created_at: string
  subtotal: string | number
  discount_amount: string | number
  tax_amount: string | number
  total_amount: string | number
  status: string
  payment_method: string
  items: PortalPurchaseItem[]
}

export interface PortalPayment {
  id: string
  invoice_id?: string | null
  invoice_number?: string | null
  amount: string | number
  method: string
  status: string
  reference_id?: string | null
  emi_plan_id?: string | null
  created_at: string
}

export interface PortalEmiInstallment {
  id: string
  installment_number: number
  due_date: string
  amount_due: string | number
  amount_paid: string | number
  status: string
}

export interface PortalEmiPlan {
  id: string
  invoice_id?: string | null
  invoice_number?: string | null
  principal: string | number
  down_payment: string | number
  number_of_installments: number
  interest_rate?: string | number | null
  interest_amount: string | number
  total_financed: string | number
  installment_amount: string | number
  start_date: string
  total_paid: string | number
  remaining_balance: string | number
  status: string
  installments: PortalEmiInstallment[]
}

export interface PortalDashboardSummary {
  outstanding_balance: string | number
  active_emi_plans_count: number
  total_purchases_count: number
  total_spent: string | number
  open_tickets_count: number
  recent_purchases: PortalPurchase[]
}

export interface PortalProfile {
  id: string
  name: string
  email: string
  phone?: string | null
  address?: string | null
  gstin?: string | null
  state?: string | null
  created_at: string
}

export interface PortalProfileUpdate {
  name?: string
  phone?: string
  address?: string
  gstin?: string
  state?: string
}

export interface InvoiceItemDetail {
  id: string
  product_name: string
  product_sku: string
  hsn_code?: string | null
  quantity: string | number
  unit_price: string | number
  taxable_value: string | number
  gst_rate: string | number
  cgst_rate: string | number
  cgst_amount: string | number
  sgst_rate: string | number
  sgst_amount: string | number
  igst_rate: string | number
  igst_amount: string | number
  total_amount: string | number
}

export interface PortalInvoiceDetail {
  id: string
  invoice_number: string
  financial_year: string
  invoice_date: string
  seller_name: string
  seller_gstin: string
  seller_state: string
  seller_address?: string | null
  seller_phone?: string | null
  buyer_name: string
  buyer_gstin?: string | null
  buyer_state: string
  buyer_address?: string | null
  buyer_phone?: string | null
  place_of_supply: string
  is_inter_state: boolean
  subtotal: string | number
  cgst_amount: string | number
  sgst_amount: string | number
  igst_amount: string | number
  total_tax: string | number
  grand_total: string | number
  payment_status: string
  payment_method?: string | null
  is_cancelled: boolean
  items: InvoiceItemDetail[]
  emi_plan?: EmiPlanBrief | null
}

export const portalApi = {
  getDashboard: (): Promise<PortalDashboardSummary> =>
    apiClient.get<PortalDashboardSummary>("/api/portal/dashboard"),

  getPurchases: (): Promise<PortalPurchase[]> =>
    apiClient.get<PortalPurchase[]>("/api/portal/purchases"),

  getInvoices: (): Promise<PortalInvoiceDetail[]> =>
    apiClient.get<PortalInvoiceDetail[]>("/api/portal/invoices"),

  getInvoice: (id: string): Promise<PortalInvoiceDetail> =>
    apiClient.get<PortalInvoiceDetail>(`/api/portal/invoices/${id}`),

  downloadInvoicePdf: async (id: string, invoiceNumber: string): Promise<void> => {
    const token = getAccessToken()
    const url = `${BASE_URL.replace(/\/$/, "")}/api/portal/invoices/${id}/pdf`
    const res = await fetch(url, {
      method: "GET",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })

    if (!res.ok) {
      throw new Error(`Failed to download invoice PDF: ${res.statusText}`)
    }

    const blob = await res.blob()
    const downloadUrl = window.URL.createObjectURL(blob)
    const cleanNumber = invoiceNumber.replace(/\//g, "-")
    const a = document.createElement("a")
    a.href = downloadUrl
    a.download = `Invoice-${cleanNumber}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(downloadUrl)
  },

  getPayments: (): Promise<PortalPayment[]> =>
    apiClient.get<PortalPayment[]>("/api/portal/payments"),

  getEmiPlans: (): Promise<PortalEmiPlan[]> =>
    apiClient.get<PortalEmiPlan[]>("/api/portal/emi"),

  getProfile: (): Promise<PortalProfile> =>
    apiClient.get<PortalProfile>("/api/portal/profile"),

  updateProfile: (data: PortalProfileUpdate): Promise<PortalProfile> =>
    apiClient.put<PortalProfile>("/api/portal/profile", data),
}

export const customerPasswordResetApi = {
  forgotPassword: async (email: string): Promise<{ message: string }> => {
    return apiClient.post<{ message: string }>("/api/customers/auth/forgot-password", { email })
  },
  resetPassword: async (token: string, newPassword: string): Promise<{ message: string }> => {
    return apiClient.post<{ message: string }>("/api/customers/auth/reset-password", {
      token,
      new_password: newPassword,
    })
  },
}

