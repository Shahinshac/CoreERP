import { apiClient } from "@/lib/api"

export interface Category {
  id: string
  name: string
  description?: string | null
  created_at: string
  updated_at: string
}

export interface Brand {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  name: string
  sku: string
  barcode?: string | null
  category_id: string
  brand_id: string
  unit: string
  purchase_price: string
  selling_price: string
  gst_rate: string
  current_stock: string
  min_stock: string
  image_path?: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  category?: Category | null
  brand?: Brand | null
}

export interface ProductCreatePayload {
  name: string
  sku: string
  barcode?: string | null
  category_id: string
  brand_id: string
  unit?: string
  purchase_price: string
  selling_price: string
  gst_rate?: string
  min_stock?: string
}

export interface ProductUpdatePayload {
  name?: string
  sku?: string
  barcode?: string | null
  category_id?: string
  brand_id?: string
  unit?: string
  purchase_price?: string
  selling_price?: string
  gst_rate?: string
  min_stock?: string
  is_active?: boolean
}

export const catalogApi = {
  // Categories
  getCategories: () => apiClient.get<Category[]>("/api/catalog/categories"),
  createCategory: (data: { name: string; description?: string }) =>
    apiClient.post<Category>("/api/catalog/categories", data),
  updateCategory: (id: string, data: { name?: string; description?: string }) =>
    apiClient.put<Category>(`/api/catalog/categories/${id}`, data),
  deleteCategory: (id: string) => apiClient.delete(`/api/catalog/categories/${id}`),

  // Brands
  getBrands: () => apiClient.get<Brand[]>("/api/catalog/brands"),
  createBrand: (data: { name: string }) => apiClient.post<Brand>("/api/catalog/brands", data),
  updateBrand: (id: string, data: { name?: string }) =>
    apiClient.put<Brand>(`/api/catalog/brands/${id}`, data),
  deleteBrand: (id: string) => apiClient.delete(`/api/catalog/brands/${id}`),

  // Products
  getProducts: (params?: {
    category_id?: string
    brand_id?: string
    search?: string
    low_stock_only?: boolean
    is_active?: boolean
  }) => {
    const query = new URLSearchParams()
    if (params?.category_id) query.append("category_id", params.category_id)
    if (params?.brand_id) query.append("brand_id", params.brand_id)
    if (params?.search) query.append("search", params.search)
    if (params?.low_stock_only) query.append("low_stock_only", "true")
    if (params?.is_active !== undefined) query.append("is_active", String(params.is_active))

    const qs = query.toString()
    return apiClient.get<Product[]>(`/api/catalog/products${qs ? `?${qs}` : ""}`)
  },
  getProduct: (id: string) => apiClient.get<Product>(`/api/catalog/products/${id}`),
  createProduct: (data: ProductCreatePayload) =>
    apiClient.post<Product>("/api/catalog/products", data),
  updateProduct: (id: string, data: ProductUpdatePayload) =>
    apiClient.put<Product>(`/api/catalog/products/${id}`, data),
  deleteProduct: (id: string) => apiClient.delete(`/api/catalog/products/${id}`),

  // Image Upload
  uploadProductImage: (productId: string, file: File) => {
    const formData = new FormData()
    formData.append("file", file)
    return apiClient.upload<Product>(`/api/catalog/products/${productId}/image`, formData)
  },
}
