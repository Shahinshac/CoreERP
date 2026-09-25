import React from "react"
import { DollarSign, FileText, CheckCircle2, Clock, Receipt } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SalaryRecord } from "./types"

interface SalaryDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  record: SalaryRecord | null
  onPayClick: (record: SalaryRecord) => void
  canPay: boolean
}

export const SalaryDetailModal: React.FC<SalaryDetailModalProps> = ({
  open,
  onOpenChange,
  record,
  onPayClick,
  canPay,
}) => {
  if (!record) return null

  const isPaid = record.status === "paid"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border-white/[0.14] bg-[#0C0C0E]">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-zinc-100">
              <FileText className="w-5 h-5 text-primary" />
              Salary Record Breakdown
            </DialogTitle>
            <Badge
              variant={isPaid ? "default" : "secondary"}
              className={`px-2.5 py-1 text-xs font-semibold uppercase tracking-wider flex items-center gap-1 ${
                isPaid
                  ? "bg-emerald-950/40 text-emerald-400 border border-emerald-500/30"
                  : "bg-amber-950/40 text-amber-400 border border-amber-500/30"
              }`}
            >
              {isPaid ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
              {record.status}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Employee & Period Banner */}
          <div className="p-4 bg-[#0A0A0C] border border-white/[0.14] rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-xs text-zinc-400 uppercase tracking-wider">Employee</span>
              <div className="font-bold text-zinc-100 text-base">
                {record.staff_name || record.staff_email}
              </div>
              <div className="text-xs text-zinc-400">{record.staff_email}</div>
              {record.employee_code && (
                <div className="text-xs font-mono text-primary mt-0.5">
                  Code: {record.employee_code}
                </div>
              )}
            </div>

            <div>
              <span className="text-xs text-zinc-400 uppercase tracking-wider">Payroll Period</span>
              <div className="font-bold text-zinc-100 text-base font-mono">
                {record.period}
              </div>
              <div className="text-xs text-zinc-400">
                Generated: {new Date(record.generated_at).toLocaleString("en-IN")}
              </div>
              {record.notes && (
                <div className="text-xs text-amber-400 mt-1 italic">
                  Note: {record.notes}
                </div>
              )}
            </div>
          </div>

          {/* Financial Breakdown */}
          <div className="space-y-3">
            <h4 className="font-semibold text-sm text-zinc-100 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-primary" />
              Snapshotted Earnings & Deductions
            </h4>

            <div className="border border-white/[0.14] rounded-xl overflow-hidden">
              <div className="p-3 bg-white/[0.02] flex justify-between items-center border-b border-white/[0.08]">
                <span className="text-sm text-zinc-300 font-medium">
                  Base Salary (Snapshotted):
                </span>
                <span className="font-semibold text-zinc-100 font-mono">
                  ₹{parseFloat(record.base_salary).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* Deductions breakdown table */}
              <div className="p-3 bg-black/40 border-b border-white/[0.08] space-y-2">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Itemized Deductions:
                </span>
                {record.deductions.length === 0 ? (
                  <p className="text-xs text-zinc-500 italic">No deductions applied for this run.</p>
                ) : (
                  <div className="space-y-1.5 pt-1">
                    {record.deductions.map((d, i) => (
                      <div key={i} className="flex justify-between items-center text-xs sm:text-sm">
                        <span className="text-zinc-300 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                          <span>{d.name}</span>
                          <span className="text-zinc-500 text-xs">
                            ({d.type === "percentage" ? `${d.value}%` : `₹${d.value}`})
                          </span>
                        </span>
                        <span className="font-mono text-rose-400">
                          -₹{parseFloat(d.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-white/[0.08] flex justify-between items-center font-medium text-xs sm:text-sm text-zinc-200">
                      <span>Total Deductions:</span>
                      <span className="font-mono text-rose-400 font-semibold">
                        -₹{parseFloat(record.total_deductions).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Net Payout Total Row */}
              <div className="p-4 bg-emerald-950/30 border-t border-emerald-500/20 flex justify-between items-center">
                <div>
                  <span className="font-bold text-zinc-100 text-sm sm:text-base">
                    Net Take-Home Salary:
                  </span>
                  <p className="text-xs text-zinc-400">Immutable final amount payable</p>
                </div>
                <span className="text-xl sm:text-2xl font-extrabold text-emerald-400 font-mono">
                  ₹{parseFloat(record.net_salary).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Audit & Settlement Records (if Paid) */}
          {isPaid && (
            <div className="p-4 bg-[#0A0A0C] border border-white/[0.14] rounded-xl space-y-2 text-xs">
              <h5 className="font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-primary" /> Linked Settlement Audit
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-zinc-400 pt-1">
                <div>
                  <span className="text-zinc-500">Paid At: </span>
                  <span className="font-medium text-zinc-200">
                    {record.paid_at ? new Date(record.paid_at).toLocaleString("en-IN") : "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500">Payment Ledger ID: </span>
                  <span className="font-mono text-primary">
                    {record.payment_id ? record.payment_id.slice(0, 8) + "..." : "None"}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500">Finance Expense ID: </span>
                  <span className="font-mono text-primary">
                    {record.expense_id ? record.expense_id.slice(0, 8) + "..." : "None"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2 border-t border-white/[0.08]">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="border-white/[0.16] text-zinc-300 hover:bg-[#18181C]">
            Close
          </Button>
          {!isPaid && canPay && (
            <Button
              type="button"
              onClick={() => {
                onOpenChange(false)
                onPayClick(record)
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              Mark as Paid
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
