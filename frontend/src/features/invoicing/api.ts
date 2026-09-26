import { apiClient, getAccessToken } from "@/lib/api"

export interface InvoiceItem {
  id: string
  product_id: string | null
  product_name: string
  product_sku: string
  hsn_code: string | null
  quantity: string
  unit_price: string
  taxable_value: string
  gst_rate: string
  cgst_rate: string
  cgst_amount: string
  sgst_rate: string
  sgst_amount: string
  igst_rate: string
  igst_amount: string
  total_amount: string
}

export interface CreditNoteItem {
  id: string
  invoice_item_id: string | null
  product_name: string
  quantity: string
  taxable_value: string
  cgst_amount: string
  sgst_amount: string
  igst_amount: string
  total_amount: string
}

export interface CreditNote {
  id: string
  credit_note_number: string
  financial_year: string
  credit_note_date: string
  invoice_id: string
  staff_id: string
  reason: string
  subtotal_refunded: string
  cgst_refunded: string
  sgst_refunded: string
  igst_refunded: string
  total_tax_refunded: string
  grand_total_refunded: string
  created_at: string
  items: CreditNoteItem[]
}

export interface EmiInstallmentBrief {
  installment_number: number
  due_date: string
  amount_due: string
  amount_paid: string
  status: string
}

export interface EmiPlanBrief {
  id: string
  principal: string
  down_payment: string
  number_of_installments: number
  interest_rate: string | null
  interest_amount: string
  total_financed: string
  installment_amount: string
  start_date: string
  status: string
  installments: EmiInstallmentBrief[]
}

export interface Invoice {
  id: string
  invoice_number: string
  financial_year: string
  invoice_date: string
  sale_id: string | null
  customer_id: string | null
  staff_id: string

  seller_name: string
  seller_gstin: string
  seller_state: string
  seller_state_code: string | null
  seller_address: string | null
  seller_phone: string | null

  buyer_name: string
  buyer_gstin: string | null
  buyer_state: string
  buyer_state_code: string | null
  buyer_address: string | null
  buyer_phone: string | null

  is_inter_state: boolean
  place_of_supply: string

  subtotal: string
  cgst_amount: string
  sgst_amount: string
  igst_amount: string
  total_tax: string
  grand_total: string

  payment_status: "unpaid" | "paid" | "partially_paid" | "cancelled"
  payment_method?: string | null
  is_cancelled: boolean
  notes: string | null
  created_at: string

  items: InvoiceItem[]
  credit_notes: CreditNote[]
  emi_plan?: EmiPlanBrief | null
}

export interface InvoiceListResponse {
  items: Invoice[]
  total: number
  page: number
  limit: number
}

export interface GenerateInvoiceRequest {
  buyer_name?: string
  buyer_gstin?: string
  buyer_state?: string
  buyer_address?: string
  notes?: string
}

export interface CreditNoteCreateRequest {
  reason: string
  items?: {
    invoice_item_id: string
    quantity: string
  }[]
}

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000"

export const invoicingApi = {
  generateFromSale: async (saleId: string, payload?: GenerateInvoiceRequest): Promise<Invoice> => {
    return apiClient.post<Invoice>(`/api/invoicing/from-sale/${saleId}`, payload || {})
  },

  list: async (params?: {
    customer_id?: string
    payment_status?: string
    start_date?: string
    end_date?: string
    search?: string
    page?: number
    limit?: number
  }): Promise<InvoiceListResponse> => {
    const q = new URLSearchParams()
    if (params?.customer_id) q.set("customer_id", params.customer_id)
    if (params?.payment_status) q.set("payment_status", params.payment_status)
    if (params?.start_date) q.set("start_date", params.start_date)
    if (params?.end_date) q.set("end_date", params.end_date)
    if (params?.search) q.set("search", params.search)
    if (params?.page) q.set("page", params.page.toString())
    if (params?.limit) q.set("limit", params.limit.toString())

    const queryStr = q.toString() ? `?${q.toString()}` : ""
    return apiClient.get<InvoiceListResponse>(`/api/invoicing${queryStr}`)
  },

  get: async (id: string): Promise<Invoice> => {
    return apiClient.get<Invoice>(`/api/invoicing/${id}`)
  },

  downloadPdf: async (id: string, invoiceNumber: string): Promise<void> => {
    const token = getAccessToken()
    const url = `${BASE_URL.replace(/\/$/, "")}/api/invoicing/${id}/pdf`
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
    const a = document.createElement("a")
    a.href = downloadUrl
    const cleanNumber = invoiceNumber.replace(/\//g, "-")
    a.download = `Tax-Invoice-${cleanNumber}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(downloadUrl)
  },

  createCreditNote: async (id: string, payload: CreditNoteCreateRequest): Promise<CreditNote> => {
    return apiClient.post<CreditNote>(`/api/invoicing/${id}/credit-note`, payload)
  },

  sendEmail: async (id: string, email?: string): Promise<{ status: string; message: string }> => {
    const q = email ? `?email=${encodeURIComponent(email)}` : ""
    return apiClient.post<{ status: string; message: string }>(`/api/invoicing/${id}/send-email${q}`, {})
  },
}

export interface QuotationItem {
  id: string
  product_id: string | null
  product_name: string
  product_sku: string
  hsn_code: string | null
  quantity: string
  unit_price: string
  discount_amount: string
  taxable_value: string
  gst_rate: string
  cgst_rate: string
  cgst_amount: string
  sgst_rate: string
  sgst_amount: string
  igst_rate: string
  igst_amount: string
  total_amount: string
}

export interface Quotation {
  id: string
  quotation_number: string
  financial_year: string
  quotation_date: string
  valid_until: string | null
  customer_id: string | null
  staff_id: string

  seller_name: string
  seller_gstin: string
  seller_state: string
  seller_state_code: string | null
  seller_address: string | null
  seller_phone: string | null

  buyer_name: string
  buyer_gstin: string | null
  buyer_state: string
  buyer_state_code: string | null
  buyer_address: string | null
  buyer_phone: string | null

  is_inter_state: boolean
  place_of_supply: string

  subtotal: string
  cgst_amount: string
  sgst_amount: string
  igst_amount: string
  total_tax: string
  grand_total: string

  status: "draft" | "sent" | "converted" | "cancelled"
  converted_invoice_id: string | null
  notes: string | null
  created_at: string
  updated_at: string

  items: QuotationItem[]
}

export interface QuotationListResponse {
  items: Quotation[]
  total: number
  page: number
  limit: number
}

export interface QuotationCreateItem {
  product_id: string
  quantity: number
  unit_price?: number
  discount_amount?: number
}

export interface QuotationCreateRequest {
  customer_id?: string
  buyer_name?: string
  buyer_gstin?: string
  buyer_state?: string
  buyer_address?: string
  buyer_phone?: string
  valid_until?: string
  notes?: string
  items: QuotationCreateItem[]
}

export const quotationsApi = {
  list: async (params?: {
    customer_id?: string
    status?: string
    search?: string
    page?: number
    limit?: number
  }): Promise<QuotationListResponse> => {
    const q = new URLSearchParams()
    if (params?.customer_id) q.set("customer_id", params.customer_id)
    if (params?.status) q.set("status", params.status)
    if (params?.search) q.set("search", params.search)
    if (params?.page) q.set("page", params.page.toString())
    if (params?.limit) q.set("limit", params.limit.toString())

    const queryStr = q.toString() ? `?${q.toString()}` : ""
    return apiClient.get<QuotationListResponse>(`/api/invoicing/quotations${queryStr}`)
  },

  get: async (id: string): Promise<Quotation> => {
    return apiClient.get<Quotation>(`/api/invoicing/quotations/${id}`)
  },

  create: async (payload: QuotationCreateRequest): Promise<Quotation> => {
    return apiClient.post<Quotation>("/api/invoicing/quotations", payload)
  },

  updateStatus: async (id: string, status: "draft" | "sent" | "cancelled"): Promise<Quotation> => {
    return apiClient.patch<Quotation>(`/api/invoicing/quotations/${id}/status`, { status })
  },

  convertToInvoice: async (id: string): Promise<Invoice> => {
    return apiClient.post<Invoice>(`/api/invoicing/quotations/${id}/convert-to-invoice`, {})
  },
}

