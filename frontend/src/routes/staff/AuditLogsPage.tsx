import React, { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  ShieldAlert,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  Calendar,
} from "lucide-react"
import { auditApi, AuditLog } from "@/features/audit/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

const EVENT_TYPE_COLORS: Record<string, string> = {
  auth: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  payment: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  pos: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  sale: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  invoice: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  quotation: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  catalog: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  inventory: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  staff: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  salary: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  customer: "bg-pink-500/10 text-pink-400 border-pink-500/20",
}

function getEventBadgeClass(eventType: string): string {
  const prefix = eventType.split(".")[0].toLowerCase()
  return (
    EVENT_TYPE_COLORS[prefix] ||
    "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
  )
}

export const AuditLogsPage: React.FC = () => {
  const [page, setPage] = useState(1)
  const [pageSize] = useState(25)
  const [search, setSearch] = useState("")
  const [eventTypeFilter, setEventTypeFilter] = useState("")
  const [resourceTypeFilter, setResourceTypeFilter] = useState("")
  const [actorTypeFilter, setActorTypeFilter] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: [
      "audit-logs",
      page,
      search,
      eventTypeFilter,
      resourceTypeFilter,
      actorTypeFilter,
      dateFrom,
      dateTo,
    ],
    queryFn: () =>
      auditApi.getLogs({
        page,
        limit: pageSize,
        search: search.trim() || undefined,
        event_type: eventTypeFilter.trim() || undefined,
        resource_type: resourceTypeFilter || undefined,
        actor_type: actorTypeFilter || undefined,
        date_from: dateFrom ? new Date(dateFrom).toISOString() : undefined,
        date_to: dateTo ? new Date(dateTo + "T23:59:59").toISOString() : undefined,
      }),
  })

  const resetFilters = () => {
    setSearch("")
    setEventTypeFilter("")
    setResourceTypeFilter("")
    setActorTypeFilter("")
    setDateFrom("")
    setDateTo("")
    setPage(1)
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-widest font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
              Compliance & Security
            </span>
            <Badge variant="secondary" className="text-[11px]">
              Admin Only
            </Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 mt-2 flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-primary" />
            Audit Logs & System Trail
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Immutable append-only ledger capturing all organizational transactions, mutations, and security events.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-xs border-white/[0.12] bg-[#141417] text-zinc-300 hover:text-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh Trail
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-[#0C0C0E] border border-white/[0.08] rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-500" />
            <Input
              type="text"
              placeholder="Search description, email, ID..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="pl-9 h-9 text-xs bg-[#141417] border-white/[0.10]"
            />
          </div>

          {/* Event Type */}
          <Input
            type="text"
            placeholder="Event type (e.g. auth., payment.)"
            value={eventTypeFilter}
            onChange={(e) => {
              setEventTypeFilter(e.target.value)
              setPage(1)
            }}
            className="h-9 text-xs bg-[#141417] border-white/[0.10]"
          />

          {/* Resource Type */}
          <select
            value={resourceTypeFilter}
            onChange={(e) => {
              setResourceTypeFilter(e.target.value)
              setPage(1)
            }}
            className="h-9 text-xs rounded-md bg-[#141417] border border-white/[0.10] px-3 text-zinc-300 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All Resource Types</option>
            <option value="sale">sale</option>
            <option value="payment">payment</option>
            <option value="invoice">invoice</option>
            <option value="quotation">quotation</option>
            <option value="product">product</option>
            <option value="stock_movement">stock_movement</option>
            <option value="customer">customer</option>
            <option value="staff_user">staff_user</option>
            <option value="salary">salary</option>
            <option value="expense">expense</option>
            <option value="emi">emi</option>
          </select>

          {/* Actor Type */}
          <select
            value={actorTypeFilter}
            onChange={(e) => {
              setActorTypeFilter(e.target.value)
              setPage(1)
            }}
            className="h-9 text-xs rounded-md bg-[#141417] border border-white/[0.10] px-3 text-zinc-300 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All Actor Types</option>
            <option value="staff">staff</option>
            <option value="customer">customer</option>
            <option value="system">system</option>
            <option value="anonymous">anonymous</option>
          </select>
        </div>

        {/* Date Filters + Reset */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-white/[0.06]">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Calendar className="h-3.5 w-3.5 text-zinc-500" />
            <span className="text-muted-foreground text-[11px]">From:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setPage(1)
              }}
              className="bg-[#141417] border border-white/[0.10] rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none"
            />
            <span className="text-muted-foreground text-[11px]">To:</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value)
                setPage(1)
              }}
              className="bg-[#141417] border border-white/[0.10] rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none"
            />
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="h-7 text-xs text-zinc-400 hover:text-white"
          >
            Clear Filters
          </Button>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="border border-white/[0.08] rounded-xl overflow-hidden bg-[#0C0C0E]">
        <table className="w-full text-left text-xs">
          <thead className="bg-white/[0.02] border-b border-white/[0.08] text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4">Timestamp (UTC)</th>
              <th className="py-3 px-4">Actor</th>
              <th className="py-3 px-4">Event Type</th>
              <th className="py-3 px-4">Resource</th>
              <th className="py-3 px-4">Description</th>
              <th className="py-3 px-4">Client IP</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, idx) => (
                <tr key={idx} className="animate-pulse">
                  <td colSpan={7} className="py-3.5 px-4">
                    <div className="h-4 bg-white/[0.05] rounded w-full" />
                  </td>
                </tr>
              ))
            ) : data && data.items.length > 0 ? (
              data.items.map((log) => (
                <tr
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className="hover:bg-white/[0.02] cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-zinc-200">
                        {log.actor_email || log.actor_type.toUpperCase()}
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {log.actor_type}
                    </span>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span
                      className={`text-[11px] font-mono px-2 py-0.5 rounded border ${getEventBadgeClass(
                        log.event_type
                      )}`}
                    >
                      {log.event_type}
                    </span>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-zinc-300">
                    {log.resource_type ? (
                      <div>
                        <span>{log.resource_type}</span>
                        {log.resource_id && (
                          <span className="text-zinc-500 block text-[10px]">
                            {log.resource_id.slice(0, 8)}...
                          </span>
                        )}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-3 px-4 max-w-xs truncate text-zinc-300" title={log.description}>
                    {log.description}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                    {log.ip_address || "—"}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedLog(log)
                      }}
                      className="h-7 text-xs text-primary hover:text-primary/90"
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" /> View
                    </Button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="py-12 text-center text-muted-foreground text-xs">
                  No audit log events match your selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination Bar */}
        {data && data.total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.08] text-xs text-muted-foreground bg-white/[0.01]">
            <div>
              Showing {data.items.length} of <span className="font-semibold text-zinc-200">{data.total}</span> events
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="h-7 text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </Button>
              <span className="px-2 text-zinc-300 font-mono">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="h-7 text-xs"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Log Detail Modal */}
      {selectedLog && (
        <Dialog open={Boolean(selectedLog)} onOpenChange={() => setSelectedLog(null)}>
          <DialogContent className="max-w-2xl bg-[#0F0F12] border-white/[0.12] text-zinc-100 p-6">
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`text-[11px] font-mono px-2 py-0.5 rounded border ${getEventBadgeClass(
                    selectedLog.event_type
                  )}`}
                >
                  {selectedLog.event_type}
                </span>
                <span className="text-xs text-muted-foreground font-mono">
                  ID: {selectedLog.id}
                </span>
              </div>
              <DialogTitle className="text-base font-bold text-zinc-100">
                {selectedLog.description}
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-400">
                Logged at {new Date(selectedLog.created_at).toUTCString()}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-4 border-t border-white/[0.08] text-xs">
              <div className="grid grid-cols-2 gap-3 bg-[#141417] p-3.5 rounded-lg border border-white/[0.06]">
                <div>
                  <span className="text-zinc-500 block text-[11px]">Actor Type</span>
                  <span className="font-semibold text-zinc-200">{selectedLog.actor_type}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[11px]">Actor Email</span>
                  <span className="font-semibold text-zinc-200">{selectedLog.actor_email || "System"}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[11px]">Resource Type</span>
                  <span className="font-mono text-zinc-200">{selectedLog.resource_type || "None"}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[11px]">Resource ID</span>
                  <span className="font-mono text-zinc-200">{selectedLog.resource_id || "None"}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[11px]">Client IP Address</span>
                  <span className="font-mono text-zinc-200">{selectedLog.ip_address || "None"}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[11px]">Client User Agent</span>
                  <span className="truncate block font-mono text-[10px] text-zinc-400" title={selectedLog.user_agent || ""}>
                    {selectedLog.user_agent || "None"}
                  </span>
                </div>
              </div>

              {/* JSON Payload Details */}
              <div className="space-y-1.5">
                <span className="font-semibold text-zinc-300 block">Event Payload (details)</span>
                <pre className="p-3.5 rounded-lg bg-black/40 border border-white/[0.06] font-mono text-[11px] text-zinc-300 overflow-x-auto max-h-60">
                  {selectedLog.details
                    ? JSON.stringify(selectedLog.details, null, 2)
                    : "No supplementary payload recorded."}
                </pre>
              </div>

              <div className="flex justify-end pt-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedLog(null)}>
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

export default AuditLogsPage
