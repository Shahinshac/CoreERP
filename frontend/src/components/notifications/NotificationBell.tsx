import React, { useState, useRef, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Bell, Check, CheckCheck, Clock, ExternalLink } from "lucide-react"
import { portalSupportApi } from "@/features/portal/supportApi"
import { staffNotificationApi } from "@/features/notifications/api"
import type { PortalNotificationItem, PortalNotificationListResponse } from "@/features/portal/supportApi"

interface NotificationBellProps {
  type: "staff" | "customer"
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ type }) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const api = type === "staff" ? staffNotificationApi : portalSupportApi
  const queryKey = ["notifications", type]

  const { data } = useQuery<PortalNotificationListResponse>({
    queryKey,
    queryFn: api.getNotifications,
    refetchInterval: 30000, // Poll every 30s
  })

  const unreadCount = data?.unread_count || 0
  const items = data?.items || []

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  const markAllMutation = useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  const handleNotificationClick = (notif: PortalNotificationItem) => {
    if (!notif.read_at) {
      markReadMutation.mutate(notif.id)
    }
    if (notif.link) {
      setIsOpen(false)
      navigate(notif.link)
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition-colors focus:outline-none"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold text-white bg-primary rounded-full px-1 shadow-none animate-pulse">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#0C0C0E] border border-white/[0.14] rounded-xl shadow-2xl z-50 overflow-hidden text-zinc-100 animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.10] bg-black/40">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-zinc-100">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-xs bg-primary/10 text-primary border border-primary/20 font-medium px-2 py-0.5 rounded-full">
                  {unreadCount} unread
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllMutation.mutate()}
                className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 font-medium transition"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-white/[0.06]">
            {items.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-xs">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No notifications yet.
              </div>
            ) : (
              items.map((notif) => {
                const isUnread = !notif.read_at
                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`p-3.5 transition-colors cursor-pointer flex gap-3 ${
                      isUnread
                        ? "bg-primary/[0.06] hover:bg-primary/[0.10]"
                        : "hover:bg-white/[0.04]"
                    }`}
                  >
                    {/* Unread indicator */}
                    <div className="pt-1 shrink-0">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          isUnread ? "bg-primary ring-4 ring-primary/20" : "bg-transparent"
                        }`}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4
                          className={`text-xs truncate ${
                            isUnread ? "font-bold text-zinc-100" : "font-medium text-zinc-300"
                          }`}
                        >
                          {notif.title}
                        </h4>
                        <span className="text-[10px] text-zinc-500 shrink-0 flex items-center gap-0.5">
                          <Clock className="w-3 h-3" />
                          {new Date(notif.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2 leading-relaxed">
                        {notif.message}
                      </p>

                      <div className="flex items-center justify-between mt-2 pt-1 border-t border-white/[0.06]">
                        {notif.link ? (
                          <span className="text-[10px] text-primary flex items-center gap-1">
                            View details <ExternalLink className="w-3 h-3" />
                          </span>
                        ) : <span />}

                        {isUnread && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              markReadMutation.mutate(notif.id)
                            }}
                            className="text-[10px] text-zinc-400 hover:text-zinc-100 flex items-center gap-1 transition"
                          >
                            <Check className="w-3 h-3" />
                            Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
