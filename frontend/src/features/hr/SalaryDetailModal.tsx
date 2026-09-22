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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <FileText className="w-5 h-5 text-indigo-600" />
              Salary Record Breakdown
            </DialogTitle>
            <Badge
              variant={isPaid ? "default" : "secondary"}
              className={`px-2.5 py-1 text-xs font-semibold uppercase tracking-wider flex items-center gap-1 ${
                isPaid
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800"
              }`}
            >
              {isPaid ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
              {record.status}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Employee & Period Banner */}
          <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-xs text-slate-500 uppercase tracking-wider">Employee</span>
              <div className="font-bold text-slate-900 dark:text-slate-100 text-base">
                {record.staff_name || record.staff_email}
              </div>
              <div className="text-xs text-slate-500">{record.staff_email}</div>
              {record.employee_code && (
                <div className="text-xs font-mono text-indigo-600 dark:text-indigo-400 mt-0.5">
                  Code: {record.employee_code}
                </div>
              )}
            </div>

            <div>
              <span className="text-xs text-slate-500 uppercase tracking-wider">Payroll Period</span>
              <div className="font-bold text-slate-900 dark:text-slate-100 text-base font-mono">
                {record.period}
              </div>
              <div className="text-xs text-slate-500">
                Generated: {new Date(record.generated_at).toLocaleString("en-IN")}
              </div>
              {record.notes && (
                <div className="text-xs text-amber-600 dark:text-amber-400 mt-1 italic">
                  Note: {record.notes}
                </div>
              )}
            </div>
          </div>

          {/* Financial Breakdown */}
          <div className="space-y-3">
            <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-indigo-600" />
              Snapshotted Earnings & Deductions
            </h4>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="p-3 bg-white dark:bg-slate-900 flex justify-between items-center border-b border-slate-100 dark:border-slate-800">
                <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                  Base Salary (Snapshotted):
                </span>
                <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono">
                  ₹{parseFloat(record.base_salary).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* Deductions breakdown table */}
              <div className="p-3 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 space-y-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Itemized Deductions:
                </span>
                {record.deductions.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No deductions applied for this run.</p>
                ) : (
                  <div className="space-y-1.5 pt-1">
                    {record.deductions.map((d, i) => (
                      <div key={i} className="flex justify-between items-center text-xs sm:text-sm">
                        <span className="text-slate-600 dark:text-slate-400 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                          <span>{d.name}</span>
                          <span className="text-slate-400 text-xs">
                            ({d.type === "percentage" ? `${d.value}%` : `₹${d.value}`})
                          </span>
                        </span>
                        <span className="font-mono text-rose-600 dark:text-rose-400">
                          -₹{parseFloat(d.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center font-medium text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                      <span>Total Deductions:</span>
                      <span className="font-mono text-rose-600 dark:text-rose-400 font-semibold">
                        -₹{parseFloat(record.total_deductions).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Net Payout Total Row */}
              <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/40 flex justify-between items-center">
                <div>
                  <span className="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base">
                    Net Take-Home Salary:
                  </span>
                  <p className="text-xs text-slate-500">Immutable final amount payable</p>
                </div>
                <span className="text-xl sm:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                  ₹{parseFloat(record.net_salary).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Audit & Settlement Records (if Paid) */}
          {isPaid && (
            <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2 text-xs">
              <h5 className="font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-indigo-500" /> Linked Settlement Audit
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600 dark:text-slate-400 pt-1">
                <div>
                  <span className="text-slate-400">Paid At: </span>
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {record.paid_at ? new Date(record.paid_at).toLocaleString("en-IN") : "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Payment Ledger ID: </span>
                  <span className="font-mono text-indigo-600 dark:text-indigo-400">
                    {record.payment_id ? record.payment_id.slice(0, 8) + "..." : "None"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Finance Expense ID: </span>
                  <span className="font-mono text-indigo-600 dark:text-indigo-400">
                    {record.expense_id ? record.expense_id.slice(0, 8) + "..." : "None"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {!isPaid && canPay && (
            <Button
              type="button"
              onClick={() => {
                onOpenChange(false)
                onPayClick(record)
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
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
