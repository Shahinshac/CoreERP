/**
 * System Administration API client.
 * All endpoints require Super Admin or Admin role.
 */
import { apiClient } from "@/lib/api"

// ---- Types ----

export interface SystemConfig {
  id: string
  key: string
  value: string
  category: string
  description: string | null
  value_type: string
  is_sensitive: boolean
  updated_at: string
}

export interface SystemOverview {
  app_version: string
  environment: string
  api_status: string
  database_status: string
  total_products: number
  total_customers: number
  total_invoices: number
  total_staff: number
  total_sales: number
  uptime_info: string | null
}

export interface StaffAdmin {
  id: string
  email: string
  role: string
  full_name: string | null
  phone: string | null
  employee_code: string | null
  is_active: boolean
  created_at: string
  deactivated_at: string | null
  is_totp_enabled: boolean
}

// ---- API Functions ----

export const adminApi = {
  // System Overview
  getOverview: () =>
    apiClient.get<SystemOverview>("/api/admin/overview"),

  // System Configurations
  getConfigs: (category?: string) =>
    apiClient.get<{ configs: SystemConfig[] }>(
      `/api/admin/configs${category ? `?category=${category}` : ""}`
    ),

  updateConfig: (key: string, value: string, reason?: string) =>
    apiClient.put<SystemConfig>(`/api/admin/configs/${key}`, { value, reason }),

  bulkUpdateConfigs: (configs: Record<string, string>, reason?: string) =>
    apiClient.put<{ configs: SystemConfig[] }>("/api/admin/configs", { configs, reason }),

  seedConfigs: () =>
    apiClient.post<{ message: string; created: number }>("/api/admin/configs/seed"),

  // Staff Management
  getStaff: (params?: { search?: string; role?: string; is_active?: boolean }) => {
    const qs = new URLSearchParams()
    if (params?.search) qs.set("search", params.search)
    if (params?.role) qs.set("role", params.role)
    if (params?.is_active !== undefined) qs.set("is_active", String(params.is_active))
    const query = qs.toString()
    return apiClient.get<{ items: StaffAdmin[]; total: number }>(
      `/api/admin/staff${query ? `?${query}` : ""}`
    )
  },

  createStaff: (data: {
    email: string
    password: string
    role: string
    full_name?: string
    phone?: string
    employee_code?: string
  }) => apiClient.post<StaffAdmin>("/api/admin/staff", data),

  toggleStaff: (staffId: string, is_active: boolean) =>
    apiClient.patch<StaffAdmin>(`/api/admin/staff/${staffId}/toggle`, { is_active }),

  updateStaffRole: (staffId: string, role: string, reason?: string) =>
    apiClient.patch<StaffAdmin>(`/api/admin/staff/${staffId}/role`, { role, reason }),

  resetStaffPassword: (staffId: string, new_password: string, reason?: string) =>
    apiClient.post<{ message: string }>(`/api/admin/staff/${staffId}/reset-password`, {
      new_password,
      reason,
    }),
}
