import { apiClient } from "@/lib/api"
import type { WarrantyItem, TicketItem, TicketCommentItem } from "@/features/support/api"

export interface PortalNotificationItem {
  id: string
  recipient_id: string
  recipient_type: string
  type: string
  title: string
  message: string
  link?: string | null
  read_at?: string | null
  created_at: string
}

export interface PortalNotificationListResponse {
  unread_count: number
  items: PortalNotificationItem[]
}

export const portalSupportApi = {
  // Warranties
  getWarranties: async (): Promise<WarrantyItem[]> => {
    return apiClient.get<WarrantyItem[]>("/api/portal/warranties")
  },

  getSingleWarranty: async (id: string): Promise<WarrantyItem> => {
    return apiClient.get<WarrantyItem>(`/api/portal/warranties/${id}`)
  },

  // Tickets
  getTickets: async (): Promise<TicketItem[]> => {
    return apiClient.get<TicketItem[]>("/api/portal/tickets")
  },

  getSingleTicket: async (id: string): Promise<TicketItem> => {
    return apiClient.get<TicketItem>(`/api/portal/tickets/${id}`)
  },

  createTicket: async (formData: FormData): Promise<TicketItem> => {
    return apiClient.upload<TicketItem>("/api/portal/tickets", formData)
  },

  addComment: async (id: string, body: string): Promise<TicketCommentItem> => {
    return apiClient.post<TicketCommentItem>(`/api/portal/tickets/${id}/comments`, {
      body,
    })
  },

  // Customer Notifications
  getNotifications: async (): Promise<PortalNotificationListResponse> => {
    return apiClient.get<PortalNotificationListResponse>("/api/portal/notifications")
  },

  markNotificationRead: async (id: string): Promise<PortalNotificationItem> => {
    return apiClient.post<PortalNotificationItem>(`/api/portal/notifications/${id}/read`)
  },

  markAllNotificationsRead: async (): Promise<{ message: string }> => {
    return apiClient.post<{ message: string }>("/api/portal/notifications/read-all")
  },
}
