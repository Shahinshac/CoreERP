import React, { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Coins,
  DollarSign,
  FileCheck,
  FileText,
  History,
  Lock,
  Printer,
  RefreshCw,
  Unlock,
  Vault,
} from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ActiveSessionDetails,
  CashDrawerSessionSummary,
  cashDrawerApi,
  XReport,
  ZReport,
} from "./cashDrawerApi"
import { POSStoreInfo, posApi } from "./api"

interface CashDrawerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSessionChange?: () => void
}

const DENOMINATIONS = [
  { label: "₹500 Notes", value: 500, key: "500" },
  { label: "₹200 Notes", value: 200, key: "200" },
  { label: "₹100 Notes", value: 100, key: "100" },
  { label: "₹50 Notes", value: 50, key: "50" },
  { label: "₹20 Notes", value: 20, key: "20" },
  { label: "₹10 Notes", value: 10, key: "10" },
  { label: "₹5 Coins", value: 5, key: "5" },
  { label: "₹2 Coins", value: 2, key: "2" },
  { label: "₹1 Coins", value: 1, key: "1" },
]

export const CashDrawerModal: React.FC<CashDrawerModalProps> = ({
  open,
  onOpenChange,
  onSessionChange,
}) => {
  const [activeTab, setActiveTab] = useState<string>("overview")
  const [loading, setLoading] = useState(false)
  const [activeSession, setActiveSession] = useState<ActiveSessionDetails | null>(null)
  const [storeInfo, setStoreInfo] = useState<POSStoreInfo | null>(null)

  // Open Drawer Form State
  const [openFloat, setOpenFloat] = useState("1000.00")
  const [openNotes, setOpenNotes] = useState("")
  const [submittingOpen, setSubmittingOpen] = useState(false)

  // Cash Movement Form State
  const [movementType, setMovementType] = useState<"cash_in" | "cash_out" | "cash_drop">("cash_in")
  const [movementAmount, setMovementAmount] = useState("")
  const [movementReason, setMovementReason] = useState("")
  const [submittingMovement, setSubmittingMovement] = useState(false)

  // X Report State
  const [xCountedCash, setXCountedCash] = useState("")
  const [xReportData, setXReportData] = useState<XReport | null>(null)
  const [loadingXReport, setLoadingXReport] = useState(false)

  // Close Drawer Form & Denomination State
  const [closingCash, setClosingCash] = useState("")
  const [closingNotes, setClosingNotes] = useState("")
  const [denominations, setDenominations] = useState<Record<string, number>>({})
  const [submittingClose, setSubmittingClose] = useState(false)

  // Active / Completed Z Report View
  const [zReportData, setZReportData] = useState<ZReport | null>(null)

  // Past Sessions History State
  const [pastSessions, setPastSessions] = useState<CashDrawerSessionSummary[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Printable Report State (Portal)
  const [printReport, setPrintReport] = useState<{
    type: "X" | "Z"
    data: XReport | ZReport
  } | null>(null)

  // Fetch current drawer status
  const fetchCurrentDrawer = async () => {
    try {
      setLoading(true)
      const res = await cashDrawerApi.getCurrentStatus()
      if (res.active && res.session) {
        setActiveSession(res.session)
      } else {
        setActiveSession(null)
      }
    } catch {
      // Ignored
    } finally {
      setLoading(false)
    }
  }

  // Fetch store info
  const fetchStoreInfo = async () => {
    try {
      const info = await posApi.getStoreInfo()
      setStoreInfo(info)
    } catch {
      // Fallback
    }
  }

  // Fetch past sessions history
  const fetchPastSessions = async () => {
    try {
      setLoadingHistory(true)
      const sessions = await cashDrawerApi.getSessions({ limit: 20 })
      setPastSessions(sessions)
    } catch {
      // Ignored
    } finally {
      setLoadingHistory(false)
    }
  }

  // Fetch live X Report
  const fetchXReport = async (counted?: string) => {
    try {
      setLoadingXReport(true)
      const res = await cashDrawerApi.getXReport(counted || undefined)
      setXReportData(res)
    } catch {
      // Ignored
    } finally {
      setLoadingXReport(false)
    }
  }

  useEffect(() => {
    if (open) {
      fetchCurrentDrawer()
      fetchStoreInfo()
      setZReportData(null)
      setPrintReport(null)
    }
  }, [open])

  useEffect(() => {
    if (activeTab === "history") {
      fetchPastSessions()
    } else if (activeTab === "x-report" && activeSession) {
      fetchXReport(xCountedCash)
    }
  }, [activeTab, activeSession])

  // Denomination counter auto-sum
  const handleDenominationChange = (key: string, qtyStr: string) => {
    const qty = Math.max(0, parseInt(qtyStr) || 0)
    const updated = { ...denominations, [key]: qty }
    setDenominations(updated)

    // Calculate total from denominations
    let sum = 0
    for (const d of DENOMINATIONS) {
      const q = updated[d.key] || 0
      sum += q * d.value
    }
    setClosingCash(sum.toFixed(2))
  }

  // Handle Open Drawer
  const handleOpenDrawer = async (e: React.FormEvent) => {
    e.preventDefault()
    const floatNum = parseFloat(openFloat)
    if (isNaN(floatNum) || floatNum < 0) {
      toast.error("Please enter a valid non-negative opening float amount.")
      return
    }

    setSubmittingOpen(true)
    try {
      await cashDrawerApi.openDrawer({
        opening_cash: floatNum.toFixed(2),
        opening_notes: openNotes.trim() || undefined,
      })
      toast.success("Cash drawer opened successfully!")
      await fetchCurrentDrawer()
      setActiveTab("overview")
      onSessionChange?.()
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || "Failed to open cash drawer.")
    } finally {
      setSubmittingOpen(false)
    }
  }

  // Handle Record Cash Movement
  const handleRecordMovement = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(movementAmount)
    if (isNaN(amt) || amt <= 0) {
      toast.error("Please enter a valid positive movement amount.")
      return
    }
    if (!movementReason.trim()) {
      toast.error("A reason is mandatory for manual cash adjustments.")
      return
    }

    setSubmittingMovement(true)
    try {
      await cashDrawerApi.recordMovement({
        movement_type: movementType,
        amount: amt.toFixed(2),
        reason: movementReason.trim(),
      })
      toast.success("Cash movement recorded successfully.")
      setMovementAmount("")
      setMovementReason("")
      await fetchCurrentDrawer()
      onSessionChange?.()
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || "Failed to record cash movement.")
    } finally {
      setSubmittingMovement(false)
    }
  }

  // Handle Close Drawer
  const handleCloseDrawer = async (e: React.FormEvent) => {
    e.preventDefault()
    const counted = parseFloat(closingCash)
    if (isNaN(counted) || counted < 0) {
      toast.error("Please enter a valid actual counted cash amount.")
      return
    }

    setSubmittingClose(true)
    try {
      const zReport = await cashDrawerApi.closeDrawer({
        closing_cash: counted.toFixed(2),
        denominations: Object.keys(denominations).length > 0 ? denominations : undefined,
        closing_notes: closingNotes.trim() || undefined,
      })
      toast.success("Cash drawer session closed and reconciled!")
      setZReportData(zReport)
      setActiveSession(null)
      setActiveTab("z-report")
      onSessionChange?.()
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || "Failed to close cash drawer.")
    } finally {
      setSubmittingClose(false)
    }
  }

  // Print Report Handler
  const handlePrint = (type: "X" | "Z", data: XReport | ZReport) => {
    setPrintReport({ type, data })
    setTimeout(() => {
      window.print()
    }, 150)
  }

  // View historical Z Report
  const handleViewHistoricalZReport = async (sessionId: string) => {
    try {
      setLoading(true)
      const z = await cashDrawerApi.getSessionZReport(sessionId)
      setZReportData(z)
      setActiveTab("z-report")
    } catch {
      toast.error("Failed to load historical Z Report.")
    } finally {
      setLoading(false)
    }
  }

  // Calculate live closing variance preview
  const liveVariance =
    activeSession && closingCash
      ? (parseFloat(closingCash) - parseFloat(activeSession.expected_cash)).toFixed(2)
      : null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange} className="max-w-4xl p-0 overflow-hidden">
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-[#0F0F12] border-white/[0.14] text-zinc-100 p-0 shadow-2xl">
          {/* Header */}
          <DialogHeader className="p-6 border-b border-white/[0.08] flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Vault className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  Cash Drawer & Reconciliation
                  {activeSession ? (
                    <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs px-2 py-0.5 gap-1 font-mono">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      SESSION OPEN
                    </Badge>
                  ) : (
                    <Badge className="bg-zinc-800 text-zinc-400 border border-zinc-700 text-xs px-2 py-0.5 font-mono">
                      DRAWER CLOSED
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-400 mt-0.5">
                  Shift opening floats, live sales tracking, mid-day X Reports, and end-of-day Z Reports.
                </DialogDescription>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchCurrentDrawer}
              disabled={loading}
              className="border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.08] text-xs gap-1.5 h-8"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </DialogHeader>

          <div className="p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="bg-white/[0.04] border border-white/[0.08] p-1 mb-6 w-full grid grid-cols-4">
                <TabsTrigger
                  value="overview"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs font-semibold"
                >
                  <Banknote className="h-3.5 w-3.5 mr-1.5" />
                  Drawer Overview
                </TabsTrigger>
                <TabsTrigger
                  value="x-report"
                  disabled={!activeSession}
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs font-semibold"
                >
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                  X Report (Mid-Day)
                </TabsTrigger>
                <TabsTrigger
                  value={zReportData ? "z-report" : "close-drawer"}
                  disabled={!activeSession && !zReportData}
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs font-semibold"
                >
                  <FileCheck className="h-3.5 w-3.5 mr-1.5" />
                  {zReportData ? "Z Report (Closed)" : "Close Drawer"}
                </TabsTrigger>
                <TabsTrigger
                  value="history"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs font-semibold"
                >
                  <History className="h-3.5 w-3.5 mr-1.5" />
                  Past Sessions
                </TabsTrigger>
              </TabsList>

              {/* ==============================================================
                  TAB 1: DRAWER OVERVIEW & ADJUSTMENTS
              ============================================================== */}
              <TabsContent value="overview" className="space-y-6 m-0">
                {!activeSession ? (
                  /* ==========================================
                     CASE A: NO ACTIVE SESSION -> OPEN DRAWER FORM
                  ========================================== */
                  <div className="space-y-6">
                    <div className="bg-gradient-to-b from-white/[0.04] to-transparent p-6 rounded-2xl border border-white/[0.08] text-center max-w-lg mx-auto space-y-4">
                      <div className="h-14 w-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mx-auto flex items-center justify-center">
                        <Lock className="h-7 w-7" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white">No Active Cash Drawer</h3>
                        <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
                          Open your cash drawer by recording your opening cash float before ringing up cash sales.
                        </p>
                      </div>

                      <form onSubmit={handleOpenDrawer} className="space-y-4 pt-2 text-left">
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-zinc-300">
                            Opening Float Cash Amount (₹) <span className="text-red-400">*</span>
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 text-zinc-400 text-sm font-mono">₹</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={openFloat}
                              onChange={(e) => setOpenFloat(e.target.value)}
                              placeholder="1000.00"
                              className="pl-8 bg-black/40 border-white/[0.12] text-white font-mono text-base h-11"
                              required
                            />
                          </div>
                          <p className="text-[11px] text-zinc-500">
                            Count all notes and coins placed in the register at the start of your shift.
                          </p>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-zinc-300">
                            Opening Notes (Optional)
                          </label>
                          <Input
                            type="text"
                            value={openNotes}
                            onChange={(e) => setOpenNotes(e.target.value)}
                            placeholder="e.g., Morning shift opening float"
                            className="bg-black/40 border-white/[0.12] text-white text-xs h-10"
                          />
                        </div>

                        <Button
                          type="submit"
                          disabled={submittingOpen}
                          className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm gap-2"
                        >
                          <Unlock className="h-4 w-4" />
                          {submittingOpen ? "Opening Drawer..." : "Open Cash Drawer Session"}
                        </Button>
                      </form>
                    </div>
                  </div>
                ) : (
                  /* ==========================================
                     CASE B: DRAWER IS OPEN -> ACTIVE DASHBOARD
                  ========================================== */
                  <div className="space-y-6">
                    {/* Live Metric Cards Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-surface-elevated p-4 rounded-xl border border-white/[0.08] space-y-1">
                        <div className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                          Opening Float
                        </div>
                        <div className="text-lg font-bold font-mono text-zinc-100">
                          ₹{parseFloat(activeSession.opening_cash).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono">
                          {new Date(activeSession.opened_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>

                      <div className="bg-surface-elevated p-4 rounded-xl border border-white/[0.08] space-y-1">
                        <div className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                          <ArrowUpRight className="h-3 w-3" />
                          Cash Sales
                        </div>
                        <div className="text-lg font-bold font-mono text-emerald-400">
                          +₹{parseFloat(activeSession.cash_sales_amount).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          {activeSession.cash_sales_count} sale(s)
                        </div>
                      </div>

                      <div className="bg-surface-elevated p-4 rounded-xl border border-white/[0.08] space-y-1">
                        <div className="text-[11px] font-medium text-rose-400 uppercase tracking-wider flex items-center gap-1">
                          <ArrowDownRight className="h-3 w-3" />
                          Cash Refunds
                        </div>
                        <div className="text-lg font-bold font-mono text-rose-400">
                          -₹{parseFloat(activeSession.cash_refunds_amount).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          {activeSession.cash_refunds_count} refund(s)
                        </div>
                      </div>

                      <div className="bg-gradient-to-br from-primary/10 to-primary/5 p-4 rounded-xl border border-primary/30 space-y-1">
                        <div className="text-[11px] font-bold text-primary uppercase tracking-wider flex items-center gap-1">
                          <Vault className="h-3 w-3" />
                          Expected In Drawer
                        </div>
                        <div className="text-2xl font-black font-mono text-white">
                          ₹{parseFloat(activeSession.expected_cash).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-primary/80 font-medium">
                          Formula: Open + Sales + In - Ref - Out
                        </div>
                      </div>
                    </div>

                    {/* Secondary Summary (Movements & Non-Cash) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Cash Adjustments Section */}
                      <div className="bg-surface-elevated p-4 rounded-xl border border-white/[0.08] space-y-4">
                        <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                          <div className="flex items-center gap-2">
                            <Coins className="h-4 w-4 text-primary" />
                            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                              Cash Movements / Adjustments
                            </h4>
                          </div>
                          <div className="text-[11px] font-mono text-zinc-400">
                            Net: +₹{(parseFloat(activeSession.cash_in_amount) - parseFloat(activeSession.cash_out_amount)).toFixed(2)}
                          </div>
                        </div>

                        {/* Quick Record Movement Form */}
                        <form onSubmit={handleRecordMovement} className="space-y-3">
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() => setMovementType("cash_in")}
                              className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition ${
                                movementType === "cash_in"
                                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                  : "bg-black/30 border-white/[0.08] text-zinc-400 hover:text-white"
                              }`}
                            >
                              + Cash In
                            </button>
                            <button
                              type="button"
                              onClick={() => setMovementType("cash_out")}
                              className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition ${
                                movementType === "cash_out"
                                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                                  : "bg-black/30 border-white/[0.08] text-zinc-400 hover:text-white"
                              }`}
                            >
                              - Cash Out
                            </button>
                            <button
                              type="button"
                              onClick={() => setMovementType("cash_drop")}
                              className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition ${
                                movementType === "cash_drop"
                                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                  : "bg-black/30 border-white/[0.08] text-zinc-400 hover:text-white"
                              }`}
                            >
                              Safe Drop
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={movementAmount}
                                onChange={(e) => setMovementAmount(e.target.value)}
                                placeholder="Amount (₹)"
                                className="bg-black/40 border-white/[0.12] text-xs font-mono h-9"
                                required
                              />
                            </div>
                            <div>
                              <Input
                                type="text"
                                value={movementReason}
                                onChange={(e) => setMovementReason(e.target.value)}
                                placeholder="Reason (Mandatory)"
                                className="bg-black/40 border-white/[0.12] text-xs h-9"
                                required
                              />
                            </div>
                          </div>

                          <Button
                            type="submit"
                            size="sm"
                            disabled={submittingMovement}
                            className="w-full h-8 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-semibold"
                          >
                            {submittingMovement ? "Recording..." : "Record Adjustment"}
                          </Button>
                        </form>

                        {/* Recent Movements Log */}
                        {activeSession.movements.length > 0 ? (
                          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                            {activeSession.movements.map((m) => (
                              <div
                                key={m.id}
                                className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-white/[0.04] text-xs"
                              >
                                <div className="space-y-0.5">
                                  <div className="font-semibold text-zinc-200 capitalize">
                                    {m.movement_type.replace("_", " ")}:{" "}
                                    <span className="font-normal text-zinc-400">{m.reason}</span>
                                  </div>
                                  <div className="text-[10px] text-zinc-500 font-mono">
                                    {new Date(m.created_at).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </div>
                                </div>
                                <div
                                  className={`font-mono font-bold ${
                                    m.movement_type === "cash_in" ? "text-emerald-400" : "text-rose-400"
                                  }`}
                                >
                                  {m.movement_type === "cash_in" ? "+" : "-"}₹
                                  {parseFloat(m.amount).toFixed(2)}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-zinc-500 text-center py-2">
                            No manual cash movements recorded yet in this session.
                          </p>
                        )}
                      </div>

                      {/* Sales by Payment Method Breakdown */}
                      <div className="bg-surface-elevated p-4 rounded-xl border border-white/[0.08] space-y-4">
                        <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-primary" />
                            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                              Payment Methods Breakdown
                            </h4>
                          </div>
                          <div className="text-[11px] font-mono font-bold text-zinc-200">
                            Total: ₹{parseFloat(activeSession.total_sales_amount).toFixed(2)}
                          </div>
                        </div>

                        <div className="space-y-2">
                          {Object.entries(activeSession.sales_by_payment_method).length > 0 ? (
                            Object.entries(activeSession.sales_by_payment_method).map(
                              ([method, amt]) => (
                                <div
                                  key={method}
                                  className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-white/[0.04] text-xs"
                                >
                                  <span className="capitalize font-medium text-zinc-300">
                                    {method}
                                  </span>
                                  <span className="font-mono font-bold text-zinc-100">
                                    ₹{parseFloat(amt).toFixed(2)}
                                  </span>
                                </div>
                              )
                            )
                          ) : (
                            <p className="text-[11px] text-zinc-500 text-center py-4">
                              No sales transactions recorded in this session yet.
                            </p>
                          )}
                        </div>

                        {/* Action buttons footer */}
                        <div className="pt-2 flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveTab("x-report")}
                            className="flex-1 h-9 border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.08] text-xs gap-1.5"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            View X Report
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => setActiveTab("close-drawer")}
                            className="flex-1 h-9 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold gap-1.5"
                          >
                            <Lock className="h-3.5 w-3.5" />
                            Close Cash Drawer
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ==============================================================
                  TAB 2: X REPORT (MID-DAY LIVE AUDIT)
              ============================================================== */}
              <TabsContent value="x-report" className="space-y-6 m-0">
                {activeSession && (
                  <div className="space-y-6">
                    <div className="bg-surface-elevated p-6 rounded-2xl border border-white/[0.08] space-y-6">
                      <div className="flex items-start justify-between pb-4 border-b border-white/[0.08]">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold text-white">X Report — Mid-Day Readout</h3>
                            {loadingXReport && <RefreshCw className="h-3.5 w-3.5 animate-spin text-zinc-400" />}
                            <Badge variant="outline" className="text-zinc-400 border-zinc-700 text-[10px]">
                              Informational Only
                            </Badge>
                          </div>
                          <p className="text-xs text-zinc-400 mt-1">
                            Real-time drawer snapshot. Does NOT close or alter the active session.
                          </p>
                        </div>

                        {xReportData && (
                          <Button
                            size="sm"
                            onClick={() => handlePrint("X", xReportData)}
                            className="h-8 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold gap-1.5"
                          >
                            <Printer className="h-3.5 w-3.5" />
                            Print X Report
                          </Button>
                        )}
                      </div>

                      {/* Cashier & Timing Metadata */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <div className="text-zinc-500">Cashier</div>
                          <div className="font-semibold text-zinc-200 mt-0.5">{activeSession.cashier_email}</div>
                        </div>
                        <div>
                          <div className="text-zinc-500">Session Opened</div>
                          <div className="font-mono text-zinc-200 mt-0.5">
                            {new Date(activeSession.opened_at).toLocaleTimeString()}
                          </div>
                        </div>
                        <div>
                          <div className="text-zinc-500">Transactions</div>
                          <div className="font-mono text-zinc-200 mt-0.5">{activeSession.transaction_count}</div>
                        </div>
                        <div>
                          <div className="text-zinc-500">Expected Cash</div>
                          <div className="font-mono font-bold text-primary mt-0.5">
                            ₹{parseFloat(activeSession.expected_cash).toFixed(2)}
                          </div>
                        </div>
                      </div>

                      {/* Optional Mid-day counted cash check */}
                      <div className="p-4 rounded-xl bg-black/40 border border-white/[0.06] space-y-3">
                        <label className="text-xs font-semibold text-zinc-300 block">
                          Check Live Variance (Count drawer now without closing):
                        </label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <span className="absolute left-3 top-2.5 text-zinc-400 text-sm font-mono">₹</span>
                            <Input
                              type="number"
                              step="0.01"
                              value={xCountedCash}
                              onChange={(e) => {
                                setXCountedCash(e.target.value)
                                fetchXReport(e.target.value)
                              }}
                              placeholder="Enter counted cash in register..."
                              className="pl-8 bg-surface-elevated border-white/[0.12] text-xs font-mono h-10"
                            />
                          </div>
                        </div>

                        {xCountedCash && xReportData?.variance !== undefined && (
                          <div
                            className={`p-3 rounded-lg border text-xs font-mono flex items-center justify-between ${
                              parseFloat(xReportData.variance || "0") >= 0
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                                : "bg-rose-500/10 border-rose-500/20 text-rose-300"
                            }`}
                          >
                            <span>
                              Variance:{" "}
                              {parseFloat(xReportData.variance || "0") > 0
                                ? "OVER (+₹" + xReportData.variance + ")"
                                : parseFloat(xReportData.variance || "0") < 0
                                ? "SHORT (-₹" + Math.abs(parseFloat(xReportData.variance || "0")).toFixed(2) + ")"
                                : "EXACT MATCH (₹0.00)"}
                            </span>
                            <span className="text-[11px] text-zinc-400">
                              (Expected: ₹{xReportData.expected_cash})
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ==============================================================
                  TAB 3: CLOSE CASH DRAWER (END OF SHIFT)
              ============================================================== */}
              <TabsContent value="close-drawer" className="space-y-6 m-0">
                {activeSession && (
                  <form onSubmit={handleCloseDrawer} className="space-y-6">
                    <div className="bg-surface-elevated p-6 rounded-2xl border border-white/[0.08] space-y-6">
                      <div className="pb-4 border-b border-white/[0.08]">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                          <Lock className="h-5 w-5 text-primary" />
                          Close Cash Drawer & Generate Z Report
                        </h3>
                        <p className="text-xs text-zinc-400 mt-1">
                          Reconcile your physical drawer against system totals. A permanent immutable Z Report will be generated.
                        </p>
                      </div>

                      {/* Denomination Counter Grid */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                            <Coins className="h-4 w-4 text-primary" />
                            Denomination Counter (Optional Fast-Count)
                          </label>
                          <span className="text-[11px] text-zinc-500">Auto-sums into actual cash</span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          {DENOMINATIONS.map((d) => (
                            <div
                              key={d.key}
                              className="flex items-center justify-between bg-black/40 border border-white/[0.06] p-2 rounded-lg"
                            >
                              <span className="text-xs font-mono font-medium text-zinc-300">
                                {d.label}
                              </span>
                              <Input
                                type="number"
                                min="0"
                                value={denominations[d.key] || ""}
                                onChange={(e) => handleDenominationChange(d.key, e.target.value)}
                                placeholder="0"
                                className="w-16 h-8 text-right bg-surface-elevated border-white/[0.12] text-xs font-mono"
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Actual Counted Cash Input */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-zinc-300">
                            Actual Counted Cash (₹) <span className="text-red-400">*</span>
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 text-zinc-400 text-sm font-mono">₹</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={closingCash}
                              onChange={(e) => setClosingCash(e.target.value)}
                              placeholder="0.00"
                              className="pl-8 bg-black/40 border-white/[0.12] text-white font-mono text-lg font-bold h-11"
                              required
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-zinc-300">
                            Closing Notes / Variance Reason
                          </label>
                          <Input
                            type="text"
                            value={closingNotes}
                            onChange={(e) => setClosingNotes(e.target.value)}
                            placeholder="Reason for discrepancy or shift sign-off"
                            className="bg-black/40 border-white/[0.12] text-white text-xs h-11"
                          />
                        </div>
                      </div>

                      {/* Live Variance Calculation Display */}
                      {closingCash && liveVariance !== null && (
                        <div
                          className={`p-4 rounded-xl border flex items-center justify-between font-mono text-sm ${
                            parseFloat(liveVariance) === 0
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                              : parseFloat(liveVariance) > 0
                              ? "bg-blue-500/10 border-blue-500/30 text-blue-300"
                              : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="text-xs font-sans text-zinc-400">Reconciliation Variance</div>
                            <div className="font-bold text-base">
                              {parseFloat(liveVariance) === 0
                                ? "DRAWER BALANCED (₹0.00)"
                                : parseFloat(liveVariance) > 0
                                ? `OVER BY +₹${liveVariance}`
                                : `SHORT BY -₹${Math.abs(parseFloat(liveVariance)).toFixed(2)}`}
                            </div>
                          </div>
                          <div className="text-right text-xs">
                            <div className="text-zinc-400">Expected: ₹{activeSession.expected_cash}</div>
                            <div className="text-zinc-400">Counted: ₹{parseFloat(closingCash).toFixed(2)}</div>
                          </div>
                        </div>
                      )}

                      <Button
                        type="submit"
                        disabled={submittingClose || !closingCash}
                        className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm gap-2"
                      >
                        <FileCheck className="h-4 w-4" />
                        {submittingClose ? "Reconciling & Closing..." : "Confirm & Close Cash Drawer"}
                      </Button>
                    </div>
                  </form>
                )}
              </TabsContent>

              {/* ==============================================================
                  TAB 3B: Z REPORT VIEW (PERMANENT CLOSING AUDIT)
              ============================================================== */}
              <TabsContent value="z-report" className="space-y-6 m-0">
                {zReportData && (
                  <div className="bg-surface-elevated p-6 rounded-2xl border border-white/[0.08] space-y-6">
                    <div className="flex items-start justify-between pb-4 border-b border-white/[0.08]">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold text-white">Z Report — Final Closure</h3>
                          <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs">
                            Immutable Record
                          </Badge>
                        </div>
                        <p className="text-xs text-zinc-400 mt-1">
                          Session {zReportData.session_id.slice(0, 8)} closed on{" "}
                          {new Date(zReportData.closed_at).toLocaleString()}
                        </p>
                      </div>

                      <Button
                        size="sm"
                        onClick={() => handlePrint("Z", zReportData)}
                        className="h-8 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold gap-1.5"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        Print Z Report
                      </Button>
                    </div>

                    {/* Financial Summary Table */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 bg-black/40 rounded-xl border border-white/[0.04]">
                        <div className="text-zinc-500">Opening Cash</div>
                        <div className="font-mono font-bold text-zinc-200 mt-1">
                          ₹{parseFloat(zReportData.opening_cash).toFixed(2)}
                        </div>
                      </div>
                      <div className="p-3 bg-black/40 rounded-xl border border-white/[0.04]">
                        <div className="text-zinc-500">Cash Sales ({zReportData.cash_sales_count})</div>
                        <div className="font-mono font-bold text-emerald-400 mt-1">
                          +₹{parseFloat(zReportData.cash_sales_amount).toFixed(2)}
                        </div>
                      </div>
                      <div className="p-3 bg-black/40 rounded-xl border border-white/[0.04]">
                        <div className="text-zinc-500">Cash Refunds ({zReportData.cash_refunds_count})</div>
                        <div className="font-mono font-bold text-rose-400 mt-1">
                          -₹{parseFloat(zReportData.cash_refunds_amount).toFixed(2)}
                        </div>
                      </div>
                      <div className="p-3 bg-black/40 rounded-xl border border-white/[0.04]">
                        <div className="text-zinc-500">Net Movements</div>
                        <div className="font-mono font-bold text-zinc-200 mt-1">
                          ₹{(parseFloat(zReportData.cash_in_amount) - parseFloat(zReportData.cash_out_amount)).toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {/* Final Reconciliation Box */}
                    <div className="p-4 rounded-xl bg-black/60 border border-white/[0.08] space-y-3 font-mono text-xs">
                      <div className="flex justify-between text-zinc-300">
                        <span>Expected Cash in Drawer:</span>
                        <span className="font-bold">₹{parseFloat(zReportData.expected_cash).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-zinc-300">
                        <span>Actual Counted Cash:</span>
                        <span className="font-bold">₹{parseFloat(zReportData.actual_cash).toFixed(2)}</span>
                      </div>
                      <div
                        className={`flex justify-between font-bold text-sm pt-2 border-t border-white/[0.08] ${
                          parseFloat(zReportData.variance) >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        <span>Reconciliation Variance:</span>
                        <span>
                          {parseFloat(zReportData.variance) >= 0 ? "+" : ""}₹
                          {parseFloat(zReportData.variance).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {zReportData.closing_notes && (
                      <div className="text-xs text-zinc-400">
                        <span className="font-semibold text-zinc-300">Closing Notes: </span>
                        {zReportData.closing_notes}
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              {/* ==============================================================
                  TAB 4: SESSIONS HISTORY
              ============================================================== */}
              <TabsContent value="history" className="space-y-4 m-0">
                <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
                  <h4 className="text-sm font-bold text-white">Closed Cash Drawer Sessions</h4>
                  <span className="text-xs text-zinc-500">{pastSessions.length} sessions</span>
                </div>

                {loadingHistory ? (
                  <div className="text-center py-8 text-xs text-zinc-500">Loading history...</div>
                ) : pastSessions.length > 0 ? (
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {pastSessions.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-surface-elevated border border-white/[0.06] hover:border-white/[0.12] transition text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-zinc-200">{s.cashier_email}</span>
                            <Badge
                              className={
                                s.status === "open"
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]"
                                  : "bg-zinc-800 text-zinc-400 text-[10px]"
                              }
                            >
                              {s.status.toUpperCase()}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-zinc-400 font-mono">
                            Opened: {new Date(s.opened_at).toLocaleDateString()} {new Date(s.opened_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            {s.closed_at && ` • Closed: ${new Date(s.closed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-right">
                          <div>
                            <div className="font-mono font-bold text-zinc-200">
                              Counted: ₹{s.closing_cash ? parseFloat(s.closing_cash).toFixed(2) : "—"}
                            </div>
                            {s.variance !== null && s.variance !== undefined && (
                              <div
                                className={`text-[10px] font-mono ${
                                  parseFloat(s.variance) >= 0 ? "text-emerald-400" : "text-rose-400"
                                }`}
                              >
                                Var: {parseFloat(s.variance) >= 0 ? "+" : ""}₹{parseFloat(s.variance).toFixed(2)}
                              </div>
                            )}
                          </div>

                          {s.status === "closed" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewHistoricalZReport(s.id)}
                              className="h-8 border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.08] text-xs gap-1"
                            >
                              <FileCheck className="h-3.5 w-3.5" />
                              Z Report
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500 text-center py-8">
                    No closed cash drawer sessions found.
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==============================================================
          THERMAL PRINTABLE PORTAL (X & Z REPORTS)
      ============================================================== */}
      {printReport &&
        createPortal(
          <div
            id="thermal-receipt-portal"
            className="fixed inset-0 bg-white text-black p-4 font-mono text-[12px] leading-tight"
            style={{ width: "80mm", margin: "0 auto" }}
          >
            <div className="text-center font-bold text-sm mb-1 uppercase">
              {storeInfo?.store_name || "RETAIL POS"}
            </div>
            {storeInfo?.gstin && <div className="text-center text-[10px]">GSTIN: {storeInfo.gstin}</div>}
            <div className="text-center text-[11px] font-bold border-t border-b border-black py-1 my-2">
              *** {printReport.type} REPORT ***
            </div>

            <div className="space-y-1 mb-2 text-[10px]">
              <div>Cashier: {printReport.data.cashier_email}</div>
              <div>Session: {printReport.data.session_id.slice(0, 8)}</div>
              <div>Opened: {new Date(printReport.data.opened_at).toLocaleString()}</div>
              <div>
                Reported:{" "}
                {new Date(
                  printReport.type === "X"
                    ? (printReport.data as XReport).report_generated_at
                    : (printReport.data as ZReport).closed_at
                ).toLocaleString()}
              </div>
            </div>

            <div className="border-t border-dashed border-black pt-1 mb-2 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span>Opening Cash:</span>
                <span>₹{parseFloat(printReport.data.opening_cash).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Cash Sales ({printReport.data.cash_sales_count}):</span>
                <span>+₹{parseFloat(printReport.data.cash_sales_amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Cash Refunds ({printReport.data.cash_refunds_count}):</span>
                <span>-₹{parseFloat(printReport.data.cash_refunds_amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Cash In:</span>
                <span>+₹{parseFloat(printReport.data.cash_in_amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Cash Out:</span>
                <span>-₹{parseFloat(printReport.data.cash_out_amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold border-t border-black pt-1">
                <span>Expected Cash:</span>
                <span>₹{parseFloat(printReport.data.expected_cash).toFixed(2)}</span>
              </div>

              {printReport.type === "Z" && (
                <>
                  <div className="flex justify-between font-bold">
                    <span>Actual Cash:</span>
                    <span>₹{parseFloat((printReport.data as ZReport).actual_cash).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold border-t border-dashed border-black pt-1">
                    <span>Variance:</span>
                    <span>
                      {parseFloat((printReport.data as ZReport).variance) >= 0 ? "+" : ""}₹
                      {parseFloat((printReport.data as ZReport).variance).toFixed(2)}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-dashed border-black pt-1 text-[10px]">
              <div>Total Txns: {printReport.data.transaction_count}</div>
              <div>Total Sales: ₹{parseFloat(printReport.data.total_sales_amount).toFixed(2)}</div>
            </div>

            <div className="text-center text-[10px] mt-4 border-t border-black pt-2">
              *** END OF {printReport.type} REPORT ***
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
