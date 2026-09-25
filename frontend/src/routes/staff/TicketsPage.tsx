import React, { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  HelpCircle,
  Search,
  Send,
  Paperclip,
} from "lucide-react"
import { toast } from "sonner"
import { staffSupportApi } from "@/features/support/api"
import { hrApi } from "@/features/hr/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

export const TicketsPage: React.FC = () => {
  const queryClient = useQueryClient()

  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [priorityFilter] = useState<string>("all")
  const [search, setSearch] = useState("")
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState("")

  // Queries
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["staff", "tickets", statusFilter, priorityFilter],
    queryFn: () =>
      staffSupportApi.getTickets({
        status: statusFilter === "all" ? undefined : statusFilter,
        priority: priorityFilter === "all" ? undefined : priorityFilter,
      }),
    refetchInterval: 15000,
  })

  const { data: selectedTicket, isLoading: isLoadingTicket } = useQuery({
    queryKey: ["staff", "ticket", selectedTicketId],
    queryFn: () => staffSupportApi.getTicketDetails(selectedTicketId!),
    enabled: !!selectedTicketId,
  })

  const { data: staffData } = useQuery({
    queryKey: ["staff", "members"],
    queryFn: () => hrApi.listStaff({ limit: 100 }),
  })
  const staffMembers = staffData?.items || []

  // Mutations
  const replyMutation = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      staffSupportApi.addComment(id, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff", "ticket", selectedTicketId] })
      queryClient.invalidateQueries({ queryKey: ["staff", "tickets"] })
      setReplyText("")
      toast.success("Response sent to customer.")
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || "Failed to post comment.")
    },
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      staffSupportApi.updateTicketStatus(id, status),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["staff", "ticket", selectedTicketId] })
      queryClient.invalidateQueries({ queryKey: ["staff", "tickets"] })
      toast.success(`Ticket status updated to ${updated.status}.`)
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || "Failed to update ticket status.")
    },
  })

  const assignMutation = useMutation({
    mutationFn: ({ id, staffId }: { id: string; staffId: string }) =>
      staffSupportApi.assignTicket(id, staffId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff", "ticket", selectedTicketId] })
      queryClient.invalidateQueries({ queryKey: ["staff", "tickets"] })
      toast.success("Ticket assigned successfully.")
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || "Failed to assign ticket.")
    },
  })

  const filteredTickets = tickets.filter((t) => {
    const s = search.toLowerCase()
    return (
      t.ticket_number.toLowerCase().includes(s) ||
      t.subject.toLowerCase().includes(s) ||
      (t.customer_name && t.customer_name.toLowerCase().includes(s))
    )
  })

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "open":
        return <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20">Open</Badge>
      case "in_progress":
        return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">In Progress</Badge>
      case "resolved":
        return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Resolved</Badge>
      case "closed":
        return <Badge className="bg-slate-500/10 text-slate-400 border-slate-500/20">Closed</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  const getPriorityBadge = (priority: string) => {
    switch (priority.toLowerCase()) {
      case "urgent":
        return <span className="text-[11px] font-bold text-rose-600 uppercase">Urgent</span>
      case "high":
        return <span className="text-[11px] font-semibold text-amber-600 uppercase">High</span>
      case "medium":
        return <span className="text-[11px] font-medium text-slate-600 uppercase">Medium</span>
      default:
        return <span className="text-[11px] text-slate-400 uppercase">Low</span>
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <HelpCircle className="w-7 h-7 text-indigo-500" />
          Support Ticket Queue
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review customer inquiries, assign tickets, reply to conversation threads, and resolve issues.
        </p>
      </div>

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        {/* Ticket List Column */}
        <div className="lg:col-span-5 flex flex-col bg-card border border-white/[0.14] rounded-xl shadow-none overflow-hidden min-h-0">
          {/* Filters */}
          <div className="p-3 border-b border-white/[0.08] space-y-3 bg-white/[0.02]">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ticket no, customer, subject..."
                className="pl-8 h-9 text-xs bg-black/40 border-white/[0.16] text-zinc-100 placeholder:text-zinc-500"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {["all", "open", "in_progress", "resolved", "closed"].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition ${
                    statusFilter === st
                      ? "bg-primary text-white"
                      : "border border-white/[0.14] bg-white/[0.04] text-zinc-300 hover:bg-[#18181C]"
                  }`}
                >
                  {st.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          {/* Ticket Rows */}
          <div className="flex-1 overflow-y-auto divide-y divide-white/[0.08]">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-zinc-400">Loading queue...</div>
            ) : filteredTickets.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-400">No tickets found.</div>
            ) : (
              filteredTickets.map((t) => {
                const isSelected = selectedTicketId === t.id
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTicketId(t.id)}
                    className={`p-3.5 transition cursor-pointer flex flex-col gap-1.5 ${
                      isSelected ? "bg-[#18181C] border-l-4 border-primary" : "hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-primary">
                        {t.ticket_number}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {getPriorityBadge(t.priority)}
                        {getStatusBadge(t.status)}
                      </div>
                    </div>

                    <h4 className="font-medium text-sm text-zinc-100 line-clamp-1">{t.subject}</h4>

                    <div className="flex items-center justify-between text-xs text-zinc-400 mt-1">
                      <span>{t.customer_name || "Customer"}</span>
                      <span>{new Date(t.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Ticket Details & Thread Column */}
        <div className="lg:col-span-7 flex flex-col bg-card border border-white/[0.14] rounded-xl shadow-none overflow-hidden min-h-0">
          {!selectedTicketId ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-zinc-400">
              <HelpCircle className="w-12 h-12 opacity-30 mb-3 text-zinc-500" />
              <h3 className="font-semibold text-zinc-200">No Ticket Selected</h3>
              <p className="text-xs max-w-sm mt-1 text-zinc-400">
                Select a ticket from the queue on the left to inspect conversation history, assign staff, and submit responses.
              </p>
            </div>
          ) : isLoadingTicket || !selectedTicket ? (
            <div className="flex-1 flex items-center justify-center p-12 text-zinc-400 text-sm">
              Loading ticket details...
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Detail Header */}
              <div className="p-4 border-b border-white/[0.08] bg-white/[0.02] space-y-3 shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-primary">
                        {selectedTicket.ticket_number}
                      </span>
                      {getStatusBadge(selectedTicket.status)}
                      {getPriorityBadge(selectedTicket.priority)}
                    </div>
                    <h2 className="text-base font-bold text-zinc-100 mt-1">
                      {selectedTicket.subject}
                    </h2>
                  </div>

                  {/* Actions / Status Dropdown */}
                  <div className="flex items-center gap-2">
                    <select
                      className="bg-[#0A0A0C] border border-white/[0.16] text-zinc-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-primary/60 [&>option]:bg-[#0C0C0E]"
                      value={selectedTicket.status}
                      onChange={(e) =>
                        statusMutation.mutate({
                          id: selectedTicket.id,
                          status: e.target.value,
                        })
                      }
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>

                    <select
                      className="bg-[#0A0A0C] border border-white/[0.16] text-zinc-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-primary/60 [&>option]:bg-[#0C0C0E]"
                      value={selectedTicket.assigned_staff_id || ""}
                      onChange={(e) =>
                        assignMutation.mutate({
                          id: selectedTicket.id,
                          staffId: e.target.value,
                        })
                      }
                    >
                      <option value="">-- Assign Staff --</option>
                      {staffMembers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name || s.email}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
                  <span>Customer: <strong className="text-zinc-200">{selectedTicket.customer_name}</strong></span>
                  <span>Email: {selectedTicket.customer_email}</span>
                  <span>Assigned: <strong className="text-zinc-200">{selectedTicket.assigned_staff_name || "Unassigned"}</strong></span>
                </div>

                {/* Original Description Card */}
                <div className="p-3 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs space-y-1 text-zinc-200">
                  <span className="font-semibold text-zinc-400 block uppercase text-[10px]">
                    Customer Problem Statement:
                  </span>
                  <p className="whitespace-pre-wrap">{selectedTicket.description}</p>
                  {selectedTicket.attachment_path && (
                    <div className="pt-2 flex items-center gap-1.5 text-primary font-medium">
                      <Paperclip className="w-3.5 h-3.5" />
                      <span>Attachment: {selectedTicket.attachment_path}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Thread Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 bg-black/40">
                {selectedTicket.comments.length === 0 ? (
                  <p className="text-xs text-center text-zinc-500 italic py-6">
                    No responses recorded yet. Reply below to initiate communication.
                  </p>
                ) : (
                  selectedTicket.comments.map((c) => {
                    const isStaff = c.author_type === "staff"
                    return (
                      <div
                        key={c.id}
                        className={`flex flex-col ${isStaff ? "items-end" : "items-start"}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl p-3.5 shadow-none text-xs space-y-1.5 ${
                            isStaff
                              ? "bg-primary text-white rounded-tr-none"
                              : "bg-[#18181C] text-zinc-100 border border-white/[0.14] rounded-tl-none"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3 text-[10px] opacity-80">
                            <span className="font-semibold">{c.author_name} ({c.author_type})</span>
                            <span>{new Date(c.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                          <p className="whitespace-pre-wrap leading-relaxed">{c.body}</p>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Reply Box */}
              <div className="p-3 border-t border-white/[0.08] bg-card shrink-0">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!replyText.trim()) return
                    replyMutation.mutate({ id: selectedTicket.id, text: replyText })
                  }}
                  className="flex items-center gap-2"
                >
                  <Input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type your response to the customer (append-only)..."
                    className="flex-1 text-xs bg-black/40 border-white/[0.16] text-zinc-100 placeholder:text-zinc-500"
                    disabled={replyMutation.isPending}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={replyMutation.isPending || !replyText.trim()}
                    className="flex items-center gap-1.5 text-xs bg-primary hover:bg-blue-500 text-white font-medium"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Reply
                  </Button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TicketsPage
