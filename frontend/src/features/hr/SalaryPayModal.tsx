import React, { useState } from "react"
import { toast } from "sonner"
import { CheckCircle, DollarSign, Building, Wallet, QrCode } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { hrApi } from "./api"
import { SalaryRecord } from "./types"

interface SalaryPayModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  record: SalaryRecord | null
  onSuccess: () => void
}

export const SalaryPayModal: React.FC<SalaryPayModalProps> = ({
  open,
  onOpenChange,
  record,
  onSuccess,
}) => {
  const [method, setMethod] = useState<"bank_transfer" | "cash" | "upi">("bank_transfer")
  const [referenceId, setReferenceId] = useState("")
  const [notes, setNotes] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!record) return null

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      await hrApi.paySalaryRecord(record.id, {
        method,
        reference_id: referenceId.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      toast.success(`Salary of ₹${parseFloat(record.net_salary).toLocaleString("en-IN")} marked as paid!`)
      onOpenChange(false)
      onSuccess()
    } catch (err: unknown) {
      // Handled by toast in apiClient
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            Disburse Salary Payout
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handlePay} className="space-y-4 pt-2">
          {/* Payout Summary Box */}
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600 dark:text-slate-400">Staff Member:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {record.staff_name || record.staff_email}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600 dark:text-slate-400">Period:</span>
              <span className="font-medium text-slate-900 dark:text-slate-100 font-mono">
                {record.period}
              </span>
            </div>
            <div className="border-t border-emerald-200 dark:border-emerald-800/80 pt-2 flex justify-between items-center">
              <span className="text-sm font-semibold text-emerald-900 dark:text-emerald-300">
                Net Payout Amount:
              </span>
              <span className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                ₹{parseFloat(record.net_salary).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div className="space-y-2">
            <Label>Payout Method</Label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMethod("bank_transfer")}
                className={`p-3 rounded-lg border text-center flex flex-col items-center gap-1 transition-all ${
                  method === "bank_transfer"
                    ? "border-emerald-600 bg-emerald-50/70 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200 font-medium"
                    : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                }`}
              >
                <Building className="w-5 h-5" />
                <span className="text-xs">Bank (NEFT/RTGS)</span>
              </button>

              <button
                type="button"
                onClick={() => setMethod("upi")}
                className={`p-3 rounded-lg border text-center flex flex-col items-center gap-1 transition-all ${
                  method === "upi"
                    ? "border-emerald-600 bg-emerald-50/70 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200 font-medium"
                    : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                }`}
              >
                <QrCode className="w-5 h-5" />
                <span className="text-xs">UPI</span>
              </button>

              <button
                type="button"
                onClick={() => setMethod("cash")}
                className={`p-3 rounded-lg border text-center flex flex-col items-center gap-1 transition-all ${
                  method === "cash"
                    ? "border-emerald-600 bg-emerald-50/70 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200 font-medium"
                    : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                }`}
              >
                <Wallet className="w-5 h-5" />
                <span className="text-xs">Cash</span>
              </button>
            </div>
          </div>

          {/* Reference ID / UTR */}
          <div className="space-y-1.5">
            <Label htmlFor="refId">Transaction Reference / UTR Number</Label>
            <Input
              id="refId"
              value={referenceId}
              onChange={(e) => setReferenceId(e.target.value)}
              placeholder="e.g. UTR-20260930-981240"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="payNotes">Internal Ledger Notes</Label>
            <Input
              id="payNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Cleared via primary company payroll account"
            />
          </div>

          <div className="text-xs text-slate-500 italic">
            Note: Marking this record as paid will atomically create an append-only Payment ledger transaction and a Finance Expense entry.
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            >
              <CheckCircle className="w-4 h-4" />
              {isSubmitting ? "Disbursing..." : "Confirm Payout"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
