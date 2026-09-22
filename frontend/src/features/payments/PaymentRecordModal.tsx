import React, { useEffect, useState } from "react"
import { AlertCircle, CreditCard, QrCode } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Select } from "@/components/ui/select"
import { useAuth } from "@/features/auth/AuthContext"
import { Payment, PaymentCreateRequest, paymentsApi } from "./api"
import { Invoice } from "@/features/invoicing/api"

interface PaymentRecordModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice?: Invoice | null
  remainingBalance?: number
  onSuccess: (payment: Payment) => void
  onOpenUpiQr?: () => void
}

export const PaymentRecordModal: React.FC<PaymentRecordModalProps> = ({
  open,
  onOpenChange,
  invoice,
  remainingBalance = 0,
  onSuccess,
  onOpenUpiQr,
}) => {
  const { user } = useAuth()
  const isAdmin =
    user && "role" in user && (user.role === "Super Admin" || user.role === "Admin")

  const [method, setMethod] = useState<"cash" | "upi" | "card" | "payment_link" | "emi">("cash")
  const [amount, setAmount] = useState("")
  const [referenceId, setReferenceId] = useState("")
  const [notes, setNotes] = useState("")
  const [idempotencyKey, setIdempotencyKey] = useState("")
  const [allowOverpayment, setAllowOverpayment] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      // Generate client-side idempotency key on modal open
      setIdempotencyKey(crypto.randomUUID())
      // Pre-fill amount with remaining balance if positive
      if (remainingBalance > 0) {
        setAmount(remainingBalance.toFixed(2))
      } else {
        setAmount("0.00")
      }
      setReferenceId("")
      setNotes("")
      setAllowOverpayment(false)
    }
  }, [open, remainingBalance])

  const parsedAmount = parseFloat(amount) || 0
  const isOverpayment = parsedAmount > remainingBalance && remainingBalance > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (parsedAmount <= 0) {
      toast.error("Please enter a valid payment amount greater than ₹0.00.")
      return
    }

    if (isOverpayment && !allowOverpayment) {
      toast.error(
        `Payment amount ₹${parsedAmount.toFixed(2)} exceeds remaining balance ₹${remainingBalance.toFixed(2)}. Check 'Allow Overpayment' if intended.`
      )
      return
    }

    if (isOverpayment && allowOverpayment && !isAdmin) {
      toast.error("Overpayment allowance requires Administrator privileges.")
      return
    }

    setIsSubmitting(true)
    try {
      const payload: PaymentCreateRequest = {
        invoice_id: invoice?.id || null,
        customer_id: invoice?.customer_id || null,
        method,
        amount: parsedAmount.toFixed(2),
        idempotency_key: idempotencyKey || crypto.randomUUID(),
        reference_id: referenceId.trim() || null,
        notes: notes.trim() || null,
        allow_overpayment: allowOverpayment,
      }

      const res = await paymentsApi.record(payload)
      toast.success(
        `Payment of ₹${parseFloat(res.amount).toFixed(2)} recorded successfully via ${res.method.toUpperCase()}!`
      )
      onSuccess(res)
      onOpenChange(false)
    } catch {
      // Handled by global api error interceptor
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className="space-y-4 max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-emerald-600">
            <CreditCard className="h-5 w-5" />
            <DialogTitle>Record Payment</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-500">
            Append-only payment entry. Automatically recalculates invoice payment status.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5 pt-1">
          {/* Invoice Context Banner */}
          {invoice && (
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs space-y-1.5 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Invoice:</span>
                <span className="font-semibold text-slate-800">{invoice.invoice_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-sans">Grand Total:</span>
                <span className="text-slate-700">₹{parseFloat(invoice.grand_total).toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1">
                <span className="text-slate-500 font-sans font-medium">Outstanding Balance:</span>
                <span className="font-bold text-emerald-600">₹{remainingBalance.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Payment Method Selector */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">Payment Method</label>
            <Select
              value={method}
              onChange={(e) => setMethod(e.target.value as any)}
              className="text-xs h-9"
            >
              <option value="cash">Cash Receipt</option>
              <option value="upi">UPI / Instant Transfer</option>
              <option value="card">Credit / Debit Card</option>
              <option value="payment_link">Payment Link / Static UPI QR</option>
              <option value="emi">EMI Settlement (Phase 9)</option>
            </Select>
          </div>

          {/* UPI Shortcut Banner if method is UPI or payment_link */}
          {(method === "upi" || method === "payment_link") && onOpenUpiQr && (
            <div className="p-2.5 rounded-lg border border-purple-200 bg-purple-50/60 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-purple-900 font-medium">
                <QrCode className="h-4 w-4 text-purple-600" />
                <span>Show UPI QR Code to Customer</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onOpenUpiQr}
                className="h-7 text-xs bg-white text-purple-700 border-purple-300 hover:bg-purple-100"
              >
                View QR
              </Button>
            </div>
          )}

          {/* Amount Input */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-slate-700">
                Amount to Record (₹) <span className="text-rose-500">*</span>
              </label>
              {remainingBalance > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(remainingBalance.toFixed(2))}
                  className="text-[11px] text-blue-600 hover:underline"
                >
                  Fill full balance
                </button>
              )}
            </div>
            <NumericInput
              value={amount}
              onChange={setAmount}
              precisionType="money"
              prefix="₹"
              className="text-sm font-mono font-semibold"
              placeholder="0.00"
              required
            />
          </div>

          {/* External Reference ID */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">
              Reference / Transaction ID (Optional)
            </label>
            <Input
              value={referenceId}
              onChange={(e) => setReferenceId(e.target.value)}
              placeholder="e.g. UTR number, Card Auth code, Cheque #"
              className="text-xs h-9 font-mono"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">Internal Notes (Optional)</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Received by cashier on shift 1"
              className="text-xs h-9"
            />
          </div>

          {/* Overpayment allowance checkbox if applicable */}
          {isOverpayment && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs space-y-2 text-amber-900">
              <div className="flex items-start gap-1.5 font-semibold text-amber-800">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Notice: Amount exceeds current invoice balance</span>
              </div>
              <p className="text-[11px] text-amber-700">
                Entered amount ₹{parsedAmount.toFixed(2)} is greater than remaining balance ₹
                {remainingBalance.toFixed(2)}.
              </p>
              {isAdmin ? (
                <label className="flex items-center gap-2 font-medium cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={allowOverpayment}
                    onChange={(e) => setAllowOverpayment(e.target.checked)}
                    className="rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                  />
                  <span>Allow Overpayment (Administrator override)</span>
                </label>
              ) : (
                <p className="text-[11px] text-rose-600 font-semibold">
                  * Overpayment requires Administrator approval.
                </p>
              )}
            </div>
          )}

          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || (isOverpayment && !allowOverpayment)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            >
              {isSubmitting ? "Recording..." : `Confirm Payment (₹${parsedAmount.toFixed(2)})`}
            </Button>
          </DialogFooter>
        </form>
      </div>
    </Dialog>
  )
}
