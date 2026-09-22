import { apiClient } from "@/lib/api"
import {
  SalaryPayPayload,
  SalaryPreviewResponse,
  SalaryRecord,
  SalaryRecordListResponse,
  StaffCreatePayload,
  StaffListResponse,
  StaffUpdatePayload,
  StaffUser,
} from "./types"

export const hrApi = {
  // Staff
  listStaff: (params?: { search?: string; role?: string; is_active?: boolean; page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams()
    if (params?.search) searchParams.set("search", params.search)
    if (params?.role) searchParams.set("role", params.role)
    if (params?.is_active !== undefined) searchParams.set("is_active", String(params.is_active))
    if (params?.page) searchParams.set("page", String(params.page))
    if (params?.limit) searchParams.set("limit", String(params.limit))
    const query = searchParams.toString()
    return apiClient.get<StaffListResponse>(`/api/hr/staff${query ? `?${query}` : ""}`)
  },

  createStaff: (payload: StaffCreatePayload) =>
    apiClient.post<StaffUser>("/api/hr/staff", payload),

  getStaff: (id: string) =>
    apiClient.get<StaffUser>(`/api/hr/staff/${id}`),

  updateStaff: (id: string, payload: StaffUpdatePayload) =>
    apiClient.put<StaffUser>(`/api/hr/staff/${id}`, payload),

  toggleStaffActive: (id: string) =>
    apiClient.post<StaffUser>(`/api/hr/staff/${id}/toggle-active`),

  // Salary
  previewSalary: (period: string) =>
    apiClient.post<SalaryPreviewResponse>("/api/hr/salary/preview", { period }),

  generateSalary: (period: string, notes?: string) =>
    apiClient.post<SalaryRecord[]>("/api/hr/salary/generate", { period, notes }),

  listSalaryRecords: (params?: { period?: string; staff_id?: string; status?: string; page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams()
    if (params?.period) searchParams.set("period", params.period)
    if (params?.staff_id) searchParams.set("staff_id", params.staff_id)
    if (params?.status) searchParams.set("status", params.status)
    if (params?.page) searchParams.set("page", String(params.page))
    if (params?.limit) searchParams.set("limit", String(params.limit))
    const query = searchParams.toString()
    return apiClient.get<SalaryRecordListResponse>(`/api/hr/salary${query ? `?${query}` : ""}`)
  },

  getSalaryRecord: (id: string) =>
    apiClient.get<SalaryRecord>(`/api/hr/salary/${id}`),

  paySalaryRecord: (id: string, payload: SalaryPayPayload) =>
    apiClient.post<SalaryRecord>(`/api/hr/salary/${id}/pay`, payload),
}
