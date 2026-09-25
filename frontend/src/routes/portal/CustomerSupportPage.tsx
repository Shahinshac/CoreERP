import React, { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  HelpCircle,
  Plus,
  Send,
  Paperclip,
  Clock,
  CheckCircle2,
  MessageSquare,
} from "lucide-react"
import { toast } from "sonner"
import { portalSupportApi } from "@/features/portal/supportApi"
import type { TicketItem } from "@/features/support/api"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export const CustomerSupportPage: React.FC = () => {
  const queryClient = useQueryClient()
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [isNewTicketOpen, setIsNewTicketOpen] = useState(false)
  const [replyText, setReplyText] = useState("")

  // New Ticket Form State
  const [subject, setSubject] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState("medium")
  const [attachment, setAttachment] = useState<File | null>(null)

  // Queries
  const { data: tickets = [], isLoading, isError, error } = useQuery<TicketItem[]>({
    queryKey: ["portal", "tickets"],
    queryFn: portalSupportApi.getTickets,
    refetchInterval: 15000,
  })

  const { data: selectedTicket, isLoading: isLoadingTicket } = useQuery<TicketItem>({
    queryKey: ["portal", "ticket", selectedTicketId],
    queryFn: () => portalSupportApi.getSingleTicket(selectedTicketId!),
    enabled: !!selectedTicketId,
  })

  // Mutations
  const createTicketMutation = useMutation({
    mutationFn: (formData: FormData) => portalSupportApi.createTicket(formData),
    onSuccess: (newTicket) => {
      queryClient.invalidateQueries({ queryKey: ["portal", "tickets"] })
      queryClient.invalidateQueries({ queryKey: ["portal-dashboard-summary"] })
      toast.success("Support ticket submitted successfully!", {
        description: `Ticket #${newTicket.ticket_number} has been queued for review.`,
      })
      setIsNewTicketOpen(false)
      setSubject("")
      setDescription("")
      setPriority("medium")
      setAttachment(null)
      setSelectedTicketId(newTicket.id)
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message || err.message || "Failed to submit ticket."
      toast.error(msg)
    },
  })

  const replyMutation = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      portalSupportApi.addComment(id, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "ticket", selectedTicketId] })
      queryClient.invalidateQueries({ queryKey: ["portal", "tickets"] })
      setReplyText("")
      toast.success("Reply submitted.")
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || "Failed to send message.")
    },
  })

  const handleCreateTicket = (e: React.FormEvent) => {
    e.preventDefault()
    if (!subject.trim() || !description.trim()) {
      toast.error("Subject and description are required.")
      return
    }

    if (attachment && attachment.size > 2 * 1024 * 1024) {
      toast.error("Attachment size exceeds 2MB limit.")
      return
    }

    const formData = new FormData()
    formData.append("subject", subject.trim())
    formData.append("description", description.trim())
    formData.append("priority", priority)
    if (attachment) {
      formData.append("attachment", attachment)
    }

    createTicketMutation.mutate(formData)
  }

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "open":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <Clock className="w-3 h-3" />
            Open
          </span>
        )
      case "in_progress":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3" />
            In Progress
          </span>
        )
      case "resolved":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            Resolved
          </span>
        )
      case "closed":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
            Closed
          </span>
        )
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-6 text-slate-100 h-[calc(100vh-5rem)] flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <HelpCircle className="w-7 h-7 text-indigo-400" />
            Customer Support & Inquiries
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Submit service requests, ask product questions, and converse directly with support staff.
          </p>
        </div>

        <Button
          onClick={() => setIsNewTicketOpen(true)}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-lg shadow-indigo-600/20 w-fit"
        >
          <Plus className="w-4 h-4" />
          Open New Ticket
        </Button>
      </div>

      {/* Main Grid: Ticket List + Conversation Thread */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        {/* Ticket List (Left 5 Cols) */}
        <div className="lg:col-span-5 flex flex-col bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl shadow-lg overflow-hidden min-h-0">
          <div className="p-4 border-b border-slate-800/80 bg-slate-950/40 flex items-center justify-between shrink-0">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              My Support Inquiries ({tickets.length})
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 min-h-0">
            {isLoading ? (
              <div className="p-8 text-center text-slate-400 text-xs">Loading tickets...</div>
            ) : isError ? (
              <div className="p-8 text-center text-rose-400 text-xs">
                {(error as Error)?.message || "Failed to load tickets."}
              </div>
            ) : tickets.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                <HelpCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No support tickets on record. Click "Open New Ticket" above to reach us.
              </div>
            ) : (
              tickets.map((t) => {
                const isSelected = selectedTicketId === t.id
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTicketId(t.id)}
                    className={`p-4 transition cursor-pointer flex flex-col gap-1.5 ${
                      isSelected
                        ? "bg-indigo-950/40 border-l-4 border-indigo-500"
                        : "hover:bg-slate-800/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-indigo-400">
                        {t.ticket_number}
                      </span>
                      {getStatusBadge(t.status)}
                    </div>
                    <h4 className="font-semibold text-sm text-white line-clamp-1">{t.subject}</h4>
                    <p className="text-xs text-slate-400 line-clamp-1">{t.description}</p>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                      <span>{new Date(t.created_at).toLocaleDateString()}</span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        {t.comments.length} replies
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Conversation Thread (Right 7 Cols) */}
        <div className="lg:col-span-7 flex flex-col bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl shadow-lg overflow-hidden min-h-0">
          {!selectedTicketId ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500">
              <MessageSquare className="w-12 h-12 opacity-30 mb-3" />
              <h3 className="font-semibold text-slate-300">Select an Inquiry</h3>
              <p className="text-xs max-w-sm mt-1 text-slate-500">
                Choose a ticket from the left column to view the complete staff response thread and send follow-up replies.
              </p>
            </div>
          ) : isLoadingTicket || !selectedTicket ? (
            <div className="flex-1 flex items-center justify-center p-12 text-slate-400 text-xs">
              Loading ticket conversation...
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Thread Header */}
              <div className="p-4 border-b border-slate-800/80 bg-slate-950/40 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-indigo-400">
                      {selectedTicket.ticket_number}
                    </span>
                    {getStatusBadge(selectedTicket.status)}
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Opened on {new Date(selectedTicket.created_at).toLocaleDateString()}
                  </span>
                </div>
                <h2 className="text-base font-bold text-white mt-1">{selectedTicket.subject}</h2>

                {/* Original Description */}
                <div className="mt-3 p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300">
                  <span className="font-semibold text-slate-400 block text-[10px] uppercase mb-1">
                    Initial Description:
                  </span>
                  <p className="whitespace-pre-wrap">{selectedTicket.description}</p>

                  {selectedTicket.attachment_path && (
                    <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center gap-1.5 text-indigo-400 font-medium text-[11px]">
                      <Paperclip className="w-3.5 h-3.5" />
                      <span>Attachment: {selectedTicket.attachment_path}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Message History */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 bg-slate-950/20">
                {selectedTicket.comments.length === 0 ? (
                  <p className="text-xs text-center text-slate-500 italic py-6">
                    Your request is in our support queue. An agent will respond shortly.
                  </p>
                ) : (
                  selectedTicket.comments.map((c) => {
                    const isMe = c.author_type === "customer"
                    return (
                      <div
                        key={c.id}
                        className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl p-3.5 shadow-sm text-xs space-y-1.5 ${
                            isMe
                              ? "bg-indigo-600 text-white rounded-tr-none"
                              : "bg-slate-800 text-slate-200 border border-slate-700/80 rounded-tl-none"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3 text-[10px] opacity-80">
                            <span className="font-semibold">
                              {isMe ? "You" : `${c.author_name} (Support Staff)`}
                            </span>
                            <span>
                              {new Date(c.created_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <p className="whitespace-pre-wrap leading-relaxed">{c.body}</p>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Reply Box */}
              <div className="p-3 border-t border-slate-800/80 bg-slate-950/60 shrink-0">
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
                    placeholder="Type your reply here..."
                    className="flex-1 text-xs bg-slate-900 border-slate-800 text-white placeholder-slate-500"
                    disabled={replyMutation.isPending}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={replyMutation.isPending || !replyText.trim()}
                    className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-500"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Send
                  </Button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Open New Ticket Dialog */}
      <Dialog open={isNewTicketOpen} onOpenChange={setIsNewTicketOpen}>
        <DialogContent className="sm:max-w-lg bg-slate-900 text-slate-100 border border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-white">Open New Support Ticket</DialogTitle>
            <DialogDescription className="text-slate-400">
              Submit your issue or inquiry directly to our customer operations team.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateTicket} className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Subject / Summary *
              </label>
              <Input
                placeholder="e.g. Device screen flickering after reboot"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                className="bg-slate-950 border-slate-800 text-white"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Detailed Problem Description *
              </label>
              <textarea
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 min-h-[110px]"
                placeholder="Please describe symptoms, steps to reproduce, or any relevant product details..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Urgency / Priority
                </label>
                <select
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option value="low">Low (General Inquiry)</option>
                  <option value="medium">Medium (Standard)</option>
                  <option value="high">High (Equipment Malfunction)</option>
                  <option value="urgent">Urgent (Critical Failure)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Attachment (Max 2MB)
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setAttachment(e.target.files[0])
                    }
                  }}
                  className="w-full text-xs text-slate-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
                />
              </div>
            </div>

            <DialogFooter className="pt-4 border-t border-slate-800">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsNewTicketOpen(false)}
                className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createTicketMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                {createTicketMutation.isPending ? "Submitting..." : "Submit Ticket"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default CustomerSupportPage
