import { apiClient } from "@/lib/api"

export interface ProductSearchResult {
  id: string
  name: string
  sku: string
  barcode?: string | null
  selling_price: string
  current_stock: string
}

export interface CustomerSearchResult {
  id: string
  name: string
  phone?: string | null
  email: string
}

export interface InvoiceSearchResult {
  id: string
  invoice_number: string
  buyer_name: string
  invoice_date: string
  total_amount: string
}

export interface GlobalSearchResponse {
  products: ProductSearchResult[]
  customers: CustomerSearchResult[]
  invoices: InvoiceSearchResult[]
}

export const searchApi = {
  search: (query: string): Promise<GlobalSearchResponse> =>
    apiClient.get<GlobalSearchResponse>(`/api/search?q=${encodeURIComponent(query)}`),
}
