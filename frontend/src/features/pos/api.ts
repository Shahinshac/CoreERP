import { apiClient } from "@/lib/api"

export interface POSProduct {
  id: string
  name: string
  sku: string
  barcode?: string | null
  unit: string
  selling_price: string
  gst_rate: string
  current_stock: string
  min_stock: string
  image_path?: string | null
}

export interface CartItem {
  product: POSProduct
  quantity: string
  discount_amount: string
}

export interface CartItemInput {
  product_id: string
  quantity: string
  discount_amount?: string
}

export interface POSCheckoutPayload {
  customer_id?: string | null
  items: CartItemInput[]
  discount_amount?: string
  payment_method?: string
  notes?: string
  client_total?: string
}

export interface SaleItem {
  id: string
  product_id: string
  product_name: string
  product_sku: string
  quantity: string
  unit_price: string
  discount_amount: string
  total_price: string
  returned_quantity: string
}

export interface Sale {
  id: string
  invoice_number: string
  customer_id?: string | null
  customer_name?: string | null
  staff_id: string
  staff_email: string
  sale_date: string
  subtotal: string
  discount_amount: string
  tax_amount: string
  total_amount: string
  status: string
  payment_method: string
  notes?: string | null
  items: SaleItem[]
}

export interface ReturnItemInput {
  sale_item_id: string
  quantity: string
}

export interface POSReturnPayload {
  sale_id: string
  reason?: string
  items: ReturnItemInput[]
}

export interface ReturnItem {
  id: string
  sale_item_id: string
  product_id: string
  product_name: string
  quantity: string
  refund_amount: string
}

export interface SaleReturn {
  id: string
  return_number: string
  sale_id: string
  invoice_number: string
  staff_id: string
  staff_email: string
  return_date: string
  total_refund_amount: string
  reason?: string | null
  items: ReturnItem[]
}

export const posApi = {
  searchProducts: (q: string) =>
    apiClient.get<POSProduct[]>(`/api/pos/products/search?q=${encodeURIComponent(q)}`),

  checkout: (payload: POSCheckoutPayload) =>
    apiClient.post<Sale>("/api/pos/checkout", payload),

  submitReturn: (payload: POSReturnPayload) =>
    apiClient.post<SaleReturn>("/api/pos/returns", payload),

  getSales: (params?: { search?: string; status?: string }) => {
    const query = new URLSearchParams()
    if (params?.search) query.append("search", params.search)
    if (params?.status) query.append("status", params.status)
    const qs = query.toString()
    return apiClient.get<Sale[]>(`/api/pos/sales${qs ? `?${qs}` : ""}`)
  },

  getSale: (idOrNumber: string) =>
    apiClient.get<Sale>(`/api/pos/sales/${encodeURIComponent(idOrNumber)}`),
}
