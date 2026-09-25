import { apiClient } from "@/lib/api"
import type { PortalNotificationItem, PortalNotificationListResponse } from "@/features/portal/supportApi"

export const staffNotificationApi = {
  getNotifications: async (): Promise<PortalNotificationListResponse> => {
    return apiClient.get<PortalNotificationListResponse>("/api/notifications")
  },

  markNotificationRead: async (id: string): Promise<PortalNotificationItem> => {
    return apiClient.post<PortalNotificationItem>(`/api/notifications/${id}/read`)
  },

  markAllNotificationsRead: async (): Promise<{ message: string }> => {
    return apiClient.post<{ message: string }>("/api/notifications/read-all")
  },
}
