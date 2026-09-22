import { apiClient } from "@/lib/api"
import { Product } from "@/features/catalog/api"

export interface StockMovement {
  id: string
  product_id: string
  movement_type: "in" | "out" | "adjustment" | "transfer"
  quantity: string
  reference_type: string
  reference_id?: string | null
  notes?: string | null
  created_by?: string | null
  created_at: string
  product_name?: string | null
  product_sku?: string | null
  author_email?: string | null
}

export interface PaginatedMovements {
  items: StockMovement[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface CategoryValuation {
  category_id: string
  category_name: string
  total_quantity: string
  total_valuation: string
}

export interface ProductValuation {
  product_id: string
  product_name: string
  sku: string
  current_stock: string
  purchase_price: string
  valuation: string
}

export interface InventoryValuationResponse {
  total_valuation: string
  total_items_count: number
  by_category: CategoryValuation[]
  by_product: ProductValuation[]
}

export interface StockInPayload {
  product_id: string
  quantity: string
  reference?: string
  reason?: string
}

export interface StockOutPayload {
  product_id: string
  quantity: string
  reference?: string
  reason?: string
}

export interface StockAdjustmentPayload {
  product_id: string
  quantity: string
  is_override?: boolean
  reference?: string
  reason?: string
}

export const inventoryApi = {
  stockIn: (data: StockInPayload) =>
    apiClient.post<StockMovement>("/api/inventory/stock-in", data),
  stockOut: (data: StockOutPayload) =>
    apiClient.post<StockMovement>("/api/inventory/stock-out", data),
  stockAdjustment: (data: StockAdjustmentPayload) =>
    apiClient.post<StockMovement>("/api/inventory/stock-adjustment", data),

  getMovements: (params?: {
    product_id?: string
    movement_type?: string
    start_date?: string
    end_date?: string
    page?: number
    page_size?: number
  }) => {
    const query = new URLSearchParams()
    if (params?.product_id) query.append("product_id", params.product_id)
    if (params?.movement_type) query.append("movement_type", params.movement_type)
    if (params?.start_date) query.append("start_date", params.start_date)
    if (params?.end_date) query.append("end_date", params.end_date)
    if (params?.page) query.append("page", String(params.page))
    if (params?.page_size) query.append("page_size", String(params.page_size))

    const qs = query.toString()
    return apiClient.get<PaginatedMovements>(`/api/inventory/movements${qs ? `?${qs}` : ""}`)
  },

  getLowStock: () => apiClient.get<Product[]>("/api/inventory/low-stock"),
  getValuation: () => apiClient.get<InventoryValuationResponse>("/api/inventory/valuation"),
}
