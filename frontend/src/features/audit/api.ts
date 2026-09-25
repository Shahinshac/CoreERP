import { apiClient } from "@/lib/api"

export interface AuditLog {
  id: string
  actor_id: string | null
  actor_type: string
  actor_email: string | null
  ip_address: string | null
  user_agent: string | null
  event_type: string
  resource_type: string | null
  resource_id: string | null
  description: string
  details: Record<string, unknown> | null
  created_at: string
}

export interface AuditLogListResponse {
  items: AuditLog[]
  total: number
  page: number
  limit: number
}

export interface AuditLogFilters {
  event_type?: string
  resource_type?: string
  actor_type?: string
  search?: string
  date_from?: string
  date_to?: string
  page?: number
  limit?: number
}

export const auditApi = {
  getLogs: async (filters: AuditLogFilters = {}): Promise<AuditLogListResponse> => {
    const params = new URLSearchParams()
    if (filters.event_type) params.append("event_type", filters.event_type)
    if (filters.resource_type) params.append("resource_type", filters.resource_type)
    if (filters.actor_type) params.append("actor_type", filters.actor_type)
    if (filters.search) params.append("search", filters.search)
    if (filters.date_from) params.append("date_from", filters.date_from)
    if (filters.date_to) params.append("date_to", filters.date_to)
    if (filters.page) params.append("page", String(filters.page))
    if (filters.limit) params.append("limit", String(filters.limit))

    const qs = params.toString()
    return apiClient.get<AuditLogListResponse>(`/api/audit-logs${qs ? `?${qs}` : ""}`)
  },
}
