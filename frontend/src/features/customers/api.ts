import { apiClient } from "@/lib/api"

export interface CustomerPurchaseSummary {
  sale_id: string
  invoice_number: string
  sale_date: string
  total_amount: string
  status: string
  payment_method: string
}

export interface Customer {
  id: string
  name: string
  email: string
  phone?: string | null
  address?: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  purchases?: CustomerPurchaseSummary[]
}

export interface CustomerCreatePayload {
  name: string
  email: string
  phone?: string
  address?: string
  password?: string
}

export interface CustomerUpdatePayload {
  name?: string
  phone?: string
  address?: string
  is_active?: boolean
}

export const customersApi = {
  getCustomers: (params?: { search?: string; is_active?: boolean }) => {
    const query = new URLSearchParams()
    if (params?.search) query.append("search", params.search)
    if (params?.is_active !== undefined) query.append("is_active", String(params.is_active))
    const qs = query.toString()
    return apiClient.get<Customer[]>(`/api/staff/customers${qs ? `?${qs}` : ""}`)
  },
  getCustomer: (id: string) => apiClient.get<Customer>(`/api/staff/customers/${id}`),
  createCustomer: (data: CustomerCreatePayload) =>
    apiClient.post<Customer>("/api/staff/customers", data),
  updateCustomer: (id: string, data: CustomerUpdatePayload) =>
    apiClient.put<Customer>(`/api/staff/customers/${id}`, data),
}
