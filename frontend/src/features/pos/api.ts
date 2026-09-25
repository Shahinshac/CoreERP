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

export interface SplitPaymentPortion {
  method: "cash" | "upi" | "card" | string
  amount: string
}

export interface POSCheckoutPayload {
  customer_id?: string | null
  items: CartItemInput[]
  discount_amount?: string
  payment_method?: string
  split_payments?: SplitPaymentPortion[]
  notes?: string
  client_total?: string
  emi_installments?: number
  emi_down_payment?: string
  emi_interest_rate?: string
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
  payment_details?: SplitPaymentPortion[] | null
  notes?: string | null
  items: SaleItem[]
  gst_invoice_id?: string | null
  gst_invoice_number?: string | null
  emi_plan_id?: string | null
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

export interface POSStoreInfo {
  store_name: string
  gstin: string
  state: string
  state_code: string | null
  address: string | null
  phone: string | null
  email: string | null
  upi_id: string | null
}

export const posApi = {
  searchProducts: (q: string) =>
    apiClient.get<POSProduct[]>(`/api/pos/products/search?q=${encodeURIComponent(q)}`),

  lookupBarcode: (barcode: string) =>
    apiClient.get<POSProduct>(`/api/pos/products/barcode?barcode=${encodeURIComponent(barcode)}`),

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

  getStoreInfo: () =>
    apiClient.get<POSStoreInfo>("/api/pos/store-info"),
}
