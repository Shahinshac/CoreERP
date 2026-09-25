import { apiClient } from "@/lib/api"

export interface WarrantyItem {
  id: string
  product_id: string
  product_name?: string | null
  customer_id: string
  customer_name?: string | null
  sale_item_id?: string | null
  serial_number?: string | null
  purchase_date: string
  start_date: string
  end_date: string
  is_claimed: boolean
  claimed_at?: string | null
  claim_notes?: string | null
  status: string // 'active' | 'expired' | 'claimed'
  created_at: string
}

export interface WarrantyCreatePayload {
  product_id: string
  customer_id: string
  sale_item_id?: string
  serial_number?: string
  purchase_date: string
  start_date: string
  end_date: string
}

export interface TicketCommentItem {
  id: string
  ticket_id: string
  author_id: string
  author_type: string
  author_name: string
  body: string
  created_at: string
}

export interface TicketItem {
  id: string
  ticket_number: string
  customer_id: string
  customer_name?: string | null
  customer_email?: string | null
  subject: string
  description: string
  attachment_path?: string | null
  status: string // 'open' | 'in_progress' | 'resolved' | 'closed'
  priority: string // 'low' | 'medium' | 'high' | 'urgent'
  assigned_staff_id?: string | null
  assigned_staff_name?: string | null
  resolved_at?: string | null
  closed_at?: string | null
  created_at: string
  updated_at: string
  comments: TicketCommentItem[]
}

export const staffSupportApi = {
  // Warranties
  getWarranties: async (params?: {
    customer_id?: string
    product_id?: string
    serial_number?: string
    status?: string
  }): Promise<WarrantyItem[]> => {
    const sp = new URLSearchParams()
    if (params?.customer_id) sp.set("customer_id", params.customer_id)
    if (params?.product_id) sp.set("product_id", params.product_id)
    if (params?.serial_number) sp.set("serial_number", params.serial_number)
    if (params?.status) sp.set("status", params.status)
    const qs = sp.toString()
    return apiClient.get<WarrantyItem[]>(`/api/support/warranties${qs ? `?${qs}` : ""}`)
  },

  createWarranty: async (payload: WarrantyCreatePayload): Promise<WarrantyItem> => {
    return apiClient.post<WarrantyItem>("/api/support/warranties", payload)
  },

  claimWarranty: async (id: string, notes?: string): Promise<WarrantyItem> => {
    return apiClient.post<WarrantyItem>(`/api/support/warranties/${id}/claim`, {
      claim_notes: notes,
    })
  },

  // Tickets
  getTickets: async (params?: {
    status?: string
    priority?: string
    assigned_to?: string
    search?: string
  }): Promise<TicketItem[]> => {
    const sp = new URLSearchParams()
    if (params?.status) sp.set("status", params.status)
    if (params?.priority) sp.set("priority", params.priority)
    if (params?.assigned_to) sp.set("assigned_to", params.assigned_to)
    if (params?.search) sp.set("search", params.search)
    const qs = sp.toString()
    return apiClient.get<TicketItem[]>(`/api/support/tickets${qs ? `?${qs}` : ""}`)
  },

  getTicketDetails: async (id: string): Promise<TicketItem> => {
    return apiClient.get<TicketItem>(`/api/support/tickets/${id}`)
  },

  assignTicket: async (id: string, staffId: string): Promise<TicketItem> => {
    return apiClient.patch<TicketItem>(`/api/support/tickets/${id}/assign`, {
      staff_id: staffId,
    })
  },

  updateTicketStatus: async (id: string, status: string): Promise<TicketItem> => {
    return apiClient.patch<TicketItem>(`/api/support/tickets/${id}/status`, {
      status,
    })
  },

  addComment: async (id: string, body: string): Promise<TicketCommentItem> => {
    return apiClient.post<TicketCommentItem>(`/api/support/tickets/${id}/comments`, {
      body,
    })
  },
}
