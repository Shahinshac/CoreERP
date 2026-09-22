import React, { useEffect, useState } from "react"
import { AlertCircle, CreditCard } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Select } from "@/components/ui/select"
import { useAuth } from "@/features/auth/AuthContext"
import { EmiInstallment, EmiPlanDetail, emiApi } from "./api"

interface EmiPaymentModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  plan: EmiPlanDetail | null
  targetInstallment?: EmiInstallment | null
  onSuccess: (updatedPlan: EmiPlanDetail) => void
}

export const EmiPaymentModal: React.FC<EmiPaymentModalProps> = ({
  open,
  onOpenChange,
  plan,
  targetInstallment,
  onSuccess,
}) => {
  const { user } = useAuth()
  const isAdmin = user && "role" in user && (user.role === "Super Admin" || user.role === "Admin")

  const [method, setMethod] = useState("upi")
  const [amount, setAmount] = useState("")
  const [referenceId, setReferenceId] = useState("")
  const [notes, setNotes] = useState("")
  const [idempotencyKey, setIdempotencyKey] = useState("")
  const [allowOverpayment, setAllowOverpayment] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (open && plan) {
      setIdempotencyKey(crypto.randomUUID())
      setReferenceId("")
      setNotes("")
      setAllowOverpayment(false)

      if (targetInstallment) {
        const remainingInst = Math.max(0, parseFloat(targetInstallment.remaining_amount))
        setAmount(remainingInst.toFixed(2))
      } else {
        const remainingPlan = Math.max(0, parseFloat(plan.remaining_balance))
        setAmount(remainingPlan.toFixed(2))
      }
    }
  }, [open, plan, targetInstallment])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!plan) return

    const amt = parseFloat(amount) || 0
    if (amt <= 0) {
      toast.error("Payment amount must be greater than zero.")
      return
    }

    const remainingPlan = parseFloat(plan.remaining_balance)
    if (amt > remainingPlan && !allowOverpayment) {
      toast.error(
        `Payment of ₹${amt.toFixed(2)} exceeds remaining plan balance of ₹${remainingPlan.toFixed(2)}.`
      )
      return
    }

    setIsSubmitting(true)
    try {
      const payload = {
        amount: amt.toFixed(2),
        method,
        idempotency_key: idempotencyKey,
        reference_id: referenceId.trim() || undefined,
        notes: notes.trim() || undefined,
        allow_overpayment: allowOverpayment,
      }

      let updatedPlan: EmiPlanDetail
      if (targetInstallment) {
        updatedPlan = await emiApi.payInstallment(plan.id, targetInstallment.installment_number, payload)
      } else {
        updatedPlan = await emiApi.pay(plan.id, payload)
      }

      toast.success("EMI payment recorded successfully!")
      onSuccess(updatedPlan)
      onOpenChange(false)
    } catch (err: any) {
      toast.error(err.message || "Failed to record payment.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!plan) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900">
                {targetInstallment
                  ? `Pay Installment #${targetInstallment.installment_number}`
                  : "Record EMI Settlement"}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                {plan.customer_name ? `Customer: ${plan.customer_name}` : `Plan: ${plan.id.slice(0, 8)}...`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Balance Overview Card */}
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono space-y-1">
          {targetInstallment && (
            <div className="flex justify-between text-slate-600">
              <span className="font-sans">Installment Due:</span>
              <span className="font-bold text-slate-900">
                ₹{parseFloat(targetInstallment.remaining_amount).toFixed(2)}
              </span>
            </div>
          )}
          <div className="flex justify-between text-slate-600">
            <span className="font-sans">Total Outstanding Balance:</span>
            <span className="font-bold text-emerald-600">
              ₹{parseFloat(plan.remaining_balance).toFixed(2)}
            </span>
          </div>
        </div>

        <div className="space-y-3 text-xs">
          {/* Method */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Payment Channel *</label>
            <Select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="h-9 text-xs"
            >
              <option value="upi">UPI (Direct / QR)</option>
              <option value="cash">Cash Register</option>
              <option value="card">Debit / Credit Card</option>
              <option value="payment_link">Payment Link</option>
              <option value="emi">EMI Clearing Account</option>
            </Select>
          </div>

          {/* Amount */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="font-semibold text-slate-700">Payment Amount (₹) *</label>
              <span className="text-[10px] text-slate-400 font-sans">
                Surplus cascades to next installments
              </span>
            </div>
            <NumericInput
              value={amount}
              onChange={(val) => setAmount(val)}
              min={0.01}
              className="h-9 font-mono font-bold text-emerald-600"
              required
            />
          </div>

          {/* Reference / Transaction ID */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700">
              External Gateway / UPI Ref ID
            </label>
            <Input
              placeholder="e.g. UPI-RR-12345678"
              value={referenceId}
              onChange={(e) => setReferenceId(e.target.value)}
              className="h-9 text-xs font-mono"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Receipt Notes (Optional)</label>
            <Input
              placeholder="e.g. Advance paid at counter"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-9 text-xs"
            />
          </div>

          {/* Admin Overpayment Toggle (if amount > remaining plan balance) */}
          {parseFloat(amount) > parseFloat(plan.remaining_balance) && (
            <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/70 space-y-2">
              <div className="flex items-start gap-1.5 text-amber-800">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Overpayment Detected</span>
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    Amount exceeds the total remaining balance of ₹
                    {parseFloat(plan.remaining_balance).toFixed(2)}.
                  </p>
                </div>
              </div>

              {isAdmin ? (
                <label className="flex items-center gap-2 pt-1 font-semibold text-amber-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowOverpayment}
                    onChange={(e) => setAllowOverpayment(e.target.checked)}
                    className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span>Authorize overpayment as Administrator</span>
                </label>
              ) : (
                <p className="text-[10px] text-rose-600 font-semibold">
                  Administrator authorization required to accept overpayment.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-9 text-xs"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={isSubmitting}
            className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
          >
            {isSubmitting ? "Recording Receipt..." : "Record Payment Receipt"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
